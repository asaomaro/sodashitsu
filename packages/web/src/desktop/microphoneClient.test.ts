import { afterEach, expect, it, vi } from "vitest";
import { DesktopMicrophoneClient } from "./microphoneClient.js";
afterEach(()=>vi.unstubAllGlobals());
function setup(){
 let finish!:(value:any)=>void,resume:()=>Promise<void>=async()=>{},calls=0;const track={stop:vi.fn(),addEventListener:vi.fn()},nodes:any[]=[],contexts:any[]=[];
 vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(()=>{calls++;return new Promise(resolve=>finish=resolve);})}});
 vi.stubGlobal("AudioContext",class {sampleRate=48000;currentTime=1;destination={};audioWorklet={addModule:vi.fn(async()=>{})};close=vi.fn(async()=>{});resume=vi.fn(()=>resume());createMediaStreamSource=vi.fn(()=>({connect:vi.fn(),disconnect:vi.fn()}));constructor(){contexts.push(this);}});
 vi.stubGlobal("AudioWorkletNode",class {port={onmessage:undefined as any,postMessage:vi.fn()};connect=vi.fn();disconnect=vi.fn();constructor(){nodes.push(this);}});
 const send=vi.fn((_v:any)=>true),state=vi.fn(),client=new DesktopMicrophoneClient(send,state);
 return {client,send,state,track,nodes,contexts,calls:()=>calls,finish:()=>finish({getTracks:()=>[track]}),resume:(fn:()=>Promise<void>)=>resume=fn};
}
it("never captures until explicitly started, and stops a late getUserMedia result after close",async()=>{
 const f=setup();expect(f.calls()).toBe(0);const start=f.client.start();f.client.stop();f.finish();await start;expect(f.track.stop).toHaveBeenCalledOnce();expect(f.send).not.toHaveBeenCalled();expect(f.contexts).toHaveLength(0);
});
it("a late AudioContext resume cannot start transfer after stop",async()=>{
 const f=setup();let resume!:()=>void;f.resume(()=>new Promise<void>(resolve=>resume=resolve));const start=f.client.start();f.finish();await vi.waitFor(()=>expect(f.contexts[0]?.resume).toHaveBeenCalled());f.client.stop();resume();await start;expect(f.track.stop).toHaveBeenCalledOnce();expect(f.contexts[0].close).toHaveBeenCalledOnce();expect(f.send).not.toHaveBeenCalled();
});
it("bounds unacknowledged fresh frames across network RTT and stops capture on B failure",async()=>{
 const f=setup();const start=f.client.start();f.finish();await start;const id=f.send.mock.calls[0]![0].id;f.client.receive({type:"microphone_status",id,state:"running"});
 const frame=(at=1)=>f.nodes[0].port.onmessage({data:{pcm:new ArrayBuffer(1920),at}});
 frame(0);expect(f.send).toHaveBeenCalledTimes(1);for(let i=0;i<13;i++)frame();expect(f.send).toHaveBeenCalledTimes(13);expect(f.send.mock.calls[1]![0]).toMatchObject({type:"microphone_frame",seq:1});
 f.client.receive({type:"microphone_ack",id,seq:12});frame();expect(f.send).toHaveBeenCalledTimes(14);f.client.receive({type:"microphone_status",id,state:"unavailable"});expect(f.track.stop).toHaveBeenCalledOnce();expect(f.state).toHaveBeenLastCalledWith("unavailable");f.client.stop();
});
