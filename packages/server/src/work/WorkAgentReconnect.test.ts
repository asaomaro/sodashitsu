import { expect, it, vi } from "vitest";
import { DesktopBridgeError } from "../desktop/bridgeRpc.js";
import { WorkAgentReconnect, type WorkAgentRemote } from "./WorkAgentReconnect.js";

function remote() {
  let online = true,
    closed = false;
  const request = vi.fn(async () => ({}));
  return {
    request,
    valid: () => online && !closed,
    close: vi.fn(() => {
      closed = true;
    }),
    disconnect: () => {
      online = false;
    },
  };
}
function fixture() {
  const original = remote(),
    replacement = remote();
  let now = 0;
  const connect = vi.fn(async () => replacement as unknown as WorkAgentRemote),
    validate = vi.fn(async (_r: WorkAgentRemote) => {}),
    event = vi.fn(),
    fatal = vi.fn();
  const connection = new WorkAgentReconnect(
    original as unknown as WorkAgentRemote,
    connect,
    validate,
    event,
    fatal,
    60000,
    () => now,
  );
  return {
    original,
    replacement,
    connect,
    validate,
    event,
    fatal,
    connection,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
it("keeps the initial channel until disconnected and validates one replacement for concurrent callers", async () => {
  const f = fixture();
  await f.connection.ready();
  expect(f.connect).not.toHaveBeenCalled();
  f.original.disconnect();
  await Promise.all([f.connection.ready(), f.connection.ready(), f.connection.ready()]);
  expect(f.connect).toHaveBeenCalledTimes(1);
  expect(f.validate).toHaveBeenCalledExactlyOnceWith(f.replacement);
  expect(f.original.close).toHaveBeenCalledOnce();
  expect(f.connection.valid()).toBe(true);
  await f.connection.request("work.agent_check", { id: "request", claim: "claim" });
  expect(f.replacement.request).toHaveBeenCalledOnce();
  expect(f.event.mock.calls.map(([e]) => e.event)).toEqual(["disconnected", "reconnected"]);
  f.connection.close();
});
it("never replays a write whose reply was lost; recovery permits only a new request", async () => {
  const f = fixture();
  f.original.request.mockRejectedValueOnce(new DesktopBridgeError("closed", "private error"));
  const write = {
    id: "request",
    claim: "claim",
    tool: { operation: "memory", action: "write", content: "secret" },
  } as never;
  await expect(f.connection.request("work.agent_tool", write)).rejects.toThrow(/結果/);
  expect(f.original.request).toHaveBeenCalledTimes(1);
  await f.connection.ready();
  expect(f.replacement.request).not.toHaveBeenCalled();
  await f.connection.request("work.agent_check", { id: "request", claim: "claim" });
  expect(f.replacement.request).toHaveBeenCalledExactlyOnceWith(
    "work.agent_check",
    expect.anything(),
  );
  expect(JSON.stringify(f.event.mock.calls)).not.toMatch(/private|secret|content|claim/);
  f.connection.close();
});
it("leaves a rejected operation on the same channel and does not retry it", async () => {
  const f = fixture();
  f.original.request.mockRejectedValueOnce(new DesktopBridgeError("rejected", "denied"));
  await expect(
    f.connection.request("work.agent_check", { id: "request", claim: "claim" }),
  ).rejects.toThrow("denied");
  expect(f.connection.valid()).toBe(true);
  expect(f.connect).not.toHaveBeenCalled();
  f.connection.close();
});
it("allows temporary connect failures during the grace period and closes once it expires", async () => {
  const f = fixture();
  f.original.disconnect();
  f.connect.mockRejectedValue(Error("offline"));
  await expect(f.connection.ready()).rejects.toThrow(/再確認/);
  expect(f.fatal).not.toHaveBeenCalled();
  f.advance(59999);
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.fatal).not.toHaveBeenCalled();
  f.advance(1);
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.fatal).toHaveBeenCalledExactlyOnceWith("reconnect_expired");
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.fatal).toHaveBeenCalledOnce();
});
it("refuses a replacement when the original authority/project validation is rejected", async () => {
  const f = fixture();
  f.original.disconnect();
  f.validate.mockRejectedValue(new DesktopBridgeError("rejected", "sensitive path"));
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.fatal).toHaveBeenCalledExactlyOnceWith("target_validation_failed");
  expect(f.replacement.close).toHaveBeenCalledOnce();
  expect(f.connection.valid()).toBe(false);
  expect(f.replacement.request).not.toHaveBeenCalled();
  expect(JSON.stringify(f.event.mock.calls)).not.toContain("sensitive");
});
it("retries validation after transport failure but never adopts an unvalidated channel", async () => {
  const f = fixture();
  f.original.disconnect();
  f.validate.mockRejectedValueOnce(new DesktopBridgeError("timeout", "timeout"));
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.connection.valid()).toBe(false);
  expect(f.fatal).not.toHaveBeenCalled();
  const next = remote();
  f.connect.mockResolvedValueOnce(next as unknown as WorkAgentRemote);
  await f.connection.ready();
  expect(f.validate).toHaveBeenCalledTimes(2);
  expect(f.connection.valid()).toBe(true);
  f.connection.close();
});
it("closes a late candidate after the proxy was terminated during reconnect", async () => {
  const f = fixture();
  f.original.disconnect();
  let resolve!: (r: WorkAgentRemote) => void;
  f.connect.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const retry = f.connection.ready();
  f.connection.close();
  resolve(f.replacement as unknown as WorkAgentRemote);
  await expect(retry).rejects.toThrow();
  expect(f.replacement.close).toHaveBeenCalledOnce();
  expect(f.validate).not.toHaveBeenCalled();
});
it("does not adopt a candidate that completed validation beyond the recovery deadline", async () => {
  const f = fixture();
  f.original.disconnect();
  f.validate.mockImplementationOnce(async () => {
    f.advance(60001);
  });
  await expect(f.connection.ready()).rejects.toThrow();
  expect(f.fatal).toHaveBeenCalledExactlyOnceWith("reconnect_expired");
  expect(f.replacement.close).toHaveBeenCalledOnce();
  expect(f.connection.valid()).toBe(false);
});

it("terminates a live proxy when a rejected operation's original authority is also rejected", async () => {
  const f = fixture();
  f.original.request.mockRejectedValueOnce(new DesktopBridgeError("rejected", "tool denied"));
  f.validate.mockRejectedValueOnce(new DesktopBridgeError("rejected", "source pane removed"));
  await expect(
    f.connection.request("work.agent_check", { id: "request", claim: "claim" }),
  ).rejects.toThrow("tool denied");
  expect(f.fatal).toHaveBeenCalledExactlyOnceWith("target_validation_failed");
  expect(f.connection.valid()).toBe(false);
  expect(f.original.request).toHaveBeenCalledTimes(1);
});
it("waits for recovery when the rejection's authority recheck itself loses transport", async () => {
  const f = fixture();
  f.original.request.mockRejectedValueOnce(new DesktopBridgeError("rejected", "tool denied"));
  f.validate.mockRejectedValueOnce(new DesktopBridgeError("timeout", "recheck timed out"));
  await expect(
    f.connection.request("work.agent_check", { id: "request", claim: "claim" }),
  ).rejects.toThrow("tool denied");
  expect(f.fatal).not.toHaveBeenCalled();
  expect(f.connection.valid()).toBe(false);
  await f.connection.ready();
  expect(f.connection.valid()).toBe(true);
  f.connection.close();
});

it("closes a candidate immediately when the proxy ends during target validation", async () => {
  const f = fixture();
  f.original.disconnect();
  let finish!: () => void;
  f.validate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.connection.ready();
  await Promise.resolve();
  f.connection.close();
  expect(f.replacement.close).toHaveBeenCalledOnce();
  finish();
  await expect(pending).rejects.toThrow();
  expect(f.replacement.close).toHaveBeenCalledOnce();
});

it("records a fixed RPC timeout cause without recording raw errors", async () => {
  const f = fixture();
  f.original.request.mockRejectedValueOnce(new DesktopBridgeError("timeout", "private details"));
  await expect(
    f.connection.request("work.agent_check", { id: "id", claim: "secret" }),
  ).rejects.toThrow();
  expect(f.event).toHaveBeenCalledWith({ event: "disconnected", cause: "rpc_timeout" });
  expect(JSON.stringify(f.event.mock.calls)).not.toContain("private");
  f.connection.close();
});
