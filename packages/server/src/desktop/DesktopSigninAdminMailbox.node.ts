import {spawn,type ChildProcess,type SpawnOptions} from "node:child_process";
import type {Readable} from "node:stream";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {z} from "zod";
import {desktopWindowsPowerShell} from "@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node";
import {DesktopSigninAdminRequest,type DesktopSigninAdminClock} from "./DesktopSigninAdminRequest.js";
const failure=()=>new Error("Signin administration mailbox is unavailable");
type Child=Pick<ChildProcess,"on"|"kill">&{stdout:Readable;stderr:Readable};
const binding=z.object({state:z.literal('claimed'),nonce:z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),cipherSha256:z.string().regex(/^[a-f0-9]{64}$/),requestBase64:z.string().min(1).max(21848)}).strict();
const reply=z.discriminatedUnion('state',[z.object({state:z.literal('normal')}).strict(),binding]);
export type DesktopSigninAdminMailboxResult={kind:'normal'}|{kind:'claimed';cipherSha256:string;request:DesktopSigninAdminRequest};
export interface DesktopSigninAdminMailboxDependencies{platform:NodeJS.Platform;shell():string;clock:DesktopSigninAdminClock;unsafeStop():void;spawn(command:string,args:string[],options:SpawnOptions):Child;}
const defaults:DesktopSigninAdminMailboxDependencies={platform:process.platform,shell:desktopWindowsPowerShell,clock:{wall:()=>Date.now(),monotonic:()=>performance.now()},unsafeStop:()=>process.exit(1),spawn:(command,args,options)=>spawn(command,args,options) as Child};
/** Fixed local SYSTEM helper only. It validates private storage and durably
 * claims before decrypting. Any error is terminal, never a normal-start signal. */
export function readDesktopSigninAdmin(ownerSid:string,scope:{active():boolean;signal:AbortSignal},deps=defaults):Promise<DesktopSigninAdminMailboxResult>{
 return new Promise((resolve,reject)=>{
  let child:Child|undefined,spawning=true,stopping=false,done=false,size=0;const chunks:Buffer[]=[];let timer:ReturnType<typeof setTimeout>|undefined,teardown:ReturnType<typeof setTimeout>|undefined;
  let deadline=0;
  const live=()=>{try{return !done&&!stopping&&!scope.signal.aborted&&scope.active()&&deps.clock.monotonic()<deadline&&!done&&!stopping&&!scope.signal.aborted;}catch{return false;}};
  const clear=()=>{for(const b of chunks)b.fill(0);chunks.length=0;};
  const finish=(result?:DesktopSigninAdminMailboxResult)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(teardown);scope.signal.removeEventListener('abort',stop);clear();if(result)resolve(result);else reject(failure());};
  const reap=()=>{if(spawning||done||!child||teardown)return;teardown=setTimeout(()=>{try{deps.unsafeStop();}catch{}finish();},8000);teardown.unref();try{child.kill();}catch{}};
  const stop=()=>{stopping=true;clear();reap();};
  try{
   deadline=deps.clock.monotonic()+5000;
   if(deps.platform!=='win32'||ownerSid.length>184||!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(ownerSid)||!live()){finish();return;}
   scope.signal.addEventListener('abort',stop,{once:true});const command=deps.shell(),script=fileURLToPath(new URL('../../../../scripts/remote-desktop/read-signin-admin.ps1',import.meta.url));
   const env:NodeJS.ProcessEnv={PSModulePath:win32.join(win32.dirname(command),'Modules')};for(const name of ['SystemRoot','windir','PATH','TEMP','TMP'])if(typeof process.env[name]==='string')env[name]=process.env[name];
   child=deps.spawn(command,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-OwnerSid',ownerSid],{stdio:['ignore','pipe','pipe'],windowsHide:true,cwd:win32.dirname(command),env});spawning=false;
   child.on('error',stop);child.on('close',(code:number|null)=>{
    if(done)return;if(code!==0||!size||!live()){finish();return;}const output=Buffer.concat(chunks,size);let plain:Buffer|undefined;
    try{
     const data=reply.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output)));let result:DesktopSigninAdminMailboxResult;
     if(data.state==='normal')result={kind:'normal'};
     else{plain=Buffer.from(data.requestBase64,'base64');if(plain.length>16384||plain.toString('base64')!==data.requestBase64)throw failure();const request=DesktopSigninAdminRequest.decode(plain,{ownerSid,nonce:data.nonce},deps.clock);result={kind:'claimed',cipherSha256:data.cipherSha256,request};}
     if(!live())throw failure();finish(result);
    }catch{finish();}finally{output.fill(0);plain?.fill(0);}
   });
   if(!child.stdout||!child.stderr){stop();return;}
   child.stdout.on('error',stop);child.stderr.on('error',stop);child.stderr.on('data',(bytes:Buffer)=>bytes.fill(0));
   child.stdout.on('data',(bytes:Buffer)=>{if(!live()||size+bytes.length>32768){bytes.fill(0);stop();return;}size+=bytes.length;chunks.push(Buffer.from(bytes));bytes.fill(0);});
   if(!live()){stop();return;}timer=setTimeout(stop,5000);timer.unref();
  }catch{spawning=false;if(child)stop();else finish();}
 });
}
