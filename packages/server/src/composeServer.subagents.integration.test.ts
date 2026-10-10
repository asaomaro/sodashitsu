import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { AgentInfo } from "@sodashitsu/protocol";
import { agentReportSocketPathFor, paneSocketPathFor } from "./config.js";
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
      // 実物のフックは、報告したエージェントの pid（CLAUDE_PID）を足す。この試験を動かしている環境の CLAUDE_PID（あれば）は
      // 別の claude のものなので外し、居れば、その pane の偽のエージェントの pid に置き換える（20261009-agent-session-attribution）。
      delete env["CLAUDE_PID"];
      try {
        const pid = execFileSync("pgrep", ["-f", join(dir, "fake-agent.mjs")], { encoding: "utf8" }).trim().split("\n")[0];
        if (pid) env["CLAUDE_PID"] = pid;
      } catch {
        /* 偽のエージェントが居なければ（検出より前の報告の試験）pid は付けない */
      }
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

    it("連携の kind でない名乗り（gemini・__proto__）は、その pane に記録されない", async () => {
      const { server, stateDir, paneId } = await boot();
      // 無効な報告は pane A へ。順序の目印になる有効な報告は別の pane B へ送る。
      const other = await server.session.createWorkspace("/tmp", "claude");
      await sendRaw(stateDir, { paneId, kind: "gemini", sessionId: "g-1" });
      await sendRaw(stateDir, { paneId, kind: "__proto__", sessionId: "p-1" });
      await sendRaw(stateDir, { paneId: other.pane.id, kind: "codex", sessionId: "marker-b" });
      await vi.waitFor(() =>
        expect(server.session.getPane(other.pane.id)?.agentSession?.sessionId).toBe("marker-b"),
      );
      // B に届いた時点で、先に送った A への 2 つは処理済み。A は何も記録されていない。
      expect(server.session.getPane(paneId)?.agentSession).toBeNull();
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
        { id: "marker", type: "Explore", depth: 1, startedAt: expect.any(Number) },
      ]);
    });

    // 20261008-graph-first PR6a: 入れ子の親子と、記録の材料（実物のスクリプト → 実 socket → 配られる一覧）。
    it("入れ子の親・深さ・hasTranscript が一覧に載る。記録の場所そのものは、配る一覧のどこにも載らない", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      const tp = "/home/u/.claude/projects/-w/sess-1.jsonl";
      await hook(stateDir, paneId, { ...pre("外側"), transcript_path: tp });
      await hook(stateDir, paneId, { ...start("outer1"), transcript_path: tp });
      await hook(stateDir, paneId, { ...pre("内側"), agent_id: "outer1", transcript_path: tp });
      await hook(stateDir, paneId, { ...start("inner1"), transcript_path: tp });
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items.map((i) => i.id)).toEqual(["outer1", "inner1"]),
      );
      const items = subsOf(server, paneId)!.items;
      expect(items[0]).toMatchObject({ id: "outer1", description: "外側", depth: 1, hasTranscript: true });
      expect(items[1]).toMatchObject({ id: "inner1", description: "内側", parentId: "outer1", depth: 2, hasTranscript: true });
      expect(JSON.stringify(server.session.snapshot())).not.toContain(".claude/projects");
    });

    it("古いフックの報告（親・場所の項目が無い）でも数えられる（hasTranscript なし）", async () => {
      const { server, stateDir, paneId } = await bootWithAgent();
      await hook(stateDir, paneId, start("legacy"));
      await vi.waitFor(() =>
        expect(subsOf(server, paneId)?.items).toEqual([
          { id: "legacy", type: "Explore", depth: 1, startedAt: expect.any(Number) },
        ]),
      );
    });

    // 20261008-graph-first PR6c: サブエージェントの記録を読む口（`agent.subagent_transcript`）の安全（AC-U5）。実物のスクリプト → 実 socket → 実 WS。
    describe("記録を読む口の安全（agent.subagent_transcript）", () => {
      const SESS = "sess-1";
      /** HOME はこの試験の一時のフォルダ（`beforeAll`）。Claude Code の記録の置き場所 = `$HOME/.claude/projects`。 */
      const projectsRoot = () => join(dir, ".claude", "projects");
      const line = (type: string, content: unknown) => JSON.stringify({ type, message: { content } }) + "\n";

      async function transcriptFor(id: string, projectsBase = projectsRoot()): Promise<{ parent: string; file: string }> {
        const proj = join(projectsBase, "-work-proj");
        await mkdir(join(proj, SESS, "subagents"), { recursive: true });
        const file = join(proj, SESS, "subagents", `agent-${id}.jsonl`);
        await writeFile(file, line("user", "調べて") + line("assistant", [{ type: "text", text: "見ます" }]));
        return { parent: join(proj, `${SESS}.jsonl`), file };
      }
      const read = (c: Client, paneId: string, agentId: unknown, offset?: number) =>
        c.request("agent.subagent_transcript", { paneId, agentId, ...(offset !== undefined ? { offset } : {}) });
      /** 報告された（偽でもよい）親の記録の場所つきで、サブエージェントを始める。 */
      const startWith = async (stateDir: string, paneId: string, id: string, transcriptPath: string) => {
        await hook(stateDir, paneId, { ...start(id), transcript_path: transcriptPath });
        await vi.waitFor(() => expect(subsOf(boot0.server, paneId)?.items.map((i) => i.id)).toContain(id));
      };
      let boot0: Awaited<ReturnType<typeof bootWithAgent>>;

      it("報告されたサブエージェントの記録を、整形して返す。場所は、受け取りも返しもしない", async () => {
        boot0 = await bootWithAgent();
        const { server, stateDir, paneId, clients } = boot0;
        const { parent } = await transcriptFor("ok1");
        await startWith(stateDir, paneId, "ok1", parent);
        const r = await read(clients[0]!, paneId, "ok1");
        expect(r.error).toBeUndefined();
        expect(r.result).toMatchObject({ status: "ok", running: true, entries: [{ kind: "prompt", text: "調べて" }, { kind: "say", text: "見ます" }] });
        expect(JSON.stringify(r.result)).not.toContain(dir);
        expect(JSON.stringify(subsOf(server, paneId))).not.toContain(".claude/projects");
        // 続き
        const next = (r.result as { offset: number }).offset;
        expect(((await read(clients[0]!, paneId, "ok1", next)).result as { entries: unknown[] }).entries).toEqual([]);
      });

      it("ブラウザから、ほかのファイルを読ませようとしても断られる（id に ../・絶対のパス・長い文字列・別の pane・居ない id）", async () => {
        boot0 = await bootWithAgent();
        const { stateDir, paneId, clients } = boot0;
        const { parent } = await transcriptFor("ok2");
        await startWith(stateDir, paneId, "ok2", parent);
        const secret = join(dir, "secret.jsonl");
        await writeFile(secret, line("user", "TOPSECRET"));
        const bad: unknown[] = ["../ok2", "../../../secret", secret, "a/b", "ok2/../ok2", "x".repeat(129), "x".repeat(5000), "nobody", "", 5, null, { a: 1 }];
        for (const id of bad) {
          const r = await read(clients[0]!, paneId, id);
          expect(r.result, JSON.stringify(id)).toBeUndefined();
          expect(["not_found", "invalid_params"]).toContain(r.error?.code);
        }
        // 別の pane の id・居ない pane
        const other = await clients[0]!.request("pane.split", { paneId, direction: "right" });
        const otherPane = ((other.result as { pane: { id: string } }).pane).id;
        expect((await read(clients[0]!, otherPane, "ok2")).error?.code).toBe("not_found");
        expect((await read(clients[0]!, "nopane", "ok2")).error?.code).toBe("not_found");
        // 位置の不正
        expect((await clients[0]!.request("agent.subagent_transcript", { paneId, agentId: "ok2", offset: -1 })).error?.code).toBe("invalid_params");
        expect((await clients[0]!.request("agent.subagent_transcript", { paneId, agentId: "ok2", path: secret })).result).toBeDefined(); // 知らない項目は読まれない（場所としては使われない）
      });

      it("偽のフックの報告で、親の記録の場所を ~/.claude/projects の外へ向けても、読めない（中身が返らない）", async () => {
        boot0 = await bootWithAgent();
        const { stateDir, paneId, clients } = boot0;
        const outside = join(dir, "outside-projects");
        const { parent } = await transcriptFor("ev1", outside);
        await startWith(stateDir, paneId, "ev1", parent);
        const r = await read(clients[0]!, paneId, "ev1");
        expect(r.result).toMatchObject({ status: "unreadable", entries: [] });
        expect(JSON.stringify(r)).not.toContain("調べて");
        expect(JSON.stringify(r)).not.toContain(outside);
        // `..` で根の外へ
        await hook(stateDir, paneId, { ...start("ev2"), transcript_path: join(projectsRoot(), "-work-proj", "..", "..", "..", "outside-projects", "-work-proj", `${SESS}.jsonl`) });
        await vi.waitFor(() => expect(subsOf(boot0.server, paneId)?.items.map((i) => i.id)).toContain("ev2"));
        expect((await read(clients[0]!, paneId, "ev2")).result).toMatchObject({ status: "unreadable", entries: [] });
        // 親の記録の名前がセッションの id と違う・相対の場所
        for (const [id, path] of [["ev3", join(projectsRoot(), "-work-proj", "other.jsonl")], ["ev4", "relative/x.jsonl"]] as const) {
          await hook(stateDir, paneId, { ...start(id), transcript_path: path });
          await vi.waitFor(() => expect(subsOf(boot0.server, paneId)?.items.map((i) => i.id)).toContain(id));
          expect((await read(clients[0]!, paneId, id)).result).toMatchObject({ status: "unreadable", entries: [] });
        }
      });

      it("リンクで外へ出ても読めない（フォルダのリンク・ファイルのリンク）", async () => {
        boot0 = await bootWithAgent();
        const { stateDir, paneId, clients } = boot0;
        const secretDir = join(dir, "secret-dir");
        await mkdir(secretDir, { recursive: true });
        await writeFile(join(secretDir, "agent-ln1.jsonl"), line("user", "TOPSECRET"));
        const proj = join(projectsRoot(), "-link-proj");
        await mkdir(join(proj, SESS), { recursive: true });
        await symlink(secretDir, join(proj, SESS, "subagents")); // フォルダがリンクで外へ
        await startWith(stateDir, paneId, "ln1", join(proj, `${SESS}.jsonl`));
        const r1 = await read(clients[0]!, paneId, "ln1");
        expect(r1.result).toMatchObject({ status: "unreadable", entries: [] });
        expect(JSON.stringify(r1)).not.toContain("TOPSECRET");
        // ファイルがリンクで外へ
        const proj2 = join(projectsRoot(), "-link-proj2");
        await mkdir(join(proj2, SESS, "subagents"), { recursive: true });
        await symlink(join(secretDir, "agent-ln1.jsonl"), join(proj2, SESS, "subagents", "agent-ln2.jsonl"));
        await startWith(stateDir, paneId, "ln2", join(proj2, `${SESS}.jsonl`));
        const r2 = await read(clients[0]!, paneId, "ln2");
        expect(r2.result).toMatchObject({ status: "unreadable", entries: [] });
        expect(JSON.stringify(r2)).not.toContain("TOPSECRET");
      });

      it("ログイン不要の受け口（pane.sock）からは呼べない。サーバのログに記録の中身を出さない", async () => {
        boot0 = await bootWithAgent();
        const { server, stateDir, paneId, clients } = boot0;
        const { parent } = await transcriptFor("ps1");
        await startWith(stateDir, paneId, "ps1", parent);
        await read(clients[0]!, paneId, "ps1");
        const sockPath = paneSocketPathFor(stateDir)!;
        const answer = await new Promise<string>((resolve, reject) => {
          const c = netConnect(sockPath, () => c.write(`${JSON.stringify({ v: 1, op: "agent.subagent_transcript", paneId, params: { agentId: "ps1" } })}\n`));
          let out = "";
          c.on("data", (d) => (out += d));
          c.on("close", () => resolve(out));
          c.on("error", reject);
        });
        expect(JSON.parse(answer)).toMatchObject({ ok: false, error: { code: "unknown_op" } });
        void server;
      });
    });
  },
);
