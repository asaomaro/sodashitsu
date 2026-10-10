import { execFileSync } from "node:child_process";
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { connect as netConnect } from "node:net";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import { assertPaneResolvesFake } from "./testing/fakeAgentGuard.js";

/**
 * 20261010-agent-usage の AC2・AC3・AC5・AC7・AC8。実物の `composeServer`（自前の一時 stateDir・HOME も一時）・実 PTY の bash・偽の `claude` の上で、
 * `agent.usage` を確かめる。偽の `claude` は、環境変数で渡された会話の id と記録の場所を、フックの報告（`agent-report.sock`）の形で報告する。
 * 記録は作ったもの（利用者の記録を写さない）。記録の場所を偽の報告で外へ向けても、読まれないことを確かめる。
 */
vi.setConfig({ testTimeout: 60_000 });

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
const MARK = "SECRET-CONTENT-MARKER-7d41";

function line(o: Record<string, unknown>): string {
  return JSON.stringify(o) + "\n";
}
function assistant(id: string, out: number, extra: Record<string, unknown> = {}): string {
  return line({
    type: "assistant",
    uuid: `u-${id}`,
    timestamp: "2026-10-10T00:00:00.000Z",
    session_name: MARK, // 利用者が付けたセッションの名前（答えに出ない）
    cwd: `/home/${MARK}`,
    ...extra,
    message: {
      id,
      model: "claude-sonnet-5-5",
      usage: { input_tokens: 2, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 },
      content: [{ type: "text", text: `${MARK} ${id}` }],
    },
  });
}

interface Client {
  request(method: string, params: unknown): Promise<{ result?: any; error?: { code: string; message?: string } }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: agent.usage（20261010-agent-usage・実 PTY・偽の claude・作った記録）", () => {
  let dir: string;
  let projects: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-usage-it-"));
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
    await rm(join(dir, "outside"), { recursive: true, force: true });
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function boot(): Promise<{ server: ComposedServer; client: Client; sockPath: string; paneId: string }> {
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
    const paneId = server.session.snapshot().panes[0]!.id;
    return { server, client: { request }, sockPath: "", paneId };
  }

  async function runAgent(server: ComposedServer, paneId: string, env: Record<string, string>): Promise<void> {
    const marker = join(dir, `ready-${server.options.port}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
    // 打ち込みの前に、pane のシェルが偽の `claude` を指すことを確かめる（違えば、実物を起動せずに落とす。20261010-e2e-fake-agent）。
    await assertPaneResolvesFake({ write: (input) => server.terminals.get(paneId)!.write(input), name: "claude", fakeDir: join(dir, "bin"), scratchDir: dir });
    const assigns = Object.entries(env)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(" ");
    server.terminals.get(paneId)!.write(`${assigns} claude\r`);
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe(env["FAKE_SESSION_ID"]), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(server.session.getPane(paneId)?.agent).not.toBeNull(), { timeout: 15_000, interval: 50 });
  }
  const recordPath = (project = "proj-a") => join(projects, project, `${SID}.jsonl`);
  async function writeRecord(body: string, project = "proj-a"): Promise<string> {
    await mkdir(join(projects, project), { recursive: true });
    await writeFile(recordPath(project), body);
    return recordPath(project);
  }

  it("フックの報告の場所から記録を読み、数字・モデル名・時刻だけを返す。会話の文・場所・セッションの名前は、答えのどこにも無い（AC7）", async () => {
    const { server, client, paneId } = await boot();
    const f = await writeRecord(assistant("m1", 50) + assistant("m1", 50) + assistant("m2", 7));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: f });
    const r = await client.request("agent.usage", { paneId });
    expect(r.error).toBeUndefined();
    const u = r.result.panes[paneId];
    expect(u).toMatchObject({ paneId, kind: "claude", model: "claude-sonnet-5-5", source: "transcript", tokens: { basis: "transcript", input: 4, output: 57, cacheRead: 200, cacheWrite: 20 } });
    expect(u.updatedAt).toBe(Date.parse("2026-10-10T00:00:00.000Z"));
    expect(u.costUsd).toBeUndefined();
    const json = JSON.stringify(r.result);
    expect(json).not.toContain(MARK);
    expect(json).not.toContain(dir);
    expect(json).not.toContain(".jsonl");
  });

  it("pane の id を省くと全部。会話の id が分からない・エージェントの居ない pane は答えに入らない。指定すると null で答える", async () => {
    const { server, client, paneId } = await boot();
    const none = await client.request("agent.usage", {});
    expect(none.result).toEqual({ panes: {}, accounts: [] });
    expect((await client.request("agent.usage", { paneId })).result.panes).toEqual({ [paneId]: null });
    const f = await writeRecord(assistant("m1", 5));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: f });
    const all = await client.request("agent.usage", {});
    expect(Object.keys(all.result.panes)).toEqual([paneId]);
  });

  it("報告の場所を根の外へ向けても読まない（外に同じ名前の記録があっても）。根の下の本物の記録があれば、そちらの数字になる", async () => {
    const { server, client, paneId } = await boot();
    await mkdir(join(dir, "outside"), { recursive: true });
    const evil = join(dir, "outside", `${SID}.jsonl`);
    await writeFile(evil, assistant("evil", 99999));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: evil });
    expect((await client.request("agent.usage", { paneId })).result.panes[paneId]).toBeNull();
    await writeRecord(assistant("real", 3));
    // 取れなかった結果を覚える短い間（3 秒）の後に、根の下の記録が見つかる
    await vi.waitFor(async () => expect((await client.request("agent.usage", { paneId })).result.panes[paneId]?.tokens.output).toBe(3), { timeout: 15_000, interval: 500 });
  });

  it("記録のファイルがリンク（外のファイルへ）・ハードリンク・FIFO のときは読まない。FIFO でも固まらない", async () => {
    const { server, client, paneId } = await boot();
    await mkdir(join(dir, "outside"), { recursive: true });
    const secret = join(dir, "outside", "secret.jsonl");
    await writeFile(secret, assistant("secret", 12345));
    await mkdir(join(projects, "proj-a"), { recursive: true });
    await symlink(secret, recordPath());
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: recordPath() });
    expect((await client.request("agent.usage", { paneId })).result.panes[paneId]).toBeNull();
    // ハードリンク
    await rm(recordPath());
    await link(secret, recordPath());
    await new Promise((r) => setTimeout(r, 3_200)); // 取れなかった結果を覚える間
    expect((await client.request("agent.usage", { paneId })).result.panes[paneId]).toBeNull();
    // FIFO
    await rm(recordPath());
    execFileSync("mkfifo", [recordPath()]);
    await new Promise((r) => setTimeout(r, 3_200));
    const t0 = Date.now();
    expect((await client.request("agent.usage", { paneId })).result.panes[paneId]).toBeNull();
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("入力は pane の id だけ: 場所・会話の id を付けても、使われない（記録の場所は受け取らない）", async () => {
    const { server, client, paneId } = await boot();
    const f = await writeRecord(assistant("m1", 5));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: f });
    await mkdir(join(dir, "outside"), { recursive: true });
    const evil = join(dir, "outside", "evil.jsonl");
    await writeFile(evil, assistant("evil", 77777));
    const r = await client.request("agent.usage", { paneId, path: evil, transcriptPath: evil, sessionId: "x" });
    expect(r.error).toBeUndefined();
    expect(r.result.panes[paneId].tokens.output).toBe(5);
    expect((await client.request("agent.usage", { paneId: "" })).error?.code).toBe("invalid_params");
  });

  it("cost-state があれば、その累計を優先し（cumulative）、コストは cost-state の値。サブエージェントの記録は内訳に入る", async () => {
    const { server, client, paneId } = await boot();
    const f = await writeRecord(
      assistant("m1", 10) +
        line({ type: "cost-state", sessionId: SID, totalCostUSD: 3.25, modelUsage: { "claude-sonnet-5-5": { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 300, cacheCreationInputTokens: 40, costUSD: 3.25 } } }),
    );
    await mkdir(join(projects, "proj-a", SID, "subagents"), { recursive: true });
    await writeFile(join(projects, "proj-a", SID, "subagents", "agent-s1.jsonl"), assistant("s1", 8, { isSidechain: true }));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: f });
    const u = (await client.request("agent.usage", { paneId })).result.panes[paneId];
    expect(u).toMatchObject({ source: "cost-state", costUsd: 3.25, costBasis: "cost-state", tokens: { basis: "cumulative", output: 20 } });
    expect(u.breakdown.main.output).toBe(10);
    expect(u.breakdown.subagents).toMatchObject({ output: 8, files: 1 });
  });

  it("記録が増えると、次の呼び出しで増えた分だけ足される（増分）", async () => {
    const { server, client, paneId } = await boot();
    const f = await writeRecord(assistant("m1", 10));
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: f });
    expect((await client.request("agent.usage", { paneId })).result.panes[paneId].tokens.output).toBe(10);
    await writeFile(f, assistant("m1", 10) + assistant("m2", 5));
    await vi.waitFor(async () => expect((await client.request("agent.usage", { paneId })).result.panes[paneId].tokens.output).toBe(15), { timeout: 10_000, interval: 500 });
  });

  it("捨てた報告の記録の場所は覚えない: 同じ会話の id で、シェルの子孫でない報告（別の写しを指す）が来ても、読まれるのは受け入れた報告の場所（U1）", async () => {
    const { server, client, paneId } = await boot();
    const real = await writeRecord(assistant("real", 5), "proj-a");
    await runAgent(server, paneId, { FAKE_SESSION_ID: SID, FAKE_TRANSCRIPT: real });
    // 別のプロジェクトにある、同じ名前の別の写し（数字が違う）。
    const copy = await writeRecord(assistant("copy", 4242), "proj-b");
    // 偽の報告: 会話の id は同じ・pid はシェルの子孫でない（このテストのプロセス）・場所は別の写し。受け入れられない。
    await new Promise<void>((resolve, reject) => {
      const c = netConnect(agentReportSocketPathFor(server.options.stateDir), () => c.end(JSON.stringify({ paneId, kind: "claude", sessionId: SID, agentPid: process.pid, transcriptPath: copy }) + "\n"));
      c.on("close", () => resolve());
      c.on("error", reject);
    });
    await new Promise((r) => setTimeout(r, 300));
    const u = (await client.request("agent.usage", { paneId })).result.panes[paneId];
    expect(u.tokens.output).toBe(5); // 別の写し（4242）ではない
  });

  it("Codex: アカウント全体の枠は、pane との対応が無くても、sessions のいちばん新しい記録から出る。会話の文は、答えに出ない（AC4・AC7）", async () => {
    const { client } = await boot();
    const day = join(dir, ".codex", "sessions", "2026", "10", "10");
    await mkdir(day, { recursive: true });
    const id = "01a1234a-1768-7210-befd-023a395239b0";
    await writeFile(
      join(day, `rollout-2026-10-10T09-50-20-${id}.jsonl`),
      line({ timestamp: "2026-10-10T00:50:00.000Z", type: "session_meta", payload: { id, cwd: `/home/${MARK}`, originator: "codex_exec" } }) +
        line({ timestamp: "2026-10-10T00:50:48.000Z", type: "response_item", payload: { type: "message", text: MARK } }) +
        line({
          timestamp: "2026-10-10T00:50:52.978Z",
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 1, total_tokens: 11 }, model_context_window: 1000 },
            rate_limits: { primary: { used_percent: 16, window_minutes: 300, resets_at: 4_000_000_000 }, secondary: { used_percent: 2.5, window_minutes: 10080, resets_at: 4_000_100_000 }, plan_type: "pro" },
          },
        }),
    );
    const r = await client.request("agent.usage", {});
    expect(r.error).toBeUndefined();
    expect(r.result.panes).toEqual({});
    expect(r.result.accounts).toHaveLength(1);
    expect(r.result.accounts[0]).toMatchObject({
      kind: "codex",
      label: "codex",
      plan: "pro",
      source: "rollout",
      asOf: Date.parse("2026-10-10T00:50:52.978Z"),
      windows: [
        { label: "5 時間", usedPct: 16, resetsAt: 4_000_000_000_000, windowMinutes: 300 },
        { label: "週", usedPct: 2.5, resetsAt: 4_000_100_000_000, windowMinutes: 10080 },
      ],
    });
    const json = JSON.stringify(r.result);
    expect(json).not.toContain(MARK);
    expect(json).not.toContain(dir);
  });
});
