import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { DesktopMicrophoneRequest, DESKTOP_MICROPHONE_HELLO, DESKTOP_MICROPHONE_BYTES, type DesktopMicrophoneResult } from "@sodashitsu/protocol";
/** B owns the endpoint, pipe name and lifetime. The viewer can supply PCM only. */
export class DesktopMicrophone {
  private dead=false;private lastStart=-Infinity;
  private current: {id:string;name:string;socket?:Socket;seq:number;ready:boolean;busy:boolean;header:Buffer;timer?:ReturnType<typeof setTimeout>;retry?:ReturnType<typeof setTimeout>;at:number;tokens:number;rateAt:number;latest?:{seq:number;pcm:Buffer;at:number};packet?:Buffer}|undefined;
  constructor(private hooks:{allowed():boolean;synthetic?:boolean;write(value:unknown):void;send(value:DesktopMicrophoneResult):boolean}) {}
  fromViewer(raw:unknown) {
    const m=DesktopMicrophoneRequest.parse(raw);
    if(this.dead)return;
    if(m.type==="microphone_stop"){if(this.current?.id===m.id)this.finish("stopped");return;}
    if(m.type==="microphone_start") {
      if(performance.now()-this.lastStart<1000||this.current||!this.hooks.allowed()||(process.platform!=="win32"&&!this.hooks.synthetic)) {this.hooks.send({type:"microphone_status",id:m.id,state:"unavailable"});return;}
      this.lastStart=performance.now();
      const name="SodaDesktopMicrophone-"+randomUUID().replaceAll("-", "");
      const c:NonNullable<DesktopMicrophone["current"]>=this.current={id:m.id,name,seq:0,ready:false,busy:false,header:Buffer.alloc(0),at:performance.now(),tokens:12,rateAt:performance.now()};
      this.hooks.send({type:"microphone_status",id:m.id,state:"starting"});
      const path=process.platform==="win32"?"\\\\.\\pipe\\"+name:join(tmpdir(),name+".sock");
      this.hooks.write({type:"native_microphone",id:m.id,enabled:true,pipeName:name,...(this.hooks.synthetic?{pipePath:path}:{})});
      c.timer=setTimeout(()=>this.finish("unavailable"),2500);this.connect(c,path);return;
    }
    const c=this.current;
    if(!c||m.id!==c.id)return;
    if(!this.allowed(c)||!c.ready||m.seq<=c.seq){this.finish("unavailable");return;}
    const now=performance.now();c.tokens=Math.min(12,c.tokens+(now-c.rateAt)/20);c.rateAt=now;
    if(c.tokens<1){this.finish("unavailable");return;}c.tokens--;
    const pcm=Buffer.from(m.data,"base64");if(pcm.length!==DESKTOP_MICROPHONE_BYTES)throw Error("Microphone frame size");
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
    socket.on("data",bytes=>{if(this.current!==c||c.socket!==socket)return;if(!this.allowed(c)||c.ready||c.header.length+bytes.length>16){this.finish("unavailable");return;}c.header=Buffer.concat([c.header,bytes]);if(c.header.length!==16)return;if(!c.header.equals(Buffer.from(DESKTOP_MICROPHONE_HELLO))){this.finish("unavailable");return;}c.ready=true;clearTimeout(c.timer);c.timer=setTimeout(()=>this.finish("unavailable"),2000);if(!this.hooks.send({type:"microphone_status",id:c.id,state:"running"}))this.finish("unavailable");});
    socket.on("error",()=>{if(this.current!==c||c.socket!==socket)return;delete c.socket;socket.destroy();if(c.ready||performance.now()-c.at>=2400)this.finish("unavailable");else c.retry=setTimeout(()=>this.connect(c,path),50);});
    socket.on("close",()=>{if(this.current===c&&c.socket===socket)this.finish("unavailable");});
  }
  private finish(state:"stopped"|"unavailable") {
    const c=this.current;if(!c)return;this.current=undefined;clearTimeout(c.timer);clearTimeout(c.retry);c.socket?.destroy();c.header.fill(0);c.latest?.pcm.fill(0);delete c.latest;c.packet?.fill(0);delete c.packet;
    this.hooks.write({type:"native_microphone",id:c.id,enabled:false});if(!this.dead)this.hooks.send({type:"microphone_status",id:c.id,state});
  }
  stop(){if(this.dead)return;this.dead=true;this.finish("stopped");}
}
