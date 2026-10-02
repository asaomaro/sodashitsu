import type { IncomingMessage, Server as HttpServerType } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { AuthorizeUpgrade } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { isSameMachine } from "../auth/LocalLogin.js";
import type { Logger } from "../log/Logger.js";
import { LogThrottle } from "../log/LogThrottle.js";
import { requestPathname } from "../util/net.js";
import type { WsConnection, WsServer } from "./WsServer.js";

const WS_PATH = "/ws";
const DEFLATE_THRESHOLD_BYTES = 1024; // D31：1KB 未満は圧縮しない（キー入力のエコーの遅延を増やさないため）
// design「大きすぎる入力（1MB 超）」の判定は WsGateway がフレームを見て丁寧に行う（invalid_params/
// client.error を返してそのフレームだけ破棄する）。ここでの上限はその判定に届く前に `ws` が接続ごと
// 切ってしまわないための余裕（レビュー指摘：以前は無指定で `ws` の既定 100MiB のままだった）。
const MAX_WS_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4MB
const DRAIN_POLL_MS = 50; // 流量制御で止めた購読を再開できるかを確かめる間隔（D98）
/** `?machine=` の値の上限（`machineRules.ts` の `MAX_SELECTOR_LENGTH` と同じ。ws/ は machine/ を import しない——architecture の境界）。 */
const MAX_MACHINE_SELECTOR_LENGTH = 256;

/**
 * `/ws?machine=<id|名前>` の行き先（20260927-multi-host-machines の design「/ws の分岐」）。`composeServer` が `MachineManager.route` と
 * `relayToMachine` を包んで渡す。`unknown`（曖昧を含む）は 404、`offline` は 503。
 */
export type MachineRouter = (selector: string) => { kind: "ok"; attach(conn: WsConnection, sessionId: string): void } | { kind: "unknown" } | { kind: "offline" };

/** `machine` のクエリ（無い・`local` は undefined＝このサーバそのもの。不正なら "invalid"）。 */
export function machineSelectorOf(target: string | undefined): string | undefined | "invalid" {
  let url: URL;
  try {
    url = new URL(target ?? "/", "http://x");
  } catch {
    return "invalid";
  }
  const all = url.searchParams.getAll("machine");
  if (all.length === 0) return undefined;
  if (all.length > 1) return "invalid";
  const v = all[0]!;
  if (v.length === 0 || v.length > MAX_MACHINE_SELECTOR_LENGTH) return "invalid";
  return v === "local" ? undefined : v;
}

/** `ws` 8.21 での実装（design「WebSocket の通信」・D31）。 */
export class WsServerWs implements WsServer {
  private readonly wss: WebSocketServer;
  private readonly listeners: ((conn: WsConnection, sessionId: string) => void)[] = [];
  private ready = true;
  /** 想定外の失敗の error 行の間引き（upgrade は認証前の誰でも送れる。D103）。 */
  private readonly failureLog = new LogThrottle();

  constructor(
    httpServer: HttpServerType,
    /**
     * Origin/Host の検査と拒否のログ（`OriginPolicy` を持つ。`HttpServer` と同じ実体を渡し、間引きの状態を共有する。
     * 必須——省けたころは、省くと `extraOrigins` の無い別の実体を黙って作っていた。D102・D103）。
     */
    private readonly originGate: OriginRejectionLog,
    private readonly authorize: AuthorizeUpgrade,
    private readonly logger: Logger,
    /** 保存した SSH のマシンへの中継（20260927-multi-host-machines）。無ければ `?machine=` は 404。 */
    private readonly machineRouter?: MachineRouter,
  ) {
    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: { threshold: DEFLATE_THRESHOLD_BYTES },
      maxPayload: MAX_WS_PAYLOAD_BYTES,
    });
    httpServer.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket, head).catch((err: unknown) => {
        const allowed = this.failureLog.take();
        if (allowed) {
          this.logger.error("ws upgrade failed", { error: String(err), ...(allowed.suppressed > 0 ? { suppressed: allowed.suppressed } : {}) });
        }
        socket.destroy();
      });
    });
  }

  onConnection(cb: (conn: WsConnection, sessionId: string) => void): void {
    this.listeners.push(cb);
  }

  /**
   * `/ws` の受け付けを始める・止める（既定は受け付ける）。`composeServer` は組み立て時に止め、`listen()` の最後
   * （bind → token → 復元 → poller の後）で始める。止めている間の upgrade は 503 で断る（D102）。
   */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  closeAll(code: number, reason: string): void {
    for (const ws of this.wss.clients) {
      try {
        ws.close(code, reason);
      } catch {
        // 既に閉じかけている等は無視する。
      }
    }
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const pathname = requestPathname(req.url);
    if (pathname === undefined) {
      // 解釈できない request-target（`*` 等）は入力の誤りとして 400 で断り、ログに書かない（D103。以前は `//` 等で
      // `new URL` の例外が想定外の失敗として 1 回ごとに error 行になっていた）。`//ws` は `/ws` ではない（下で閉じる）。
      rejectUpgrade(socket, "400 Bad Request");
      return;
    }
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    const remoteAddress = "socket" in req && req.socket ? (req.socket.remoteAddress ?? "") : "";
    // Origin/Host の検査 → 拒否なら間引いてログに残し 403（`OriginRejectionLog.admit`。`/api/login` と共通。D102・D103）。
    const rejection = { path: WS_PATH, remoteAddress, origin: req.headers.origin, host: req.headers.host };
    if (!this.originGate.admit(rejection, () => rejectUpgrade(socket, "403 Forbidden"))) return;
    if (!this.ready) {
      // 起動の途中（token の作成・復元・poller の開始が終わるまで）は受け付けない（D102）。復元は bus にイベントを
      // 出さないので、途中で hello したクライアントは作りかけのスナップショットのまま取り残される。ブラウザは
      // `/api/session` を確かめてから間隔を空けて繋ぎ直す（design「WebSocket の切断」）。
      rejectUpgrade(socket, "503 Service Unavailable");
      return;
    }
    const authResult = await this.authorize({ headers: req.headers as Record<string, string | undefined>, remoteAddress });
    if (!authResult.ok) {
      rejectUpgrade(socket, "401 Unauthorized");
      return;
    }
    // 行き先のマシン（20260927-multi-host-machines）。認証を通った後にだけ見る（認証の無い要求にマシンの有無を漏らさない）。
    const selector = machineSelectorOf(req.url);
    if (selector === "invalid") {
      rejectUpgrade(socket, "400 Bad Request");
      return;
    }
    if (selector !== undefined) {
      const route = this.machineRouter?.(selector) ?? { kind: "unknown" as const };
      if (route.kind === "unknown") {
        rejectUpgrade(socket, "404 Not Found");
        return;
      }
      if (route.kind === "offline") {
        rejectUpgrade(socket, "503 Service Unavailable");
        return;
      }
      // 手元のセッション（Cookie）を渡す——ログアウト・token の作り直しで失効したら、中継の接続も閉じる（4401）。
      this.wss.handleUpgrade(req, socket, head, (ws) => route.attach(new WsConnectionImpl(ws), authResult.sessionId));
      return;
    }
    const sameMachine = "socket" in req && req.socket ? isSameMachine(req.socket.remoteAddress, req.socket.localAddress) : false;
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new WsConnectionImpl(ws, sameMachine);
      for (const cb of this.listeners) cb(conn, authResult.sessionId);
    });
  }
}

/** upgrade を HTTP の応答で断る（ステータス行だけを書いて閉じる）。 */
function rejectUpgrade(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
  socket.destroy();
}

class WsConnectionImpl implements WsConnection {
  constructor(
    private readonly ws: WebSocket,
    readonly sameMachine = false,
  ) {}

  get bufferedAmount(): number {
    return this.ws.bufferedAmount;
  }

  sendText(json: string): void {
    this.ws.send(json);
  }

  sendBinary(frame: Uint8Array, opts?: { compress?: boolean }): void {
    this.ws.send(frame, { compress: opts?.compress ?? true });
  }

  onText(cb: (s: string) => void): void {
    this.ws.on("message", (data, isBinary) => {
      if (!isBinary) cb(Buffer.isBuffer(data) ? data.toString("utf8") : Buffer.concat(data as Buffer[]).toString("utf8"));
    });
  }

  onBinary(cb: (b: Uint8Array) => void): void {
    this.ws.on("message", (data, isBinary) => {
      if (isBinary) cb(Buffer.isBuffer(data) ? new Uint8Array(data) : new Uint8Array(Buffer.concat(data as Buffer[])));
    });
  }

  /**
   * 送信バッファが減ったことを知らせる（`OutputFanout.retryStale` の起点。design「流量制御」）。**`ws` の WebSocket は
   * `drain` を emit しない**（8.21.3 の `lib/websocket.js` が emit するのは `open`・`close` 等だけ）——以前は
   * `this.ws.on("drain", cb)` と書いていたため一度も呼ばれず、流量制御で止めた購読が永久に止まったままだった（D98）。
   * そこで一定間隔で呼ぶ。閾値（256KB を下回ったか）と「止めた購読があるか」の判定は `retryStale` 自身が行うので、
   * ここでは間隔ごとに呼ぶだけでよい（止めた購読が無ければ何もしない、軽い処理）。
   */
  onDrain(cb: () => void): void {
    const timer = setInterval(cb, DRAIN_POLL_MS);
    timer.unref();
    this.ws.once("close", () => clearInterval(timer));
  }

  onClose(cb: (code: number) => void): void {
    this.ws.on("close", (code) => cb(code));
  }

  close(code: number, reason: string): void {
    this.ws.close(code, reason);
  }
}
