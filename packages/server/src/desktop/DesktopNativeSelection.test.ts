import {afterEach,expect,it,vi} from "vitest";
import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {nativeSelectionProcess,DesktopNativeSelection} from "./DesktopNativeSelection.js";
const clean:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
it("waits for its exact owned child's successful exit before publishing early output",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-selection-child-"));clean.push(()=>rm(dir,{recursive:true,force:true}));
 const script=join(dir,"child.mjs"),gate=join(dir,"exit");await writeFile(script,'import {watch,existsSync} from "node:fs";const gate=process.argv[2];const observer=watch(process.argv[3],()=>{if(existsSync(gate)){observer.close();process.exit(0);}});process.stdout.write("ready");');
 let child!:ChildProcessWithoutNullStreams,closed=false;let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
 const launch=((...args:Parameters<typeof spawn>)=>{child=spawn(...args) as ChildProcessWithoutNullStreams;child.stdout.on("data",()=>ready());child.once("close",()=>{closed=true;});return child;}) as typeof spawn;
 let settled=false;const pending=nativeSelectionProcess(process.execPath,[script,gate,dir],"",{timeout:5000,limit:128,spawn:launch});void pending.then(()=>{settled=true;},()=>{settled=true;});
 await started;await Promise.resolve();expect(settled).toBe(false);expect(closed).toBe(false);await writeFile(gate,"");await expect(pending).resolves.toBe("ready");expect(closed).toBe(true);
});
for(const [mode,code,message] of [
 ["nonzero",'process.stdout.write("success");process.exit(1)',"終了"],
 ["invalid-utf8",'process.stdout.write(Buffer.from([255]));',"encoded"],
 ["stdout-limit",'process.stdout.write("x".repeat(1000));setInterval(()=>{},1000)',"上限"],
 ["stderr-limit",'process.stderr.write("x".repeat(9000));setInterval(()=>{},1000)',"上限"],
 ["timeout",'setInterval(()=>{},1000)',"時間切れ"],
] as const){it(`rejects ${mode} and waits for actual child close`,async()=>{
 let child!:ChildProcessWithoutNullStreams,closed=false;
 const launch=((...args:Parameters<typeof spawn>)=>{child=spawn(...args) as ChildProcessWithoutNullStreams;child.once("close",()=>{closed=true;});return child;}) as typeof spawn;
 await expect(nativeSelectionProcess(process.execPath,["-e",code],"",{timeout:mode==="timeout"?100:5000,limit:128,spawn:launch})).rejects.toThrow(message);expect(closed).toBe(true);
});}
it("aborts its owned process and refuses output after cancellation",async()=>{
 const controller=new AbortController();let child!:ChildProcessWithoutNullStreams,closed=false;
 const launch=((...args:Parameters<typeof spawn>)=>{child=spawn(...args) as ChildProcessWithoutNullStreams;child.stdout.once("data",()=>controller.abort());child.once("close",()=>{closed=true;});return child;}) as typeof spawn;
 await expect(nativeSelectionProcess(process.execPath,["-e",'process.stdout.write("ready");setInterval(()=>{},1000)'],"",{timeout:5000,limit:128,spawn:launch,signal:controller.signal})).rejects.toThrow("中止");expect(closed).toBe(true);
});
it("requires a prebuilt runtime before any Explorer capture and refuses unsupported hosts",async()=>{
 const runtime=new DesktopNativeSelection("linux",{}),point={epoch:crypto.randomUUID(),x:0,y:0,window:42,pid:1};
 await expect(runtime.capture(point,750,new AbortController().signal)).rejects.toThrow("開始");await expect(runtime.prepare()).rejects.toThrow("Windows");
});

for(const mode of ["deadline","backwards","clock-throw"]){it(`rejects ${mode} on close even before the timer callback`,async()=>{
 let now=100,calls=0;
 const clock=()=>{calls++;if(calls>1){if(mode==="clock-throw")throw Error("clock stopped");return mode==="deadline"?5100:99;}return now;};
 await expect(nativeSelectionProcess(process.execPath,["-e",'process.stdout.write("late success")'],"",{timeout:5000,limit:128,now:clock})).rejects.toThrow(mode==="clock-throw"?"clock stopped":"時間切れ");expect(calls).toBeGreaterThan(1);
});}
