import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { AgentInfo } from "@sodashitsu/protocol";
import { agentReportSocketPathFor } from "./config.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261004-subagent-display の T15。実物のフックのスクリプト（子プロセス。stdin にフックの入力・環境変数に `SODA_PANE_ID` と受け口のパス）→ 実 socket →
 * `SubagentTracker` → `SessionService` → `pane.agent_status_changed`（2 つの接続）と snapshot を、実物の `composeServer`（空きポート・自前の一時 stateDir）・
 * 実 PTY の bash・実際の検出の上の偽の `claude` で確かめる（AC1・AC5・AC7・AC8・AC12・AC13・AC15・AC16・AC17）。
 * **子プロセス（フックのスクリプト）には、この試験を動かしている pane から継いだ `SODA_*` を渡さない**（利用者のサーバへ報告が届かないように、必要な 2 つだけを明示する）。
 */
vi.setConfig({ testTimeout: 30_000 });

const SCRIPT = fileURLToPath(new URL("../assets/agent-hook-report.cjs", import.meta.url));

const fakeAgent = `
process.stdin.setRawMode(true);
process.stdout.write("\\u001b]0;\\u2733 fake\\u0007fake agent ready\\r\\n");
process.stdin.on("data", (d) => {
  if (String(d).includes("q")) process.exit(0);
});
`;

interface Client {
  request(method: string, params: unknown): Promise<{ result?: unknown; error?: { code: string } }>;
  /** 受け取った pane.agent_status_changed（順番どおり。pane ごと）。 */
  agentEvents: { paneId: string; agent: AgentInfo | null }[];
  close(): void;
}

describe.skipIf(process.platform !== "linux" || !existsSync("/bin/bash"))(
  "composeServer: サブエージェントの表示（20261004-subagent-display・実物のスクリプト → 実 socket → SessionService・偽の claude）",
  () => {
    let dir: string;
    let savedEnv: Record<string, string | undefined> = {};
    const cleanups: (() => Promise<unknown> | unknown)[] = [];

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "soda-subagents-it-"));
      await mkdir(join(dir, "bin"));
      await writeFile(join(dir, "fake-agent.mjs"), fakeAgent);
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

    async function boot(): Promise<{
      server: ComposedServer;
      stateDir: string;
      clients: Client[];
      paneId: string;
      port: number;
      cookie: string;
      origin: string;
    }> {
      const stateDir = await mkdtemp(join(dir, "state-"));
      const server = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir,
        origin: [],
        shell: "/bin/bash",
      });
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
      const login = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      expect(login.status).toBe(204);
      const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
      const clients: Client[] = [];
      for (let i = 0; i < 2; i++) clients.push(await connect(port, cookie, origin));
      return {
        server,
        stateDir,
        clients,
        paneId: server.session.snapshot().panes[0]!.id,
        port,
        cookie,
        origin,
      };
    }

    async function connect(
      port: number,
      cookie: string,
      origin: string,
    ): Promise<Client & { hello: () => Promise<{ result?: unknown }> }> {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { cookie, origin, host: `127.0.0.1:${port}` },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      cleanups.push(() => ws.close());
      const pending = new Map<
        string,
        (v: { result?: unknown; error?: { code: string } }) => void
      >();
      const agentEvents: Client["agentEvents"] = [];
      ws.on("message", (raw, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(raw.toString()) as {
          id?: string;
          result?: unknown;
          error?: { code: string };
          event?: string;
          data?: { paneId: string; agent: AgentInfo | null };
        };
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.(msg.error !== undefined ? { error: msg.error } : { result: msg.result });
        } else if (msg.event === "pane.agent_status_changed")
          agentEvents.push({ paneId: msg.data!.paneId, agent: msg.data!.agent });
      });
      let seq = 0;
      const request = (method: string, params: unknown) =>
        new Promise<{ result?: unknown; error?: { code: string } }>((resolve) => {
          const id = `r${++seq}`;
          pending.set(id, resolve);
          ws.send(JSON.stringify({ id, method, params }));
        });
      const hello = () => request("client.hello", { protocol: 1, kind: "desktop" });
      await hello();
      return { request, agentEvents, close: () => ws.close(), hello };
    }

    /** 実物のフックのスクリプトを、`SODA_PANE_ID` と受け口のパスだけを渡して動かす（継いだ `SODA_*` は渡さない）。 */
    function hook(
      stateDir: string,
      paneId: string,
      input: Record<string, unknown>,
      kind = "claude",
    ): Promise<void> {
      const env: NodeJS.ProcessEnv = { ...process.env };
      for (const k of Object.keys(env)) if (k.startsWith("SODA_")) delete env[k];
      env["SODA_PANE_ID"] = paneId;
      env["SODA_AGENT_REPORT_SOCKET"] = agentReportSocketPathFor(stateDir);
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SCRIPT, kind], {
          env,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0 || out !== "")
            reject(new Error(`hook exited ${code}, stdout=${JSON.stringify(out)}`));
          else resolve();
        });
        child.stdin.end(JSON.stringify(input));
      });
    }
    const S = "sess-1";
    const start = (id: string, type = "Explore") => ({
      session_id: S,
      hook_event_name: "SubagentStart",
      agent_id: id,
      agent_type: type,
    });
    const stop = (id: string) => ({ session_id: S, hook_event_name: "SubagentStop", agent_id: id });
    const pre = (description: string, type = "Explore", bg = false) => ({
      session_id: S,
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_input: { description, subagent_type: type, run_in_background: bg, prompt: "秘密の指示" },
    });
    const agentStop = (running: { id: string; description?: string; agent_type?: string }[]) => ({
      session_id: S,
      hook_event_name: "Stop",
      last_assistant_message: "秘密の発言",
      background_tasks: running.map((r) => ({ type: "subagent", status: "running", ...r })),
    });

    const agentOf = (server: ComposedServer, paneId: string) =>
      server.session.getPane(paneId)?.agent ?? null;
    const subsOf = (server: ComposedServer, paneId: string) => agentOf(server, paneId)?.subagents;
    async function shellReady(server: ComposedServer, paneId: string): Promise<void> {
      const marker = join(dir, `ready-${server.options.port}-${paneId}`);
      server.terminals.get(paneId)!.write(`touch ${JSON.stringify(marker)}\r`);
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 10_000,
        interval: 50,
      });
    }
    async function typeClaude(server: ComposedServer, paneId: string): Promise<void> {
      const prev = agentOf(server, paneId)?.instanceId;
      server.terminals.get(paneId)!.write("claude\r");
      await vi.waitFor(
        () =>
          expect(
            agentOf(server, paneId) !== null && agentOf(server, paneId)!.instanceId !== prev,
          ).toBe(true),
        { timeout: 15_000, interval: 50 },
      );
    }
    async function quitAgent(server: ComposedServer, paneId: string): Promise<void> {
      server.terminals.get(paneId)!.write("q");
      await vi.waitFor(() => expect(agentOf(server, paneId)).toBeNull(), {
        timeout: 15_000,
        interval: 50,
      });
    }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** 「起きないこと」の確認の合図: 後続の有効な報告が配られた時点で、前の（無視されるはずの）報告も処理済み（受け口は届いた順に 1 つずつ処理する）。 */
    async function afterMarker(
      server: ComposedServer,
      stateDir: string,
      paneId: string,
    ): Promise<void> {
      await hook(stateDir, paneId, start("marker"));
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items.map((i) => i.id)).toContain("marker"),
      );
    }
    /** 検出済みのエージェントのある、起動直後のサーバ。 */
    async function bootWithAgent() {
      const b = await boot();
      await shellReady(b.server, b.paneId);
      await typeClaude(b.server, b.paneId);
      return b;
    }
    const countOf = (c: Client, paneId: string) =>
      c.agentEvents
        .filter((e) => e.paneId === paneId && e.agent?.subagents !== undefined)
        .map((e) => e.agent!.subagents!.count);

    it("起動 → 終了: 両方の接続に pane.agent_status_changed で件数が届き、実行前の報告の説明・種類が付く。ログに説明の中身は出ない（AC1・AC5・AC12）", async () => {
      const { server, stateDir, clients, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, pre("調べる仕事", "Explore", true));
      await hook(stateDir, paneId, start("a1"));
      await vi.waitFor(() => expect(subsOf(server, paneId)?.count).toBe(1));
      expect(subsOf(server, paneId)?.items[0]).toMatchObject({
        id: "a1",
        type: "Explore",
        description: "調べる仕事",
        background: true,
      });
      await vi.waitFor(() =>
        expect(clients.every((c) => countOf(c, paneId).includes(1))).toBe(true),
      );
      await hook(stateDir, paneId, stop("a1"));
      await vi.waitFor(() => expect(subsOf(server, paneId)).toEqual({ count: 0, items: [] }));
      await vi.waitFor(() =>
        expect(clients.every((c) => countOf(c, paneId).at(-1) === 0)).toBe(true),
      );
    });

    /** 受け口へ、1 接続 1 行の電文を直接送る（スクリプトの起動を待たない）。 */
    const sendRaw = (stateDir: string, body: Record<string, unknown>): Promise<void> =>
      new Promise((resolve, reject) => {
        const c = netConnect(agentReportSocketPathFor(stateDir), () =>
          c.end(`${JSON.stringify(body)}\n`),
        );
        c.on("close", () => resolve());
        c.on("error", reject);
      });

    it("サーバのログに説明の中身が出ない（ログの経路が実際に使われた上で確かめる）（AC12）", async () => {
      const { stateDir, paneId, server } = await bootWithAgent();
      await hook(stateDir, paneId, pre("調べる仕事", "Explore", true));
      await hook(stateDir, paneId, { ...agentStop([]), last_assistant_message: "秘密の発言" });
      // 上限（256 件）を超える起動を送ると、「数えない」の警告がログに出る（説明・種類つきの電文を含める）。
      const base = { paneId, kind: "claude", sessionId: S };
      for (let i = 0; i < 260; i += 20) {
        await Promise.all(
          Array.from({ length: 20 }, (_, j) =>
            sendRaw(stateDir, {
              ...base,
              type: "subagent_start",
              agentId: `cap${i + j}`,
              agentType: "秘密の種類",
            }),
          ),
        );
      }
      await sendRaw(stateDir, { ...base, type: "subagent_pending", description: "秘密の説明" });
      await vi.waitFor(() => expect(subsOf(server, paneId)?.count).toBe(256), { timeout: 10_000 });
      const logPath = join(stateDir, "server.log");
      // ログは非同期に書かれる。「数えない」の警告が書かれるまで待つ（ログの経路が実際に動いたことの確認を兼ねる）。
      await vi.waitFor(
        async () => expect(await readFile(logPath, "utf8")).toContain("subagents: too many"),
        {
          timeout: 10_000,
          interval: 100,
        },
      );
      const log = await readFile(logPath, "utf8");
      for (const secret of ["調べる仕事", "秘密の指示", "秘密の発言", "秘密の説明", "秘密の種類"])
        expect(log).not.toContain(secret);
    });

    it("作業の終わりの突き合わせ: running にあるものは足り（説明・種類つき）、無いものは外れる。最近終了したものは足し直さない（AC8・AC16）", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, start("a1"));
      await hook(stateDir, paneId, start("a2"));
      await vi.waitFor(() => expect(subsOf(server, paneId)?.count).toBe(2));
      await hook(
        stateDir,
        paneId,
        agentStop([{ id: "bg9", description: "遅い調査", agent_type: "Plan" }, { id: "a2" }]),
      );
      await vi.waitFor(() =>
        expect(
          subsOf(server, paneId)
            ?.items.map((i) => i.id)
            .sort(),
        ).toEqual(["a2", "bg9"]),
      );
      expect(subsOf(server, paneId)?.items.find((i) => i.id === "bg9")).toMatchObject({
        type: "Plan",
        description: "遅い調査",
        background: true,
      });
      await hook(stateDir, paneId, stop("bg9"));
      await hook(stateDir, paneId, agentStop([{ id: "a2" }, { id: "bg9" }])); // 終了済みの bg9 は足し直さない
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["a2"]),
      );
      await hook(stateDir, paneId, agentStop([]));
      await vi.waitFor(() => expect(subsOf(server, paneId)).toEqual({ count: 0, items: [] }));
    });

    it("セッションの終了（SessionEnd）でそのセッションの分が消える。別のセッションの分は残る", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, start("a1"));
      await hook(stateDir, paneId, { ...start("b1"), session_id: "sess-2" });
      await vi.waitFor(() => expect(subsOf(server, paneId)?.count).toBe(2));
      await hook(stateDir, paneId, {
        session_id: S,
        hook_event_name: "SessionEnd",
        reason: "other",
      });
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["b1"]),
      );
    });

    it("検出より前に届いた報告は捨てず、最初の検出で配られる（AC15）。エージェントが入れ替わると消え、新しい検出は件数を持たない（AC7）", async () => {
      const { server, stateDir, paneId } = await boot();
      await shellReady(server, paneId);
      await hook(stateDir, paneId, start("early"));
      await typeClaude(server, paneId); // 報告のほうが先（検出の前）。捨てられていなければ、最初の検出で配られる
      await vi.waitFor(
        () => expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["early"]),
        { timeout: 5000 },
      );
      await quitAgent(server, paneId);
      await typeClaude(server, paneId); // 新しい検出
      expect(subsOf(server, paneId)).toBeUndefined();
      await hook(stateDir, paneId, start("fresh"));
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["fresh"]),
      );
    });

    it("2 つの接続に同じ件数が届き、読み込み直した新しい接続の snapshot にも載る（AC15）", async () => {
      const { server, stateDir, clients, paneId, port, cookie, origin } = await bootWithAgent();
      await hook(stateDir, paneId, start("a1"));
      await hook(stateDir, paneId, start("a2"));
      await vi.waitFor(() =>
        expect(clients.every((c) => countOf(c, paneId).at(-1) === 2)).toBe(true),
      );
      expect(
        clients[0]!.agentEvents.filter((e) => e.agent?.subagents).map((e) => e.agent!.subagents),
      ).toEqual(
        clients[1]!.agentEvents.filter((e) => e.agent?.subagents).map((e) => e.agent!.subagents),
      );
      const late = await connect(port, cookie, origin);
      const hello = (await late.hello()) as {
        result?: { snapshot?: { panes: { id: string; agent: AgentInfo | null }[] } };
      };
      const pane = hello.result?.snapshot?.panes.find((p) => p.id === paneId);
      expect(pane?.agent?.subagents?.count).toBe(2);
      expect(server.session.getPane(paneId)?.agent?.subagents?.items).toHaveLength(2);
    });

    it("同じ内容の報告ではイベントが増えない。20 件を続けても、まとめて 1 回で配る（100 ミリ秒のまとめ）", async () => {
      const { stateDir, clients, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, start("a1"));
      await vi.waitFor(() => expect(countOf(clients[0]!, paneId)).toEqual([1]));
      await hook(stateDir, paneId, start("a1")); // 同じ ID の起動
      await hook(stateDir, paneId, stop("never-started")); // 知らない ID の終了
      await hook(stateDir, paneId, start("a2")); // 合図（これより前の 2 件が配られていれば、ここまでに [1] 以外のイベントが出ている）
      await vi.waitFor(() => expect(countOf(clients[0]!, paneId)).toEqual([1, 2]));
      // 20 件を、実 socket へ続けて送る（スクリプトの起動を待たず、数ミリ秒のうちに）。
      const sock = agentReportSocketPathFor(stateDir);
      await Promise.all(
        Array.from(
          { length: 20 },
          (_, i) =>
            new Promise<void>((resolve, reject) => {
              const c = netConnect(sock, () =>
                c.end(
                  `${JSON.stringify({ paneId, kind: "claude", sessionId: S, type: "subagent_start", agentId: `burst${i}` })}\n`,
                ),
              );
              c.on("close", () => resolve());
              c.on("error", reject);
            }),
        ),
      );
      await vi.waitFor(() => expect(countOf(clients[0]!, paneId).at(-1)).toBe(22));
      await sleep(400); // 最後のまとめの後に余計な配信が無いことの確認（落ちる側ではなく通る側の余裕）
      const counts = countOf(clients[0]!, paneId);
      // 20 件が、20 回ではなく数回の配信にまとまる（まとめが 0 だと 6 回前後。接続が窓にまたがっても数回に収まる）。
      expect(counts.slice(2).length).toBeLessThanOrEqual(3);
      expect(counts.at(-1)).toBe(22);
    });

    it("古い形の電文（type なし）は今までどおりセッション ID の報告になり、会話の再開の記録が付く（AC13）", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, {
        session_id: "resume-me",
        hook_event_name: "SessionStart",
        source: "startup",
      });
      await vi.waitFor(() =>
        expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe("resume-me"),
      );
    });

    it("エージェントの周期の判定が何度走っても、件数は消えず、subagents の無い通知も出ない（同じ検出の間は引き継ぐ）", async () => {
      const { server, stateDir, clients, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, start("a1"));
      await vi.waitFor(() => expect(subsOf(server, paneId)?.count).toBe(1));
      await sleep(2500); // 判定の周期（0.5〜1 秒）が何回か走る
      expect(subsOf(server, paneId)?.count).toBe(1);
      const after = clients[0]!.agentEvents.filter((e) => e.paneId === paneId);
      const firstWith = after.findIndex((e) => e.agent?.subagents?.count === 1);
      expect(firstWith).toBeGreaterThanOrEqual(0);
      for (const e of after.slice(firstWith)) expect(e.agent?.subagents?.count).toBe(1);
    });

    it("種類つきの電文は claude だけを数える（受け口へ直接 codex の名乗りで送っても無視される）", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await sendRaw(stateDir, {
        paneId,
        kind: "codex",
        sessionId: S,
        type: "subagent_start",
        agentId: "x",
      });
      await afterMarker(server, stateDir, paneId);
      expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["marker"]); // codex の分は数えられていない
    });

    // 20261007-agent-hook-drift の research X1。受け口は連携の kind の全部のセッション ID の報告を pane に記録する。
    it("連携の kind（grok・qodercli・devin）のセッション ID の報告が pane に記録される（claude・codex 以外も）", async () => {
      const { server, stateDir, paneId } = await boot();
      for (const kind of ["grok", "qodercli", "devin"] as const) {
        await sendRaw(stateDir, { paneId, kind, sessionId: `${kind}-1` });
        await vi.waitFor(() =>
          expect(server.session.getPane(paneId)?.agentSession).toMatchObject({
            kind,
            sessionId: `${kind}-1`,
          }),
        );
      }
    });

    it("連携の kind でない名乗り（gemini・__proto__）は記録されない", async () => {
      const { server, stateDir, paneId } = await boot();
      await sendRaw(stateDir, { paneId, kind: "gemini", sessionId: "g-1" });
      await sendRaw(stateDir, { paneId, kind: "__proto__", sessionId: "p-1" });
      // 続けて有効な報告を送り、それが記録されるまで待つ（その時点で、先の 2 つは処理済みのはず）。
      await sendRaw(stateDir, { paneId, kind: "codex", sessionId: "after" });
      await vi.waitFor(() =>
        expect(server.session.getPane(paneId)?.agentSession?.sessionId).toBe("after"),
      );
      expect(server.session.getPane(paneId)?.agentSession?.kind).toBe("codex");
    });

    it("Agent 以外の PreToolUse は何も送らない（検出済みでも件数は出ない）", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, {
        session_id: S,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "ls", description: "Bash の説明" },
      });
      await afterMarker(server, stateDir, paneId);
      // Bash の説明が実行前の報告として送られていれば、合図の起動に付いてしまう。
      expect(subsOf(server, paneId)?.items).toEqual([
        { id: "marker", type: "Explore", startedAt: expect.any(Number) },
      ]);
    });
  },
);
