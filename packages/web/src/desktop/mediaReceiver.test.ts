import { expect, it, vi } from "vitest";
import { DesktopMediaReceiver, ImageQualityController } from "./mediaReceiver.js";
it("reduces quality under delayed ACKs and restores slowly within requested ceilings", () => {
  const controller = new ImageQualityController({ fps: 10, quality: 65 });
  expect(controller.sample(500, 0, 0, 2000)).toEqual({ type: "quality", fps: 7, quality: 55 });
  expect(controller.sample(0, 0, 0, 2500)).toBeUndefined();
  controller.sample(0, 0, 0, 4000);
  controller.sample(0, 0, 0, 6000);
  expect(controller.sample(0, 0, 0, 8000)).toEqual({ type: "quality", fps: 8, quality: 60 });
  for (let now = 10000; now < 60000; now += 2000) {
    const next = controller.sample(1000, 0, 1e6, now);
    if (next) {
      expect(next.fps).toBeGreaterThanOrEqual(1);
      expect(next.quality).toBeGreaterThanOrEqual(35);
    }
  }
});

it.each([false,true])("expires a frozen video using a fresh WSS fallback for datagrams=%s", async udp => {
  vi.useFakeTimers();
  let tick!: () => void;
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      close() {}
    },
  );
  Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", {
    configurable: true,
    value: vi.fn((callback) => {
      tick = () => callback(0, {} as VideoFrameCallbackMetadata);
      return 1;
    }),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "cancelVideoFrameCallback", {
    configurable: true,
    value: vi.fn(),
  });
  const state = vi.fn(),
    send = vi.fn(),
    draw = vi.fn();
  const receiver = new DesktopMediaReceiver("test", send, draw, state,[],udp);
  try {
    Object.defineProperty(receiver.video, "readyState", { value: 2 });
    await vi.advanceTimersByTimeAsync(10);
    tick();
    expect(receiver.active).toBe(true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(receiver.active).toBe(false);
    if(udp){expect(send).toHaveBeenCalledWith({type:"media_fallback",id:"test"});expect(send).not.toHaveBeenCalledWith({type:"media",enabled:false});expect(state).not.toHaveBeenCalledWith("images");}
    else{expect(send).toHaveBeenCalledWith({ type: "media", enabled: false });expect(state).toHaveBeenCalledWith("images");}
  } finally {
    receiver.stop();
    delete (HTMLVideoElement.prototype as any).requestVideoFrameCallback;
    delete (HTMLVideoElement.prototype as any).cancelVideoFrameCallback;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it("ignores late native notices and chunks after peer close, before the fresh WSS stream arrives",async()=>{
 vi.stubGlobal("RTCPeerConnection",class{close(){}});
 Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:()=>1});
 Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:()=>{}});
 const id="22222222-2222-4222-8222-222222222222",send=vi.fn(),state=vi.fn(),receiver=new DesktopMediaReceiver(id,send,()=>{},state,[],true);
 try{
  receiver.nativeStream(1,"avc1.42041f",640,360,3,true);receiver.stop();
  expect(()=>receiver.notice({type:"native_frame_notice",id,generation:1,seq:1,bytes:100})).not.toThrow();
  expect(()=>receiver.chunk(new Uint8Array())).not.toThrow();
  await Promise.resolve();expect(send).not.toHaveBeenCalled();expect(state).not.toHaveBeenCalled();
 }finally{receiver.stop();delete(HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete(HTMLVideoElement.prototype as any).cancelVideoFrameCallback;vi.unstubAllGlobals();}
});

for(const phase of ["remote","candidate","answer","local"] as const)it.each([false,true])(`ignores retired peer ${phase} completion/rejection, reject=%s`,async rejected=>{
 let resume!:(value:any)=>void,fail!:(reason:Error)=>void,entered!:()=>void;
 const gate=new Promise<any>((resolve,reject)=>{resume=resolve;fail=reject;}),started=new Promise<void>(resolve=>entered=resolve),calls:string[]=[];
 const step=(name:string,value:any)=>{calls.push(name);if(name===phase){entered();return gate;}return Promise.resolve(value);};
 vi.stubGlobal("RTCPeerConnection",class{
  remoteDescription=phase==="candidate"?{}:null;localDescription={sdp:"generated"};
  setRemoteDescription(){return step("remote",undefined);}addIceCandidate(){return step("candidate",undefined);}createAnswer(){return step("answer",{type:"answer",sdp:"generated"});}setLocalDescription(){return step("local",undefined);}close(){calls.push("close");}
 });
 Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:()=>1});Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:()=>{}});
 const send=vi.fn(),receiver=new DesktopMediaReceiver("test",send,()=>{},()=>{});
 try{
  const pending=receiver.signal(phase==="candidate"?{kind:"candidate",candidate:{candidate:"generated"}}:{kind:"offer",sdp:"generated"});await started;receiver.stop();
  if(rejected)fail(Error("retired transport"));else resume({type:"answer",sdp:"generated"});
  await expect(pending).resolves.toBeUndefined();expect(calls.at(-1)).toBe("close");expect(send).not.toHaveBeenCalled();
 }finally{receiver.stop();delete(HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete(HTMLVideoElement.prototype as any).cancelVideoFrameCallback;vi.unstubAllGlobals();}
});
it("falls back from a live UDP signaling error without rejecting the parent message handler",async()=>{
 vi.stubGlobal("RTCPeerConnection",class{close(){}async setRemoteDescription(){throw Error("unusable SDP");}});
 Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:()=>1});Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:()=>{}});
 const send=vi.fn(),receiver=new DesktopMediaReceiver("test",send,()=>{},()=>{},[],true);
 try{await expect(receiver.signal({kind:"offer",sdp:"generated"})).resolves.toBeUndefined();expect(send).toHaveBeenCalledExactlyOnceWith({type:"media_fallback",id:"test"});}
 finally{receiver.stop();delete(HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete(HTMLVideoElement.prototype as any).cancelVideoFrameCallback;vi.unstubAllGlobals();}
});

it("isolates malformed audio on WSS from video and ignores audio after stop",()=>{
 vi.stubGlobal("RTCPeerConnection",class{close(){}});Object.defineProperty(HTMLVideoElement.prototype,"requestVideoFrameCallback",{configurable:true,value:()=>1});Object.defineProperty(HTMLVideoElement.prototype,"cancelVideoFrameCallback",{configurable:true,value:()=>{}});
 const send=vi.fn(),state=vi.fn(),audioState=vi.fn(),id="22222222-2222-4222-8222-222222222222",receiver=new DesktopMediaReceiver(id,send,()=>{},state,[],false,true,audioState),audio={push:vi.fn(()=>{throw Error("bad audio packet");}),stop:vi.fn()};
 try{(receiver as any).audio=audio;expect(()=>receiver.audioChunk(new Uint8Array([1]))).not.toThrow();expect(audioState).toHaveBeenCalledWith("unavailable");expect(send).toHaveBeenCalledExactlyOnceWith({type:"native_audio_control",id,enabled:false});expect(state).not.toHaveBeenCalled();expect((receiver as any).stopped).toBe(false);receiver.stop();expect(()=>receiver.audioChunk(new Uint8Array())).not.toThrow();}finally{receiver.stop();delete(HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete(HTMLVideoElement.prototype as any).cancelVideoFrameCallback;vi.unstubAllGlobals();}
});

it('waits up to three seconds for a new decoder format without accepting retired decoder callbacks',async()=>{
 vi.useFakeTimers();const now=vi.spyOn(performance,'now').mockReturnValue(1000);
 const decoders:VideoDecoderInit[]=[];let resolve!:()=>void;
 vi.stubGlobal('VideoDecoder',class{state='configured';static async isConfigSupported(config:VideoDecoderConfig){if(config.codedWidth===960)await new Promise<void>(r=>resolve=r);return {supported:true};}constructor(init:VideoDecoderInit){decoders.push(init);}configure(){}decode(){}close(){this.state='closed';}});
 vi.stubGlobal('EncodedVideoChunk',class{});
 vi.stubGlobal('RTCPeerConnection',class{close(){}});
 Object.defineProperty(HTMLVideoElement.prototype,'requestVideoFrameCallback',{configurable:true,value:()=>1});Object.defineProperty(HTMLVideoElement.prototype,'cancelVideoFrameCallback',{configurable:true,value:()=>{}});
 const id='22222222-2222-4222-8222-222222222222',send=vi.fn(),state=vi.fn(),draw=vi.fn(),receiver=new DesktopMediaReceiver(id,send,draw,state);
 try{
  receiver.nativeStream(1,'avc1.42041f',1280,800,3);await Promise.resolve();
  const {encodeDesktopMediaChunk,encodeDesktopH264Packet}=await import('@sodashitsu/protocol');
  receiver.chunk(encodeDesktopMediaChunk(1,1,encodeDesktopH264Packet(1000,true,new Uint8Array([1,2]))));
  decoders[0]!.output({timestamp:1000,displayWidth:1280,displayHeight:800,close(){}} as VideoFrame);
  receiver.profilePending({type:'native_profile_pending',id,generation:2});receiver.nativeStream(2,'avc1.420420',960,600,3,false,1);
  now.mockReturnValue(3500);await vi.advanceTimersByTimeAsync(500);expect(state).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalledWith(expect.objectContaining({type:'native_format_ack'}));
  decoders[0]!.error(new DOMException('retired decoder'));expect(state).not.toHaveBeenCalled();
  resolve();await Promise.resolve();await Promise.resolve();expect(send).toHaveBeenCalledWith({type:'native_format_ack',id,generation:2,baseSeq:1});
  now.mockReturnValue(4100);await vi.advanceTimersByTimeAsync(500);expect(state).toHaveBeenCalledWith('images');
 }finally{receiver.stop();now.mockRestore();vi.useRealTimers();vi.unstubAllGlobals();delete(HTMLVideoElement.prototype as any).requestVideoFrameCallback;delete(HTMLVideoElement.prototype as any).cancelVideoFrameCallback;}
});
