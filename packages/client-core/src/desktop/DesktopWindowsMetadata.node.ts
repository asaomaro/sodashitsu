import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {win32} from "node:path";
import {desktopWindowsPowerShell} from "./DesktopWindowsPowerShell.node.js";
/** Bundled metadata-only helpers. No private key bytes, PATH or project code. */
export function desktopWindowsMetadata(script:"check-endpoint-acl.ps1"|"commit-endpoint-vault.ps1",args:string[],marker:string):Promise<void> {
 const executable=desktopWindowsPowerShell(),path=fileURLToPath(new URL(`../../../../scripts/remote-desktop/${script}`,import.meta.url));
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path,...args],{stdio:["ignore","pipe","pipe"],windowsHide:true,cwd:win32.dirname(executable),env:{...process.env,PSModulePath:win32.join(win32.dirname(executable),"Modules")}});let output="",done=false;
  const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);if(ok)resolve();else{child.kill();reject(Error("Desktop endpoint storage operation failed"));}};
  const timer=setTimeout(()=>finish(false),5000);timer.unref();child.stdout.on("data",chunk=>{output+=String(chunk);if(output.length>128)finish(false);});child.stderr.on("data",()=>{});child.stdout.on("error",()=>finish(false));child.stderr.on("error",()=>finish(false));child.on("error",()=>finish(false));child.on("close",code=>finish(code===0&&output.trim()===marker));
 });
}
