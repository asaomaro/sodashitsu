import {z} from 'zod';
import {DesktopEndpointStore} from '@sodashitsu/client-core/desktop/DesktopEndpointStore.node';
import type {DesktopSigninContext} from './DesktopSigninPresenceProcess.js';
import {DesktopSigninEnrollment} from './DesktopSigninEnrollment.js';
import {desktopSigninAdminTask,type DesktopSigninAdminTask} from './DesktopSigninAdminTask.node.js';
import type {DesktopSigninAdminBackend,DesktopSigninAdminPermit} from './DesktopSigninAdministration.js';
const failure=()=>new Error('Signin administration backend is unavailable');
type Store=Pick<DesktopEndpointStore,'status'|'initialize'|'setRequired'|'trust'|'revoke'|'close'|'settled'>;
const peer=z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),role:z.literal('viewer'),label:z.string().trim().min(1).max(80)}).strict();
export interface DesktopSigninAdminBackendDependencies {
 platform:NodeJS.Platform;
 store(options:ConstructorParameters<typeof DesktopEndpointStore>[0]):Store;
 task(task:DesktopSigninAdminTask,binding:{ownerSid:string;nonce:string;cipherSha256:string},bytes:Uint8Array,scope:{active():boolean;signal:AbortSignal}):Promise<void>;
}
const defaults:DesktopSigninAdminBackendDependencies={platform:process.platform,store:options=>new DesktopEndpointStore(options),task:desktopSigninAdminTask};
/** Caller must already hold the native verified local lease and private claimed
 * request. No server/RPC or automatic initialization is constructed here. */
export function desktopSigninAdminBackend(options:{context:DesktopSigninContext;binding:{nonce:string;cipherSha256:string};current():boolean;signal:AbortSignal},deps=defaults):DesktopSigninAdminBackend{
 let closed=false,busy=false,store:Store|undefined,storeClosed=false,permit:DesktopSigninAdminPermit|undefined;const controller=new AbortController(),pending=new Set<Promise<unknown>>();
 const binding={ownerSid:options.context.ownerSid,...options.binding};
 const live=()=>{try{return !closed&&!controller.signal.aborted&&!options.signal.aborted&&options.current()&&!closed&&!options.signal.aborted;}catch{return false;}};
 const close=()=>{if(!closed){closed=true;controller.abort();}if(store&&!storeClosed){storeClosed=true;store.close();}};
 const abort=()=>close();options.signal.addEventListener('abort',abort,{once:true});
 const guard=(value?:DesktopSigninAdminPermit)=>{if(!live()||value&&!value.active()||!live())throw failure();};
 const own=<T>(operation:()=>Promise<T>):Promise<T>=>{const work=Promise.resolve().then(()=>{guard();return operation();});pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work;};
 const task=(action:DesktopSigninAdminTask,bytes:Uint8Array,value:DesktopSigninAdminPermit)=>{guard(value);return deps.task(action,binding,bytes,{active:()=>live()&&value.active()&&live(),signal:controller.signal});};
 const write=(value:DesktopSigninAdminPermit,operation:()=>Promise<void>):Promise<void>=>own(async()=>{
  guard(value);if(busy)throw failure();busy=true;permit=value;
  try{await operation();guard(value);}finally{permit=undefined;busy=false;}
 });
 try{
  if(deps.platform!=='win32')throw failure();guard();
  store=deps.store({stateDir:options.context.stateDir,writeAllowed:()=>!!permit&&live()&&permit.active()&&live(),commitWindowsVault:(source,destination)=>{const value=permit;if(!value)throw failure();return task({kind:'commit',source,destination},new Uint8Array(),value);}});guard();
 }catch{close();options.signal.removeEventListener('abort',abort);throw failure();}
 return {
  status:()=>own(async()=>{const value=await store!.status();guard();return value;}),
  initialize:value=>write(value,async()=>{await store!.initialize();}),
  requireEncryption:value=>write(value,()=>store!.setRequired(true)),
  trust:(raw,value)=>write(value,async()=>{const parsed=peer.parse(raw),status=await store!.status();guard(value);if(!status.initialized||!status.required||status.peers.some(p=>p.role!=='viewer')||!status.peers.some(p=>p.fingerprint===parsed.fingerprint)&&status.peers.length>=8)throw failure();await store!.trust(parsed);}),
  revoke:(fingerprint,value)=>write(value,()=>store!.revoke(z.string().regex(/^[a-f0-9]{64}$/).parse(fingerprint),'viewer')),
  enrollment:(bytes,value)=>write(value,async()=>{const enrollment=DesktopSigninEnrollment.decode(bytes,options.context.ownerSid),policy=enrollment.publicStatus(),status=await store!.status();guard(value);if(!status.initialized||!status.required||status.fingerprint!==policy.provider||!policy.peers.every(peer=>status.peers.some(actual=>actual.role==='viewer'&&actual.fingerprint===peer.fingerprint)))throw failure();await task({kind:'enroll'},bytes,value);}),
  disable:value=>write(value,()=>task({kind:'disable'},new Uint8Array(),value)),
  close,
  settled:async()=>{close();try{await Promise.allSettled([...pending]);if(store)await store.settled();}finally{options.signal.removeEventListener('abort',abort);}},
 };
}
