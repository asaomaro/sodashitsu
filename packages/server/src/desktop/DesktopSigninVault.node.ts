import {spawn,type ChildProcess,type SpawnOptions} from "node:child_process";
import type {Readable} from "node:stream";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {desktopWindowsPowerShell} from "@sodashitsu/client-core/desktop/DesktopWindowsPowerShell.node";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

type Child=Pick<ChildProcess,"on"|"kill">&{stdout:Readable;stderr:Readable};
export interface DesktopSigninVaultDependencies {
  platform:NodeJS.Platform;
  shell():string;
  now?():number;
  spawn(command:string,args:string[],options:SpawnOptions):Child;
}
export interface DesktopSigninVaultScope {active():boolean;signal?:AbortSignal;}
const failure=()=>new Error("Signin enrollment is unavailable");
const defaults:DesktopSigninVaultDependencies={platform:process.platform,shell:desktopWindowsPowerShell,spawn:(command,args,options)=>{
  const child=spawn(command,args,options);
  if(!child.stdout||!child.stderr){child.kill();throw failure();}
  return child as Child;
}};
/** Private startup data only. The dedicated service host must first verify the
 * entire installed Node/JS/helper bundle; never launch project code as SYSTEM.
 * No files, identities, permissions or services are created by this reader.
 * A returned record is not a permission or ongoing service-lifetime proof. */
export function desktopSigninVaultReader(deps:DesktopSigninVaultDependencies=defaults) {
  return (ownerSid:string,scope:DesktopSigninVaultScope):Promise<DesktopSigninEnrollment>=>new Promise((resolve,reject)=>{
    let done=false,child:Child|undefined,timer:ReturnType<typeof setTimeout>|undefined,size=0,deadline=0;
    const chunks:Buffer[]=[];
    const now=()=>deps.now?.()??performance.now();
    const live=()=>{let active=false;try{active=scope.active()&&now()<deadline;}catch{}return active&&!scope.signal?.aborted&&!done;};
    const abort=()=>finish();
    const finish=(record?:DesktopSigninEnrollment)=>{
      if(done)return;done=true;
      if(timer)clearTimeout(timer);scope.signal?.removeEventListener("abort",abort);
      for(const bytes of chunks)bytes.fill(0);chunks.length=0;
      if(record)resolve(record);
      else {try{child?.kill();}catch{}reject(failure());}
    };
    try {
      deadline=now()+5000;
      if(deps.platform!=="win32" || ownerSid.length>184 || !/^S-1-[0-9]+(?:-[0-9]+){1,15}$/.test(ownerSid) || !live()){finish();return;}
      const executable=deps.shell();
      const script=fileURLToPath(new URL("../../../../scripts/remote-desktop/read-signin-enrollment.ps1",import.meta.url));
      child=deps.spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script,"-OwnerSid",ownerSid],{
        stdio:["ignore","pipe","pipe"],windowsHide:true,cwd:win32.dirname(executable),
        env:{...process.env,PSModulePath:win32.join(win32.dirname(executable),"Modules")},
      });
      child.stdout.on("data",(bytes:Buffer)=>{
        if(done){bytes.fill(0);return;}
        size+=bytes.length;
        if(size>16384||!live()){bytes.fill(0);finish();return;}
        chunks.push(Buffer.from(bytes));bytes.fill(0);
      });
      child.stderr.on("data",(bytes:Buffer)=>{bytes.fill(0);});
      child.stdout.on("error",()=>finish());child.stderr.on("error",()=>finish());child.on("error",()=>finish());
      child.on("close",(code:number|null)=>{
        if(done)return;
        if(code!==0||!size||!live()){finish();return;}
        const bytes=Buffer.concat(chunks,size);
        try {
          const record=DesktopSigninEnrollment.decode(bytes,ownerSid);
          if(!live()){finish();return;}
          finish(record);
        }catch{finish();}finally{bytes.fill(0);}
      });
      if(done)return;
      timer=setTimeout(()=>finish(),5000);timer.unref();
      scope.signal?.addEventListener("abort",abort,{once:true});
      if(!live())finish();
    }catch{finish();}
  });
}
export const readDesktopSigninEnrollment=desktopSigninVaultReader();
