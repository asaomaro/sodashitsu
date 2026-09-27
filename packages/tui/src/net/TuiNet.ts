import type { ServerEvent, SessionSnapshot } from "@sodashitsu/protocol";
import {
  Connection,
  type ConnectionState,
  type StorePort,
  type TerminalSinkPort,
  type WebSocketLike,
} from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { TuiTarget } from "../types.js";
import {
  CertificateMismatchError,
  lacksPin,
  MissingCertificatePinError,
  nodeFetch,
  nodeWebSocketFactory,
  wsUrlOf,
  type Endpoint,
} from "./nodeTransport.js";

export interface TuiNetHandlers {
  model: SessionModel;
  sink: TerminalSinkPort;
  onState(s: ConnectionState): void;
  /** 新しい接続で hello が通った（表示と購読を張り直す）。 */
  onOpened(clientId: string): void;
  onClosed(): void;
  /** 立て直せない（ログインの拒否・サーバの停止・証明書の不一致）。端末版を終了コード 1 で終える。 */
  onFatal(message: string): void;
}

export interface TuiNetDeps {
  /** 時計（テスト用）。 */
  now?: () => number;
  createWebSocket?: (ep: Endpoint) => (url: string) => WebSocketLike;
  fetchImpl?: (ep: Endpoint) => typeof fetch;
}

/** 再接続中にサーバが生きているかを確かめ直す間隔。 */
export const PROBE_INTERVAL_MS = 10_000;

/** 認証を求められて再ログインしても、開けないまま続いたら諦める回数。 */
const MAX_RELOGIN_WITHOUT_OPEN = 3;

/**
 * 端末版の接続（20260927-cli-mode の design「net/」）。client-core の `Connection` に `ws` を注入し（`kind: "desktop"`）、
 * 401/4401 で `target.login()` → 繋ぎ直す。再接続の途中でログインもできなければサーバが止まったとみなす（design「起動と終了」：
 * 自動で起動し直さない。止めたのは利用者の意思のことがある）。
 */
export class TuiNet implements StorePort {
  readonly conn: Connection;
  private cookie = "";
  private reloginInFlight = false;
  private reloginsWithoutOpen = 0;
  /** 再接続中に、サーバが生きているかをログインで最後に確かめた時刻（開けたら null）。長い停止の間も間隔を空けて確かめ直す。 */
  private lastProbeAt: number | null = null;
  private probing = false;
  private stopped = false;
  private detachSent = false;
  private loggedOut = false;
  /** 終えた後も使える（止めた後の決着しない要求の包みを通さない）fetch。`/api/logout` に使う。 */
  private readonly rawFetch: typeof fetch;

  private readonly now: () => number;

  constructor(
    private readonly target: TuiTarget,
    private readonly h: TuiNetHandlers,
    deps: TuiNetDeps = {},
  ) {
    this.now = deps.now ?? (() => Date.now());
    const ep: Endpoint = {
      baseUrl: target.baseUrl,
      origin: target.origin,
      certSha256: target.certSha256,
      cookie: () => this.cookie,
    };
    const baseFetch = (deps.fetchImpl ?? nodeFetch)(ep);
    this.rawFetch = baseFetch;
    const baseCreate = (deps.createWebSocket ?? nodeWebSocketFactory)(ep);
    const fetchImpl: typeof fetch = async (input, init) => {
      // 終えた後は何も始めない（`Connection` には止める口が無いので、決着しない要求で再接続の連鎖を止める）。
      if (this.stopped) return new Promise<Response>(() => undefined);
      try {
        return await baseFetch(input, init);
      } catch (err) {
        if (err instanceof CertificateMismatchError) this.fatal(`soda: ${err.message}\n`);
        throw err;
      }
    };
    this.conn = new Connection({
      kind: "desktop",
      httpOrigin: target.baseUrl.replace(/\/$/, ""),
      wsUrl: wsUrlOf(target.baseUrl),
      store: this,
      sink: h.sink,
      fetchImpl,
      createWebSocket: (url) => {
        if (this.stopped) return idleSocket();
        try {
          return baseCreate(url);
        } catch (err) {
          // 同期の失敗（https なのに指紋が無い等）を `Connection` のタイマーの中で投げさせない。
          this.fatal(`soda: ${err instanceof Error ? err.message : String(err)}\n`);
          return idleSocket();
        }
      },
    });
    this.conn.onOpened((clientId) => {
      this.reloginsWithoutOpen = 0;
      this.lastProbeAt = null;
      h.onOpened(clientId);
    });
    this.conn.onClosed(() => h.onClosed());
  }

  /** 最初のログイン → 接続。 */
  async start(): Promise<void> {
    if (lacksPin(this.target)) {
      this.fatal(`soda: ${new MissingCertificatePinError().message}\n`);
      return;
    }
    try {
      this.cookie = await this.target.login();
    } catch (err) {
      this.fatal(
        `soda: could not log in to the local server: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return;
    }
    if (!this.stopped) this.conn.connect();
  }

  /** 以後は何もしない（終了の後始末）。開いている接続は閉じてもらう（`client.detach`。以後は自動で繋ぎ直さない）。 */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    // 切り離し（`detach`）で送った後なら送り直さない。
    if (!this.detachSent) this.conn.request("client.detach", {}).catch(() => undefined);
  }

  // --- StorePort ---

  applySnapshot(s: SessionSnapshot, clientId: string): void {
    this.h.model.applySnapshot(s, clientId);
  }

  applyEvent(e: ServerEvent): void {
    this.h.model.applyEvent(e);
  }

  onAuthRequired(): void {
    void this.relogin();
  }

  onConnectionState(s: ConnectionState): void {
    if (this.stopped) return;
    this.h.onState(s);
    if (s === "reconnecting") this.probeServer();
  }

  /**
   * 再接続中に、サーバが生きているかをログインで確かめる（サーバが止まると秘密のファイルが消えてログインできなくなる）。ログインできれば
   * cookie を新しくして繋ぎ直しを続ける。**停止が長引いても `PROBE_INTERVAL_MS` ごとに確かめ直す**（`Connection` は試みのたびに
   * `reconnecting` を知らせる）——1 回目の確かめの後にサーバが止まっても「再接続中」のまま残らない。
   */
  private probeServer(): void {
    const now = this.now();
    if (this.probing || (this.lastProbeAt !== null && now - this.lastProbeAt < PROBE_INTERVAL_MS))
      return;
    this.probing = true;
    this.lastProbeAt = now;
    this.target.login().then(
      (cookie) => {
        this.probing = false;
        this.cookie = cookie;
      },
      () => {
        this.probing = false;
        this.fatal("soda: the server has stopped (run `soda` again to start it)\n");
      },
    );
  }

  onOriginRejectSuspected(): void {
    // 手元のループバックへの接続なので Origin の拒否は起きない（findOrStart が通る Origin を渡す）。
  }

  private async relogin(): Promise<void> {
    if (this.reloginInFlight || this.stopped) return;
    this.reloginInFlight = true;
    try {
      if (++this.reloginsWithoutOpen > MAX_RELOGIN_WITHOUT_OPEN) {
        this.fatal("soda: the server keeps refusing the local login\n");
        return;
      }
      this.cookie = await this.target.login();
      if (!this.stopped) this.conn.connect();
    } catch (err) {
      this.fatal(
        `soda: could not log in again: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      this.reloginInFlight = false;
    }
  }

  /** `client.detach` を送り、サーバが閉じるのを待つ（最大 `timeoutMs`）。 */
  /**
   * セッションを返す（`POST /api/logout`。起動のたびにサーバのセッションが増えないように。02 の review ラウンド 2）。切り離し・終了のたびに呼ぶ。
   * 失敗（サーバが止まっている等）は気にしない。最大 `timeoutMs` 待つ。
   */
  async logout(timeoutMs = 1500): Promise<void> {
    if (this.cookie === "" || this.loggedOut) return;
    this.loggedOut = true;
    const url = `${this.target.baseUrl.replace(/\/$/, "")}/api/logout`;
    await Promise.race([
      this.rawFetch(url, { method: "POST" }).then(
        () => undefined,
        () => undefined,
      ),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]);
  }

  async detach(timeoutMs = 1000): Promise<void> {
    this.detachSent = true;
    await Promise.race([
      this.conn.request("client.detach", {}).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]);
  }

  private fatal(message: string): void {
    if (this.stopped) return;
    this.stop();
    this.h.onFatal(message);
  }
}

/** 開きも閉じもしない socket（終えた後の再接続の試みを、タイマーも接続も残さずに止める）。 */
function idleSocket(): WebSocketLike {
  return {
    readyState: 0,
    send: () => undefined,
    close: () => undefined,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
}
