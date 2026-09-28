import { decodeFrame, encodeInputFrame, FRAME_TYPE, type MethodName, type ParamsOf, type ResultOf } from "@sodashitsu/protocol";
import type { ClientKind, ConnectionPort, LoginResult, StorePort, TerminalSinkPort } from "./ports.js";
import { parseRetryAfter } from "./retryAfter.js";

/**
 * ブラウザの WebSocket のうち、この部品が使う分だけを切り出した interface（テストで差し替える。
 * design.md「WebSocket の通信」・architecture.md「net/Connection」）。
 */
export interface WebSocketLike {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  binaryType?: string;
  onopen: (() => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface ConnectionOptions {
  /** `hello` に渡す種別（04 が `"mobile"` を渡す）。 */
  kind: ClientKind;
  /** `/api/*` を呼ぶ先（同一オリジンなら空文字列でよい）。 */
  httpOrigin: string;
  /** `/ws` への完全な URL（`ws://` / `wss://`）。 */
  wsUrl: string;
  store: StorePort;
  sink: TerminalSinkPort;
  fetchImpl?: typeof fetch;
  createWebSocket?: (url: string) => WebSocketLike;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
/**
 * `/api/session` は 204 なのに WebSocket が開く前に閉じた試みが、この回数続いたら、サーバがこのページのアドレスを拒否して
 * いるかもしれないと知らせる（D107）。1 回目・2 回目は起動の途中（`/ws` の 503。D102）でも起きるので、すぐには出さない。
 */
const ORIGIN_SUSPECT_AFTER = 3;

/**
 * `GET /api/session` の結果（D107）。`forbidden` は、Cookie は有効だが、このページのアドレス（Host。Origin が付いていれば
 * Origin も）をサーバが許可していない（403。サーバは Cookie を先に確かめ、無効なら Host を問わず 401 を返す——サーバの D106）。
 * ただし `/api/session` は Host で見るが `/ws` は Origin で見る（Origin が許可されていれば Host を問わない）ので、前段のプロキシが
 * Host を許可外の名前に書き換える構成（`--origin` は正しい。D106 の残る制約）では、`/api/session` が 403 でも `/ws` はつながる。
 * そこで `forbidden` でも `/ws` を 1 回だけ試し、それも開く前に閉じたときだけ `rejected` にする。
 * `unknown` は 204・401・403 以外の応答と、応答が来ない（通信の失敗）とき——「未認証」とも「拒否」とも言えないので、
 * 従来どおり繋ぎ直す（design「それ以外は再接続する」）。
 */
type SessionCheck = "ok" | "unauthorized" | "forbidden" | "unknown";

/**
 * `ConnectionPort` の実装（architecture.md「net/Connection」）。ログイン・ログアウト・`/api/session` の確認、
 * WebSocket の接続と再接続、要求と応答の対応付け、snapshot とイベントの振り分けを行う。
 */
export class Connection implements ConnectionPort {
  private readonly kind: ClientKind;
  private readonly httpOrigin: string;
  private wsUrl: string;
  private readonly store: StorePort;
  private readonly sink: TerminalSinkPort;
  private readonly fetchImpl: typeof fetch;
  private readonly createWebSocket: (url: string) => WebSocketLike;

  private ws: WebSocketLike | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** `client.detach` を送った直後は true。直後にサーバが close するので、それを「意図した切断」として扱う。 */
  private detachRequested = false;
  private readonly openedListeners = new Set<(clientId: string) => void>();
  private readonly closedListeners = new Set<() => void>();
  /** `/api/session` は 204 なのに WebSocket が開く前に閉じた試みの、続いた回数（開けたら 0。D107）。 */
  private socketFailedWhileSessionOk = 0;
  /** 行き先を替えるために自分で閉じた socket の close を待っている（`retarget`。20260927-multi-host-machines）。 */
  private retargetPending = false;
  /** `retarget` の世代。`/api/session` の確認を待つ間に行き先が替わったら、その確認の後は何もしない（socket を 2 本開かない）。 */
  private targetGen = 0;
  /** `disconnect` で自分から閉じた（その close では繋ぎ直さない。次の `connect` で戻す）。 */
  private stopped = false;

  constructor(opts: ConnectionOptions) {
    this.kind = opts.kind;
    this.httpOrigin = opts.httpOrigin;
    this.wsUrl = opts.wsUrl;
    this.store = opts.store;
    this.sink = opts.sink;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.createWebSocket =
      opts.createWebSocket ??
      ((url) => {
        const ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        return ws as unknown as WebSocketLike;
      });
  }

  /**
   * 失敗を理由ごとに返す（D105。`LoginResult`）。サーバ（`HttpServer.handleLogin`）の順：失敗の続きすぎ（429）→
   * Origin／Host の検査（403）→ 本文（400）→ token（401）→ 204。fetch 自体の失敗（サーバに届かない）は reject せず
   * `network_error` にする。
   */
  async login(token: string): Promise<LoginResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.httpOrigin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {
      return { ok: false, reason: "network_error" };
    }
    switch (res.status) {
      case 204:
        return { ok: true };
      case 401:
        return { ok: false, reason: "bad_token" };
      case 403:
        return { ok: false, reason: "origin_rejected" };
      case 429:
        return { ok: false, reason: "rate_limited", retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after"), Date.now()) };
      default:
        return { ok: false, reason: "http_error", status: res.status };
    }
  }

  async logout(): Promise<void> {
    // サーバがセッションを失効させ、開いている WebSocket は onSessionRevoked → close 4401 で閉じられる
    // （WsGateway）。ここでは POST するだけでよい。
    await this.fetchImpl(`${this.httpOrigin}/api/logout`, { method: "POST" });
  }

  connect(): void {
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)) return;
    this.cancelReconnectTimer();
    this.reconnectAttempt = 0;
    this.detachRequested = false;
    this.resetOriginSuspicion();
    this.store.onConnectionState("connecting");
    void this.checkSessionThenOpen();
  }

  /**
   * 行き先（`/ws` の URL）を替えて繋ぎ直す（保存した SSH のマシンの切り替え。20260927-multi-host-machines）。今の socket があれば、その後に届く
   * メッセージを捨ててから閉じ、その close では再接続の待ちをせずに新しい行き先へ `/api/session` の確認から開き直す。待ちのタイマーは取り消し、
   * 間隔は最初に戻す。続けて呼ばれたら最後の行き先だけが開く（前の socket を閉じ終える前なら、閉じたときに最後の行き先へ開く）。
   */
  retarget(wsUrl: string): void {
    this.wsUrl = wsUrl;
    this.targetGen++;
    this.cancelReconnectTimer();
    this.reconnectAttempt = 0;
    this.detachRequested = false;
    this.resetOriginSuspicion();
    const ws = this.ws;
    if (ws) {
      // 開いている・開く途中・閉じる途中（hello の失敗の後・サーバが閉じ始めた直後）のどれでも、その close を待ってから新しい行き先へ開く
      // （閉じる途中の socket を残したまま開くと、後から届く close が新しい socket の要求を落とし、3 本目を開いてしまう）。
      this.retargetPending = true;
      ws.onmessage = null; // 前の行き先の遅れて届いたメッセージを新しい状態へ混ぜない
      this.store.onConnectionState("connecting");
      if (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING) ws.close(1000, "retarget");
      return;
    }
    if (this.retargetPending) return; // 閉じ終えるのを待っている。閉じたら最後の行き先へ開く
    this.store.onConnectionState("connecting");
    void this.checkSessionThenOpen();
  }

  /**
   * 閉じて、自動では繋ぎ直さない（サーバの中の接続〔連携のグラフの別のマシン。20260927-agent-graph の 04〕が、グラフから外れたマシン・終了で使う）。
   * 繋ぎ直しの待ち・`/api/session` の確認の途中も取り消す。応答待ちの要求は close で reject される。次の `connect()` で再開できる。
   */
  disconnect(): void {
    this.stopped = true;
    this.targetGen++; // 確認の途中なら、その後に開かない
    this.cancelReconnectTimer();
    this.retargetPending = false;
    const ws = this.ws;
    if (ws && (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING)) ws.close(1000, "disconnect");
  }

  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) {
      return Promise.reject(new Error(`not connected (method=${method})`));
    }
    const id = String(this.nextRequestId++);
    return new Promise<ResultOf<M>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id, method, params }));
      // client.detach はサーバがこの応答の直後に close する（design「WebSocket の通信」）。
      if (method === "client.detach") this.detachRequested = true;
    });
  }

  /**
   * 新しい接続で `client.hello` が通るたび（初回・自動の再接続・503 等からの再試行・再ログイン・「再接続」ボタンの後）に
   * `listener(clientId)` を呼ぶ（`StorePort.applySnapshot` と `onConnectionState("open")` の後）。外す関数を返す（D107）。
   * **サーバは接続ごとに新しい clientId を振り、購読・表示（`client.view`）・`client.fit` をその clientId に持つ**——前の接続の
   * ものは引き継がれない。表示と購読を張り直すのは `term/ViewSync.onConnectionOpened`（`main.ts` がここにつなぐ）。
   */
  onOpened(listener: (clientId: string) => void): () => void {
    this.openedListeners.add(listener);
    return () => {
      this.openedListeners.delete(listener);
    };
  }

  /**
   * WebSocket が閉じるたび（開けた接続・開く前に閉じた試みのどちらでも。`onOpened` より前に閉じた接続を含む）に
   * `listener` を呼ぶ。外す関数を返す（D107）。`term/ViewSync.onConnectionClosed`（`main.ts` がつなぐ）が、次の hello が
   * 通るまで `client.view`・`pane.subscribe` を送らないようにする。
   */
  onClosed(listener: () => void): () => void {
    this.closedListeners.add(listener);
    return () => {
      this.closedListeners.delete(listener);
    };
  }

  sendInput(paneId: string, bytes: string | Uint8Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) return; // 未接続中の入力は捨てる（再接続後は打ち直しになる）
    const encoded = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
    ws.send(encodeInputFrame(paneId, encoded));
  }

  private async checkSessionThenOpen(): Promise<void> {
    const gen = this.targetGen;
    const session = await this.checkSession();
    if (gen !== this.targetGen) return; // 確かめている間に行き先が替わった（新しい行き先の確認が別に走っている）
    if (session === "unauthorized") {
      this.store.onAuthRequired();
      return;
    }
    // 403 でも `/ws` を 1 回だけ試す（`/ws` は Origin で許すので、Host を書き換える前段のプロキシの下ではつながる。D107）。
    this.openSocket(session === "forbidden");
  }

  /** ネットワーク不通は「未認証」とも「拒否」とも違う（design「それ以外は再接続する」）ので `unknown` を返す。 */
  private async checkSession(): Promise<SessionCheck> {
    try {
      const res = await this.fetchImpl(`${this.httpOrigin}/api/session`);
      if (res.status === 204) return "ok";
      if (res.status === 401) return "unauthorized";
      if (res.status === 403) return "forbidden";
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * `afterForbidden`：直前の `/api/session` が 403 だった試み。これも開く前に閉じたら `rejected` にする（D107）。
   */
  private openSocket(afterForbidden = false): void {
    const ws = this.createWebSocket(this.wsUrl);
    this.ws = ws;
    /** この socket が開いたか（開く前に閉じた試みを見分ける。D107）。 */
    let opened = false;
    // `handleClose` はこの socket について高々 1 回だけ呼ぶ。`client.hello` 失敗時の `ws.close()`（下）が
    // 既に閉じている socket に対して呼ばれると、実装によっては `onclose` が再度発火しうる
    // （仕様上は close() 済みの WebSocket への close() は no-op だが、テスト用の実装まで含めて信頼しない）。
    // 二重発火すると、意図した切断（4401・detach）の直後に誤って再接続ループへ入ってしまう。
    let closeHandled = false;
    const onClose = (code: number): void => {
      if (closeHandled) return;
      closeHandled = true;
      if (this.ws !== ws) return; // もう今の socket ではない（念のため。古い socket の close で新しい socket の状態を壊さない）
      this.handleClose(code, opened, afterForbidden);
    };
    ws.onopen = () => {
      opened = true;
      this.reconnectAttempt = 0;
      this.resetOriginSuspicion(); // 開けた：サーバはこのアドレスを拒否していない（D107）
      this.request("client.hello", { protocol: 1, kind: this.kind })
        .then((result) => {
          if (this.ws !== ws) return; // 応答を受けた後、当てる前に閉じた（`disconnect` 等）。閉じた接続を open にしない
          this.store.applySnapshot(result.snapshot, result.clientId);
          // `open`（＝入力を受け付けてよい。D95）は hello が通ってから。socket が開いただけで `open` にすると、
          // hello が失敗して閉じ直すまでの間、入力を受け付けたまま黙って捨てることになる。
          this.store.onConnectionState("open");
          this.notifyOpened(result.clientId);
        })
        .catch(() => ws.close());
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onerror = () => {
      /* 実際の後始末は close イベントで行う（error の後に必ず close が来る） */
    };
    ws.onclose = (ev) => onClose(ev.code);
  }

  /**
   * `onOpened` の listener を呼ぶ。listener の例外はこの接続を閉じる理由にしない（hello の `.then` の中で投げると
   * `.catch(() => ws.close())` に落ちて、繋ぎ直しを繰り返してしまう）——握りつぶさず、後のタスクで投げ直して見えるようにする。
   */
  private notifyOpened(clientId: string): void {
    for (const listener of [...this.openedListeners]) {
      try {
        listener(clientId);
      } catch (err) {
        setTimeout(() => {
          throw err;
        }, 0);
      }
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data === "string") {
      this.handleText(data);
      return;
    }
    const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (bytes) this.handleBinary(bytes);
  }

  private handleText(text: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    if ("id" in msg && typeof (msg as { id: unknown }).id === "string") {
      const envelope = msg as { id: string; result?: unknown; error?: { code: string; message: string } };
      const pending = this.pending.get(envelope.id);
      if (!pending) return;
      this.pending.delete(envelope.id);
      if (envelope.error) {
        // `code` をプロパティとしても持たせる（20260925-connection-error-code。design「設計方針」）。
        // `message` の文字列書式は変えない——`clientError.ts` の `errorCodeOf` が `.code` を
        // 最優先で読み、無ければ従来どおりこの文字列を正規表現でパースする（後方互換）。
        const err = new Error(`${envelope.error.code}: ${envelope.error.message}`);
        Object.assign(err, { code: envelope.error.code });
        pending.reject(err);
      } else {
        pending.resolve(envelope.result);
      }
      return;
    }
    if ("event" in msg) {
      const event = msg as import("@sodashitsu/protocol").ServerEvent;
      if (event.event === "pane.size_changed") {
        // OUTPUT/SNAPSHOT と同じく TerminalSinkPort へ（xterm.js の resize を Vue の反応を待たずに行う。D16 と同じ理由）。
        this.sink.onSizeChanged(event.data.paneId, event.data.cols, event.data.rows);
        // pane.cols/rows は SessionSnapshot の Pane にも載っているので、非所有クライアントの表示のためにストアも更新する。
        this.store.applyEvent(event);
        return;
      }
      this.store.applyEvent(event);
    }
  }

  private handleBinary(bytes: Uint8Array): void {
    const frame = decodeFrame(bytes);
    switch (frame.type) {
      case FRAME_TYPE.OUTPUT:
        this.sink.onOutput(frame.paneId, frame.chunk);
        return;
      case FRAME_TYPE.SNAPSHOT:
        this.sink.onSnapshot(frame.paneId, frame.cols, frame.rows, frame.text);
        return;
      default:
        return; // INPUT はブラウザ→サーバの向きだけ（サーバからは来ない）
    }
  }

  /**
   * @param opened この socket が開いたか。
   * @param afterForbidden 直前の `/api/session` が 403 だった試みか（D107）。
   */
  private handleClose(code: number, opened: boolean, afterForbidden: boolean): void {
    this.ws = null;
    const err = new Error("connection closed");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.notifyClosed();

    if (this.stopped) {
      this.store.onConnectionState("detached");
      return; // `disconnect` で閉じた（繋ぎ直さない）
    }
    if (this.retargetPending) {
      // 行き先を替えるために閉じた（`retarget`）。待たずに新しい行き先へ。
      this.retargetPending = false;
      this.store.onConnectionState("connecting");
      void this.checkSessionThenOpen();
      return;
    }
    if (this.detachRequested) {
      this.detachRequested = false;
      this.store.onConnectionState("detached");
      return; // 自動では再接続しない（design「client.detach」）
    }
    if (code === 4401) {
      this.store.onAuthRequired();
      return;
    }
    if (afterForbidden && !opened) {
      // `/api/session` が 403 で、`/ws` も開く前に閉じた：Cookie は有効だが、このページのアドレスをサーバが許可していない
      // （`--origin` を付けずに再起動した・転送した名前で開いた等。サーバの D106）。繋ぎ直しても同じなので、「再接続中…」の
      // まま黙って繰り返さず、理由を示して「再試行」（`connect()`）を待つ（D107）。
      this.store.onConnectionState("rejected");
      return;
    }
    // `/api/session` の確認（非同期）を待つ間も、状態を `open` のまま残さない——ここで先に
    // `reconnecting` にしておかないと、その間に打った文字が表示されずに捨てられる（D95）。
    this.store.onConnectionState("reconnecting");
    void this.verifySessionThenScheduleReconnect(opened);
  }

  /** @param opened 閉じた socket が開いていたか（開く前に閉じた試みを数える。D107）。 */
  private async verifySessionThenScheduleReconnect(opened: boolean): Promise<void> {
    const gen = this.targetGen;
    const session = await this.checkSession();
    if (gen !== this.targetGen) return; // 確かめている間に行き先が替わった
    if (session === "unauthorized") {
      this.store.onAuthRequired();
      return;
    }
    if (session === "ok" && !opened) this.noteSocketFailedWhileSessionOk();
    // 403 なら次の試みで `/ws` を 1 回だけ試し、それも開く前に閉じたら `rejected`（`handleClose`。D107）。
    this.scheduleReconnect(session === "forbidden");
  }

  /**
   * `/api/session` は 204（Cookie は有効・Host は許可内）なのに、WebSocket が開く前に閉じた（D107）。`/api/session` は Host で、
   * `/ws` は Origin で許すかを見るので、前段のプロキシが Host を許可内の名前（`127.0.0.1:7780` 等）で渡し、ページの Origin
   * （`https://soda.example.com` 等）が許可されていない構成（`--origin` を付けずに起動し直した）では、`/ws` だけが 403 になる。
   * ブラウザは upgrade の状態コードを見られないので断定はできない——続いたら「再接続中…」に手がかりを添える（繋ぎ直しは続ける）。
   */
  private noteSocketFailedWhileSessionOk(): void {
    this.socketFailedWhileSessionOk++;
    if (this.socketFailedWhileSessionOk === ORIGIN_SUSPECT_AFTER) this.store.onOriginRejectSuspected(true);
  }

  private resetOriginSuspicion(): void {
    if (this.socketFailedWhileSessionOk >= ORIGIN_SUSPECT_AFTER) this.store.onOriginRejectSuspected(false);
    this.socketFailedWhileSessionOk = 0;
  }

  private notifyClosed(): void {
    for (const listener of [...this.closedListeners]) {
      try {
        listener();
      } catch (err) {
        setTimeout(() => {
          throw err;
        }, 0);
      }
    }
  }

  /** @param afterForbidden 直前の `/api/session` が 403 だった（次の試みも開く前に閉じたら `rejected`。D107）。 */
  private scheduleReconnect(afterForbidden = false): void {
    this.store.onConnectionState("reconnecting");
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(afterForbidden);
    }, delay);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
