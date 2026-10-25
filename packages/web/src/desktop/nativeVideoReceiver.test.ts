import { afterEach, expect, it, vi } from "vitest";
import { DesktopNativeVideoReceiver } from "./nativeVideoReceiver.js";
import { encodeDesktopH264Packet } from "@sodashitsu/protocol";
afterEach(() => vi.unstubAllGlobals());
function fixture(supported = true, window?: 3) {
  let callbacks!: VideoDecoderInit;
  const decode = vi.fn(),
    close = vi.fn();
  vi.stubGlobal(
    "VideoDecoder",
    class {
      static async isConfigSupported() {
        return { supported };
      }
      state = "configured";
      constructor(c: VideoDecoderInit) {
        callbacks = c;
      }
      configure() {}
      decode = decode;
      close = close;
    },
  );
  vi.stubGlobal(
    "EncodedVideoChunk",
    class {
      constructor(public init: unknown) {}
    },
  );
  const send = vi.fn(),
    draw = vi.fn(),
    fail = vi.fn(),
    receiver = new DesktopNativeVideoReceiver(
      {
        id: "id",
        generation: 2,
        codec: "avc1.42041f",
        width: 640,
        height: 480,
        ...(window === 3 ? { window } : {}),
      },
      send,
      draw,
      fail,
    );
  const output = (timestamp = 100) => {
    const frame = {
      timestamp,
      displayWidth: 640,
      displayHeight: 480,
      close: vi.fn(),
    } as unknown as VideoFrame;
    callbacks.output(frame);
    return frame;
  };
  const bytes = encodeDesktopH264Packet(100, true, new Uint8Array([0, 0, 0, 1, 0x65]));
  return {
    send,
    draw,
    fail,
    receiver,
    output,
    decode,
    close,
    bytes,
    error: () => callbacks.error(new DOMException("decoder fault")),
  };
}
it("queues one initial packet during codec capability detection and ACKs only after draw", async () => {
  const f = fixture();
  f.receiver.push(1, f.bytes);
  expect(f.send).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(f.decode).toHaveBeenCalledTimes(1);
  const frame = f.output();
  expect(f.draw).toHaveBeenCalledWith(frame);
  expect(frame.close).toHaveBeenCalledOnce();
  expect(f.send).toHaveBeenCalledWith({
    type: "native_video_ack",
    id: "id",
    generation: 2,
    seq: 1,
  });
  expect(f.draw.mock.invocationCallOrder[0]).toBeLessThan(f.send.mock.invocationCallOrder[0]!);
  f.receiver.stop();
});
it("closes late decoded frames without drawing or acknowledging a stopped generation", async () => {
  const f = fixture();
  await Promise.resolve();
  f.receiver.push(1, f.bytes);
  f.receiver.stop();
  const frame = f.output();
  expect(frame.close).toHaveBeenCalledOnce();
  expect(f.draw).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});
it("fails instead of accumulating decode work, and closes a mismatched output", async () => {
  const f = fixture();
  await Promise.resolve();
  f.receiver.push(1, f.bytes);
  f.receiver.push(2, f.bytes);
  expect(f.fail).toHaveBeenCalledOnce();
  expect(f.decode).toHaveBeenCalledTimes(1);
  const g = fixture();
  await Promise.resolve();
  g.receiver.push(1, g.bytes);
  const frame = g.output(101);
  expect(frame.close).toHaveBeenCalledOnce();
  expect(g.fail).toHaveBeenCalledOnce();
  expect(g.send).not.toHaveBeenCalled();
});
it("falls back if H.264 is unsupported", async () => {
  const f = fixture(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.fail).toHaveBeenCalledOnce();
  expect(f.send).not.toHaveBeenCalled();
});

it("closes the decoder and restores images on a decoder runtime error", async () => {
  const f = fixture();
  await Promise.resolve();
  f.receiver.push(1, f.bytes);
  f.error();
  expect(f.fail).toHaveBeenCalledOnce();
  expect(f.send).not.toHaveBeenCalled();
  const late = f.output();
  expect(late.close).toHaveBeenCalledOnce();
});

it("pipelines three access units during codec initialization and ACKs them in draw order", async () => {
  const f = fixture(true, 3);
  for (let seq = 1; seq <= 3; seq++)
    f.receiver.push(
      seq,
      encodeDesktopH264Packet(
        seq * 100,
        seq === 1,
        new Uint8Array([0, 0, 1, seq === 1 ? 0x65 : 0x41]),
      ),
    );
  await Promise.resolve();
  expect(f.decode).toHaveBeenCalledTimes(3);
  f.output(100);
  f.receiver.push(4, encodeDesktopH264Packet(400, false, new Uint8Array([0, 0, 1, 0x41])));
  f.output(200);
  f.output(300);
  f.output(400);
  expect(f.send.mock.calls.map(([m]) => m.seq)).toEqual([1, 2, 3, 4]);
  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ decodeMs: expect.any(Number) }));
  f.receiver.stop();
});
it("rejects a fourth undecoded frame without dropping a reference picture", async () => {
  const f = fixture(true, 3);
  await Promise.resolve();
  for (let seq = 1; seq <= 4; seq++)
    f.receiver.push(
      seq,
      encodeDesktopH264Packet(
        seq * 100,
        seq === 1,
        new Uint8Array([0, 0, 1, seq === 1 ? 0x65 : 0x41]),
      ),
    );
  expect(f.decode).toHaveBeenCalledTimes(3);
  expect(f.fail).toHaveBeenCalledOnce();
  expect(f.send).not.toHaveBeenCalled();
  expect(f.output(100).close).toHaveBeenCalledOnce();
});
