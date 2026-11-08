import { createHash, randomUUID } from "node:crypto";
import type { AgentSubagentControlResult, AgentSubagentSendParams, AgentSubagentSendResult } from "@sodashitsu/protocol";
import { resolveVerifiedSubagentTarget, type SubagentTargetSession, type VerifiedSubagentTarget } from "./VerifiedSubagentTarget.js";
import { codexSubagentInput, type CodexSubagentInputState } from "./CodexSubagentControl.js";

interface Context { owner:object; current():boolean; signal?:AbortSignal }
interface Lease { owner:object; target:VerifiedSubagentTarget; state:CodexSubagentInputState; expires:number }
interface Receipt { owner:object; hash:string; result:Promise<AgentSubagentSendResult>; at:number; settled:boolean }
const draft=(reason:"transport-not-connected"|"transport-unavailable"|"target-unavailable"|"target-busy"|"scope-expired"):AgentSubagentControlResult=>({mode:"parent-draft",reason});
export class SubagentControlService {
  private closed=false;
  private readonly controllers=new Set<AbortController>();
  private readonly leases=new Map<string,Lease>();
  private readonly receipts=new Map<string,Receipt>();
  private readonly running=new Set<string>();
  private readonly uncertain=new Map<string,()=>boolean>();
  constructor(private readonly deps:{session:SubagentTargetSession;input?:typeof codexSubagentInput;now?:()=>number}){}
  private now(){return(this.deps.now??Date.now)();}
  async control(paneId:string,agentId:string,ctx:Context):Promise<AgentSubagentControlResult>{
    if(this.closed||!ctx.current()||ctx.signal?.aborted)return draft("scope-expired");
    const target=resolveVerifiedSubagentTarget(this.deps.session,paneId,agentId);
    if(!target)return draft("target-unavailable");
    if(target.kind!=="codex")return draft("transport-not-connected");
    this.prune();
    if(this.uncertain.has(target.key)||this.running.has(target.key)||this.running.size>=2||this.uncertain.size+this.running.size>=128)return draft("target-busy");
    this.running.add(target.key);
    try{
      const expires=this.now()+10_000,controller=new AbortController();this.controllers.add(controller);
      const abort=()=>controller.abort();ctx.signal?.addEventListener("abort",abort,{once:true});
      try{
        const result=await(this.deps.input??codexSubagentInput)({target,signal:controller.signal,current:()=>!this.closed&&ctx.current()&&this.now()<expires});
        if(this.closed||!ctx.current()||ctx.signal?.aborted||!target.current()||this.now()>=expires)return draft("scope-expired");
        if(result.status!=="ready")return draft("transport-unavailable");
        if(this.leases.size>=64)return draft("target-busy");
        const leaseId=randomUUID();this.leases.set(leaseId,{owner:ctx.owner,target,state:result.state,expires});
        return {mode:"direct",reason:"ready",leaseId,expiresAt:expires};
      }catch{return draft("transport-unavailable");}
      finally{ctx.signal?.removeEventListener("abort",abort);this.controllers.delete(controller);}
    }finally{this.running.delete(target.key);}
  }
  async send(params:AgentSubagentSendParams,ctx:Context):Promise<AgentSubagentSendResult>{
    const hash=createHash("sha256").update(JSON.stringify(params)).digest("hex"),prior=this.receipts.get(params.requestId);
    if(this.closed||!ctx.current()||ctx.signal?.aborted)return {status:"rejected",reason:"scope-expired"};
    if(prior)return prior.owner===ctx.owner&&prior.hash===hash?prior.result:{status:"rejected",reason:"request-conflict"};
    this.prune();
    const lease=this.leases.get(params.leaseId);
    if(!ctx.current()||ctx.signal?.aborted||!lease||lease.owner!==ctx.owner||lease.expires<=this.now()||lease.target.paneId!==params.paneId||lease.target.recordId!==params.agentId||!lease.target.current())return {status:"rejected",reason:"scope-expired"};
    if(this.running.has(lease.target.key)||this.uncertain.has(lease.target.key)||this.running.size>=2||this.receipts.size>=128||this.uncertain.size+this.running.size>=128)return {status:"rejected",reason:"target-busy"};
    this.leases.delete(params.leaseId); // Every attempted send consumes its lease, including lost ACK.
    this.running.add(lease.target.key);
    const work=(async():Promise<AgentSubagentSendResult>=>{
      const controller=new AbortController(),abort=()=>controller.abort();this.controllers.add(controller);ctx.signal?.addEventListener("abort",abort,{once:true});
      try{
        const response=await(this.deps.input??codexSubagentInput)({target:lease.target,signal:controller.signal,current:()=>!this.closed&&ctx.current()&&this.now()<lease.expires,send:{state:lease.state,text:params.text,requestId:params.requestId}});
        if(response.status==="accepted"&&!this.closed&&ctx.current()&&!ctx.signal?.aborted&&lease.target.current())return {status:"accepted",reason:"accepted",turnId:response.turnId};
        if(response.status==="accepted"){
          this.uncertain.set(lease.target.key,lease.target.current);
          return {status:"delivery-unknown",reason:"delivery-unknown"};
        }
        if(response.status==="delivery-unknown"){
          this.uncertain.set(lease.target.key,lease.target.current);
          return {status:"delivery-unknown",reason:"delivery-unknown"};
        }
        return {status:"rejected",reason:"transport-unavailable"};
      }catch{
        this.uncertain.set(lease.target.key,lease.target.current);
        return {status:"delivery-unknown",reason:"delivery-unknown"};
      }finally{
        ctx.signal?.removeEventListener("abort",abort);this.controllers.delete(controller);this.running.delete(lease.target.key);
      }
    })();
    const receipt:Receipt={owner:ctx.owner,hash,result:work,at:this.now(),settled:false};
    this.receipts.set(params.requestId,receipt);void work.then(()=>{receipt.settled=true;},()=>{receipt.settled=true;});
    return work;
  }
  private prune(){
    for(const[id,l]of this.leases)if(l.expires<=this.now()||!l.target.current())this.leases.delete(id);
    for(const[key,current]of this.uncertain)if(!current())this.uncertain.delete(key);
    for(const[id,r]of this.receipts)if(r.settled&&this.now()-r.at>30*60_000)this.receipts.delete(id);
    // Expired receipts cannot become a retry: their one-use lease has already been deleted.
  }
  close(){this.closed=true;for(const c of this.controllers)c.abort();this.leases.clear();this.receipts.clear();this.uncertain.clear();}
}
