import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {createHash} from "node:crypto";
import {afterEach,expect,it,vi} from "vitest";
import {DesktopSigninContextProcess,type DesktopSigninPresenceDependencies} from "./DesktopSigninPresenceProcess.js";
const ownerSid="S-1-5-21-1-2-3-1001",root="C:\\Program Files\\Sodashitsu\\DesktopSignin-generated",slot=createHash("sha256").update(ownerSid).digest("hex");
const context={type:"signin_context",ownerSid,packageRoot:root,stateDir:"C:\\ProgramData\\sodashitsu\\desktop-signin\\"+slot+"\\runtime"};
class Child extends EventEmitter{stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();kill=vi.fn(()=>true);}
const processes:DesktopSigninContextProcess[]=[];
afterEach(()=>{for(const p of processes)p.close();processes.length=0;vi.useRealTimers();});
function fixture(){let now=0,active=true,onCheck:(()=>void)|undefined;const child=new Child(),abort=new AbortController(),closed=vi.fn(),unsafeStop=vi.fn(),spawn=vi.fn<DesktopSigninPresenceDependencies["spawn"]>(()=>child as never);
 const process=new DesktopSigninContextProcess({ownerSid,active:()=>{onCheck?.();return active;},signal:abort.signal,closed},{root:()=>root,platform:"win32",now:()=>now,spawn,unsafeStop});processes.push(process);
 const output=(value:unknown)=>child.stdout.write(Buffer.from(JSON.stringify(value)+"\n"));const finish=()=>{output({type:"signin_stopped"});child.emit("close",0);};
 return {process,child,abort,closed,unsafeStop,spawn,output,finish,clock:(v:number)=>{now=v;},lose:()=>{active=false;},onCheck:(callback:()=>void)=>{onCheck=callback;}};
}
it("runs fixed context-only argv and never exposes presence authority",async()=>{const f=fixture();expect(f.spawn.mock.calls[0]![1]).toEqual(["--context"]);expect(f.child.stdin.read()).toBeNull();expect(f.process.active()).toBe(false);f.output(context);let ready=false;void f.process.ready().then(()=>{ready=true;});await Promise.resolve();expect(ready).toBe(false);expect(f.process.active()).toBe(false);f.output({type:"signin_stopped"});await Promise.resolve();expect(ready).toBe(false);f.child.emit("close",0);expect(await f.process.ready()).toEqual(context);expect(f.process.active()).toBe(false);await f.process.settled();expect(f.unsafeStop).not.toHaveBeenCalled();});
it.each(["pulse","frame","inactive","duplicate","extra"])("withholds context after invalid %s even with final stop proof",async mode=>{const f=fixture();f.output(context);if(mode==="pulse")f.output({type:"signin_presence",seq:1,validForMs:1000});else if(mode==="frame")f.output({type:"frame",data:"generated"});else if(mode==="inactive")f.output({type:"signin_inactive"});else if(mode==="duplicate")f.output(context);else f.output({...context,extra:true});f.finish();await expect(f.process.ready()).rejects.toThrow();await f.process.settled();expect(f.process.active()).toBe(false);});
it.each(["missing-context","expired","abort"])("never publishes metadata after %s",async mode=>{const f=fixture();if(mode==="expired")f.clock(10000);if(mode==="abort")f.abort.abort();if(mode!=="missing-context")f.output(context);f.finish();await expect(f.process.ready()).rejects.toThrow();expect(f.process.active()).toBe(false);});
it.each(["bad-exit","missing-proof","tail"])("requires confirmed native teardown: %s",async mode=>{const f=fixture();f.output(context);if(mode!=="missing-proof")f.output({type:"signin_stopped"});if(mode==="tail")f.child.stdout.write(Buffer.from([0xc2]));f.child.emit("close",mode==="bad-exit"?1:0);await expect(f.process.ready()).rejects.toThrow();await expect(f.process.settled()).rejects.toThrow();expect(f.unsafeStop).toHaveBeenCalledOnce();});

it.each(["abort","close","expired"])("withdraws earlier metadata before final exit: %s",async mode=>{const f=fixture();f.output(context);if(mode==="abort")f.abort.abort();else if(mode==="close")f.process.close();else f.clock(10000);f.finish();await expect(f.process.ready()).rejects.toThrow();expect(f.process.active()).toBe(false);});

it.each(["owner-loss","callback-abort","callback-close","callback-expiry","closed-callback"])("checks ownership at final metadata publication: %s",async mode=>{const f=fixture();f.output(context);if(mode==="owner-loss")f.lose();else if(mode==="closed-callback")f.closed.mockImplementation(()=>f.lose());else f.onCheck(()=>{if(mode==="callback-abort")f.abort.abort();else if(mode==="callback-close")f.process.close();else f.clock(10000);});f.finish();await expect(f.process.ready()).rejects.toThrow();await f.process.settled();});
