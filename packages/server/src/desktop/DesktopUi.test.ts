import {expect,it,vi,afterEach} from "vitest";
import {performance} from "node:perf_hooks";
import {DesktopAgentAccess,type AgentTarget} from "./DesktopAgentAccess.js";
import {DesktopUi,type UiRunner} from "./DesktopUi.js";

const nativeTree=()=>({window:{id:"101",name:"Fixture",processId:12},windows:[{id:"101",name:"Fixture",processId:12}],started:"1234",rootRuntime:[1],truncated:false,elements:[{parent:-1,name:"Apply",controlType:"ControlType.Button",automationId:"apply",value:null,enabled:true,offscreen:false,password:false,actions:["invoke"],bounds:{x:1,y:2,width:30,height:20},runtime:[1,2],signature:"a".repeat(64)}]});
function fixture(runner?:UiRunner){
 const access=new DesktopAgentAccess(),target:AgentTarget={frame:()=>undefined,control:()=>{},state:()=>{},input:async()=>{},releaseInputs:()=>{}};
 const lease=access.attach("owner",access.grant(target,undefined,true).ticket);
 const run=vi.fn(runner??(async(request:any)=>request.mode==="observe"?nativeTree():{acted:true}));
 const ui=new DesktopUi(access,(owner,id)=>access.assertActive(owner,id),run);
 return {access,lease:lease.leaseId,run,ui};
}
afterEach(()=>vi.restoreAllMocks());
it("returns opaque source-bound controls and never exposes native proofs or password values",async()=>{
 const tree=nativeTree();tree.elements.push({...tree.elements[0]!,parent:0,password:true,name:"private password",value:"private password" as any,runtime:[1,3]});
 const f=fixture(async()=>tree),result=await f.ui.observe("owner",f.lease);
 expect(result.available).toBe(true);if(!result.available)throw Error("fixture");
 expect(JSON.stringify(result)).not.toContain('"runtime"');expect(JSON.stringify(result)).not.toContain('"signature"');expect(JSON.stringify(result)).not.toContain("private password");
 expect(result.elements[1]).toMatchObject({password:true,actions:[],name:"Password",parentId:result.elements[0]!.id});
});
it("invokes the exact returned element once and sends only stored native identity to the worker",async()=>{
 const f=fixture(),result=await f.ui.observe("owner",f.lease);if(!result.available)throw Error("fixture");
 const input={leaseId:f.lease,observationId:result.observationId,elementId:result.elements[0]!.id,action:"invoke" as const};
 expect(await f.ui.act("owner",input)).toEqual({acted:true});
 expect(f.run.mock.calls[1]![0]).toMatchObject({mode:"act",windowId:"101",processId:12,started:"1234",rootRuntime:[1],runtime:[1,2],signature:"a".repeat(64)});
 await expect(f.ui.act("owner",input)).rejects.toThrow();expect(f.run).toHaveBeenCalledTimes(2);
});
it("refuses another owner, unreturned actions, expired UI observations, and source revocation",async()=>{
 const f=fixture();await expect(f.ui.observe("stranger",f.lease)).rejects.toThrow();expect(f.run).not.toHaveBeenCalled();
 let result=await f.ui.observe("owner",f.lease);if(!result.available)throw Error("fixture");
 await expect(f.ui.act("owner",{leaseId:f.lease,observationId:result.observationId,elementId:result.elements[0]!.id,action:"toggle"})).rejects.toThrow();expect(f.run).toHaveBeenCalledTimes(1);
 result=await f.ui.observe("owner",f.lease);if(!result.available)throw Error("fixture");
 const now=performance.now();vi.spyOn(performance,"now").mockReturnValue(now+60001);
 await expect(f.ui.act("owner",{leaseId:f.lease,observationId:result.observationId,elementId:result.elements[0]!.id,action:"invoke"})).rejects.toThrow();expect(f.run).toHaveBeenCalledTimes(2);
 f.access.clientGone("owner");await expect(f.ui.observe("owner",f.lease)).rejects.toThrow();
});
it("does not retry an uncertain native action and consumes its UI proof",async()=>{
 const f=fixture(async(request:any)=>request.mode==="observe"?nativeTree():{unavailable:true}),result=await f.ui.observe("owner",f.lease);if(!result.available)throw Error("fixture");
 const input={leaseId:f.lease,observationId:result.observationId,elementId:result.elements[0]!.id,action:"invoke" as const};
 await expect(f.ui.act("owner",input)).rejects.toThrow("状態を確認");await expect(f.ui.act("owner",input)).rejects.toThrow();expect(f.run).toHaveBeenCalledTimes(2);
});
it("aborts a pending UI query when the connection owner disappears",async()=>{
 let started!:()=>void;const running=new Promise<void>(r=>{started=r;});
 const f=fixture((_request,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener("abort",()=>reject(Error("aborted")),{once:true});started();}));
 const pending=f.ui.observe("owner",f.lease),rejected=expect(pending).rejects.toThrow();await running;f.access.clientGone("owner");await rejected;
});
