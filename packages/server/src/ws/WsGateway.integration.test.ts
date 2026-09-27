import { createServer as createHttpServer, type Server as HttpServerType } from "node:http";
import { connect } from "node:net";
import type { HostInfo } from "@wtm/protocol";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@wtm/protocol";
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
}

async function startTestServer(
  opts: { commandFor?: (index: number) => string; gatewayNow?: () => number; onClientGone?: (clientId: string) => void } = {},
): Promise<TestServer> {
  const stateDir = await makeTempDir("wtm-ws-state-");
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
  const webDistDir = await makeTempDir("wtm-ws-webdist-missing-");
  // Origin の検査と拒否のログは、composeServer と同じく HttpServer と WsServerWs で 1 つを共有する（D103）。
  const wsLogger = new MemoryLogger();
  const originGate = new OriginRejectionLog(wsLogger, origins);
  const http = new HttpServer(auth, originGate, new DefaultLoginRateLimiter(), { webDistDir, logger: new MemoryLogger() });
  const httpServer = http.server;
  const wsServer = new WsServerWs(httpServer, originGate, auth.authorizeUpgrade, wsLogger);
  new WsGateway(wsServer, surface, clients, sizeAuthority, terminals, bus, auth, new MemoryLogger(), {
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
    expect(await rawUpgrade(server.port, "/ws", ["Cookie: wtm_session=%E0%A4%A"])).toBe("HTTP/1.1 401 Unauthorized");
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
      const createResp = JSON.parse((await firstInbox.next()).data.toString("utf8"));
      const paneId = createResp.result.pane.id as string;

      await secondInbox.next(); // workspace.created（second への配信。AC9 の「どちらからも見える」）
      await secondInbox.next(); // tab.created（同上。D88）
      await secondInbox.next(); // pane.created（同上）

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
