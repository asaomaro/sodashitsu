import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { AgentForkProgress } from "@sodashitsu/protocol";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261009-agent-fork の T2・T3。実物の `composeServer`（自前の一時 stateDir）・実 PTY の bash・偽の `claude` の上で、`agent.fork` の手順を確かめる。
 * 偽の `claude` は、起動の引数を記録し、フックの報告（`agent-report.sock`）を真似て会話の id を報告し、入力をファイルへ書き出す。
 * `--fork-session` を付けられたら新しい UUID で報告する。ファイル `block-main` / `block-fork` があれば、承認の画面（blocked）で止まる。
 * 動いている利用者のサーバ・状態のフォルダ・`~/.claude` には触らない（HOME も一時のフォルダ）。
 */
vi.setConfig({ testTimeout: 60_000 });

const fakeAgent = (dir: string) => `
import { appendFileSync, existsSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
const DIR = ${JSON.stringify(dir)};
const args = process.argv.slice(2);
const fork = args.includes("--fork-session");
const resumeId = args[args.indexOf("--resume") + 1];
const pane = process.env.SODA_PANE_ID;
if (fork && existsSync(DIR + "/no-conversation")) {
  console.log("No conversation found with session ID: " + resumeId);
  process.exit(1);
}
const sessionId = fork ? randomUUID() : (process.env.FAKE_SESSION_ID || randomUUID());
appendFileSync(DIR + "/launches.log", JSON.stringify({ pane, cwd: process.cwd(), args, sessionId }) + "\\n");
process.stdin.setRawMode(true);
function report() {
  const sock = process.env.SODA_AGENT_REPORT_SOCKET;
  if (!sock) return;
  const c = connect(sock, () => c.end(JSON.stringify({ paneId: pane, kind: "claude", sessionId }) + "\\n"));
  c.on("error", () => {});
}
function idle() { process.stdout.write("\\u001b[2J\\u001b[H\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n"); }
const blockFile = DIR + (fork ? "/block-fork" : "/block-main");
if (existsSync(blockFile)) {
  process.stdout.write(["\\u2500".repeat(40), " Bash command", "", "   curl -sS https://example.com", "", " This command requires approval", "", " Do you want to proceed?", " \\u276f 1. Yes", "   2. No", "", " Esc to cancel \\u00b7 Tab to amend \\u00b7 ctrl+e to explain"].join("\\r\\n") + "\\r\\n");
  const t = setInterval(() => { if (!existsSync(blockFile)) { clearInterval(t); idle(); } }, 100);
} else idle();
report();
process.stdin.on("data", (d) => {
  appendFileSync(DIR + "/input-" + pane, String(d));
  if (String(d).includes("\\u0004")) process.exit(0);
});
setInterval(() => {}, 1000);
`;

interface Client {
  request(method: string, params: unknown): Promise<{ result?: unknown; error?: { code: string; message?: string } }>;
  events: { event: string; data: any }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const A = "3e81f9a7-a757-461a-b21c-196db1d9196e";

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: agent.fork（20261009-agent-fork・実 PTY・偽の claude）", () => {
  let dir: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-fork-it-"));
    await mkdir(join(dir, "bin"));
    await writeFile(join(dir, "fake-agent.mjs"), fakeAgent(dir));
    const wrapper = join(dir, "bin", "claude");
    await writeFile(wrapper, `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`);
    await chmod(wrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"] };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
    for (const f of ["no-conversation", "block-main", "block-fork", "launches.log"]) await rm(join(dir, f), { force: true });
  });
  afterAll(async () => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (dir) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  async function boot(): Promise<{ server: ComposedServer; stateDir: string; client: Client }> {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/bash", worktreeDir: join(dir, "worktrees") });
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
    const events: Client["events"] = [];
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as { id?: string; result?: unknown; error?: { code: string; message?: string }; event?: string; data?: unknown };
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.(msg.error !== undefined ? { error: msg.error } : { result: msg.result });
      } else if (msg.event) events.push({ event: msg.event, data: msg.data });
    });
    let seq = 0;
    const request: Client["request"] = (method, params) =>
      new Promise((resolve) => {
        const id = `r${++seq}`;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    await request("client.hello", { protocol: 1, kind: "desktop" });
    return { server, stateDir, client: { request, events } };
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const agentOf = (s: ComposedServer, paneId: string) => s.session.getPane(paneId)?.agent ?? null;
  const sessionOf = (s: ComposedServer, paneId: string) => s.session.getPane(paneId)?.agentSession?.sessionId ?? null;
  async function shellReady(server: ComposedServer, paneId: string): Promise<void> {
    const marker = join(dir, `ready-${server.options.port}-${paneId}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
  }
  /** 元のエージェントを起動して、会話の id `A` が報告されるのを待つ。 */
  async function bootWithAgent(sessionId = A, extraBoot?: () => Promise<{ server: ComposedServer; stateDir: string; client: Client }>) {
    const b = await (extraBoot ?? boot)();
    const paneId = b.server.session.snapshot().panes[0]!.id;
    await shellReady(b.server, paneId);
    b.server.terminals.get(paneId)!.write(`FAKE_SESSION_ID=${sessionId} claude\r`);
    await vi.waitFor(() => expect(sessionOf(b.server, paneId)).toBe(sessionId), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(agentOf(b.server, paneId)).not.toBeNull(), { timeout: 15_000, interval: 50 });
    return { ...b, paneId };
  }
  async function launches(): Promise<{ pane: string; cwd: string; args: string[]; sessionId: string }[]> {
    const raw = await readFile(join(dir, "launches.log"), "utf8").catch(() => "");
    return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
  const progressOf = (c: Client, paneId: string): AgentForkProgress[] => c.events.filter((e) => e.event === "agent.fork_progress" && e.data.paneId === paneId).map((e) => e.data);
  const stages = (c: Client, paneId: string): string[] => progressOf(c, paneId).map((p) => p.stage);
  async function ok<T>(p: ReturnType<Client["request"]>): Promise<T> {
    const r = await p;
    if (r.error !== undefined) throw new Error(`request failed: ${r.error.code} ${r.error.message ?? ""}`);
    return r.result as T;
  }

  // --- T2: 同じフォルダ --------------------------------------------------------------------------------------------------------------

  it("同じフォルダで fork する: 新しい pane に `--resume <id> --fork-session` で起動し、元は止まらない・入力を受けない。進み具合が配られる（AC2）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    const sourceAgent = agentOf(server, paneId)!;
    const before = (await launches()).length;
    const result = await ok<{ paneId: string; target: string; name: string; noteStatus: string; annotated: boolean }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    expect(result.paneId).not.toBe(paneId);
    expect(result).toMatchObject({ target: "same", noteStatus: "off" });
    await vi.waitFor(async () => expect((await launches()).length).toBe(before + 1), { timeout: 20_000 });
    const launched = (await launches()).at(-1)!;
    expect(launched.args).toEqual(["--resume", A, "--fork-session"]); // 起動の引数は、固定の表と既存の引用の関数だけから
    expect(launched.pane).toBe(result.paneId);
    expect(launched.cwd).toBe(server.session.getPane(paneId)!.cwd); // 元の pane の場所
    // 元の pane: エージェントはそのまま（入れ替わらない・何も入力されない）。
    expect(agentOf(server, paneId)?.instanceId).toBe(sourceAgent.instanceId);
    expect(existsSync(join(dir, `input-${paneId}`))).toBe(false);
    // 新しい pane: 新しい会話の id（フックの報告）と、検知・手が空く・終わりの進み具合。
    await vi.waitFor(() => expect(sessionOf(server, result.paneId)).toBe(launched.sessionId), { timeout: 20_000 });
    expect(launched.sessionId).not.toBe(A);
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("done"), { timeout: 30_000 });
    expect(stages(client, result.paneId)).toEqual(["pane_created", "launched", "detected", "ready", "done"]);
    expect(agentOf(server, result.paneId)?.kind).toBe("claude");
  });

  it("同じ pane を続けて 2 回 fork すると、別々の pane が 2 つできる。同時の 2 回目は fork_in_progress（二重押しを弾く）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    const first = ok<{ paneId: string }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    const second = await client.request("agent.fork", { paneId, target: { kind: "same" } });
    expect(second.error?.code).toBe("fork_in_progress");
    const one = await first;
    const two = await ok<{ paneId: string }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    expect(new Set([paneId, one.paneId, two.paneId]).size).toBe(3);
    await vi.waitFor(() => expect(stages(client, two.paneId)).toContain("done"), { timeout: 30_000 });
    expect((await launches()).filter((l) => l.args.includes("--fork-session")).map((l) => l.args[1])).toEqual([A, A]);
    expect(agentOf(server, paneId)).not.toBeNull();
  });

  it("入力に余計な項目（会話の id・コマンド・引数）を足すと断られ、何も起きない（AC5）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    const panes = server.session.snapshot().panes.length;
    for (const extra of [{ sessionId: "00000000-0000-4000-8000-000000000000" }, { argv: ["x"] }, { args: ["--x"] }, { command: "touch /tmp/x" }]) {
      const r = await client.request("agent.fork", { paneId, target: { kind: "same" }, ...extra });
      expect(r.error?.code, JSON.stringify(extra)).toBe("invalid_params");
    }
    await sleep(300);
    expect(server.session.snapshot().panes).toHaveLength(panes);
    expect(await launches()).toHaveLength(1); // 元の起動だけ
  });

  it("fork できない pane は fork_unavailable で、何も作らない: エージェントが居ない・会話の id が分からない・UUID の形でない（A7）", async () => {
    const b = await boot();
    const paneId = b.server.session.snapshot().panes[0]!.id;
    await shellReady(b.server, paneId);
    const r0 = await b.client.request("agent.fork", { paneId, target: { kind: "same" } });
    expect(r0.error).toMatchObject({ code: "fork_unavailable" });
    expect(r0.error?.message).toMatch(/^no_agent/);
    // エージェントは居るが、会話の id が UUID の形でない（偽の報告）。
    b.server.terminals.get(paneId)!.write(`FAKE_SESSION_ID=../../etc/passwd claude\r`);
    await vi.waitFor(() => expect(sessionOf(b.server, paneId)).toBe("../../etc/passwd"), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(agentOf(b.server, paneId)).not.toBeNull(), { timeout: 15_000, interval: 50 });
    const panes = b.server.session.snapshot().panes.length;
    const r1 = await b.client.request("agent.fork", { paneId, target: { kind: "same" } });
    expect(r1.error).toMatchObject({ code: "fork_unavailable" });
    expect(r1.error?.message).toMatch(/^bad_session_id/);
    expect(b.server.session.snapshot().panes).toHaveLength(panes);
    expect(await launches()).toHaveLength(1);
  });

  it("途中で元の pane が閉じられたら、起動せずに止め、同じフォルダの新しい pane は閉じる（半端な pane を残さない。A11）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    // 元の pane の隣にもう 1 つ pane を足しておく（元の pane を閉じても tab は残る）。
    await ok(client.request("pane.split", { paneId, direction: "down" }));
    const panesBefore = server.session.snapshot().panes.length;
    const req = client.request("agent.fork", { paneId, target: { kind: "same" } });
    await vi.waitFor(() => expect(server.session.snapshot().panes.length).toBe(panesBefore + 1), { timeout: 10_000, interval: 20 });
    await ok(client.request("pane.close", { paneId }));
    const r = await req;
    expect(r.error?.code).toBe("fork_failed");
    expect(r.error?.message).toContain("新しい pane は閉じました");
    await vi.waitFor(() => expect(server.session.snapshot().panes.length).toBe(panesBefore - 1), { timeout: 10_000, interval: 50 }); // 元の pane と新しい pane の両方が無い
    expect((await launches()).filter((l) => l.args.includes("--fork-session"))).toHaveLength(0);
  });

  it("起動したのに会話が見つからない（CLAUDE_CONFIG_DIR 違い・古い版など）: 検知されず、理由が進み具合に出る。pane は閉じない", async () => {
    const { server, client, paneId } = await bootWithAgent();
    await writeFile(join(dir, "no-conversation"), "");
    const result = await ok<{ paneId: string }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("failed"), { timeout: 60_000 });
    const failed = progressOf(client, result.paneId).find((p) => p.stage === "failed")!;
    expect(failed.message).toContain("会話の記録が見つかりません");
    expect(server.session.getPane(result.paneId)).toBeDefined(); // 利用者が画面で理由を見られるよう、閉じない
  });
});
