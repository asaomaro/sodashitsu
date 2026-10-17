import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { desktopMcp } from "./desktopMcp.js";
import { desktopLines, desktopWrite } from "./desktopIo.js";
import { DesktopAgentSession } from "./desktopSession.js";
import type { SodaClient } from "./wsClient.js";

it("MCP exposes only scoped desktop tools and returns image content without a listener", async () => {
  const input = new PassThrough(),
    output = new PassThrough(),
    received: any[] = [];
  output.on("data", (chunk) =>
    received.push(
      ...String(chunk)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ),
  );
  const close = vi.fn(),
    observe = vi.fn(async () => ({
      observationId: "o",
      imageBase64: "AQID",
      format: "image/png",
      width: 2,
      height: 2,
      frameSeq: 1,
    }));
  const attach = vi.fn(async () => ({ observe, close }) as unknown as DesktopAgentSession);
  const running = desktopMcp(input, output, attach);
  input.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    }) + "\n",
  );
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
  await vi.waitFor(() => expect(received).toHaveLength(2));
  expect(attach).not.toHaveBeenCalled();
  expect(received[1].result.tools.map((t: any) => t.name)).toEqual([
    "desktop_observe",
    "desktop_act",
    "desktop_release",
  ]);
  input.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "desktop_observe", arguments: {} },
    }) + "\n",
  );
  await vi.waitFor(() => expect(received).toHaveLength(3));
  expect(received[2].result.content[0]).toEqual({
    type: "image",
    data: "AQID",
    mimeType: "image/png",
  });
  input.end();
  await running;
  expect(close).toHaveBeenCalled();
});
it("closes an attach that completes after MCP EOF instead of leaving a permission alive", async () => {
  const input = new PassThrough(),
    output = new PassThrough();
  output.resume();
  let resolve!: (s: DesktopAgentSession) => void;
  const close = vi.fn(),
    observe = vi.fn();
  const running = desktopMcp(
    input,
    output,
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  input.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n');
  input.write(
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"desktop_observe"}}\n',
  );
  await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
  input.end();
  await new Promise<void>((r) => setImmediate(r));
  resolve({ close, observe } as unknown as DesktopAgentSession);
  await running;
  expect(close).toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
});
it("bounds incomplete stdio messages", async () => {
  const input = new PassThrough();
  const run = (async () => {
    for await (const _ of desktopLines(input)) {
    }
  })();
  input.end("x".repeat(65537));
  await expect(run).rejects.toThrow("64KiB");
});
it("closes the RPC connection on an uncertain action and never retries", async () => {
  const request = vi.fn(async (method: string) => {
    if (method === "desktop.agent.attach")
      return { leaseId: "x".repeat(43), expiresAt: Date.now() + 30000 };
    throw Error("lost ACK");
  });
  const close = vi.fn(),
    client = { request, close, onClose: vi.fn() } as unknown as SodaClient;
  const session = await DesktopAgentSession.attach(client, "a".repeat(43));
  await expect(session.act("b".repeat(43), [{ kind: "text", text: "test" }])).rejects.toThrow(
    "lost ACK",
  );
  expect(close).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
  expect(session.abort.signal.aborted).toBe(true);
});

it("settles stdout backpressure within a bounded time", async () => {
  vi.useFakeTimers();
  try {
    const output = new PassThrough({ highWaterMark: 1 });
    const writing = desktopWrite(output, { image: "x".repeat(100) });
    const rejected = expect(writing).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2100);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});
