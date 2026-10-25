import { createServer, type Socket } from "node:net";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { WorkAgentClient } from "./workAgentIo.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "soda-proxy-client-")),
    socketPath = join(directory, "proxy.sock");
  let socket!: Socket, held: { id: number } | undefined;
  const calls: any[] = [];
  let gotTool!: () => void, gotCancel!: () => void;
  const tool = new Promise<void>((r) => {
      gotTool = r;
    }),
    cancel = new Promise<void>((r) => {
      gotCancel = r;
    });
  const server = createServer((s) => {
    socket = s;
    s.on("error", () => {});
    s.setEncoding("utf8");
    let buffer = "";
    s.on("data", (chunk) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const m = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        calls.push(m);
        if (m.operation === "tool" && m.tool.operation === "exec") {
          held = m;
          gotTool();
        } else {
          s.write(JSON.stringify({ id: m.id, result: { ok: true } }) + "\n");
          if (m.operation === "cancel") gotCancel();
        }
      }
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, r));
  const capability = join(directory, "capability.json");
  await writeFile(capability, JSON.stringify({ socketPath, secret: "a".repeat(64) }), {
    mode: 0o600,
  });
  const client = await WorkAgentClient.open(capability);
  cleanups.push(async () => {
    client.close();
    socket?.destroy();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    client,
    calls,
    tool,
    cancel,
    terminal: (reason: string) =>
      socket.end(JSON.stringify({ type: "proxy_closed", reason }) + "\n"),
    late: () => socket.write(JSON.stringify({ id: held!.id, result: { completed: true } }) + "\n"),
  };
}
it.skipIf(process.platform === "win32")(
  "keeps IPC usable after one 320s operation timeout, cancels once and ignores its late reply",
  async () => {
    const f = await fixture();
    vi.useFakeTimers();
    const pending = f.client.request("tool", { operation: "exec", command: "uncertain write" });
    const failed = expect(pending).rejects.toThrow(/result unknown/);
    await f.tool;
    await vi.advanceTimersByTimeAsync(320000);
    await failed;
    await expect(f.client.request("tool", { operation: "inspect" })).resolves.toEqual({ ok: true });
    await f.cancel;
    f.late();
    await expect(f.client.request("tool", { operation: "inspect" })).resolves.toEqual({ ok: true });
    expect(
      f.calls.filter((c) => c.operation === "tool" && c.tool.operation === "exec"),
    ).toHaveLength(1);
    expect(f.calls.filter((c) => c.operation === "cancel")).toHaveLength(1);
    expect(f.calls.find((c) => c.operation === "cancel").tool).toEqual({
      reason: "operation_timeout",
    });
  },
);
it.skipIf(process.platform === "win32")(
  "preserves a fixed terminal reason for pending and future requests",
  async () => {
    const f = await fixture();
    const pending = f.client.request("tool", { operation: "exec", command: "waiting" });
    const failed = expect(pending).rejects.toThrow(/24時間/);
    await f.tool;
    f.terminal("lease_expired");
    await failed;
    await expect(f.client.request("tool", { operation: "inspect" })).rejects.toThrow(/24時間/);
  },
);
