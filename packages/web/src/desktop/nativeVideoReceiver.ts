import { decodeDesktopH264Packet } from "@sodashitsu/protocol";

/** Bounded access units in decode/draw; ACK follows each frame painted in order. */
export class DesktopNativeVideoReceiver {
  private decoder: VideoDecoder | undefined;
  private pending: { seq: number; timestamp: number; at: number }[] = [];
  private queued: { seq: number; bytes: Uint8Array; at: number }[] = [];
  private stopped = false;
  private initialized = false;
  private lastTimestamp = -1;
  constructor(
    private settings: {
      id: string;
      generation: number;
      codec: string;
      width: number;
      height: number;
      window?: 3;
    },
    private send: (value: unknown) => void,
    private draw: (frame: VideoFrame) => void,
    private fail: () => void,
  ) {
    void this.initialize().catch(() => this.failure());
  }
  private async initialize() {
    if (typeof VideoDecoder === "undefined") throw Error("H.264 decoder unavailable");
    const config: VideoDecoderConfig = {
      codec: this.settings.codec,
      codedWidth: this.settings.width,
      codedHeight: this.settings.height,
      optimizeForLatency: true,
      colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false },
    };
    const support = await VideoDecoder.isConfigSupported(config);
    if (this.stopped) return;
    if (!support.supported) throw Error("H.264 configuration unavailable");
    const decoder = new VideoDecoder({
      output: (frame) => this.output(frame),
      error: () => this.failure(),
    });
    this.decoder = decoder;
    decoder.configure(config);
    const queued = this.queued;
    this.queued = [];
    for (const frame of queued) this.push(frame.seq, frame.bytes, frame.at);
  }
  push(seq: number, bytes: Uint8Array, at = performance.now()) {
    if (this.stopped) return;
    if (this.pending.length + this.queued.length >= (this.settings.window ?? 1)) {
      this.failure();
      return;
    }
    if (!this.decoder) {
      this.queued.push({ seq, bytes: bytes.slice(), at });
      return;
    }
    try {
      const frame = decodeDesktopH264Packet(bytes);
      if ((!this.initialized && !frame.key) || frame.timestamp <= this.lastTimestamp)
        throw Error("H.264 frame order");
      this.pending.push({ seq, timestamp: frame.timestamp, at });
      this.lastTimestamp = frame.timestamp;
      this.initialized = true;
      this.decoder.decode(
        new EncodedVideoChunk({
          type: frame.key ? "key" : "delta",
          timestamp: frame.timestamp,
          data: frame.data,
        }),
      );
    } catch {
      this.failure();
    }
  }
  private output(frame: VideoFrame) {
    try {
      if (this.stopped) return;
      const pending = this.pending[0];
      if (
        !pending ||
        frame.timestamp !== pending.timestamp ||
        frame.displayWidth !== this.settings.width ||
        frame.displayHeight !== this.settings.height
      )
        throw Error("H.264 output mismatch");
      this.draw(frame);
      this.pending.shift();
      this.send({
        type: "native_video_ack",
        id: this.settings.id,
        generation: this.settings.generation,
        seq: pending.seq,
        ...(this.settings.window === 3
          ? { decodeMs: Math.min(60000, Math.max(0, performance.now() - pending.at)) }
          : {}),
      });
    } catch {
      this.failure();
    } finally {
      frame.close();
    }
  }
  private failure() {
    if (this.stopped) return;
    this.stop();
    this.fail();
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.pending = [];
    this.queued = [];
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = undefined;
  }
}
