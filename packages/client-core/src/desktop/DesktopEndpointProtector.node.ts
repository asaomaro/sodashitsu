import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.node.js";
import {win32} from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
export interface DesktopSecretProtector {
 readonly mode:"owner-file"|"dpapi-user";
 protect(value:Uint8Array):Promise<Uint8Array>;
 unprotect(value:Uint8Array):Promise<Uint8Array>;
}
/** No fallback to plaintext on Windows. Only binary private child pipes contain
 * key material; command arguments, stdout of the parent and logs never do. */
export function desktopSecretProtector(platform=process.platform):DesktopSecretProtector {
 if(platform!=="win32")return {mode:"owner-file",protect:async value=>new Uint8Array(value),unprotect:async value=>new Uint8Array(value)};
 const script=fileURLToPath(new URL("../../../../scripts/remote-desktop/protect-endpoint-key.ps1",import.meta.url));
 const call=(operation:"protect"|"unprotect",value:Uint8Array):Promise<Uint8Array>=>new Promise((resolve,reject)=>{
  if(!value.length||value.length>65536){reject(Error("Endpoint key protection failed"));return;}
  const executable=desktopWindowsPowerShell(),input=new Uint8Array(value),child=spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",script,"-Operation",operation],{stdio:["pipe","pipe","pipe"],windowsHide:true,cwd:win32.dirname(executable),env:{...process.env,PSModulePath:win32.join(win32.dirname(executable),"Modules")}}),chunks:Buffer[]=[];let size=0,done=false;
  const finish=(result?:Uint8Array)=>{if(done){result?.fill(0);return;}done=true;input.fill(0);clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);if(result)resolve(result);else{child.kill();reject(Error("Endpoint key protection failed"));}};
  const timer=setTimeout(()=>finish(),5000);timer.unref();
  child.stdout.on("data",(data:Buffer)=>{if(done){data.fill(0);return;}size+=data.length;if(size>65536){data.fill(0);finish();return;}chunks.push(data);});child.stderr.on("data",()=>{});child.stdout.on("error",()=>finish());child.stderr.on("error",()=>finish());
  child.stdin.on("error",()=>finish());child.on("error",()=>finish());child.on("close",code=>{if(done)return;if(code!==0||!size){finish();return;}finish(new Uint8Array(Buffer.concat(chunks,size)));});child.stdin.end(input);
 });
 return {mode:"dpapi-user",protect:value=>call("protect",value),unprotect:value=>call("unprotect",value)};
}
