import type { ServerEvent, SessionSnapshot } from "@wtm/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, type WebSocketLike } from "./Connection.js";
import type { ConnectionState, StorePort, TerminalSinkPort } from "./ports.js";

/** `Connection.retarget`（20260927-multi-host-machines の T11）。行き先の切り替えで、前の行き先のメッセージを混ぜず、待たずに開き直す。 */
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

class FakeWebSocket implements WebSocketLike {
  readyState = WS_CONNECTING;
  sent: (string | Uint8Array)[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }
  /** 実物と同じく close() は閉じる途中（CLOSING）にするだけで、close イベントは後で来る。 */
  close(): void {
    if (this.readyState === WS_CLOSED || this.readyState === WS_CLOSING) return;
    this.readyState = WS_CLOSING;
  }
  finishClose(code = 1000): void {
    this.readyState = WS_CLOSED;
    this.onclose?.({ code });
  }
  open(): void {
    this.readyState = WS_OPEN;
    this.onopen?.();
  }
  message(data: unknown): void {
    this.onmessage?.({ data });
  }
  helloId(): string {
    return (JSON.parse(this.sent[0] as string) as { id: string }).id;
  }
}

const snapshot = (hostname: string): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname },
  workspaces: [],
  tabs: [],
  panes: [],
  groups: [],
  focus: null,
  limits: { scrollbackLines: 5000 },
});

function setup() {
  const states: ConnectionState[] = [];
  const snapshots: string[] = [];
  const events: ServerEvent[] = [];
  const store: StorePort = {
    applySnapshot: (s) => snapshots.push(s.host.hostname),
    applyEvent: (e) => events.push(e),
    onAuthRequired: () => undefined,
    onConnectionState: (s) => states.push(s),
    onOriginRejectSuspected: () => undefined,
  };
  const sink: TerminalSinkPort = {
    onOutput: () => undefined,
    onSnapshot: () => undefined,
    onSizeChanged: () => undefined,
  };
  const sockets: FakeWebSocket[] = [];
  let sessionResolvers: (() => void)[] = [];
  let holdSession = false;
  const fetchImpl = (async () => {
    if (holdSession) await new Promise<void>((r) => sessionResolvers.push(r));
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  const conn = new Connection({
    kind: "desktop",
    httpOrigin: "http://example.test",
    wsUrl: "ws://example.test/ws",
    store,
    sink,
    fetchImpl,
    createWebSocket: (url) => {
      const ws = new FakeWebSocket(url);
      sockets.push(ws);
      return ws;
    },
  });
  return {
    conn,
    states,
    snapshots,
    events,
    sockets,
    hold: (v: boolean) => {
      holdSession = v;
    },
    releaseSession: () => {
      const rs = sessionResolvers;
      sessionResolvers = [];
      for (const r of rs) r();
    },
  };
}

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

async function openWith(ws: FakeWebSocket, hostname: string): Promise<void> {
  ws.open();
  ws.message(
    JSON.stringify({ id: ws.helloId(), result: { clientId: "c", snapshot: snapshot(hostname) } }),
  );
  await flush();
}

describe("Connection.retarget（T11）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("開いている接続を閉じ、閉じたら待たずに新しい行き先へ開く。前の行き先の遅れたメッセージは捨てる", async () => {
    const t = setup();
    t.conn.connect();
    await flush();
    await openWith(t.sockets[0]!, "local");
    t.conn.retarget("ws://example.test/ws?machine=abc");
    expect(t.states.at(-1)).toBe("connecting");
    t.sockets[0]!.message(
      JSON.stringify({ event: "workspace.closed", data: { workspaceId: "w1" } }),
    ); // 閉じる途中に届いた
    expect(t.events).toEqual([]);
    t.sockets[0]!.finishClose(1000);
    await flush();
    expect(t.sockets).toHaveLength(2);
    expect(t.sockets[1]!.url).toBe("ws://example.test/ws?machine=abc");
    expect(t.states.at(-1)).toBe("connecting"); // reconnecting（待ち）にしない
    await openWith(t.sockets[1]!, "remote");
    expect(t.snapshots).toEqual(["local", "remote"]);
    expect(t.states.at(-1)).toBe("open");
  });

  it("閉じ終える前にもう一度替えたら、最後の行き先だけを開く", async () => {
    const t = setup();
    t.conn.connect();
    await flush();
    await openWith(t.sockets[0]!, "local");
    t.conn.retarget("ws://x/ws?machine=a");
    t.conn.retarget("ws://x/ws?machine=b");
    t.sockets[0]!.finishClose();
    await flush();
    expect(t.sockets.map((s) => s.url)).toEqual(["ws://example.test/ws", "ws://x/ws?machine=b"]);
  });

  it("/api/session の確認を待つ間に替えたら、前の確認では開かない（socket を 2 本開かない）", async () => {
    const t = setup();
    t.hold(true);
    t.conn.connect();
    await flush();
    t.conn.retarget("ws://x/ws?machine=a");
    await flush();
    t.releaseSession();
    await flush();
    expect(t.sockets.map((s) => s.url)).toEqual(["ws://x/ws?machine=a"]);
  });

  it("再接続の待ちの間に替えたら、待ちを取り消してすぐ新しい行き先へ", async () => {
    const t = setup();
    t.conn.connect();
    await flush();
    await openWith(t.sockets[0]!, "local");
    t.sockets[0]!.finishClose(1006); // 切れた → 1 秒後に繋ぎ直す予定
    await flush();
    t.conn.retarget("ws://x/ws?machine=a");
    await flush();
    expect(t.sockets.map((s) => s.url)).toEqual(["ws://example.test/ws", "ws://x/ws?machine=a"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sockets).toHaveLength(2); // 前の待ちで開かない
  });

  it("新しい行き先が断られたら（開く前に閉じた）、今までどおり間隔を空けて同じ行き先へ繋ぎ直す", async () => {
    const t = setup();
    t.conn.retarget("ws://x/ws?machine=a");
    await flush();
    t.sockets[0]!.finishClose(1006);
    await flush();
    expect(t.states.at(-1)).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sockets.map((s) => s.url)).toEqual(["ws://x/ws?machine=a", "ws://x/ws?machine=a"]);
  });

  it("閉じる途中（hello の失敗の後等）の socket でも、その close を待ってから新しい行き先へ 1 本だけ開く", async () => {
    const t = setup();
    t.conn.connect();
    await flush();
    const old = t.sockets[0]!;
    await openWith(old, "local");
    old.close(); // サーバが閉じ始めた等で CLOSING
    t.conn.retarget("ws://x/ws?machine=a");
    old.message(JSON.stringify({ event: "workspace.closed", data: { workspaceId: "w1" } }));
    await flush();
    expect(t.sockets).toHaveLength(1); // まだ開かない
    old.finishClose(1006);
    await flush();
    expect(t.sockets.map((s) => s.url)).toEqual(["ws://example.test/ws", "ws://x/ws?machine=a"]);
    await openWith(t.sockets[1]!, "remote");
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.sockets).toHaveLength(2);
    expect(t.events).toEqual([]);
    expect(t.states.at(-1)).toBe("open");
  });
});
