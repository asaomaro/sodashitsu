import { afterEach, describe, it, expect, vi } from "vitest";
import { PluginOperations } from "./PluginOperations.js";
import type { ExtPane, ExtLine } from "@sodashitsu/protocol";
const operation = { name: "history", description: "Read history", inputSchema: { type: "object" } };
function fixture() {
  let runId = "run-1";
  let alive = true;
  const panes = [
    { id: "p1", tabId: "t1", workspaceId: "w1", views: [{ extensionKey: "user:test" }] },
  ] as ExtPane[];
  const send = vi.fn((_line: ExtLine) => true);
  const api = new PluginOperations((key) =>
    key === "user:test" && alive ? { runId, panes, send } : undefined,
  );
  const register = () =>
    api.handle("user:test", runId, { method: "app.register", params: { operations: [operation] } });
  register();
  return {
    api,
    panes,
    send,
    register,
    stop: () => {
      api.stopped("user:test", runId);
      alive = false;
    },
    restart: () => {
      api.stopped("user:test", runId);
      runId = "run-2";
      register();
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("plugin operations", () => {
  it("discovers only attached scoped instances and demands an unambiguous target", () => {
    const f = fixture();
    expect(f.api.list({ key: "user:test", workspaceId: "w1" }).paneId).toBe("p1");
    expect(() => f.api.list({ key: "user:test", paneId: "other" })).toThrow();
    f.panes.push({ ...f.panes[0]!, id: "p2" });
    expect(() => f.api.list({ key: "user:test", workspaceId: "w1" })).toThrow(/複数/);
  });
  it("rejects undisclosed operations without sending them", () => {
    const f = fixture();
    expect(() =>
      f.api.call({ key: "user:test", paneId: "p1", operation: "delete", params: {} }),
    ).toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it("correlates a result with its originating runtime, never another extension", async () => {
    const f = fixture();
    const result = f.api.call({
      key: "user:test",
      tabId: "t1",
      operation: "history",
      params: { limit: 5 },
    });
    const call = f.send.mock.calls[0]![0] as Extract<ExtLine, { type: "app.call" }>;
    expect(call.target).toEqual({ paneId: "p1", tabId: "t1", workspaceId: "w1" });
    f.api.handle("other", "run-1", {
      method: "app.result",
      params: { callId: call.callId, ok: true, result: "wrong" },
    });
    f.api.handle("user:test", "run-1", {
      method: "app.result",
      params: { callId: call.callId, ok: true, result: { rows: [1] } },
    });
    await expect(result).resolves.toEqual({ result: { rows: [1] } });
  });
  it("rejects the reply if the target moved or was detached during execution", async () => {
    const f = fixture(),
      result = f.api.call({ key: "user:test", paneId: "p1", operation: "history", params: {} });
    const assertion = expect(result).rejects.toThrow(/移動/);
    const call = f.send.mock.calls[0]![0] as Extract<ExtLine, { type: "app.call" }>;
    f.panes[0]!.tabId = "t2";
    f.api.handle("user:test", "run-1", {
      method: "app.result",
      params: { callId: call.callId, ok: true, result: "old" },
    });
    await assertion;
  });
  it("clears pending work on stop and registrations are not inherited by a new runtime", async () => {
    const f = fixture(),
      result = f.api.call({ key: "user:test", paneId: "p1", operation: "history", params: {} });
    const assertion = expect(result).rejects.toThrow(/停止/);
    f.stop();
    await assertion;
    expect(() => f.api.list({ key: "user:test", paneId: "p1" })).toThrow();
  });
  it("times out without promising that an operation was cancelled", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      result = f.api.call({ key: "user:test", paneId: "p1", operation: "history", params: {} });
    const assertion = expect(result).rejects.toThrow(/実行済み/);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });
});
