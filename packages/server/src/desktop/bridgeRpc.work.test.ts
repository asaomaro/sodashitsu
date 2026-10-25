import { afterEach, expect, it, vi } from "vitest";
import type { LinkChannel } from "../machine/MachineLink.js";
import { DesktopBridgeRpc, DesktopBridgeError } from "./bridgeRpc.js";
afterEach(() => vi.useRealTimers());
it("marks a timed-out work channel closed before its transport close callback arrives", async () => {
  vi.useFakeTimers();
  const channel = {
    sendText: vi.fn(),
    onText: vi.fn(),
    onClose: vi.fn(),
    close: vi.fn(),
  } as unknown as LinkChannel;
  const rpc = new DesktopBridgeRpc(channel, vi.fn(), { label: "リモート作業" });
  const pending = rpc.request(
    "work.agent_check",
    { id: crypto.randomUUID(), claim: crypto.randomUUID() },
    { timeoutMs: 5 },
  );
  const rejected = expect(pending).rejects.toMatchObject({ reason: "timeout" });
  await vi.advanceTimersByTimeAsync(6);
  await rejected;
  expect(rpc.isClosed()).toBe(true);
  expect(channel.close).toHaveBeenCalledOnce();
});
it("distinguishes a remote rejection from transport failure without exposing its message", async () => {
  let receive!: (text: string) => void;
  const channel = {
    sendText: vi.fn(),
    onText: (f: typeof receive) => {
      receive = f;
    },
    onClose: vi.fn(),
    close: vi.fn(),
  } as unknown as LinkChannel;
  const rpc = new DesktopBridgeRpc(channel, vi.fn(), { label: "リモート作業" });
  const pending = rpc.request("work.agent_check", {
    id: crypto.randomUUID(),
    claim: crypto.randomUUID(),
  });
  const id = JSON.parse(vi.mocked(channel.sendText).mock.calls[0]![0]).id;
  receive(JSON.stringify({ id, error: { code: "not_found", message: "private secret path" } }));
  await expect(pending).rejects.toBeInstanceOf(DesktopBridgeError);
  await expect(pending).rejects.toMatchObject({ reason: "rejected" });
  await expect(pending).rejects.not.toThrow("private");
  expect(rpc.isClosed()).toBe(false);
  rpc.close();
});
