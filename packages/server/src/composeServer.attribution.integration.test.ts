import { mkdir, mkdtemp, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";
import { assertPaneResolvesFake } from "./testing/fakeAgentGuard.js";

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
process.stdin.on("data", (d) => {
  if (!String(d).includes("q")) return;
  const id = process.env.FAKE_EXIT_ID;
  if (id) process.stdout.write("Disconnected from this task. Any running work continues.\\r\\nTo reconnect, run:\\r\\n  codex resume " + id + "\\r\\n");
  setTimeout(() => process.exit(0), 50);
});
setInterval(() => {}, 1000);
`,
    );
    const wrapper = join(dir, "bin", "claude");
    await writeFile(
      wrapper,
      `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
    );
    await chmod(wrapper, 0o755);
    const codexWrapper = join(dir, "bin", "codex");
    await writeFile(
      codexWrapper,
      `#!/bin/bash\necho "$@" >> ${JSON.stringify(join(dir, "codex-args.log"))}\nexec -a codex ${JSON.stringify(process.execPath)} ${JSON.stringify(join(dir, "fake-agent.mjs"))} "$@"\n`,
    );
    await chmod(codexWrapper, 0o755);
    savedEnv = { HOME: process.env["HOME"], PATH: process.env["PATH"], ENV: process.env["ENV"], CODEX_HOME: process.env["CODEX_HOME"] };
    process.env["HOME"] = dir;
    process.env["CODEX_HOME"] = join(dir, "codex-home"); // 会話の記録の検算（lookupCodexRecord）が見る場所
    process.env["PATH"] = `${join(dir, "bin")}:${process.env["PATH"] ?? "/usr/bin:/bin"}`;
    delete process.env["ENV"];
  });
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
    await rm(join(dir, "codex-home"), { recursive: true, force: true }); // 会話の記録（検算）は、試験ごとに作る
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
    await assertPaneResolvesFake({ write: (input) => server.terminals.get(paneId)!.write(input), name: "claude", fakeDir: join(dir, "bin"), scratchDir: dir });
  }
  async function startAgent(server: ComposedServer, paneId: string, previous: unknown = null, command = "claude"): Promise<number> {
    await rm(pidFile, { force: true });
    server.terminals.get(paneId)!.write(`${command}\r`);
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
  // レビュー S1: Codex 0.162 のフックは常駐の daemon の中で動く（シェルの子孫でない）。pane が 1 つだけなら、今までどおり付く。
  describe("Codex の daemon の報告（S1）", () => {
    const daemonPid = process.pid; // この試験のプロセス: どの pane のシェルの子孫でもない
    const U1 = "01a1235d-a77d-7e90-9c85-266bd8da0aa1";
    const U2 = "01a1235d-a77d-7e90-9c85-266bd8da0aa2";
    const U3 = "01a1235d-a77d-7e90-9c85-266bd8da0aa3";
    async function record(id: string, cwd: string): Promise<void> {
      const day = join(dir, "codex-home", "sessions", "2026", "10", "10");
      await mkdir(day, { recursive: true });
      await writeFile(join(day, `rollout-2026-10-10T10-11-42-${id}.jsonl`), `${JSON.stringify({ type: "session_meta", payload: { id, cwd, originator: "codex-tui" } })}\n`);
    }
    async function bootWithCodex() {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await boot(stateDir);
      const paneId = server.session.snapshot().panes[0]!.id;
      await shellReady(server, paneId);
      await startAgent(server, paneId, null, "codex");
      await vi.waitFor(() => expect(agentOf(server, paneId)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      return { server, stateDir, paneId, cwd: server.session.getPane(paneId)!.cwd };
    }

    it("前面の codex がサーバ全体で 1 つで、cwd が pane の場所と同じなら、daemon の報告が pane に付く", async () => {
      const { server, stateDir, paneId, cwd } = await bootWithCodex();
      await record(U1, cwd);
      await report(stateDir, { paneId, kind: "codex", sessionId: U1, agentPid: daemonPid, cwd });
      await vi.waitFor(() => expect(refOf(server, paneId)).toBe(U1));
    });

    it("cwd が違う（Sodashitsu の外の Codex）・cwd が無い報告は付かない", async () => {
      const { server, stateDir, paneId, cwd } = await bootWithCodex();
      await record(U2, cwd);
      await record(U3, cwd);
      await report(stateDir, { paneId, kind: "codex", sessionId: U2, agentPid: daemonPid, cwd: "/somewhere/else" });
      await report(stateDir, { paneId, kind: "codex", sessionId: U3, agentPid: daemonPid });
      await sleep(500);
      expect(refOf(server, paneId)).toBeNull();
      await report(stateDir, { paneId, kind: "codex", sessionId: U2, agentPid: daemonPid, cwd });
      await vi.waitFor(() => expect(refOf(server, paneId)).toBe(U2));
    });

    it("前面の codex が 2 つあれば、どちらにも付かない（別の pane の上書きもしない）", async () => {
      const { server, stateDir, paneId, cwd } = await bootWithCodex();
      const second = (await server.session.splitPane(paneId, "right", undefined)).pane.id;
      await shellReady(server, second);
      await startAgent(server, second, null, "codex");
      await vi.waitFor(() => expect(agentOf(server, second)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      await report(stateDir, { paneId, kind: "codex", sessionId: "codex-two", agentPid: daemonPid, cwd });
      await report(stateDir, { paneId: second, kind: "codex", sessionId: "codex-two-b", agentPid: daemonPid, cwd: server.session.getPane(second)!.cwd });
      await sleep(500);
      expect(refOf(server, paneId)).toBeNull();
      expect(refOf(server, second)).toBeNull();
    });
  });
  // 20261010-codex-multi-pane: Codex の pane が複数あっても、会話の参照が正しい pane に付く（付けられないときは付けない）。
  describe("複数の Codex の pane（20261010-codex-multi-pane）", () => {
    const daemonPid = process.pid;
    const ID1 = "01a12341-547a-7191-8f4e-75de3ffa2434";
    const ID2 = "01a1234a-1768-7210-befd-023a395239b0";
    const ID3 = "01a12326-c9f9-7773-8000-6bde9e00ac25";

    async function writeRecord(id: string, cwd: string): Promise<void> {
      const day = join(dir, "codex-home", "sessions", "2026", "10", "10");
      await mkdir(day, { recursive: true });
      const meta = { timestamp: new Date().toISOString(), type: "session_meta", payload: { session_id: id, id, cwd, originator: "codex-tui", base_instructions: { text: "x".repeat(20_000) } } };
      await writeFile(join(day, `rollout-2026-10-10T10-11-42-${id}.jsonl`), `${JSON.stringify(meta)}\n`);
    }
    async function bootTwo() {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await boot(stateDir);
      const p1 = server.session.snapshot().panes[0]!.id;
      await shellReady(server, p1);
      const p2 = (await server.session.splitPane(p1, "right", undefined)).pane.id;
      await shellReady(server, p2);
      await startAgent(server, p1, null, "codex");
      await vi.waitFor(() => expect(agentOf(server, p1)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      await startAgent(server, p2, null, "codex");
      await vi.waitFor(() => expect(agentOf(server, p2)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      return { server, stateDir, p1, p2, cwd: server.session.getPane(p1)!.cwd };
    }
    const submit = (server: ComposedServer, paneId: string) => server.terminals.get(paneId)!.writeInput?.("hello\r");

    it("(a) 同じ cwd の 2 つの Codex: 片方が最初の入力を送った直後の daemon の報告は、その pane に付く。もう片方も、同じように付く", async () => {
      const { server, stateDir, p1, p2, cwd } = await bootTwo();
      await writeRecord(ID1, cwd);
      await writeRecord(ID2, cwd);
      submit(server, p2);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID1, agentPid: daemonPid, cwd, source: "startup" }); // 報告の paneId は p1（daemon を起動した pane）
      await vi.waitFor(() => expect(refOf(server, p2)).toBe(ID1));
      expect(refOf(server, p1)).toBeNull();
      submit(server, p1);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID2, agentPid: daemonPid, cwd, source: "startup" });
      await vi.waitFor(() => expect(refOf(server, p1)).toBe(ID2));
      expect(refOf(server, p2)).toBe(ID1);
    });

    it("(b) ほぼ同時に両方が送ったら、どちらにも付かない", async () => {
      const { server, stateDir, p1, p2, cwd } = await bootTwo();
      await writeRecord(ID1, cwd);
      submit(server, p1);
      submit(server, p2);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID1, agentPid: daemonPid, cwd, source: "startup" });
      await sleep(800);
      expect(refOf(server, p1)).toBeNull();
      expect(refOf(server, p2)).toBeNull();
    });

    it("(c) 記録の無い・cwd の違う会話（Sodashitsu の外の Codex）は、直前に入力のあった pane にも付かない", async () => {
      const { server, stateDir, p1, p2, cwd } = await bootTwo();
      submit(server, p2);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID3, agentPid: daemonPid, cwd: "/somewhere/else" });
      await writeRecord(ID1, cwd);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID2, agentPid: daemonPid, cwd, source: "startup" }); // 記録が無い
      await sleep(1_500);
      expect(refOf(server, p2)).toBeNull();
      expect(refOf(server, p1)).toBeNull();
    });

    it("引数（codex resume <id>）: 復元で打ち込まれる・利用者が打った pane は、報告を待たずに会話が決まる", async () => {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await boot(stateDir);
      const paneId = server.session.snapshot().panes[0]!.id;
      await shellReady(server, paneId);
      await startAgent(server, paneId, null, `codex resume ${ID1}`);
      await vi.waitFor(() => expect(refOf(server, paneId)).toBe(ID1), { timeout: 10_000 });
    });

    it("終了の文言: 時刻の一致で付いた参照は、終了のときの `codex resume <id>` で直る。次の起動の引数と同じ pane で別の会話に替わる（d）", async () => {
      const { server, stateDir, p1, p2, cwd } = await bootTwo();
      await writeRecord(ID1, cwd);
      submit(server, p2);
      await report(stateDir, { paneId: p1, kind: "codex", sessionId: ID1, agentPid: daemonPid, cwd, source: "startup" });
      await vi.waitFor(() => expect(refOf(server, p2)).toBe(ID1));
      // p2 の codex を、終了の文言つきで終わらせる（本当は ID2 の会話だった）
      server.terminals.get(p2)!.write("q");
      await vi.waitFor(() => expect(agentOf(server, p2)).toBeNull(), { timeout: 15_000, interval: 50 });
      // この偽の codex は FAKE_EXIT_ID が無いので文言を出さない → 参照は、猶予の間は残る（文言で直るのは、次のテスト）
      expect(refOf(server, p2)).toBe(ID1);
      // 同じ pane で、別の会話を始める（引数）
      await startAgent(server, p2, null, `codex resume ${ID2}`);
      await vi.waitFor(() => expect(refOf(server, p2)).toBe(ID2), { timeout: 10_000 });
      expect(server.session.agentSessionHistoryOf(p2).map((h) => h.sessionId)).toEqual([ID1]);
    });

    it("終了の文言: codex が `To reconnect, run: codex resume <id>` を出して終わると、その pane の会話の参照が、その id になる", async () => {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await boot(stateDir);
      const paneId = server.session.snapshot().panes[0]!.id;
      await shellReady(server, paneId);
      await writeRecord(ID3, server.session.getPane(paneId)!.cwd); // 終了の文言は、記録で検算してから付く
      await startAgent(server, paneId, null, `FAKE_EXIT_ID=${ID3} codex`);
      await vi.waitFor(() => expect(agentOf(server, paneId)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      expect(refOf(server, paneId)).toBeNull();
      server.terminals.get(paneId)!.write("q");
      await vi.waitFor(() => expect(refOf(server, paneId)).toBe(ID3), { timeout: 15_000 });
    });
    it("(AC4) 再起動の後、参照のある Codex の pane すべてに `codex resume <id>` が打ち込まれ、参照はそのまま保たれる（報告が来なくても捨てられない・替わらない）", async () => {
      const first = await bootTwo();
      await writeRecord(ID1, first.cwd);
      await writeRecord(ID2, first.cwd);
      submit(first.server, first.p2);
      await report(first.stateDir, { paneId: first.p1, kind: "codex", sessionId: ID1, agentPid: daemonPid, cwd: first.cwd, source: "startup" });
      await vi.waitFor(() => expect(refOf(first.server, first.p2)).toBe(ID1));
      submit(first.server, first.p1);
      await report(first.stateDir, { paneId: first.p1, kind: "codex", sessionId: ID2, agentPid: daemonPid, cwd: first.cwd, source: "startup" });
      await vi.waitFor(() => expect(refOf(first.server, first.p1)).toBe(ID2));
      const log = join(dir, "codex-args.log");
      const countOf = async (id: string) => (existsSync(log) ? (await readFile(log, "utf8")).split("\n").filter((l) => l === `resume ${id}`).length : 0);
      const before = [await countOf(ID1), await countOf(ID2)];
      await first.server.close();
      const again = await boot(first.stateDir);
      await vi.waitFor(async () => expect([await countOf(ID1), await countOf(ID2)]).toEqual([before[0]! + 1, before[1]! + 1]), { timeout: 20_000 });
      const panes = again.session.snapshot().panes;
      for (const p of panes) await vi.waitFor(() => expect(agentOf(again, p.id)?.kind).toBe("codex"), { timeout: 15_000, interval: 50 });
      await sleep(1_500);
      expect(refOf(again, first.p2)).toBe(ID1);
      expect(refOf(again, first.p1)).toBe(ID2);
    });
  });
});
