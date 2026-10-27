import { createServer, type Socket } from "node:net";
import { rm, chmod } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { DESKTOP_MICROPHONE_HELLO } from "@sodashitsu/protocol";
import { DesktopMicrophone } from "./DesktopMicrophone.js";
const id="22222222-2222-4222-8222-222222222222";
function tone(){const pcm=Buffer.alloc(1920);for(let i=0;i<960;i++)pcm.writeInt16LE(Math.round(Math.sin(i*Math.PI*2*440/48000)*12000),i*2);return pcm;}
it.skipIf(process.platform==="win32")("delivers fixed generated PCM only after the private handshake, ACKs it and closes on ownership loss",async()=>{
 let allowed=true,path="",client:Socket|undefined;const chunks:Buffer[]=[],send=vi.fn((_m:unknown)=>true),write=vi.fn();
 const server=createServer(socket=>{client=socket;socket.on("error",()=>{});socket.on("data",bytes=>chunks.push(Buffer.from(bytes)));socket.write(DESKTOP_MICROPHONE_HELLO.subarray(0,5));socket.write(DESKTOP_MICROPHONE_HELLO.subarray(5));});
 const mic=new DesktopMicrophone({synthetic:true,allowed:()=>allowed,send,write:raw=>{write(raw);const m=raw as any;if(m.enabled){path=m.pipePath;server.listen(path,()=>void chmod(path,0o600));}}});
 try {
  mic.fromViewer({type:"microphone_start",id});await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.state==="running")).toBe(true);
  const pcm=tone();mic.fromViewer({type:"microphone_frame",id,seq:1,data:pcm.toString("base64")});await expect.poll(()=>Buffer.concat(chunks).length).toBe(1932);
  const packet=Buffer.concat(chunks);expect(packet.readUInt32LE()).toBe(1);expect(packet.readDoubleLE(4)).toBeGreaterThan(Date.now()-100);expect(packet.subarray(12)).toEqual(pcm);expect(send).toHaveBeenCalledWith({type:"microphone_ack",id,seq:1});
  allowed=false;mic.fromViewer({type:"microphone_frame",id,seq:2,data:pcm.toString("base64")});await expect.poll(()=>client?.destroyed).toBe(true);expect(send).toHaveBeenCalledWith({type:"microphone_status",id,state:"unavailable"});expect(write).toHaveBeenCalledWith({type:"native_microphone",id,enabled:false});expect(Buffer.concat(chunks)).toHaveLength(1932);
 }finally{mic.stop();client?.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));if(path)await rm(path,{force:true});}
});
it("never opens a pipe without local permission, and a stopped owner cannot restart",()=>{
 const write=vi.fn(),send=vi.fn((_m:unknown)=>true),mic=new DesktopMicrophone({synthetic:true,allowed:()=>false,write,send});
 mic.fromViewer({type:"microphone_start",id});expect(write).not.toHaveBeenCalled();expect(send).toHaveBeenCalledWith({type:"microphone_status",id,state:"unavailable"});mic.stop();mic.fromViewer({type:"microphone_start",id});expect(write).not.toHaveBeenCalled();
});
it("rejects arbitrary formats, endpoints, sizes and commands before touching the helper",()=>{
 const write=vi.fn(),mic=new DesktopMicrophone({synthetic:true,allowed:()=>true,write,send:()=>true});
 for(const m of [{type:"microphone_start",id,endpoint:"speaker"},{type:"microphone_frame",id,seq:0,data:tone().toString("base64")},{type:"microphone_frame",id,seq:1,data:"AAAA"},{type:"microphone_frame",id,seq:1,data:tone().toString("base64"),sampleRate:192000}])expect(()=>mic.fromViewer(m)).toThrow();expect(write).not.toHaveBeenCalled();mic.stop();
});
it.skipIf(process.platform==="win32")("coalesces a burst behind a pipe write to the latest frame without stopping the stream",async()=>{
 let path="",client:Socket|undefined;const chunks:Buffer[]=[],send=vi.fn((_m:unknown)=>true);
 const server=createServer(socket=>{client=socket;socket.on("error",()=>{});socket.on("data",bytes=>chunks.push(Buffer.from(bytes)));socket.write(DESKTOP_MICROPHONE_HELLO);});
 const mic=new DesktopMicrophone({synthetic:true,allowed:()=>true,send,write:raw=>{const m=raw as any;if(m.enabled){path=m.pipePath;server.listen(path,()=>void chmod(path,0o600));}}});
 try{mic.fromViewer({type:"microphone_start",id});await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.state==="running")).toBe(true);
 for(let seq=1;seq<=6;seq++)mic.fromViewer({type:"microphone_frame",id,seq,data:tone().toString("base64")});
 await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.type==="microphone_ack"&&m.seq===6)).toBe(true);await expect.poll(()=>Buffer.concat(chunks).length).toBe(1932*2);const packet=Buffer.concat(chunks);expect(packet.readUInt32LE()).toBe(1);expect(packet.readUInt32LE(1932)).toBe(6);expect(send.mock.calls.some(([m]:any)=>m.state==="unavailable")).toBe(false);
 }finally{mic.stop();client?.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));if(path)await rm(path,{force:true});}
});

it("refuses an unnegotiated Opus start before opening any helper pipe",()=>{
 const write=vi.fn(),send=vi.fn((_m:unknown)=>true),mic=new DesktopMicrophone({synthetic:true,allowed:()=>true,write,send});mic.fromViewer({type:"microphone_start",id,codec:"opus"});expect(write).not.toHaveBeenCalled();expect(send).toHaveBeenCalledWith({type:"microphone_status",id,state:"unavailable"});mic.stop();
});
for(const mode of["tone","oversize-duration","mixed-pcm"]as const)it.skipIf(process.platform==="win32")(`decodes generated Opus only into the fixed private PCM sink: ${mode}`,async()=>{
 const{default:Opus}=await import("opusscript"),encoder=new Opus(48000,1,Opus.Application.VOIP);encoder.encoderCTL(4002,32000);
 let path="",client:Socket|undefined;const chunks:Buffer[]=[],send=vi.fn((_m:unknown)=>true),server=createServer(socket=>{client=socket;socket.on("error",()=>{});socket.on("data",bytes=>chunks.push(Buffer.from(bytes)));socket.write(DESKTOP_MICROPHONE_HELLO);});
 const mic=new DesktopMicrophone({synthetic:true,allowOpus:true,allowed:()=>true,send,write:raw=>{const m=raw as any;if(m.enabled){path=m.pipePath;server.listen(path,()=>void chmod(path,0o600));}}});
 try{mic.fromViewer({type:"microphone_start",id,codec:"opus"});await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.state==="running")).toBe(true);
 const pcm=mode==="oversize-duration"?Buffer.concat([tone(),tone(),tone()]):tone(),packet=encoder.encode(pcm,pcm.length/2);expect(packet.length).toBeLessThan(384);
 mic.fromViewer(mode==="mixed-pcm"?{type:"microphone_frame",id,seq:1,data:tone().toString("base64")}:{type:"microphone_opus",id,seq:1,data:packet.toString("base64")});
 if(mode!=="tone"){await expect.poll(()=>send.mock.calls.some(([m]:any)=>m.state==="unavailable")).toBe(true);expect(chunks).toEqual([]);}else{await expect.poll(()=>Buffer.concat(chunks).length).toBe(1932);const bytes=Buffer.concat(chunks).subarray(12);let energy=0;for(let i=0;i<960;i++)energy+=bytes.readInt16LE(i*2)**2;expect(Math.sqrt(energy/960)).toBeGreaterThan(1000);expect(send).toHaveBeenCalledWith({type:"microphone_ack",id,seq:1});}
 }finally{mic.stop();encoder.delete();client?.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));if(path)await rm(path,{force:true});}
});
it("rejects a busy shared microphone before allocating a pipe",()=>{
 const write=vi.fn(),claim=vi.fn(()=>false),release=vi.fn(),send=vi.fn(()=>true),mic=new DesktopMicrophone({synthetic:true,allowed:()=>true,write,send,claim,release});mic.fromViewer({type:"microphone_start",id});expect(claim).toHaveBeenCalledWith(id);expect(write).not.toHaveBeenCalled();expect(release).not.toHaveBeenCalled();expect(send).toHaveBeenCalledWith({type:"microphone_status",id,state:"unavailable"});mic.stop();
});
