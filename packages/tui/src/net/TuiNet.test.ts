import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionModel } from "../model/SessionModel.js";
import { FakeSocket } from "../testing/fakeSocket.js";
import { snapshot } from "../testing/fixtures.js";
import type { TuiTarget } from "../types.js";
import type { Endpoint } from "./nodeTransport.js";
import { TuiNet, type TuiNetHandlers } from "./TuiNet.js";

interface SetupOptions {
  isServerAlive?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
}

function setup(login: () => Promise<string>, sessionStatus = 204, opts: SetupOptions = {}) {
  /** 偽のサーバ：`down` なら要求が届かない。`status` は `/api/session` の応答。 */
  const srv = { down: false, status: sessionStatus };
  const sockets: FakeSocket[] = [];
  const fetchCookies: string[] = [];
  const fetchCalls: string[] = [];
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
    ...(opts.isServerAlive ? { isServerAlive: opts.isServerAlive } : {}),
  };
  const net = new TuiNet(target, h, {
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    createWebSocket: (ep: Endpoint) => (url) => {
      const s = new FakeSocket(url, ep.cookie());
      sockets.push(s);
      return s;
    },
    fetchImpl: (ep: Endpoint) => async (input, init) => {
      fetchCalls.push(`${init?.method ?? "GET"} ${String(input)} ${ep.cookie()}`);
      fetchCookies.push(ep.cookie());
      if (srv.down) throw new TypeError("fetch failed");
      return new Response(null, {
        status: String(input).endsWith("/api/session") ? srv.status : 204,
      });
    },
  });
  return { net, h, sockets, fetchCookies, fetchCalls, srv };
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
    const { net, h, sockets, srv } = setup(async () => {
      if (++calls > 1) throw new Error("gone");
      return "sid=1";
    });
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    srv.down = true;
    sockets[0]!.close(1006);
    await flush();
    await flush();
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });

  it("利用者が止めたサーバ（expectStop の後）が居なくなったら、fatal ではなく onStopped で終える（統合の review）", async () => {
    let calls = 0;
    const { net, h, sockets, srv } = setup(async () => {
      if (++calls > 1) throw new Error("gone");
      return "sid=1";
    });
    const onStopped = vi.fn();
    (h as TuiNetHandlers).onStopped = onStopped;
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    net.expectStop();
    srv.down = true;
    sockets[0]!.close(1006);
    await flush();
    await flush();
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(h.onFatal).not.toHaveBeenCalled();
  });

  it("expectStop の後でも繋ぎ直せたら取り消し、その後に居なくなったら fatal で終える（統合の review r2）", async () => {
    let calls = 0;
    let loginFails = false;
    const { net, h, sockets, srv } = setup(async () => {
      calls++;
      if (loginFails) throw new Error("gone");
      return `sid=${calls}`;
    });
    const onStopped = vi.fn();
    (h as TuiNetHandlers).onStopped = onStopped;
    await net.start();
    await flush();
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    net.expectStop();
    // 止めたはずのサーバが居続けた（別の soda が起動し直した等）：繋ぎ直せる（4401 → ログインし直して繋ぐ）
    sockets[0]!.close(4401);
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(1));
    const s2 = sockets.at(-1)!;
    s2.open();
    s2.reply({ clientId: "c2", snapshot: snapshot() });
    await vi.waitFor(() => expect(h.onOpened).toHaveBeenCalledTimes(2));
    // 今度は本当に落ちた
    loginFails = true;
    srv.down = true;
    s2.close(1006);
    await vi.waitFor(() =>
      expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped")),
    );
    expect(onStopped).not.toHaveBeenCalled();
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
    const { net, h, sockets, srv } = setup(login);
    await net.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.close(1006);
    await vi.advanceTimersByTimeAsync(0);
    expect(login).toHaveBeenCalledTimes(1); // 停止の確かめは今の cookie が通るのでログインし直さない
    alive = false;
    srv.down = true;
    // 繋ぎ直しの試みが失敗し続ける（開く前に閉じる）。
    for (let i = 0; i < 8 && !h.onFatal.mock.calls.length; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      const last = sockets[sockets.length - 1]!;
      if (last.readyState === 0) last.close(1006);
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });

  it("logout はその cookie で POST /api/logout を 1 回だけ送る（止めた後でも）", async () => {
    const { net, fetchCalls } = setup(async () => "sid=7");
    await net.start();
    await flush();
    net.stop();
    await net.logout();
    await net.logout();
    expect(fetchCalls.filter((c) => c.startsWith("POST"))).toEqual([
      "POST http://127.0.0.1:9/api/logout sid=7",
    ]);
  });

  /** 開いてから切れた（再接続中）状態まで進める。 */
  async function openThenDrop(t: ReturnType<typeof setup>): Promise<void> {
    await t.net.start();
    await flush();
    t.sockets[0]!.open();
    t.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    t.sockets[0]!.close(1006);
    for (let i = 0; i < 5; i++) await flush();
  }

  it("再接続中の確かめ：今の cookie がまだ通ればログインし直さない（セッションを増やさない）", async () => {
    const login = vi.fn(async () => "sid=1");
    const t = setup(login);
    await openThenDrop(t);
    expect(login).toHaveBeenCalledTimes(1);
    expect(t.fetchCalls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("再接続中の確かめ：cookie が通らなければログインし直し、古い cookie はログアウトする", async () => {
    let n = 0;
    const t = setup(async () => {
      t.srv.status = 204; // ログインし直した cookie は通る
      return `sid=${++n}`;
    });
    await t.net.start();
    await flush();
    t.sockets[0]!.open();
    t.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    t.srv.status = 401;
    t.sockets[0]!.close(1006);
    for (let i = 0; i < 5; i++) await flush();
    expect(t.fetchCalls).toContain("POST http://127.0.0.1:9/api/logout sid=1");
    expect(t.h.onFatal).not.toHaveBeenCalled();
  });

  it("ログインできなくてもサーバが居れば（isServerAlive）終えずに繋ぎ直しを続ける", async () => {
    let calls = 0;
    const t = setup(
      async () => {
        if (++calls > 1) throw new Error("refused");
        return "sid=1";
      },
      204,
      { isServerAlive: async () => true },
    );
    await t.net.start();
    await flush();
    t.sockets[0]!.open();
    t.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    t.srv.status = 401; // 今の cookie は通らず、ログインもできない（入れ替えの途中の秘密の食い違い等）
    t.sockets[0]!.close(1006);
    for (let i = 0; i < 8; i++) await flush();
    expect(calls).toBeGreaterThan(1);
    expect(t.h.onFatal).not.toHaveBeenCalled();
  });

  it("handoff の入れ替えの空白（一度だけ居ないと見える）では終えない。居ないままなら終える", async () => {
    const answers = [false, true];
    const gap = setup(
      async () => {
        throw new Error("refused");
      },
      204,
      { isServerAlive: async () => answers.shift() ?? true, sleep: async () => undefined },
    );
    // 最初のログインだけは通す
    let first = true;
    const login = gap.net["target"].login;
    gap.net["target"].login = async () => {
      if (first) {
        first = false;
        return "sid=1";
      }
      return login();
    };
    gap.srv.down = false;
    await gap.net.start();
    await flush();
    gap.sockets[0]!.open();
    gap.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    gap.srv.down = true;
    gap.sockets[0]!.close(1006);
    for (let i = 0; i < 8; i++) await flush();
    expect(gap.h.onFatal).not.toHaveBeenCalled();

    let n = 0;
    const gone = setup(
      async () => {
        if (++n > 1) throw new Error("refused");
        return "sid=1";
      },
      204,
      { isServerAlive: async () => false, sleep: async () => undefined },
    );
    await gone.net.start();
    await flush();
    gone.sockets[0]!.open();
    gone.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    gone.srv.down = true;
    gone.sockets[0]!.close(1006);
    for (let i = 0; i < 8; i++) await flush();
    expect(gone.h.onFatal).toHaveBeenCalledWith(expect.stringContaining("stopped"));
  });

  it("4401 の再ログインで cookie が替わったら、古い cookie はログアウトする", async () => {
    let n = 0;
    const t = setup(async () => `sid=${++n}`);
    await t.net.start();
    await flush();
    t.sockets[0]!.open();
    t.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await flush();
    t.sockets[0]!.close(4401);
    for (let i = 0; i < 5; i++) await flush();
    expect(t.fetchCalls.filter((c) => c.startsWith("POST"))).toEqual([
      "POST http://127.0.0.1:9/api/logout sid=1",
    ]);
    expect(t.sockets[1]!.cookie).toBe("sid=2");
  });

  it("サーバは居るのにログインできないまま 30 秒続いたら、知らせてから理由を添えて終える", async () => {
    vi.useFakeTimers();
    let n = 0;
    const onStatus = vi.fn();
    const t = setup(
      async () => {
        if (++n > 1) throw new Error("local login was refused (HTTP 401)");
        return "sid=1";
      },
      204,
      { isServerAlive: async () => true },
    );
    (t.h as { onStatus?: (m: string) => void }).onStatus = onStatus;
    await t.net.start();
    await vi.advanceTimersByTimeAsync(0);
    t.sockets[0]!.open();
    t.sockets[0]!.reply({ clientId: "c1", snapshot: snapshot() });
    await vi.advanceTimersByTimeAsync(0);
    t.srv.status = 401; // cookie は通らず、ログインもできない
    t.sockets[0]!.close(1006);
    await vi.advanceTimersByTimeAsync(100);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("手元からログインできません"));
    expect(t.h.onFatal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.h.onFatal).toHaveBeenCalledWith(
      expect.stringContaining(
        "サーバは動いていますが、手元からログインできません: local login was refused",
      ),
    );
  });
});
