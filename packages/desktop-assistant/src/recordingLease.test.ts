import { afterEach, expect, it, vi } from "vitest";
import { RecordingLease } from "./recordingLease.js";

const leases: RecordingLease[] = [];
afterEach(() => {
  for (const lease of leases.splice(0)) lease.cancel();
  vi.useRealTimers();
});
function fixture() {
  let now = 0;
  const expired = vi.fn();
  const lease = new RecordingLease(expired, () => now);
  leases.push(lease);
  return {
    lease,
    expired,
    now(value: number) {
      now = value;
    },
  };
}
const audio = {
  isMainFrame: true,
  requestingUrl: "soda-assistant://app/bubble.html",
  mediaType: "audio",
};
it("allows only audio in the explicitly leased bubble main frame", () => {
  const f = fixture();
  expect(f.lease.permits(1, "media", audio)).toBe(false);
  f.lease.begin(1);
  expect(f.lease.permits(1, "media", audio)).toBe(true);
  expect(f.lease.permits(2, "media", audio)).toBe(false);
  for (const details of [
    { ...audio, isMainFrame: false },
    { ...audio, requestingUrl: "soda-assistant://app/settings.html" },
    { ...audio, requestingUrl: "https://remote.test/bubble.html" },
    { ...audio, mediaType: "video" },
    { ...audio, mediaTypes: ["audio", "video"] },
  ])
    expect(f.lease.permits(1, "media", details)).toBe(false);
  expect(f.lease.permits(1, "display-capture", audio)).toBe(false);
});
it("requires stop/review and the exact owner/token, consuming an upload only once", () => {
  const f = fixture(),
    token = f.lease.begin(1);
  expect(() => f.lease.begin(1)).toThrow("前の録音");
  expect(() => f.lease.consume(1, token)).toThrow("対象");
  expect(() => f.lease.stopped(2, token)).toThrow();
  f.lease.stopped(1, token);
  expect(f.lease.permits(1, "media", audio)).toBe(false);
  f.lease.consume(1, token);
  expect(() => f.lease.consume(1, token)).toThrow();
  const next = f.lease.begin(1);
  expect(next).not.toBe(token);
  expect(() => f.lease.discard(1, token)).toThrow();
  expect(f.lease.has(1)).toBe(true);
});
it("expires by monotonic time before a delayed timer and does not keep the microphone grant", () => {
  const f = fixture(),
    token = f.lease.begin(1);
  f.now(300_001);
  expect(f.lease.permits(1, "media", audio)).toBe(false);
  expect(f.expired).toHaveBeenCalledWith(1, "capturing", token);
  expect(() => f.lease.stopped(1, token)).toThrow();
  expect(f.expired).toHaveBeenCalledOnce();
});
it("has a separate bounded review period and cancels a retired owner without touching a new one", () => {
  const f = fixture(),
    token = f.lease.begin(1);
  f.now(1000);
  f.lease.stopped(1, token);
  f.now(301_001);
  expect(f.lease.has()).toBe(false);
  expect(f.expired).toHaveBeenCalledWith(1, "review", token);
  f.lease.begin(2);
  f.lease.cancel(1);
  expect(f.lease.has(2)).toBe(true);
});
