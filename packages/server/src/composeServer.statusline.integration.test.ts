import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261010-agent-usage の PR2（AC4・AC6）。実物の `composeServer`（一時の stateDir・HOME も一時）・実 PTY の bash・偽の `claude` の上で、
 * **実物の包みのスクリプト**（`assets/soda-statusline.cjs`）を、偽の `claude` の子として動かし、報告が `agent.usage` に届くことを確かめる。
 * 誰の報告か: #128 の pid の確かめと、会話の id が pane の今の参照と一致すること。偽の報告（別の会話・シェルの子孫でないプロセス）は捨てる。
 * 利用者の本物の `~/.claude` には触れない（HOME・CLAUDE_CONFIG_DIR を一時のフォルダへ）。
 */
vi.setConfig({ testTimeout: 60_000 });

const WRAPPER = fileURLToPath(new URL("../assets/soda-statusline.cjs", import.meta.url));
const SID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const OTHER = "9c9c9c9c-1111-4111-8111-999999999999";

// 偽の claude: 起動したら、フックの報告（会話の id）を送る（`FAKE_DELAY_HOOK` ms 遅らせられる）。標準入力の 1 行 `STATUS <json>` を受けたら、
// 実物の包みを、自分の子として動かして、その JSON を渡す（本物の Claude Code が、ステータスラインを動かすのと同じ形）。
const fakeAgent = `
import { connect } from "node:net";
import { spawn } from "node:child_process";
const pane = process.env.SODA_PANE_ID;
const sessionId = process.env.FAKE_SESSION_ID;
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
const hook = () => {
  const sock = process.env.SODA_AGENT_REPORT_SOCKET;
  if (!sock || !sessionId) return;
  const c = connect(sock, () => c.end(JSON.stringify({ paneId: pane, kind: "claude", sessionId, agentPid: process.pid }) + "\\n"));
  c.on("error", () => {});
};
setTimeout(hook, Number(process.env.FAKE_DELAY_HOOK || 0));
let buf = "";
process.stdin.on("data", (d) => {
  buf += String(d);
  for (;;) {
    const i = buf.search(/[\\r\\n]/);
    if (i < 0) break;
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.startsWith("STATUS ")) continue;
    const child = spawn(process.execPath, [process.env.WRAPPER, Buffer.from(JSON.stringify({ type: "command", command: "true" })).toString("base64url")], { stdio: ["pipe", "ignore", "ignore"], env: process.env });
    child.stdin.end(line.slice(7));
  }
});
setInterval(() => {}, 1000);
`;

interface Client {
  request(method: string, params: unknown): Promise<{ result?: any; error?: { code: string; message?: string } }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: ステータスラインの包みの報告（20261010-agent-usage PR2・実 PTY・偽の claude・実物の包み）", () => {
  let dir: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-statusline-it-"));
    await mkdir(join(dir, "bin"), { recursive: true });
    await writeFile(join(dir, "fake-agent.mjs"), fakeAgent);
    const wrapper = join(dir, "bin", "claude");
    await writeFile(wrapper, `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
    await chmod(wrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"], CLAUDE_CONFIG_DIR: process.env["CLAUDE_CONFIG_DIR"], CLAUDE_PID: process.env["CLAUDE_PID"] };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
    delete process.env["CLAUDE_CONFIG_DIR"];
    delete process.env["CLAUDE_PID"]; // この試験を動かしている開発セッションの値を、包みに拾わせない
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function boot(): Promise<{ server: ComposedServer; client: Client; stateDir: string; paneId: string }> {
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
    cleanups.push(() => ws.close());
    const pending = new Map<string, (v: { result?: unknown; error?: { code: string; message?: string } }) => void>();
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as { id?: string; result?: unknown; error?: { code: string; message?: string } };
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
    return { server, client: { request }, stateDir, paneId: server.session.snapshot().panes[0]!.id };
  }

  async function runAgent(server: ComposedServer, paneId: string, env: Record<string, string>, waitRef = true): Promise<void> {
    const marker = join(dir, `ready-${server.options.port}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
    const assigns = Object.entries({ WRAPPER, ...env })
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    server.terminals.get(paneId)!.write(`${assigns} claude\r`);
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agent).not.toBeNull(), { timeout: 15_000, interval: 50 });
    if (waitRef) await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(env["FAKE_SESSION_ID"]), { timeout: 15_000, interval: 50 });
  }

  const status = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({
      session_id: SID,
      session_name: "SECRET-NAME",
      cwd: "/secret/cwd",
      transcript_path: "/secret/t.jsonl",
      model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
      cost: { total_cost_usd: 1.25 },
      context_window: { used_percentage: 42.5, context_window_size: 200000, total_input_tokens: 85000, total_output_tokens: 3000, current_usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 84970, output_tokens: 5 } },
      rate_limits: { five_hour: { used_percentage: 12, resets_at: 4_000_000_000 }, seven_day: { used_percentage: 30.5, resets_at: 4_000_100_000 } },
      ...over,
    });
  const sendStatus = (server: ComposedServer, paneId: string, json: string): void => server.terminals.get(paneId)!.write(`STATUS ${json}\r`);
  const usageOf = async (client: Client, paneId: string) => (await client.request("agent.usage", { paneId })).result;

  it("偽の claude の子として動いた実物の包みの報告が、agent.usage に届く: コスト（reported）・コンテキスト・制限の枠。名前・場所は答えのどこにも無い", async () => {
    const { server, client, paneId } = await boot();
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID });
    sendStatus(server, paneId, status());
    await vi.waitFor(async () => expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBe(1.25), { timeout: 15_000, interval: 200 });
    const r = await usageOf(client, paneId);
    expect(r.panes[paneId]).toMatchObject({ kind: "claude", costBasis: "reported", contextUsedPct: 42.5, contextWindowTokens: 200000, contextTokens: 85000, source: "statusline", model: "claude-opus-5-5", tokens: { basis: "context" } });
    expect(r.accounts).toHaveLength(1);
    expect(r.accounts[0]).toMatchObject({ kind: "claude", label: "Claude Code", source: "statusline" });
    expect(r.accounts[0].windows.map((w: { label: string; usedPct: number }) => [w.label, w.usedPct])).toEqual([["5 時間", 12], ["週", 30.5]]);
    expect(r.accounts[0].windows[0].resetsAt).toBe(4_000_000_000 * 1000);
    const json = JSON.stringify(r);
    for (const secret of ["SECRET-NAME", "/secret/cwd", "/secret/t.jsonl", dir]) expect(json, secret).not.toContain(secret);
  });

  it("別の会話の session_id の報告は捨てる（前の値は変わらない）。否定の対照: 一致する報告なら届く", async () => {
    const { server, client, paneId } = await boot();
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID });
    sendStatus(server, paneId, status());
    await vi.waitFor(async () => expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBe(1.25), { timeout: 15_000, interval: 200 });
    sendStatus(server, paneId, status({ session_id: OTHER, cost: { total_cost_usd: 99 } }));
    await new Promise((r) => setTimeout(r, 12_000)); // 保留（1・3・8 秒）を過ぎるまで
    expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBe(1.25);
    sendStatus(server, paneId, status({ cost: { total_cost_usd: 2.5 } }));
    await vi.waitFor(async () => expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBe(2.5), { timeout: 15_000, interval: 200 });
  });

  it("pane のシェルの子孫でないプロセスの報告（偽の報告を、ソケットへ直接）は捨てる", async () => {
    const { server, client, paneId, stateDir } = await boot();
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID });
    await new Promise<void>((resolve, reject) => {
      const c = connect(agentReportSocketPathFor(stateDir), () =>
        c.end(JSON.stringify({ type: "usage", paneId, kind: "claude", sessionId: SID, agentPid: process.pid, costUsd: 777 }) + "\n"),
      );
      c.on("close", () => resolve());
      c.on("error", reject);
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBeUndefined();
    expect((await usageOf(client, paneId)).accounts).toEqual([]);
  });

  it("フックの報告（会話の id）より先に届いた包みの報告は、短く保留し、フックの報告の後に受ける", async () => {
    const { server, client, paneId } = await boot();
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_DELAY_HOOK: "2500" }, false);
    sendStatus(server, paneId, status({ cost: { total_cost_usd: 4.5 } })); // 起動の直後（参照がまだ無い）
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(SID), { timeout: 15_000, interval: 100 });
    await vi.waitFor(async () => expect((await usageOf(client, paneId)).panes[paneId]?.costUsd).toBe(4.5), { timeout: 15_000, interval: 200 });
  });
});
