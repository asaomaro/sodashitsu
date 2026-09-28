import { encodeOutputFrame, encodeSnapshotFrame, type ServerEvent, type SessionSnapshot } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, type WebSocketLike } from "./Connection.js";
import type { ConnectionState, StorePort, TerminalSinkPort } from "./ports.js";

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSED = 3;

/** テスト用の WebSocket。イベントは手動で発火させる（`open()`・`close()`・`message()`）。 */
class FakeWebSocket implements WebSocketLike {
  readyState = WS_CONNECTING;
  sent: (string | Uint8Array)[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    // 実物の WebSocket は、既に閉じている socket への close() を no-op とする（onclose を再発火しない）。
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    this.onclose?.({ code: 1000 });
  }
  open(): void {
    this.readyState = WS_OPEN;
    this.onopen?.();
  }
  message(data: unknown): void {
    this.onmessage?.({ data });
  }
  remoteClose(code: number): void {
    this.readyState = WS_CLOSED;
    this.onclose?.({ code });
  }
}

function makeSnapshot(): SessionSnapshot {
  return {
    protocol: 1,
    serverVersion: "test",
    host: { os: "linux", windowsBuild: null, hostname: "h" },
    workspaces: [],
    tabs: [],
    panes: [],
    groups: [],
    focus: null,
    limits: { scrollbackLines: 5000 },
  };
}

function makeStore(): StorePort & {
  states: ConnectionState[];
  authRequiredCount: number;
  events: ServerEvent[];
  snapshots: SessionSnapshot[];
  helloClientIds: string[];
  originSuspected: boolean[];
} {
  return {
    states: [],
    originSuspected: [],
    authRequiredCount: 0,
    events: [],
    snapshots: [],
    helloClientIds: [],
    applySnapshot(s, clientId) {
      this.snapshots.push(s);
      this.helloClientIds.push(clientId);
    },
    applyEvent(e) {
      this.events.push(e);
    },
    onAuthRequired() {
      this.authRequiredCount++;
    },
    onConnectionState(s) {
      this.states.push(s);
    },
    onOriginRejectSuspected(suspected) {
      this.originSuspected.push(suspected);
    },
  };
}

function makeSink(): TerminalSinkPort & { outputs: [string, Uint8Array][]; snapshots: [string, number, number, string][]; sizeChanges: [string, number, number][] } {
  return {
    outputs: [],
    snapshots: [],
    sizeChanges: [],
    onOutput(paneId, chunk) {
      this.outputs.push([paneId, chunk]);
    },
    onSnapshot(paneId, cols, rows, text) {
      this.snapshots.push([paneId, cols, rows, text]);
    },
    onSizeChanged(paneId, cols, rows) {
      this.sizeChanges.push([paneId, cols, rows]);
    },
  };
}

/** `fetch` の代わり。`sessionOk`/`loginOk` を差し替えて各経路を確かめる。 */
function makeFetch(status: { session: number; login: number; logout: number }): typeof fetch {
  const calls: string[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/api/session")) return new Response(null, { status: status.session });
    if (u.endsWith("/api/login")) return new Response(null, { status: status.login });
    if (u.endsWith("/api/logout")) return new Response(null, { status: status.logout });
    throw new Error(`unexpected fetch: ${u}`);
  }) as unknown as typeof fetch;
  (impl as unknown as { calls: string[] }).calls = calls;
  return impl;
}

function makeConnection(opts?: { fetchImpl?: typeof fetch }) {
  const store = makeStore();
  const sink = makeSink();
  const sockets: FakeWebSocket[] = [];
  const fetchImpl = opts?.fetchImpl ?? makeFetch({ session: 204, login: 204, logout: 204 });
  const conn = new Connection({
    kind: "desktop",
    httpOrigin: "http://example.test",
    wsUrl: "ws://example.test/ws",
    store,
    sink,
    fetchImpl,
    createWebSocket: (url) => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      void url;
      return ws;
    },
  });
  return { conn, store, sink, sockets, fetchImpl };
}

/**
 * マイクロタスクだけを片付ける（偽の時計は進めない）。`vi.waitFor` は使わない——このプロジェクトの
 * vitest では、フェイクタイマー使用時に `vi.waitFor` 自身が内部で時計を進めることがあり、
 * 隣接する再接続のバックオフタイマーを早めて発火させてしまうことを実測で確認した（コーディング時の判断）。
 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("Connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("login — 204 で成功、それ以外は失敗（理由つき。D105）", async () => {
    const okFetch = makeFetch({ session: 204, login: 204, logout: 204 });
    const { conn } = makeConnection({ fetchImpl: okFetch });
    await expect(conn.login("t")).resolves.toEqual({ ok: true });

    const badFetch = makeFetch({ session: 204, login: 401, logout: 204 });
    const { conn: conn2 } = makeConnection({ fetchImpl: badFetch });
    await expect(conn2.login("bad")).resolves.toEqual({ ok: false, reason: "bad_token" });
  });

  describe("login — 失敗の理由の読み分け（D105。以前は 204 以外を全て false にし、ログイン画面が 403 も token の誤りと同じ文言で出していた）", () => {
    /** `/api/login` にだけ、渡した応答（または例外）を返す fetch。送った要求も覚える。 */
    function loginFetch(respond: () => Response | Promise<Response>) {
      const calls: { url: string; init: RequestInit | undefined }[] = [];
      const impl = (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return respond();
      }) as unknown as typeof fetch;
      return { impl, calls };
    }

    it.each([
      [401, { ok: false, reason: "bad_token" }],
      [403, { ok: false, reason: "origin_rejected" }],
      [429, { ok: false, reason: "rate_limited", retryAfterSeconds: null }],
      [400, { ok: false, reason: "http_error", status: 400 }],
      [500, { ok: false, reason: "http_error", status: 500 }],
      [200, { ok: false, reason: "http_error", status: 200 }],
    ] as const)("%i → %o", async (status, expected) => {
      const { impl, calls } = loginFetch(() => new Response(null, { status }));
      const { conn } = makeConnection({ fetchImpl: impl });
      await expect(conn.login("tok")).resolves.toEqual(expected);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("http://example.test/api/login");
      expect(calls[0]!.init?.method).toBe("POST");
      expect(calls[0]!.init?.body).toBe(JSON.stringify({ token: "tok" }));
    });

    it("429 の Retry-After（秒数）を読む", async () => {
      const { impl } = loginFetch(() => new Response(null, { status: 429, headers: { "retry-after": "120" } }));
      const { conn } = makeConnection({ fetchImpl: impl });
      await expect(conn.login("tok")).resolves.toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 120 });
    });

    it("429 の Retry-After（HTTP の日付）を、今から何秒後かにして読む", async () => {
      vi.setSystemTime(new Date("2026-09-19T00:00:00Z"));
      const { impl } = loginFetch(() => new Response(null, { status: 429, headers: { "retry-after": "Sat, 19 Sep 2026 00:00:45 GMT" } }));
      const { conn } = makeConnection({ fetchImpl: impl });
      await expect(conn.login("tok")).resolves.toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 45 });
    });

    it("429 の Retry-After が読めない・大きすぎるときは null（ログイン画面は既定の文言へ。規則は retryAfter.test.ts）", async () => {
      for (const value of ["soon 5", "Infinity", "100000"]) {
        const { impl } = loginFetch(() => new Response(null, { status: 429, headers: { "retry-after": value } }));
        const { conn } = makeConnection({ fetchImpl: impl });
        await expect(conn.login("tok")).resolves.toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: null });
      }
    });

    it("fetch 自体が失敗（サーバに届かない）したら reject せず network_error を返す", async () => {
      const { impl } = loginFetch(() => Promise.reject(new TypeError("Failed to fetch")));
      const { conn } = makeConnection({ fetchImpl: impl });
      await expect(conn.login("tok")).resolves.toEqual({ ok: false, reason: "network_error" });
    });
  });

  it("connect: /api/session を確認してから WebSocket を開き、client.hello の応答で snapshot を適用する", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    expect(store.states).toEqual(["connecting"]);

    const ws = sockets[0]!;
    ws.open();
    expect(store.states).toEqual(["connecting"]); // socket が開いただけではまだ open にしない（D95）

    // client.hello が送られていること（id 付き JSON）
    const sentHello = JSON.parse(ws.sent[0] as string) as { id: string; method: string; params: unknown };
    expect(sentHello.method).toBe("client.hello");
    expect(sentHello.params).toEqual({ protocol: 1, kind: "desktop" });

    const snapshot = makeSnapshot();
    ws.message(JSON.stringify({ id: sentHello.id, result: { clientId: "c1", snapshot } }));
    await flush();
    expect(store.states).toEqual(["connecting", "open"]); // hello が通ってから open
    expect(store.snapshots).toHaveLength(1);
    expect(store.snapshots[0]).toEqual(snapshot);
    expect(store.helloClientIds).toEqual(["c1"]);
  });

  it("connect: /api/session が 401 なら onAuthRequired を呼び、WebSocket を開かない", async () => {
    const fetchImpl = makeFetch({ session: 401, login: 204, logout: 204 });
    const { conn, store, sockets } = makeConnection({ fetchImpl });
    conn.connect();
    await flush();
    expect(store.authRequiredCount).toBe(1);
    expect(sockets).toHaveLength(0);
  });

  it("request: 要求と応答が id で対応する", async () => {
    const { conn, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    await flush();

    const p = conn.request("pane.focus", { paneId: "p1" });
    const sent = JSON.parse(ws.sent.at(-1) as string) as { id: string; method: string };
    expect(sent.method).toBe("pane.focus");
    ws.message(JSON.stringify({ id: sent.id, result: {} }));
    await expect(p).resolves.toEqual({});
  });

  it("request: サーバのエラー応答を reject する", async () => {
    const { conn, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    await flush();

    const p = conn.request("pane.focus", { paneId: "missing" });
    const sent = JSON.parse(ws.sent.at(-1) as string) as { id: string };
    ws.message(JSON.stringify({ id: sent.id, error: { code: "not_found", message: "no such pane" } }));
    await expect(p).rejects.toThrow(/not_found/);
  });

  // 20260925-connection-error-code（design「振る舞いの詳細」）。message の文字列書式（上の
  // テストで確認済み）に加えて、code をプロパティとしても持つことを確認する（AC1）。
  it("request: サーバのエラー応答を reject するとき、reject される Error は code プロパティも持つ（AC1・AC4）", async () => {
    const { conn, sockets } = makeConnection();
    conn.connect();
    await flush();
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    await flush();

    const p = conn.request("pane.focus", { paneId: "missing" });
    const sent = JSON.parse(ws.sent.at(-1) as string) as { id: string };
    ws.message(JSON.stringify({ id: sent.id, error: { code: "not_found", message: "no such pane" } }));
    await expect(p).rejects.toMatchObject({ code: "not_found", message: "not_found: no such pane" });
  });

  it("フレームの振り分け: OUTPUT/SNAPSHOT は TerminalSinkPort へ、それ以外のイベントは StorePort へ", async () => {
    const { conn, store, sink, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));

    ws.message(encodeOutputFrame("p1", new TextEncoder().encode("hi")));
    expect(sink.outputs).toEqual([["p1", new TextEncoder().encode("hi")]]);

    ws.message(encodeSnapshotFrame("p1", 80, 24, "screen"));
    expect(sink.snapshots).toEqual([["p1", 80, 24, "screen"]]);

    ws.message(JSON.stringify({ event: "pane.updated", data: { pane: { id: "p1" } } }));
    expect(store.events).toHaveLength(1);
    expect(store.events[0]!.event).toBe("pane.updated");

    // pane.size_changed は TerminalSinkPort（xterm.js の resize）と StorePort（非所有クライアントの表示）の両方へ。
    ws.message(JSON.stringify({ event: "pane.size_changed", data: { paneId: "p1", cols: 100, rows: 30 } }));
    expect(sink.sizeChanges).toEqual([["p1", 100, 30]]);
    expect(store.events).toHaveLength(2);
    expect(store.events[1]!.event).toBe("pane.size_changed");
  });

  it("再接続: close のたびに 1→2→4→8→16→30 秒と間隔を倍にする（上限 30 秒）", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    // ここから先は一度も開けずに切断し続ける（開けると reconnectAttempt が 0 に戻ってしまう。
    // 「開けたら 1 秒からやり直す」ことは別のテストで確かめる）。
    sockets[0]!.remoteClose(1006);

    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of expectedDelays) {
      await flush(); // /api/session の確認（マイクロタスク）を片付けてから再接続の予約を確認する
      expect(store.states.at(-1)).toBe("reconnecting");
      const before = sockets.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(sockets.length).toBe(before); // まだ早い
      await vi.advanceTimersByTimeAsync(1); // ちょうど delay ぶん進めると、タイマーのコールバックが同期的に socket を作る
      expect(sockets.length).toBe(before + 1);
      sockets.at(-1)!.remoteClose(1006); // 開かずにまた切断し、バックオフを引き継がせる
    }
  });

  it("切断を検知したら /api/session の確認を待たずに、その場で reconnecting にする（D95：入力を止める状態の起点）", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    await flush();
    expect(store.states.at(-1)).toBe("open");
    ws.remoteClose(1006);
    expect(store.states.at(-1)).toBe("reconnecting"); // flush する前（非同期の確認より先）
  });

  it("client.hello が失敗したら open にせず閉じ直す（D95：入力を受け付けたまま黙って捨てる窓を作らない）", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, error: { code: "invalid_params", message: "protocol mismatch" } }));
    await flush();
    expect(store.states).not.toContain("open");
    expect(ws.readyState).toBe(WS_CLOSED); // クライアント側から閉じ直した
    expect(store.states.at(-1)).toBe("reconnecting");
  });

  it("切断後の /api/session が 401 なら onAuthRequired を呼び、再接続を予約しない（D95 で reconnecting を先に出す経路）", async () => {
    const status = { session: 204, login: 204, logout: 204 };
    const { conn, store, sockets } = makeConnection({ fetchImpl: makeFetch(status) });
    conn.connect();
    await flush();
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    await flush();

    status.session = 401; // セッションが失効した
    ws.remoteClose(1006);
    expect(store.states.at(-1)).toBe("reconnecting");
    await flush();
    expect(store.authRequiredCount).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1); // 再接続していない
  });

  it("再接続: 正常に開けたら次の切断は 1 秒からやり直す", async () => {
    const { conn, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    sockets[0]!.remoteClose(1006);
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open(); // 開けた → reconnectAttempt は 0 に戻る

    sockets[1]!.remoteClose(1006);
    await flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(sockets).toHaveLength(2); // 999ms ではまだ
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
  });

  it("close コード 4401 は /api/session を待たずに onAuthRequired を呼び、再接続しない", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    sockets[0]!.remoteClose(4401);
    expect(store.authRequiredCount).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1); // 再接続していない
  });

  it("disconnect は閉じて繋ぎ直さず、応答待ちを reject する。繋ぎ直しの待ち・/api/session の確認の途中でも開かない。connect で再開できる（20260927-agent-graph の 04）", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));
    const pending = conn.request("session.get" as never, {} as never);
    conn.disconnect();
    await expect(pending).rejects.toThrow("connection closed");
    expect(ws.readyState).toBe(WS_CLOSED);
    expect(store.states.at(-1)).toBe("detached");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);

    // 繋ぎ直しの待ちの途中
    conn.connect();
    await flush();
    sockets[1]!.remoteClose(1006);
    await flush();
    conn.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);

    // /api/session の確認の途中（connect の直後）
    conn.connect();
    conn.disconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);

    conn.connect();
    await flush();
    expect(sockets).toHaveLength(3);
  });

  it("client.detach の後は自動で再接続しない（onConnectionState('detached') を呼ぶ）", async () => {
    const { conn, store, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    const ws = sockets[0]!;
    ws.open();
    ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, result: { clientId: "c1", snapshot: makeSnapshot() } }));

    const p = conn.request("client.detach", {});
    const sent = JSON.parse(ws.sent.at(-1) as string) as { id: string };
    ws.message(JSON.stringify({ id: sent.id, result: {} }));
    await p;
    ws.remoteClose(1000); // サーバがこの応答の直後に close する

    expect(store.states.at(-1)).toBe("detached");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1); // 再接続していない

    // 「再接続」ボタン相当の connect() で再開できる
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(2);
  });

  it("sendInput: 文字列と Uint8Array のどちらも INPUT フレームとして送る", async () => {
    const { conn, sockets } = makeConnection();
    conn.connect();
    await flush();
    expect(sockets).toHaveLength(1);
    const ws = sockets[0]!;
    ws.open();
    const before = ws.sent.length;
    conn.sendInput("p1", "a");
    conn.sendInput("p1", new Uint8Array([0x62]));
    expect(ws.sent.length).toBe(before + 2);
    expect(ws.sent[before]).toBeInstanceOf(Uint8Array);
  });

  it("sendInput: 未接続なら黙って捨てる（例外を投げない）", () => {
    const { conn } = makeConnection();
    expect(() => conn.sendInput("p1", "a")).not.toThrow();
  });

  it("request: 未接続なら reject する", async () => {
    const { conn } = makeConnection();
    await expect(conn.request("pane.focus", { paneId: "p1" })).rejects.toThrow(/not connected/);
  });

  /** hello に答えて `open` にする（テストの前置き）。 */
  function answerHello(ws: FakeWebSocket, clientId: string): void {
    const hello = JSON.parse(ws.sent[0] as string) as { id: string; method: string };
    expect(hello.method).toBe("client.hello");
    ws.message(JSON.stringify({ id: hello.id, result: { clientId, snapshot: makeSnapshot() } }));
  }

  describe("onOpened（D107：新しい接続の hello が通るたびに、表示と購読を張り直す合図）", () => {
    it("hello が通るたびに clientId を渡して呼ぶ（snapshot の適用と open の後）。自動の再接続・connect() の後も呼ぶ", async () => {
      const { conn, store, sockets } = makeConnection();
      const calls: { clientId: string; statesAtCall: ConnectionState[]; snapshotsAtCall: number }[] = [];
      conn.onOpened((clientId) => calls.push({ clientId, statesAtCall: [...store.states], snapshotsAtCall: store.snapshots.length }));
      conn.connect();
      await flush();
      sockets[0]!.open();
      expect(calls).toEqual([]); // socket が開いただけでは呼ばない
      answerHello(sockets[0]!, "c1");
      await flush();
      expect(calls).toEqual([{ clientId: "c1", statesAtCall: ["connecting", "open"], snapshotsAtCall: 1 }]);

      sockets[0]!.remoteClose(1006); // 切断 → 自動の再接続
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      sockets[1]!.open();
      answerHello(sockets[1]!, "c2"); // サーバは接続ごとに新しい clientId を振る
      await flush();
      expect(calls.map((c) => c.clientId)).toEqual(["c1", "c2"]);
    });

    it("hello が失敗した接続では呼ばない。外した listener は呼ばない", async () => {
      const { conn, sockets } = makeConnection();
      const kept = vi.fn();
      const removed = vi.fn();
      conn.onOpened(kept);
      conn.onOpened(removed)();
      conn.connect();
      await flush();
      const ws = sockets[0]!;
      ws.open();
      ws.message(JSON.stringify({ id: JSON.parse(ws.sent[0] as string).id, error: { code: "invalid_params", message: "protocol mismatch" } }));
      await flush();
      expect(kept).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      sockets[1]!.open();
      answerHello(sockets[1]!, "c2");
      await flush();
      expect(kept).toHaveBeenCalledWith("c2");
      expect(removed).not.toHaveBeenCalled();
    });

    it("listener が例外を投げても接続を閉じない（hello の失敗と同じ扱いにして繋ぎ直しを繰り返さない）", async () => {
      const { conn, store, sockets } = makeConnection();
      conn.onOpened(() => {
        throw new Error("listener failed");
      });
      const after = vi.fn();
      conn.onOpened(after);
      conn.connect();
      await flush();
      sockets[0]!.open();
      answerHello(sockets[0]!, "c1");
      // hello の応答の処理（マイクロタスク）だけを片付ける——`flush()` は時計を進め、投げ直しのタイマーまで走らせてしまう。
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(sockets[0]!.readyState).toBe(WS_OPEN);
      expect(store.states.at(-1)).toBe("open");
      expect(after).toHaveBeenCalledWith("c1"); // 後の listener も呼ぶ
      expect(() => vi.runOnlyPendingTimers()).toThrow("listener failed"); // 握りつぶさず、後のタスクで投げ直す
    });
  });

  /** 開く前に閉じる（upgrade が 403 等で断られた。ブラウザからは 1006 にしか見えない）。 */
  function failBeforeOpen(ws: FakeWebSocket): void {
    ws.remoteClose(1006);
  }

  describe("/api/session が 403（D107：Cookie は有効だが、このページのアドレス（Host）をサーバが許可していない。サーバの D106）", () => {
    it("connect の確認で 403 でも /ws を 1 回だけ試し、それも開く前に閉じたら rejected にして、自動では繋ぎ直さない", async () => {
      const fetchImpl = makeFetch({ session: 403, login: 204, logout: 204 });
      const { conn, store, sockets } = makeConnection({ fetchImpl });
      conn.connect();
      await flush();
      expect(sockets).toHaveLength(1); // 403 でも試す
      failBeforeOpen(sockets[0]!);
      expect(store.states).toEqual(["connecting", "rejected"]);
      expect(store.authRequiredCount).toBe(0); // ログイン画面へは戻さない（Cookie は有効）
      await vi.advanceTimersByTimeAsync(120_000);
      expect(sockets).toHaveLength(1);
      expect((fetchImpl as unknown as { calls: string[] }).calls).toEqual(["GET http://example.test/api/session"]);
    });

    it("connect の確認で 403 でも、/ws が開けばそのまま繋ぐ（前段のプロキシが Host を許可外の名前に書き換え、--origin は正しい構成。/ws は Origin で許す）", async () => {
      const fetchImpl = makeFetch({ session: 403, login: 204, logout: 204 });
      const { conn, store, sockets } = makeConnection({ fetchImpl });
      conn.connect();
      await flush();
      sockets[0]!.open();
      answerHello(sockets[0]!, "c1");
      await flush();
      expect(store.states).toEqual(["connecting", "open"]);

      // 切断されても、確認の 403 の後に /ws を試して繋ぎ直す（rejected にしない）。
      sockets[0]!.remoteClose(1006);
      await flush();
      expect(store.states.at(-1)).toBe("reconnecting");
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(2);
      sockets[1]!.open();
      answerHello(sockets[1]!, "c2");
      await flush();
      expect(store.states).not.toContain("rejected");
      expect(store.states.at(-1)).toBe("open");
    });

    it("切断の後の確認で 403 なら、次の試みで /ws を 1 回だけ試し、それも開く前に閉じたら rejected。「再試行」（connect()）で確かめ直し、許可されていれば繋ぐ", async () => {
      const status = { session: 204, login: 204, logout: 204 };
      const fetchImpl = makeFetch(status);
      const { conn, store, sockets } = makeConnection({ fetchImpl });
      conn.connect();
      await flush();
      sockets[0]!.open();
      answerHello(sockets[0]!, "c1");
      await flush();

      status.session = 403; // `--origin` を付けずにサーバが起動し直された
      sockets[0]!.remoteClose(1006);
      expect(store.states.at(-1)).toBe("reconnecting");
      await flush();
      expect(store.states.at(-1)).toBe("reconnecting"); // まだ決めない：/ws を試す
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(2);
      failBeforeOpen(sockets[1]!);
      expect(store.states.at(-1)).toBe("rejected");
      await vi.advanceTimersByTimeAsync(120_000);
      expect(sockets).toHaveLength(2); // 黙って繋ぎ直し続けない
      const sessionChecks = (fetchImpl as unknown as { calls: string[] }).calls.filter((c) => c.endsWith("/api/session")).length;
      expect(sessionChecks).toBe(2); // 最初の接続の前と、切断の後の 1 回だけ

      conn.connect(); // 「再試行」：まだ許可されていない
      await flush();
      expect(sockets).toHaveLength(3);
      failBeforeOpen(sockets[2]!);
      expect(store.states.slice(-2)).toEqual(["connecting", "rejected"]);

      status.session = 204; // `--origin` を付けて起動し直した
      conn.connect();
      await flush();
      expect(sockets).toHaveLength(4);
      sockets[3]!.open();
      answerHello(sockets[3]!, "c2");
      await flush();
      expect(store.states.at(-1)).toBe("open");
    });

    it("403 の後の試みが開いてから閉じた（hello の失敗等）なら rejected にせず、従来どおり繋ぎ直す", async () => {
      const fetchImpl = makeFetch({ session: 403, login: 204, logout: 204 });
      const { conn, store, sockets } = makeConnection({ fetchImpl });
      conn.connect();
      await flush();
      sockets[0]!.open();
      sockets[0]!.remoteClose(1006); // 開いた後に閉じた
      await flush();
      expect(store.states).not.toContain("rejected");
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(2);
    });

    it("403 以外の失敗（500・通信の失敗）は従来どおり繋ぎ直す", async () => {
      for (const failure of ["500", "network"] as const) {
        const status = { session: 204, login: 204, logout: 204 };
        const base = makeFetch(status);
        let failing = false;
        const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
          if (failing && failure === "network") throw new TypeError("Failed to fetch");
          return base(url, init);
        }) as unknown as typeof fetch;
        const { conn, store, sockets } = makeConnection({ fetchImpl });
        conn.connect();
        await flush();
        sockets[0]!.open();
        answerHello(sockets[0]!, "c1");
        await flush();

        failing = true;
        if (failure === "500") status.session = 500;
        sockets[0]!.remoteClose(1006);
        await flush();
        expect(store.states.at(-1)).toBe("reconnecting");
        await vi.advanceTimersByTimeAsync(1000);
        expect(sockets).toHaveLength(2);
        failBeforeOpen(sockets[1]!);
        await flush();
        expect(store.states.at(-1)).toBe("reconnecting");
      }
    });
  });

  /**
   * D107（独立点検 #1）：`/api/session` は 204（Host で見る）なのに `/ws`（Origin で見る）だけが 403 になる構成——前段のプロキシが
   * Host を許可内の `127.0.0.1:7780` で渡し、ページの Origin（`https://soda.example.com`）が許可されていない（`--origin` を付けずに
   * 起動し直した）。ブラウザは upgrade の状態コードを見られないので、1006 → 204 → 繋ぎ直し、を理由を示さず繰り返していた。
   */
  describe("/api/session は 204 なのに /ws が開く前に閉じる試みが続く（D107）", () => {
    async function openThenDrop(conn: Connection, sockets: FakeWebSocket[]): Promise<void> {
      conn.connect();
      await flush();
      sockets[0]!.open();
      answerHello(sockets[0]!, "c1");
      await flush();
      sockets[0]!.remoteClose(1006);
      await flush();
    }

    it("3 回続いたら手がかりを出す（1 回だけ）。繋ぎ直しは続け、開けたら手がかりを下ろして数え直す", async () => {
      const { conn, store, sockets } = makeConnection();
      await openThenDrop(conn, sockets); // 開いていた接続が切れた分は数えない
      expect(store.originSuspected).toEqual([]);

      const delays = [1000, 2000, 4000, 8000];
      for (let i = 0; i < delays.length; i++) {
        await vi.advanceTimersByTimeAsync(delays[i]!);
        expect(sockets).toHaveLength(i + 2); // 繋ぎ直しは続ける
        failBeforeOpen(sockets.at(-1)!);
        await flush();
        expect(store.originSuspected).toEqual(i + 1 >= 3 ? [true] : []); // 3 回目で 1 回だけ
        expect(store.states.at(-1)).toBe("reconnecting");
      }

      await vi.advanceTimersByTimeAsync(16_000);
      sockets.at(-1)!.open(); // `--origin` を付けて起動し直した
      expect(store.originSuspected).toEqual([true, false]);
      answerHello(sockets.at(-1)!, "c2");
      await flush();

      // 数え直している：次に切れても、また 3 回続くまでは出さない。
      sockets.at(-1)!.remoteClose(1006);
      await flush();
      for (const delay of [1000, 2000]) {
        await vi.advanceTimersByTimeAsync(delay);
        failBeforeOpen(sockets.at(-1)!);
        await flush();
      }
      expect(store.originSuspected).toEqual([true, false]);
    });

    it("開いてから閉じた試み・/api/session が通らない試み（サーバが止まっている等）は数えない", async () => {
      const status = { session: 204, login: 204, logout: 204 };
      const { conn, store, sockets } = makeConnection({ fetchImpl: makeFetch(status) });
      await openThenDrop(conn, sockets);
      for (const delay of [1000, 1000, 1000]) {
        await vi.advanceTimersByTimeAsync(delay);
        sockets.at(-1)!.open(); // 開いたが hello の前に切れた（backoff も 1 秒に戻る）
        sockets.at(-1)!.remoteClose(1006);
        await flush();
      }
      expect(store.originSuspected).toEqual([]);

      status.session = 500;
      for (const delay of [1000, 2000, 4000]) {
        await vi.advanceTimersByTimeAsync(delay);
        failBeforeOpen(sockets.at(-1)!);
        await flush();
      }
      expect(store.originSuspected).toEqual([]);
    });

    it("「再接続」等の connect() は数え直し、出ていた手がかりを下ろす", async () => {
      const { conn, store, sockets } = makeConnection();
      await openThenDrop(conn, sockets);
      for (const delay of [1000, 2000, 4000]) {
        await vi.advanceTimersByTimeAsync(delay);
        failBeforeOpen(sockets.at(-1)!);
        await flush();
      }
      expect(store.originSuspected).toEqual([true]);
      conn.connect();
      expect(store.originSuspected).toEqual([true, false]);
    });
  });

  describe("onClosed（D107：閉じてから次の hello までは ViewSync が何も送らない）", () => {
    it("開けた接続が閉じたとき・開く前に閉じた試みのどちらでも呼ぶ（hello の前に閉じた接続でも）", async () => {
      const { conn, sockets } = makeConnection();
      const closed = vi.fn();
      conn.onClosed(closed);
      conn.connect();
      await flush();
      sockets[0]!.open();
      sockets[0]!.remoteClose(1006); // hello の前に閉じた
      expect(closed).toHaveBeenCalledTimes(1);
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      failBeforeOpen(sockets[1]!);
      expect(closed).toHaveBeenCalledTimes(2);
    });
  });
});
