import {afterEach,expect,it,vi} from "vitest";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import type {spawn} from "node:child_process";
import {DesktopAudioPipe} from "./DesktopAudioPipe.node.js";
const clean:Array<()=>void>=[];afterEach(()=>{for(const f of clean.splice(0))f();vi.useRealTimers();});
function fixture(kind:"audio"|"microphone"="audio",now?:()=>number,permit?:()=>boolean){
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});
 const input:Buffer[]=[];child.stdin.on("data",b=>input.push(Buffer.from(b)));
 let allowed=true;const launch=vi.fn(()=>child) as unknown as typeof spawn;
 const bridge=new DesktopAudioPipe({executable:"fixed-generated-audio-pipe.exe"},kind,()=>allowed&&(permit?.()??true),launch,now);bridge.on("error",()=>{});const ready=bridge.ready.catch(e=>e);
 clean.push(()=>{bridge.destroy();child.emit("close",0,null);});
 const nonce=JSON.parse(input[0]!.toString()).nonce;
 const descriptor=(extra={})=>Buffer.from(JSON.stringify({type:"audio_pipe",version:1,pid:4321,nonce,...extra})+"\n");
 return {bridge,ready,child,input,launch,descriptor,revoke:()=>{allowed=false;}};
}
it("validates a fragmented private descriptor before connecting the exact local pipe kind",async()=>{
 const f=fixture(),d=f.descriptor();f.child.stdout.write(d.subarray(0,17));f.child.stdout.write(d.subarray(17));expect(await f.ready).toBe(4321);
 expect(f.bridge.connect("SodaDesktopAudio-"+"a".repeat(32))).toBe(true);expect(JSON.parse(f.input[1]!.toString())).toEqual({kind:"audio",name:"SodaDesktopAudio-"+"a".repeat(32)});
 const output:Buffer[]=[];f.bridge.on("data",b=>output.push(b));const pcm=Buffer.from([0,255,10,13,128,1]);f.child.stdout.write(pcm);await new Promise(resolve=>setImmediate(resolve));expect(Buffer.concat(output)).toEqual(pcm);
 expect(f.launch).toHaveBeenCalledWith("fixed-generated-audio-pipe.exe",[],expect.objectContaining({shell:false,windowsHide:true}));
});
it.each([{nonce:"b".repeat(64)},{pid:0},{pid:2147483648},{unexpected:true}])("rejects an unauthenticated or malformed descriptor %j",async extra=>{
 const f=fixture();f.child.stdout.write(f.descriptor(extra));expect(await f.ready).toBeInstanceOf(Error);expect(f.child.kill).toHaveBeenCalledOnce();expect(f.bridge.destroyed).toBe(true);
});
it("bounds descriptor bytes and waits actual child close after cancellation",async()=>{
 const f=fixture();let closed=false;void f.bridge.childClosed.then(()=>{closed=true;});f.child.stdout.write(Buffer.alloc(513,97));expect(await f.ready).toBeInstanceOf(Error);await Promise.resolve();expect(closed).toBe(false);f.child.emit("close",0,null);await f.bridge.childClosed;expect(closed).toBe(true);
});
it("rejects PCM before connect and mismatched microphone/audio names",async()=>{
 const f=fixture();f.child.stdout.write(Buffer.concat([f.descriptor(),Buffer.from([1])]));expect(await f.ready).toBe(4321);expect(f.bridge.destroyed).toBe(true);
 const g=fixture("microphone");g.child.stdout.write(g.descriptor());await g.ready;expect(g.bridge.connect("SodaDesktopAudio-"+"a".repeat(32))).toBe(false);
});
it("frames only fixed microphone packets and never forwards heartbeat into PCM",async()=>{
 vi.useFakeTimers();const f=fixture("microphone");f.child.stdout.write(f.descriptor());await f.ready;expect(f.bridge.connect("SodaDesktopMicrophone-"+"a".repeat(32))).toBe(true);
 const pcm=Buffer.alloc(1932,0xf1);await new Promise<void>((resolve,reject)=>f.bridge.write(pcm,e=>e?reject(e):resolve()));expect(f.input[2]!.length).toBe(1937);expect(f.input[2]!.subarray(0,5)).toEqual(Buffer.from([2,140,7,0,0]));expect(f.input[2]!.subarray(5)).toEqual(pcm);
 await vi.advanceTimersByTimeAsync(500);expect(f.input[3]).toEqual(Buffer.from([1,0,0,0,0]));f.revoke();await vi.advanceTimersByTimeAsync(500);expect(f.bridge.destroyed).toBe(true);expect(f.child.kill).toHaveBeenCalledOnce();
});
it("refuses audio writes and malformed microphone packet sizes",async()=>{
 for(const kind of ["audio","microphone"] as const){const f=fixture(kind);f.child.stdout.write(f.descriptor());await f.ready;f.bridge.connect(`SodaDesktop${kind==="audio"?"Audio":"Microphone"}-`+"a".repeat(32));const error=await new Promise<Error|null|undefined>(resolve=>f.bridge.write(Buffer.alloc(kind==="audio"?1932:1931),resolve));expect(error).toBeInstanceOf(Error);expect(f.input.length).toBe(2);}
});
it("fails closed on startup timeout and revoked descriptor",async()=>{
 vi.useFakeTimers();const f=fixture();await vi.advanceTimersByTimeAsync(2500);expect(await f.ready).toBeInstanceOf(Error);
 const g=fixture();g.revoke();g.child.stdout.write(g.descriptor());expect(await g.ready).toBeInstanceOf(Error);
});

it("checks the monotonic startup deadline before publishing a late descriptor even before timer execution",async()=>{
 let at=100;const f=fixture("audio",()=>at);at=2600;f.child.stdout.write(f.descriptor());expect(await f.ready).toBeInstanceOf(Error);expect(f.bridge.destroyed).toBe(true);
 const g=fixture("audio",()=>at);g.child.stdout.write(g.descriptor());expect(await g.ready).toBe(4321);at+=2500;expect(g.bridge.connect("SodaDesktopAudio-"+"a".repeat(32))).toBe(false);
});
it("refuses a final newline in local pipe names",async()=>{const f=fixture();f.child.stdout.write(f.descriptor());await f.ready;expect(f.bridge.connect("SodaDesktopAudio-"+"a".repeat(32)+"\n")).toBe(false);});

it("erases unread PCM on cancellation and rejects late bytes without publishing them",async()=>{
 const f=fixture();f.child.stdout.write(f.descriptor());await f.ready;f.bridge.connect("SodaDesktopAudio-"+"a".repeat(32));const pcm=Buffer.from("generated-pcm");f.child.stdout.write(pcm);expect(f.bridge.readableLength).toBe(pcm.length);f.bridge.destroy();expect(f.bridge.read()).toBe(null);expect(pcm.every(b=>b===0)).toBe(true);const late=Buffer.from("late-pcm");f.child.stdout.write(late);expect(late.every(b=>b===0)).toBe(true);
});

it("rechecks the fixed deadline after the permission callback and before publishing PID",async()=>{let at=0,calls=0;const f=fixture("audio",()=>at,()=>{if(++calls===2)at=2500;return true;});f.child.stdout.write(f.descriptor());expect(await f.ready).toBeInstanceOf(Error);expect(f.bridge.destroyed).toBe(true);});
it("rejects synchronous retirement inside the permission callback",async()=>{let retire=()=>{};const f=fixture("audio",undefined,()=>{retire();return true;});retire=()=>f.bridge.destroy();f.child.stdout.write(f.descriptor());expect(await f.ready).toBeInstanceOf(Error);expect(f.bridge.connect("SodaDesktopAudio-"+"a".repeat(32))).toBe(false);});

it("rechecks retirement after connect authorization before issuing the private connect command",async()=>{let retire=()=>{};const f=fixture("audio",undefined,()=>{retire();return true;});f.child.stdout.write(f.descriptor());await f.ready;retire=()=>f.bridge.destroy();expect(f.bridge.connect("SodaDesktopAudio-"+"a".repeat(32))).toBe(false);expect(f.input).toHaveLength(1);});
