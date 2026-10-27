import {performance} from "node:perf_hooks";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {DesktopMethods,RpcError} from "@sodashitsu/protocol";
import type {DesktopAgentAccess} from "./DesktopAgentAccess.js";
const methods=["desktop.agent.attach","desktop.agent.observe","desktop.agent.act","desktop.agent.release"] as const;
const Envelope=z.object({id:z.string().regex(/^[1-9][0-9]{0,15}$/),method:z.enum(methods),params:z.unknown()}).strict();
const failure=()=>Error("Private desktop agent request rejected");
/** Provider-private finite RPC owner. Never register on the public RPC surface.
 * Recipient is supplied by the authenticated endpoint, never by a JSON request. */
export class DesktopEndpointAgentRpc {
 private readonly owner=randomUUID();
 private closed=false;
 private releasing=false;
 private readonly unsubscribe:()=>void;
 private attached=false;
 private lastId=0n;
 private count=0;
 private readonly expiresAt=performance.now()+120000;
 private pending:{reject(error:Error):void;timer:ReturnType<typeof setTimeout>;deadline:number}|undefined;
 private readonly lifetime:ReturnType<typeof setTimeout>;
 constructor(private readonly agents:DesktopAgentAccess,private readonly recipient:string,private readonly active:()=>boolean,private readonly options:{scope?:string;onClose?(reason:"released"|"stopped"):void}={}){
  this.options={...options};if(options.scope!==undefined&&!/^[A-Za-z0-9_-]{43}$/.test(options.scope))throw failure();
  if(!/^[a-f0-9]{64}$/.test(recipient))throw failure();this.ensure();
  this.lifetime=setTimeout(()=>this.close(),120000);this.lifetime.unref();
  this.unsubscribe=agents.onOwnerRevoked(this.owner,()=>{if(!this.releasing)this.close();});
 }
 private ensure():void{let active=false;try{active=this.active()===true;}catch{}if(this.closed||!active||performance.now()>=this.expiresAt||this.pending&&performance.now()>=this.pending.deadline)throw failure();}
 private isActive():boolean{try{this.ensure();return true;}catch{return false;}}
 close(reason:"released"|"stopped"="stopped"):void{
  if(this.closed)return;this.closed=true;clearTimeout(this.lifetime);this.unsubscribe();
  const pending=this.pending;this.pending=undefined;if(pending){clearTimeout(pending.timer);pending.reject(failure());}
  try{this.agents.clientGone(this.owner);}catch{/* Authority and pending result are already cancelled. */}
  try{this.options.onClose?.(reason);}catch{/* All authority was already cancelled. */}
 }
 request(raw:string):Promise<string>{
  try{
   this.ensure();if(this.pending||++this.count>1000||Buffer.byteLength(raw)>65536)throw failure();
   const message=Envelope.parse(JSON.parse(raw)),id=BigInt(message.id);if(id<=this.lastId)throw failure();this.lastId=id;
   const params=DesktopMethods[message.method].parse(message.params);
   if((message.method==="desktop.agent.attach")===this.attached)throw failure();
   return new Promise<string>((resolve,reject)=>{
    const timer=setTimeout(()=>this.close(),message.method==="desktop.agent.act"?60000:10000);timer.unref();
    const pending={reject,timer,deadline:performance.now()+(message.method==="desktop.agent.act"?60000:10000)};this.pending=pending;
    void (async()=>{
     try{
      this.ensure();let result:unknown;
      if(message.method==="desktop.agent.attach"){
       const p=DesktopMethods["desktop.agent.attach"].parse(params);result=this.agents.attachRecipient(this.owner,p.ticket,this.recipient,()=>this.isActive(),this.options.scope);this.attached=true;
      }else if(message.method==="desktop.agent.observe"){
       const p=DesktopMethods["desktop.agent.observe"].parse(params);await this.agents.refresh(this.owner,p.leaseId,p.afterFrameSeq);this.ensure();result=this.agents.observe(this.owner,p.leaseId,p.afterFrameSeq);
      }else if(message.method==="desktop.agent.act"){
       const p=DesktopMethods["desktop.agent.act"].parse(params);result=await this.agents.act(this.owner,p.leaseId,p.observationId,p.inputs);
      }else{
       const p=DesktopMethods["desktop.agent.release"].parse(params);this.releasing=true;try{result=this.agents.release(this.owner,p.leaseId);}finally{this.releasing=false;}
      }
      this.ensure();if(this.pending!==pending)throw failure();const output=JSON.stringify({id:message.id,result});if(Buffer.byteLength(output)>4*1024*1024)throw failure();
      clearTimeout(timer);this.pending=undefined;if(message.method==="desktop.agent.release")this.close("released");resolve(output);
     }catch(error){
      // Fresh-frame/rate waits are normal observation responses, not a reason
      // to require a new human grant. Never retry an uncertain action here.
      if(message.method==="desktop.agent.observe"&&error instanceof RpcError&&error.code==="server_busy"){
       try{this.ensure();if(this.pending!==pending)throw failure();clearTimeout(timer);this.pending=undefined;resolve(JSON.stringify({id:message.id,error:{code:"server_busy",message:"Fresh desktop observation is not ready"}}));return;}catch{}
      }
      this.close();reject(failure());
     }
     finally{clearTimeout(timer);if(this.pending===pending)this.pending=undefined;}
    })();
   });
  }catch{this.close();return Promise.reject(failure());}
 }
}
