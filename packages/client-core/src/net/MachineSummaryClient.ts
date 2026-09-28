import type { MethodName, ParamsOf, ResultOf, ServerEvent, SessionSnapshot } from "@sodashitsu/protocol";
import type { WebSocketLike } from "./Connection.js";

/**
 * 選んでいないマシンの**軽い接続**（20260927-multi-host-machines の design「web」）。`client.hello` を `kind: "external"`（大きさの権限を取らない）で送り、
 * snapshot とイベントだけを受ける。**購読・表示・入力は送らない**（選んでいないマシンは画面を流さない。AC9）。閉じたら 1 秒から倍々（最大 30 秒）で
 * 繋ぎ直す。認証は手元の Cookie（ブラウザが付ける）。pinia を知らない（コールバックで渡す。architecture の境界）。
 */
export interface MachineSummaryClientOptions {
  wsUrl: string;
  onSnapshot(snapshot: SessionSnapshot): void;
  onEvent(event: ServerEvent): void;
  onConnected(connected: boolean): void;
  /** hello を済ませた直後（ローカルの軽い接続が `machine.list` を送る口）。 */
  onOpened?(): void;
  createWebSocket?: (url: string) => WebSocketLike;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (h: unknown) => void;
}

const WS_OPEN = 1;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export class MachineSummaryClient {
  private ws: WebSocketLike | null = null;
  private stopped = false;
  private connected = false;
  private attempt = 0;
  private timer: unknown = null;
  private nextId = 1;
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly createWebSocket: (url: string) => WebSocketLike;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (h: unknown) => void;

  constructor(private readonly opts: MachineSummaryClientOptions) {
    this.createWebSocket =
      opts.createWebSocket ??
      ((url) => {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        return ws as unknown as WebSocketLike;
      });
    this.setT = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** 繋ぎ始める。既に繋いでいる・繋ぎ直しを待っているなら何もしない（socket を 2 本開かない）。 */
  start(): void {
    this.stopped = false;
    if (this.ws !== null || this.timer !== null) return;
    this.open();
  }

  /** 閉じて、繋ぎ直さない（繋がっていたなら `onConnected(false)` を知らせる）。 */
  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearT(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onmessage = null;
      ws.onclose = null;
      ws.close(1000, "done");
    }
    this.failPending();
    if (this.connected) {
      this.connected = false;
      this.opts.onConnected(false);
    }
  }

  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN)
      return Promise.reject(new Error(`not connected (method=${method})`));
    const id = String(this.nextId++);
    return new Promise<ResultOf<M>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private open(): void {
    if (this.stopped) return;
    const ws = this.createWebSocket(this.opts.wsUrl);
    this.ws = ws;
    let closed = false;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.request("client.hello", { protocol: 1, kind: "external" }).then(
        (r) => {
          if (this.ws !== ws) return;
          this.attempt = 0;
          this.connected = true;
          // 受け取った側の例外で接続を閉じ直す輪に入らない（握りつぶさず、後で投げ直して見えるようにする。`Connection.notifyOpened` と同じ）。
          try {
            this.opts.onSnapshot(r.snapshot);
            this.opts.onConnected(true);
            this.opts.onOpened?.();
          } catch (err) {
            setTimeout(() => {
              throw err;
            }, 0);
          }
        },
        () => ws.close(),
      );
    };
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = () => undefined;
    ws.onclose = () => {
      if (closed) return;
      closed = true;
      if (this.ws !== ws) return;
      this.ws = null;
      this.failPending();
      this.connected = false;
      this.opts.onConnected(false);
      if (this.stopped) return;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.attempt);
      this.attempt++;
      this.timer = this.setT(() => {
        this.timer = null;
        this.open();
      }, delay);
    };
  }

  private onMessage(data: unknown): void {
    if (typeof data !== "string") return; // 画面の枠は来ない（購読しない）。来ても捨てる
    let msg: unknown;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as {
      id?: unknown;
      result?: unknown;
      error?: { code: string; message: string };
      event?: unknown;
    };
    if (typeof m.id === "string") {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error)
        p.reject(
          Object.assign(new Error(`${m.error.code}: ${m.error.message}`), { code: m.error.code }),
        );
      else p.resolve(m.result);
      return;
    }
    if (typeof m.event === "string") this.opts.onEvent(msg as ServerEvent);
  }

  private failPending(): void {
    const err = new Error("connection closed");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
