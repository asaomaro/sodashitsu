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

it("does not open a recording device after a delayed codec probe is cancelled",async()=>{
 const f=setup();let resolve!:(v:any)=>void;vi.stubGlobal("AudioEncoder",{isConfigSupported:()=>new Promise(done=>resolve=done)});vi.stubGlobal("AudioData",class{});const client=new DesktopMicrophoneClient(f.send,f.state,{opus:true});const starting=client.start();client.stop();resolve({supported:true});await starting;expect(f.calls()).toBe(0);expect(f.send).not.toHaveBeenCalled();
});
function opusSetup(){
 const f=setup(),encoders:any[]=[];let configure=()=>{};
 vi.stubGlobal("AudioData",class{timestamp:number;close=vi.fn();constructor(config:any){this.timestamp=config.timestamp;}});
 vi.stubGlobal("AudioEncoder",class{static isConfigSupported=async()=>({supported:true});state="configured";encodeQueueSize=0;configure=vi.fn(()=>configure());encode=vi.fn(()=>{this.encodeQueueSize++;});close=vi.fn(()=>{this.state="closed";});constructor(public init:any){encoders.push(this);}});
 const client=new DesktopMicrophoneClient(f.send,f.state,{opus:true});
 return {...f,client,encoders,configure:(fn:()=>void)=>{configure=fn;},frame:()=>f.nodes[0].port.onmessage({data:{pcm:new ArrayBuffer(1920),at:1}}),output:(encoder:any,timestamp:number)=>{encoder.encodeQueueSize=0;encoder.init.output({timestamp,duration:20000,byteLength:2,copyTo:(bytes:Uint8Array)=>bytes.set([1,2])});},running:async()=>{const starting=client.start();await vi.advanceTimersByTimeAsync(0);f.finish();await starting;const id=f.send.mock.calls[0]![0].id;client.receive({type:"microphone_status",id,state:"running"});return id;}};
}
it("drops stalled Opus frames and recovers twice without reacquiring the device or replaying the handshake",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{
  await f.running();for(let cycle=0;cycle<3;cycle++){
   for(let i=0;i<10;i++)f.frame();expect(f.encoders[cycle].encode).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(201);
   if(cycle<2){expect(f.track.stop).not.toHaveBeenCalled();expect(f.state).toHaveBeenLastCalledWith("running");expect(f.encoders).toHaveLength(cycle+2);}
  }
  expect(f.track.stop).toHaveBeenCalledOnce();expect(f.encoders.every(e=>e.close.mock.calls.length===1)).toBe(true);expect(f.state).toHaveBeenLastCalledWith("unavailable");expect(f.calls()).toBe(1);expect(f.send.mock.calls.filter(([m])=>m.type==="microphone_start")).toHaveLength(1);expect(f.send.mock.calls.filter(([m])=>m.type==="microphone_opus")).toHaveLength(0);
 }finally{f.client.stop();vi.useRealTimers();}
});
it("ignores late errors and matching timestamps from a retired encoder while sending only fresh replacement output",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{await f.running();f.frame();f.frame();const old=f.encoders[0];await vi.advanceTimersByTimeAsync(201);f.frame();old.init.error(Error("retired generated codec"));f.output(old,60000);expect(f.track.stop).not.toHaveBeenCalled();expect(f.send.mock.calls.filter(([m])=>m.type==="microphone_opus")).toHaveLength(0);f.output(f.encoders[1],60000);expect(f.send).toHaveBeenCalledWith(expect.objectContaining({type:"microphone_opus",seq:3}));expect(f.calls()).toBe(1);}finally{f.client.stop();vi.useRealTimers();}
});
it("does not renew an earlier network ACK deadline when a later encoder stalls",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{await f.running();f.frame();f.output(f.encoders[0],20000);await vi.advanceTimersByTimeAsync(150);f.frame();await vi.advanceTimersByTimeAsync(201);expect(f.encoders).toHaveLength(2);await vi.advanceTimersByTimeAsync(148);expect(f.track.stop).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);expect(f.track.stop).toHaveBeenCalledOnce();expect(f.state).toHaveBeenLastCalledWith("unavailable");}finally{f.client.stop();vi.useRealTimers();}
});
it("cannot recreate an encoder after a synchronous cancellation while retiring the stalled encoder",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{await f.running();f.encoders[0].close.mockImplementation(()=>{f.encoders[0].state="closed";f.client.stop();});f.frame();await vi.advanceTimersByTimeAsync(201);expect(f.encoders).toHaveLength(1);expect(f.track.stop).toHaveBeenCalledOnce();expect(f.calls()).toBe(1);expect(f.state).toHaveBeenLastCalledWith("stopped");}finally{f.client.stop();vi.useRealTimers();}
});
it("still stops on a fatal current encoder error rather than silently reacquiring permission",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{await f.running();f.encoders[0].init.error(Error("current generated codec"));expect(f.track.stop).toHaveBeenCalledOnce();expect(f.encoders).toHaveLength(1);expect(f.calls()).toBe(1);expect(f.state).toHaveBeenLastCalledWith("unavailable");}finally{f.client.stop();vi.useRealTimers();}
});

it("rechecks the original ACK deadline after retiring an encoder even before the timer runs",async()=>{
 vi.useFakeTimers();const f=opusSetup();let clock:ReturnType<typeof vi.spyOn>|undefined;
 try{await f.running();const born=performance.now();f.frame();f.output(f.encoders[0],20000);f.frame();f.encoders[0].close.mockImplementation(()=>{f.encoders[0].state="closed";clock=vi.spyOn(performance,"now").mockReturnValue(born+500);});await vi.advanceTimersByTimeAsync(201);expect(f.encoders).toHaveLength(1);expect(f.track.stop).toHaveBeenCalledOnce();expect(f.state).toHaveBeenLastCalledWith("unavailable");}
 finally{clock?.mockRestore();f.client.stop();vi.useRealTimers();}
});
it("does not encode or transmit fresh samples if ACK expiry occurs during replacement configuration",async()=>{
 vi.useFakeTimers();const f=opusSetup();let clock:ReturnType<typeof vi.spyOn>|undefined;
 try{await f.running();const born=performance.now();f.frame();f.output(f.encoders[0],20000);f.frame();f.configure(()=>{clock=vi.spyOn(performance,"now").mockReturnValue(born+500);f.frame();});await vi.advanceTimersByTimeAsync(201);expect(f.encoders).toHaveLength(2);expect(f.encoders[1].encode).not.toHaveBeenCalled();expect(f.encoders[1].close).toHaveBeenCalledOnce();expect(f.send.mock.calls.filter(([m])=>m.type==="microphone_opus")).toHaveLength(1);expect(f.track.stop).toHaveBeenCalledOnce();}
 finally{clock?.mockRestore();f.client.stop();vi.useRealTimers();}
});
it("checks ACK expiry after replacement configuration even without another callback or timer",async()=>{
 vi.useFakeTimers();const f=opusSetup();let clock:ReturnType<typeof vi.spyOn>|undefined;
 try{await f.running();const born=performance.now();f.frame();f.output(f.encoders[0],20000);f.frame();f.configure(()=>{clock=vi.spyOn(performance,"now").mockReturnValue(born+500);});await vi.advanceTimersByTimeAsync(200);expect(f.encoders).toHaveLength(2);expect(f.encoders[1].close).toHaveBeenCalledOnce();expect(f.track.stop).toHaveBeenCalledOnce();expect(f.state).toHaveBeenLastCalledWith("unavailable");}
 finally{clock?.mockRestore();f.client.stop();vi.useRealTimers();}
});
it("still drops Opus output older than100ms without replay or terminating a healthy codec",async()=>{
 vi.useFakeTimers();const f=opusSetup();try{await f.running();f.frame();await vi.advanceTimersByTimeAsync(101);f.output(f.encoders[0],20000);expect(f.send.mock.calls.filter(([m])=>m.type==="microphone_opus")).toHaveLength(0);expect(f.track.stop).not.toHaveBeenCalled();f.frame();f.output(f.encoders[0],40000);expect(f.send).toHaveBeenCalledWith(expect.objectContaining({type:"microphone_opus",seq:2}));}finally{f.client.stop();vi.useRealTimers();}
});
