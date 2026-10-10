import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261010-agent-usage PR3 の AC2。実物の `composeServer`・実 PTY の bash・偽の `claude`・作った記録の上で、利用状況の配信（`agent.usage_changed`）を確かめる:
 * **見ている（`agent.usage_watch {on: true}`）接続にだけ**届く・見るのをやめたら届かない・変わっていなければ届かない・`sodactl` の `pane.sock` では呼べない。
 */
vi.setConfig({ testTimeout: 90_000 });

const fakeAgent = `
import { connect } from "node:net";
const pane = process.env.SODA_PANE_ID;
const sessionId = process.env.FAKE_SESSION_ID;
const transcriptPath = process.env.FAKE_TRANSCRIPT;
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
const sock = process.env.SODA_AGENT_REPORT_SOCKET;
if (sock && sessionId) {
  const c = connect(sock, () => c.end(JSON.stringify({ paneId: pane, kind: "claude", sessionId, ...(transcriptPath ? { transcriptPath } : {}) }) + "\\n"));
  c.on("error", () => {});
}
process.stdin.on("data", () => {});
setInterval(() => {}, 1000);
`;

const SID = "3e81f9a7-a757-461a-b21c-196db1d9196e";

function assistant(id: string, out: number): string {
  return (
    JSON.stringify({
      type: "assistant",
      uuid: `u-${id}`,
      timestamp: "2026-10-10T00:00:00.000Z",
      message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: 2, output_tokens: out }, content: [{ type: "text", text: "x" }] },
    }) + "\n"
  );
}

interface Client {
  request(method: string, params: unknown): Promise<{ result?: any; error?: { code: string; message?: string } }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 受け取った `agent.usage_changed` の中身。 */
  changes: { panes: Record<string, any>; accounts?: unknown }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: 利用状況の配信（20261010-agent-usage PR3・実 PTY・偽の claude）", () => {
  let dir: string;
  let projects: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-usagefeed-it-"));
    projects = join(dir, ".claude", "projects");
    await mkdir(join(dir, "bin"), { recursive: true });
    await mkdir(projects, { recursive: true });
    await writeFile(join(dir, "fake-agent.mjs"), fakeAgent);
    const wrapper = join(dir, "bin", "claude");
    await writeFile(wrapper, `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
    await chmod(wrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"] };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
    delete process.env["CLAUDE_CONFIG_DIR"];
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
    await rm(projects, { recursive: true, force: true });
    await mkdir(projects, { recursive: true });
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function connectClient(server: ComposedServer): Promise<Client & { close(): void }> {
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const login = await fetch(`${origin}/api/login`, { method: "POST", headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` }, body: JSON.stringify({ token: server.freshToken }) });
    expect(login.status).toBe(204);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const pending = new Map<string, (v: { result?: unknown; error?: { code: string; message?: string } }) => void>();
    const changes: Client["changes"] = [];
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as { id?: string; result?: unknown; error?: { code: string; message?: string }; event?: string; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (msg.event === "agent.usage_changed") changes.push(msg.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.(msg.error !== undefined ? { error: msg.error } : { result: msg.result });
      }
    });
    let seq = 0;
    const request: Client["request"] = (method, params) =>
      new Promise((resolve) => {
        const id = `r${++seq}`;
        pending.set(id, resolve as never);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await request("client.hello", { protocol: 1, kind: "desktop" });
    return { request, changes, close: () => ws.close() };
  }

  async function bootWithAgent(output: number): Promise<{ server: ComposedServer; paneId: string; record: string }> {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/bash" });
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    const record = join(projects, "proj-a", `${SID}.jsonl`);
    await mkdir(join(projects, "proj-a"), { recursive: true });
    await writeFile(record, assistant("m1", output));
    const marker = join(dir, `ready-${server.options.port}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
    server.terminals.get(paneId)!.write(`FAKE_SESSION_ID=${SID} FAKE_TRANSCRIPT=${JSON.stringify(record)} claude\r`);
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(SID), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agent).not.toBeNull(), { timeout: 15_000, interval: 50 });
    return { server, paneId, record };
  }

  it("見ている接続にだけ届く。見ていない接続・見るのをやめた接続には届かない。変わっていなければ届かない", async () => {
    const { server, paneId, record } = await bootWithAgent(5);
    const watcher = await connectClient(server);
    const other = await connectClient(server);
    cleanups.push(() => watcher.close(), () => other.close());
    expect((await watcher.request("agent.usage_watch", { on: true })).error).toBeUndefined();
    // 5 秒おきの確かめで、最初の値が届く
    await vi.waitFor(() => expect(watcher.changes.some((c) => c.panes[paneId]?.tokens.output === 5)).toBe(true), { timeout: 20_000, interval: 250 });
    const afterFirst = watcher.changes.length;
    expect(other.changes).toHaveLength(0); // 見ていない接続には届かない（否定の対照: 絞りが無ければ届く）
    // 記録が増えると、増えた値が届く（変わっていない間は届かない）
    await writeFile(record, assistant("m1", 5) + assistant("m2", 10));
    await vi.waitFor(() => expect(watcher.changes.some((c) => c.panes[paneId]?.tokens.output === 15)).toBe(true), { timeout: 20_000, interval: 250 });
    expect(other.changes).toHaveLength(0);
    // 見るのをやめたら、増えても届かない
    await watcher.request("agent.usage_watch", { on: false });
    const n = watcher.changes.length;
    expect(n).toBeGreaterThan(afterFirst);
    await writeFile(record, assistant("m1", 5) + assistant("m2", 10) + assistant("m3", 100));
    await new Promise((r) => setTimeout(r, 7_500));
    expect(watcher.changes).toHaveLength(n);
    // 見始めると、また届く
    await watcher.request("agent.usage_watch", { on: true });
    await vi.waitFor(() => expect(watcher.changes.some((c) => c.panes[paneId]?.tokens.output === 115)).toBe(true), { timeout: 20_000, interval: 250 });
    expect(other.changes).toHaveLength(0);
  });

  it("入力の形が違えば断る。会話の中身・記録の場所は、配信のどこにも出ない", async () => {
    const { server, paneId } = await bootWithAgent(7);
    const watcher = await connectClient(server);
    cleanups.push(() => watcher.close());
    expect((await watcher.request("agent.usage_watch", { on: "yes" })).error?.code).toBe("invalid_params");
    expect((await watcher.request("agent.usage_watch", {})).error?.code).toBe("invalid_params");
    await watcher.request("agent.usage_watch", { on: true });
    await vi.waitFor(() => expect(watcher.changes.some((c) => c.panes[paneId] !== undefined)).toBe(true), { timeout: 20_000, interval: 250 });
    const json = JSON.stringify(watcher.changes);
    expect(json).not.toContain(dir);
    expect(json).not.toContain(".jsonl");
  });
});
