import {randomUUID} from "node:crypto";
import {desktopSigninLocalLease} from "./DesktopSigninLocalLease.node.js";
import {readDesktopSigninAdmin} from "./DesktopSigninAdminMailbox.node.js";
import {desktopSigninAdministration} from "./DesktopSigninAdministration.js";
import {desktopSigninAdminBackend} from "./DesktopSigninAdminBackend.node.js";
import {writeDesktopSigninAdminResult} from "./DesktopSigninAdminResult.node.js";
import {desktopSigninCycle} from "./DesktopSigninRuntime.js";
import type {DesktopSigninAdminMailboxResult} from "./DesktopSigninAdminMailbox.node.js";
const failure=()=>new Error("Signin startup is unavailable");
type Lease=Awaited<ReturnType<typeof desktopSigninLocalLease>>;
type Claimed=Extract<DesktopSigninAdminMailboxResult,{kind:'claimed'}>;
export interface DesktopSigninStartupDependencies {
 lease:typeof desktopSigninLocalLease;
 mailbox:typeof readDesktopSigninAdmin;
 administer(claim:Claimed,lease:Lease,scope:{active():boolean;signal:AbortSignal}):Promise<void>;
 cycle:typeof desktopSigninCycle;
 pause(signal:AbortSignal):Promise<void>;
 unsafeStop():void;
}
const defaults:DesktopSigninStartupDependencies={
 lease:desktopSigninLocalLease,mailbox:readDesktopSigninAdmin,cycle:desktopSigninCycle,unsafeStop:()=>process.exit(1),
 administer:(claim,lease,scope)=>desktopSigninAdministration(claim,scope,{
  backend:()=>desktopSigninAdminBackend({context:lease.context,binding:{nonce:claim.request.binding().nonce,cipherSha256:claim.cipherSha256},current:scope.active,signal:scope.signal}),
  result:(bytes,permit)=>writeDesktopSigninAdminResult({...claim.request.binding(),cipherSha256:claim.cipherSha256},bytes,{active:()=>scope.active()&&permit.active()&&scope.active(),signal:scope.signal}),
  uuid:randomUUID,unsafeStop:()=>process.exit(1),
 }),
 pause:signal=>new Promise(resolve=>{let timer:ReturnType<typeof setTimeout>;const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};timer=setTimeout(done,5000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();}),
};
/** One startup selects its branch exactly once. Any mailbox failure terminates;
 * a claimed admin request never reaches network/presence or retries mutations.
 * The local barrier remains owned through every backend/helper completion. */
export async function desktopSigninStartup(ownerSid:string,signal:AbortSignal,deps=defaults):Promise<'normal'|'admin'>{
 const controller=new AbortController();let lease:Lease|undefined,claim:Claimed|undefined;
 const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const active=()=>{try{return !controller.signal.aborted&&!!lease&&lease.current()&&!controller.signal.aborted;}catch{return false;}};
 const guard=()=>{if(!active())throw failure();};
 try{
  if(controller.signal.aborted)throw failure();lease=await deps.lease(ownerSid,controller.signal);guard();
  const mailbox=await deps.mailbox(ownerSid,{active,signal:controller.signal});
  if(mailbox.kind==='claimed')claim=mailbox;guard();
  if(claim){await deps.administer(claim,lease,{active,signal:controller.signal});guard();return 'admin';}
  while(active()){
   await deps.cycle(ownerSid,controller.signal);if(!active())break;
   await deps.pause(controller.signal);
  }
  if(!controller.signal.aborted)throw failure();return 'normal';
 }finally{
  controller.abort();claim?.request.close();signal.removeEventListener('abort',abort);
  if(lease){let timer:ReturnType<typeof setTimeout>|undefined;try{lease.close();await Promise.race([lease.settled(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(failure()),8000);timer.unref();})]);}catch{try{deps.unsafeStop();}catch{}throw failure();}finally{clearTimeout(timer);}}
 }
}
