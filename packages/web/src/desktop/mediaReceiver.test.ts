import { expect, it, vi } from "vitest";
import { DesktopMediaReceiver, ImageQualityController } from "./mediaReceiver.js";
it("reduces quality under delayed ACKs and restores slowly within requested ceilings", () => {
  const controller = new ImageQualityController({ fps: 10, quality: 65 });
  expect(controller.sample(500, 0, 0, 2000)).toEqual({ type: "quality", fps: 7, quality: 55 });
  expect(controller.sample(0, 0, 0, 2500)).toBeUndefined();
  controller.sample(0, 0, 0, 4000);
  controller.sample(0, 0, 0, 6000);
  expect(controller.sample(0, 0, 0, 8000)).toEqual({ type: "quality", fps: 8, quality: 60 });
  for (let now = 10000; now < 60000; now += 2000) {
    const next = controller.sample(1000, 0, 1e6, now);
    if (next) {
      expect(next.fps).toBeGreaterThanOrEqual(1);
      expect(next.quality).toBeGreaterThanOrEqual(35);
    }
  }
});

it("expires a frozen video and restores the native image via the state callback", async () => {
  vi.useFakeTimers();
  let tick!: () => void;
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      close() {}
    },
  );
  Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", {
    configurable: true,
    value: vi.fn((callback) => {
      tick = () => callback(0, {} as VideoFrameCallbackMetadata);
      return 1;
    }),
  });
  Object.defineProperty(HTMLVideoElement.prototype, "cancelVideoFrameCallback", {
    configurable: true,
    value: vi.fn(),
  });
  const state = vi.fn(),
    send = vi.fn(),
    draw = vi.fn();
  const receiver = new DesktopMediaReceiver("test", send, draw, state);
  try {
    Object.defineProperty(receiver.video, "readyState", { value: 2 });
    await vi.advanceTimersByTimeAsync(10);
    tick();
    expect(receiver.active).toBe(true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(receiver.active).toBe(false);
    expect(send).toHaveBeenCalledWith({ type: "media", enabled: false });
    expect(state).toHaveBeenCalledWith("images");
  } finally {
    receiver.stop();
    delete (HTMLVideoElement.prototype as any).requestVideoFrameCallback;
    delete (HTMLVideoElement.prototype as any).cancelVideoFrameCallback;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
