import { expect, it, vi, afterEach } from "vitest";
import { WorkAgentTerminalBridge } from "./WorkAgentTerminalBridge.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { WorkAgentReconnect } from "./WorkAgentReconnect.js";
import type { ClientSink } from "../terminal/OutputFanout.js";
afterEach(() => vi.useRealTimers());
function fixture(input: object[]) {
  let sink!: ClientSink;
  const writeInput = vi.fn(() => true),
    unsubscribe = vi.fn(),
    resize = vi.fn(),
    failed = vi.fn();
  const host = {
    fanout: {
      subscribe: (s: ClientSink) => {
        sink = s;
      },
      unsubscribe,
      retryStale() {},
    },
    writeInput,
  } as unknown as TerminalHost;
  const request = vi.fn(async (_method: string, p: { ack: number }) => ({
    epoch: "epoch",
    outputAck: 0,
    input: input.filter((value) => (value as { seq: number }).seq > p.ack),
  }));
  const remote = {
    ready: async () => {},
    request,
    valid: () => true,
  } as unknown as WorkAgentReconnect;
  const bridge = new WorkAgentTerminalBridge(
    host,
    remote,
    { id: "request", claim: "claim", epoch: "epoch" },
    () => {},
    resize,
    failed,
  );
  return { bridge, writeInput, request, failed, resize, unsubscribe, sink: () => sink };
}
it("never writes duplicate delivered inputs and acknowledges them in later exchanges", async () => {
  vi.useFakeTimers();
  const f = fixture([{ seq: 1, data: Buffer.from("hello").toString("base64"), expiresInMs: 1000 }]);
  try {
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(f.writeInput).toHaveBeenCalledTimes(1);
    expect(f.request.mock.calls.length).toBeGreaterThan(1);
  } finally {
    f.bridge.dispose();
  }
});
it("refuses a job-suspend byte before any input reaches the fixed executor PTY", async () => {
  vi.useFakeTimers();
  const f = fixture([
    { seq: 1, data: Buffer.from("\x1ashell command\r").toString("base64"), expiresInMs: 1000 },
  ]);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.writeInput).not.toHaveBeenCalled();
  expect(f.failed).toHaveBeenCalledOnce();
  expect(f.unsubscribe).toHaveBeenCalledOnce();
});
it("acknowledges discarded or expired input without applying it", async () => {
  vi.useFakeTimers();
  const f = fixture([
    { seq: 1, discarded: true },
    { seq: 2, data: Buffer.from("old").toString("base64"), expiresInMs: 0 },
  ]);
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(f.writeInput).not.toHaveBeenCalled();
    expect(f.failed).not.toHaveBeenCalled();
  } finally {
    f.bridge.dispose();
  }
});
