import {createHash} from "node:crypto";
import {hostname,release} from "node:os";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {DesktopSigninPresenceProcess,type DesktopSigninContext} from "./DesktopSigninPresenceProcess.js";
import {DesktopSigninIdentity} from "./DesktopSigninIdentity.js";
import {DesktopSigninEndpoint} from "./DesktopSigninEndpoint.js";
import {DesktopSigninConnector} from "./DesktopSigninConnector.js";
import {readDesktopSigninEnrollment} from "./DesktopSigninVault.node.js";
import type {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import type {DesktopSigninHandlers} from "./DesktopSigninDispatch.js";
const failure=()=>new Error("Signin runtime is unavailable");
type Store=Pick<DesktopEndpointStore,"status"|"endpoint"|"close"|"settled">;
type Presence=Pick<DesktopSigninPresenceProcess,"ready"|"active"|"close"|"settled">;
type Endpoint=Pick<DesktopSigninEndpoint,"start"|"clientGone"|"close">;
export interface DesktopSigninRuntimeDependencies {
 now():number;unsafeStop():void;
 presence(options:ConstructorParameters<typeof DesktopSigninPresenceProcess>[0]):Presence;
 enrollment(ownerSid:string,scope:{active():boolean;signal:AbortSignal}):Promise<DesktopSigninEnrollment>;
 store(context:DesktopSigninContext):Store;
 identity(options:ConstructorParameters<typeof DesktopSigninIdentity>[0]):Pick<DesktopSigninIdentity,"endpoint"|"close"|"settled">;
 endpoint(options:ConstructorParameters<typeof DesktopSigninEndpoint>[0]):Endpoint;
 connector(options:ConstructorParameters<typeof DesktopSigninConnector>[0]):Pick<DesktopSigninConnector,"close">;
}
const defaults:DesktopSigninRuntimeDependencies={now:()=>performance.now(),unsafeStop:()=>process.exit(1),presence:options=>new DesktopSigninPresenceProcess(options),enrollment:readDesktopSigninEnrollment,store:context=>new DesktopEndpointStore({stateDir:context.stateDir}),identity:options=>new DesktopSigninIdentity(options),endpoint:options=>new DesktopSigninEndpoint(options),connector:options=>new DesktopSigninConnector(options)};
const digest=(enrollment:DesktopSigninEnrollment,status:Awaited<ReturnType<Store["status"]>>)=>createHash("sha256").update(JSON.stringify([enrollment.publicStatus(),enrollment.delegation(),status])).digest("hex");
/** One fresh native presence epoch. No generic server, listener, project, key
 * writer or shell is instantiated. Every owned read/worker teardown completes
 * before the caller may begin another epoch. */
export async function desktopSigninCycle(ownerSid:string,signal:AbortSignal,deps:DesktopSigninRuntimeDependencies=defaults):Promise<"inactive"|"ended">{
 if(signal.aborted)throw failure();
 const controller=new AbortController();let failed=false,stopping=false,creating=false,policyUntil=Infinity;
 let presence:Presence|undefined,store:Store|undefined,identity:ReturnType<DesktopSigninRuntimeDependencies["identity"]>|undefined,endpoint:Endpoint|undefined,connector:ReturnType<DesktopSigninRuntimeDependencies["connector"]>|undefined;
 let timer:ReturnType<typeof setInterval>|undefined,watching=false;
 const pending=new Set<Promise<unknown>>();let resolveStop!:()=>void;const stopped=new Promise<void>(resolve=>{resolveStop=resolve;});
 const stop=()=>{if(stopping)return;stopping=true;controller.abort();connector?.close();presence?.close();resolveStop();};
 const fail=()=>{failed=true;stop();};
 const owned=()=>!stopping&&!signal.aborted&&!controller.signal.aborted;
 const active=()=>{let value=false;try{value=owned()&&!!presence&&presence.active()&&deps.now()<policyUntil&&owned();}catch{}if(!value&&!creating)stop();return value;};
 const outer=()=>stop();signal.addEventListener("abort",outer,{once:true});
 const read=async<T>(operation:()=>Promise<T>):Promise<T>=>{
  if(!active())throw failure();let wait:ReturnType<typeof setTimeout>|undefined;
  const work=Promise.resolve().then(()=>{if(!active())throw failure();return operation();});pending.add(work);void work.then(()=>pending.delete(work),()=>pending.delete(work));
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{wait=setTimeout(()=>{fail();reject(failure());},5000);wait.unref();})]);}finally{clearTimeout(wait);}
 };
 let result:"inactive"|"ended"="inactive";
 try{
  creating=true;try{presence=deps.presence({ownerSid,active:owned,signal:controller.signal,closed:stop});}finally{creating=false;if(!owned())presence?.close();}
  if(!owned())throw failure();const context=await presence.ready();
  if(!context){await presence.settled();return "inactive";}
  if(!active())throw failure();
  policyUntil=deps.now()+5000;
  const enrollment=await read(()=>deps.enrollment(ownerSid,{active,signal:controller.signal}));if(!active())throw failure();
  store=deps.store(context);if(!active())throw failure();
  const status=await read(()=>store!.status()),policy=enrollment.publicStatus();
  if(!active()||!status.initialized||!status.required||status.fingerprint!==policy.provider||!policy.peers.every(peer=>status.peers.some(actual=>actual.role==="viewer"&&actual.fingerprint===peer.fingerprint)))throw failure();
  const baseline=digest(enrollment,status);
  identity=deps.identity({enrollment,store,active,signal:controller.signal});if(!active())throw failure();
  endpoint=deps.endpoint({enrollment,identity,active,signal:controller.signal});if(!active())throw failure();
  const handlers:DesktopSigninHandlers={
   hello:owner=>({clientId:owner,snapshot:{protocol:1,serverVersion:"signin-v1",host:{os:"windows",hostname:hostname(),windowsBuild:Number(release().split(".")[2])||1},workspaces:[],tabs:[],panes:[],groups:[],focus:null,limits:{scrollbackLines:0}}}),
   capabilities:()=>({available:true,endpointRequired:true,allowInput:policy.allowInput,imeKeys:true,extendedInput:true}),
   status:()=>({available:true,initialized:true,required:true,fingerprint:policy.provider,peers:policy.peers.map(peer=>({...peer,role:"viewer" as const}))}),
   start:(owner,params,scope)=>endpoint!.start(owner,params,scope),clientGone:owner=>endpoint?.clientGone(owner),
  };
  connector=deps.connector({enrollment,handlers,active,signal:controller.signal});if(!active())throw failure();result="ended";
  timer=setInterval(()=>{
   if(!active())return;
   if(watching)return;watching=true;const checkUntil=deps.now()+5000;
   void (async()=>{const latestEnrollment=await read(()=>deps.enrollment(ownerSid,{active,signal:controller.signal})),latestStatus=await read(()=>store!.status());if(!active()||digest(latestEnrollment,latestStatus)!==baseline)throw failure();if(deps.now()>=checkUntil)throw failure();policyUntil=checkUntil;})().catch(fail).finally(()=>{watching=false;});
  },2000);timer.unref();
  await stopped;if(failed)throw failure();return result;
 }catch{failed=true;throw failure();}
 finally{
  stop();clearInterval(timer);signal.removeEventListener("abort",outer);connector?.close();identity?.close();if(!identity)store?.close();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([(async()=>{if(endpoint)await endpoint.close();if(identity)await identity.settled();else if(store)await store.settled();if(presence){presence.close();await presence.settled();}await Promise.allSettled([...pending]);})(),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(failure()),8000);timeout.unref();})]);
  }catch{failed=true;try{deps.unsafeStop();}catch{}throw failure();}finally{clearTimeout(timeout);}
 }
}
