import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { AgentForkProgress } from "@sodashitsu/protocol";
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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
const DIR = ${JSON.stringify(dir)};
const args = process.argv.slice(2);
const fork = args.includes("--fork-session");
const resumeId = args[args.indexOf("--resume") + 1];
const pane = process.env.SODA_PANE_ID;
if (fork && existsSync(DIR + "/no-conversation")) {
  console.log("No conversation found with session ID: " + resumeId);
  // 検出された後に終わる版（本物の claude は、検出の周期より前に終わることも、後に終わることもある）。
  if (existsSync(DIR + "/die-soon")) await new Promise((r) => setTimeout(r, 2500));
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
function bare() { process.stdout.write("\\u001b[2J\\u001b[H\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n"); }
// 入力欄（live_prompt_box と同じ行）が出た画面。
function idle() { bare(); process.stdout.write("\\u276f \\r\\n"); }
const confirmScreen = ["\\u2500".repeat(40), " Bash command", "", "   curl -sS https://example.com", "", " This command requires approval", "", " Do you want to proceed?", " \\u276f 1. Yes", "   2. No", "", " Esc to cancel \\u00b7 Tab to amend \\u00b7 ctrl+e to explain"].join("\\r\\n") + "\\r\\n";
const blockFile = DIR + (fork ? "/block-fork" : "/block-main");
const lateFile = DIR + (fork ? "/late-block-fork" : "/late-block-main");
if (existsSync(lateFile)) {
  // 読み込みの画面（入力欄なし）のあと、ms 後に確認を描く（R2 の再現）。答える（ファイルを消す）まで確認のまま。フックの報告は答えた後。
  bare();
  const ms = Number(readFileSync(lateFile, "utf8")) || 6000;
  setTimeout(() => {
    process.stdout.write(confirmScreen);
    writeFileSync(DIR + "/drawn-confirm", "");
    const t = setInterval(() => { if (!existsSync(lateFile)) { clearInterval(t); idle(); report(); } }, 100);
  }, ms);
} else {
  if (existsSync(blockFile)) {
    process.stdout.write(confirmScreen);
    const t = setInterval(() => { if (!existsSync(blockFile)) { clearInterval(t); idle(); } }, 100);
  } else idle();
  report();
}
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
    for (const f of ["no-conversation", "die-soon", "block-main", "block-fork", "late-block-main", "late-block-fork", "drawn-confirm", "launches.log"]) await rm(join(dir, f), { force: true });
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
    // グラフ: 新しい pane のノードに、元のノードを指す注記（見るだけの線）。自動の監督の線・承認の代理の線は付かない（AC4・S8）。
    expect(result.annotated).toBe(true);
    const g = server.graph.get();
    expect(g.nodes.find((n) => n.key === `local:${result.paneId}`)?.forkedFrom).toBe(`local:${paneId}`);
    expect(g.links.filter((l) => l.from === `local:${result.paneId}` || l.to === `local:${result.paneId}`)).toEqual([]);
  });

  it("元の pane を閉じると、fork した pane のノードの注記は消える（元のノードが無くなったら、線は消える。A5）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    const result = await ok<{ paneId: string }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    const key = `local:${result.paneId}`;
    await vi.waitFor(() => expect(server.graph.get().nodes.find((n) => n.key === key)?.forkedFrom).toBe(`local:${paneId}`), { timeout: 10_000 });
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("done"), { timeout: 30_000 });
    await ok(client.request("pane.close", { paneId }));
    await vi.waitFor(() => expect(server.graph.get().nodes.some((n) => n.key === `local:${paneId}`)).toBe(false), { timeout: 15_000, interval: 100 });
    expect(server.graph.get().nodes.find((n) => n.key === key)).toBeDefined(); // fork した側は残る
    expect(server.graph.get().nodes.find((n) => n.key === key)).not.toHaveProperty("forkedFrom");
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

  it("検出された直後に claude が終わった（会話が見つからない）: done ではなく failed で、理由が出る。pane は閉じない", async () => {
    const { server, client, paneId } = await bootWithAgent();
    await writeFile(join(dir, "no-conversation"), "");
    await writeFile(join(dir, "die-soon"), "");
    const result = await ok<{ paneId: string }>(client.request("agent.fork", { paneId, target: { kind: "same" } }));
    await vi.waitFor(() => expect(stages(client, result.paneId).some((s) => s === "failed" || s === "done")).toBe(true), { timeout: 60_000 });
    expect(stages(client, result.paneId)).not.toContain("done");
    expect(progressOf(client, result.paneId).find((p) => p.stage === "failed")!.message).toContain("会話の記録が見つかりません");
    expect(server.session.getPane(result.paneId)).toBeDefined();
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

  // --- T3: 新しい worktree と、最初の知らせ -------------------------------------------------------------------------------------------

  /** 一時の git リポジトリ（コミットが 1 つ）。 */
  async function makeRepo(name = "repo"): Promise<string> {
    const repo = join(await mkdtemp(join(dir, "r-")), name);
    await mkdir(repo, { recursive: true });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e" } });
    git("init", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "init");
    return realpath(repo);
  }
  /** そのリポジトリの中で始まる workspace の pane で、元のエージェントを起動する。 */
  async function bootInRepo(repo: string) {
    const b = await boot();
    const ws = await ok<{ workspace: { id: string }; pane: { id: string } }>(b.client.request("workspace.create", { cwd: repo, label: "src" }));
    const paneId = ws.pane.id;
    await shellReady(b.server, paneId);
    b.server.terminals.get(paneId)!.write(`FAKE_SESSION_ID=${A} claude\r`);
    await vi.waitFor(() => expect(sessionOf(b.server, paneId)).toBe(A), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(agentOf(b.server, paneId)).not.toBeNull(), { timeout: 15_000, interval: 50 });
    return { ...b, paneId, workspaceId: ws.workspace.id };
  }
  const branchesOf = (repo: string): string => execFileSync("git", ["branch", "--list"], { cwd: repo }).toString();
  const worktreeCount = (repo: string): number => execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repo }).toString().split("\n").filter((l) => l.startsWith("worktree ")).length;
  interface ForkResult { paneId: string; workspaceId: string; target: string; worktreePath?: string; noteStatus: string; noteReason?: string; name: string; annotated: boolean }

  it("新しい worktree で fork する: 新しいブランチの worktree と workspace ができ、そこで起動し、手が空いたら最初の知らせが届く。元のフォルダは変わらない（AC3）", async () => {
    const repo = await makeRepo();
    const { server, client, paneId } = await bootInRepo(repo);
    const workspaces = server.session.snapshot().workspaces.length;
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/try-a" } }));
    expect(result).toMatchObject({ target: "worktree", noteStatus: "pending" });
    const wt = result.worktreePath!;
    expect(wt).toBe(await realpath(join(dir, "worktrees", "repo", "fork-try-a")));
    expect(server.session.snapshot().workspaces).toHaveLength(workspaces + 1);
    expect(server.session.getWorkspace(result.workspaceId)?.cwd).toBe(wt);
    expect(branchesOf(repo)).toContain("fork/try-a");
    expect(worktreeCount(repo)).toBe(2);
    await vi.waitFor(async () => expect((await launches()).filter((l) => l.args.includes("--fork-session"))).toHaveLength(1), { timeout: 20_000 });
    const launched = (await launches()).at(-1)!;
    expect(launched.args).toEqual(["--resume", A, "--fork-session"]);
    expect(await realpath(launched.cwd)).toBe(wt); // 新しい worktree で起動した
    expect(launched.pane).toBe(result.paneId);
    // 最初の知らせ: 手が空いてから届く（作業フォルダと元のフォルダ。元のフォルダを変更しないよう伝える）。
    await vi.waitFor(() => expect(progressOf(client, result.paneId).some((p) => p.stage === "note" && p.noteStatus === "sent")).toBe(true), { timeout: 30_000 });
    const input = await readFile(join(dir, `input-${result.paneId}`), "utf8");
    expect(input).toContain("このセッションは、fork されました");
    expect(input).toContain(`\`${wt}\``);
    expect(input).toContain(`\`${repo}\``);
    expect(input).toContain("変更しないでください");
    expect(input).toContain("\r"); // 送信された（Enter）
    // 元の pane: そのまま（入力されていない）。
    expect(existsSync(join(dir, `input-${paneId}`))).toBe(false);
    expect(stages(client, result.paneId)).toEqual(expect.arrayContaining(["pane_created", "launched", "detected", "ready", "note", "done"]));
  });

  it("最初の知らせを送らない選択（note: false）: 送らない。noteStatus は off", async () => {
    const repo = await makeRepo();
    const { server, client, paneId } = await bootInRepo(repo);
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/no-note" }, note: false }));
    expect(result.noteStatus).toBe("off");
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("done"), { timeout: 30_000 });
    expect(existsSync(join(dir, `input-${result.paneId}`))).toBe(false);
    expect(server.session.getPane(result.paneId)).toBeDefined();
  });

  it("確認で止まっている間（blocked）は知らせを送らず、答えて手が空いた後に送る（A8）", async () => {
    const repo = await makeRepo();
    const { server, client, paneId } = await bootInRepo(repo);
    await writeFile(join(dir, "block-fork"), "");
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/blocked" } }));
    await vi.waitFor(() => expect(agentOf(server, result.paneId)?.state).toBe("blocked"), { timeout: 30_000, interval: 50 });
    await vi.waitFor(() => expect(progressOf(client, result.paneId).some((p) => p.stage === "note" && p.noteStatus === "pending" && p.noteReason?.includes("確認を待っています"))).toBe(true), { timeout: 10_000 });
    await sleep(1500);
    expect(existsSync(join(dir, `input-${result.paneId}`))).toBe(false); // まだ送っていない
    await rm(join(dir, "block-fork")); // 利用者が確認に答えた
    await vi.waitFor(() => expect(progressOf(client, result.paneId).some((p) => p.stage === "note" && p.noteStatus === "sent")).toBe(true), { timeout: 30_000 });
    expect(await readFile(join(dir, `input-${result.paneId}`), "utf8")).toContain("fork されました");
  });

  it("読み込みの画面で手が空いたように見えても、確認が後から描かれるなら、知らせは確認の前に送らない（R2。確認に Enter が届かない）", async () => {
    const repo = await makeRepo();
    const { client, paneId } = await bootInRepo(repo);
    // 新しい claude は、入力欄の無い読み込みの画面のあと 6 秒後に確認を描く。利用者が答える（ファイルを消す）まで確認のまま。
    await writeFile(join(dir, "late-block-fork"), "6000");
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/late-confirm" } }));
    const input = join(dir, `input-${result.paneId}`);
    await vi.waitFor(() => expect(existsSync(join(dir, "drawn-confirm"))).toBe(true), { timeout: 20_000, interval: 20 });
    // 確認が描かれた時点で、新しい pane へは本文も Enter も届いていない（確認に勝手に答えない）。
    expect(existsSync(input)).toBe(false);
    expect(progressOf(client, result.paneId).some((p) => p.stage === "note" && p.noteStatus === "sent")).toBe(false);
    await rm(join(dir, "late-block-fork")); // 利用者が確認に答えた
    await vi.waitFor(() => expect(progressOf(client, result.paneId).some((p) => p.stage === "note" && p.noteStatus === "sent")).toBe(true), { timeout: 30_000 });
    expect(await readFile(input, "utf8")).toContain("作業フォルダは");
  });

  it("起動の直前に会話の id を読み直す: 新しい pane の準備の間に元の会話が替わったら（/clear 相当）、替わった後の id で起動する（R6）", async () => {
    const { server, client, paneId } = await bootWithAgent();
    const before = (await launches()).length;
    const replaced = "7c0a3f2e-1b7d-4e8a-9c3f-2d5a6b7c8d9e";
    const pending = client.request("agent.fork", { paneId, target: { kind: "same" } });
    // 新しい pane ができたら、元の pane の会話が替わる（フックの報告）。起動はシェルの準備の後なので、読み直しで拾う。
    await vi.waitFor(() => expect(client.events.some((e) => e.event === "agent.fork_progress" && e.data.stage === "pane_created")).toBe(true), { timeout: 10_000, interval: 10 });
    server.session.reportAgentSession(paneId, "claude", replaced);
    await ok(pending);
    await vi.waitFor(async () => expect((await launches()).length).toBe(before + 1), { timeout: 20_000 });
    expect((await launches()).at(-1)!.args).toEqual(["--resume", replaced, "--fork-session"]);
  });

  it("ブランチ名が既にあれば断り（fork_branch_exists）、何も作らない（A6）", async () => {
    const repo = await makeRepo();
    execFileSync("git", ["branch", "taken"], { cwd: repo });
    const { server, client, paneId } = await bootInRepo(repo);
    const workspaces = server.session.snapshot().workspaces.length;
    const r = await client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "taken" } });
    expect(r.error?.code).toBe("fork_branch_exists");
    expect(server.session.snapshot().workspaces).toHaveLength(workspaces);
    expect(worktreeCount(repo)).toBe(1);
    expect((await launches()).filter((l) => l.args.includes("--fork-session"))).toHaveLength(0);
  });

  it("git のリポジトリでない pane では worktree の fork は断り（not_a_git_repository）、何も作らない。同じフォルダの fork はできる", async () => {
    const plain = await realpath(await mkdtemp(join(dir, "plain-")));
    const { server, client, paneId } = await bootInRepo(plain);
    const panes = server.session.snapshot().panes.length;
    const r = await client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "x" } });
    expect(r.error?.code).toBe("not_a_git_repository");
    expect(server.session.snapshot().panes).toHaveLength(panes);
    const same = await client.request("agent.fork", { paneId, target: { kind: "same" } });
    expect(same.error).toBeUndefined();
  });

  it("起動で失敗しても、作った worktree と workspace は消さずに残し、何が残ったかを知らせる。最初の知らせは送らない（AC7・A11）", async () => {
    const repo = await makeRepo();
    const { server, client, paneId } = await bootInRepo(repo);
    await writeFile(join(dir, "no-conversation"), "");
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/fails" } }));
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("failed"), { timeout: 60_000 });
    const failed = progressOf(client, result.paneId).find((p) => p.stage === "failed")!;
    expect(failed.created).toMatchObject({ worktreePath: result.worktreePath, workspaceId: result.workspaceId, paneId: result.paneId });
    expect(failed.noteStatus).toBe("skipped");
    expect(worktreeCount(repo)).toBe(2); // 残っている
    expect(server.session.getWorkspace(result.workspaceId)).toBeDefined();
    expect(existsSync(join(dir, `input-${result.paneId}`))).toBe(false);
  });

  it("パスに改行などの制御文字があるときは、最初の知らせを送らない（skipped・理由つき）。fork 自体は行う（S3・A8）", async () => {
    const repo = await makeRepo("re\npo");
    const { server, client, paneId } = await bootInRepo(repo);
    const result = await ok<ForkResult>(client.request("agent.fork", { paneId, target: { kind: "worktree", branch: "fork/ctl" } }));
    expect(result.noteStatus).toBe("skipped");
    expect(result.noteReason).toContain("制御文字");
    await vi.waitFor(() => expect(stages(client, result.paneId)).toContain("done"), { timeout: 30_000 });
    expect(existsSync(join(dir, `input-${result.paneId}`))).toBe(false);
    expect(server.session.getPane(result.paneId)).toBeDefined();
  });
});
