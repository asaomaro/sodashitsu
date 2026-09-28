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
  /** 立て直している途中の知らせ（サーバは居るがログインできない等）。 */
  onStatus?(message: string): void;
  /** 利用者が止めたサーバ（`expectStop` の後）が居なくなった。端末版を終了コード 0 で終える。 */
  onStopped?(): void;
}

export interface TuiNetDeps {
  /** 待ち（テスト用）。 */
  sleep?: (ms: number) => Promise<void>;
  /** 時計（テスト用）。 */
  now?: () => number;
  createWebSocket?: (ep: Endpoint) => (url: string) => WebSocketLike;
  fetchImpl?: (ep: Endpoint) => typeof fetch;
}

/** 再接続中にサーバが生きているかを確かめ直す間隔。 */
export const PROBE_INTERVAL_MS = 10_000;

/** サーバは居るのにログインできない状態が、これだけ続いたら終える。 */
export const LOGIN_FAIL_LIMIT_MS = 30_000;

/** ログインできないがサーバは居るとき、ログインをやり直すまでの間。 */
export const RELOGIN_RETRY_MS = 2_000;

/** サーバが居ないと見えてから、もう一度確かめるまでの間（handoff の入れ替えの空白を越える）。 */
export const SERVER_GONE_GRACE_MS = 5_000;

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
  /** サーバは居るのにログインできない状態が始まった時刻（ログインできたら null）。 */
  private loginFailingSince: number | null = null;
  private stopped = false;
  /** 利用者がこのサーバを止めた（`server.stop` が通った）。この後に居なくなったのは異常ではない。 */
  private stopExpected = false;
  private detachSent = false;
  private loggedOut = false;
  /** 終えた後も使える（止めた後の決着しない要求の包みを通さない）fetch。`/api/logout` に使う。 */
  private readonly rawFetch: typeof fetch;
  /** 決まった cookie で送る fetch（入れ替えた古い cookie のログアウト）。 */
  private readonly fetchWithCookie: (cookie: string) => typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly socketFactory: (url: string) => WebSocketLike;

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
    const fetchFactory = deps.fetchImpl ?? nodeFetch;
    const baseFetch = fetchFactory(ep);
    this.rawFetch = baseFetch;
    this.fetchWithCookie = (cookie) => fetchFactory({ ...ep, cookie: () => cookie });
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms).unref?.()));
    const baseCreate = (deps.createWebSocket ?? nodeWebSocketFactory)(ep);
    this.socketFactory = (url) => (this.stopped ? idleSocket() : baseCreate(url));
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

  /** 手元の `soda serve` の `/ws`（マシンの切り替え・要約の接続の行き先の土台）。 */
  get baseWsUrl(): string {
    return wsUrlOf(this.target.baseUrl);
  }

  /**
   * 画面の接続と同じ Cookie・Origin・指紋の照合で WebSocket を開く（選んでいないマシンの要約の接続。web の MachineSummaryClient）。
   * 作るときに投げても（指紋の食い違い等）すぐ閉じる socket を返す（要約の接続が時間をおいて繋ぎ直す）。4401（ログインが無効）で閉じたら
   * cookie を取り直す（画面の接続はそのまま。次に繋ぐときから新しい cookie）。
   */
  createSocket(url: string): WebSocketLike {
    let ws: WebSocketLike;
    try {
      ws = this.socketFactory(url);
    } catch {
      return closedSocket();
    }
    return withCloseHook(ws, (code) => {
      if (code === 4401) void this.refreshCookie();
    });
  }

  private refreshing = false;
  private lastRefreshAt = -Infinity;

  /** 要約の接続が 4401 で閉じた：ログインし直して cookie を替える（画面の接続は触らない。5 秒に 1 回まで）。 */
  private async refreshCookie(): Promise<void> {
    const now = this.now();
    if (this.refreshing || this.stopped || now - this.lastRefreshAt < RELOGIN_RETRY_MS * 2.5)
      return;
    this.refreshing = true;
    this.lastRefreshAt = now;
    try {
      const cookie = await this.target.login();
      if (this.stopped) return;
      const old = this.cookie;
      this.cookie = cookie;
      if (old !== "" && old !== cookie) void this.logoutCookie(old);
    } catch {
      // 取り直せなければ、画面の接続の再ログイン（`onAuthRequired`）に任せる。
    } finally {
      this.refreshing = false;
    }
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
   * 再接続中に、サーバが生きているかを確かめる。**停止が長引いても `PROBE_INTERVAL_MS` ごとに確かめ直す**（`Connection` は試みのたびに
   * `reconnecting` を知らせる）。
   * 1. 今の cookie がまだ通れば（`/api/session` が 204）、何も作らずに繋ぎ直しを続ける（セッションを増やさない）。
   * 2. 通らなければログインし直す。cookie が替わったら古いものはログアウトする。
   * 3. ログインもできなければ、**サーバが本当に居ないか**を `target.isServerAlive()`（状態ディレクトリのロックの持ち主・`serve.json`・`local-auth.json`）で
   *    確かめ、居ないままなら少し置いてもう一度確かめてから終える（`soda handoff` の入れ替えの間・起動の途中は居るとみなして繋ぎ直しを続ける）。
   */
  private probeServer(): void {
    const now = this.now();
    if (this.probing || (this.lastProbeAt !== null && now - this.lastProbeAt < PROBE_INTERVAL_MS))
      return;
    this.probing = true;
    this.lastProbeAt = now;
    void this.probe().finally(() => {
      this.probing = false;
    });
  }

  private async probe(): Promise<void> {
    if (await this.sessionAccepted()) return;
    try {
      const cookie = await this.target.login();
      if (this.stopped) return;
      const old = this.cookie;
      this.cookie = cookie;
      if (old !== "" && old !== cookie) void this.logoutCookie(old);
      this.loginFailingSince = null;
      return;
    } catch (err) {
      if (this.stopped) return;
      if (await this.serverGone()) {
        if (this.stopExpected && this.h.onStopped) {
          // 利用者が止めた（`server.stop`）。異常ではないので fatal の道（終了コード 1）を通らない（統合の review）。
          this.stop();
          this.h.onStopped();
          return;
        }
        this.fatal("soda: the server has stopped (run `soda` again to start it)\n");
        return;
      }
      this.noteLoginFailure(err);
    }
  }

  /**
   * サーバは居るのにログインできない（別のポートで起動し直された・`local-auth.json` が読めない等）。知らせながらやり直し、
   * `LOGIN_FAIL_LIMIT_MS` 続いたら理由を添えて終える（再接続中のまま残さない。03 の review）。
   */
  private noteLoginFailure(err: unknown): void {
    const now = this.now();
    this.loginFailingSince ??= now;
    const reason = err instanceof Error ? err.message : String(err);
    if (now - this.loginFailingSince >= LOGIN_FAIL_LIMIT_MS) {
      this.fatal(`soda: サーバは動いていますが、手元からログインできません: ${reason}\n`);
      return;
    }
    this.h.onStatus?.("サーバは動いていますが、手元からログインできません。やり直しています…");
  }

  /** 今の cookie でサーバがまだ受け付けるか（`GET /api/session` が 204）。届かなければ false。 */
  private async sessionAccepted(): Promise<boolean> {
    if (this.cookie === "") return false;
    try {
      const res = await this.rawFetch(`${this.target.baseUrl.replace(/\/$/, "")}/api/session`);
      return res.status === 204;
    } catch {
      return false;
    }
  }

  /**
   * サーバが居ないか。`isServerAlive` を持たない繋ぎ先（テスト・古い呼び出し元）はログインの失敗をそのまま「居ない」とみなす。居ないと見えても
   * `SERVER_GONE_GRACE_MS` 置いてもう一度確かめる（handoff の入れ替えの間の空白）。確かめる手段の失敗は「居る」側に倒す（勝手に終わらない）。
   */
  private async serverGone(): Promise<boolean> {
    const alive = this.target.isServerAlive;
    if (!alive) return true;
    const check = (): Promise<boolean> => alive.call(this.target).catch(() => true);
    if (await check()) return false;
    await this.sleep(SERVER_GONE_GRACE_MS);
    if (this.stopped) return false;
    return !(await check());
  }

  /** 入れ替えた古い cookie のセッションを返す（失敗は気にしない）。 */
  private async logoutCookie(cookie: string): Promise<void> {
    await this.fetchWithCookie(cookie)(`${this.target.baseUrl.replace(/\/$/, "")}/api/logout`, {
      method: "POST",
    }).catch(() => undefined);
  }

  onOriginRejectSuspected(): void {
    // 手元のループバックへの接続なので Origin の拒否は起きない（findOrStart が通る Origin を渡す）。
  }

  /**
   * 401/4401 の後のログインのし直し。ログインできたのに開けないまま続いたら諦める（`MAX_RELOGIN_WITHOUT_OPEN`）。ログインそのものができないときは、
   * サーバが本当に居ないときだけ終え、居れば（handoff の入れ替え・起動の途中）少し置いてやり直す。替えた古い cookie はログアウトする。
   */
  private async relogin(): Promise<void> {
    if (this.reloginInFlight || this.stopped) return;
    this.reloginInFlight = true;
    try {
      let cookie: string;
      try {
        cookie = await this.target.login();
      } catch (err) {
        if (this.stopped) return;
        if (await this.serverGone()) {
          this.fatal(
            `soda: could not log in again: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          return;
        }
        this.noteLoginFailure(err);
        if (this.stopped) return;
        const retry = setTimeout(() => void this.relogin(), RELOGIN_RETRY_MS);
        retry.unref?.();
        return;
      }
      if (this.stopped) return;
      if (++this.reloginsWithoutOpen > MAX_RELOGIN_WITHOUT_OPEN) {
        this.fatal("soda: the server keeps refusing the local login\n");
        return;
      }
      this.loginFailingSince = null;
      const old = this.cookie;
      this.cookie = cookie;
      if (old !== "" && old !== cookie) void this.logoutCookie(old);
      this.conn.connect();
    } finally {
      this.reloginInFlight = false;
    }
  }

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

  /** `client.detach` を送り、サーバが閉じるのを待つ（最大 `timeoutMs`）。 */
  async detach(timeoutMs = 1000): Promise<void> {
    this.detachSent = true;
    await Promise.race([
      this.conn.request("client.detach", {}).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
    ]);
  }

  /** 利用者がこのサーバを止めた（`server.stop` が通った）。以後にサーバが居なくなったら `onStopped` で終える。 */
  expectStop(): void {
    this.stopExpected = true;
  }

  private fatal(message: string): void {
    if (this.stopped) return;
    this.stop();
    this.h.onFatal(message);
  }
}

/** 開きも閉じもしない socket（終えた後の再接続の試みを、タイマーも接続も残さずに止める）。 */
/** すぐ閉じる socket（作れなかったとき。使う側が時間をおいて繋ぎ直す）。 */
function closedSocket(): WebSocketLike {
  const ws: WebSocketLike = {
    readyState: 3,
    send: () => undefined,
    close: () => undefined,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  queueMicrotask(() => ws.onclose?.({ code: 1006 }));
  return ws;
}

/** `onclose` に割り込む（使う側が後から `onclose` を入れても、先に `hook` を呼ぶ）。 */
function withCloseHook(ws: WebSocketLike, hook: (code: number) => void): WebSocketLike {
  let user: WebSocketLike["onclose"] = null;
  ws.onclose = (ev) => {
    hook(ev.code);
    user?.(ev);
  };
  return new Proxy(ws, {
    get(target, prop) {
      if (prop === "onclose") return user;
      const v = Reflect.get(target, prop) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, prop, value) {
      if (prop === "onclose") {
        user = value as WebSocketLike["onclose"];
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });
}

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
