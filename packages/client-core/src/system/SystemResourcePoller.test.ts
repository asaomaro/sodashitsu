import { expect, it, vi } from "vitest";
import type { SystemResources } from "@sodashitsu/protocol";
import { SystemResourcePoller } from "./SystemResourcePoller.js";
it("polls only while active and stops requesting when hidden", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => ({ sampledAt: 1 }) as SystemResources),
    changed = vi.fn();
  const poller = new SystemResourcePoller(fetch, changed);
  try {
    expect(fetch).not.toHaveBeenCalled();
    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
    poller.setActive(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    poller.setActive(false);
    vi.useRealTimers();
  }
});
it("ignores stale responses after disconnect and reconnect", async () => {
  let resolve!: (data: SystemResources) => void;
  const first = new Promise<SystemResources>((r) => {
    resolve = r;
  });
  const changed = vi.fn(),
    fetch = vi.fn().mockReturnValueOnce(first).mockResolvedValue({ sampledAt: 2 });
  const poller = new SystemResourcePoller(fetch, changed);
  try {
    poller.setActive(true);
    poller.setActive(false);
    poller.setActive(true);
    await Promise.resolve();
    resolve({ sampledAt: 1 } as SystemResources);
    await Promise.resolve();
    expect(changed).not.toHaveBeenCalledWith({ sampledAt: 1 }, false);
    expect(changed).toHaveBeenCalledWith({ sampledAt: 2 }, false);
  } finally {
    poller.setActive(false);
  }
});
