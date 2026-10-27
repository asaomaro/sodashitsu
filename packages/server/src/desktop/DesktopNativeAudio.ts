import {randomUUID} from "node:crypto";
import {createConnection,type Socket} from "node:net";
import {performance} from "node:perf_hooks";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {encodeDesktopAudio,DESKTOP_AUDIO_MAX_BYTES} from "@sodashitsu/protocol";
import {DesktopPcmStream,type DesktopPcmFrame} from "./DesktopPcmStream.js";
import type OpusScript from "opusscript";
export interface DesktopNativeAudioHooks {
 id:string;synthetic:boolean;write(value:unknown):void;send(bytes:Uint8Array,receivedAt?:number):boolean;
 state(state:"starting"|"running"|"unavailable"|"stopped"):void;active():boolean;videoTimestamp():number;
}
export interface DesktopAudioLease {stop(notify?:boolean):void;}
/** PCM stays in a private local pipe. Only bounded Opus packets reach the viewer. */
export class DesktopNativeAudio {
 private dead=false;private requested=false;private ready=false;private socket:Socket|undefined;private encoder:OpusScript|undefined;
 private headerTimer:ReturnType<typeof setTimeout>|undefined;
 private retry:ReturnType<typeof setTimeout>|undefined;private task:ReturnType<typeof setImmediate>|undefined;private deadline=0;
 private pending:(DesktopPcmFrame&{at:number})[]=[];
 private parser:DesktopPcmStream;
 constructor(private hooks:DesktopNativeAudioHooks){
  this.parser=new DesktopPcmStream(()=>{if(this.alive()){this.ready=true;clearTimeout(this.headerTimer);this.hooks.state("running");}},frame=>this.queue(frame));
  if(this.hooks.active())this.hooks.state("starting");void this.start().catch(()=>this.fail());
 }
 private async start(){
  const {default:OpusScript}=await import("opusscript");if(!this.alive())return;
  if(process.platform!=="win32"&&!this.hooks.synthetic){this.fail();return;}
  this.encoder=new OpusScript(48000,2,OpusScript.Application.AUDIO);this.encoder.encoderCTL(4002,128000);
  const name="SodaDesktopAudio-"+randomUUID().replaceAll("-","");
  const path=process.platform==="win32"?"\\\\.\\pipe\\"+name:join(tmpdir(),name+".sock");
  this.requested=true;this.hooks.write({type:"native_audio",id:this.hooks.id,enabled:true,pipeName:name,...(process.platform!=="win32"?{pipePath:path}:{})});
  this.deadline=performance.now()+2500;this.headerTimer=setTimeout(()=>{if(!this.ready)this.fail();},2500);this.connect(path);
 }
 private connect(path:string){
  if(!this.alive())return;const socket=this.socket=createConnection(path);
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
 private alive(){if(this.dead)return false;if(!this.hooks.active()){this.stop(false);return false;}return true;}
 private fail(){if(!this.alive())return;this.stop(false);this.hooks.state("unavailable");}
 stop(notify=true){
  if(this.dead)return;this.dead=true;clearTimeout(this.retry);clearTimeout(this.headerTimer);if(this.task)clearImmediate(this.task);this.task=undefined;
  this.socket?.destroy();this.socket=undefined;this.parser.clear();for(const frame of this.pending)frame.pcm.fill(0);this.pending=[];
  this.encoder?.delete();this.encoder=undefined;
  if(this.requested)this.hooks.write({type:"native_audio",id:this.hooks.id,enabled:false});
  if(notify)this.hooks.state("stopped");
 }
}
