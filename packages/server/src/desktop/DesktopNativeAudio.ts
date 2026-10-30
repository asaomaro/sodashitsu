import type {NativePcmCapability,DesktopNativePcmPath} from "./DesktopNativePcmPath.js";
import type {Duplex} from "node:stream";
import type {DesktopAudioPipe} from "@sodashitsu/client-core/desktop/DesktopAudioPipe.node";
import {randomUUID} from "node:crypto";
import {createConnection} from "node:net";
import {performance} from "node:perf_hooks";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {encodeDesktopAudio,DESKTOP_AUDIO_MAX_BYTES} from "@sodashitsu/protocol";
import {DesktopPcmStream,type DesktopPcmFrame} from "./DesktopPcmStream.js";
import type OpusScript from "opusscript";
export interface DesktopNativeAudioHooks {
 nativePcm?:NativePcmCapability;bridge?:(active:()=>boolean)=>DesktopAudioPipe;id:string;synthetic:boolean;write(value:unknown):void;send(bytes:Uint8Array,receivedAt?:number):boolean;
 state(state:"starting"|"running"|"unavailable"|"stopped"):void;active():boolean;videoTimestamp():number;
}
export interface DesktopAudioLease {stop(notify?:boolean):void;}
/** PCM stays in a private local pipe. Only bounded Opus packets reach the viewer. */
export class DesktopNativeAudio {
 private pathLease:DesktopNativePcmPath|undefined;
 private dead=false;private requested=false;private ready=false;private socket:Duplex|undefined;private encoder:OpusScript|undefined;
 private headerTimer:ReturnType<typeof setTimeout>|undefined;
 private retry:ReturnType<typeof setTimeout>|undefined;private task:ReturnType<typeof setImmediate>|undefined;private deadline=0;
 private pending:(DesktopPcmFrame&{at:number})[]=[];
 private parser:DesktopPcmStream;
 constructor(private hooks:DesktopNativeAudioHooks){
  this.parser=new DesktopPcmStream(()=>{if(this.alive()){this.ready=true;clearTimeout(this.headerTimer);this.hooks.state("running");}},frame=>this.queue(frame));
  if(!this.alive())return;this.hooks.state("starting");
  this.deadline=performance.now()+2500;this.headerTimer=setTimeout(()=>{if(!this.ready)this.fail();},2500);
  void this.start().catch(()=>this.fail());
 }
 private async start(){
  if(!this.alive())return;
  const {default:OpusScript}=await import("opusscript");if(!this.alive())return;
  if(process.platform!=="win32"&&!this.hooks.synthetic&&!this.hooks.bridge&&!this.hooks.nativePcm){this.fail();return;}
  this.encoder=new OpusScript(48000,2,OpusScript.Application.AUDIO);this.encoder.encoderCTL(4002,128000);
  const name="SodaDesktopAudio-"+randomUUID().replaceAll("-","");
  let path=process.platform==="win32"?"\\\\.\\pipe\\"+name:join(tmpdir(),name+".sock");
  if(this.hooks.nativePcm&&!this.hooks.bridge){
   const lease=await this.hooks.nativePcm.paths.create(this.hooks.nativePcm.owner,name);
   if(!this.alive()){await lease.retire();return;}this.pathLease=lease;path=lease.path;
  }
  if(this.hooks.bridge){
   const bridge=this.socket=this.hooks.bridge(()=>this.alive());bridge.on("error",()=>{if(!this.dead)this.fail();});bridge.on("close",()=>{if(!this.dead)this.fail();});
   const pid=await bridge.ready;if(!this.alive()||this.socket!==bridge){bridge.destroy();return;}
   this.requested=true;this.hooks.write({type:"native_audio",id:this.hooks.id,enabled:true,pipeName:name,clientPid:pid});
   if(!this.alive()){bridge.destroy();return;}bridge.on("data",bytes=>{if(!this.alive()||this.socket!==bridge)return;try{this.parser.push(bytes);}catch{this.fail();}});if(!bridge.connect(name))throw Error("Audio pipe connect");
  }else{this.requested=true;this.hooks.write({type:"native_audio",id:this.hooks.id,enabled:true,pipeName:name,...(process.platform!=="win32"?{pipePath:path,...(this.pathLease?{clientPid:process.pid}:{})}:{})});this.connect(path);}
 }
 private connect(path:string){
  if(!this.alive())return;const socket=this.socket=createConnection(path);
  if(this.pathLease){
   socket.pause();const lease=this.pathLease;
   socket.once("connect",()=>{void (async()=>{try{await lease.verify();if(!this.alive()||this.socket!==socket)return;socket.resume();}catch{if(this.socket===socket)this.fail();}})();});
  }
  socket.on("data",bytes=>{if(!this.alive()||this.socket!==socket)return;try{this.parser.push(bytes);}catch{this.fail();}});
  socket.on("error",()=>{
   if(this.dead||this.socket!==socket)return;this.socket=undefined;socket.destroy();
   if(this.ready||performance.now()>=this.deadline)this.fail();else this.retry=setTimeout(()=>this.connect(path),50);
  });
  socket.on("close",()=>{if(!this.dead&&this.socket===socket)this.fail();});

 }
 private queue(frame:DesktopPcmFrame){
  if(!this.alive()){frame.pcm.fill(0);return;}
  this.pending.push({...frame,at:performance.now()});if(this.pending.length>2)this.pending.shift()!.pcm.fill(0);
  if(!this.task)this.task=setImmediate(()=>this.encode());
 }
 private encode(){
  this.task=undefined;if(this.dead)return;const frames=this.pending;this.pending=[];
  try{
   for(const frame of frames){
    try{
     if(!this.alive()||performance.now()-frame.at>100||this.hooks.videoTimestamp()-frame.timestamp>150000)continue;
     const bytes=this.encoder!.encode(frame.pcm,960);if(bytes.length<1||bytes.length>DESKTOP_AUDIO_MAX_BYTES)throw Error("Opus packet limit");
     this.hooks.send(encodeDesktopAudio(1,frame.seq,frame.timestamp,bytes),frame.at);
    }finally{frame.pcm.fill(0);}
   }
  }catch{for(const frame of frames)frame.pcm.fill(0);this.fail();}
 }
 private alive(){if(this.dead)return false;if(!this.ready&&this.deadline>0&&performance.now()>=this.deadline){this.stop(false);this.hooks.state("unavailable");return false;}if(!this.hooks.active()){this.stop(false);return false;}return true;}
 private fail(){if(!this.alive())return;this.stop(false);this.hooks.state("unavailable");}
 stop(notify=true){
  if(this.dead)return;this.dead=true;clearTimeout(this.retry);clearTimeout(this.headerTimer);if(this.task)clearImmediate(this.task);this.task=undefined;
  this.socket?.destroy();this.socket=undefined;const lease=this.pathLease;this.pathLease=undefined;if(lease)void lease.retire();this.parser.clear();for(const frame of this.pending)frame.pcm.fill(0);this.pending=[];
  this.encoder?.delete();this.encoder=undefined;
  if(this.requested)this.hooks.write({type:"native_audio",id:this.hooks.id,enabled:false});
  if(notify)this.hooks.state("stopped");
 }
}
