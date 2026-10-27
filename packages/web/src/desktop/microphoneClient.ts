import { DesktopMicrophoneResult, DESKTOP_MICROPHONE_BYTES } from "@sodashitsu/protocol";
import workletUrl from "./microphoneWorklet.js?url&no-inline";
export type MicrophoneState="stopped"|"preparing"|"starting"|"running"|"unavailable";
/** The only getUserMedia call is inside an explicit start action. */
export class DesktopMicrophoneClient {
  private epoch=0;private id:string|undefined;private stream:MediaStream|undefined;
  private context:AudioContext|undefined;private source:MediaStreamAudioSourceNode|undefined;private node:AudioWorkletNode|undefined;
  private pending=new Map<number,number>();private seq=0;private timer:ReturnType<typeof setTimeout>|undefined;private running=false;private requested=false;
  constructor(private send:(value:unknown)=>boolean,private state:(state:MicrophoneState)=>void) {}
  static supported(){return typeof AudioContext!=="undefined"&&typeof AudioWorkletNode!=="undefined"&&typeof navigator.mediaDevices?.getUserMedia==="function";}
  async start() {
    this.stop();const epoch=++this.epoch;this.state("preparing");
    try {
      if(!DesktopMicrophoneClient.supported())throw Error("Microphone unavailable");
      const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,sampleRate:48000,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(epoch!==this.epoch){for(const track of stream.getTracks())track.stop();return;}this.stream=stream;
      for(const track of stream.getTracks())track.addEventListener("ended",()=>{if(epoch===this.epoch)this.fail();},{once:true});
      const context=this.context=new AudioContext({sampleRate:48000,latencyHint:"interactive"});
      if(context.sampleRate!==48000)throw Error("Microphone format unavailable");
      await context.audioWorklet.addModule(workletUrl);if(epoch!==this.epoch)return;
      const node=this.node=new AudioWorkletNode(context,"soda-microphone",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:"explicit",channelInterpretation:"speakers"});
      node.port.onmessage=event=>{const bytes=event.data?.pcm;node.port.postMessage("ready");const pcm=bytes instanceof ArrayBuffer?new Uint8Array(bytes):undefined;if(epoch!==this.epoch||!this.running||this.pending.size>=12||typeof event.data?.at!=="number"||context.currentTime-event.data.at>0.1||event.data.at>context.currentTime+0.01){pcm?.fill(0);return;}
        if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==DESKTOP_MICROPHONE_BYTES||this.seq>=0xffffffff){this.fail();return;}
        let binary="";for(const byte of pcm!)binary+=String.fromCharCode(byte);pcm!.fill(0);
        const seq=++this.seq;this.pending.set(seq,performance.now());if(!this.send({type:"microphone_frame",id:this.id,seq,data:btoa(binary)})){this.fail();return;}
        this.armDeadline();
      };
      this.source=context.createMediaStreamSource(stream);this.source.connect(node);node.connect(context.destination);
      await context.resume();if(epoch!==this.epoch)return;
      this.id=crypto.randomUUID();this.seq=0;this.requested=true;this.state("starting");
      if(!this.send({type:"microphone_start",id:this.id}))throw Error("Microphone disconnected");
      this.timer=setTimeout(()=>this.fail(),3000);
    }catch{if(epoch===this.epoch)this.fail();}
  }
  receive(raw:unknown) {
    const m=DesktopMicrophoneResult.parse(raw);if(m.id!==this.id)return;
    if(m.type==="microphone_ack"){if(!this.pending.has(m.seq))return;for(const seq of this.pending.keys())if(seq<=m.seq)this.pending.delete(seq);this.armDeadline();return;}
    if(m.state==="running"){clearTimeout(this.timer);this.timer=undefined;this.running=true;this.state("running");}
    else if(m.state==="unavailable"||m.state==="stopped"){this.stop();this.state(m.state);}
  }
  private armDeadline(){clearTimeout(this.timer);this.timer=undefined;const at=this.pending.values().next().value;if(at!==undefined)this.timer=setTimeout(()=>this.fail(),Math.max(1,500-(performance.now()-at)));}
  private fail(){this.stop();this.state("unavailable");}
  stop() {
    ++this.epoch;this.running=false;clearTimeout(this.timer);this.timer=undefined;this.pending.clear();
    const id=this.id,requested=this.requested;this.id=undefined;this.requested=false;
    this.node?.port.postMessage("stop");this.node?.disconnect();this.node=undefined;this.source?.disconnect();this.source=undefined;
    for(const track of this.stream?.getTracks()??[])track.stop();this.stream=undefined;
    void this.context?.close().catch(()=>{});this.context=undefined;
    if(id&&requested)this.send({type:"microphone_stop",id});this.state("stopped");
  }
}
