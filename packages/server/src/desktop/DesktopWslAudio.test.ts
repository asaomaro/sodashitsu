import {Duplex} from "node:stream";
import {expect,it,vi} from "vitest";
import {DESKTOP_MICROPHONE_HELLO,DESKTOP_PCM_HELLO,DESKTOP_PCM_BYTES,decodeDesktopAudio} from "@sodashitsu/protocol";
import type {DesktopAudioPipe} from "@sodashitsu/client-core/desktop/DesktopAudioPipe.node";
import {DesktopNativeAudio} from "./DesktopNativeAudio.js";
import {DesktopMicrophone} from "./DesktopMicrophone.js";
import {DesktopSharedAudio} from "./DesktopSharedAudio.js";
const id="22222222-2222-4222-8222-222222222222";
function pcm(){const frame=Buffer.alloc(16+DESKTOP_PCM_BYTES);frame.writeUInt32LE(DESKTOP_PCM_BYTES);frame.writeUInt32LE(1,4);frame.writeBigUInt64LE(20000n,8);for(let i=0;i<DESKTOP_PCM_BYTES;i++)frame[16+i]=i%256;return frame;}
function bridge(hello:Uint8Array,active:()=>boolean,delayed=false){
 const packets:Buffer[]=[];let resolve!:(pid:number)=>void;
 const stream=new Duplex({read(){},write(bytes,_e,done){packets.push(Buffer.from(bytes));done();}});
 const ready=delayed?new Promise<number>(r=>{resolve=r;}):Promise.resolve(4321);
 const connect=vi.fn((_name:string)=>{if(!active())return false;queueMicrotask(()=>stream.push(Buffer.from(hello)));return true;});
 return {pipe:Object.assign(stream,{ready,connect}) as unknown as DesktopAudioPipe,packets,connect,resolve:(pid:number)=>resolve(pid)};
}
it("enables native audio with the private Windows descriptor PID and encodes generated PCM",async()=>{
 const write=vi.fn(),send=vi.fn((_m:any)=>true),state=vi.fn();let f:ReturnType<typeof bridge>|undefined;
 const audio=new DesktopNativeAudio({id,synthetic:false,bridge:active=>(f=bridge(Buffer.concat([DESKTOP_PCM_HELLO,pcm()]),active)).pipe,write,send,state,active:()=>true,videoTimestamp:()=>0});
 try{await expect.poll(()=>send.mock.calls.length).toBe(1);expect(write).toHaveBeenCalledWith({type:"native_audio",id,enabled:true,pipeName:expect.stringMatching(/^SodaDesktopAudio-[a-f0-9]{32}$/),clientPid:4321});expect(state).toHaveBeenCalledWith("running");expect(decodeDesktopAudio(send.mock.calls[0]![0]!).seq).toBe(1);audio.stop();expect(f!.pipe.destroyed).toBe(true);expect(write).toHaveBeenLastCalledWith({type:"native_audio",id,enabled:false});}finally{audio.stop();}
});
it("uses the Windows microphone client PID without changing viewer PCM or local ownership",async()=>{
 const write=vi.fn(),send=vi.fn((_m:any)=>true),release=vi.fn();let f:ReturnType<typeof bridge>|undefined;
 const mic=new DesktopMicrophone({bridge:active=>(f=bridge(DESKTOP_MICROPHONE_HELLO,active)).pipe,allowed:()=>true,claim:()=>true,release,write,send});
 try{mic.fromViewer({type:"microphone_start",id});await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.state==="running")).toBe(true);expect(write).toHaveBeenCalledWith({type:"native_microphone",id,enabled:true,pipeName:expect.stringMatching(/^SodaDesktopMicrophone-[a-f0-9]{32}$/),clientPid:4321});
 const bytes=Buffer.alloc(1920,7);mic.fromViewer({type:"microphone_frame",id,seq:1,data:bytes.toString("base64")});await expect.poll(()=>f!.packets.length).toBe(1);expect(f!.packets[0]!.subarray(12)).toEqual(bytes);await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.type==="microphone_ack"&&m.seq===1)).toBe(true);mic.stop();expect(f!.pipe.destroyed).toBe(true);expect(release).toHaveBeenCalledExactlyOnceWith(id);}finally{mic.stop();}
});
it.each(["audio","microphone"] as const)("never enables %s from a descriptor delivered after cancellation",async kind=>{
 const write=vi.fn();let f:ReturnType<typeof bridge>|undefined;
 if(kind==="audio"){const audio=new DesktopNativeAudio({id,synthetic:false,bridge:active=>(f=bridge(DESKTOP_PCM_HELLO,active,true)).pipe,write,send:()=>true,state:()=>{},active:()=>true,videoTimestamp:()=>0});await expect.poll(()=>!!f).toBe(true);audio.stop();f!.resolve(4321);await new Promise(r=>setImmediate(r));}
 else{const mic=new DesktopMicrophone({bridge:active=>(f=bridge(DESKTOP_MICROPHONE_HELLO,active,true)).pipe,write,send:()=>true,allowed:()=>true});mic.fromViewer({type:"microphone_start",id});mic.stop();f!.resolve(4321);await new Promise(r=>setImmediate(r));}
 expect(write.mock.calls.some(([m]:any)=>m.enabled===true)).toBe(false);expect(f!.connect).not.toHaveBeenCalled();expect(f!.pipe.destroyed).toBe(true);
});
it("keeps shared audio alive after the first viewer leaves, until the last consumer releases",async()=>{
 const one={},two={},write=vi.fn();let first=true,f:ReturnType<typeof bridge>|undefined;
 const shared=new DesktopSharedAudio({id,synthetic:false,timestamp:()=>0,active:()=>true,write});
 const hooks=(active:()=>boolean)=>({id,synthetic:false,bridge:(sourceActive:()=>boolean)=>(f=bridge(DESKTOP_PCM_HELLO,sourceActive)).pipe,active,videoTimestamp:()=>0,write,state:vi.fn(),send:()=>true});
 const lease1=shared.attach(one,hooks(()=>first)),lease2=shared.attach(two,hooks(()=>true));
 try{await expect.poll(()=>f?.connect.mock.calls.length).toBe(1);first=false;lease1.stop();expect(f!.pipe.destroyed).toBe(false);lease2.stop();expect(f!.pipe.destroyed).toBe(true);}finally{shared.dispose();}
});
