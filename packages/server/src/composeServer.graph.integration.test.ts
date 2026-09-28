import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20260927-agent-graph の T3：`graph.*` の方式と `graph.changed` を実物の `composeServer`（乱数ポート・一時の状態ディレクトリ）で確かめる
 * （取得・更新・rev_conflict・一時停止/再開・配布・再起動後の復元・session.json が読めない起動の stale・未認証の拒否）。
 */
vi.setConfig({ testTimeout: 20_000 });

interface Client {
  ws: WebSocket;
  clientId: string;
  /** 成功なら result、失敗なら `{ error: { code } }` を返す（投げない）。 */
  request(method: string, params: unknown): Promise<{ result?: unknown; error?: { code: string } }>;
  waitEvent(name: string, pred?: (data: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
}

const A = "local:p1";
const B = "local:p2";
const REMOTE = `${"d".repeat(32)}:p1`;
const trigger = { on: "done", prompt: "見て", output: { lines: 80 }, whenBusy: "wait" };

describe("composeServer: graph.*（20260927-agent-graph）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function tempStateDir(): Promise<string> {
    const stateDir = await makeTempDir("soda-graph-it-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    return stateDir;
  }

  async function start(stateDir: string): Promise<ComposedServer> {
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
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

  async function tokenLogin(server: ComposedServer, token: string): Promise<string> {
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(204);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }

  async function connect(server: ComposedServer, cookie: string): Promise<Client> {
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie, origin, host: `127.0.0.1:${port}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(() => ws.close());
    const events: { event: string; data: unknown }[] = [];
    const pending = new Map<string, (v: { result?: unknown; error?: { code: string } }) => void>();
    const waiters = new Set<() => void>();
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as {
        id?: string;
        result?: unknown;
        error?: { code: string };
        event?: string;
        data?: unknown;
      };
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.(msg.error !== undefined ? { error: msg.error } : { result: msg.result });
        return;
      }
      if (msg.event !== undefined) {
        events.push({ event: msg.event, data: msg.data });
        for (const w of [...waiters]) w();
      }
    });
    let seq = 0;
    const request = (method: string, params: unknown) =>
      new Promise<{ result?: unknown; error?: { code: string } }>((resolve) => {
        const id = `r${++seq}`;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const waitEvent = (
      name: string,
      pred: (data: unknown) => boolean = () => true,
      timeoutMs = 5000,
    ): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const check = (): void => {
          const hit = events.find((e) => e.event === name && pred(e.data));
          if (hit === undefined) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(hit.data);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timed out waiting for ${name}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    const hello = (await request("client.hello", { protocol: 1, kind: "desktop" })).result as {
      clientId: string;
    };
    return { ws, clientId: hello.clientId, request, waitEvent };
  }

  async function startWithClients(
    stateDir: string,
    n = 1,
  ): Promise<{ server: ComposedServer; token: string; clients: Client[] }> {
    const server = await start(stateDir);
    const token = server.freshToken!;
    const cookie = await tokenLogin(server, token);
    const clients: Client[] = [];
    for (let i = 0; i < n; i++) clients.push(await connect(server, cookie));
    return { server, token, clients };
  }

  it("graph.get は最初 rev 0。graph.update は 1 rev で当て、変えた本人を含む全クライアントへ graph.changed を配る", async () => {
    const { clients } = await startWithClients(await tempStateDir(), 2);
    const [a, b] = clients as [Client, Client];
    expect((await a.request("graph.get", {})).result).toEqual({
      rev: 0,
      paused: false,
      nodes: [],
      links: [],
    });
    const reply = await a.request("graph.update", {
      baseRev: 0,
      ops: [
        { op: "add_node", key: A, x: 0, y: 0 },
        { op: "add_node", key: B, x: 240, y: 0 },
        { op: "add_link", kind: "trigger", from: A, to: B, trigger },
      ],
    });
    const graph = reply.result as { rev: number; links: { id: string }[] };
    expect(graph.rev).toBe(1);
    expect(graph.links.map((l) => l.id)).toEqual(["l1"]);
    const changed = { graph, byClientId: a.clientId };
    expect(await b.waitEvent("graph.changed")).toEqual(changed);
    expect(await a.waitEvent("graph.changed")).toEqual(changed);
    expect((await b.request("graph.get", {})).result).toEqual(graph);
  });

  it("baseRev の不一致は rev_conflict、当てられない操作は invalid_params（どちらも保存しない）", async () => {
    const { clients } = await startWithClients(await tempStateDir(), 2);
    const [a, b] = clients as [Client, Client];
    await a.request("graph.update", { baseRev: 0, ops: [{ op: "add_node", key: A, x: 0, y: 0 }] });
    expect(
      (
        await b.request("graph.update", {
          baseRev: 0,
          ops: [{ op: "move_node", key: A, x: 20, y: 20 }],
        })
      ).error?.code,
    ).toBe("rev_conflict");
    expect(
      (
        await b.request("graph.update", {
          baseRev: 1,
          ops: [{ op: "add_link", kind: "supervise", from: A, to: A }],
        })
      ).error?.code,
    ).toBe("invalid_params");
    expect(
      (
        await b.request("graph.update", {
          baseRev: 1,
          ops: [{ op: "add_node", key: "local:w1", x: 0, y: 0 }],
        })
      ).error?.code,
    ).toBe("invalid_params");
    expect(((await b.request("graph.get", {})).result as { rev: number }).rev).toBe(1);
  });

  it("一時停止・再開（全体・線）。知らない線は not_found。履歴は（実行が入るまで）空", async () => {
    const { clients } = await startWithClients(await tempStateDir());
    const a = clients[0]!;
    await a.request("graph.update", {
      baseRev: 0,
      ops: [
        { op: "add_node", key: A, x: 0, y: 0 },
        { op: "add_node", key: B, x: 0, y: 0 },
        { op: "add_link", kind: "supervise", from: A, to: B },
      ],
    });
    expect((await a.request("graph.pause", {})).result).toMatchObject({ rev: 2, paused: true });
    expect((await a.request("graph.pause", { linkId: "l1" })).result).toMatchObject({
      rev: 3,
      links: [{ paused: "user" }],
    });
    expect((await a.request("graph.resume", {})).result).toMatchObject({
      rev: 4,
      paused: false,
      links: [{ paused: "user" }],
    });
    expect((await a.request("graph.resume", { linkId: "l1" })).result).toMatchObject({
      rev: 5,
      links: [{ paused: null, count: 0 }],
    });
    expect((await a.request("graph.pause", { linkId: "l9" })).error?.code).toBe("not_found");
    expect((await a.request("graph.history", {})).result).toEqual({ runs: [] });
    expect((await a.request("graph.history", { linkId: "l1", limit: 10 })).result).toEqual({
      runs: [],
    });
  });

  it("保存したグラフは再起動の後も読める。session.json が読めなかった起動では手元のノードだけ stale になる", async () => {
    const stateDir = await tempStateDir();
    const first = await startWithClients(stateDir);
    await first.clients[0]!.request("graph.update", {
      baseRev: 0,
      ops: [
        { op: "add_node", key: A, x: 0, y: 0 },
        { op: "add_node", key: REMOTE, x: 240, y: 0 },
      ],
    });
    first.clients[0]!.ws.close();
    await first.server.close();

    const second = await start(stateDir);
    const b = await connect(second, await tokenLogin(second, first.token));
    expect((await b.request("graph.get", {})).result).toEqual({
      rev: 1,
      paused: false,
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: REMOTE, x: 240, y: 0 },
      ],
      links: [],
    });
    b.ws.close();
    await second.close();

    await writeFile(join(stateDir, "session.json"), "{broken");
    const third = await start(stateDir);
    const c = await connect(third, await tokenLogin(third, first.token));
    expect((await c.request("graph.get", {})).result).toEqual({
      rev: 2,
      paused: false,
      nodes: [
        { key: A, x: 0, y: 0, stale: true },
        { key: REMOTE, x: 240, y: 0 },
      ],
      links: [],
    });
  });

  it("読めた session.json より新しい pane（nextId 以上）を指す手元のノードは stale にする（session.json の保存の遅れ。01 のレビュー ラウンド 1）", async () => {
    const stateDir = await tempStateDir();
    const first = await startWithClients(stateDir);
    // 最初の起動の pane は p1 だけ（session.json の nextId.p は 2）。p50 は「作った直後に graph へ載せ、session.json の保存の前に落ちた」pane の代わり。
    await first.clients[0]!.request("graph.update", {
      baseRev: 0,
      ops: [
        { op: "add_node", key: A, x: 0, y: 0 },
        { op: "add_node", key: "local:p50", x: 240, y: 0 },
        { op: "add_node", key: REMOTE, x: 480, y: 0 },
        { op: "add_node", key: "local:p2", x: 720, y: 0 }, // ちょうど nextId.p（次に作られる pane）
      ],
    });
    first.clients[0]!.ws.close();
    await first.server.close();

    const second = await start(stateDir);
    const b = await connect(second, await tokenLogin(second, first.token));
    expect(((await b.request("graph.get", {})).result as { nodes: unknown[] }).nodes).toEqual([
      { key: A, x: 0, y: 0 },
      { key: "local:p50", x: 240, y: 0, stale: true },
      { key: REMOTE, x: 480, y: 0 },
      { key: "local:p2", x: 720, y: 0, stale: true },
    ]);
  });

  it("ログインしていない接続は WebSocket を開けない（graph.* に届かない）", async () => {
    const server = await start(await tempStateDir());
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { origin, host: `127.0.0.1:${port}` },
      });
      ws.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
      ws.once("open", () => reject(new Error("opened without login")));
      ws.once("error", () => undefined);
    });
    expect(status).toBe(401);
  });
});

/**
 * 20260927-agent-graph の 02 T5：実物のサーバでの実行（手元の pane。エージェントの状態は `session.updatePaneRuntime` で偽って出す——判定の
 * AgentMonitor はシェルだけの pane では変化を出さないので、偽の値を上書きしない）。送信は本物の `agent.prompt`（pane のシェルへ打ち込まれる）。
 */
describe("composeServer: 連携の実行（20260927-agent-graph の 02）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  type Run = { linkId: string; result: string; reason?: string; text?: string };
  interface Ctx {
    server: ComposedServer;
    stateDir: string;
    token: string;
    client: {
      request(
        method: string,
        params: unknown,
      ): Promise<{ result?: unknown; error?: { code: string } }>;
      fired(pred: (r: Run) => boolean, timeoutMs?: number): Promise<Run>;
      runs: Run[];
    };
    panes: string[];
  }

  function agentInfo(
    instanceId: string,
    completionSeq: number,
    state: "idle" | "working" | "blocked" | "unknown" = "idle",
  ) {
    return {
      instanceId,
      kind: "claude",
      label: "Claude",
      state,
      completionSeq,
      serverSeenSeq: 0,
      verified: true,
      since: Date.now(),
    };
  }

  async function boot(paneCount: number, stateDir?: string, knownToken?: string): Promise<Ctx> {
    const dir = stateDir ?? (await makeTempDir("soda-graph-run-"));
    if (stateDir === undefined)
      cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: dir, origin: [] });
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
    const token = knownToken ?? server.freshToken ?? "";
    const res = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie, origin, host: `127.0.0.1:${port}` },
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(() => ws.close());
    const runs: Run[] = [];
    const waiters = new Set<() => void>();
    const pending = new Map<string, (v: { result?: unknown; error?: { code: string } }) => void>();
    ws.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(raw.toString()) as {
        id?: string;
        result?: unknown;
        error?: { code: string };
        event?: string;
        data?: { run?: Run };
      };
      if (msg.id !== undefined) {
        pending.get(msg.id)?.(
          msg.error !== undefined ? { error: msg.error } : { result: msg.result },
        );
        pending.delete(msg.id);
        return;
      }
      if (msg.event === "graph.fired") {
        runs.push(msg.data!.run!);
        for (const w of [...waiters]) w();
      }
    });
    let seq = 0;
    const request = (method: string, params: unknown) =>
      new Promise<{ result?: unknown; error?: { code: string } }>((resolve) => {
        const id = `r${++seq}`;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const fired = (pred: (r: Run) => boolean, timeoutMs = 8000) =>
      new Promise<Run>((resolve, reject) => {
        const check = () => {
          const hit = runs.find(pred);
          if (!hit) return;
          waiters.delete(check);
          clearTimeout(timer);
          resolve(hit);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error(`timed out waiting for a run; seen ${JSON.stringify(runs)}`));
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    await request("client.hello", { protocol: 1, kind: "desktop" });
    const panes = [server.session.snapshot().panes[0]!.id];
    while (panes.length < paneCount)
      panes.push((await server.session.splitPane(panes[0]!, "right", undefined)).pane.id);
    return { server, stateDir: dir, token, client: { request, fired, runs }, panes };
  }

  const key = (paneId: string) => `local:${paneId}`;
  async function update(ctx: Ctx, ops: unknown[]): Promise<void> {
    const g = (await ctx.client.request("graph.get", {})).result as { rev: number };
    const r = await ctx.client.request("graph.update", { baseRev: g.rev, ops });
    expect(r.error).toBeUndefined();
  }
  function nodes(ctx: Ctx): unknown[] {
    return ctx.panes.map((p, i) => ({ op: "add_node", key: key(p), x: i * 240, y: 0 }));
  }
  const setAgent = (ctx: Ctx, paneId: string, a: ReturnType<typeof agentInfo> | null) =>
    ctx.server.session.updatePaneRuntime(paneId, { agent: a as never });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("元が完了したら先へ 1 回送り（画面の末尾を受け渡す）、履歴・回数・graph.history に残る", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    // 元の画面に結果を出しておく
    ctx.server.terminals.get(p1)!.write("echo GRAPH_RESULT_OK\r");
    await sleep(500);
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0));
    await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        trigger: { on: "done", prompt: "見て {output}", output: { lines: 20 }, whenBusy: "wait" },
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    const run = await ctx.client.fired((r) => r.result === "sent");
    expect(run.linkId).toBe("l1");
    expect(run.text).toContain("GRAPH_RESULT_OK");
    await sleep(300);
    const g = (await ctx.client.request("graph.get", {})).result as { links: { count: number }[] };
    expect(g.links[0]!.count).toBe(1);
    const history = (await ctx.client.request("graph.history", { linkId: "l1" })).result as {
      runs: Run[];
    };
    expect(history.runs).toEqual([expect.objectContaining({ linkId: "l1", result: "sent" })]);
    // 同じ完了の知らせをもう一度出しても送らない（既読だけの変化など）
    setAgent(ctx, p1, { ...agentInfo("ga1", 1), serverSeenSeq: 1 });
    await sleep(300);
    expect(ctx.client.runs.filter((r) => r.result === "sent")).toHaveLength(1);
  });

  it("先が作業中なら待ち、手が空いたら送る。作業中は見送る線は busy", async () => {
    const ctx = await boot(3);
    const [p1, p2, p3] = ctx.panes as [string, string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0, "working"));
    setAgent(ctx, p3, agentInfo("gc1", 0, "working"));
    await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        trigger: { on: "done", prompt: "続けて", output: null, whenBusy: "wait" },
      },
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p3),
        trigger: { on: "done", prompt: "続けて", output: null, whenBusy: "skip" },
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.linkId === "l1" && r.result === "waiting");
    await ctx.client.fired(
      (r) => r.linkId === "l2" && r.result === "skipped" && r.reason === "busy",
    );
    setAgent(ctx, p2, agentInfo("gb1", 1, "idle"));
    await ctx.client.fired((r) => r.linkId === "l1" && r.result === "sent");
  });

  it("先が居ない・承認待ちなら見送る（target_absent・blocked）", async () => {
    const ctx = await boot(3);
    const [p1, p2, p3] = ctx.panes as [string, string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p3, agentInfo("gc1", 0, "blocked"));
    await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        trigger: { on: "done", prompt: "x", output: null, whenBusy: "wait" },
      },
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p3),
        trigger: { on: "done", prompt: "x", output: null, whenBusy: "wait" },
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.linkId === "l1" && r.reason === "target_absent");
    await ctx.client.fired((r) => r.linkId === "l2" && r.reason === "blocked");
  });

  it("上限に達したら paused: limit にして以後は limit で見送り、全体の一時停止の間は paused で見送る", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0));
    await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        limit: 1,
        trigger: { on: "done", prompt: "x", output: null, whenBusy: "wait" },
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.result === "sent");
    await sleep(300);
    expect(
      ((await ctx.client.request("graph.get", {})).result as { links: { paused: string | null }[] })
        .links[0]!.paused,
    ).toBe("limit");
    setAgent(ctx, p1, agentInfo("ga1", 2));
    await ctx.client.fired((r) => r.reason === "limit");
    await ctx.client.request("graph.resume", { linkId: "l1" });
    await ctx.client.request("graph.pause", {});
    setAgent(ctx, p1, agentInfo("ga1", 3));
    await ctx.client.fired((r) => r.reason === "paused");
  });

  it("監督の線を結ぶと、手の空いた監督役へ配下と使い方を送る。配下が承認待ちになれば承認の代理（notify）で知らせる", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gs1", 0));
    await update(ctx, [
      ...nodes(ctx),
      { op: "add_link", kind: "supervise", from: key(p1), to: key(p2) },
      { op: "add_link", kind: "approval", from: key(p1), to: key(p2) },
    ]);
    const notice = await ctx.client.fired((r) => r.linkId === "l1" && r.result === "sent");
    expect(notice.text).toContain("監督役");
    setAgent(ctx, p1, agentInfo("ga1", 0, "blocked"));
    const approval = await ctx.client.fired((r) => r.linkId === "l2" && r.result === "sent");
    expect(approval.text).toContain("承認待ち");
  });

  it("stale のノードの線は動かない（session.json を読めずに pane の id を振り直した起動）", async () => {
    const first = await boot(2);
    const [p1, p2] = first.panes as [string, string];
    await update(first, [
      ...nodes(first),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        trigger: { on: "done", prompt: "x", output: null, whenBusy: "wait" },
      },
    ]);
    await first.server.close();
    await writeFile(join(first.stateDir, "session.json"), "{broken");
    const second = await boot(2, first.stateDir, first.token);
    expect(second.panes).toEqual([p1, p2]); // 振り直した同じ id の、別の pane
    setAgent(second, p1, agentInfo("ga9", 0));
    setAgent(second, p2, agentInfo("gb9", 0));
    setAgent(second, p1, agentInfo("ga9", 1));
    await sleep(1500);
    expect(second.client.runs).toEqual([]);
  });

  it("終了の後は graph.json を書かない（閉じた保存は書き込みを断る）", async () => {
    const ctx = await boot(1);
    await update(ctx, [{ op: "add_node", key: key(ctx.panes[0]!), x: 0, y: 0 }]);
    const path = join(ctx.stateDir, "graph.json");
    const before = await readFile(path, "utf8");
    await ctx.server.close();
    await expect(
      ctx.server.graph.update(
        1,
        [{ op: "move_node", key: key(ctx.panes[0]!) as `local:${string}`, x: 20, y: 20 }],
        "c1",
      ),
    ).rejects.toThrow("graph store is closed");
    await expect(ctx.server.graph.recordRun("l1")).rejects.toThrow("graph store is closed");
    expect(await readFile(path, "utf8")).toBe(before);
  });
});
