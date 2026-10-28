import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {inspect} from "node:util";
import {afterEach,expect,it,vi} from "vitest";
import {desktopSigninVaultReader,type DesktopSigninVaultDependencies} from "./DesktopSigninVault.node.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

const owner="S-1-5-21-1-2-3-1001",token="secret_"+"t".repeat(36);
const bytes=()=>Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision:"11111111-1111-4111-8111-111111111111",ownerSid:owner,origin:"https://root.invalid",machineId:"a".repeat(32),token,provider:"1".repeat(64),allowSignin:true,peers:[{fingerprint:"2".repeat(64),label:"Generated peer"}]}));
const shell="C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
function fixture(now?:()=>number){
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>true)});
 const spawn=vi.fn<DesktopSigninVaultDependencies["spawn"]>(()=>child as unknown as ReturnType<DesktopSigninVaultDependencies["spawn"]>);
 return {child,spawn,read:desktopSigninVaultReader({platform:"win32",shell:()=>shell,spawn,...(now?{now}:{})})};
}
it("captures only private pipes, parses the fixed owner and never prints credentials",async()=>{
 const f=fixture(),log=vi.spyOn(console,"log"),error=vi.spyOn(console,"error"),warn=vi.spyOn(console,"warn");
 const p=f.read(owner,{active:()=>true}),raw=bytes(),diagnostic=Buffer.from(token);
 f.child.stdout.emit("data",raw);f.child.stderr.emit("data",diagnostic);f.child.emit("close",0);
 const result=await p;expect(result.delegation().token).toBe(token);expect(JSON.stringify(result)).not.toContain(token);
 expect(raw.every(value=>value===0)).toBe(true);expect(diagnostic.every(value=>value===0)).toBe(true);
 const [executable,args,options]=f.spawn.mock.calls[0]!;
 expect(executable).toBe(shell);expect(args).toContain(owner);expect(args.join(" ")).not.toContain(token);
 expect(options.stdio).toEqual(["ignore","pipe","pipe"]);expect(options.windowsHide).toBe(true);expect(options.cwd).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0");
 expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(f.child.kill).not.toHaveBeenCalled();
});
it.each(["overflow","malformed","empty","exit","error","stdout","stderr"])("rejects %s, kills the child and sanitizes failures",async mode=>{
 const f=fixture(),p=f.read(owner,{active:()=>true}),outcome=p.catch(error=>error as Error),raw=mode==="overflow"?Buffer.alloc(16385,1):mode==="malformed"?Buffer.from(token):mode==="empty"?Buffer.alloc(0):bytes();
 f.child.stdout.emit("data",raw);
 if(mode==="exit")f.child.emit("close",1);
 else if(mode==="error")f.child.emit("error",new Error(token));
 else if(mode==="stdout"||mode==="stderr")f.child[mode].emit("error",new Error(token));
 else f.child.emit("close",0);
 const error=await outcome;expect(error).toBeInstanceOf(Error);expect((error as Error).message).toBe("Signin enrollment is unavailable");expect(inspect(error)).not.toContain(token);expect(f.child.kill).toHaveBeenCalledTimes(1);expect(raw.every(value=>value===0)).toBe(true);
});
it("refuses before spawn on wrong platform, invalid owner, lost owner or pre-abort",async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 await expect(f.read(owner,{active:()=>false})).rejects.toThrow("Signin enrollment is unavailable");
 await expect(f.read(owner,{active:()=>{throw Error(token);}})).rejects.toThrow("Signin enrollment is unavailable");
 await expect(f.read(owner,{active:()=>true,signal:controller.signal})).rejects.toThrow("Signin enrollment is unavailable");
 await expect(f.read("invalid-owner",{active:()=>true})).rejects.toThrow("Signin enrollment is unavailable");
 const read=desktopSigninVaultReader({platform:"linux",shell:()=>shell,spawn:f.spawn});await expect(read(owner,{active:()=>true})).rejects.toThrow("Signin enrollment is unavailable");expect(f.spawn).not.toHaveBeenCalled();
});
it.each(["data","close","decode","abort"])("discards a completed secret after owner loss at %s",async mode=>{
 const f=fixture(),controller=new AbortController();let active=true;
 const p=f.read(owner,{active:()=>active,signal:controller.signal}),outcome=p.catch(error=>error as Error),raw=bytes();
 if(mode==="data")active=false;
 if(mode==="decode") {const decode=DesktopSigninEnrollment.decode;vi.spyOn(DesktopSigninEnrollment,"decode").mockImplementation((...args)=>{const record=decode(...args);active=false;return record;});}
 f.child.stdout.emit("data",raw);
 if(mode==="close")active=false;if(mode==="abort")controller.abort();
 f.child.emit("close",0);expect(await outcome).toBeInstanceOf(Error);expect(f.child.kill).toHaveBeenCalledTimes(1);expect(raw.every(value=>value===0)).toBe(true);
});
it("bounds a stalled helper and removes its abort listener",async()=>{
 vi.useFakeTimers();const f=fixture(),controller=new AbortController(),remove=vi.spyOn(controller.signal,"removeEventListener");
 const p=f.read(owner,{active:()=>true,signal:controller.signal}),outcome=p.catch(error=>error as Error);
 await vi.advanceTimersByTimeAsync(5000);expect(await outcome).toBeInstanceOf(Error);expect(f.child.kill).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("rejects oversized output before waiting for helper close",async()=>{
 const f=fixture(),p=f.read(owner,{active:()=>true}),outcome=p.catch(error=>error as Error),raw=Buffer.alloc(16385,1);
 try {f.child.stdout.emit("data",raw);expect(f.child.kill).toHaveBeenCalledTimes(1);expect(await outcome).toBeInstanceOf(Error);}
 finally {f.child.emit("close",1);}
 expect(raw.every(value=>value===0)).toBe(true);
});
it("rejects a late secret even before the timer callback runs",async()=>{
 let now=0;const f=fixture(()=>now),p=f.read(owner,{active:()=>true}),outcome=p.catch(error=>error as Error),raw=bytes();
 f.child.stdout.emit("data",raw);now=5000;f.child.emit("close",0);
 expect(await outcome).toBeInstanceOf(Error);expect(f.child.kill).toHaveBeenCalledTimes(1);expect(raw.every(value=>value===0)).toBe(true);
});
it("catches an abort fired during spawn and never exposes a late response",async()=>{
 const f=fixture(),controller=new AbortController();f.spawn.mockImplementation(()=>{controller.abort();return f.child as unknown as ReturnType<DesktopSigninVaultDependencies["spawn"]>;});
 const p=f.read(owner,{active:()=>true,signal:controller.signal}),outcome=p.catch(error=>error as Error);
 f.child.stdout.emit("data",bytes());f.child.emit("close",0);expect(await outcome).toBeInstanceOf(Error);expect(f.child.kill).toHaveBeenCalledTimes(1);
});
