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
  createWebSocket?: (ep: Endpoint) => (url: string) => WebSocketLike;
  fetchImpl?: (ep: Endpoint) => typeof fetch;
}

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
  /** 今の「再接続中」の間に、サーバが生きているかをログインで確かめたか。 */
  private probedThisOutage = false;
  private stopped = false;

  constructor(
    private readonly target: TuiTarget,
    private readonly h: TuiNetHandlers,
    deps: TuiNetDeps = {},
  ) {
    const ep: Endpoint = {
      baseUrl: target.baseUrl,
      origin: target.origin,
      certSha256: target.certSha256,
      cookie: () => this.cookie,
    };
    const baseFetch = (deps.fetchImpl ?? nodeFetch)(ep);
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
      createWebSocket: (url) => (this.stopped ? idleSocket() : baseCreate(url)),
    });
    this.conn.onOpened((clientId) => {
      this.reloginsWithoutOpen = 0;
      this.probedThisOutage = false;
      h.onOpened(clientId);
    });
    this.conn.onClosed(() => h.onClosed());
  }

  /** 最初のログイン → 接続。 */
  async start(): Promise<void> {
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
    this.conn.request("client.detach", {}).catch(() => undefined);
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
    if (s === "reconnecting" && !this.probedThisOutage) {
      this.probedThisOutage = true;
      // サーバが止まると秘密のファイルが消えてログインできなくなる。ログインできれば cookie を新しくして繋ぎ直しを続ける。
      this.target.login().then(
        (cookie) => {
          this.cookie = cookie;
        },
        () => this.fatal("soda: the server has stopped (run `soda` again to start it)\n"),
      );
    }
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
  async detach(timeoutMs = 1000): Promise<void> {
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
