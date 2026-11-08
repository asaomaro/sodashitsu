import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SubagentConversationControl,
  subagentControlMessage,
} from "./SubagentConversationControl.js";
import type { ConnectionPort } from "../net/ports.js";
const lease1 = "11111111-1111-4111-8111-111111111111",
  lease2 = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333";
const ready = (leaseId = lease1) => ({
  mode: "direct",
  reason: "ready",
  leaseId,
  expiresAt: Date.now() + 10000,
});
const accepted = { status: "accepted", reason: "accepted", turnId: "generated-turn" };
let closers: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
});
afterEach(() => {
  for (const c of closers.splice(0)) c();
  vi.useRealTimers();
});
function fixture(
  reply: (method: string, params: unknown) => unknown | Promise<unknown>,
  id: () => string = () => requestId,
) {
  let scope: string | null = "machine-client-parent-child";
  const request = vi.fn(async (method: string, params: unknown) => reply(method, params)),
    changed = vi.fn(),
    control = new SubagentConversationControl(
      { request } as unknown as Pick<ConnectionPort, "request">,
      { paneId: "generated-parent", agentId: "generated-child" },
      () => scope,
      changed,
      id,
    );
  closers.push(() => control.dispose());
  return {
    control,
    request,
    changed,
    invalidate: () => {
      scope = "other-scope";
    },
  };
}
it("refreshes a typing-expired lease on explicit submit and sends exactly once through the child endpoint", async () => {
  let checks = 0;
  const f = fixture((method) =>
    method === "agent.subagent_control" ? ready(++checks === 1 ? lease1 : lease2) : accepted,
  );
  await f.control.refresh();
  await vi.advanceTimersByTimeAsync(11000);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(await f.control.send("generated message", () => true)).toEqual(accepted);
  expect(f.request.mock.calls[2]).toEqual([
    "agent.subagent_send",
    {
      paneId: "generated-parent",
      agentId: "generated-child",
      leaseId: lease2,
      requestId,
      text: "generated message",
    },
  ]);
  expect(subagentControlMessage(f.control.state)).toContain("処理の完了ではありません");
});
it.each([
  null,
  {},
  { mode: "direct", reason: "ready" },
  { mode: "direct", reason: "ready", leaseId: "invalid", expiresAt: 999999 },
  { mode: "direct", reason: "ready", leaseId: lease1, expiresAt: 1 },
  { mode: "parent-draft", reason: "transport-unavailable" },
])(
  "never enables or attempts direct input for incomplete or unavailable capability %#",
  async (raw) => {
    const f = fixture(() => raw);
    await f.control.refresh();
    expect(f.control.state.capability?.mode).not.toBe("direct");
    expect(await f.control.send("text", () => true)).toBeNull();
    expect(f.request).toHaveBeenCalledTimes(1);
  },
);
it("deduplicates overlapping submits while the fresh control query is pending", async () => {
  let resolve!: (v: unknown) => void,
    count = 0;
  const f = fixture((method) =>
    method === "agent.subagent_control"
      ? ++count === 1
        ? ready()
        : new Promise((r) => {
            resolve = r;
          })
      : accepted,
  );
  await f.control.refresh();
  const first = f.control.send("one", () => true);
  expect(await f.control.send("two", () => true)).toBeNull();
  resolve(ready(lease2));
  await first;
  expect(f.request.mock.calls.filter(([method]) => method === "agent.subagent_send")).toHaveLength(
    1,
  );
});
it.each(["scope", "text", "close"])(
  "does not send after %s changes during a fresh control lookup",
  async (why) => {
    let resolve!: (v: unknown) => void,
      count = 0,
      current = true;
    const f = fixture(() =>
      ++count === 1
        ? ready()
        : new Promise((r) => {
            resolve = r;
          }),
    );
    await f.control.refresh();
    const result = f.control.send("old draft", () => current);
    if (why === "scope") f.invalidate();
    else if (why === "close") f.control.dispose();
    else current = false;
    resolve(ready(lease2));
    expect(await result).toBeNull();
    expect(f.request.mock.calls.every(([method]) => method === "agent.subagent_control")).toBe(
      true,
    );
    if (why !== "text") expect(f.control.state.capability).toBeNull();
  },
);
it("a capability read failure is not delivery-unknown and never triggers a send or parent fallback", async () => {
  let count = 0;
  const f = fixture(() => {
    if (++count === 1) return ready();
    throw { code: "timeout" };
  });
  await f.control.refresh();
  expect(await f.control.send("text", () => true)).toBeNull();
  expect(f.control.state.controlFailed).toBe(true);
  expect(f.control.state.deliveryUnknown).toBe(false);
  expect(subagentControlMessage(f.control.state)).toContain("まだ送信していません");
  expect(f.request).toHaveBeenCalledTimes(2);
});
it("handles an older peer as an unavailable transport without repeated method probes", async () => {
  const f = fixture(() => {
    throw { code: "method_not_found" };
  });
  f.control.start();
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20000);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.control.state.unsupported).toBe(true);
  expect(f.control.state.deliveryUnknown).toBe(false);
});
it.each(["unknown", "throw", "malformed"])(
  "retains unknown delivery and never retries automatically after %s",
  async (why) => {
    const f = fixture((method) => {
      if (method === "agent.subagent_control") return ready();
      if (why === "throw") throw { code: "timeout" };
      return why === "unknown" ? { status: "delivery-unknown", reason: "delivery-unknown" } : {};
    });
    f.control.start();
    await Promise.resolve();
    await Promise.resolve();
    const result = await f.control.send("keep draft", () => true);
    expect(result?.status).toBe("delivery-unknown");
    expect(f.control.state.deliveryUnknown).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await f.control.send("keep draft", () => true)).toBeNull();
    expect(
      f.request.mock.calls.filter(([method]) => method === "agent.subagent_send"),
    ).toHaveLength(1);
  },
);
it("ignores a send response after its parent scope expires", async () => {
  let resolve!: (v: unknown) => void;
  const f = fixture((method) =>
    method === "agent.subagent_control"
      ? ready()
      : new Promise((r) => {
          resolve = r;
        }),
  );
  await f.control.refresh();
  const sent = f.control.send("text", () => true);
  await Promise.resolve();
  await Promise.resolve();
  f.invalidate();
  resolve(accepted);
  expect(await sent).toBeNull();
  expect(f.control.state.last).toBeNull();
  expect(f.control.state.capability).toBeNull();
});

it("does not confuse request-id generation failure with attempted delivery", async () => {
  const f = fixture(
    (method) => (method === "agent.subagent_control" ? ready() : accepted),
    () => {
      throw Error("generated ID failure");
    },
  );
  await f.control.refresh();
  expect(await f.control.send("keep draft", () => true)).toBeNull();
  expect(f.control.state.preparationFailed).toBe(true);
  expect(f.control.state.deliveryUnknown).toBe(false);
  expect(f.request.mock.calls.every(([m]) => m === "agent.subagent_control")).toBe(true);
  expect(subagentControlMessage(f.control.state)).toContain("まだ送信していません");
});
it("does not apply an old send receipt to a replaced draft", async () => {
  let current = true,
    resolve!: (v: unknown) => void;
  const f = fixture((method) =>
    method === "agent.subagent_control"
      ? ready()
      : new Promise((r) => {
          resolve = r;
        }),
  );
  await f.control.refresh();
  const sent = f.control.send("old", () => current);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  current = false;
  resolve(accepted);
  expect(await sent).toBeNull();
  expect(f.control.state.last).toBeNull();
});
