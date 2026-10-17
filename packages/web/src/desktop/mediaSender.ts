import {
  encodeDesktopMediaChunk,
  type DesktopMediaSettings,
  type DesktopOptions,
} from "@sodashitsu/protocol";

export type MediaRequest = {
  id: string;
  settings: DesktopMediaSettings;
  options: DesktopOptions;
  target: { title: string; width: number; height: number };
  iceServers: RTCIceServer[];
};
export class DesktopMediaSender {
  private raw: MediaStream | undefined;
  private stream: MediaStream | undefined;
  private peer: RTCPeerConnection | undefined;
  private recorder: MediaRecorder | undefined;
  private preview = document.createElement("video");
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private candidates: RTCIceCandidateInit[] = [];
  private stopped = false;
  private generation = 0;
  private sequence = 0;
  private bitrate: number;
  private stable = 0;
  private restartAt = 0;
  private backlog = 0;
  private outgoing = Promise.resolve();
  constructor(
    readonly request: MediaRequest,
    private send: (value: unknown) => void,
    private binary: (value: Uint8Array) => boolean,
    private report: (state: string) => void,
  ) {
    this.bitrate = request.settings.maxBitrateKbps * 1000;
  }
  async start() {
    const r = this.request;
    const constraints = {
      video: {
        displaySurface: "monitor",
        width: { ideal: r.options.width },
        frameRate: { ideal: r.options.fps, max: r.options.fps },
        cursor: r.options.image?.showCursor === false ? "never" : "always",
      },
      audio: r.settings.audio,
      systemAudio: r.settings.audio ? "include" : "exclude",
      selfBrowserSurface: "exclude",
    };
    const raw = await navigator.mediaDevices.getDisplayMedia(
      constraints as DisplayMediaStreamOptions,
    );
    if (this.stopped) {
      raw.getTracks().forEach((t) => t.stop());
      return;
    }
    this.raw = raw;
    const track = raw.getVideoTracks()[0];
    if (!track) throw Error("共有画面を取得できません");
    const actual = track.getSettings();
    if (
      actual.displaySurface !== "monitor" ||
      !actual.width ||
      !actual.height ||
      Math.abs(actual.width / actual.height - r.target.width / r.target.height) > 0.02
    )
      throw Error("対象と同じモニター全体を選択してください");
    if (r.options.display && (actual.width !== r.target.width || actual.height !== r.target.height))
      throw Error("等倍表示には変更後のモニターと同じ画素数の取得が必要です");
    if (!r.settings.audio)
      raw.getAudioTracks().forEach((t) => {
        raw.removeTrack(t);
        t.stop();
      });
    track.addEventListener("ended", () => this.stop());
    this.stream = raw;
    if (r.options.image?.colorMode && r.options.image.colorMode !== "full")
      await this.palette(r.options.image.colorMode);
    if (this.stopped) return;
    this.send({
      type: "started",
      id: r.id,
      width: actual.width,
      height: actual.height,
      surface: "monitor",
      audio: raw.getAudioTracks().length > 0,
    });
    if (r.settings.transport === "relay") this.startRelay();
    else await this.startPeer();
    if (!this.stopped) this.timer = setInterval(() => void this.sample(), 2000);
  }
  private async palette(mode: string) {
    this.preview.srcObject = this.raw!;
    this.preview.muted = true;
    await this.preview.play();
    if (this.stopped) return;
    const width = Math.min(this.request.options.width, this.preview.videoWidth),
      height = Math.round((width * this.preview.videoHeight) / this.preview.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const table = (bits: number) =>
      Uint8Array.from({ length: 256 }, (_, i) => {
        const n = (1 << bits) - 1;
        return Math.floor((Math.floor((i * n + 127) / 255) * 255 + Math.floor(n / 2)) / n);
      });
    const q2 = table(2),
      q3 = table(3),
      q5 = table(5),
      q6 = table(6);
    const tick = () => {
      if (this.stopped) return;
      ctx.drawImage(this.preview, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height),
        b = image.data;
      for (let i = 0; i < b.length; i += 4) {
        if (mode === "gray16") {
          const v =
            Math.floor(
              (Math.floor((77 * b[i]! + 150 * b[i + 1]! + 29 * b[i + 2]! + 128) / 256) + 8) / 17,
            ) * 17;
          b[i] = b[i + 1] = b[i + 2] = v;
        } else if (mode === "rgb565") {
          b[i] = q5[b[i]!]!;
          b[i + 1] = q6[b[i + 1]!]!;
          b[i + 2] = q5[b[i + 2]!]!;
        } else {
          b[i] = q3[b[i]!]!;
          b[i + 1] = q3[b[i + 1]!]!;
          b[i + 2] = q2[b[i + 2]!]!;
        }
      }
      ctx.putImageData(image, 0, 0);
      this.frame = this.preview.requestVideoFrameCallback(tick);
    };
    tick();
    this.stream = new MediaStream([
      ...canvas.captureStream(this.request.options.fps).getVideoTracks(),
      ...this.raw!.getAudioTracks(),
    ]);
  }
  private async startPeer() {
    if (this.stopped || !this.stream) return;
    const peer = new RTCPeerConnection({ iceServers: this.request.iceServers });
    this.peer = peer;
    for (const track of this.stream.getTracks()) {
      track.contentHint = track.kind === "video" ? "detail" : "music";
      peer.addTrack(track, this.stream);
    }
    peer.onicecandidate = (e) => {
      if (e.candidate && !this.stopped && this.peer === peer)
        this.send({
          type: "rtc_signal",
          id: this.request.id,
          signal: { kind: "candidate", candidate: e.candidate.toJSON() },
        });
    };
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return;
      if (peer.connectionState === "connected") {
        if (this.fallback) clearTimeout(this.fallback);
        this.send({ type: "media_state", id: this.request.id, state: "rtc" });
        this.report("WebRTC");
      } else if (peer.connectionState === "failed") this.startRelay();
    };
    await peer.setLocalDescription(await peer.createOffer());
    if (this.stopped || this.peer !== peer) return;
    await this.parameters();
    this.send({
      type: "rtc_signal",
      id: this.request.id,
      signal: { kind: "offer", sdp: peer.localDescription!.sdp },
    });
    this.fallback = setTimeout(() => {
      if (peer.connectionState !== "connected") this.startRelay();
    }, 7000);
  }
  async signal(signal: { kind: string; sdp?: string; candidate?: RTCIceCandidateInit }) {
    const p = this.peer;
    if (!p || this.stopped) return;
    if (signal.kind === "answer") {
      await p.setRemoteDescription({ type: "answer", sdp: signal.sdp! });
      for (const c of this.candidates) await p.addIceCandidate(c);
      this.candidates = [];
    } else if (signal.kind === "candidate" && signal.candidate) {
      if (p.remoteDescription) await p.addIceCandidate(signal.candidate);
      else {
        if (this.candidates.length >= 64) throw Error("ICE candidate limit");
        this.candidates.push(signal.candidate);
      }
    }
  }
  startRelay() {
    if (this.stopped || !this.stream || this.recorder) return;
    if (this.fallback) clearTimeout(this.fallback);
    this.peer?.close();
    this.peer = undefined;
    const mime = this.stream.getAudioTracks().length
      ? "video/webm;codecs=vp8,opus"
      : "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime))
      throw Error("このブラウザでは中継動画の圧縮ができません");
    this.send({ type: "media_state", id: this.request.id, state: "relay" });
    this.report("圧縮動画の中継");
    const generation = ++this.generation;
    this.sequence = 0;
    this.send({ type: "media_stream", id: this.request.id, generation, mime });
    const recorder = new MediaRecorder(this.stream, {
      mimeType: mime,
      videoBitsPerSecond: this.bitrate,
      audioBitsPerSecond: 96000,
    });
    this.recorder = recorder;
    this.restartAt = performance.now();
    recorder.onerror = () => this.stop();
    recorder.ondataavailable = (e) => {
      if (this.stopped || this.recorder !== recorder || !e.data.size) return;
      this.backlog += e.data.size;
      if (e.data.size > 512 * 1024 || this.backlog > 1024 * 1024) {
        this.stop();
        return;
      }
      this.outgoing = this.outgoing
        .then(async () => {
          try {
            const bytes = new Uint8Array(await e.data.arrayBuffer());
            if (
              !this.stopped &&
              this.recorder === recorder &&
              !this.binary(encodeDesktopMediaChunk(generation, ++this.sequence, bytes))
            )
              this.stop();
          } finally {
            this.backlog -= e.data.size;
          }
        })
        .catch(() => this.stop());
    };
    recorder.start(200);
  }
  feedback(bufferedMs: number, congested: boolean) {
    if (this.request.settings.adaptive) this.adjust(congested || bufferedMs > 1200);
  }
  private async sample() {
    if (!this.peer || !this.request.settings.adaptive || this.stopped) return;
    try {
      const stats = await this.peer.getStats();
      let pressure = false;
      stats.forEach((s) => {
        if (s.type === "remote-inbound-rtp" && (s.fractionLost > 0.05 || s.roundTripTime > 0.4))
          pressure = true;
        if (
          s.type === "outbound-rtp" &&
          (s.qualityLimitationReason === "bandwidth" || s.qualityLimitationReason === "cpu")
        )
          pressure = true;
      });
      this.adjust(pressure);
    } catch {}
  }
  private adjust(pressure: boolean) {
    const before = this.bitrate;
    if (pressure) {
      this.bitrate = Math.max(128000, Math.floor(this.bitrate * 0.7));
      this.stable = 0;
    } else if (++this.stable >= 3) {
      this.bitrate = Math.min(
        this.request.settings.maxBitrateKbps * 1000,
        Math.round(this.bitrate * 1.2),
      );
      this.stable = 0;
    }
    if (before === this.bitrate) return;
    if (this.peer) void this.parameters().catch(() => {});
    else if (this.recorder && performance.now() - this.restartAt > 10000) {
      const old = this.recorder;
      this.recorder = undefined;
      old.ondataavailable = null;
      old.stop();
      this.startRelay();
    }
    this.report(`上限 ${Math.round(this.bitrate / 1000)} kbps`);
  }
  private async parameters() {
    const sender = this.peer?.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) return;
    const encoding = parameters.encodings[0]!;
    encoding.maxBitrate = this.bitrate;
    encoding.maxFramerate =
      this.bitrate < 500000 ? Math.min(5, this.request.options.fps) : this.request.options.fps;
    encoding.scaleResolutionDownBy = !this.request.options.display && this.bitrate < 500000 ? 2 : 1;
    if (this.request.options.display) parameters.degradationPreference = "maintain-resolution";
    await sender.setParameters(parameters);
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.fallback) clearTimeout(this.fallback);
    this.peer?.close();
    this.peer = undefined;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      try {
        this.recorder.stop();
      } catch {}
      this.recorder = undefined;
    }
    this.preview.cancelVideoFrameCallback(this.frame);
    this.preview.pause();
    this.preview.srcObject = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.raw?.getTracks().forEach((t) => t.stop());
    this.send({ type: "media_state", id: this.request.id, state: "ended" });
    this.report("停止");
  }
}
