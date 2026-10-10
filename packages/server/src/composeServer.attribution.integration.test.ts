import { mkdir, mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261009-agent-session-attribution の結合テスト。実物の `composeServer`（自前の一時 stateDir）・実 PTY の bash・偽の `claude`
 * の上で、会話の参照（`pane.agentSession`）が「その pane の前面のエージェント自身の報告でだけ」変わることを調べる。
 * 動いている利用者のサーバ・状態のフォルダには触らない（HOME も一時のフォルダ）。
 */
vi.setConfig({ testTimeout: 60_000 });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))("composeServer: 会話の参照の取り違え（20261009-agent-session-attribution）", () => {
  let dir: string;
  let pidFile: string;
  let savedEnv: Record<string, string | undefined> = {};
  const cleanups: (() => Promise<unknown> | unknown)[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "soda-attribution-it-"));
    pidFile = join(dir, "agent.pid");
    await mkdir(join(dir, "bin"));
    // 偽のエージェント: 起動したら自分の pid を書く。q で終わる。
    await writeFile(
      join(dir, "fake-agent.mjs"),
      `
import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdin.on("data", (d) => { if (String(d).includes("q")) process.exit(0); });
setInterval(() => {}, 1000);
`,
    );
    const wrapper = join(dir, "bin", "claude");
    await writeFile(
      wrapper,
      `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
    );
    await chmod(wrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"] };
    process.env["HOME"] = dir;
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
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

  async function boot(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [], shell: "/bin/bash" });
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return server;
  }
  const agentOf = (s: ComposedServer, paneId: string) => s.session.getPane(paneId)?.agent ?? null;
  const refOf = (s: ComposedServer, paneId: string) => s.session.getPane(paneId)?.agentSession?.sessionId ?? null;
  const report = (stateDir: string, body: Record<string, unknown>): Promise<void> =>
    new Promise((resolve, reject) => {
      const c = netConnect(agentReportSocketPathFor(stateDir), () => c.end(`${JSON.stringify(body)}\n`));
      c.on("close", () => resolve());
      c.on("error", reject);
    });
  async function shellReady(server: ComposedServer, paneId: string): Promise<void> {
    const marker = join(dir, `ready-${server.options.port}-${paneId}`);
    server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
    await vi.waitFor(() => expect(existsSync(marker)).toBe(true), { timeout: 10_000, interval: 50 });
  }
  async function startAgent(server: ComposedServer, paneId: string, previous: unknown = null): Promise<number> {
    await rm(pidFile, { force: true });
    server.terminals.get(paneId)!.write("claude\r");
    await vi.waitFor(() => expect(agentOf(server, paneId)).not.toBe(previous), { timeout: 15_000, interval: 50 });
    await vi.waitFor(() => expect(existsSync(pidFile)).toBe(true), { timeout: 5_000, interval: 50 });
    return Number((await readFile(pidFile, "utf8")).trim());
  }
  /** pane のシェルの子で、前面のエージェントではないプロセス（同じ pane の中で別に動かしたもの。件 B の「子の claude」に当たる）の pid。 */
  async function startSideProcess(server: ComposedServer, paneId: string): Promise<number> {
    const file = join(dir, `side-${server.options.port}.pid`);
    server.terminals.get(paneId)!.write(`sleep 600 & echo $! > ${JSON.stringify(file)}\r`);
    await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 10_000, interval: 50 });
    await sleep(100);
    return Number((await readFile(file, "utf8")).trim());
  }
  async function bootWithAgent(opts: { side?: boolean } = {}) {
    const stateDir = await mkdtemp(join(dir, "state-"));
    const server = await boot(stateDir);
    const paneId = server.session.snapshot().panes[0]!.id;
    await shellReady(server, paneId);
    const sidePid = opts.side ? await startSideProcess(server, paneId) : 0;
    const agentPid = await startAgent(server, paneId);
    return { server, stateDir, paneId, agentPid, sidePid };
  }

  it("(件 B 再現) 前面のエージェントの報告は受ける。同じ pane の別のプロセスの報告は、参照を変えない（捨てて、ログに残る）", async () => {
    const { server, stateDir, paneId, agentPid, sidePid } = await bootWithAgent({ side: true });
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main", agentPid });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-main"));
    // 子の claude（別の pid）の SessionStart。直す前は、ここで参照が上書きされた
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-child", agentPid: sidePid });
    await sleep(500);
    expect(refOf(server, paneId)).toBe("conv-main");
    // 同じプロセスの中の替わり（/resume・/clear・fork）は、pid が同じなので受ける（AC3）
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main-2", agentPid });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-main-2"));
  });

  it("(Codex の daemon 相当) シェルの子孫でないプロセス（別の pane の daemon）の報告は、参照を変えない", async () => {
    const { server, stateDir, paneId, agentPid } = await bootWithAgent();
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main", agentPid });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-main"));
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-daemon", agentPid: process.pid });
    await sleep(500);
    expect(refOf(server, paneId)).toBe("conv-main");
  });

  it("(古い版のフック) pid の無い報告は、今までどおり受ける", async () => {
    const { server, stateDir, paneId } = await bootWithAgent();
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-nopid" });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-nopid"));
  });

  it("(AC6) 別のプロセスの subagent_start は件数に混ざらない。前面のエージェントのものは数える", async () => {
    const { server, stateDir, paneId, agentPid, sidePid } = await bootWithAgent({ side: true });
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main", agentPid });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-main"));
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main", type: "subagent_start", agentId: "stranger", agentPid: sidePid });
    await sleep(500);
    expect(agentOf(server, paneId)?.subagents?.count ?? 0).toBe(0);
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-main", type: "subagent_start", agentId: "own", agentPid });
    await vi.waitFor(() => expect(agentOf(server, paneId)?.subagents?.count).toBe(1));
  });

  it("(AC9) 報告ありのエージェントが終わり、猶予の間に、報告しない別のエージェントが動き始めたら、参照は捨てられる", async () => {
    const { server, paneId, stateDir, agentPid } = await bootWithAgent();
    await report(stateDir, { paneId, kind: "claude", sessionId: "conv-first", agentPid });
    await vi.waitFor(() => expect(refOf(server, paneId)).toBe("conv-first"));
    server.terminals.get(paneId)!.write("q");
    await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), { timeout: 15_000, interval: 50 });
    expect(refOf(server, paneId)).toBe("conv-first"); // 猶予の間は残る
    // 報告しない別のエージェント（偽の claude は報告しない）
    await startAgent(server, paneId, null);
    // 猶予の切れ（10 秒）を待たずに、別のエージェントが動いている間に捨てられる
    await vi.waitFor(() => expect(refOf(server, paneId)).toBeNull(), { timeout: 8_000, interval: 100 });
    expect(agentOf(server, paneId)).not.toBeNull();
  });
});
