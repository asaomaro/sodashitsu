import type { ClientHelloParams, MethodName, ParamsOf, ResultOf, ServerEvent, SessionSnapshot } from "@sodashitsu/protocol";

/**
 * Web の port の型（architecture.md「Web の主要な型と port」）。Vue と Pinia を import しない
 * （規則 4）。`net/`・`term/`・`keys/` はこれらの port 越しにストアと UI につながる。
 */

export type ClientKind = ClientHelloParams["kind"];

/**
 * このブラウザの端末の種類（`main.ts` が `isCoarsePointer()` で決める。desktop / mobile の2値のみ）。
 * `ClientKind`（`client.hello` に送る種別。20260923-external-control-api で `"external"` が増えた）とは
 * 別物——ブラウザが `"external"`（画面を持たない CLI 用の種別）になることは無いため、`DeviceKindKey`
 * のような「この端末は desktop/mobile のどちらか」を表す箇所ではこちらを使う。
 */
export type DeviceKind = "desktop" | "mobile";

/**
 * 接続の状態。`rejected` は、Cookie は有効だが、このページのアドレス（Host／Origin）をサーバが許可していない
 * （`GET /api/session` が 403 で、その後に 1 回だけ試した `/ws` も開く前に閉じた。サーバの D106）——自動では繋ぎ直さず、理由と
 * `--origin <このページの Origin>` を示して「再試行」（`connect()`）を待つ（D107。以前は 401 以外と同じく「再接続中…」のまま
 * 黙って繋ぎ直し続けた。`/api/session` の 403 だけでは止めない——Host を書き換える前段のプロキシの下では `/ws` はつながる）。
 */
export type ConnectionState = "connecting" | "open" | "reconnecting" | "detached" | "rejected";

/** 入力の出どころ。`"pointer"` はマウス・ホイール等のポインタ操作から出た入力（`InputGate` が溜めない。D99）。 */
export type InputOrigin = "pointer";

/**
 * `POST /api/login` の結果（D105）。失敗は理由ごとに分ける——以前は 204 以外を全て false にし、ログイン画面が 403
 * （Origin の不一致）も token の誤りと同じ文言で出していたため、利用者が token を疑って `soda token reset` へ進んでいた。
 * - `bad_token`：401。token が違う。
 * - `origin_rejected`：403。このページの Origin／Host をサーバが許可していない（`soda serve --origin <Origin>` で許可する）。
 * - `rate_limited`：429。失敗が続いたので受け付けていない（接続元の IP ごとに 1 分に 5 回・1 時間に 20 回。
 *   `LoginRateLimiter`）。`retryAfterSeconds` は応答の `Retry-After`（soda 自身は付けない。前段のプロキシ等が付けた
 *   場合だけ）を `net/retryAfter` の規則で正規化したもの——1 以上 1 日以下の整数。無い・読めない・大きすぎるときは null。
 * - `http_error`：それ以外の状態（400・500 等）。
 * - `network_error`：応答が来ない（サーバに届かない・接続が切れた）。
 */
export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "bad_token" }
  | { ok: false; reason: "origin_rejected" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number | null }
  | { ok: false; reason: "http_error"; status: number }
  | { ok: false; reason: "network_error" };

export interface ConnectionPort {
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
  sendInput(paneId: string, bytes: string | Uint8Array, origin?: InputOrigin): void;
  /** `POST /api/login`。成功（204）か、失敗の理由（`LoginResult`。D105）を返す。reject しない。 */
  login(token: string): Promise<LoginResult>;
  /** `POST /api/logout`。 */
  logout(): Promise<void>;
  /** 初回・ログイン後・「再接続」ボタン・`rejected` の「再試行」ボタン（D107）。 */
  connect(): void;
}

export interface StorePort {
  /** `clientId` は `client.hello` の応答（`ClientHelloResult`）のもの。サイズ権限の判定（`Tab.sizeOwnerClientId` との比較）に使う。 */
  applySnapshot(s: SessionSnapshot, clientId: string): void;
  applyEvent(e: ServerEvent): void;
  onAuthRequired(): void;
  onConnectionState(s: ConnectionState): void;
  /**
   * `/api/session` は 204 なのに WebSocket が開く前に閉じた試みが続いた（true）・開けた／「再接続」等でやり直した（false）
   * （D107）。サーバがこのページの Origin を拒否しているかもしれない（`/ws` は Origin で、`/api/session` は Host で見るので、
   * Host を許可内の名前で渡す前段のプロキシの下では `/ws` だけが 403 になる）。ブラウザは upgrade の状態コードを見られないので
   * 断定できず、繋ぎ直しは続ける——「再接続中…」に手がかりと `--origin <このページの Origin>` を添えるだけ。
   */
  onOriginRejectSuspected(suspected: boolean): void;
}

export interface TerminalSinkPort {
  onOutput(paneId: string, chunk: Uint8Array): void;
  /**
   * resize → write("\x1bc" + text)（RIS で消すのを書き込みの列の中で行い、まだ処理していない前の書き込みを重ねない。D107。
   * TerminalRegistry の実装側の責務）。
   */
  onSnapshot(paneId: string, cols: number, rows: number, text: string): void;
  /** `pane.size_changed` を受けたとき。 */
  onSizeChanged(paneId: string, cols: number, rows: number): void;
}
