import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { SubagentControlService } from "./SubagentControlService.js";
import { resolveVerifiedSubagentTarget } from "./VerifiedSubagentTarget.js";
function fixture(){
  const parent=randomUUID(),child=randomUUID(),pane={id:randomUUID(),agent:{kind:"codex",instanceId:randomUUID(),subagents:{count:1,items:[{id:child,depth:1,startedAt:1}]}},agentSession:{kind:"codex",sessionId:parent}} as Pane;
  let verified=true,now=0,valid=true,sends=0,unknown=false;
  const session={getPane:(id:string)=>id===pane.id?pane:undefined,hasVerifiedAgentSession:()=>verified};
  const ctx={owner:{},current:()=>valid};
  const service=new SubagentControlService({session,now:()=>now,input:async r=>{
    if(!r.current()||!r.target.current())return {status:"unavailable"};
    if(!r.send)return {status:"ready",state:{daemon:"owned-generation",mode:"start"}};
    sends++;return unknown?{status:"delivery-unknown"}:{status:"accepted",turnId:"generated-turn"};
  }});
  return{pane,child,ctx,service,session,get sends(){return sends;},verified:(v:boolean)=>verified=v,time:(v:number)=>now=v,valid:(v:boolean)=>valid=v,unknown:()=>unknown=true};
}
it("leases and sends one exact current child, acknowledging acceptance without completion",async()=>{
 const f=fixture(),c=await f.service.control(f.pane.id,f.child,f.ctx);expect(c.mode).toBe("direct");if(c.mode!=="direct")throw Error();
 const p={paneId:f.pane.id,agentId:f.child,leaseId:c.leaseId,requestId:randomUUID(),text:"generated instruction"};
 expect(await f.service.send(p,f.ctx)).toEqual({status:"accepted",reason:"accepted",turnId:"generated-turn"});
 expect(await f.service.send(p,f.ctx)).toMatchObject({status:"accepted"});expect(f.sends).toBe(1);
 expect(await f.service.send({...p,text:"different"},f.ctx)).toMatchObject({reason:"request-conflict"});
 expect(await f.service.send({...p,requestId:randomUUID()},f.ctx)).toMatchObject({reason:"scope-expired"});
});
it.each(["instance","refkind","session","membership","verified","expiry","owner","auth","close"] as const)("invalidates lease on %s before any write",async change=>{
 const f=fixture(),c=await f.service.control(f.pane.id,f.child,f.ctx);if(c.mode!=="direct")throw Error();
 if(change==="instance")f.pane.agent!.instanceId=randomUUID();
 if(change==="refkind")f.pane.agentSession!.kind="claude";
 if(change==="session")f.pane.agentSession!.sessionId=randomUUID();
 if(change==="membership")f.pane.agent!.subagents!.items=[];
 if(change==="verified")f.verified(false);
 if(change==="expiry")f.time(10_000);
 if(change==="auth")f.valid(false);
 if(change==="close")f.service.close();
 const ctx=change==="owner"?{...f.ctx,owner:{}}:f.ctx;
 expect(await f.service.send({paneId:f.pane.id,agentId:f.child,leaseId:c.leaseId,requestId:randomUUID(),text:"generated"},ctx)).toMatchObject({status:"rejected"});expect(f.sends).toBe(0);
});
it("never substitutes the parent, an absent child or an unrelated product's CLI resume",async()=>{
 const f=fixture();expect(resolveVerifiedSubagentTarget(f.session,f.pane.id,f.pane.agentSession!.sessionId)).toBeUndefined();
 expect(await f.service.control(f.pane.id,randomUUID(),f.ctx)).toMatchObject({mode:"parent-draft",reason:"target-unavailable"});
 f.pane.agent!.kind="claude";f.pane.agentSession!.kind="claude";
 expect(await f.service.control(f.pane.id,f.child,f.ctx)).toMatchObject({mode:"parent-draft",reason:"transport-not-connected"});
});
it("lost acknowledgement blocks another lease and is replayed without a second mutation",async()=>{
 const f=fixture(),c=await f.service.control(f.pane.id,f.child,f.ctx);if(c.mode!=="direct")throw Error();f.unknown();
 const p={paneId:f.pane.id,agentId:f.child,leaseId:c.leaseId,requestId:randomUUID(),text:"generated"};
 expect(await f.service.send(p,f.ctx)).toMatchObject({status:"delivery-unknown"});expect(await f.service.send(p,f.ctx)).toMatchObject({status:"delivery-unknown"});
 expect(await f.service.control(f.pane.id,f.child,f.ctx)).toMatchObject({reason:"target-busy"});expect(f.sends).toBe(1);
});
it("does not queue a double click or accept a late acknowledgement after parent scope loss",async()=>{
 const f=fixture();let finish!:(v:{status:"accepted";turnId:string})=>void,count=0;
 const service=new SubagentControlService({session:f.session,input:async r=>{
  if(!r.send)return {status:"ready",state:{daemon:"generated",mode:"start"}};
  count++;return new Promise(resolve=>{finish=resolve;});
 }});
 const c=await service.control(f.pane.id,f.child,f.ctx);if(c.mode!=="direct")throw Error();
 const p={paneId:f.pane.id,agentId:f.child,leaseId:c.leaseId,requestId:randomUUID(),text:"generated"};
 const first=service.send(p,f.ctx),repeat=service.send(p,f.ctx);
 expect(await service.control(f.pane.id,f.child,f.ctx)).toMatchObject({reason:"target-busy"});
 f.pane.agent!.instanceId=randomUUID();finish({status:"accepted",turnId:"late-turn"});
 expect(await first).toMatchObject({status:"delivery-unknown"});expect(await repeat).toMatchObject({status:"delivery-unknown"});expect(count).toBe(1);service.close();
});
