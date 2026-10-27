import { DesktopMicrophoneResult, DESKTOP_MICROPHONE_BYTES } from "@sodashitsu/protocol";
import workletUrl from "./microphoneWorklet.js?url&no-inline";
export type MicrophoneState="stopped"|"preparing"|"starting"|"running"|"unavailable";
/** The only getUserMedia call is inside an explicit start action. */
export class DesktopMicrophoneClient {
  private encoder:AudioEncoder|undefined;private encoding=new Map<number,{seq:number;at:number}>();
  private epoch=0;private id:string|undefined;private stream:MediaStream|undefined;
  private context:AudioContext|undefined;private source:MediaStreamAudioSourceNode|undefined;private node:AudioWorkletNode|undefined;
  private pending=new Map<number,number>();private seq=0;private timer:ReturnType<typeof setTimeout>|undefined;private running=false;private requested=false;
  constructor(private send:(value:unknown)=>boolean,private state:(state:MicrophoneState)=>void,private options:{opus?:boolean;codec?(codec:"pcm"|"opus"):void}={}) {}
  static supported(){return typeof AudioContext!=="undefined"&&typeof AudioWorkletNode!=="undefined"&&typeof navigator.mediaDevices?.getUserMedia==="function";}
  async start() {
    this.stop();const epoch=++this.epoch;this.state("preparing");
    try {
      if(!DesktopMicrophoneClient.supported())throw Error("Microphone unavailable");
      const config:AudioEncoderConfig={codec:"opus",sampleRate:48000,numberOfChannels:1,bitrate:32000,opus:{frameDuration:20000,usedtx:false}};
      let opus=false;if(this.options.opus&&typeof AudioEncoder!=="undefined"&&typeof AudioData!=="undefined")try{opus=(await AudioEncoder.isConfigSupported(config)).supported===true;}catch{}
      if(epoch!==this.epoch)return;
      const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:1,sampleRate:48000,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(epoch!==this.epoch){for(const track of stream.getTracks())track.stop();return;}this.stream=stream;
      for(const track of stream.getTracks())track.addEventListener("ended",()=>{if(epoch===this.epoch)this.fail();},{once:true});
      const context=this.context=new AudioContext({sampleRate:48000,latencyHint:"interactive"});
      if(context.sampleRate!==48000)throw Error("Microphone format unavailable");
      await context.audioWorklet.addModule(workletUrl);if(epoch!==this.epoch)return;
      const node=this.node=new AudioWorkletNode(context,"soda-microphone",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:"explicit",channelInterpretation:"speakers"});
      node.port.onmessage=event=>{const bytes=event.data?.pcm;node.port.postMessage("ready");const pcm=bytes instanceof ArrayBuffer?new Uint8Array(bytes):undefined;if(epoch!==this.epoch||!this.running||this.pending.size>=12||typeof event.data?.at!=="number"||context.currentTime-event.data.at>0.1||event.data.at>context.currentTime+0.01){pcm?.fill(0);return;}
        if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==DESKTOP_MICROPHONE_BYTES||this.seq>=0xffffffff){this.fail();return;}
        const seq=++this.seq,encoder=this.encoder;
        if(encoder){if(encoder.encodeQueueSize>=2||this.encoding.size+this.pending.size>=12){pcm!.fill(0);return;}const timestamp=seq*20000;this.encoding.set(timestamp,{seq,at:performance.now()});this.armDeadline();let audio:AudioData|undefined;try{audio=new AudioData({format:"s16",sampleRate:48000,numberOfFrames:960,numberOfChannels:1,timestamp,data:pcm!});encoder.encode(audio);}catch{this.fail();}finally{audio?.close();pcm!.fill(0);}}
        else{this.transmit(seq,pcm!,"microphone_frame");}
      };
      if(opus){const encoder=this.encoder=new AudioEncoder({error:()=>{if(epoch===this.epoch)this.fail();},output:chunk=>{if(epoch!==this.epoch||this.encoder!==encoder)return;const frame=this.encoding.get(chunk.timestamp);this.encoding.delete(chunk.timestamp);this.armDeadline();if(!frame||!this.running||performance.now()-frame.at>100)return;if(chunk.byteLength<1||chunk.byteLength>1275||chunk.duration!==20000){this.fail();return;}const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);this.transmit(frame.seq,bytes,"microphone_opus");}});encoder.configure(config);}
      this.options.codec?.(opus?"opus":"pcm");
      this.source=context.createMediaStreamSource(stream);this.source.connect(node);node.connect(context.destination);
      await context.resume();if(epoch!==this.epoch)return;
      this.id=crypto.randomUUID();this.seq=0;this.requested=true;this.state("starting");
      if(!this.send({type:"microphone_start",id:this.id,...(opus?{codec:"opus"}:{})}))throw Error("Microphone disconnected");
      this.timer=setTimeout(()=>this.fail(),3000);
    }catch{if(epoch===this.epoch)this.fail();}
  }
  receive(raw:unknown) {
    const m=DesktopMicrophoneResult.parse(raw);if(m.id!==this.id)return;
    if(m.type==="microphone_ack"){if(!this.pending.has(m.seq))return;for(const seq of this.pending.keys())if(seq<=m.seq)this.pending.delete(seq);this.armDeadline();return;}
    if(m.state==="running"){clearTimeout(this.timer);this.timer=undefined;this.running=true;this.state("running");}
    else if(m.state==="unavailable"||m.state==="stopped"){this.stop();this.state(m.state);}
  }
  private transmit(seq:number,bytes:Uint8Array,type:"microphone_frame"|"microphone_opus") {let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);bytes.fill(0);this.pending.set(seq,performance.now());if(!this.send({type,id:this.id,seq,data:btoa(binary)})){this.fail();return;}this.armDeadline();}
  private armDeadline(){clearTimeout(this.timer);this.timer=undefined;const pending=this.pending.values().next().value,encoding=this.encoding.values().next().value;const due=Math.min(pending===undefined?Infinity:pending+500,encoding===undefined?Infinity:encoding.at+200);if(Number.isFinite(due))this.timer=setTimeout(()=>this.fail(),Math.max(1,due-performance.now()));}
  private fail(){this.stop();this.state("unavailable");}
  stop() {
    ++this.epoch;this.running=false;clearTimeout(this.timer);this.timer=undefined;this.pending.clear();this.encoding.clear();const encoder=this.encoder;this.encoder=undefined;if(encoder&&encoder.state!=="closed")encoder.close();
    const id=this.id,requested=this.requested;this.id=undefined;this.requested=false;
    this.node?.port.postMessage("stop");this.node?.disconnect();this.node=undefined;this.source?.disconnect();this.source=undefined;
    for(const track of this.stream?.getTracks()??[])track.stop();this.stream=undefined;
    void this.context?.close().catch(()=>{});this.context=undefined;
    if(id&&requested)this.send({type:"microphone_stop",id});this.state("stopped");
  }
}
