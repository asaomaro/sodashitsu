import {expect,it,vi} from "vitest";
import {ControlSurface} from "../ControlSurface.js";
import {MemoryLogger} from "../../log/Logger.js";
import {registerSubagentUsage} from "./subagentUsage.js";
const result={status:"ok" as const,usage:{source:"rollout" as const,consumptionScope:"self" as const,tokens:{basis:"transcript" as const,total:120}}};
it("returns only the dedicated child projection and rejects extra path inputs",async()=>{
 const surface=new ControlSurface(new MemoryLogger()),read=vi.fn(async()=>result);registerSubagentUsage(surface,{read});
 const ctx={clientId:"generated",sink:{} as never};expect(await surface.invoke(ctx,"agent.subagent_usage",{paneId:"pane",agentId:"child"})).toEqual({ok:true,result});expect(read).toHaveBeenCalledWith("pane","child");
 expect(await surface.invoke(ctx,"agent.subagent_usage",{paneId:"pane",agentId:"child",path:"/outside"})).toMatchObject({ok:false});expect(read).toHaveBeenCalledTimes(1);
});
it("checks connection authorization before and after asynchronous child reads",async()=>{
 const surface=new ControlSurface(new MemoryLogger());let authorized=false,release!:()=>void;const gate=new Promise<void>(r=>release=r),read=vi.fn(async()=>{await gate;return result;});registerSubagentUsage(surface,{read});
 const ctx={clientId:"generated",sink:{} as never,connectionAuthorized:()=>authorized};
 expect(await surface.invoke(ctx,"agent.subagent_usage",{paneId:"pane",agentId:"child"})).toMatchObject({ok:false,error:{code:"unauthorized"}});expect(read).not.toHaveBeenCalled();
 authorized=true;const pending=surface.invoke(ctx,"agent.subagent_usage",{paneId:"pane",agentId:"child"});await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(1));authorized=false;release();expect(await pending).toMatchObject({ok:false,error:{code:"unauthorized"}});
});
it("does not start a child read when the request was cancelled",async()=>{
 const surface=new ControlSurface(new MemoryLogger()),read=vi.fn(async()=>result);registerSubagentUsage(surface,{read});const controller=new AbortController();controller.abort();
 expect(await surface.invoke({clientId:"generated",sink:{} as never,signal:controller.signal},"agent.subagent_usage",{paneId:"pane",agentId:"child"})).toMatchObject({ok:false});expect(read).not.toHaveBeenCalled();
});
