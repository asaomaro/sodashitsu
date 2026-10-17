import { expect, it } from "vitest";
import { DesktopViewerMessage } from "./desktop.js";
import {
  DesktopClipboardRequest,
  DesktopIceServers,
  decodeDesktopMediaChunk,
  encodeDesktopMediaChunk,
} from "./desktopMedia.js";
it("bounds compressed media chunks and preserves generation and sequence", () => {
  const packet = encodeDesktopMediaChunk(2, 5, new Uint8Array([1, 2, 3]));
  expect(decodeDesktopMediaChunk(packet)).toEqual({
    generation: 2,
    seq: 5,
    data: new Uint8Array([1, 2, 3]),
  });
  expect(() => decodeDesktopMediaChunk(packet.subarray(0, 12))).toThrow();
  expect(() => encodeDesktopMediaChunk(0, 1, new Uint8Array([1]))).toThrow();
  expect(() => encodeDesktopMediaChunk(1, 1, new Uint8Array(512 * 1024 + 1))).toThrow();
});
it("accepts only bounded clipboard operations and typed signaling", () => {
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "write",
      text: "日本語\n😀",
    }).success,
  ).toBe(true);
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "read",
      text: "unexpected",
    }).success,
  ).toBe(false);
  expect(
    DesktopClipboardRequest.safeParse({
      type: "clipboard",
      id: 1,
      operation: "write",
      text: "x".repeat(8193),
    }).success,
  ).toBe(false);
  expect(DesktopIceServers.safeParse([{ urls: "https://bad.example" }]).success).toBe(false);
  expect(
    DesktopViewerMessage.safeParse({
      type: "rtc_signal",
      id: crypto.randomUUID(),
      signal: { kind: "offer", sdp: "x".repeat(24577) },
    }).success,
  ).toBe(false);
});
