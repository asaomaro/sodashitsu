import {expect,it,vi} from "vitest";
import {ControlSurface} from "../ControlSurface.js";
import {MemoryLogger} from "../../log/Logger.js";
import {registerSubagentHistory} from "./subagentHistory.js";
const paneId="12345678-1234-4234-8234-123456789012",entryId="12345678-1234-4234-8234-123456789013",selection={paneId,agentId:"child",entryId};
const list={status:"ok" as const,items:[],offset:0,reset:false,more:false,omittedBefore:false,incomplete:true};
const text={status:"unreadable" as const,reason:"generated",entries:[],offset:0,reset:true,omittedBefore:false,running:false,state:"unknown" as const};
it("keeps all three history methods strict and separate from current child routes",async()=>{
 const surface=new ControlSurface(new MemoryLogger()),read=vi.fn(async()=>list),transcript=vi.fn(async()=>text),usageRead=vi.fn(async()=>({status:"unavailable" as const}));registerSubagentHistory(surface,{read,transcript,usageRead});const ctx={clientId:"generated",sink:{} as never};
 expect(await surface.invoke(ctx,"agent.subagent_history",{paneId})).toEqual({ok:true,result:list});
 expect(await surface.invoke(ctx,"agent.subagent_history_transcript",selection)).toEqual({ok:true,result:text});expect(await surface.invoke(ctx,"agent.subagent_history_usage",selection)).toMatchObject({ok:true});
 for(const method of ["agent.subagent_history_transcript","agent.subagent_history_usage"]){expect(await surface.invoke(ctx,method,{paneId,agentId:"child"})).toMatchObject({ok:false});expect(await surface.invoke(ctx,method,{...selection,path:"/outside"})).toMatchObject({ok:false});}
 expect(transcript).toHaveBeenCalledTimes(1);expect(usageRead).toHaveBeenCalledTimes(1);expect(await surface.invoke(ctx,"agent.subagent_transcript",{paneId,agentId:"child"})).toMatchObject({ok:false});
});
it("checks authorization and cancellation before and after asynchronous history work",async()=>{
 const surface=new ControlSurface(new MemoryLogger());let allowed=false,finish!:()=>void;const gate=new Promise<void>(resolve=>finish=resolve),read=vi.fn(async()=>{await gate;return list;});registerSubagentHistory(surface,{read,transcript:async()=>text,usageRead:async()=>({status:"unavailable"})});const ctx={clientId:"generated",sink:{} as never,connectionAuthorized:()=>allowed};
 expect(await surface.invoke(ctx,"agent.subagent_history",{paneId})).toMatchObject({ok:false,error:{code:"unauthorized"}});expect(read).not.toHaveBeenCalled();
 allowed=true;const pending=surface.invoke(ctx,"agent.subagent_history",{paneId});await vi.waitFor(()=>expect(read).toHaveBeenCalledOnce());allowed=false;finish();expect(await pending).toMatchObject({ok:false,error:{code:"unauthorized"}});
 const cancel=new AbortController();cancel.abort();expect(await surface.invoke({...ctx,signal:cancel.signal,connectionAuthorized:()=>true},"agent.subagent_history_transcript",selection)).toMatchObject({ok:false});
});
