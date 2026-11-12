import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {win32} from 'node:path';
import {z} from 'zod';
import {DesktopEndpointStore} from '@sodashitsu/client-core/desktop/DesktopEndpointStore.node';
import {desktopWindowsPowerShell} from '@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node';
import {DesktopSigninCertificate} from './DesktopSigninCertificate.js';
import {DesktopSigninEnrollment} from './DesktopSigninEnrollment.js';
const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const peer=z.object({fingerprint,label:z.string().trim().min(1).max(80)}).strict();
const origin=z.string().max(2048).refine(value=>{try{const url=new URL(value);return value===url.origin&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));}catch{return false;}});
export const desktopSigninAdminOperation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('status')}).strict(),
 z.object({kind:z.literal('initialize')}).strict(),
 z.object({kind:z.literal('trust'),peer}).strict(),
 z.object({kind:z.literal('revoke'),fingerprint}).strict(),
 z.object({kind:z.literal('enroll'),origin,caPem:DesktopSigninCertificate.optional(),machineId:z.string().regex(/^[a-f0-9]{32}$/),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),allowInput:z.boolean(),peers:z.array(peer).min(1).max(8).refine(values=>new Set(values.map(value=>value.fingerprint)).size===values.length)}).strict(),
 z.object({kind:z.literal('disable')}).strict(),
]);
type Store=Pick<DesktopEndpointStore,'status'|'initialize'|'setRequired'|'trust'|'revoke'|'close'|'settled'>;
export interface DesktopSigninAdminCommandDependencies {
 store(stateDir:string):Store;
 enrollment(ownerSid:string,operation:'enroll'|'disable',bytes:Uint8Array):Promise<void>;
 uuid():string;
}
const defaults:DesktopSigninAdminCommandDependencies={
 store:stateDir=>new DesktopEndpointStore({stateDir}),uuid:randomUUID,
 enrollment:(ownerSid,operation,bytes)=>new Promise((resolve,reject)=>{
  const command=desktopWindowsPowerShell(),script=fileURLToPath(new URL('../../../../scripts/remote-desktop/write-signin-enrollment.ps1',import.meta.url));
  const child=execFile(command,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-OwnerSid',ownerSid,'-Operation',operation],{windowsHide:true,maxBuffer:128,cwd:win32.dirname(command),env:{...process.env,PSModulePath:win32.join(win32.dirname(command),'Modules')}},(error,stdout)=>{
   if(error||stdout.trim()!=='signin_enrollment_updated')reject(Error('Signin enrollment update failed'));else resolve();
  });
  child.stdin!.on('error',reject);child.stdin!.end(bytes);
 }),
};
/** Native administrator-only service IPC authenticates the caller and owns the
 * exclusive stopped-service state. This function has no network or server API.
 * The existing store keeps SYSTEM CurrentUser DPAPI identity and trust formats. */
export async function desktopSigninAdminCommand(ownerSid:string,stateDir:string,raw:unknown,deps=defaults):Promise<unknown>{
 const operation=desktopSigninAdminOperation.parse(raw),store=deps.store(stateDir);
 try{
  if(operation.kind==='initialize'){await store.initialize();await store.setRequired(true);}
  else if(operation.kind==='disable')await deps.enrollment(ownerSid,'disable',new Uint8Array());
  else if(operation.kind!=='status'){
   const before=await store.status();if(!before.initialized||operation.kind!=='revoke'&&!before.required)throw Error('Signin endpoint is unavailable');
   if(operation.kind==='trust'){
    if(!before.peers.some(peer=>peer.fingerprint===operation.peer.fingerprint)&&before.peers.length>=8)throw Error('Signin peer limit reached');
    await store.trust({...operation.peer,role:'viewer'});
   }else if(operation.kind==='revoke')await store.revoke(operation.fingerprint,'viewer');
   else{
    if(!operation.peers.every(peer=>before.peers.some(actual=>actual.role==='viewer'&&actual.fingerprint===peer.fingerprint)))throw Error('Signin viewer is not trusted');
    const record={version:1,purpose:'desktop-signin',revision:deps.uuid(),ownerSid,provider:before.fingerprint,allowSignin:true,...operation};
    const {kind:_,...enrollment}=record,bytes=Buffer.from(JSON.stringify(enrollment));
    try{DesktopSigninEnrollment.decode(bytes,ownerSid);await deps.enrollment(ownerSid,'enroll',bytes);}finally{bytes.fill(0);}
   }
  }
  return {outcome:'success',status:await store.status()};
 }catch{return {outcome:'incomplete'};}
 finally{store.close();await store.settled();}
}
export function desktopSigninAdminStateDirectory(ownerSid:string,packageRoot:string):string{
 return win32.join(win32.dirname(packageRoot),'DesktopSigninData',createHash('sha256').update(ownerSid).digest('hex'),'runtime');
}
