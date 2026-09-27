import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { Pane, SessionSnapshot, Workspace } from "@sodashitsu/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 独自トークンの報告（20260927-sidebar-row-tokens の AC1・AC2・AC7・AC18）を、実物の `composeServer`（認証・WebSocket・RPC の登録・
 * `MetadataService`・`SessionService`・保存）で通す。
 */
vi.setConfig({ testTimeout: 15_000 });

interface Frame {
  id?: string;
  result?: unknown;
  error?: { code: string; message: string };
  event?: string;
  data?: unknown;
}

class Client {
  readonly frames: Frame[] = [];
  private seq = 0;
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) this.frames.push(JSON.parse(data.toString("utf8")) as Frame);
    });
  }

  request(method: string, params: unknown): Promise<Frame> {
    const id = `r${++this.seq}`;
    return new Promise((resolve) => {
      const onMessage = (data: Buffer, isBinary: boolean): void => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString("utf8")) as Frame;
        if (msg.id !== id) return;
        this.ws.off("message", onMessage);
        resolve(msg);
      };
      this.ws.on("message", onMessage);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  events(name: string): unknown[] {
    return this.frames.filter((f) => f.event === name).map((f) => f.data);
  }
}

async function login(server: ComposedServer): Promise<string> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

/** 開けたら WebSocket、断られたらそのステータス。 */
function open(server: ComposedServer, cookie: string | undefined): Promise<WebSocket | number> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, host: `127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) } });
    ws.once("open", () => resolve(ws));
    ws.once("unexpected-response", (_req, res) => {
      ws.terminate();
      resolve(res.statusCode ?? 0);
    });
    ws.once("error", reject);
  });
}

/** 届いたフレームを待つ（イベントの配布は応答と同じ接続の上で非同期）。 */
async function until(cond: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("composeServer: 独自トークンの報告", () => {
  const cleanups: (() => Promise<unknown> | void)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(): Promise<{ server: ComposedServer; stateDir: string }> {
    const stateDir = await makeTempDir("soda-compose-metadata-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    return { server, stateDir };
  }

  async function connect(server: ComposedServer): Promise<Client> {
    const ws = await open(server, await login(server));
    if (typeof ws === "number") throw new Error(`upgrade failed: ${ws}`);
    cleanups.push(() => ws.close());
    const client = new Client(ws);
    await client.request("client.hello", { protocol: 1, kind: "desktop" });
    return client;
  }

  it("workspace・pane に報告すると、ほかのクライアントへ workspace.updated・pane.updated で届き、後から繋いだ snapshot にも載る。session.json には載らない（AC1・AC2・AC7）", async () => {
    const { server, stateDir } = await start();
    const snapshot = server.session.snapshot();
    const workspaceId = snapshot.workspaces[0]!.id;
    const paneId = snapshot.panes[0]!.id;
    const reporter = await connect(server);
    const watcher = await connect(server);

    const r1 = await reporter.request("workspace.report_metadata", {
      workspaceId,
      source: "ci",
      tokens: [{ name: "build", value: " green\n" }],
    });
    expect(r1).toMatchObject({ result: {} });
    const r2 = await reporter.request("pane.report_metadata", { paneId, source: "hook", tokens: [{ name: "summary", value: "<b>x</b>" }], ttlMs: 60_000 });
    expect(r2).toMatchObject({ result: {} });

    await until(() => watcher.events("pane.updated").some((d) => (d as { pane: Pane }).pane.tokens?.["summary"] !== undefined));
    const ws = watcher.events("workspace.updated").map((d) => (d as { workspace: Workspace }).workspace);
    expect(ws.at(-1)).toMatchObject({ id: workspaceId, tokens: { build: "green" } });
    const pane = watcher
      .events("pane.updated")
      .map((d) => (d as { pane: Pane }).pane)
      .filter((p) => p.tokens)
      .at(-1);
    expect(pane).toMatchObject({ id: paneId, tokens: { summary: "<b>x</b>" } });

    const late = await connect(server);
    const hello = (await late.request("client.hello", { protocol: 1, kind: "desktop" })).result as { snapshot: SessionSnapshot };
    expect(hello.snapshot.workspaces.find((w) => w.id === workspaceId)?.tokens).toEqual({ build: "green" });
    expect(hello.snapshot.panes.find((p) => p.id === paneId)?.tokens).toEqual({ summary: "<b>x</b>" });

    await server.persist.flush();
    const saved = await readFile(join(stateDir, "session.json"), "utf8");
    expect(saved).not.toContain(`"tokens"`); // 項目の名前（cwd の名前に "tokens" が入りうるので引用符ごと見る）
    expect(saved).not.toContain("green");
  });

  it("誤りは herdr と同じ code で返し、何も配らない（AC4）", async () => {
    const { server } = await start();
    const workspaceId = server.session.snapshot().workspaces[0]!.id;
    const client = await connect(server);
    const before = client.frames.length;
    const cases: [unknown, string][] = [
      [{ workspaceId: "w999", source: "s", tokens: [{ name: "a", value: "1" }] }, "not_found"],
      [{ workspaceId, source: "bad source", tokens: [{ name: "a", value: "1" }] }, "invalid_metadata_source"],
      [{ workspaceId, source: "s", tokens: [{ name: "a", value: "1" }], ttlMs: 0 }, "invalid_metadata_ttl"],
      [{ workspaceId, source: "s", tokens: [] }, "invalid_metadata_token"],
      [{ workspaceId, source: "s", tokens: { a: "1" } }, "invalid_params"],
    ];
    for (const [params, code] of cases) {
      const reply = await client.request("workspace.report_metadata", params);
      expect(reply.error?.code, JSON.stringify(params)).toBe(code);
    }
    // 配られたのは tokens を持たない（報告と無関係な git の見直し等の）イベントだけ。model にも何も載らない。
    const carried = client.frames.slice(before).filter((f) => JSON.stringify(f.data ?? null).includes('"tokens"'));
    expect(carried).toEqual([]);
    expect(server.session.snapshot().workspaces[0]!.tokens).toBeUndefined();
  });

  it("閉じた pane への報告は not_found（帳簿の破棄そのものは MetadataService.test.ts。AC7）", async () => {
    const { server } = await start();
    const first = server.session.snapshot().panes[0]!;
    const second = (await server.session.splitPane(first.id, "right", undefined)).pane;
    const client = await connect(server);
    expect((await client.request("pane.report_metadata", { paneId: second.id, source: "s", tokens: [{ name: "a", value: "1" }], seq: 5 })).result).toEqual({});
    await server.session.closePane(second.id);
    const reply = await client.request("pane.report_metadata", { paneId: second.id, source: "s", tokens: [{ name: "a", value: "2" }], seq: 1 });
    expect(reply.error?.code).toBe("not_found");
  });

  it("ログインしていない接続は WebSocket を開けず、報告は届かない（AC18）", async () => {
    const { server } = await start();
    const status = await open(server, undefined);
    expect(status).toBe(401);
    expect(server.session.snapshot().workspaces[0]!.tokens).toBeUndefined();
  });
});
