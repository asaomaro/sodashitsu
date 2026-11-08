import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ConnectionPort } from "../net/ports.js";
import { SubagentUsageReader } from "./SubagentUsageReader.js";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const response = {
  status: "ok",
  usage: {
    source: "rollout",
    consumptionScope: "self",
    tokens: { basis: "transcript", total: 123 },
  },
};
function fixture(reply: () => unknown | Promise<unknown>) {
  let scope: string | null = "parent-instance-kind-ref-machine-client",
    active = true;
  const request = vi.fn(async () => reply()),
    changed = vi.fn();
  const reader = new SubagentUsageReader(
    { request } as unknown as Pick<ConnectionPort, "request">,
    { paneId: "parent", agentId: "child" },
    () => scope,
    changed,
    () => active,
  );
  return {
    reader,
    request,
    changed,
    invalidate: () => {
      scope = "other-parent";
    },
    hide: () => {
      active = false;
    },
  };
}
it("reads child-only usage independently of transcript/input capability and serializes refresh", async () => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const read = f.reader.refresh();
  await f.reader.refresh();
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]).toEqual([
    "agent.subagent_usage",
    { paneId: "parent", agentId: "child" },
  ]);
  finish(response);
  await read;
  expect(f.reader.state.result).toEqual(response);
  f.reader.dispose();
});
it.each(["scope", "close"])("rejects a late numeric reply after %s changes", async (why) => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const read = f.reader.refresh();
  if (why === "scope") f.invalidate();
  else f.reader.dispose();
  finish(response);
  await read;
  expect(f.reader.state.result).toBeNull();
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
  f.reader.dispose();
});
it("never starts a read from a stale scope or an inactive view and stops periodic reads on close", async () => {
  const f = fixture(() => response);
  f.reader.start();
  await Promise.resolve();
  await Promise.resolve();
  f.hide();
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
  f.reader.dispose();
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
  const stale = fixture(() => response);
  stale.invalidate();
  await stale.reader.refresh();
  expect(stale.request).not.toHaveBeenCalled();
});
it("clears a successful value after failure and represents an old method as unavailable, never zero", async () => {
  let fail = false;
  const f = fixture(() => {
    if (fail) throw { code: "method_not_found" };
    return response;
  });
  await f.reader.refresh();
  fail = true;
  await f.reader.refresh();
  expect(f.reader.state.result).toBeNull();
  expect(f.reader.state.failed).toBe(true);
  f.reader.dispose();
});
it("clears an already displayed value as soon as its scope is invalidated", async () => {
  const f = fixture(() => response);
  await f.reader.refresh();
  expect(f.reader.state.result).toEqual(response);
  f.invalidate();
  expect(f.reader.state.result).toBeNull();
  expect(f.request).toHaveBeenCalledTimes(1);
});
