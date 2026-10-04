import { createServer as createHttpServer, type Server as HttpServerType } from "node:http";
import { connect } from "node:net";
import type { GitInfo, HostInfo, SessionSnapshot, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { layoutFromLegacy, sidebarTree, visibleWorkspaceIdsInOrder } from "@sodashitsu/client-core";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { MemoryLogger } from "../log/Logger.js";
import { listenOnFreePort } from "../composeServerOnFreePort.js";
import { EventBus } from "../bus/EventBus.js";
import type { CreatePaneOptions, TerminalManager } from "../terminal/TerminalManager.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import { NodePtyBackend } from "../pty/NodePtyBackend.js";
import { DefaultTerminalHost } from "../terminal/TerminalHost.js";
import type { PersistScheduler } from "../session/PersistScheduler.js";
import { SessionModel } from "../session/SessionModel.js";
import { SessionService } from "../session/SessionService.js";
import { DefaultClientRegistry } from "../clients/ClientRegistry.js";
import { DefaultSizeAuthority } from "../clients/SizeAuthority.js";
import { ControlSurface } from "../surface/ControlSurface.js";
import { registerAllMethods } from "../surface/methods/index.js";
import { DefaultAuthService } from "../auth/AuthService.js";
import { FsAuthFile } from "../persist/AuthFile.js";
import { DefaultOriginPolicy } from "../auth/OriginPolicy.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { DefaultLoginRateLimiter } from "../auth/LoginRateLimiter.js";
import { HttpServer } from "../http/HttpServer.js";
import { WsServerWs } from "./WsServerWs.js";
import { WsGateway } from "./WsGateway.js";
import type { GitInfoPoller } from "../git/GitInfoPoller.js";
import type { WorktreeService } from "../git/WorktreeService.js";
import type { AgentIntegrationService } from "../agent/AgentIntegrationService.js";

class NoopPersist implements PersistScheduler {
  touch(): void {}
  async flush(): Promise<void> {}
  cancel(): void {}
}
const HOST_INFO: HostInfo = { os: "linux", windowsBuild: null, hostname: "test" };

/**
 * 実物の node-pty（既定は `cat`）で動く TerminalManager。fanout の欠落・重複を含めて確かめる。
 * `commandFor` で pane ごとに起動するコマンドを変えられる（流量制御のテストで 1 つ目の pane だけ `yes` にする。D98）。
 */
class RealCatTerminalManager implements TerminalManager {
  private readonly backend = new NodePtyBackend();
  private readonly hosts = new Map<string, TerminalHost>();
  private created = 0;
  constructor(private readonly commandFor: (index: number) => string = () => "cat") {}
  create(paneId: string, opts: CreatePaneOptions): TerminalHost {
    const command = this.commandFor(this.created++);
    const proc = this.backend.spawn({ shell: "/bin/sh", args: ["-c", command], cwd: opts.cwd, env: process.env as Record<string, string>, cols: opts.cols, rows: opts.rows });
    const host = new DefaultTerminalHost(paneId, proc, opts.cols, opts.rows, 1000);
    this.hosts.set(paneId, host);
    return host;
  }
  get(paneId: string): TerminalHost | undefined {
    return this.hosts.get(paneId);
  }
  resize(paneId: string, cols: number, rows: number): void {
    this.hosts.get(paneId)?.resize(cols, rows);
  }
  dispose(paneId: string): void {
    this.hosts.get(paneId)?.dispose();
    this.hosts.delete(paneId);
  }
}

interface TestServer {
  port: number;
  token: string;
  httpServer: HttpServerType;
  stateDir: string;
  close: () => Promise<void>;
  connectAuthorized: () => Promise<{ ws: WebSocket; cookie: string }>;
  /** `WsServerWs` に渡したロガー（Origin の拒否のログを確かめる。D102）。 */
  wsLogger: MemoryLogger;
  /** 配線したサービス（判定の反映のように、RPC の無い入口から状態を動かすテストが使う。20261004-group-worktree-items）。 */
  session: SessionService;
}

async function startTestServer(
  opts: {
    commandFor?: (index: number) => string;
    gatewayNow?: () => number;
    onClientGone?: (clientId: string) => void;
    /** `WsGateway` に渡すロガー（入力を捨てたログの間引きを確かめる。20260927-server-size-input-limits）。 */
    gatewayLogger?: MemoryLogger;
  } = {},
): Promise<TestServer> {
  const stateDir = await makeTempDir("soda-ws-state-");
  const auth = new DefaultAuthService(new FsAuthFile(stateDir));
  await auth.initialize();
  const { token } = await auth.ensureToken();
  // ポートは待ち受けた後に決まる（listen(0)。20260926-load-flaky-tests の D3）。方針は検査のたびに opts.port を読む。
  const originOpts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: [] as string[] };
  const origins = new DefaultOriginPolicy(originOpts, { addresses: () => [], lanAddresses: () => [], hostnames: () => [] });

  const terminals = new RealCatTerminalManager(opts.commandFor);
  const bus = new EventBus();
  const session = new SessionService({
    model: new SessionModel(),
    terminals,
    bus,
    persist: new NoopPersist(),
    serverVersion: "test",
    host: HOST_INFO,
    scrollbackLines: 1000,
    spawnGraceMs: 100,
    defaultCwd: process.cwd(),
    logger: new MemoryLogger(),
  });
  const clients = new DefaultClientRegistry();
  const sizeAuthority = new DefaultSizeAuthority(clients, session);
  const surface = new ControlSurface(new MemoryLogger());
  registerAllMethods(surface, { session, clients, sizeAuthority, terminals, worktrees: stubWorktrees(), agentIntegrations: stubAgentIntegrations(), gitPoller: stubGitPoller() });

  // 実物の HttpServer（T16）を使う。/api/login 等を素の 404 ハンドラで済ませず、本物の配線で確かめる。
  const webDistDir = await makeTempDir("soda-ws-webdist-missing-");
  // Origin の検査と拒否のログは、composeServer と同じく HttpServer と WsServerWs で 1 つを共有する（D103）。
  const wsLogger = new MemoryLogger();
  const originGate = new OriginRejectionLog(wsLogger, origins);
  const http = new HttpServer(auth, originGate, new DefaultLoginRateLimiter(), { webDistDir, logger: new MemoryLogger() });
  const httpServer = http.server;
  const wsServer = new WsServerWs(httpServer, originGate, auth.authorizeUpgrade, wsLogger);
  new WsGateway(wsServer, surface, clients, sizeAuthority, terminals, bus, auth, opts.gatewayLogger ?? new MemoryLogger(), {
    ...(opts.gatewayNow ? { now: opts.gatewayNow } : {}),
    ...(opts.onClientGone ? { onClientGone: opts.onClientGone } : {}),
  });

  const port = await listenOnFreePort(httpServer);
  originOpts.port = port;

  async function connectAuthorized(): Promise<{ ws: WebSocket; cookie: string }> {
    const cookie = await login(port, token!);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return { ws, cookie };
  }

  return {
    port,
    token: token!,
    httpServer,
    stateDir,
    wsLogger,
    session,
    close: () => new Promise<void>((r) => httpServer.close(() => r())),
    connectAuthorized,
  };
}

async function login(port: number, token: string): Promise<string> {
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("login failed in test setup");
  return setCookie.split(";")[0]!;
}

/**
 * 生の request-target で upgrade を送り、応答のステータス行を返す（`ws` のクライアントは `//` 等をそのまま送れないので
 * `node:net` で書く。D103）。応答を書かずに閉じられたら空文字。
 */
function rawUpgrade(port: number, target: string, extraHeaders: string[] = []): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let data = "";
    socket.setEncoding("latin1");
    socket.on("data", (d: string) => (data += d));
    socket.on("error", () => undefined); // 相手が閉じた後の ECONNRESET 等。読めた分で判断する
    socket.on("close", () => resolve(data.split("\r\n")[0] ?? ""));
    socket.write(
      [
        `GET ${target} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        `Origin: http://127.0.0.1:${port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...extraHeaders,
        "",
        "",
      ].join("\r\n"),
    );
  });
}

function nextMessage(ws: WebSocket): Promise<{ isBinary: boolean; data: Buffer }> {
  return new Promise((resolve) => {
    ws.once("message", (data: Buffer, isBinary: boolean) => resolve({ isBinary, data }));
  });
}

/**
 * 2 接続が同時に生きているテスト（AC9 等）向けの受信キュー。
 * `nextMessage` の `ws.once("message", …)` は、呼んだ瞬間より前に届いたメッセージを取りこぼす
 * （相手側の接続を読み進めている間に、こちらの接続へ先にイベントが届くことがある。EventBus は
 * 同期発行だが、それを受け取ったあとどのタイミングで `await` するかはテストコード側の順序次第）。
 * 実物のブラウザは接続直後から `onmessage` を貼りっぱなしにするので取りこぼさない——
 * テストもそれに合わせて、接続直後からキューに貯め続ける。
 */
function makeInbox(ws: WebSocket): { next: () => Promise<{ isBinary: boolean; data: Buffer }> } {
  const queue: { isBinary: boolean; data: Buffer }[] = [];
  const waiters: ((v: { isBinary: boolean; data: Buffer }) => void)[] = [];
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    const msg = { isBinary, data };
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });
  return {
    next: () =>
      new Promise((resolve) => {
        const msg = queue.shift();
        if (msg) resolve(msg);
        else waiters.push(resolve);
      }),
  };
}

async function waitForOutputContainingFrom(inbox: { next: () => Promise<{ isBinary: boolean; data: Buffer }> }, needle: string): Promise<string> {
  const start = Date.now();
  let collected = "";
  while (Date.now() - start < 3000) {
    const { isBinary, data } = await inbox.next();
    if (!isBinary) continue;
    const decoded = decodeFrame(new Uint8Array(data));
    if (decoded.type === FRAME_TYPE.OUTPUT) collected += new TextDecoder().decode(decoded.chunk);
    if (collected.includes(needle)) return collected;
  }
  throw new Error(`timed out waiting for "${needle}" in output; got: ${JSON.stringify(collected)}`);
}

function nextClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.once("close", (code: number) => resolve(code)));
}

function request(ws: WebSocket, id: string, method: string, params: unknown): void {
  ws.send(JSON.stringify({ id, method, params }));
}

describe("WsGateway (integration, real ws + real PTY)", () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await startTestServer();
  });
  afterEach(async () => {
    await server.close();
  });

  it("rejects the upgrade without a valid session cookie", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { origin: `http://127.0.0.1:${server.port}`, host: `127.0.0.1:${server.port}` } });
    const failed = await new Promise<boolean>((resolve) => {
      ws.once("open", () => resolve(false));
      ws.once("error", () => resolve(true));
      ws.once("unexpected-response", () => resolve(true));
    });
    expect(failed).toBe(true);
  });

  it("rejects the upgrade with a mismatched Origin", async () => {
    const cookie = await login(server.port, server.token);
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { cookie, origin: "http://evil.example", host: `127.0.0.1:${server.port}` } });
    const failed = await new Promise<boolean>((resolve) => {
      ws.once("open", () => resolve(false));
      ws.once("error", () => resolve(true));
      ws.once("unexpected-response", () => resolve(true));
    });
    expect(failed).toBe(true);
    // 拒否したことを、接続元・Origin・Host・許可リストつきでログに残す（design「エラー処理 / 異常系」・D102）。
    const warn = server.wsLogger.lines.find((l) => l.level === "warn" && l.msg === "origin rejected");
    expect(warn?.fields).toMatchObject({
      path: "/ws",
      origin: "http://evil.example",
      host: `127.0.0.1:${server.port}`,
      allowed: expect.arrayContaining([`127.0.0.1:${server.port}`]),
    });
    expect(String(warn?.fields?.["remoteAddress"])).toMatch(/127\.0\.0\.1/);
  });

  it("//ws・//・/\\ 等の upgrade は /ws として扱わず（応答なしで閉じる）、* は 400 で断り、どれもログに何も書かない（D103）", async () => {
    // /ws として扱えば、Cookie が無いので 401 が返る。//ws は /ws ではない（別のホストの /ws としても読まない）。
    for (const target of ["//ws", "//evil.example/ws", "/\\evil.example/ws", "//", "///", "/\\"]) {
      expect(await rawUpgrade(server.port, target), target).toBe("");
    }
    expect(await rawUpgrade(server.port, "*")).toBe("HTTP/1.1 400 Bad Request");
    expect(await rawUpgrade(server.port, "/ws")).toBe("HTTP/1.1 401 Unauthorized"); // 対照：本物の /ws
    expect(server.wsLogger.lines).toEqual([]);
  });

  it("Cookie の % の並びが壊れた upgrade は 401 で断り、error 行を書かない（D103）", async () => {
    expect(await rawUpgrade(server.port, "/ws", ["Cookie: soda_session=%E0%A4%A"])).toBe("HTTP/1.1 401 Unauthorized");
    expect(server.wsLogger.lines.filter((l) => l.level === "error")).toEqual([]);
  });

  it("completes client.hello → workspace.create → INPUT/OUTPUT round trip", async () => {
    const { ws } = await server.connectAuthorized();
    try {
      request(ws, "r1", "client.hello", { protocol: 1, kind: "desktop" });
      const helloMsg = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(helloMsg.id).toBe("r1");
      expect(helloMsg.result.snapshot.workspaces).toEqual([]);

      request(ws, "r2", "workspace.create", { cwd: process.cwd(), label: "api" });
      const wsCreatedEvt = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(wsCreatedEvt.event).toBe("workspace.created");
      const tabCreatedEvt = JSON.parse((await nextMessage(ws)).data.toString("utf8")); // D88
      expect(tabCreatedEvt.event).toBe("tab.created");
      const paneCreatedEvt = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(paneCreatedEvt.event).toBe("pane.created");
      const layoutEvt = JSON.parse((await nextMessage(ws)).data.toString("utf8")); // 20261004-group-worktree-items
      expect(layoutEvt.event).toBe("sidebar.layout_changed");
      const createResp = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(createResp.id).toBe("r2");
      const paneId = createResp.result.pane.id as string;

      request(ws, "r3", "pane.subscribe", { paneId, scrollbackLines: 100 });
      const subResp = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(subResp.id).toBe("r3");
      const snapshotFrame = decodeFrame(new Uint8Array((await nextMessage(ws)).data));
      expect(snapshotFrame.type).toBe(FRAME_TYPE.SNAPSHOT);

      ws.send(encodeInputFrame(paneId, new TextEncoder().encode("hello-ws\n")));
      const outputFrame = await waitForOutputContaining(ws, "hello-ws");
      expect(outputFrame).toContain("hello-ws");
    } finally {
      ws.close();
    }
  }, 10000);

  it("responds not_found for an unknown method with a matching id", async () => {
    const { ws } = await server.connectAuthorized();
    try {
      request(ws, "bad1", "no.such.method", {});
      const resp = JSON.parse((await nextMessage(ws)).data.toString("utf8"));
      expect(resp).toEqual({ id: "bad1", error: { code: "not_found", message: expect.stringContaining("no.such.method") } });
    } finally {
      ws.close();
    }
  });

  it("closes the connection with code 1000 after client.detach", async () => {
    const { ws } = await server.connectAuthorized();
    request(ws, "d1", "client.detach", {});
    await nextMessage(ws); // the {id, result:{}} response
    const code = await nextClose(ws);
    expect(code).toBe(1000);
  });

  it("delivers events to a second connection that did not initiate the change", async () => {
    const first = await server.connectAuthorized();
    const second = await server.connectAuthorized();
    try {
      request(first.ws, "r1", "workspace.create", { cwd: process.cwd(), label: "api" });
      const evt = JSON.parse((await nextMessage(second.ws)).data.toString("utf8"));
      expect(evt.event).toBe("workspace.created");
    } finally {
      first.ws.close();
      second.ws.close();
    }
  });

  it("closes with code 4401 when the session is revoked (logout)", async () => {
    const { ws, cookie } = await server.connectAuthorized();
    const closePromise = nextClose(ws);
    const origin = `http://127.0.0.1:${server.port}`;
    await fetch(`${origin}/api/logout`, { method: "POST", headers: { cookie, origin, host: `127.0.0.1:${server.port}` } });
    const code = await closePromise;
    expect(code).toBe(4401);
  });

  it("closes the connection after too many invalid frames", async () => {
    const { ws } = await server.connectAuthorized();
    const closePromise = nextClose(ws);
    for (let i = 0; i < 12; i++) ws.send("not json{{{");
    const code = await closePromise;
    expect(code).toBe(1008);
  }, 10000);

  it("restores prior pane output (scrollback) via SNAPSHOT after closing and reopening the browser while the server keeps running (AC8)", async () => {
    const first = await server.connectAuthorized();
    request(first.ws, "r1", "workspace.create", { cwd: process.cwd(), label: "api" });
    await nextMessage(first.ws); // workspace.created
    await nextMessage(first.ws); // tab.created（D88）
    await nextMessage(first.ws); // pane.created
    await nextMessage(first.ws); // sidebar.layout_changed（20261004-group-worktree-items）
    const createResp = JSON.parse((await nextMessage(first.ws)).data.toString("utf8"));
    const paneId = createResp.result.pane.id as string;

    request(first.ws, "r2", "pane.subscribe", { paneId, scrollbackLines: 100 });
    await nextMessage(first.ws); // {id:"r2", result:{}}
    await nextMessage(first.ws); // 最初の（まだ空の）SNAPSHOT

    first.ws.send(encodeInputFrame(paneId, new TextEncoder().encode("reconnect-marker\n")));
    await waitForOutputContaining(first.ws, "reconnect-marker");

    first.ws.close(); // 「ブラウザを全て閉じる」を模する。PTY はサーバ側（terminals）に残ったまま。
    await new Promise((r) => setTimeout(r, 50));

    const second = await server.connectAuthorized(); // 再接続（新しい ws・ログインし直す）
    try {
      request(second.ws, "r3", "pane.subscribe", { paneId, scrollbackLines: 100 });
      await nextMessage(second.ws); // {id:"r3", result:{}}
      const snapshotFrame = decodeFrame(new Uint8Array((await nextMessage(second.ws)).data));
      expect(snapshotFrame.type).toBe(FRAME_TYPE.SNAPSHOT);
      if (snapshotFrame.type === FRAME_TYPE.SNAPSHOT) {
        expect(snapshotFrame.text).toContain("reconnect-marker"); // 以前の出力（スクロールバック）が復元されている
      }
    } finally {
      second.ws.close();
    }
  }, 10000);

  it("two simultaneously connected clients can both send input and both see the same pane's output (AC9)", async () => {
    const first = await server.connectAuthorized();
    const second = await server.connectAuthorized();
    // 2 接続とも「開いた直後から」受信を始める（実物のブラウザと同じ）。取りこぼし防止は makeInbox 参照。
    const firstInbox = makeInbox(first.ws);
    const secondInbox = makeInbox(second.ws);
    try {
      request(first.ws, "r1", "workspace.create", { cwd: process.cwd(), label: "api" });
      await firstInbox.next(); // workspace.created（first 自身）
      await firstInbox.next(); // tab.created（同上。D88）
      await firstInbox.next(); // pane.created（first 自身）
      await firstInbox.next(); // sidebar.layout_changed（20261004-group-worktree-items）
      const createResp = JSON.parse((await firstInbox.next()).data.toString("utf8"));
      const paneId = createResp.result.pane.id as string;

      await secondInbox.next(); // workspace.created（second への配信。AC9 の「どちらからも見える」）
      await secondInbox.next(); // tab.created（同上。D88）
      await secondInbox.next(); // pane.created（同上）
      await secondInbox.next(); // sidebar.layout_changed（同上）

      request(first.ws, "r2", "pane.subscribe", { paneId, scrollbackLines: 100 });
      await firstInbox.next();
      await firstInbox.next(); // 初期 SNAPSHOT

      request(second.ws, "r3", "pane.subscribe", { paneId, scrollbackLines: 100 });
      await secondInbox.next();
      await secondInbox.next(); // 初期 SNAPSHOT

      // first が入力 → 両方に OUTPUT が届く（どちらからも表示できる）。
      first.ws.send(encodeInputFrame(paneId, new TextEncoder().encode("from-first\n")));
      expect(await waitForOutputContainingFrom(firstInbox, "from-first")).toContain("from-first");
      expect(await waitForOutputContainingFrom(secondInbox, "from-first")).toContain("from-first");

      // second が入力 → 同じく両方に届く（どちらからも入力でき、セッションが壊れない）。
      second.ws.send(encodeInputFrame(paneId, new TextEncoder().encode("from-second\n")));
      expect(await waitForOutputContainingFrom(firstInbox, "from-second")).toContain("from-second");
      expect(await waitForOutputContainingFrom(secondInbox, "from-second")).toContain("from-second");
    } finally {
      first.ws.close();
      second.ws.close();
    }
  }, 10000);
});

async function waitForOutputContaining(ws: WebSocket, needle: string): Promise<string> {
  const start = Date.now();
  let collected = "";
  while (Date.now() - start < 3000) {
    const { isBinary, data } = await nextMessage(ws);
    if (!isBinary) continue;
    const decoded = decodeFrame(new Uint8Array(data));
    if (decoded.type === FRAME_TYPE.OUTPUT) collected += new TextDecoder().decode(decoded.chunk);
    if (collected.includes(needle)) return collected;
  }
  throw new Error(`timed out waiting for "${needle}" in output; got: ${JSON.stringify(collected)}`);
}

/**
 * サイドバーの並びを 2 つの接続で見る（20261004-group-worktree-items T19）。一方の接続の操作（入れる・外す・並べ替える・畳む・
 * グループの作成と削除・workspace を閉じる）が、もう一方の接続に `workspace.updated`／`group.*`／`sidebar.layout_changed` として
 * 届き、イベントだけで組み立てた画面の状態が、新しくつないだ接続が受け取るスナップショットと同じ木になる。
 */
describe("WsGateway — サイドバーの並びが 2 つの接続で同じ木になる（20261004-group-worktree-items）", () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await startTestServer();
  });
  afterEach(async () => {
    await server.close();
  });

  type Msg = { id?: string; result?: Record<string, unknown>; error?: unknown; event?: string; data?: Record<string, unknown> };

  /** 接続直後から文字のメッセージを貯め、ブラウザの `StoreAdapter` と同じようにイベントを状態へ当てる。 */
  class Screen {
    workspaces: Workspace[] = [];
    groups: WorkspaceGroup[] = [];
    layout: SidebarLayout | null = null;
    readonly log: Msg[] = [];
    private readonly responses = new Map<string, (m: Msg) => void>();
    private nextId = 0;
    constructor(readonly ws: WebSocket) {
      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString("utf8")) as Msg;
        if (msg.id !== undefined) this.responses.get(msg.id)?.(msg);
        else if (msg.event) {
          this.log.push(msg);
          this.apply(msg);
        }
      });
    }
    call(method: string, params: unknown): Promise<Msg> {
      const id = `s${this.nextId++}`;
      return new Promise((resolve) => {
        this.responses.set(id, resolve);
        request(this.ws, id, method, params);
      });
    }
    async hello(): Promise<void> {
      const res = await this.call("client.hello", { protocol: 1, kind: "desktop" });
      const snapshot = res.result!.snapshot as SessionSnapshot;
      this.workspaces = snapshot.workspaces;
      this.groups = snapshot.groups;
      this.layout = snapshot.layout ?? null;
    }
    private apply(msg: Msg): void {
      const d = msg.data!;
      switch (msg.event) {
        case "workspace.created":
          this.workspaces = [...this.workspaces, d.workspace as Workspace];
          break;
        case "workspace.updated": {
          const w = d.workspace as Workspace;
          this.workspaces = this.workspaces.map((x) => (x.id === w.id ? w : x));
          break;
        }
        case "workspace.closed":
          this.workspaces = this.workspaces.filter((x) => x.id !== d.workspaceId);
          break;
        case "workspace.order_changed": {
          const order = d.workspaceIds as string[];
          this.workspaces = order.map((id) => this.workspaces.find((x) => x.id === id)!).filter(Boolean);
          break;
        }
        case "group.created":
          this.groups = [...this.groups, d.group as WorkspaceGroup];
          break;
        case "group.updated": {
          const g = d.group as WorkspaceGroup;
          this.groups = this.groups.map((x) => (x.id === g.id ? g : x));
          break;
        }
        case "group.deleted":
          this.groups = this.groups.filter((x) => x.id !== d.groupId);
          break;
        case "sidebar.layout_changed":
          this.layout = d.layout as SidebarLayout;
          break;
        default:
          break;
      }
    }
    /** `mark` 以降に、`names` の全部のイベントが届くまで待つ。 */
    async waitForEvents(mark: number, names: string[]): Promise<void> {
      const start = Date.now();
      for (;;) {
        const seen = new Set(this.log.slice(mark).map((m) => m.event));
        if (names.every((n) => seen.has(n))) return;
        if (Date.now() - start > 3000) throw new Error(`timed out waiting for ${names.join(", ")}; got: ${[...seen].join(", ")}`);
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    /** `mark` 以降に、`name` のイベントが `count` 個届くまで待つ。 */
    async waitForCount(mark: number, name: string, count: number): Promise<void> {
      const start = Date.now();
      while (this.log.slice(mark).filter((m) => m.event === name).length < count) {
        if (Date.now() - start > 3000) throw new Error(`timed out waiting for ${count} x ${name}`);
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    /** 同じ接続で応答が返るまで待つ。サーバはイベントを送った順に流すので、これより前に送られたイベントは全部届いている。 */
    async sync(): Promise<void> {
      await this.call("client.hello", { protocol: 1, kind: "desktop" });
    }
    /** 画面の木（全部広げた並び。グループの折りたたみは木の `group.collapsed` のまま）。 */
    shape(): unknown {
      const tree = sidebarTree(this.workspaces, this.groups, this.layout ?? layoutFromLegacy(this.workspaces, this.groups), "opened");
      return {
        rows: tree.map((row) => ({
          kind: row.kind,
          ...(row.kind === "group" ? { id: row.group.id, collapsed: row.group.collapsed } : { heading: row.heading }),
          items: row.items.map((it) => (it.kind === "workspace" ? it.workspace.id : [it.head.id, ...it.children.map((c) => c.id)])),
        })),
        visible: visibleWorkspaceIdsInOrder(tree, new Set(), null),
        order: this.workspaces.map((w) => w.id),
      };
    }
  }

  it("入れる・外す・並べ替える（グループ・グループなし）・畳む・グループの削除・閉じる: 操作した接続と見ている接続が、新しい接続のスナップショットと同じ木になる", async () => {
    const aConn = await server.connectAuthorized();
    const bConn = await server.connectAuthorized();
    const a = new Screen(aConn.ws);
    const b = new Screen(bConn.ws);
    /** 新しくつなぎ直した接続が受け取るスナップショットの木（サーバの今の状態）。接続は毎回新規にし、すぐ閉じる（イベントを重ねて当てない）。 */
    const snapshotShape = async (): Promise<unknown> => {
      const conn = await server.connectAuthorized();
      try {
        const c = new Screen(conn.ws);
        await c.hello();
        return c.shape();
      } finally {
        conn.ws.close();
      }
    };
    try {
      await a.hello();
      await b.hello();
      const ids: string[] = [];
      for (const label of ["x", "y", "z", "w"]) {
        const res = await a.call("workspace.create", { cwd: process.cwd(), label });
        ids.push((res.result!.workspace as Workspace).id);
      }
      const [x, y, z, w] = ids as [string, string, string, string];
      // x は本体、y は x の linked worktree（worktree グループになる）、z・w は管理外。判定は poller の代わりに直接入れる。
      const git = (isLinked: boolean, key: string): GitInfo => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: isLinked, worktreeKey: key });
      await b.sync(); // workspace.create に伴うイベントを受け切ってから、判定のイベントを数え始める
      const markGit = b.log.length;
      server.session.updateWorkspaceGit(x, { kind: "git", git: git(false, "/r/.git") });
      server.session.updateWorkspaceGit(y, { kind: "git", git: git(true, "/r/.git/worktrees/y") });
      server.session.updateWorkspaceGit(z, { kind: "unmanaged" });
      server.session.updateWorkspaceGit(w, { kind: "unmanaged" });

      /** 操作 → 見ている接続に届くイベント → 3 つの接続の木が同じ、を 1 段ずつ確かめる。 */
      const step = async (label: string, method: string, params: unknown, expected: string[]): Promise<void> => {
        const markA = a.log.length;
        const markB = b.log.length;
        const res = await a.call(method, params);
        expect(res.error, `${label}: rpc error`).toBeUndefined();
        await b.waitForEvents(markB, expected);
        await a.waitForEvents(markA, expected);
        await a.sync(); // 期待したイベントのあとに続く分（order_changed など）も届いてから比べる
        await b.sync();
        const snap = await snapshotShape();
        expect(b.shape(), `${label}: B == snapshot`).toEqual(snap);
        expect(a.shape(), `${label}: A == snapshot`).toEqual(snap);
      };
      // 初めの状態（workspace と判定が届いたあと）。グループはまだ無く、見出しは出ない。
      await b.waitForEvents(0, ["workspace.created", "sidebar.layout_changed"]);
      await b.waitForCount(markGit, "workspace.updated", 2); // 判定が変わるのは x・y（管理外は変わらず、イベントは出ない）
      await b.sync();
      const initial = await snapshotShape();
      expect(b.shape()).toEqual(initial);
      expect((b.shape() as { rows: { heading: boolean }[] }).rows).toEqual([expect.objectContaining({ kind: "ungrouped", heading: false })]);

      // 入れる: 本体 x を入れて作る（worktree グループごと入る）。
      await step("group.create with a workspace", "group.create", { label: "g1", workspaceId: x }, ["group.created", "workspace.updated", "sidebar.layout_changed"]);
      const g1 = b.groups[0]!.id;
      expect(b.layout!.groups[g1]).toEqual(["r:/r/.git"]);
      expect(b.workspaces.find((v) => v.id === y)!.groupId).toBe(g1); // 子の y も実効のグループが変わった
      await step("group.create (empty)", "group.create", { label: "g2" }, ["group.created", "sidebar.layout_changed"]);
      const g2 = b.groups[1]!.id;
      await step("group.add_member", "group.add_member", { groupId: g2, workspaceId: z }, ["workspace.updated", "sidebar.layout_changed"]);
      expect(b.layout!.groups[g2]).toEqual([`w:${z}`]);
      // 並べ替える: グループの中の項目・グループ・「グループなし」。
      await step("group.add_member (second)", "group.add_member", { groupId: g1, workspaceId: w }, ["workspace.updated", "sidebar.layout_changed"]);
      await step("item.move in a group", "item.move", { item: { kind: "workspace", workspaceId: w }, before: { kind: "workspace", workspaceId: x } }, ["sidebar.layout_changed", "workspace.order_changed"]);
      expect(b.layout!.groups[g1]).toEqual([`w:${w}`, "r:/r/.git"]);
      await step("item.move_by (group)", "item.move_by", { item: { kind: "group", groupId: g2 }, direction: "previous" }, ["sidebar.layout_changed"]);
      expect(b.layout!.top).toEqual([`g:${g2}`, `g:${g1}`, "u"]);
      await step("item.move_by (ungrouped)", "item.move_by", { item: { kind: "ungrouped" }, direction: "previous" }, ["sidebar.layout_changed"]);
      expect(b.layout!.top).toEqual([`g:${g2}`, "u", `g:${g1}`]);
      // 畳む（グループ）。サーバが持つ状態なので group.updated が届く。
      await step("group.toggle_collapsed", "group.toggle_collapsed", { groupId: g1 }, ["group.updated"]);
      expect(b.groups.find((g) => g.id === g1)!.collapsed).toBe(true);
      // 外す: 「グループなし」の末尾へ。
      await step("group.remove_member", "group.remove_member", { workspaceId: z }, ["workspace.updated", "sidebar.layout_changed"]);
      expect(b.layout!.ungrouped.at(-1)).toBe(`w:${z}`);
      // 閉じる（代表の y を閉じるのではなく管理外の w）。
      await step("workspace.close", "workspace.close", { workspaceId: w }, ["workspace.closed", "sidebar.layout_changed"]);
      expect(JSON.stringify(b.layout)).not.toContain(`w:${w}`);
      // グループの削除: 中身は「グループなし」の末尾へ出る。
      await step("group.delete", "group.delete", { groupId: g1 }, ["group.deleted", "workspace.updated", "sidebar.layout_changed"]);
      expect(b.layout!.top).toEqual([`g:${g2}`, "u"]);
      expect(b.layout!.ungrouped).toContain("r:/r/.git");
    } finally {
      aConn.ws.close();
      bConn.ws.close();
    }
  }, 20000);
});

/**
 * 流量制御（design「流量制御」。D98）。1 つ目の pane を `yes`（大量出力）、2 つ目を `cat` で起動するサーバで確かめる。
 * 親の統合 test で見つかった 2 つの不具合の回帰テスト：(1) `ws` の WebSocket は `drain` を emit しないので、
 * 流量制御で止めた購読が永久に再開しなかった、(2) OUTPUT を 1 通ずつ圧縮していたため送信の出口が詰まり、
 * 大量出力の pane の後ろに他の pane の出力が並んで届かなかった。
 */
describe("WsGateway flow control (integration, real ws + real PTY)", () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await startTestServer({ commandFor: (i) => (i === 0 ? "yes" : "cat") });
  });
  afterEach(async () => {
    await server.close();
  });

  async function setUpTwoPanes(ws: WebSocket, inbox: ReturnType<typeof makeInbox>): Promise<{ busy: string; quiet: string }> {
    let seq = 0;
    const call = async (method: string, params: unknown): Promise<Record<string, unknown>> => {
      const id = `fc${++seq}`;
      request(ws, id, method, params);
      for (;;) {
        const { isBinary, data } = await inbox.next();
        if (isBinary) continue;
        const msg = JSON.parse(data.toString("utf8")) as { id?: string; result?: Record<string, unknown> };
        if (msg.id === id) return msg.result!;
      }
    };
    await call("client.hello", { protocol: 1, kind: "desktop" });
    const created = await call("workspace.create", { cwd: process.cwd(), label: "flood" });
    const busy = (created.pane as { id: string }).id;
    const split = await call("pane.split", { paneId: busy, direction: "right" });
    const quiet = (split.pane as { id: string }).id;
    await call("pane.subscribe", { paneId: quiet, scrollbackLines: 10 });
    await call("pane.subscribe", { paneId: busy, scrollbackLines: 10 });
    return { busy, quiet };
  }

  it("WsServerWs の onDrain は実物の ws の上で実際に呼ばれる（ws は drain を emit しないので、以前は一度も呼ばれず、流量制御で止めた購読が永久に再開しなかった。D98）", async () => {
    // 流量制御で止めた購読の再開（`OutputFanout.retryStale`）は、出力を出し続けている pane ならミラーが追いつくたびにも
    // 呼ばれる（`TerminalHost`）が、混んでいる瞬間に小さな出力を出してその後は黙っている pane は、この `onDrain` だけが頼り。
    const httpServer = createHttpServer();
    const originOpts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: [] as string[] };
    const origins = new DefaultOriginPolicy(originOpts, { addresses: () => [], lanAddresses: () => [], hostnames: () => [] });
    const wsServer = new WsServerWs(httpServer, new OriginRejectionLog(new MemoryLogger(), origins), async () => ({ ok: true, sessionId: "s" }), new MemoryLogger());
    let calls = 0;
    wsServer.onConnection((conn) => conn.onDrain(() => calls++));
    const port = await listenOnFreePort(httpServer);
    originOpts.port = port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}` } });
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      await new Promise((r) => setTimeout(r, 300));
      expect(calls).toBeGreaterThanOrEqual(2);
      const afterClose = new Promise<void>((r) => ws.once("close", () => r()));
      ws.close();
      await afterClose;
      await new Promise((r) => setTimeout(r, 100));
      const settled = calls;
      await new Promise((r) => setTimeout(r, 200));
      expect(calls).toBe(settled); // 閉じたら呼ばない（タイマーを止めている）
    } finally {
      wsServer.closeAll(1001, "test end");
      await new Promise<void>((r) => httpServer.close(() => r()));
    }
  });

  it("大量出力の pane があっても、同じ接続の別の pane の出力は待たされずに届く（D98）", async () => {
    const { ws } = await server.connectAuthorized();
    const inbox = makeInbox(ws);
    let quietOutput = "";
    let quietId = "";
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) return;
      const f = decodeFrame(new Uint8Array(data));
      if (f.paneId === quietId && (f.type === FRAME_TYPE.OUTPUT || f.type === FRAME_TYPE.SNAPSHOT)) {
        quietOutput += f.type === FRAME_TYPE.OUTPUT ? new TextDecoder().decode(f.chunk) : f.text;
      }
    });
    try {
      const { quiet } = await setUpTwoPanes(ws, inbox);
      quietId = quiet;
      await new Promise((r) => setTimeout(r, 1000)); // yes の出力が十分に流れ始めるのを待つ
      const start = Date.now();
      ws.send(encodeInputFrame(quiet, new TextEncoder().encode("ping-quiet\n")));
      while (!quietOutput.includes("ping-quiet") && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10));
      expect(quietOutput).toContain("ping-quiet");
    } finally {
      ws.close();
    }
  }, 20_000);
});

/**
 * D106（統合 review ラウンド1 の nit）：不正なフレームの窓（10 秒に 10 回まで）を単調な時計で測る（以前は `Date.now()`。
 * 時刻の合わせ直しで進むと窓がすぐ終わり、戻ると終わらない）。時計は差し替えられる。
 */
describe("WsGateway — 不正なフレームの窓の時計（D106）", () => {
  const INVALID = "not json{{{";

  /** `client.error` を n 通受け取るのを待つ。途中で閉じられたら、その close コードで reject する。 */
  async function receiveErrors(inbox: ReturnType<typeof makeInbox>, closed: Promise<number>, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      const msg = await Promise.race([inbox.next(), closed.then((code) => Promise.reject(new Error(`closed (${code}) after ${i} errors`)))]);
      expect(JSON.parse(msg.data.toString("utf8"))).toMatchObject({ event: "client.error" });
    }
  }

  it("注入した時計で窓を測る：10 回の後に 10 秒進めれば数え直し、同じ窓の 11 回目で 1008 で閉じる", async () => {
    let t = 0;
    const server = await startTestServer({ gatewayNow: () => t });
    let ws: WebSocket | undefined;
    try {
      ({ ws } = await server.connectAuthorized());
      const inbox = makeInbox(ws);
      const closed = nextClose(ws);
      for (let i = 0; i < 10; i++) ws.send(INVALID);
      await receiveErrors(inbox, closed, 10);
      t += 10_001; // 注入した時計だけを進める（壁時計はほとんど進まない）
      for (let i = 0; i < 10; i++) ws.send(INVALID);
      await receiveErrors(inbox, closed, 10); // 新しい窓の 10 回目までは閉じない
      ws.send(INVALID);
      expect(await closed).toBe(1008);
    } finally {
      ws?.terminate(); // 閉じられなかったとき（失敗）も、開いた接続が server.close() を止めないように
      await server.close();
    }
  }, 10000);

  it("既定の時計は単調（performance.now）：壁時計（Date.now）が 1 時間進んでも窓は終わらず、11 回目で閉じる", async () => {
    const server = await startTestServer();
    let ws: WebSocket | undefined;
    try {
      ({ ws } = await server.connectAuthorized());
      const inbox = makeInbox(ws);
      const closed = nextClose(ws);
      for (let i = 0; i < 10; i++) ws.send(INVALID);
      await receiveErrors(inbox, closed, 10);
      const realNow = Date.now();
      const wall = vi.spyOn(Date, "now").mockReturnValue(realNow + 3_600_000); // 時刻の合わせ直しで壁時計が進む
      try {
        ws.send(INVALID);
        await receiveErrors(inbox, closed, 1);
        const code = await Promise.race([closed, new Promise<string>((r) => setTimeout(() => r("still open"), 1000))]);
        expect(code).toBe(1008);
      } finally {
        wall.mockRestore();
      }
    } finally {
      ws?.terminate();
      await server.close();
    }
  }, 10000);
});

/**
 * 20260927-server-size-input-limits の AC5〜AC7。pane が入力を読まない（raw モードで読まない子。固まった TUI の代わり）とき、サーバに溜まった入力が
 * 上限（16 MiB）に達したら INPUT を書かずに捨て、送った接続へ `client.error`（input_queue_full・paneId）を同じ pane について 2 秒に 1 回だけ送る。
 * 接続は閉じない。実物の node-pty に上限まで 1 回だけ書く（負荷試験ではない。pane は server.close で終わる）。
 */
describe("WsGateway — 読まない pane への入力の上限（20260927-server-size-input-limits）", () => {
  it("上限の内側の 1 MiB の INPUT は書き、超えた分は捨てて 2 秒に 1 回だけ知らせ、接続は閉じない。ログも間引く", async () => {
    let t = 0;
    const gatewayLogger = new MemoryLogger();
    const server = await startTestServer({
      commandFor: () => "stty raw -echo; printf READY; exec sleep 30",
      gatewayNow: () => t,
      gatewayLogger,
    });
    let ws: WebSocket | undefined;
    try {
      ({ ws } = await server.connectAuthorized());
      const inbox = makeInbox(ws);
      const closed = nextClose(ws);
      const texts: { id?: string; event?: string; data?: { code?: string; paneId?: string } }[] = [];
      /** 印の要求（未知の方式）の応答が来るまでの JSON を集める。INPUT は届いた順に処理されるので、それより前の知らせは全部ここに入る。 */
      const drainUntil = async (id: string): Promise<void> => {
        request(ws!, id, "no.such_method", {});
        for (;;) {
          const msg = await Promise.race([inbox.next(), closed.then((code) => Promise.reject(new Error(`closed (${code})`)))]);
          if (msg.isBinary) continue;
          const parsed = JSON.parse(msg.data.toString("utf8")) as (typeof texts)[number];
          if (parsed.id === id) return;
          texts.push(parsed);
        }
      };
      const notices = () => texts.filter((m) => m.event === "client.error");

      request(ws, "h", "client.hello", { protocol: 1, kind: "desktop" });
      request(ws, "c", "workspace.create", { cwd: process.cwd(), label: "stuck" });
      let paneId = "";
      for (;;) {
        const m = JSON.parse((await inbox.next()).data.toString("utf8")) as { id?: string; result?: { pane?: { id: string } } };
        if (m.id === "c") {
          paneId = m.result!.pane!.id;
          break;
        }
      }
      request(ws, "s", "pane.subscribe", { paneId, scrollbackLines: 0 });
      // raw にしてから書く（canonical のままだとカーネルが溢れた入力を捨てる）。READY は購読の前に出ていれば SNAPSHOT に、後なら OUTPUT に載る。
      let screen = "";
      while (!screen.includes("READY")) {
        const msg = await inbox.next();
        if (!msg.isBinary) continue;
        const f = decodeFrame(new Uint8Array(msg.data));
        if (f.type === FRAME_TYPE.SNAPSHOT) screen += f.text;
        else if (f.type === FRAME_TYPE.OUTPUT) screen += new TextDecoder().decode(f.chunk);
      }

      const MiB = 1024 * 1024;
      // 1 件あたり 256 バイトを上乗せして数えるので（decisions D9）、上限の内側の 15 通の 1 MiB は捨てずに書く（AC7）。
      for (let i = 0; i < 15; i++) ws.send(encodeInputFrame(paneId, new Uint8Array(MiB).fill(0x61)));
      await drainUntil("m1");
      expect(notices()).toEqual([]);

      // 上限に達した後は捨てる。64 KiB（カーネルの受け口より大きい）を 40 通（残りの約 1 MiB に 16 通ほど入り、後は捨てる）。知らせは 1 回だけ。
      for (let i = 0; i < 40; i++) ws.send(encodeInputFrame(paneId, new Uint8Array(64 * 1024).fill(0x62)));
      await drainUntil("m2");
      expect(notices()).toEqual([
        {
          event: "client.error",
          data: { code: "input_queue_full", message: expect.stringContaining(paneId), paneId },
        },
      ]);

      // 間隔の内（1999ms）は知らせず、2 秒で再び知らせる。
      t += 1999;
      ws.send(encodeInputFrame(paneId, new Uint8Array(64 * 1024)));
      await drainUntil("m3");
      expect(notices()).toHaveLength(1);
      t += 1;
      ws.send(encodeInputFrame(paneId, new Uint8Array(64 * 1024)));
      await drainUntil("m4");
      expect(notices()).toHaveLength(2);

      // 捨てた 20 通余りのうち、ログは窓（60 秒）の上限 20 行まで。
      const dropLines = gatewayLogger.lines.filter((l) => l.msg === "dropped input to a pane that is not reading");
      expect(dropLines).toHaveLength(20);
      expect(dropLines[0]!.fields).toMatchObject({ paneId, bytes: 64 * 1024 });
      // 接続は閉じていない（印の要求に応答が返り続けた）。
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      ws?.terminate();
      await server.close();
    }
  }, 20_000);
});

/**
 * worktree の方式は別のテストで確かめるので、ここでは呼ばれない代役を置く
 * （一覧・作成は 20260920-git-worktree-actions。削除は 20260924-worktree-remove）。
 */
function stubWorktrees(): WorktreeService {
  return {
    list: () => Promise.reject(new Error("not used in this test")),
    create: () => Promise.reject(new Error("not used in this test")),
    remove: () => Promise.reject(new Error("not used in this test")),
  };
}

/**
 * 20260925-workspace-git-immediate: workspace.create のたびに fire-and-forget で呼ばれるが、
 * 応答自体はこの結果を待たない（ハンドラ側の `.catch` で無害化される）ので、ここでは
 * 何もしない代役で足りる。
 */
function stubGitPoller(): GitInfoPoller {
  return {
    start: () => undefined,
    stop: () => undefined,
    pollNow: () => Promise.resolve(),
    pollWorkspaceNow: () => Promise.resolve(),
  };
}

/** 公式フック連携の方式も別のテストで確かめるので、ここでは呼ばれない代役を置く（20260923-agent-session-resume）。 */
function stubAgentIntegrations(): AgentIntegrationService {
  return {
    getAutoResumeEnabled: () => true,
    status: () => Promise.reject(new Error("not used in this test")),
    install: () => Promise.reject(new Error("not used in this test")),
    uninstall: () => Promise.reject(new Error("not used in this test")),
    setAutoResume: () => Promise.reject(new Error("not used in this test")),
  };
}

describe("WsGateway — 接続の終わりの知らせ（20260927-custom-command-keys）", () => {
  it("接続が閉じたら onClientGone をその接続の id で 1 度呼ぶ（その接続の popup を止めるため）", async () => {
    const gone: string[] = [];
    const server = await startTestServer({ onClientGone: (id) => gone.push(id) });
    let ws: WebSocket | undefined;
    try {
      ({ ws } = await server.connectAuthorized());
      const inbox = makeInbox(ws);
      ws.send(JSON.stringify({ id: "h", method: "client.hello", params: { protocol: 1, kind: "desktop" } }));
      const hello = JSON.parse((await inbox.next()).data.toString("utf8")) as { result: { clientId: string } };
      expect(gone).toEqual([]);
      ws.close();
      await vi.waitFor(() => expect(gone).toEqual([hello.result.clientId]));
    } finally {
      ws?.terminate();
      await server.close();
    }
  }, 10000);
});
