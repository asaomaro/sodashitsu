import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionModel } from "../model/SessionModel.js";
import { FakeSocket } from "../testing/fakeSocket.js";
import { snapshot } from "../testing/fixtures.js";
import type { TuiTarget } from "../types.js";
import type { Endpoint } from "./nodeTransport.js";
import { TuiNet, type TuiNetHandlers } from "./TuiNet.js";

function setup(login: () => Promise<string>, sessionStatus = 204) {
  const sockets: FakeSocket[] = [];
  const fetchCookies: string[] = [];
  const h = {
    model: new SessionModel(),
    sink: { onOutput: vi.fn(), onSnapshot: vi.fn(), onSizeChanged: vi.fn() },
    onState: vi.fn(),
    onOpened: vi.fn(),
    onClosed: vi.fn(),
    onFatal: vi.fn(),
  } satisfies TuiNetHandlers;
  const target: TuiTarget = {
    baseUrl: "http://127.0.0.1:9",
    origin: "http://127.0.0.1:9",
    login,
    stateDir: "/x",
  };
  const net = new TuiNet(target, h, {
    createWebSocket: (ep: Endpoint) => (url) => {
      const s = new FakeSocket(url, ep.cookie());
      sockets.push(s);
      return s;
    },
    fetchImpl: (ep: Endpoint) => async () => {
      fetchCookies.push(ep.cookie());
      return new Response(null, { status: sessionStatus });
    },
  });
  return { net, h, sockets, fetchCookies };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("TuiNet（接続・再ログイン。AC10・AC11・AC12）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ログイン → /api/session → /ws に cookie つきで繋ぎ、hello は desktop。snapshot をモデルへ", async () => {
    const { net, h, sockets, fetchCookies } = setup(async () => "sid=1");
    await net.start();
    await flush();
    expect(fetchCookies).toEqual(["sid=1"]);
    expect(sockets).toHaveLength(1);
    const s = sockets[0]!;
    expect(s.url).toBe("ws://127.0.0.1:9/ws");
    expect(s.cookie).toBe("sid=1");
    s.open();
    expect(s.sent[0]).toMatchObject({
      method: "client.hello",
      params: { protocol: 1, kind: "desktop" },
    });
    s.reply({ clientId: "c9", snapshot: snapshot() });
    await flush();
    expect(h.model.clientId).toBe("c9");
    expect(h.onOpened).toHaveBeenCalledWith("c9");
    expect(h.onState).toHaveBeenCalledWith("open");
  });

  it("4401 で閉じられたら target.login() で cookie を取り直して繋ぎ直す", async () => {
    let n = 0;
    const login = vi.fn(async () => `sid=${++n}`);
    const { net, h, sockets } = setup(login);
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    sockets[0]!.close(4401);
    await flush();
    await flush();
    expect(login).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.cookie).toBe("sid=2");
    expect(h.onFatal).not.toHaveBeenCalled();
  });

  it("最初のログインが拒まれたら終える（終了コード 1 の案内）", async () => {
    const { net, h, sockets } = setup(async () => {
      throw new Error("refused");
    });
    await net.start();
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("refused"));
    expect(sockets).toHaveLength(0);
  });

  it("再接続中にログインもできなければ、サーバが止まったとして終える", async () => {
    let calls = 0;
    const { net, h, sockets } = setup(async () => {
      if (++calls > 1) throw new Error("gone");
      return "sid=1";
    });
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    sockets[0]!.close(1006);
    await flush();
    await flush();
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });

  it("/api/session が 401 のままなら何度か再ログインして諦める", async () => {
    const login = vi.fn(async () => "sid=x");
    const { net, h } = setup(login, 401);
    await net.start();
    for (let i = 0; i < 10; i++) await flush();
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("refusing"));
    expect(login.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("終えた後は再接続の試みを始めない", async () => {
    vi.useFakeTimers();
    const { net, sockets } = setup(async () => "sid=1");
    await net.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await vi.advanceTimersByTimeAsync(0);
    net.stop();
    sockets[0]!.close(1006);
    await vi.advanceTimersByTimeAsync(60_000);
    // 閉じた後の試みは決着しない socket / 要求で止まり、本物の socket は作らない。
    expect(sockets).toHaveLength(1);
  });

  it("detach の後の stop は client.detach を送り直さない", async () => {
    const { net, sockets } = setup(async () => "sid=1");
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    void net.detach(10);
    net.stop();
    expect(sockets[0]!.requests("client.detach")).toHaveLength(1);
  });

  it("停止が長引いても 10 秒ごとにログインで確かめ直し、途中でサーバが止まれば終える", async () => {
    vi.useFakeTimers();
    let alive = true;
    const login = vi.fn(async () => {
      if (!alive) throw new Error("gone");
      return "sid=1";
    });
    const { net, h, sockets } = setup(login);
    await net.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.close(1006);
    await vi.advanceTimersByTimeAsync(0);
    expect(login).toHaveBeenCalledTimes(2); // 最初のログイン＋停止の確かめ（生きている）
    alive = false;
    // 繋ぎ直しの試みが失敗し続ける（開く前に閉じる）。
    for (let i = 0; i < 8 && !h.onFatal.mock.calls.length; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      const last = sockets[sockets.length - 1]!;
      if (last.readyState === 0) last.close(1006);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });
});
