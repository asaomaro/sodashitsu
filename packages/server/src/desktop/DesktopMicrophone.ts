import type {Duplex} from "node:stream";
import type {DesktopAudioPipe} from "@sodashitsu/client-core/desktop/DesktopAudioPipe.node";
import type OpusScript from "opusscript";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { DesktopMicrophoneRequest, DESKTOP_MICROPHONE_HELLO, DESKTOP_MICROPHONE_BYTES, type DesktopMicrophoneResult } from "@sodashitsu/protocol";
/** B owns the endpoint, pipe name and lifetime. The viewer supplies fixed PCM or negotiated Opus; the helper receives PCM only. */
export class DesktopMicrophone {
  private dead=false;private lastStart=-Infinity;
  private current: {codec:"opus"|undefined;decoder?:OpusScript;id:string;name:string;socket?:Duplex;seq:number;ready:boolean;busy:boolean;header:Buffer;timer?:ReturnType<typeof setTimeout>;retry?:ReturnType<typeof setTimeout>;at:number;tokens:number;rateAt:number;latest?:{seq:number;pcm:Buffer;at:number};packet?:Buffer}|undefined;
  constructor(private hooks:{bridge?:(active:()=>boolean)=>DesktopAudioPipe;allowOpus?:boolean;allowed():boolean;synthetic?:boolean;claim?(id:string):boolean;release?(id:string):void;write(value:unknown):void;send(value:DesktopMicrophoneResult):boolean}) {}
  fromViewer(raw:unknown) {
    const m=DesktopMicrophoneRequest.parse(raw);
    if(this.dead)return;
    if(m.type==="microphone_stop"){if(this.current?.id===m.id)this.finish("stopped");return;}
    if(m.type==="microphone_start") {
      if(m.codec==="opus"&&!this.hooks.allowOpus||performance.now()-this.lastStart<1000||this.current||!this.hooks.allowed()||(process.platform!=="win32"&&!this.hooks.synthetic&&!this.hooks.bridge)) {this.hooks.send({type:"microphone_status",id:m.id,state:"unavailable"});return;}
      if(this.hooks.claim&&!this.hooks.claim(m.id)){this.hooks.send({type:"microphone_status",id:m.id,state:"unavailable"});return;}
      this.lastStart=performance.now();
      const name="SodaDesktopMicrophone-"+randomUUID().replaceAll("-", "");
      const c:NonNullable<DesktopMicrophone["current"]>=this.current={codec:m.codec,id:m.id,name,seq:0,ready:false,busy:false,header:Buffer.alloc(0),at:performance.now(),tokens:12,rateAt:performance.now()};
      this.hooks.send({type:"microphone_status",id:m.id,state:"starting"});
      const path=process.platform==="win32"?"\\\\.\\pipe\\"+name:join(tmpdir(),name+".sock");
      c.timer=setTimeout(()=>this.finish("unavailable"),2500);
      void (async()=>{try{if(c.codec==="opus"){const{default:Decoder}=await import("opusscript");if(!this.allowed(c))return;c.decoder=new Decoder(48000,1,Decoder.Application.VOIP);}if(!this.allowed(c))return;if(this.hooks.bridge){const bridge=c.socket=this.hooks.bridge(()=>this.allowed(c));bridge.on("error",()=>{if(this.current===c)this.finish("unavailable");});bridge.on("close",()=>{if(this.current===c)this.finish("unavailable");});const pid=await bridge.ready;if(!this.allowed(c)||c.socket!==bridge){bridge.destroy();return;}this.hooks.write({type:"native_microphone",id:m.id,enabled:true,pipeName:name,clientPid:pid});if(!this.allowed(c)){bridge.destroy();return;}this.receive(c,bridge);if(!bridge.connect(name))throw Error("Microphone pipe connect");return;}this.hooks.write({type:"native_microphone",id:m.id,enabled:true,pipeName:name,...(this.hooks.synthetic?{pipePath:path}:{})});this.connect(c,path);}catch{if(this.current===c)this.finish("unavailable");}})();return;
    }
    const c=this.current;
    if(!c||m.id!==c.id)return;
    if(!this.allowed(c)||!c.ready||m.seq<=c.seq){this.finish("unavailable");return;}
    const now=performance.now();c.tokens=Math.min(12,c.tokens+(now-c.rateAt)/20);c.rateAt=now;
    if(c.tokens<1){this.finish("unavailable");return;}c.tokens--;
    let pcm:Buffer;
    try{const bytes=Buffer.from(m.data,"base64");if(m.type==="microphone_opus"){if(c.codec!=="opus"||!c.decoder||bytes.length<1||bytes.length>1275||bytes.toString("base64")!==m.data)throw Error("Opus packet");pcm=c.decoder.decode(bytes);}else{if(c.codec)throw Error("PCM packet on Opus stream");pcm=bytes;}if(pcm.length!==DESKTOP_MICROPHONE_BYTES){pcm.fill(0);throw Error("Microphone frame size");}}catch{this.finish("unavailable");return;}
    c.seq=m.seq;const frame={seq:m.seq,pcm,at:performance.now()};
    if(c.busy){c.latest?.pcm.fill(0);c.latest=frame;return;}
    this.flush(c,frame);
  }
  private flush(c:NonNullable<DesktopMicrophone["current"]>,frame:{seq:number;pcm:Buffer;at:number}) {
    if(!this.allowed(c)){frame.pcm.fill(0);this.finish("unavailable");return;}
    if(performance.now()-frame.at>100){frame.pcm.fill(0);if(!this.hooks.send({type:"microphone_ack",id:c.id,seq:frame.seq}))this.finish("unavailable");return;}
    c.busy=true;clearTimeout(c.timer);c.timer=setTimeout(()=>this.finish("unavailable"),100);
    const packet=c.packet=Buffer.allocUnsafe(12+frame.pcm.length);packet.writeUInt32LE(frame.seq);packet.writeDoubleLE(Date.now()+100,4);frame.pcm.copy(packet,12);frame.pcm.fill(0);
    c.socket!.write(packet,error=>{
      packet.fill(0);delete c.packet;if(this.current!==c)return;
      if(error||!this.allowed(c)){this.finish("unavailable");return;}
      c.busy=false;clearTimeout(c.timer);c.timer=setTimeout(()=>this.finish("unavailable"),2000);
      if(!this.hooks.send({type:"microphone_ack",id:c.id,seq:frame.seq})){this.finish("unavailable");return;}
      const latest=c.latest;delete c.latest;if(latest)this.flush(c,latest);
    });
  }
  private allowed(c:NonNullable<DesktopMicrophone["current"]>){return !this.dead&&this.current===c&&this.hooks.allowed();}
  private connect(c:NonNullable<DesktopMicrophone["current"]>,path:string) {
    if(!this.allowed(c)){this.finish("unavailable");return;}
    const socket=c.socket=createConnection(path);
    this.receive(c,socket);
    socket.on("error",()=>{if(this.current!==c||c.socket!==socket)return;delete c.socket;socket.destroy();if(c.ready||performance.now()-c.at>=2400)this.finish("unavailable");else c.retry=setTimeout(()=>this.connect(c,path),50);});
    socket.on("close",()=>{if(this.current===c&&c.socket===socket)this.finish("unavailable");});
  }
  private receive(c:NonNullable<DesktopMicrophone["current"]>,socket:Duplex){
    socket.on("data",bytes=>{if(this.current!==c||c.socket!==socket)return;if(!this.allowed(c)||c.ready||c.header.length+bytes.length>16){this.finish("unavailable");return;}c.header=Buffer.concat([c.header,bytes]);if(c.header.length!==16)return;if(!c.header.equals(Buffer.from(DESKTOP_MICROPHONE_HELLO))){this.finish("unavailable");return;}c.ready=true;clearTimeout(c.timer);c.timer=setTimeout(()=>this.finish("unavailable"),2000);if(!this.hooks.send({type:"microphone_status",id:c.id,state:"running"}))this.finish("unavailable");});
  }
  private finish(state:"stopped"|"unavailable") {
    const c=this.current;if(!c)return;this.current=undefined;clearTimeout(c.timer);clearTimeout(c.retry);c.socket?.destroy();c.decoder?.delete();delete c.decoder;c.header.fill(0);c.latest?.pcm.fill(0);delete c.latest;c.packet?.fill(0);delete c.packet;
    this.hooks.write({type:"native_microphone",id:c.id,enabled:false});this.hooks.release?.(c.id);if(!this.dead)this.hooks.send({type:"microphone_status",id:c.id,state});
  }
  stop(){if(this.dead)return;this.dead=true;this.finish("stopped");}
}
