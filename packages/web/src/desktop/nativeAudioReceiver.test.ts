import { afterEach, expect, it, vi } from "vitest";
import { encodeDesktopAudio } from "@sodashitsu/protocol";
import { DesktopNativeAudioReceiver } from "./nativeAudioReceiver.js";
const packet = (seq = 1) => encodeDesktopAudio(1, seq, seq * 20000, new Uint8Array([1, 2]));
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const decoders: any[] = [],
    contexts: any[] = [];
  let resume = () => Promise.resolve();
  vi.stubGlobal(
    "AudioDecoder",
    class {
      static async isConfigSupported() {
        return { supported: true };
      }
      state = "unconfigured";
      decodeQueueSize = 0;
      decode = vi.fn();
      configure = vi.fn(() => (this.state = "configured"));
      close = vi.fn(() => (this.state = "closed"));
      constructor(readonly callbacks: any) {
        decoders.push(this);
      }
    },
  );
  vi.stubGlobal(
    "EncodedAudioChunk",
    class {
      constructor(readonly init: any) {}
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 1;
      destination = {};
      resume = vi.fn(() => resume());
      suspend = vi.fn(async () => {});
      close = vi.fn(async () => {});
      sources: any[] = [];
      constructor() {
        contexts.push(this);
      }
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn() };
      }
      createBuffer(_channels: number, frames: number, rate: number) {
        return { duration: frames / rate, getChannelData: () => new Float32Array(frames) };
      }
      createBufferSource() {
        const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        this.sources.push(source);
        return source;
      }
    },
  );
  const failed = vi.fn(),
    receiver = new DesktopNativeAudioReceiver(1, () => 0, failed);
  const output = (timestamp: number) => {
    const data = {
      timestamp,
      sampleRate: 48000,
      numberOfChannels: 2,
      numberOfFrames: 960,
      copyTo: vi.fn(),
      close: vi.fn(),
    };
    decoders.at(-1).callbacks.output(data);
    return data;
  };
  return {
    receiver,
    failed,
    decoders,
    contexts,
    output,
    setResume: (fn: () => Promise<void>) => (resume = fn),
  };
}
it("starts muted without context/decoder and accepts sample-clock timestamp rounding", async () => {
  const f = setup();
  try {
    f.receiver.push(packet());
    expect(f.contexts).toHaveLength(0);
    expect(f.decoders).toHaveLength(0);
    await f.receiver.sound(true);
    f.receiver.push(packet(2));
    const data = f.output(39999);
    expect(data.close).toHaveBeenCalledOnce();
    expect(f.failed).not.toHaveBeenCalled();
    expect(f.contexts[0].sources[0].start).toHaveBeenCalled();
  } finally {
    f.receiver.stop();
  }
});
it("bounds encoded/decode/scheduled queues, discards stale sequence, and closes late output", async () => {
  const f = setup();
  try {
    await f.receiver.sound(true);
    f.receiver.push(packet(1));
    f.receiver.push(packet(2));
    f.receiver.push(packet(3));
    expect(f.decoders[0].decode).toHaveBeenCalledTimes(2);
    f.output(20000);
    f.output(40000);
    for (let seq = 4; seq <= 15; seq++) {
      f.receiver.push(packet(seq));
      f.output(seq * 20000);
    }
    expect((f.receiver as any).sources.size).toBeLessThanOrEqual(6);
    f.receiver.push(packet(1));
    expect(f.decoders.reduce((n, d) => n + d.decode.mock.calls.length, 0)).toBe(14);
    f.receiver.stop();
    expect(f.contexts[0].close).toHaveBeenCalledOnce();
    expect(f.decoders.every((d) => d.state === "closed")).toBe(true);
    const late = f.output(300000);
    expect(late.close).toHaveBeenCalledOnce();
    expect(f.failed).not.toHaveBeenCalled();
  } finally {
    f.receiver.stop();
  }
});
it("does not configure a decoder after stop while resume is pending", async () => {
  const f = setup();
  let release!: () => void;
  f.setResume(() => new Promise<void>((resolve) => (release = resolve)));
  const pending = f.receiver.sound(true);
  f.receiver.stop();
  release();
  await pending;
  expect(f.decoders).toHaveLength(0);
  expect(f.contexts[0].close).toHaveBeenCalledOnce();
  expect(f.failed).not.toHaveBeenCalled();
});
it("mute destroys decoder and scheduled sources, then resume builds a fresh decoder", async () => {
  const f = setup();
  try {
    await f.receiver.sound(true);
    f.receiver.push(packet(1));
    f.output(20000);
    await f.receiver.sound(false);
    expect(f.decoders[0].close).toHaveBeenCalledOnce();
    expect(f.contexts[0].sources[0].stop).toHaveBeenCalledOnce();
    expect(f.contexts[0].suspend).toHaveBeenCalledOnce();
    f.receiver.push(packet(2));
    expect(f.decoders[0].decode).toHaveBeenCalledTimes(1);
    await f.receiver.sound(true);
    expect(f.decoders).toHaveLength(2);
    expect(f.failed).not.toHaveBeenCalled();
  } finally {
    f.receiver.stop();
  }
});

it("resets the raw Opus sample clock after lost packets and ignores the retired decoder output", async () => {
  const f = setup();
  try {
    await f.receiver.sound(true);
    f.receiver.push(packet(1));
    f.output(20000);
    f.receiver.push(packet(3));
    expect(f.decoders).toHaveLength(2);
    expect(f.decoders[0].close).toHaveBeenCalledOnce();
    const late = { timestamp: 40000, close: vi.fn() };
    f.decoders[0].callbacks.output(late);
    expect(late.close).toHaveBeenCalledOnce();
    f.output(59999);
    expect(f.failed).not.toHaveBeenCalled();
    expect(f.contexts[0].sources.at(-1).start).toHaveBeenCalled();
  } finally { f.receiver.stop(); }
});
