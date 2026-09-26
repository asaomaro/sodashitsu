import WebSocket from "ws";
import {
  decodeFrame,
  encodeInputFrame,
  FRAME_TYPE,
  type ClientHelloResult,
  type MethodName,
  type ParamsOf,
  type ResultOf,
  type ServerEvent,
} from "@wtm/protocol";

/**
 * `/ws` への接続と RPC・フレームの往復（design.md「`WtmClient`」節）。`packages/server/src/smoke.ts` の
 * `createSmokeClient` と設計を揃えるが、コードは複製する（decisions.md D6：起動確認という硬いゲートを
 * リファクタで壊すリスクを避けるため）。
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** サーバの RPC エラー応答、またはクライアント側で検出したエラー（`not_found`・`timeout` 等）。 */
export class RpcFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RpcFailure";
  }
}

export interface WtmClient {
  /**
   * `client.hello` を `kind: "external"` で送る（decisions.md D4）。`onEventAfterHello` を渡すと、hello の応答を
   * 受け取ったその場（同期）でイベントの購読に登録する——応答と同じ受信の塊で直後に届いたイベントも取りこぼさず、
   * 応答より前の（snapshot より古い）イベントは渡さない（20260926-agent-automation-api decisions.md D9）。
   */
  hello(onEventAfterHello?: (evt: ServerEvent) => void): Promise<ClientHelloResult>;
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
  /** INPUT フレームを送る。サーバからの ack は無い（design「依拠する既存の事実」）。 */
  sendInput(paneId: string, bytes: Uint8Array): void;
  onEvent(cb: (evt: ServerEvent) => void): void;
  onOutput(cb: (paneId: string, chunk: Uint8Array) => void): void;
  onSnapshot(cb: (paneId: string, cols: number, rows: number, text: string) => void): void;
  /** サーバ側が接続を閉じた（想定していない切断）ときに1回だけ呼ばれる。`close()` を自分で呼んだ場合は呼ばれない。 */
  onClose(cb: (code: number, reason: string) => void): void;
  /**
   * 受信を止める（`ws` の `pause()`。20260926-pane-observe-control D4）。読み手が遅いときに使い、サーバの流量制御（出力を捨て、
   * 再開したら SNAPSHOT）に任せる。止める前に受け取って溜めてあるぶんのメッセージ（イベント等）は、止めた後も届きうる。
   */
  pause(): void;
  /** 受信を再開する（`ws` の `resume()`）。 */
  resume(): void;
  close(): void;
}

const REQUEST_TIMEOUT_MS = 10_000;

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  /** 時間切れのタイマー。自分で閉じたら消す（応答の来ない要求のタイマーでプロセスを残さない）。 */
  timer: ReturnType<typeof setTimeout>;
}

interface RawEnvelope {
  id?: string;
  result?: unknown;
  error?: { code: string; message: string };
  event?: string;
  data?: unknown;
}

/**
 * `smoke.ts` の `createSmokeClient` と同じ形：**1 つの持続的な `message` ハンドラ**が応答を id で
 * 振り分ける（`ws.once("message", ...)` を都度張り直すと、何も待っていない間に届いた message を
 * 取りこぼす。smoke.ts のコメント参照）。
 */
export class WsWtmClient implements WtmClient {
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 1;
  private readonly eventListeners: ((evt: ServerEvent) => void)[] = [];
  private readonly outputListeners: ((paneId: string, chunk: Uint8Array) => void)[] = [];
  private readonly snapshotListeners: ((paneId: string, cols: number, rows: number, text: string) => void)[] = [];
  private readonly closeListeners: ((code: number, reason: string) => void)[] = [];
  private closedBySelf = false;

  constructor(private readonly ws: Pick<WebSocket, "on" | "send" | "close" | "pause" | "resume">) {
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.handleBinary(new Uint8Array(data));
      else this.handleText(data.toString("utf8"));
    });
    ws.on("close", (code: number, reason: Buffer) => {
      if (this.closedBySelf) return;
      for (const cb of this.closeListeners) cb(code, reason.toString("utf8"));
    });
  }

  private handleBinary(frame: Uint8Array): void {
    let decoded: ReturnType<typeof decodeFrame>;
    try {
      decoded = decodeFrame(frame);
    } catch {
      return; // 壊れたフレーム（サーバは正規のフレームしか送らない想定。取りこぼしより無視を優先）
    }
    if (decoded.type === FRAME_TYPE.OUTPUT) {
      for (const cb of this.outputListeners) cb(decoded.paneId, decoded.chunk);
    } else if (decoded.type === FRAME_TYPE.SNAPSHOT) {
      for (const cb of this.snapshotListeners) cb(decoded.paneId, decoded.cols, decoded.rows, decoded.text);
    }
  }

  private handleText(text: string): void {
    let msg: RawEnvelope;
    try {
      msg = JSON.parse(text) as RawEnvelope;
    } catch {
      return;
    }
    // RPC 応答には `id` がある。イベントには無い（`WsGateway.handleText`/`bus.subscribe` の非対称の裏返し。
    // design「依拠する既存の事実」）。
    if (msg.id !== undefined) {
      const req = this.pending.get(msg.id);
      if (!req) return;
      this.pending.delete(msg.id);
      if (msg.error) req.reject(new RpcFailure(msg.error.code, msg.error.message));
      else req.resolve(msg.result);
      return;
    }
    if (typeof msg.event === "string") {
      for (const cb of this.eventListeners) cb(msg as unknown as ServerEvent);
    }
  }

  private requestRaw(method: string, params: unknown, onResponse?: () => void): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcFailure("timeout", `timed out waiting for response to ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          onResponse?.();
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        timer,
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async hello(onEventAfterHello?: (evt: ServerEvent) => void): Promise<ClientHelloResult> {
    const subscribe = onEventAfterHello ? () => this.eventListeners.push(onEventAfterHello) : undefined;
    return (await this.requestRaw("client.hello", { protocol: 1, kind: "external" }, subscribe)) as ClientHelloResult;
  }

  async request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    return (await this.requestRaw(method, params)) as ResultOf<M>;
  }

  sendInput(paneId: string, bytes: Uint8Array): void {
    this.ws.send(encodeInputFrame(paneId, bytes));
  }

  onEvent(cb: (evt: ServerEvent) => void): void {
    this.eventListeners.push(cb);
  }

  onOutput(cb: (paneId: string, chunk: Uint8Array) => void): void {
    this.outputListeners.push(cb);
  }

  onSnapshot(cb: (paneId: string, cols: number, rows: number, text: string) => void): void {
    this.snapshotListeners.push(cb);
  }

  onClose(cb: (code: number, reason: string) => void): void {
    this.closeListeners.push(cb);
  }

  pause(): void {
    this.ws.pause();
  }

  resume(): void {
    this.ws.resume();
  }

  close(): void {
    this.closedBySelf = true;
    // 応答が来ないまま残った要求（例: 詰まったサーバへの pane.detach）の時間切れのタイマーでプロセスを最大 10 秒残さない
    // （20260926-pane-observe-control の review ラウンド 1）。要求の Promise は決着しないまま捨てる（閉じた後に待つ呼び出し側は無い）。
    for (const req of this.pending.values()) clearTimeout(req.timer);
    this.pending.clear();
    this.ws.close(1000, "done");
  }
}

/**
 * `/ws` を開く（`origin`/`host` ヘッダは `url` から組み立てる。`smoke.ts:191` と同じ形）。
 * upgrade が 401 なら `AuthError`、それ以外の失敗（403・503・ネットワークエラー等）は素の `Error` で reject する。
 */
export function connect(url: string, cookie: string): Promise<WtmClient> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    const wsScheme = u.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsScheme}//${u.host}/ws`;
    const origin = `${u.protocol}//${u.host}`;
    const ws = new WebSocket(wsUrl, { headers: { cookie, origin, host: u.host } });

    const cleanup = (): void => {
      ws.removeListener("open", onOpen);
      ws.removeListener("error", onError);
      ws.removeListener("unexpected-response", onUnexpectedResponse);
    };
    const onOpen = (): void => {
      cleanup();
      resolve(new WsWtmClient(ws));
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const onUnexpectedResponse = (_req: unknown, res: { statusCode?: number }): void => {
      cleanup();
      // `ws` の `terminate()` は、readyState がまだ CONNECTING の間に呼ぶと `abortHandshake` 経由で
      // 内部的に `error` イベントを発火する（`ws/lib/websocket.js` の実装）。上の `cleanup()` で
      // `error` リスナーを外した直後なので、素の listener 無しで発火すると Node が未処理例外として
      // 投げてしまう（実機の vitest で確認済み）。吸収用の no-op ハンドラを張ってから呼ぶ。
      ws.once("error", () => undefined);
      ws.terminate();
      if (res.statusCode === 401) {
        reject(new AuthError("authentication failed (401 from /ws)"));
        return;
      }
      // 401 以外（403=Origin/Host 拒否、503=起動中 等）は `statusCode` を持つ素の `Error` で reject する。
      // `output.ts` の `classify` がこれを見て 403 を `forbidden` に分類する（design「エラー処理/異常系」）。
      const err = new Error(`unexpected response from server: HTTP ${res.statusCode ?? "?"}`) as Error & { statusCode: number | undefined };
      err.statusCode = res.statusCode;
      reject(err);
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
    ws.once("unexpected-response", onUnexpectedResponse);
  });
}
