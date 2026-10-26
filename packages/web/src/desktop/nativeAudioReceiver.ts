import { decodeDesktopAudio } from "@sodashitsu/protocol";
const config: AudioDecoderConfig = { codec: "opus", sampleRate: 48000, numberOfChannels: 2 };
/** Starts muted. Encoded/decoded/scheduled audio cannot accumulate behind video. */
export class DesktopNativeAudioReceiver {
  private stopped = false;
  private muted = true;
  private epoch = 0;
  private seq = 0;
  private timestamp = -1;
  private decodedSeq = 0;
  private decodedTimestamp = -1;
  private context: AudioContext | undefined;
  private gain: GainNode | undefined;
  private decoder: AudioDecoder | undefined;
  private sources = new Set<AudioBufferSourceNode>();
  private pending = new Map<number, number>();
  private next = 0;
  constructor(
    private generation: number,
    private videoTimestamp: () => number,
    private failed: () => void,
  ) {}
  static async supported() {
    return (
      typeof AudioDecoder !== "undefined" &&
      typeof AudioContext !== "undefined" &&
      (await AudioDecoder.isConfigSupported(config)).supported === true
    );
  }
  async sound(enabled: boolean) {
    if (this.stopped) return;
    const epoch = ++this.epoch;
    this.muted = !enabled;
    if (!enabled) {
      if (this.gain) this.gain.gain.value = 0;
      this.clearDecoder();
      this.clearSources();
      await this.context?.suspend().catch(() => {});
      return;
    }
    try {
      const context = (this.context ??= new AudioContext({
        sampleRate: 48000,
        latencyHint: "interactive",
      }));
      if (!this.gain) {
        this.gain = context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(context.destination);
      }
      await context.resume();
      if (this.stopped || epoch !== this.epoch) return;
      if (!(await DesktopNativeAudioReceiver.supported())) throw Error("Opus unavailable");
      if (this.stopped || epoch !== this.epoch) return;
      this.configureDecoder();
      this.gain.gain.value = 1;
    } catch (error) {
      if (this.stopped || epoch !== this.epoch) return;
      this.failure();
      throw error;
    }
  }
  push(bytes: Uint8Array) {
    if (this.stopped) return;
    const packet = decodeDesktopAudio(bytes);
    if (
      packet.generation !== this.generation ||
      packet.seq <= this.seq ||
      packet.timestamp <= this.timestamp
    )
      return;
    this.seq = packet.seq;
    this.timestamp = packet.timestamp;
    if (
      this.muted ||
      !this.decoder ||
      this.pending.size >= 2 ||
      this.decoder.decodeQueueSize >= 2 ||
      this.videoTimestamp() - packet.timestamp > 150000
    )
      return;
    try {
      // Raw Opus decoders advance a continuous sample clock. Reset on missing
      // packets so their output timestamps cannot drift from the live stream.
      if (
        this.decodedSeq &&
        (packet.seq !== this.decodedSeq + 1 ||
          Math.abs(packet.timestamp - this.decodedTimestamp - 20000) > 21)
      )
        this.configureDecoder();
      this.decodedSeq = packet.seq;
      this.decodedTimestamp = packet.timestamp;
      this.pending.set(packet.timestamp, performance.now());
      this.decoder!.decode(
        new EncodedAudioChunk({ type: "key", timestamp: packet.timestamp, data: packet.data }),
      );
    } catch {
      this.failure();
    }
  }
  private output(decoder: AudioDecoder, data: AudioData) {
    try {
      if (this.stopped || this.muted || this.decoder !== decoder) return;
      // WebCodecs rescales through a 48kHz sample clock; Chromium can
      // return a timestamp one microsecond below the submitted integer.
      const submitted = Array.from(this.pending.keys()).find(
        (timestamp) => Math.abs(timestamp - data.timestamp) <= 21,
      );
      const at = submitted === undefined ? undefined : this.pending.get(submitted);
      if (submitted !== undefined) this.pending.delete(submitted);
      if (at === undefined) throw Error("Unexpected audio output");
      if (performance.now() - at > 100) return;
      if (
        data.sampleRate !== 48000 ||
        data.numberOfChannels !== 2 ||
        data.numberOfFrames < 1 ||
        data.numberOfFrames > 960
      )
        throw Error("Audio output format");
      const context = this.context!,
        buffer = context.createBuffer(2, data.numberOfFrames, data.sampleRate);
      for (let channel = 0; channel < 2; channel++)
        data.copyTo(buffer.getChannelData(channel), { planeIndex: channel, format: "f32-planar" });
      const now = context.currentTime;
      let start = Math.max(now + 0.02, this.next);
      if (start + buffer.duration > now + 0.1 || this.sources.size >= 6) {
        this.clearSources();
        start = now + 0.04;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain!);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
      };
      source.start(start);
      this.next = start + buffer.duration;
    } catch {
      this.failure();
    } finally {
      data.close();
    }
  }
  private configureDecoder() {
    this.clearDecoder();
    const decoder = new AudioDecoder({
      output: (data) => this.output(decoder, data),
      error: () => {
        if (this.decoder === decoder) this.failure();
      },
    });
    this.decoder = decoder;
    decoder.configure(config);
  }
  private clearDecoder() {
    this.decodedSeq = 0;
    this.decodedTimestamp = -1;
    const decoder = this.decoder;
    this.decoder = undefined;
    this.pending.clear();
    if (decoder && decoder.state !== "closed") decoder.close();
  }
  private clearSources() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    this.sources.clear();
    this.next = 0;
  }
  private failure() {
    if (this.stopped) return;
    this.stop();
    this.failed();
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.muted = true;
    this.epoch++;
    if (this.gain) this.gain.gain.value = 0;
    this.clearDecoder();
    this.clearSources();
    const context = this.context;
    this.context = undefined;
    this.gain = undefined;
    void context?.close().catch(() => {});
  }
}
