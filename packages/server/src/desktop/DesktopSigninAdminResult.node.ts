import {spawn,type ChildProcess,type SpawnOptions} from 'node:child_process';
import type {Readable,Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {win32} from 'node:path';
import {desktopWindowsPowerShell} from '@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node';
const failure=()=>new Error('Signin administration result is unavailable');
type Child=Pick<ChildProcess,'on'|'kill'>&{stdin:Writable;stdout:Readable;stderr:Readable};
export interface DesktopSigninAdminResultDependencies{platform:NodeJS.Platform;now():number;shell():string;unsafeStop():void;spawn(command:string,args:string[],options:SpawnOptions):Child;}
const defaults:DesktopSigninAdminResultDependencies={platform:process.platform,now:()=>performance.now(),shell:desktopWindowsPowerShell,unsafeStop:()=>process.exit(1),spawn:(command,args,options)=>spawn(command,args,options) as Child};
/** Public results only. Native helper reopens the private claimed request and
 * derives its own owner/nonce/deadline before atomic persistence. */
export function writeDesktopSigninAdminResult(binding:{ownerSid:string;nonce:string;cipherSha256:string},bytes:Uint8Array,scope:{active():boolean;signal:AbortSignal},deps=defaults):Promise<void>{
 return new Promise((resolve,reject)=>{
  let child:Child|undefined,spawning=true,stopping=false,done=false,deadline=0,size=0,copy:Buffer|undefined;const chunks:Buffer[]=[];
  let timer:ReturnType<typeof setTimeout>|undefined,health:ReturnType<typeof setInterval>|undefined,teardown:ReturnType<typeof setTimeout>|undefined;
  const live=()=>{try{return !done&&!stopping&&!scope.signal.aborted&&scope.active()&&deps.now()<deadline&&!done&&!stopping&&!scope.signal.aborted;}catch{return false;}};
  const finish=(ok=false)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(health);clearTimeout(teardown);scope.signal.removeEventListener('abort',stop);copy?.fill(0);for(const b of chunks)b.fill(0);chunks.length=0;if(ok)resolve();else reject(failure());};
  const reap=()=>{if(spawning||done||!child||teardown)return;teardown=setTimeout(()=>{try{deps.unsafeStop();}catch{}finish();},8000);teardown.unref();try{child.stdin?.destroy();}catch{}try{child.kill();}catch{}};
  const stop=()=>{stopping=true;reap();};
  try{
   deadline=deps.now()+5000;
   if(deps.platform!=='win32'||!/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(binding.ownerSid)||binding.ownerSid.length>184||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.nonce)||!/^[a-f0-9]{64}$/.test(binding.cipherSha256)||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>16384||!live()){finish();return;}
   copy=Buffer.from(bytes);scope.signal.addEventListener('abort',stop,{once:true});const command=deps.shell(),script=fileURLToPath(new URL('../../../../scripts/remote-desktop/write-signin-admin-result.ps1',import.meta.url));
   const env:NodeJS.ProcessEnv={PSModulePath:win32.join(win32.dirname(command),'Modules')};for(const name of ['SystemRoot','windir','PATH','TEMP','TMP'])if(typeof process.env[name]==='string')env[name]=process.env[name];
   child=deps.spawn(command,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-OwnerSid',binding.ownerSid,'-Nonce',binding.nonce,'-ClaimSha256',binding.cipherSha256],{stdio:['pipe','pipe','pipe'],windowsHide:true,cwd:win32.dirname(command),env});spawning=false;
   child.on('error',stop);child.on('close',(code:number|null)=>{
    if(done)return;let ok=false;const output=Buffer.concat(chunks,size);try{ok=code===0&&live()&&new TextDecoder('utf-8',{fatal:true}).decode(output).trim()==='signin_admin_result_committed'&&live();}catch{}finally{output.fill(0);}finish(ok);
   });
   if(!child.stdin||!child.stdout||!child.stderr){stop();return;}
   child.stdin.on('error',stop);child.stdout.on('error',stop);child.stderr.on('error',stop);child.stderr.on('data',(b:Buffer)=>b.fill(0));
   child.stdout.on('data',(b:Buffer)=>{if(!live()||size+b.length>128){b.fill(0);stop();return;}size+=b.length;chunks.push(Buffer.from(b));b.fill(0);});
   if(!live()){stop();return;}child.stdin.end(copy,(error?:Error|null)=>{if(error)stop();});
   timer=setTimeout(stop,5000);timer.unref();health=setInterval(()=>{if(!live())stop();},100);health.unref();
  }catch{spawning=false;if(child)stop();else finish();}
 });
}
