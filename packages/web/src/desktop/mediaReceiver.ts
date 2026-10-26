import {DesktopNativeAudioReceiver} from "./nativeAudioReceiver.js";
import {DESKTOP_AUDIO_CHANNEL,DesktopNativeAudioStatus} from "@sodashitsu/protocol";
import {DesktopDatagramFrames} from "./datagramFrames.js";
import {DESKTOP_VIDEO_CHANNEL,DESKTOP_CONTROL_CHANNEL,DesktopNativeFrameNotice,DesktopNativeVideoAck} from "@sodashitsu/protocol";
import { DesktopNativeVideoReceiver } from "./nativeVideoReceiver.js";
import { decodeDesktopMediaChunk, type DesktopMediaSettings } from "@sodashitsu/protocol";

/** Viewer-owned peer/player. Audio starts muted, queues are bounded, stop releases all resources. */
export class DesktopMediaReceiver {
  readonly video = document.createElement("video");
  private audio:DesktopNativeAudioReceiver|undefined;private audioChannel:RTCDataChannel|undefined;private videoTimestamp=-1;
  private datagrams:DesktopDatagramFrames|undefined;
  private nativeControl:RTCDataChannel|undefined;
  private nativeVideo:RTCDataChannel|undefined;
  private nativeFormat:{generation:number;codec:string;width:number;height:number;window?:3}|undefined;
  private lastKey=-Infinity;
  private datagramTimer:ReturnType<typeof setInterval>|undefined;
  private native: DesktopNativeVideoReceiver|undefined;
  private peer: RTCPeerConnection | undefined;
  private source: MediaSource | undefined;
  private buffer: SourceBuffer | undefined;
  private url: string | undefined;
  private queue: Uint8Array[] = [];
  private queued = 0;
  private generation = 0;
  private sequence = 0;
  private candidates: RTCIceCandidateInit[] = [];
  private timer: ReturnType<typeof setInterval>;
  private frameCallback = 0;
  private stopped = false;
  private drawnAt = 0;
  private count = 0;
  private startedAt = performance.now();
  private feedbackAt = 0;
  constructor(
    readonly id: string,
    private send: (value: unknown) => void,
    private draw: (video: HTMLVideoElement|VideoFrame, count: number, width:number, height:number) => void,
    private state: (value: string) => void,
    iceServers: RTCIceServer[] = [],
    private udp=false,
    private requestedNativeAudio=false,
    private audioState:(state:"starting"|"running"|"stopped"|"unavailable")=>void=()=>{},
  ) {
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.peer = new RTCPeerConnection({ iceServers });
    this.peer.onicecandidate = (e) => {
      if (!this.stopped && e.candidate)
        this.send({
          type: "rtc_signal",
          id,
          signal: { kind: "candidate", candidate: e.candidate.toJSON() },
        });
    };
    if(udp){
      this.peer.ondatachannel=e=>{
        const channel=e.channel;
        if(channel.label===DESKTOP_VIDEO_CHANNEL&&!this.nativeVideo&&!channel.ordered&&channel.maxRetransmits===0){
          this.nativeVideo=channel;channel.binaryType="arraybuffer";
          channel.onmessage=e=>{try{if(!(e.data instanceof ArrayBuffer))throw Error("Native binary required");this.datagrams?.fragment(new Uint8Array(e.data));}catch{this.datagramFailure();}};
        }else if(channel.label===DESKTOP_CONTROL_CHANNEL&&!this.nativeControl&&channel.ordered&&channel.maxRetransmits===null&&channel.maxPacketLifeTime===null){
          this.nativeControl=channel;channel.onmessage=()=>this.datagramFailure();
        }else if(this.requestedNativeAudio&&channel.label===DESKTOP_AUDIO_CHANNEL&&!this.audioChannel&&!channel.ordered&&channel.maxRetransmits===0){
          this.audioChannel=channel;channel.binaryType="arraybuffer";
          channel.onmessage=e=>{if(this.stopped)return;try{if(!(e.data instanceof ArrayBuffer))throw Error("Audio binary required");this.audioChunk(new Uint8Array(e.data));}catch{this.audioFailure();}};
          channel.onclose=()=>{if(!this.stopped)this.audioFailure();};channel.onerror=()=>this.audioFailure();return;
        }else{channel.close();this.datagramFailure();return;}
        channel.onclose=()=>{if(!this.stopped)this.datagramFailure();};channel.onerror=()=>this.datagramFailure();
      };
      this.datagrams=new DesktopDatagramFrames({now:()=>performance.now(),frame:(seq,bytes)=>{if(!this.native&&this.nativeFormat)this.createNative();if(!this.native)throw Error("Native format not ready");this.native.push(seq,bytes);},drop:seq=>{
        this.native?.discardPending();this.native=undefined;this.nativeAck({type:"native_video_ack",id:this.id,generation:this.generation,seq,dropped:true});
      },keyframe:()=>{if(performance.now()-this.lastKey>=250){this.lastKey=performance.now();this.nativeAck({type:"native_keyframe",id:this.id});}}},false);
      this.datagramTimer=setInterval(()=>{try{this.datagrams?.tick();}catch{this.datagramFailure();}},25);
    }
    this.peer.ontrack = (e) => {
      if (this.stopped) return;
      this.video.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void this.video.play().catch(() => {});
    };
    this.peer.onconnectionstatechange = () => {
      if (this.peer?.connectionState === "failed") this.send({ type: "media_fallback", id });
    };
    const tick = () => {
      if (this.stopped) return;
      if (this.video.readyState >= 2) {
        this.drawnAt = performance.now();
        this.draw(this.video, ++this.count,this.video.videoWidth,this.video.videoHeight);
      }
      this.frameCallback = this.video.requestVideoFrameCallback(tick);
    };
    this.frameCallback = this.video.requestVideoFrameCallback(tick);
    this.timer = setInterval(() => {
      const now = performance.now();
      if (
        (this.drawnAt && now - this.drawnAt > 2000) ||
        (!this.drawnAt && now - this.startedAt > 12000)
      ) {
        if(this.udp)this.datagramFailure();else this.fail();
        return;
      }
      if(this.native||this.udp)return;
      if (now - this.feedbackAt < 2000) return;
      this.feedbackAt = now;
      const ranges = this.video.buffered,
        end = ranges.length ? ranges.end(ranges.length - 1) : this.video.currentTime;
      const lag = Math.max(0, end - this.video.currentTime);
      if (this.source && lag > 1.2) this.video.currentTime = Math.max(0, end - 0.25);
      this.send({
        type: "media_feedback",
        id,
        bufferedMs: Math.min(30000, lag * 1000),
        congested: this.queued > 256 * 1024,
      });
    }, 500);
  }
  get active() {
    return !this.stopped && this.drawnAt > 0 && performance.now() - this.drawnAt <= 2000;
  }
  async signal(signal: { kind: string; sdp?: string; candidate?: RTCIceCandidateInit }) {
    const pc=this.peer,current=()=>!this.stopped&&this.peer===pc;
    if(!pc||!current())return;
    try {
      if(signal.kind==="candidate"){
        if(!signal.candidate)return;
        if(pc.remoteDescription){await pc.addIceCandidate(signal.candidate);if(!current())return;}
        else{if(this.candidates.length>=64)throw Error("ICE candidate limit");this.candidates.push(signal.candidate);}
      }else if(signal.kind==="offer"){
        await pc.setRemoteDescription({type:"offer",sdp:signal.sdp!});if(!current())return;
        const candidates=this.candidates;this.candidates=[];
        for(const candidate of candidates){await pc.addIceCandidate(candidate);if(!current())return;}
        const answer=await pc.createAnswer();if(!current())return;
        await pc.setLocalDescription(answer);if(!current())return;
        this.send({type:"rtc_signal",id:this.id,signal:{kind:"answer",sdp:pc.localDescription!.sdp}});
      }
    }catch(error){
      // A retired peer's late rejection must not close its replacement share.
      if(!current())return;
      if(this.udp){this.datagramFailure();return;}
      throw error;
    }
  }
  stream(generation: number, mime: string) {
    if (this.stopped) return;
    if (!MediaSource.isTypeSupported(mime)) throw Error("このブラウザでは中継動画を再生できません");
    this.peer?.close();
    this.peer = undefined;
    this.video.srcObject = null;
    this.releaseSource();
    this.generation = generation;
    this.sequence = 0;
    this.queue = [];
    this.queued = 0;
    const source = new MediaSource();
    this.source = source;
    this.url = URL.createObjectURL(source);
    this.video.src = this.url;
    source.addEventListener(
      "sourceopen",
      () => {
        if (this.stopped || this.source !== source) return;
        const buffer = source.addSourceBuffer(mime);
        this.buffer = buffer;
        buffer.mode = "sequence";
        buffer.addEventListener("updateend", () => this.flush());
        buffer.addEventListener("error", () => this.fail());
        this.flush();
        void this.video.play().catch(() => {});
      },
      { once: true },
    );
  }
  nativeStream(generation:number,codec:string,width:number,height:number,window?:3,datagrams=false) {
    if(this.stopped)return;if(datagrams!==this.udp)throw Error("Native stream route changed");
    if(!datagrams){this.peer?.close();this.peer=undefined;}
    this.native?.stop();this.native=undefined;this.releaseSource();this.video.srcObject=null;
    this.generation=generation;this.sequence=0;
    this.nativeFormat={generation,codec,width,height,...(window===3?{window}:{})};this.createNative();if(datagrams)this.datagrams!.start();
  }
  private createNative(){
    const format=this.nativeFormat;if(!format||this.stopped)return;
    this.native=new DesktopNativeVideoReceiver({id:this.id,...format},value=>this.udp?this.nativeAck(value):this.send(value),frame=>{if(this.stopped)return;this.videoTimestamp=frame.timestamp;this.draw(frame,++this.count,format.width,format.height);this.drawnAt=performance.now();},()=>this.udp?this.datagramFailure():this.fail());
  }
  notice(raw:unknown){
    if(this.stopped)return;
    const notice=DesktopNativeFrameNotice.parse(raw);if(!this.udp||notice.id!==this.id||notice.generation!==this.generation||!this.nativeFormat)throw Error("Unexpected native notice");
    this.datagrams!.notice(notice.seq,notice.bytes);
  }
  audioStatus(raw:unknown){
    if(this.stopped)return;const status=DesktopNativeAudioStatus.parse(raw);if(!this.requestedNativeAudio||status.id!==this.id)throw Error("Unexpected audio status");
    if(status.state==="starting"||status.state==="running")this.audio??=new DesktopNativeAudioReceiver(1,()=>this.videoTimestamp,()=>this.audioFailure());
    else{this.audio?.stop();this.audio=undefined;}
    this.audioState(status.state);
  }
  audioChunk(bytes:Uint8Array){if(this.stopped)return;if(!this.requestedNativeAudio)throw Error("Audio not requested");try{this.audio?.push(bytes);}catch{this.audioFailure();}}
  private audioFailure(){if(this.stopped)return;this.audio?.stop();this.audio=undefined;this.audioState("unavailable");this.send({type:"native_audio_control",id:this.id,enabled:false});}
  private nativeAck(value:unknown){
    const control=this.nativeControl;if(this.stopped)return;
    if(control?.readyState!=="open"||control.bufferedAmount>16384){this.datagramFailure();return;}
    if((value as {type:string}).type==="native_video_ack")DesktopNativeVideoAck.parse(value);
    control.send(JSON.stringify(value));
  }
  private datagramFailure(){
    if(this.stopped)return;
    this.send({type:"media_fallback",id:this.id});this.stop();
  }
  chunk(bytes: Uint8Array) {
    if(this.stopped)return;
    const chunk = decodeDesktopMediaChunk(bytes);
    if (chunk.generation !== this.generation) return;
    if (chunk.seq !== this.sequence + 1) throw Error("動画の順序が不正です");
    this.sequence = chunk.seq;
    if(this.native){this.native.push(chunk.seq,chunk.data);return;}
    if (this.queued + chunk.data.length > 2 * 1024 * 1024) {
      this.fail();
      return;
    }
    this.queue.push(chunk.data.slice());
    this.queued += chunk.data.length;
    this.flush();
  }
  private flush() {
    const buffer = this.buffer;
    if (!buffer || buffer.updating || this.stopped) return;
    try {
      if (
        this.video.currentTime > 6 &&
        buffer.buffered.length &&
        buffer.buffered.start(0) < this.video.currentTime - 4
      ) {
        buffer.remove(0, this.video.currentTime - 2);
        return;
      }
      const bytes = this.queue.shift();
      if (bytes) {
        this.queued -= bytes.length;
        buffer.appendBuffer(bytes.buffer as ArrayBuffer);
      }
    } catch {
      this.fail();
    }
  }
  private fail() {
    this.send({ type: "media", enabled: false });
    this.stop();
    this.state("images");
  }
  async sound(enabled: boolean) {
    if(this.requestedNativeAudio){await this.audio?.sound(enabled);return;}
    this.video.muted = !enabled;
    await this.video.play();
  }
  private releaseSource() {
    this.buffer = undefined;
    this.source = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.audio?.stop();this.audio=undefined;this.audioChannel=undefined;
    clearInterval(this.timer);clearInterval(this.datagramTimer);this.datagrams?.stop();this.datagrams=undefined;this.nativeControl=this.nativeVideo=undefined;
    this.native?.stop();this.native=undefined;
    this.video.cancelVideoFrameCallback(this.frameCallback);
    this.peer?.close();
    this.peer = undefined;
    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute("src");
    this.video.load();
    this.releaseSource();
    this.queue = [];
    this.queued = 0;
  }
}

export class ImageQualityController {
  private fps: number;
  private quality: number;
  private stable = 0;
  private at = 0;
  constructor(private ceiling: { fps: number; quality: number }) {
    this.fps = ceiling.fps;
    this.quality = ceiling.quality;
  }
  sample(ackMs: number, drawMs: number, backlog: number, now = performance.now()) {
    if (now - this.at < 2000) return;
    this.at = now;
    const before = `${this.fps}/${this.quality}`;
    if (ackMs > 180 || drawMs > 80 || backlog > 65536) {
      this.fps = Math.max(1, Math.floor(this.fps * 0.75));
      this.quality = Math.max(Math.min(35, this.ceiling.quality), this.quality - 10);
      this.stable = 0;
    } else if (++this.stable >= 3) {
      this.fps = Math.min(this.ceiling.fps, this.fps + 1);
      this.quality = Math.min(this.ceiling.quality, this.quality + 5);
      this.stable = 0;
    }
    if (before !== `${this.fps}/${this.quality}`)
      return { type: "quality" as const, fps: this.fps, quality: this.quality };
  }
}
