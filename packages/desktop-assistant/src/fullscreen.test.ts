import { expect, it, vi } from "vitest";
import { FullscreenPolicy } from "./fullscreen.js";
it("coalesces fixed foreground queries, caches briefly and suppresses on unknown", async () => {
  let now = 0,
    finish!: (value: boolean | null) => void;
  const read = vi.fn(
    () =>
      new Promise<boolean | null>((resolve) => {
        finish = resolve;
      }),
  );
  const policy = new FullscreenPolicy(read, () => now);
  const one = policy.quiet(),
    two = policy.quiet();
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(1);
  finish(true);
  expect(await one).toBe(true);
  expect(await two).toBe(true);
  await policy.quiet();
  expect(read).toHaveBeenCalledTimes(1);
  now = 2001;
  const unknown = policy.quiet();
  await Promise.resolve();
  finish(null);
  expect(await unknown).toBe(true);
  policy.invalidate();
  const normal = policy.quiet();
  await Promise.resolve();
  finish(false);
  expect(await normal).toBe(false);
});
it("does not cache a pre-resume normal result after invalidation", async () => {
  let finish!: (value: boolean | null) => void;
  const read = vi.fn(
    () =>
      new Promise<boolean | null>((resolve) => {
        finish = resolve;
      }),
  );
  const policy = new FullscreenPolicy(read);
  const old = policy.quiet();
  await Promise.resolve();
  policy.invalidate();
  finish(false);
  expect(await old).toBe(true);
  const fresh = policy.quiet();
  await Promise.resolve();
  finish(false);
  expect(await fresh).toBe(false);
  expect(read).toHaveBeenCalledTimes(2);
});
