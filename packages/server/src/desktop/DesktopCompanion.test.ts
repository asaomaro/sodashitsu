import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { encodeDesktopMediaChunk } from "@sodashitsu/protocol";
import { DesktopCompanionHub } from "./DesktopCompanion.js";
class Host extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: any[] = [];
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
    this.emit("close");
  }
  terminate() {
    this.close();
  }
  message(value: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(value)), false);
  }
  binary(value: Uint8Array) {
    this.emit("message", Buffer.from(value), true);
  }
  socket() {
    return this as unknown as WebSocket;
  }
}
const cleanup: DesktopCompanionHub[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((h) => h.dispose());
  vi.useRealTimers();
});
function fixture(audio = false) {
  const hub = new DesktopCompanionHub(true),
    host = new Host(),
    owner = {},
    send = vi.fn(() => true),
    policy = vi.fn(),
    backlog = { value: 0 };
  cleanup.push(hub);
  hub.bind({
    owner,
    options: { width: 1280, fps: 10, quality: 65 },
    ready: {
      type: "ready",
      title: "B monitor",
      allowInput: true,
      width: 1280,
      height: 720,
      backend: "synthetic",
    },
    send,
    policy,
    buffered: () => backlog.value,
  });
  hub.attach(host.socket());
  hub.fromViewer(owner, {
    type: "media",
    enabled: true,
    settings: { audio, transport: "relay", adaptive: true, maxBitrateKbps: 2500 },
  });
  const request = host.sent.find((m) => m.type === "media_request");
  return { hub, host, owner, send, policy, backlog, id: request.id };
}
it("binds media to one viewer, validates audio permission, sequences chunks and ignores late data", () => {
  const f = fixture();
  expect(f.hub.fromViewer({}, { type: "media", enabled: false })).toBe(false);
  f.host.message({
    type: "started",
    id: f.id,
    width: 1280,
    height: 720,
    surface: "monitor",
    audio: false,
  });
  expect(f.policy).toHaveBeenLastCalledWith(true);
  f.host.message({ type: "media_state", id: f.id, state: "relay" });
  f.host.message({ type: "media_stream", id: f.id, generation: 1, mime: "video/webm;codecs=vp8" });
  const chunk = encodeDesktopMediaChunk(1, 1, new Uint8Array([1]));
  f.host.binary(chunk);
  expect(f.send).toHaveBeenLastCalledWith(expect.any(Uint8Array));
  f.hub.fromViewer(f.owner, { type: "media", enabled: false });
  expect(f.policy).toHaveBeenLastCalledWith(false);
  const count = f.send.mock.calls.length;
  f.host.binary(encodeDesktopMediaChunk(1, 2, new Uint8Array([2])));
  expect(f.send.mock.calls).toHaveLength(count);
  expect(f.host.readyState).toBe(1);
});
it("rejects audio escalation and falls back under congestion without closing native sharing", () => {
  const denied = fixture();
  denied.host.message({
    type: "started",
    id: denied.id,
    width: 1280,
    height: 720,
    surface: "monitor",
    audio: true,
  });
  expect(denied.host.readyState).toBe(3);
  const f = fixture(true);
  f.host.message({
    type: "started",
    id: f.id,
    width: 1280,
    height: 720,
    surface: "monitor",
    audio: true,
  });
  f.host.message({
    type: "media_stream",
    id: f.id,
    generation: 1,
    mime: "video/webm;codecs=vp8,opus",
  });
  f.backlog.value = 512 * 1024 + 1;
  f.host.binary(encodeDesktopMediaChunk(1, 1, new Uint8Array([1])));
  expect(f.send).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: "images", reason: "congested" }),
  );
  expect(f.policy).toHaveBeenLastCalledWith(false);
  expect(f.host.readyState).toBe(1);
});
it("releases the heartbeat timer on local-browser disconnect and can attach again", () => {
  vi.useFakeTimers();
  const f = fixture();
  expect(vi.getTimerCount()).toBe(1);
  f.host.close();
  expect(vi.getTimerCount()).toBe(0);
  const next = new Host();
  f.hub.attach(next.socket());
  expect(vi.getTimerCount()).toBe(1);
  f.hub.dispose();
  expect(vi.getTimerCount()).toBeLessThanOrEqual(1); // bounded socket termination timer until close event
});

it("closes a congested companion when a stop cannot be delivered", () => {
  const f = fixture();
  f.host.message({
    type: "started",
    id: f.id,
    width: 1280,
    height: 720,
    surface: "monitor",
    audio: false,
  });
  f.host.bufferedAmount = 65536;
  f.hub.fromViewer(f.owner, { type: "media", enabled: false });
  expect(f.host.readyState).toBe(3);
  expect(f.policy).toHaveBeenLastCalledWith(false);
});
it("ignores errors from a replaced companion socket", () => {
  const f = fixture();
  f.host.close();
  const next = new Host();
  f.hub.attach(next.socket());
  f.host.emit("error", Error("late error"));
  expect(next.readyState).toBe(1);
  next.message({ type: "heartbeat" });
  expect(next.sent).toContainEqual({ type: "companion_ready" });
});
