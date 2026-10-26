import { afterEach, expect, it, vi } from "vitest";
import { encodeDesktopAudio } from "@sodashitsu/protocol";
const instances = vi.hoisted(() => [] as any[]);
const peers = vi.hoisted(() => [] as any[]);
vi.mock("./DesktopNativeAudio.js", () => ({
  DesktopNativeAudio: class {
    stop = vi.fn();
    constructor(readonly hooks: any) {
      instances.push(this);
    }
  },
}));
vi.mock("./DesktopNativeDatagrams.js", () => ({
  DesktopNativeDatagrams: class {
    sendAudio = vi.fn(() => true);
    close = vi.fn();
    constructor(readonly hooks: any) {
      peers.push(this);
    }
  },
}));
import { DesktopNativeVideo } from "./DesktopNativeVideo.js";
afterEach(() => {
  instances.length = peers.length = 0;
});
function setup(audioEnabled = true, udp = false) {
  const send = vi.fn(() => true),
    write = vi.fn();
  const video = new DesktopNativeVideo({
    enabled: true,
    audioEnabled,
    synthetic: true,
    datagrams: udp,
    width: 640,
    sourceWidth: 640,
    sourceHeight: 360,
    fps: 30,
    send,
    write,
    policy: () => {},
    buffered: () => 0,
  });
  return {
    video,
    send,
    write,
    start: (audio = false) =>
      video.fromViewer({
        type: "media",
        enabled: true,
        settings: { transport: "native", udp, audio },
      }),
  };
}
it("requires explicit audio request and permission; silent video never creates a source", () => {
  const f = setup();
  try {
    f.start();
    expect(instances).toHaveLength(0);
    f.start(true);
    expect(instances).toHaveLength(1);
    expect(instances[0].hooks.active()).toBe(true);
  } finally {
    f.video.stop();
  }
  const old = setup(false);
  try {
    old.start(true);
    expect(instances).toHaveLength(1);
    expect(old.send).toHaveBeenCalledWith(
      expect.objectContaining({ state: "images", reason: "unavailable" }),
    );
  } finally {
    old.video.stop();
  }
});
it("waits for UDP channels, sends audio only on its separate channel, and audio failure keeps video", () => {
  const f = setup(true, true);
  try {
    f.start(true);
    expect(instances).toHaveLength(0);
    const peer = peers[0];
    expect(peer.hooks.audio).toBe(true);
    peer.hooks.ready();
    const audio = instances[0],
      bytes = encodeDesktopAudio(1, 1, 20000, new Uint8Array([1]));
    audio.hooks.send(bytes);
    expect(peer.sendAudio).toHaveBeenCalledWith(bytes);
    expect(f.send).not.toHaveBeenCalledWith(bytes);
    peer.hooks.audioFailed();
    expect(audio.stop).toHaveBeenCalledWith(false);
    expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ state: "unavailable" }));
    expect(peer.close).not.toHaveBeenCalled();
    expect(audio.hooks.active()).toBe(false);
  } finally {
    f.video.stop();
  }
});
it("stops the previous audio on replacement, ignores its late status, and stop-only control cannot enable it", () => {
  const f = setup();
  try {
    f.start(true);
    const old = instances[0];
    f.start(true);
    expect(old.stop).toHaveBeenCalledWith(false);
    expect(old.hooks.active()).toBe(false);
    f.send.mockClear();
    old.hooks.state("running");
    expect(f.send).not.toHaveBeenCalled();
    const audio = instances[1];
    expect(() =>
      f.video.fromViewer({ type: "native_audio_control", id: audio.hooks.id, enabled: true }),
    ).toThrow();
    f.video.fromViewer({ type: "native_audio_control", id: audio.hooks.id, enabled: false });
    expect(audio.stop).toHaveBeenCalled();
    expect(audio.hooks.active()).toBe(false);
    expect(f.video.hasFreshDraw()).toBe(false);
  } finally {
    f.video.stop();
  }
});
