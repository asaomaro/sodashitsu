import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { UUID_RE } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import { askSocket } from "./handoff/handoffCommand.js";
import { handoffSocketPathFor } from "./handoff/HandoffSocket.js";
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

  type GraphShape = {
    rev: number;
    paused: boolean;
    nodes: { key: string; x: number; y: number }[];
    links: { id: string; paused: string | null; count: number }[];
  };
  const getGraph = async (c: Client): Promise<GraphShape> =>
    (await c.request("graph.get", {})).result as GraphShape;
  /** 維持（GraphMaintainer）が pane のノードを足し終えるのを待つ（20261008-graph-first）。 */
  async function waitForNodes(c: Client, keys: string[]): Promise<GraphShape> {
    const deadline = Date.now() + 8000;
    for (;;) {
      const g = await getGraph(c);
      if (keys.every((k) => g.nodes.some((n) => n.key === k))) return g;
      if (Date.now() > deadline) throw new Error(`timed out waiting for nodes ${keys.join(",")}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  it("graph.get は最初、起動の維持が足した手元の pane のノードだけ（rev 1・線なし）。graph.update は 1 rev で当て、変えた本人を含む全クライアントへ graph.changed を配る", async () => {
    const { server, clients } = await startWithClients(await tempStateDir(), 2);
    const [a, b] = clients as [Client, Client];
    const pane = server.session.snapshot().panes[0]!.id;
    const L = `local:${pane}`;
    expect((await a.request("graph.get", {})).result).toEqual({
      rev: 1,
      paused: false,
      nodes: [{ key: L, x: expect.any(Number), y: expect.any(Number) }],
      links: [],
    });
    const reply = await a.request("graph.update", {
      baseRev: 1,
      ops: [
        { op: "add_node", key: REMOTE, x: 1000, y: 0 },
        { op: "add_link", kind: "trigger", from: L, to: REMOTE, trigger },
      ],
    });
    const graph = reply.result as { rev: number; links: { id: string }[] };
    expect(graph.rev).toBe(2);
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0]!.id).toMatch(UUID_RE); // 線の id は UUID
    const changed = { graph, byClientId: a.clientId };
    expect(
      await b.waitEvent("graph.changed", (d) => (d as { graph: { rev: number } }).graph.rev === 2),
    ).toEqual(changed);
    expect(
      await a.waitEvent("graph.changed", (d) => (d as { graph: { rev: number } }).graph.rev === 2),
    ).toEqual(changed);
    expect((await b.request("graph.get", {})).result).toEqual(graph);
  });

  it("baseRev の不一致は rev_conflict、当てられない操作は invalid_params（どちらも保存しない）", async () => {
    const { server, clients } = await startWithClients(await tempStateDir(), 2);
    const [a, b] = clients as [Client, Client];
    const L = `local:${server.session.snapshot().panes[0]!.id}`;
    await a.request("graph.update", {
      baseRev: 1,
      ops: [{ op: "add_node", key: REMOTE, x: 0, y: 0 }],
    });
    expect(
      (
        await b.request("graph.update", {
          baseRev: 1,
          ops: [{ op: "move_node", key: REMOTE, x: 20, y: 20 }],
        })
      ).error?.code,
    ).toBe("rev_conflict");
    expect(
      (
        await b.request("graph.update", {
          baseRev: 2,
          ops: [{ op: "add_link", kind: "supervise", from: L, to: L }],
        })
      ).error?.code,
    ).toBe("invalid_params");
    expect(
      (
        await b.request("graph.update", {
          baseRev: 2,
          ops: [{ op: "add_node", key: "local:bad id", x: 0, y: 0 }],
        })
      ).error?.code,
    ).toBe("invalid_params");
    // 別のマシンの pane への選び直し（マシンが変わる付け替え）は、web・sodactl だけでなくサーバも断る（統合レビュー R1）。
    const rekey = await b.request("graph.update", {
      baseRev: 2,
      ops: [{ op: "rekey_node", key: REMOTE, newKey: `${"f".repeat(32)}:p1` }],
    });
    expect(rekey.error?.code).toBe("invalid_params");
    expect((await getGraph(b)).rev).toBe(2);
  });

  it("開いている pane のノードは外せず（node_required）、囲いが重なる位置へは動かせない（frame_overlap）。閉じた pane・別のマシンのノードは外せる", async () => {
    const { server, clients } = await startWithClients(await tempStateDir());
    const a = clients[0]!;
    const p1 = server.session.snapshot().panes[0]!.id;
    const other = await server.session.createWorkspace(tmpdir(), "other");
    const p2 = other.pane.id;
    const g0 = await waitForNodes(a, [`local:${p1}`, `local:${p2}`]);
    const err = async (ops: unknown[], baseRev?: number) =>
      (await a.request("graph.update", { baseRev: baseRev ?? (await getGraph(a)).rev, ops })).error
        ?.code;
    // node_required
    expect(await err([{ op: "remove_node", key: `local:${p1}` }])).toBe("node_required");
    expect(await err([{ op: "rekey_node", key: `local:${p1}`, newKey: `local:${p2}` }])).toBe(
      "node_required",
    );
    // frame_overlap: p1 を p2 の囲いの上へ
    const at2 = g0.nodes.find((n) => n.key === `local:${p2}`)!;
    expect(await err([{ op: "move_node", key: `local:${p1}`, x: at2.x, y: at2.y }])).toBe(
      "frame_overlap",
    );
    // 断られたものは保存していない（rev も位置も同じ）
    expect(await getGraph(a)).toEqual(g0);
    // rev が違うときは、検査より先に rev_conflict（取り直してやり直せる）
    expect(await err([{ op: "remove_node", key: `local:${p1}` }], g0.rev - 1)).toBe("rev_conflict");
    // 否定の対照: 別のマシンのノードは足して外せる。重ならない位置への移動は通る。
    const added = await a.request("graph.update", {
      baseRev: g0.rev,
      ops: [{ op: "add_node", key: REMOTE, x: 4000, y: 0 }],
    });
    expect(added.error).toBeUndefined();
    const removed = await a.request("graph.update", {
      baseRev: g0.rev + 1,
      ops: [{ op: "remove_node", key: REMOTE }],
    });
    expect(removed.error).toBeUndefined();
    const moved = await a.request("graph.update", {
      baseRev: g0.rev + 2,
      ops: [{ op: "move_node", key: `local:${p1}`, x: at2.x + 4000, y: at2.y }],
    });
    expect(moved.error).toBeUndefined();
    // pane を閉じると、ノードは維持の側（GraphPaneCleanup）が消す
    await a.request("pane.close", { paneId: p2 });
    await vi.waitFor(async () => {
      expect((await getGraph(a)).nodes.some((n) => n.key === `local:${p2}`)).toBe(false);
    });
  });

  it("一時停止・再開（全体・線）。知らない線は not_found。履歴は（実行が入るまで）空", async () => {
    const { server, clients } = await startWithClients(await tempStateDir());
    const a = clients[0]!;
    const p1 = server.session.snapshot().panes[0]!.id;
    const p2 = (await server.session.splitPane(p1, "right", undefined)).pane.id;
    await waitForNodes(a, [`local:${p1}`, `local:${p2}`]);
    const base = (await getGraph(a)).rev;
    await a.request("graph.update", {
      baseRev: base,
      ops: [{ op: "add_link", kind: "supervise", from: `local:${p1}`, to: `local:${p2}` }],
    });
    const l1 = (await getGraph(a)).links[0]!.id;
    expect((await a.request("graph.pause", {})).result).toMatchObject({
      rev: base + 2,
      paused: true,
    });
    expect((await a.request("graph.pause", { linkId: l1 })).result).toMatchObject({
      rev: base + 3,
      links: [{ paused: "user" }],
    });
    expect((await a.request("graph.resume", {})).result).toMatchObject({
      rev: base + 4,
      paused: false,
      links: [{ paused: "user" }],
    });
    expect((await a.request("graph.resume", { linkId: l1 })).result).toMatchObject({
      rev: base + 5,
      links: [{ paused: null, count: 0 }],
    });
    expect((await a.request("graph.pause", { linkId: "l9" })).error?.code).toBe("not_found");
    expect((await a.request("graph.history", {})).result).toEqual({ runs: [] });
    expect((await a.request("graph.history", { linkId: l1, limit: 10 })).result).toEqual({
      runs: [],
    });
  });

  it("保存したグラフは再起動の後も読める。再起動の維持は何も変えない（rev も位置も同じ）", async () => {
    const stateDir = await tempStateDir();
    const first = await startWithClients(stateDir);
    // 手元のノードは実在する pane の id（起動の維持が足した）。居ない pane のノードは起動の復元の後に外れる。
    const pane = first.server.session.snapshot().panes[0]!.id;
    expect(pane).toMatch(UUID_RE);
    const L = `local:${pane}`;
    await first.clients[0]!.request("graph.update", {
      baseRev: 1,
      ops: [{ op: "add_node", key: REMOTE, x: 1000, y: 0 }],
    });
    const before = await getGraph(first.clients[0]!);
    expect(before.rev).toBe(2);
    // session.json は間を置いて書くので、書き終えてから止める（止めるときに最後の保存が走る）。
    first.clients[0]!.ws.close();
    await first.server.close();

    const second = await start(stateDir);
    const b = await connect(second, await tokenLogin(second, first.token));
    expect((await b.request("graph.get", {})).result).toEqual(before);
    expect(before.nodes.map((n) => n.key)).toEqual([L, REMOTE]);
    // 復元した pane は同じ id（保存した session.json から）
    expect(second.session.snapshot().panes.map((p) => p.id)).toEqual([pane]);
  });

  it("session.json が読めなかった起動では pane の id が別の UUID になり、前の pane のノード（と線）は起動の後に外れ、新しい pane のノードが足される（別のマシンのノードは残る）。同じ id が別の pane を指すことはない", async () => {
    const stateDir = await tempStateDir();
    const first = await startWithClients(stateDir);
    const pane = first.server.session.snapshot().panes[0]!.id;
    await first.clients[0]!.request("graph.update", {
      baseRev: 1,
      ops: [{ op: "add_node", key: REMOTE, x: 1000, y: 0 }],
    });
    first.clients[0]!.ws.close();
    await first.server.close();

    await writeFile(join(stateDir, "session.json"), "{broken");
    const second = await start(stateDir);
    const newPane = second.session.snapshot().panes[0]!.id;
    expect(newPane).toMatch(UUID_RE);
    expect(newPane).not.toBe(pane);
    const c = await connect(second, await tokenLogin(second, first.token));
    const g = await getGraph(c);
    // 前の pane のノードの除去（+1）と新しい pane のノードの追加（+1）
    expect(g.rev).toBe(4);
    expect(g.nodes.map((n) => n.key).sort()).toEqual([`local:${newPane}`, REMOTE].sort());
    expect(g.nodes.find((n) => n.key === REMOTE)).toEqual({ key: REMOTE, x: 1000, y: 0 });
    expect(g.links).toEqual([]);
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
 * AgentMonitor はシェルだけの pane では変化を出さないので、偽の値を上書きしない）。送信は本物の `agent.prompt`。送られる側の pane では `cat` を
 * 動かしておく（送った文面をシェルが実行しない）。待ちは固定の時間でなく条件で待つ。
 */
describe("composeServer: 連携の実行（20260927-agent-graph の 02）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  type Run = { linkId: string; result: string; reason?: string; text?: string };
  type Internal = NonNullable<
    NonNullable<Parameters<typeof composeServerOnFreePort>[1]>["internal"]
  >;
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

  /** 条件が成り立つまで待つ（固定の sleep の代わり。負荷の高い機械でも条件で決まる）。 */
  async function waitFor(
    what: string,
    cond: () => boolean | Promise<boolean>,
    timeoutMs = 8000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await cond())) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function boot(
    paneCount: number,
    opts: { stateDir?: string; token?: string; internal?: Internal } = {},
  ): Promise<Ctx> {
    const dir = opts.stateDir ?? (await makeTempDir("soda-graph-run-"));
    if (opts.stateDir === undefined)
      cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir: dir, origin: [] },
      opts.internal ? { internal: opts.internal } : undefined,
    );
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
    const token = opts.token ?? server.freshToken ?? "";
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
    // 送られる側（2 つ目以降）の pane では cat を動かす（送った文面をシェルが実行しない）。前面が cat になった（busy）まで待つ。
    for (const p of panes.slice(1)) server.terminals.get(p)!.write("cat\r");
    await waitFor("cat in the receiving panes", () =>
      panes.slice(1).every((p) => server.session.getPane(p)?.busy === true),
    );
    // 手元のすべての pane のノードは維持（GraphMaintainer。20261008-graph-first）が足す。そろうまで待つ。
    await waitFor("the nodes of all panes", async () => {
      const g = (await request("graph.get", {})).result as { nodes: { key: string }[] };
      return panes.every((p) => g.nodes.some((n) => n.key === `local:${p}`));
    });
    return { server, stateDir: dir, token, client: { request, fired, runs }, panes };
  }

  const key = (paneId: string) => `local:${paneId}`;
  /** 操作を当て、できた線の id（UUID。作った順）を返す。 */
  async function update(ctx: Ctx, ops: unknown[]): Promise<string[]> {
    const g = (await ctx.client.request("graph.get", {})).result as { rev: number };
    const r = await ctx.client.request("graph.update", { baseRev: g.rev, ops });
    expect(r.error).toBeUndefined();
    return ((await graphOf(ctx)) as unknown as { links: { id: string }[] }).links.map((l) => l.id);
  }
  async function graphOf(ctx: Ctx): Promise<{
    nodes: { key: string }[];
    links: { count: number; paused: string | null }[];
  }> {
    return (await ctx.client.request("graph.get", {})).result as never;
  }
  /** 手元の pane のノードは維持が足し済み（`boot` が待つ）。線の操作の前置きとして並べるだけで、何も足さない。 */
  function nodes(_ctx: Ctx): unknown[] {
    return [];
  }
  const setAgent = (ctx: Ctx, paneId: string, a: ReturnType<typeof agentInfo> | null) =>
    ctx.server.session.updatePaneRuntime(paneId, { agent: a as never });
  const screenOf = (ctx: Ctx, paneId: string) =>
    ctx.server.terminals.get(paneId)!.mirror.plainText();
  const trigger = (
    prompt: string,
    output: { lines: number } | null = null,
    whenBusy: "wait" | "skip" = "wait",
  ) => ({
    on: "done",
    prompt,
    output,
    whenBusy,
  });

  it("元が完了したら先へ 1 回送り（画面の末尾を受け渡す）、履歴・回数・graph.history に残る", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    // 元の画面に結果を出す。printf で組み立てるので、打ち込んだコマンドの表示（エコー）には GRAPH_RESULT_OK が現れない。
    ctx.server.terminals.get(p1)!.write("printf 'GRAPH_%s\\n' RESULT_OK\r");
    await waitFor("the result on the source screen", () =>
      /^GRAPH_RESULT_OK$/m.test(screenOf(ctx, p1)),
    );
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0));
    const [l1] = await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        trigger: trigger("見て {output}", { lines: 20 }),
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    const run = await ctx.client.fired((r) => r.result === "sent");
    expect(run.linkId).toBe(l1);
    // 先の pane（cat）に、受け渡した結果が届いている（履歴の 200 文字の切り取りに依らない）
    await waitFor("the output delivered to the target", () =>
      screenOf(ctx, p2).includes("GRAPH_RESULT_OK"),
    );
    await waitFor("the run counted", async () => (await graphOf(ctx)).links[0]!.count === 1);
    const history = (await ctx.client.request("graph.history", { linkId: l1 })).result as {
      runs: Run[];
    };
    expect(history.runs).toEqual([expect.objectContaining({ linkId: l1, result: "sent" })]);
    // 同じ完了の知らせをもう一度出しても送らない（既読だけの変化など）
    setAgent(ctx, p1, { ...agentInfo("ga1", 1), serverSeenSeq: 1 });
    expect(ctx.server.graphHistory(l1).filter((r) => r.result === "sent")).toHaveLength(1);
  });

  it("先が作業中なら待ち、手が空いたら送る。作業中は見送る線は busy", async () => {
    const ctx = await boot(3);
    const [p1, p2, p3] = ctx.panes as [string, string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0, "working"));
    setAgent(ctx, p3, agentInfo("gc1", 0, "working"));
    const [l1, l2] = await update(ctx, [
      ...nodes(ctx),
      { op: "add_link", kind: "trigger", from: key(p1), to: key(p2), trigger: trigger("続けて") },
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p3),
        trigger: trigger("続けて", null, "skip"),
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.linkId === l1 && r.result === "waiting");
    await ctx.client.fired((r) => r.linkId === l2 && r.result === "skipped" && r.reason === "busy");
    setAgent(ctx, p2, agentInfo("gb1", 1, "idle"));
    await ctx.client.fired((r) => r.linkId === l1 && r.result === "sent");
  });

  it("先が居ない・承認待ちなら見送る（target_absent・blocked）", async () => {
    const ctx = await boot(3);
    const [p1, p2, p3] = ctx.panes as [string, string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p3, agentInfo("gc1", 0, "blocked"));
    const [l1, l2] = await update(ctx, [
      ...nodes(ctx),
      { op: "add_link", kind: "trigger", from: key(p1), to: key(p2), trigger: trigger("x") },
      { op: "add_link", kind: "trigger", from: key(p1), to: key(p3), trigger: trigger("x") },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.linkId === l1 && r.reason === "target_absent");
    await ctx.client.fired((r) => r.linkId === l2 && r.reason === "blocked");
  });

  it("上限に達したら paused: limit にして以後は limit で見送り、全体の一時停止の間は paused で見送る", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0));
    const [l1] = await update(ctx, [
      ...nodes(ctx),
      {
        op: "add_link",
        kind: "trigger",
        from: key(p1),
        to: key(p2),
        limit: 1,
        trigger: trigger("x"),
      },
    ]);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    await ctx.client.fired((r) => r.result === "sent");
    await waitFor("the limit pause", async () => (await graphOf(ctx)).links[0]!.paused === "limit");
    setAgent(ctx, p1, agentInfo("ga1", 2));
    await ctx.client.fired((r) => r.reason === "limit");
    await ctx.client.request("graph.resume", { linkId: l1 });
    await ctx.client.request("graph.pause", {});
    setAgent(ctx, p1, agentInfo("ga1", 3));
    await ctx.client.fired((r) => r.reason === "paused");
  });

  it("監督の線を結ぶと、手の空いた監督役へ配下と使い方を送る。配下が承認待ちになれば承認の代理（notify）で知らせる", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gs1", 0));
    const [l1, l2] = await update(ctx, [
      ...nodes(ctx),
      { op: "add_link", kind: "supervise", from: key(p1), to: key(p2) },
      { op: "add_link", kind: "approval", from: key(p1), to: key(p2) },
    ]);
    const notice = await ctx.client.fired((r) => r.linkId === l1 && r.result === "sent");
    expect(notice.text).toContain("監督役");
    // 監督役が知らせを読み終えた（送った直後は作業中とみなしているので、本物の状態の変化を出す）
    setAgent(ctx, p2, agentInfo("gs1", 0, "working"));
    setAgent(ctx, p2, agentInfo("gs1", 1, "idle"));
    setAgent(ctx, p1, agentInfo("ga1", 0, "blocked"));
    const approval = await ctx.client.fired((r) => r.linkId === l2 && r.result === "sent");
    expect(approval.text).toContain("承認待ち");
  });

  it("session.json を読めずに pane の id が別の UUID になった起動では、前の pane のノードと線は外れ、新しい pane は線が付かないまま（前の pane の完了で動かない）", async () => {
    const first = await boot(2);
    const [p1, p2] = first.panes as [string, string];
    await update(first, [
      ...nodes(first),
      { op: "add_link", kind: "trigger", from: key(p1), to: key(p2), trigger: trigger("x") },
    ]);
    await first.server.close();
    await writeFile(join(first.stateDir, "session.json"), "{broken");
    const second = await boot(2, { stateDir: first.stateDir, token: first.token });
    // 振り直した id は前とは別の UUID（連番なら同じ p1・p2 になり、別の pane に線が付いていた）
    expect(second.panes).toHaveLength(2);
    for (const p of second.panes) expect([p1, p2]).not.toContain(p);
    // 前の pane のノードは外れ、新しい pane のノードだけが維持で足される（20261008-graph-first）。
    expect((await graphOf(second)).nodes.map((n) => n.key).sort()).toEqual(
      second.panes.map(key).sort(),
    );
    expect(((await graphOf(second)) as unknown as { links: unknown[] }).links).toEqual([]);
    setAgent(second, second.panes[0]!, agentInfo("ga9", 0));
    setAgent(second, second.panes[1]!, agentInfo("gb9", 0));
    setAgent(second, second.panes[0]!, agentInfo("ga9", 1));
    // 実行の知らせは同期の bus の後の microtask で履歴に残る。線が無いので何も残さない
    await new Promise((r) => setTimeout(r, 0));
    expect(second.server.graphHistory()).toEqual([]);
    expect(second.client.runs).toEqual([]);
  });

  it("終了の後は graph.json を書かない（閉じた保存は書き込みを断る）。実行も止まる（元が完了しても動かない）", async () => {
    const ctx = await boot(2);
    const [p1, p2] = ctx.panes as [string, string];
    setAgent(ctx, p1, agentInfo("ga1", 0));
    setAgent(ctx, p2, agentInfo("gb1", 0));
    const ids = await update(ctx, [
      ...nodes(ctx),
      { op: "add_link", kind: "trigger", from: key(p1), to: key(p2), trigger: trigger("x") },
    ]);
    const path = join(ctx.stateDir, "graph.json");
    const before = await readFile(path, "utf8");
    await ctx.server.close();
    // 止めていなければ、ここで発火して同期で履歴に残る（先が居ないので target_absent）
    setAgent(ctx, p2, null);
    setAgent(ctx, p1, agentInfo("ga1", 1));
    expect(ctx.server.graphHistory()).toEqual([]);
    await expect(
      ctx.server.graph.update(
        1,
        [{ op: "move_node", key: key(p1) as `local:${string}`, x: 20, y: 20 }],
        "c1",
      ),
    ).rejects.toThrow("graph store is closed");
    await expect(ctx.server.graph.recordRun(ids[0]!)).rejects.toThrow("graph store is closed");
    expect(await readFile(path, "utf8")).toBe(before);
  });

  it.skipIf(process.platform === "win32")(
    "引き継ぎの間は実行を止め（元が完了しても動かない）、引き継ぎに失敗して元に戻ったら再び動く",
    async () => {
      const hooks: { during?: () => void } = {};
      const ctx = await boot(2, {
        internal: {
          handoffPreflight: () => Promise.resolve({ ok: true }),
          handoffExecve: () => {
            hooks.during?.();
            throw new Error("execve refused by the test");
          },
        },
      });
      const [p1, p2] = ctx.panes as [string, string];
      setAgent(ctx, p1, agentInfo("ga1", 0));
      setAgent(ctx, p2, agentInfo("gb1", 0));
      await update(ctx, [
        ...nodes(ctx),
        { op: "add_link", kind: "trigger", from: key(p1), to: key(p2), trigger: trigger("x") },
      ]);
      let historyDuring: unknown[] | undefined;
      hooks.during = () => {
        // 引き継ぎの最中の完了。止めていなければ同期で履歴に残る（先を居なくしておくので target_absent）
        setAgent(ctx, p2, null);
        setAgent(ctx, p1, agentInfo("ga1", 1));
        historyDuring = ctx.server.graphHistory();
        setAgent(ctx, p2, agentInfo("gb1", 0));
      };
      const answer = JSON.parse(
        await askSocket(
          handoffSocketPathFor(ctx.stateDir),
          JSON.stringify({ op: "handoff" }),
          10_000,
        ),
      ) as { ok: boolean };
      expect(answer.ok).toBe(true);
      await waitFor("the handoff rollback", () => historyDuring !== undefined);
      await new Promise((r) => setTimeout(r, 0));
      expect(historyDuring).toEqual([]);
      expect(ctx.server.graphHistory()).toEqual([]);
      // 元に戻った（execve の失敗）後は再び動く。止めていた間の完了は基準になっているので、次の完了で送る
      await waitFor("the engine resumed", () => {
        setAgent(ctx, p1, agentInfo("ga1", 2 + ctx.server.graphHistory().length));
        return ctx.server.graphHistory().some((r) => r.result === "sent");
      });
    },
  );
});
