import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.node.js";
/** Bundled metadata-only helpers. No private key bytes, PATH or project code. */
export function desktopWindowsMetadata(script:"check-endpoint-acl.ps1"|"commit-endpoint-vault.ps1",args:string[],marker:string):Promise<void> {
 const executable=desktopWindowsPowerShell(),path=fileURLToPath(new URL(`../../../../scripts/remote-desktop/${script}`,import.meta.url));
 return new Promise((resolve,reject)=>{console.error("GENERATED_METADATA_BEGIN",script);const started=Date.now();
  const child=spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path,...args],{stdio:["ignore","pipe","pipe"],windowsHide:true,cwd:win32.dirname(executable),env:{...process.env,PSModulePath:win32.join(win32.dirname(executable),"Modules")}});let output="",done=false;
  const finish=(ok:boolean)=>{if(done)return;console.error("GENERATED_METADATA_FINISH",script,ok,Date.now()-started,output.slice(0,128));done=true;clearTimeout(timer);if(ok)resolve();else{child.kill();reject(Error("Desktop endpoint storage operation failed"));}};
  child.once("spawn",()=>console.error("GENERATED_METADATA_SPAWN",script,Date.now()-started));const timer=setTimeout(()=>{console.error("GENERATED_METADATA_TIMEOUT",script);finish(false);},5000);timer.unref();child.stdout.on("data",chunk=>{output+=String(chunk);if(output.length>128)finish(false);});child.stderr.on("data",chunk=>console.error("GENERATED_METADATA",String(chunk)));child.stdout.on("error",()=>finish(false));child.stderr.on("error",()=>finish(false));child.on("error",()=>finish(false));child.on("close",code=>finish(code===0&&output.trim()===marker));
 });
}
