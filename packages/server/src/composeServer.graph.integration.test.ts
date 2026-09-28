import { rm, writeFile } from "node:fs/promises";
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
