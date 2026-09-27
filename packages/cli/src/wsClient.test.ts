import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { login } from "./httpAuth.js";
import { EventEmitter } from "node:events";
import type { ServerEvent } from "@sodashitsu/protocol";
import type WebSocket from "ws";
import { AuthError, RpcFailure, WsSodaClient, connect, type SodaClient } from "./wsClient.js";

/**
 * T5 の時点では「実サーバに対する最小の疎通確認」だけを行う（design.md「対象範囲・新規」の T5 の説明）。
 * echo の往復・`pane.subscribe` の SNAPSHOT/OUTPUT・`watch`/`snapshot` コマンドとしての一巡は T12
 * （`main.integration.test.ts`）で確認する。
 */

let server: ComposedServer;
let origin: string;
let token: string;

beforeEach(async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "sodactl-wsclient-test-"));
  server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
  origin = `http://127.0.0.1:${server.options.port}`;
  token = server.freshToken!;
});

afterEach(async () => {
  await server.close();
});

describe("connect/SodaClient — 実サーバへの最小の疎通確認", () => {
  it("login -> connect -> hello -> request -> close の一巡", async () => {
    const cookie = await login(origin, token);
    const client: SodaClient = await connect(origin, cookie);
    try {
      const hello = await client.hello();
      expect(hello.clientId).toEqual(expect.any(String));
      expect(hello.snapshot.protocol).toBe(1);

      const created = await client.request("workspace.create", { cwd: process.cwd(), label: "wsclient-test" });
      expect(created.workspace.label).toBe("wsclient-test");
      expect(created.pane.id).toEqual(expect.any(String));
    } finally {
      client.close();
    }
  });

  it("無効な cookie は AuthError（401）", async () => {
    await expect(connect(origin, "soda_session=not-a-real-session")).rejects.toThrow(AuthError);
  });

  it("存在しない RPC 方式を呼ぶと RpcFailure", async () => {
    const cookie = await login(origin, token);
    const client = await connect(origin, cookie);
    try {
      // @ts-expect-error 存在しない方式をわざと呼ぶ（サーバの not_found を確かめる）
      await expect(client.request("no.such.method", {})).rejects.toThrow(RpcFailure);
    } finally {
      client.close();
    }
  });
});

describe("WsSodaClient.hello(onEventAfterHello) — 購読を始める位置", () => {
  /** 送ったフレームを覚え、受信をテストから同期的に起こせる偽の ws。 */
  function fakeWs(): { ws: Pick<WebSocket, "on" | "send" | "close" | "pause" | "resume">; sent: string[]; receive(msg: unknown): void } {
    const emitter = new EventEmitter();
    const sent: string[] = [];
    return {
      ws: {
        on: ((event: string, cb: (...args: unknown[]) => void) => emitter.on(event, cb)) as unknown as WebSocket["on"],
        send: ((data: string) => sent.push(data)) as unknown as WebSocket["send"],
        close: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      },
      sent,
      receive: (msg) => emitter.emit("message", Buffer.from(JSON.stringify(msg)), false),
    };
  }

  it("応答より前のイベントは渡さず、応答と同じ同期区間で直後に届いたイベントは渡す", async () => {
    const { ws, sent, receive } = fakeWs();
    const client = new WsSodaClient(ws);
    const got: string[] = [];
    const helloPromise = client.hello((evt: ServerEvent) => got.push(evt.event));
    const { id } = JSON.parse(sent[0]!) as { id: string };

    receive({ event: "workspace.closed", data: { workspaceId: "old" } });
    receive({ id, result: { clientId: "c1", snapshot: {} } });
    receive({ event: "pane.closed", data: { paneId: "p1" } });
    await helloPromise;

    expect(got).toEqual(["pane.closed"]);
  });
});

describe("WsSodaClient.pause/resume — 受信の一時停止（20260926-pane-observe-control D4）", () => {
  it("pause/resume をそのまま ws の pause/resume へ渡す", () => {
    const calls: string[] = [];
    const ws = {
      on: (() => undefined) as unknown as WebSocket["on"],
      send: (() => undefined) as unknown as WebSocket["send"],
      close: () => undefined,
      pause: () => calls.push("pause"),
      resume: () => calls.push("resume"),
    } as unknown as Pick<WebSocket, "on" | "send" | "close" | "pause" | "resume">;
    const client = new WsSodaClient(ws);
    client.pause();
    client.resume();
    expect(calls).toEqual(["pause", "resume"]);
  });

  it("自分で閉じたら、応答の来ない要求の時間切れのタイマーを残さない（プロセスを残さない）", () => {
    vi.useFakeTimers();
    try {
      const ws = {
        on: (() => undefined) as unknown as WebSocket["on"],
        send: (() => undefined) as unknown as WebSocket["send"],
        close: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      } as unknown as Pick<WebSocket, "on" | "send" | "close" | "pause" | "resume">;
      const client = new WsSodaClient(ws);
      const pending = client.request("pane.detach", { paneId: "p1" });
      pending.catch(() => undefined);
      expect(vi.getTimerCount()).toBe(1);
      client.close();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("実サーバの接続で pause している間は応答を受け取らず、resume で受け取る", async () => {
    const cookie = await login(origin, token);
    const client = await connect(origin, cookie);
    try {
      await client.hello();
      client.pause();
      let settled = false;
      const pending = client.request("pane.unsubscribe", { paneId: "p-none" }).then(() => (settled = true));
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);
      client.resume();
      await pending;
      expect(settled).toBe(true);
    } finally {
      client.close();
    }
  });
});

// 20260927-multi-host-machines（T10）: `--machine` は `/ws?machine=` で、404/503 を分けて返す。
describe("connect(..., machine) — 手元の soda serve の中継", () => {
  it("登録に無いマシンは machine_not_found、local は手元そのもの", async () => {
    const cookie = await login(origin, token);
    await expect(connect(origin, cookie, "nope")).rejects.toMatchObject({ code: "machine_not_found" });
    const local = await connect(origin, cookie, "local");
    try {
      expect((await local.hello()).snapshot.protocol).toBe(1);
    } finally {
      local.close();
    }
  });

  it("503 は machine_unavailable（--machine のときだけ）", async () => {
    const { createServer } = await import("node:http");
    const http = createServer();
    http.on("upgrade", (_req, socket) => {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
    });
    await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
    const port = (http.address() as { port: number }).port;
    try {
      await expect(connect(`http://127.0.0.1:${port}`, "c=1", "Build")).rejects.toMatchObject({ code: "machine_unavailable" });
      await expect(connect(`http://127.0.0.1:${port}`, "c=1")).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      await new Promise<void>((r) => http.close(() => r()));
    }
  });
});
