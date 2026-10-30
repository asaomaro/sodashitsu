import { EventEmitter, once } from "node:events";
import { WebSocketServer } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { NoticeConnection } from "./noticeConnection.js";

class FakeSocket extends EventEmitter {
  sent: string[] = [];
  ping = vi.fn(() => this.emit("pong"));
  send(message: string) {
    this.sent.push(message);
  }
  terminate = vi.fn(() => this.emit("close"));
  close = this.terminate;
  message(message: unknown) {
    this.emit("message", Buffer.from(JSON.stringify(message)), false);
  }
}
const owned: NoticeConnection[] = [];
afterEach(() => {
  for (const connection of owned.splice(0)) connection.stop();
  vi.useRealTimers();
});
function fixture(now: () => number = () => Date.now()) {
  const socket = new FakeSocket();
  const cookie = vi.fn<() => Promise<string | null>>(async () => "soda_session=generated");
  const create = vi.fn(() => socket);
  const status = vi.fn();
  const changed = vi.fn();
  const connection = new NoticeConnection("https://soda.test", {
    cookie,
    now,
    socket: create,
    status,
    changed,
  });
  owned.push(connection);
  const paneId = randomUUID(),
    tabId = randomUUID(),
    workspaceId = randomUUID();
  const snapshot = {
    panes: [
      {
        id: paneId,
        tabId,
        title: "",
        label: "worker",
        agent: {
          instanceId: randomUUID(),
          state: "blocked",
          completionSeq: 0,
          serverSeenSeq: 0,
          since: 10,
        },
      },
    ],
    tabs: [{ id: tabId, workspaceId, label: "main" }],
    workspaces: [{ id: workspaceId, label: "PJ" }],
  };
  return { connection, socket, cookie, create, status, changed, snapshot };
}
it("authenticates the configured origin and sends only readonly hello/state", async () => {
  const f = fixture();
  f.connection.start();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  expect(f.create).toHaveBeenCalledWith(
    "wss://soda.test/ws",
    "soda_session=generated",
    "https://soda.test",
  );
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  f.socket.emit("open");
  f.socket.message({ id: "assistant-hello", result: { snapshot: f.snapshot } });
  expect(f.changed).not.toHaveBeenCalled();
  f.socket.message({ id: "assistant-shared", result: { notices: [] } });
  expect(f.status).toHaveBeenLastCalledWith("connected");
  expect(f.connection.feed.notices).toHaveLength(1);
  expect(f.socket.sent.map((value) => JSON.parse(value).method)).toEqual([
    "client.hello",
    "notification.state",
  ]);
  f.connection.stop();
});
it("stops late cookie completion without opening a socket", async () => {
  const f = fixture();
  let release!: (value: string) => void;
  f.cookie.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  f.connection.start();
  f.connection.stop();
  release("soda_session=generated");
  await Promise.resolve();
  expect(f.create).not.toHaveBeenCalled();
});
it("expires the original handshake deadline and rejects late callbacks", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.connection.start();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  f.socket.emit("open");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.socket.terminate).toHaveBeenCalledOnce();
  f.socket.message({ id: "assistant-hello", result: { snapshot: f.snapshot } });
  expect(f.socket.sent).toHaveLength(1);
  expect(f.changed).not.toHaveBeenCalled();
  f.connection.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.create).toHaveBeenCalledOnce();
});
it("reports missing authentication without a socket and cancels its retry", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.cookie.mockResolvedValue(null);
  f.connection.start();
  await vi.waitFor(() => expect(f.status).toHaveBeenLastCalledWith("login"));
  expect(f.status).toHaveBeenLastCalledWith("login");
  expect(f.create).not.toHaveBeenCalled();
  f.connection.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.cookie).toHaveBeenCalledOnce();
});

it("detects a silent peer and cancels heartbeat ownership on stop", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.connection.start();
  await Promise.resolve();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  f.socket.emit("open");
  f.socket.message({ id: "assistant-hello", result: { snapshot: f.snapshot } });
  f.socket.message({ id: "assistant-shared", result: { notices: [] } });
  f.socket.ping.mockImplementation(() => false);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(f.socket.ping).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.status).toHaveBeenLastCalledWith("offline");
  expect(f.socket.terminate).toHaveBeenCalledOnce();
  f.connection.stop();
  await vi.advanceTimersByTimeAsync(100_000);
  expect(f.create).toHaveBeenCalledOnce();
});

it("receives verbal notices over a real generated localhost websocket without sending terminal input", async () => {
  const f = fixture();
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No generated server address");
  const origin = `http://127.0.0.1:${address.port}`;
  const requests: string[] = [];
  const headers: Array<{ cookie: string | undefined; origin: string | undefined }> = [];
  server.on("connection", (socket, request) => {
    headers.push({ cookie: request.headers.cookie, origin: request.headers.origin });
    socket.on("message", (data) => {
      const rpc = JSON.parse(data.toString()) as { id: string; method: string };
      requests.push(rpc.method);
      socket.send(
        JSON.stringify({
          id: rpc.id,
          result: rpc.method === "client.hello" ? { snapshot: f.snapshot } : { notices: [] },
        }),
      );
    });
  });
  const changed = vi.fn();
  const status = vi.fn();
  const connection = new NoticeConnection(origin, {
    cookie: async () => "soda_session_work=generated",
    changed,
    status,
  });
  try {
    connection.start();
    await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith("connected"));
    expect(connection.feed.notices[0]!.message).toContain("確認の依頼です");
    expect(headers).toEqual([{ cookie: "soda_session_work=generated", origin }]);
    expect(requests).toEqual(["client.hello", "notification.state"]);
    const pane = f.snapshot.panes[0]!;
    for (const socket of server.clients)
      socket.send(
        JSON.stringify({
          event: "pane.agent_status_changed",
          data: { paneId: pane.id, agent: { ...pane.agent, state: "idle", completionSeq: 1 } },
        }),
      );
    await vi.waitFor(() =>
      expect(connection.feed.notices[0]!.message).toContain("作業が完了しました"),
    );
    expect(requests).toEqual(["client.hello", "notification.state"]);
  } finally {
    connection.stop();
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("validates TLS before sending cookies, using an internal generated trust adapter only", async () => {
  const cert = readFileSync(new URL("../../tui/src/testing/tls/cert.pem", import.meta.url), "utf8");
  const key = readFileSync(new URL("../../tui/src/testing/tls/key.pem", import.meta.url), "utf8");
  const server = createServer({ cert, key });
  const wss = new WebSocketServer({ server });
  const cookies: string[] = [];
  const f = fixture();
  wss.on("connection", (socket, request) => {
    cookies.push(request.headers.cookie ?? "");
    socket.on("message", (data) => {
      const rpc = JSON.parse(data.toString()) as { id: string; method: string };
      socket.send(
        JSON.stringify({
          id: rpc.id,
          result: rpc.method === "client.hello" ? { snapshot: f.snapshot } : { notices: [] },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No generated TLS address");
  const origin = `https://127.0.0.1:${address.port}`;
  const rejected = vi.fn();
  const bad = new NoticeConnection(origin, {
    cookie: async () => "soda_session=generated",
    changed: vi.fn(),
    status: rejected,
    trustedAuthorities: () => [],
  });
  const accepted = vi.fn();
  const good = new NoticeConnection(origin, {
    cookie: async () => "soda_session=generated",
    changed: vi.fn(),
    status: accepted,
    trustedAuthorities: () => [cert],
  });
  try {
    bad.start();
    await vi.waitFor(() => expect(rejected).toHaveBeenLastCalledWith("offline"));
    bad.stop();
    expect(cookies).toEqual([]);
    good.start();
    await vi.waitFor(() => expect(accepted).toHaveBeenLastCalledWith("connected"));
    expect(cookies).toEqual(["soda_session=generated"]);
  } finally {
    bad.stop();
    good.stop();
    for (const socket of wss.clients) socket.terminate();
    await new Promise<void>((resolve, reject) =>
      wss.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("rejects expired cookie completion even when its timer never ran", async () => {
  let ticks = 0;
  const f = fixture(() => ticks);
  let release!: (value: string) => void;
  f.cookie.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  f.connection.start();
  ticks = 10_000;
  release("soda_session=generated");
  await vi.waitFor(() => expect(f.status).toHaveBeenLastCalledWith("offline"));
  expect(f.create).not.toHaveBeenCalled();
  f.connection.stop();
});
it("rejects an expired shared reply or a callback crossing the original monotonic deadline", async () => {
  for (const callbackCrosses of [false, true]) {
    let ticks = 0;
    const f = fixture(() => ticks);
    f.connection.start();
    await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    f.socket.emit("open");
    f.socket.message({ id: "assistant-hello", result: { snapshot: f.snapshot } });
    if (callbackCrosses) {
      ticks = 9999;
      f.changed.mockImplementation(() => {
        ticks = 10_000;
      });
    } else ticks = 10_000;
    f.socket.message({ id: "assistant-shared", result: { notices: [] } });
    expect(f.status).toHaveBeenLastCalledWith("offline");
    expect(f.status).not.toHaveBeenCalledWith("connected");
    expect(f.socket.terminate).toHaveBeenCalledOnce();
    f.connection.stop();
  }
});
it("retires a socket whose creation crosses the deadline without publishing it", async () => {
  let ticks = 0;
  const f = fixture(() => ticks);
  f.create.mockImplementation(() => {
    ticks = 10_000;
    return f.socket;
  });
  f.connection.start();
  await vi.waitFor(() => expect(f.status).toHaveBeenLastCalledWith("offline"));
  expect(f.socket.terminate).toHaveBeenCalledOnce();
  expect(f.socket.sent).toEqual([]);
  f.connection.stop();
});
it("rejects a late pong even before its watchdog timer runs", async () => {
  vi.useFakeTimers();
  let ticks = 0;
  const f = fixture(() => ticks);
  f.socket.ping.mockImplementation(() => false);
  f.connection.start();
  await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  f.socket.emit("open");
  f.socket.message({ id: "assistant-hello", result: { snapshot: f.snapshot } });
  f.socket.message({ id: "assistant-shared", result: { notices: [] } });
  ticks = 20_000;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(f.socket.ping).toHaveBeenCalledOnce();
  ticks = 30_000;
  f.socket.emit("pong");
  expect(f.status).toHaveBeenLastCalledWith("offline");
  expect(f.socket.terminate).toHaveBeenCalledOnce();
  f.connection.stop();
});
