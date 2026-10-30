import{execFileSync}from"node:child_process";
import{fullscreenProbeScript}from"../dist/fullscreen.js";
// Compile declarations only on a disposable Windows CI runner. Never call foreground/window APIs.
if(process.platform!=="win32"){console.log("SKIP: Windows compile-only probe");process.exit(0);}
const compileOnly=fullscreenProbeScript.replace("[Console]::Out.Write([SodaFullscreen]::Check())","");
if(compileOnly===fullscreenProbeScript)throw Error("compile-only marker missing");
execFileSync("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-Command",compileOnly],{windowsHide:true,timeout:20000,maxBuffer:8192,stdio:"pipe"});
console.log("PASS: read-only foreground helper declarations compile; no Win32 query executed");
