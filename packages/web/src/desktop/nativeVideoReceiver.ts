import { decodeDesktopH264Packet } from "@sodashitsu/protocol";

/** One access unit in decode/draw; ACK is emitted only after the frame is painted. */
export class DesktopNativeVideoReceiver {
  private decoder: VideoDecoder | undefined;
  private pending: { seq: number; timestamp: number } | undefined;
  private queued: { seq: number; bytes: Uint8Array } | undefined;
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
    this.queued = undefined;
    if (queued) this.push(queued.seq, queued.bytes);
  }
  push(seq: number, bytes: Uint8Array) {
    if (this.stopped) return;
    if (this.pending || this.queued) {
      this.failure();
      return;
    }
    if (!this.decoder) {
      this.queued = { seq, bytes: bytes.slice() };
      return;
    }
    try {
      const frame = decodeDesktopH264Packet(bytes);
      if ((!this.initialized && !frame.key) || frame.timestamp <= this.lastTimestamp)
        throw Error("H.264 frame order");
      this.pending = { seq, timestamp: frame.timestamp };
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
      const pending = this.pending;
      if (
        !pending ||
        frame.timestamp !== pending.timestamp ||
        frame.displayWidth !== this.settings.width ||
        frame.displayHeight !== this.settings.height
      )
        throw Error("H.264 output mismatch");
      this.draw(frame);
      this.pending = undefined;
      this.send({
        type: "native_video_ack",
        id: this.settings.id,
        generation: this.settings.generation,
        seq: pending.seq,
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
    this.pending = this.queued = undefined;
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = undefined;
  }
}
