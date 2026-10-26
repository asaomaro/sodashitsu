import {afterEach,expect,it,vi} from "vitest";
import {performance} from "node:perf_hooks";
const peers=vi.hoisted(()=>[] as any[]);
vi.mock("./DesktopNativeDatagrams.js",()=>({DesktopNativeDatagrams:class{
 readonly send=vi.fn(()=>true);readonly close=vi.fn();readonly signal=vi.fn(async()=>{});
 constructor(readonly hooks:any){peers.push(this);}
}}));
import {DesktopNativeVideo} from "./DesktopNativeVideo.js";
afterEach(()=>{vi.restoreAllMocks();peers.length=0;});
function setup(){
 let now=1000;vi.spyOn(performance,"now").mockImplementation(()=>now);
 const send=vi.fn((_m:any)=>true),write=vi.fn((_m:any)=>{}),policy=vi.fn();
 const video=new DesktopNativeVideo({enabled:true,datagrams:true,window:3,iceServers:[],width:1280,sourceWidth:1280,sourceHeight:800,fps:30,send,write,policy,buffered:()=>0});
 video.fromViewer({type:"media",enabled:true,settings:{transport:"native",udp:true,maxBitrateKbps:2500}});
 const peer=peers.at(-1)!,id=peer.hooks.id as string;
 const frame=(seq=1)=>({type:"native_frame",id,seq,width:1280,height:800,timestamp:seq*33333,key:seq===1,...(seq===1?{codec:"avc1.42041f"}:{}),data:Buffer.from([0,0,0,1,seq===1?0x65:0x41,1,2]).toString("base64")});
 const ack=(seq:number,dropped=false)=>({type:"native_video_ack",id,generation:1,seq,...(dropped?{dropped:true}: {})});
 return {video,peer,id,frame,ack,send,write,policy,time:(v:number)=>now=v};
}
it("does not start capture before both channels are ready and sends notices without WSS payloads",()=>{
 const f=setup();expect(f.write).not.toHaveBeenCalled();expect(f.peer.hooks.iceServers).toEqual([]);f.peer.hooks.ready();
 expect(f.write).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({type:"native_video",enabled:true,id:f.id}));
 for(let seq=1;seq<=3;seq++)f.video.fromHelper(f.frame(seq));expect(f.peer.send).toHaveBeenCalledTimes(3);
 expect(f.send.mock.calls.map(([m])=>m).filter(m=>m instanceof Uint8Array)).toHaveLength(0);
 expect(f.send.mock.calls.filter(([m])=>m.type==="native_frame_notice")).toHaveLength(3);f.video.stop();expect(f.peer.close).toHaveBeenCalledOnce();
});
it("ignores parent ACKs and releases dropped credit without renewing draw freshness on either delayed or duplicate ACK",()=>{
 const f=setup();f.peer.hooks.ready();f.video.fromHelper(f.frame());f.video.fromViewer(f.ack(1));expect(f.video.hasFreshDraw()).toBe(false);
 expect(()=>f.peer.hooks.ack(f.ack(2))).toThrow("order");f.peer.hooks.ack(f.ack(1,true));expect(f.video.hasFreshDraw()).toBe(false);
 expect(f.send).toHaveBeenCalledWith(expect.objectContaining({type:"native_draw_ack",seq:1,dropped:true}));expect(f.write).toHaveBeenCalledWith({type:"native_video_ack",id:f.id,seq:1});
 f.video.fromHelper(f.frame(2));f.peer.hooks.ack(f.ack(2));expect(f.video.hasFreshDraw()).toBe(true);
 f.time(3001);f.video.fromHelper(f.frame(3));f.peer.hooks.ack(f.ack(3,true));expect(f.video.hasFreshDraw()).toBe(false);f.peer.hooks.ack(f.ack(2));expect(f.video.hasFreshDraw()).toBe(false);f.video.stop();
});
it.each([false,true])("restarts a fresh WSS stream at most once after peer failure, encoder started=%s",started=>{
 const f=setup();if(started){f.peer.hooks.ready();f.video.fromHelper(f.frame());}f.peer.hooks.fail();
 const statuses=f.send.mock.calls.map(([m])=>m).filter(m=>m.type==="media_status"&&m.state==="negotiating");expect(statuses).toHaveLength(2);expect(statuses[1].id).not.toBe(f.id);expect(statuses[1]).not.toHaveProperty("datagrams");expect(peers).toHaveLength(1);expect(f.video.hasFreshDraw()).toBe(false);
 expect(f.send.mock.calls.some(([m])=>m.type==="native_transport_reset")).toBe(started);
 expect(f.write.mock.calls.some(([m])=>m.type==="release")).toBe(started);
 expect(f.video.fromViewer({type:"media_fallback",id:f.id})).toBe(true);expect(f.video.fromViewer({type:"rtc_signal",id:f.id})).toBe(true);expect(statuses).toHaveLength(2);
 const id=statuses[1].id;f.video.fromHelper({...f.frame(),id});expect(()=>f.video.fromViewer({...f.ack(1,true),id})).toThrow("Dropped ACK");f.video.stop();
});
it("adapts bitrate from its own ACK ages and bounds it by the user's ceiling",()=>{
 const f=setup();f.peer.hooks.ready();for(let seq=1;seq<=8;seq++){f.time(1000+seq*200);f.video.fromHelper(f.frame(seq));f.time(1200+seq*200);f.peer.hooks.ack(f.ack(seq));}
 expect(f.write).toHaveBeenCalledWith({type:"native_bitrate",id:f.id,kbps:2000});
 f.peer.hooks.keyframe();expect(f.write).toHaveBeenCalledWith({type:"native_keyframe",id:f.id});f.video.stop();
});
it("cancels a pending peer on stop without releasing keys or starting an encoder",()=>{
 const f=setup();f.video.stop();expect(f.write).not.toHaveBeenCalled();expect(f.peer.close).toHaveBeenCalledOnce();f.peer.hooks.ready();f.peer.hooks.fail();expect(f.write).not.toHaveBeenCalled();
});
