import { expect, it, vi } from "vitest";
import { DesktopNativeVideo } from "./DesktopNativeVideo.js";
import { decodeDesktopMediaChunk, decodeDesktopH264Packet } from "@sodashitsu/protocol";
function fixture(enabled = true) {
  const send = vi.fn((_value: unknown) => true),
    write = vi.fn<(value: Record<string, unknown>) => void>(),
    policy = vi.fn();
  let buffered = 0;
  const video = new DesktopNativeVideo({
    enabled,
    width: 1280,
    sourceWidth: 1600,
    sourceHeight: 1000,
    fps: 30,
    send,
    write,
    policy,
    buffered: () => buffered,
  });
  const start = () => {
    expect(
      video.fromViewer({ type: "media", enabled: true, settings: { transport: "native" } }),
    ).toBe(true);
    return write.mock.calls.find(([v]) => v.type === "native_video")![0].id as string;
  };
  const frame = (id: string, seq = 1) => ({
    type: "native_frame",
    id,
    seq,
    width: 1280,
    height: 800,
    timestamp: seq * 33333,
    key: seq === 1,
    ...(seq === 1 ? { codec: "avc1.42041f" } : {}),
    data: Buffer.from([0, 0, 0, 1, seq === 1 ? 0x65 : 0x41, 1, 2]).toString("base64"),
  });
  return { video, send, write, policy, start, frame, backlog: () => (buffered = 600000) };
}
it("bounds native frames by draw ACK and preserves image policy/snapshot recovery", () => {
  const f = fixture(),
    id = f.start();
  expect(f.policy).toHaveBeenLastCalledWith(true);
  expect(f.video.fromHelper(f.frame(id))).toBe(true);
  const binary = f.send.mock.calls
    .map(([v]) => v)
    .find((v) => v instanceof Uint8Array) as Uint8Array;
  const chunk = decodeDesktopMediaChunk(binary),
    packet = decodeDesktopH264Packet(chunk.data);
  expect(chunk.seq).toBe(1);
  expect(packet.timestamp).toBe(33333);
  expect(packet.key).toBe(true);
  expect(() => f.video.fromHelper(f.frame(id, 2))).toThrow("order");
  expect(() => f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 2 })).toThrow(
    "ACK",
  );
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1 });
  f.video.fromHelper(f.frame(id, 2));
  f.video.stop();
  expect(f.policy).toHaveBeenLastCalledWith(false);
  expect(f.write).toHaveBeenCalledWith({ type: "keyframe" });
  expect(f.write).toHaveBeenCalledWith({ type: "release" });
  expect(f.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id,
    state: "images",
    audio: false,
    reason: "stopped",
  });
  f.video.fromHelper(f.frame(id, 3));
  expect(f.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id,
    state: "images",
    audio: false,
    reason: "stopped",
  });
});
it("rejects native audio and locally disabled video without starting a helper", () => {
  const f = fixture(false);
  f.video.fromViewer({ type: "media", enabled: true, settings: { transport: "native" } });
  expect(f.write).not.toHaveBeenCalled();
  const g = fixture();
  g.video.fromViewer({
    type: "media",
    enabled: true,
    settings: { transport: "native", audio: true },
  });
  expect(g.write).not.toHaveBeenCalled();
});
it("falls back to images on startup failure, missing draw ACK, and congestion", () => {
  const a = fixture(),
    id = a.start();
  a.video.fromHelper({ type: "native_video_stopped", id });
  expect(a.policy).toHaveBeenLastCalledWith(false);
  const b = fixture(),
    bid = b.start();
  b.video.fromHelper(b.frame(bid));
  b.video.tick(performance.now() + 3000);
  expect(b.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id: bid,
    state: "images",
    audio: false,
    reason: "congested",
  });
  const c = fixture(),
    cid = c.start();
  c.backlog();
  c.video.fromHelper(c.frame(cid));
  expect(c.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id: cid,
    state: "images",
    audio: false,
    reason: "congested",
  });
});
it("requires initial IDR/SPS and stable format, dimensions, and increasing timestamps", () => {
  const a = fixture(),
    id = a.start();
  expect(() => a.video.fromHelper({ ...a.frame(id), key: false })).toThrow("SPS/IDR");
  const b = fixture(),
    bid = b.start();
  expect(() => b.video.fromHelper({ ...b.frame(bid), height: 700 })).toThrow("dimensions");
  const c = fixture(),
    cid = c.start();
  c.video.fromHelper(c.frame(cid));
  c.video.fromViewer({ type: "native_video_ack", id: cid, generation: 1, seq: 1 });
  expect(() => c.video.fromHelper({ ...c.frame(cid, 2), timestamp: 33333 })).toThrow("order");
});

it("switches to browser media without accepting frames or ACKs from the stopped native request", () => {
  const f = fixture(),
    id = f.start();
  f.video.fromHelper(f.frame(id));
  expect(
    f.video.fromViewer({ type: "media", enabled: true, settings: { transport: "auto" } }),
  ).toBe(false);
  expect(f.policy).toHaveBeenLastCalledWith(false);
  const count = f.send.mock.calls.length;
  f.video.fromHelper(f.frame(id, 2));
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1 });
  expect(f.send.mock.calls).toHaveLength(count);
});
