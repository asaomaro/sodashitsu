import {performance} from "node:perf_hooks";
import {DesktopMediaSignal,DesktopNativeVideoAck,DesktopNativeKeyframe,encodeDesktopDatagrams,DESKTOP_VIDEO_CHANNEL,DESKTOP_CONTROL_CHANNEL,type DesktopIceServers} from "@sodashitsu/protocol";
import type {z} from "zod";
import type {RTCPeerConnection,RTCDataChannel} from "werift";
/** Explicit native-media request only. Never accepts OS input over data channels. */
export class DesktopNativeDatagrams {
 private peer:RTCPeerConnection|undefined;private video:RTCDataChannel|undefined;private control:RTCDataChannel|undefined;
 private dead=false;private connected=false;private answered=false;private candidates=0;private lastKey=-Infinity;
 private timeout:ReturnType<typeof setTimeout>;
 constructor(private hooks:{id:string;iceServers:z.infer<typeof DesktopIceServers>;send(value:unknown):boolean;ready():void;ack(value:unknown):void;keyframe():void;fail():void}){
  this.timeout=setTimeout(()=>this.failure(),8000);this.timeout.unref();void this.start().catch(()=>this.failure());
 }
 private async start(){
  const {RTCPeerConnection}=await import("werift");if(this.dead)return;
  // werift otherwise has a public STUN default. Only explicit local config is used.
  const peer=this.peer=new RTCPeerConnection({iceServers:this.hooks.iceServers.map(s=>({urls:s.urls,...(s.username===undefined?{}:{username:s.username}),...(s.credential===undefined?{}:{credential:s.credential})})),iceUseTcp:false});
  const video=this.video=peer.createDataChannel(DESKTOP_VIDEO_CHANNEL,{ordered:false,maxRetransmits:0});
  const control=this.control=peer.createDataChannel(DESKTOP_CONTROL_CHANNEL,{ordered:true});
  const opened=()=>{if(this.dead||this.connected||video.readyState!=="open"||control.readyState!=="open")return;this.connected=true;clearTimeout(this.timeout);this.hooks.ready();};
  video.stateChanged.subscribe(state=>{if(state==="open")opened();else if(state==="closed")this.failure();});
  control.stateChanged.subscribe(state=>{if(state==="open")opened();else if(state==="closed")this.failure();});
  video.onMessage.subscribe(()=>this.failure());
  control.onMessage.subscribe(raw=>{
   if(this.dead)return;
   try{
    if(typeof raw!=="string"||raw.length>512||!this.connected)throw Error("Native control limit");
    const m=JSON.parse(raw);if(m.id!==this.hooks.id)throw Error("Wrong native stream");
    if(m.type==="native_video_ack")this.hooks.ack(DesktopNativeVideoAck.parse(m));
    else{DesktopNativeKeyframe.parse(m);const now=performance.now();if(now-this.lastKey>=250){this.lastKey=now;this.hooks.keyframe();}}
   }catch{this.failure();}
  });
  peer.onDataChannel.subscribe(()=>this.failure());
  peer.connectionStateChange.subscribe(state=>{if(state==="failed"||state==="closed"||state==="disconnected")this.failure();});
  peer.onIceCandidate.subscribe(candidate=>{if(!this.dead&&candidate)this.hooks.send({type:"rtc_signal",id:this.hooks.id,signal:{kind:"candidate",candidate:candidate.toJSON()}});});
  const offer=await peer.createOffer();if(this.dead)return;await peer.setLocalDescription(offer);if(this.dead)return;
  if(!this.hooks.send({type:"rtc_signal",id:this.hooks.id,signal:{kind:"offer",sdp:peer.localDescription!.sdp}}))this.failure();
 }
 async signal(raw:unknown){
  const m=DesktopMediaSignal.parse(raw);if(this.dead||m.id!==this.hooks.id)return;
  const peer=this.peer;if(!peer)throw Error("Native peer not ready");
  if(m.signal.kind==="answer"){
   if(this.answered)throw Error("Duplicate native answer");this.answered=true;await peer.setRemoteDescription({type:"answer",sdp:m.signal.sdp});
  }else if(m.signal.kind==="candidate"){
   if(++this.candidates>64)throw Error("Native ICE candidate limit");const c=m.signal.candidate;await peer.addIceCandidate({candidate:c.candidate,sdpMid:c.sdpMid??null,sdpMLineIndex:c.sdpMLineIndex??null,...(c.usernameFragment==null?{}:{usernameFragment:c.usernameFragment})});
  }else throw Error("Native offer is source-owned");
 }
 send(seq:number,bytes:Uint8Array):boolean{
  const video=this.video;if(this.dead||!this.connected||video?.readyState!=="open"||video.bufferedAmount>256*1024)return false;
  for(const packet of encodeDesktopDatagrams(seq,bytes)){
   if(video.bufferedAmount>768*1024)return false;
   video.send(Buffer.from(packet));
  }
  return true;
 }
 buffered(){return this.video?.bufferedAmount??0;}
 private failure(){if(this.dead)return;this.close();this.hooks.fail();}
 close(){if(this.dead)return;this.dead=true;clearTimeout(this.timeout);const peer=this.peer;this.peer=undefined;this.video=this.control=undefined;void peer?.close().catch(()=>{});}
}
