import {hostname,release} from 'node:os';
import {DesktopEndpointStore} from '@sodashitsu/client-core/desktop/DesktopEndpointStore.node';
import {DesktopSigninPresenceProcess,type DesktopSigninContext} from './DesktopSigninPresenceProcess.js';
import {DesktopSigninIdentity} from './DesktopSigninIdentity.js';
import {DesktopSigninEndpoint} from './DesktopSigninEndpoint.js';
import {DesktopSigninConnector} from './DesktopSigninConnector.js';
import {readDesktopSigninEnrollment} from './DesktopSigninVault.node.js';
import type {DesktopSigninEnrollment} from './DesktopSigninEnrollment.js';
import type {DesktopSigninHandlers} from './DesktopSigninDispatch.js';
const failure=()=>new Error('Signin runtime is unavailable');
type Store=Pick<DesktopEndpointStore,'status'|'verifiedEndpoint'|'close'|'settled'>;
type Presence=Pick<DesktopSigninPresenceProcess,'ready'|'active'|'close'|'settled'>;
type Endpoint=Pick<DesktopSigninEndpoint,'start'|'clientGone'|'close'>;
export interface DesktopSigninRuntimeDependencies {
 unsafeStop():void;
 presence(options:ConstructorParameters<typeof DesktopSigninPresenceProcess>[0]):Presence;
 enrollment(ownerSid:string,scope:{active():boolean;signal:AbortSignal}):Promise<DesktopSigninEnrollment>;
 store(context:DesktopSigninContext):Store;
 identity(options:ConstructorParameters<typeof DesktopSigninIdentity>[0]):Pick<DesktopSigninIdentity,'endpoint'|'close'|'settled'>;
 endpoint(options:ConstructorParameters<typeof DesktopSigninEndpoint>[0]):Endpoint;
 connector(options:ConstructorParameters<typeof DesktopSigninConnector>[0]):Pick<DesktopSigninConnector,'close'>;
}
export function desktopSigninReadonlyStore(context:DesktopSigninContext):Store{return new DesktopEndpointStore({stateDir:context.stateDir,writeAllowed:()=>false});}
const defaults:DesktopSigninRuntimeDependencies={unsafeStop:()=>process.exit(1),presence:options=>new DesktopSigninPresenceProcess(options),enrollment:readDesktopSigninEnrollment,store:desktopSigninReadonlyStore,identity:options=>new DesktopSigninIdentity(options),endpoint:options=>new DesktopSigninEndpoint(options),connector:options=>new DesktopSigninConnector(options)};
/** Native host owns the immutable package, private state and process Jobs.
 * Administration requires this service to stop, so no policy-proof timer or
 * repeated DPAPI/digest polling is needed. Each peer still uses live store auth. */
export async function desktopSigninCycle(ownerSid:string,signal:AbortSignal,deps:DesktopSigninRuntimeDependencies=defaults):Promise<'inactive'|'ended'>{
 if(signal.aborted)return 'ended';
 const controller=new AbortController(),pending=new Set<Promise<unknown>>();let stopping=false,nativeLost=false;
 let presence:Presence|undefined,store:Store|undefined,identity:ReturnType<DesktopSigninRuntimeDependencies['identity']>|undefined,endpoint:Endpoint|undefined,connector:ReturnType<DesktopSigninRuntimeDependencies['connector']>|undefined;
 let resolveStop!:()=>void;const stopped=new Promise<void>(resolve=>{resolveStop=resolve;});
 const stop=()=>{if(stopping)return;stopping=true;controller.abort();connector?.close();presence?.close();resolveStop();};
 const owned=()=>!stopping&&!signal.aborted&&!controller.signal.aborted;
 const active=()=>owned()&&!!presence&&presence.active();
 const read=<T>(work:Promise<T>):Promise<T>=>{pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));return work;};
 signal.addEventListener('abort',stop,{once:true});
 try{
  presence=deps.presence({ownerSid,active:owned,signal:controller.signal,closed:()=>{nativeLost=true;stop();}});
  if(!owned())throw failure();const context=await presence.ready();
  if(!context){await presence.settled();return 'inactive';}
  if(!active())throw failure();store=deps.store(context);if(!active())throw failure();
  const [enrollment,status]=await Promise.all([read(deps.enrollment(ownerSid,{active,signal:controller.signal})),read(store.status())]),policy=enrollment.publicStatus();
  if(!active()||!status.initialized||!status.required||status.fingerprint!==policy.provider||!policy.peers.every(peer=>status.peers.some(actual=>actual.role==='viewer'&&actual.fingerprint===peer.fingerprint)))throw failure();
  identity=deps.identity({enrollment,store,active,signal:controller.signal});if(!active())throw failure();
  endpoint=deps.endpoint({enrollment,identity,active,signal:controller.signal});if(!active())throw failure();
  const handlers:DesktopSigninHandlers={
   hello:owner=>({clientId:owner,snapshot:{protocol:1,serverVersion:'signin-v1',host:{os:'windows',hostname:hostname(),windowsBuild:Number(release().split('.')[2])||1},workspaces:[],tabs:[],panes:[],groups:[],focus:null,limits:{scrollbackLines:0}}}),
   capabilities:()=>({available:true,endpointRequired:true,allowInput:policy.allowInput,imeKeys:true,extendedInput:true}),
   status:()=>({available:true,initialized:true,required:true,fingerprint:policy.provider,peers:policy.peers.map(peer=>({...peer,role:'viewer' as const}))}),
   start:(owner,params,scope)=>endpoint!.start(owner,params,scope),clientGone:owner=>endpoint?.clientGone(owner),
  };
  connector=deps.connector({enrollment,handlers,active,signal:controller.signal});if(!active())throw failure();
  await stopped;return 'ended';
 }catch{if(signal.aborted||nativeLost)return 'ended';throw failure();}
 finally{
  stop();signal.removeEventListener('abort',stop);connector?.close();identity?.close();if(!identity)store?.close();presence?.close();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([(async()=>{if(endpoint)await endpoint.close();if(identity)await identity.settled();else if(store)await store.settled();if(presence)await presence.settled();await Promise.allSettled([...pending]);})(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(failure()),8000);timeout.unref();})]);
  }catch{try{deps.unsafeStop();}catch{}throw failure();}finally{clearTimeout(timeout);}
 }
}
