import {createServer,type Socket} from "node:net";
import {mkdtemp,rm,chmod} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {expect,it,vi} from "vitest";
import {DESKTOP_PCM_HELLO,DESKTOP_PCM_BYTES,decodeDesktopAudio} from "@sodashitsu/protocol";
import {DesktopNativeAudio} from "./DesktopNativeAudio.js";
function pcm(seq:number){const bytes=Buffer.alloc(16+DESKTOP_PCM_BYTES);bytes.writeUInt32LE(DESKTOP_PCM_BYTES);bytes.writeUInt32LE(seq,4);bytes.writeBigUInt64LE(BigInt(seq*20000),8);for(let i=0;i<960;i++){const v=Math.round(Math.sin((i+(seq-1)*960)*Math.PI*2*440/48000)*12000);bytes.writeInt16LE(v,16+i*4);bytes.writeInt16LE(v,18+i*4);}return bytes;}
it.skipIf(process.platform==="win32")("encodes only the latest two private PCM frames and disposes codec/socket on stop",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-audio-test-")),path=join(dir,"generated.sock"),clients=new Set<Socket>();
 const server=createServer(socket=>{clients.add(socket);socket.on("close",()=>clients.delete(socket));socket.on("error",()=>{});socket.write(Buffer.concat([DESKTOP_PCM_HELLO,pcm(1),pcm(2),pcm(3)]));});await new Promise<void>(resolve=>server.listen(path,resolve));await chmod(path,0o600);
 const write=vi.fn((_m:any)=>{}),send=vi.fn((_bytes:Uint8Array)=>true),state=vi.fn();
 // The helper request names a private socket; this generated test substitutes
 // that socket before connect, without calling a Windows audio device API.
 const audio=new DesktopNativeAudio({id:"22222222-2222-4222-8222-222222222222",synthetic:true,write:m=>{const v=m as any;write(v);if(v.enabled){const old=(audio as any).connect;(audio as any).connect=()=>old.call(audio,path);}},send,state,active:()=>true,videoTimestamp:()=>0});
 try{
  await expect.poll(()=>send.mock.calls.length,{timeout:5000}).toBe(2);expect(state).toHaveBeenCalledWith("running");const frames=send.mock.calls.map(([bytes])=>decodeDesktopAudio(bytes));expect(frames.map(f=>f.seq)).toEqual([2,3]);expect(frames.every(f=>f.data.length<DESKTOP_PCM_BYTES)).toBe(true);
  const {default:Opus}=await import("opusscript"),decoder=new Opus(48000,2,Opus.Application.AUDIO);try{const decoded=decoder.decode(Buffer.from(frames[1]!.data));let energy=0;for(let p=0;p<decoded.length;p+=2)energy+=decoded.readInt16LE(p)**2;expect(Math.sqrt(energy/(decoded.length/2))).toBeGreaterThan(1000);}finally{decoder.delete();}
  audio.stop();expect(write).toHaveBeenCalledWith(expect.objectContaining({type:"native_audio",enabled:false}));expect((audio as any).pending).toHaveLength(0);expect((audio as any).encoder).toBeUndefined();
 }finally{audio.stop();for(const client of clients)client.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
it("never requests capture when stopped while the optional codec import is pending",async()=>{
 const write=vi.fn(),audio=new DesktopNativeAudio({id:"22222222-2222-4222-8222-222222222222",synthetic:true,write,send:()=>true,state:()=>{},active:()=>true,videoTimestamp:()=>0});audio.stop();await import("opusscript");await Promise.resolve();expect(write).not.toHaveBeenCalled();
});

it("does not request a pipe when the owning media is retired during codec import",async()=>{
 let active=true;const write=vi.fn(),audio=new DesktopNativeAudio({id:"22222222-2222-4222-8222-222222222222",synthetic:true,write,send:()=>true,state:()=>{},active:()=>active,videoTimestamp:()=>0});active=false;
 try{await import("opusscript");await new Promise<void>(resolve=>setImmediate(resolve));expect(write).not.toHaveBeenCalled();}finally{audio.stop();}
});
