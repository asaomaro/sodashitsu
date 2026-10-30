import { afterEach, expect, it, vi } from "vitest";
import { CaptureLease } from "./captureLease.js";
const leases: Array<CaptureLease<any>> = [];
afterEach(() => {
  for (const lease of leases.splice(0)) lease.cancel();
  vi.useRealTimers();
});
it("grants only one selected source to its owner once and expires absolutely", async () => {
  let now = 0;
  const expired = vi.fn();
  const lease = new CaptureLease(
    async () => [
      { id: "screen:1", name: "first", display_id: "1" },
      { id: "screen:2", name: "second", display_id: "2" },
    ],
    expired,
    () => now,
  );
  leases.push(lease);
  const list = (await lease.list(1))!;
  expect(lease.permits(1)).toBe(false);
  expect(() => lease.approve(2, list.token, "screen:1")).toThrow();
  lease.approve(1, list.token, "screen:2");
  expect(lease.take(1).id).toBe("screen:2");
  expect(() => lease.take(1)).toThrow();
  now = 30_000;
  expect(() => lease.consume(1, list.token)).toThrow();
  expect(expired).toHaveBeenCalledWith(1, true);
});
it("does not free a retiring source enumeration or revive its old list", async () => {
  let finish!: (sources: any[]) => void;
  const lease = new CaptureLease(
    () =>
      new Promise<any[]>((resolve) => {
        finish = resolve;
      }),
    vi.fn(),
  );
  leases.push(lease);
  const pending = lease.list(1);
  lease.cancel(1);
  await expect(lease.list(2)).rejects.toThrow("前の");
  finish([{ id: "old", name: "old", display_id: "1" }]);
  expect(await pending).toBeNull();
  expect(lease.permits(1)).toBe(false);
});
