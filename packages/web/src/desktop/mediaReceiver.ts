import { DesktopNativeVideoReceiver } from "./nativeVideoReceiver.js";
import { decodeDesktopMediaChunk, type DesktopMediaSettings } from "@sodashitsu/protocol";

/** Viewer-owned peer/player. Audio starts muted, queues are bounded, stop releases all resources. */
export class DesktopMediaReceiver {
  readonly video = document.createElement("video");
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
  ) {
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.peer = new RTCPeerConnection({ iceServers });
    this.peer.onicecandidate = (e) => {
      if (e.candidate)
        this.send({
          type: "rtc_signal",
          id,
          signal: { kind: "candidate", candidate: e.candidate.toJSON() },
        });
    };
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
        this.fail();
        return;
      }
      if(this.native)return;
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
    const pc = this.peer;
    if (!pc || this.stopped) return;
    if (signal.kind === "candidate") {
      if (!signal.candidate) return;
      if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
      else {
        if (this.candidates.length >= 64) throw Error("ICE candidate limit");
        this.candidates.push(signal.candidate);
      }
    } else if (signal.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp! });
      for (const candidate of this.candidates) await pc.addIceCandidate(candidate);
      this.candidates = [];
      await pc.setLocalDescription(await pc.createAnswer());
      if (this.stopped) return;
      this.send({
        type: "rtc_signal",
        id: this.id,
        signal: { kind: "answer", sdp: pc.localDescription!.sdp },
      });
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
  nativeStream(generation:number,codec:string,width:number,height:number,window?:3) {
    if(this.stopped)return;
    this.peer?.close();this.peer=undefined;this.native?.stop();this.releaseSource();this.video.srcObject=null;
    this.generation=generation;this.sequence=0;
    this.native=new DesktopNativeVideoReceiver({id:this.id,generation,codec,width,height,...(window===3?{window}: {})},this.send,frame=>{if(this.stopped)return;this.draw(frame,++this.count,width,height);this.drawnAt=performance.now();},()=>this.fail());
  }
  chunk(bytes: Uint8Array) {
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
    clearInterval(this.timer);
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
