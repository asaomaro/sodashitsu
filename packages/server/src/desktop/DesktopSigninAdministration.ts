import {randomUUID} from "node:crypto";
import {z} from "zod";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import type {DesktopSigninAdminRequest} from "./DesktopSigninAdminRequest.js";
const failure=()=>new Error('Signin administration is unavailable');
const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const peer=z.object({fingerprint,role:z.literal('viewer'),label:z.string().trim().min(1).max(80)}).strict();
const status=z.discriminatedUnion('initialized',[
 z.object({initialized:z.literal(false),required:z.literal(true).optional()}).strict(),
 z.object({initialized:z.literal(true),required:z.boolean(),fingerprint,peers:z.array(peer).max(8).refine(peers=>new Set(peers.map(p=>p.fingerprint)).size===peers.length)}).strict(),
]);
export type DesktopSigninAdminStatus=z.infer<typeof status>;
export type DesktopSigninAdminPermit={active():boolean;expiresAt:number};
export interface DesktopSigninAdminBackend {
 status():Promise<unknown>;
 initialize(permit:DesktopSigninAdminPermit):Promise<void>;
 requireEncryption(permit:DesktopSigninAdminPermit):Promise<void>;
 trust(value:z.infer<typeof peer>,permit:DesktopSigninAdminPermit):Promise<void>;
 revoke(value:string,permit:DesktopSigninAdminPermit):Promise<void>;
 enrollment(bytes:Uint8Array,permit:DesktopSigninAdminPermit):Promise<void>;
 disable(permit:DesktopSigninAdminPermit):Promise<void>;
 close():void;settled():Promise<void>;
}
export interface DesktopSigninAdministrationDependencies {
 backend():DesktopSigninAdminBackend;
 result(bytes:Uint8Array,permit:DesktopSigninAdminPermit):Promise<void>;
 uuid():string;unsafeStop():void;now?():number;
}
/** Only call after the fixed SYSTEM helper has durably claimed a private local
 * request. Backend must independently enforce this permit at persistence time.
 * No normal server/RPC, automatic key initialization or network is reachable. */
export async function desktopSigninAdministration(claim:{request:DesktopSigninAdminRequest;cipherSha256:string},scope:{active():boolean;signal:AbortSignal},deps:DesktopSigninAdministrationDependencies):Promise<void>{
 const clock=deps.now??(()=>performance.now()),born=clock(),overallUntil=born+60000;let last=born,stepUntil=overallUntil,budgetEnded=false;
 const {request}=claim,binding=request.binding();fingerprint.parse(claim.cipherSha256);let backend:DesktopSigninAdminBackend|undefined;
 const owned=()=>!scope.signal.aborted&&scope.active();
 const budgetActive=()=>{try{const at=clock();if(budgetEnded||!Number.isFinite(born)||born<0||!Number.isFinite(at)||at<last||at>=overallUntil||at>=stepUntil){budgetEnded=true;return false;}last=at;return true;}catch{budgetEnded=true;return false;}};
 const permit:DesktopSigninAdminPermit={expiresAt:binding.expiresAt,active:()=>budgetActive()&&request.current(owned)};
 let rejectStop!:(error:Error)=>void,ended=false;const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});void stopped.catch(()=>{});const pending=new Set<Promise<unknown>>();
 let backendClosed=false,closeFailed=false;const closeBackend=()=>{if(backend&&!backendClosed){backendClosed=true;try{backend.close();}catch{closeFailed=true;}}};
 const stop=()=>{if(!ended){ended=true;request.close();rejectStop(failure());}closeBackend();};
 const guard=(until=overallUntil)=>{if(ended||!permit.active()||last>=until){stop();throw failure();}};
 // A Windows operation performs several separately bounded native checks.
 // Keep the request lease authoritative and bound the composite work as well.
 const overall=setTimeout(stop,60000);overall.unref();
 const abort=()=>stop();scope.signal.addEventListener('abort',abort,{once:true});const health=setInterval(()=>{if(!permit.active())stop();},100);health.unref();
 const step=async<T>(operation:()=>Promise<T>):Promise<T>=>{guard();const until=stepUntil=last+30000;let timer:ReturnType<typeof setTimeout>|undefined;
  const task=Promise.resolve().then(()=>{guard(until);return operation();});pending.add(task);void task.then(()=>pending.delete(task),()=>pending.delete(task));
  try{const result=await Promise.race([task,stopped,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{stop();reject(failure());},30000);timer.unref();})]);guard(until);return result;}finally{clearTimeout(timer);}
 };
 let resultAttempted=false;const publish=async(value:unknown)=>{guard();if(resultAttempted)throw failure();resultAttempted=true;const bytes=Buffer.from(JSON.stringify(value));try{if(bytes.length>16384)throw failure();await step(()=>deps.result(bytes,permit));}finally{bytes.fill(0);}};
 const header={version:1,purpose:'desktop-signin-admin-result',ownerSid:binding.ownerSid,nonce:binding.nonce,cipherSha256:claim.cipherSha256};
 try{
  const operation=request.take(owned);guard();backend=deps.backend();guard();
  try{
   if(operation.kind==='initialize'){
    await step(()=>backend!.initialize(permit));await step(()=>backend!.requireEncryption(permit));
   }else if(operation.kind==='disable')await step(()=>backend!.disable(permit));
   else if(operation.kind!=='status'){
    const before=status.parse(await step(()=>backend!.status()));if(!before.initialized||operation.kind!=='revoke'&&!before.required)throw failure();
    if(operation.kind==='trust'){if(!before.peers.some(peer=>peer.fingerprint===operation.peer.fingerprint)&&before.peers.length>=8)throw failure();await step(()=>backend!.trust({...operation.peer,role:'viewer'},permit));}
    else if(operation.kind==='revoke')await step(()=>backend!.revoke(operation.fingerprint,permit));
    else{
     if(!operation.peers.every(peer=>before.peers.some(actual=>actual.fingerprint===peer.fingerprint)))throw failure();
     const record={version:1,purpose:'desktop-signin',revision:deps.uuid(),ownerSid:binding.ownerSid,provider:before.fingerprint,allowSignin:true,origin:operation.origin,...(operation.caPem===undefined?{}:{caPem:operation.caPem}),machineId:operation.machineId,token:operation.token,allowInput:operation.allowInput,peers:operation.peers};
     const bytes=Buffer.from(JSON.stringify(record));try{DesktopSigninEnrollment.decode(bytes,binding.ownerSid);await step(()=>backend!.enrollment(bytes,permit));}finally{bytes.fill(0);}
    }
   }
   const publicStatus=status.parse(await step(()=>backend!.status()));await publish({...header,outcome:'success',status:publicStatus});
  }catch{
   // An incomplete operation may have persisted an earlier step. Never claim
   // rollback/no changes, replay, repair keys or resume normal networking.
   if(resultAttempted)throw failure();guard();await publish({...header,outcome:'incomplete'});
  }
 }finally{
  clearTimeout(overall);clearInterval(health);scope.signal.removeEventListener('abort',abort);stop();let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([(async()=>{if(backend)await backend.settled();await Promise.allSettled([...pending]);})(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure()),8000);timer.unref();})]);if(closeFailed)throw failure();}
  catch{try{deps.unsafeStop();}catch{}throw failure();}finally{clearTimeout(timer);}
 }
}
export const desktopSigninAdminUuid=()=>randomUUID();
