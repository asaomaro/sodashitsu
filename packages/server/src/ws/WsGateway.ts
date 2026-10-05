import { decodeFrame, encodeOutputFrame, encodeSnapshotFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import type { ControlSurface } from "../surface/ControlSurface.js";
import type { ClientRegistry } from "../clients/ClientRegistry.js";
import type { SizeAuthority } from "../clients/SizeAuthority.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import type { ClientSink } from "../terminal/OutputFanout.js";
import type { EventBus } from "../bus/EventBus.js";
import type { AuthService } from "../auth/AuthService.js";
import type { Logger } from "../log/Logger.js";
import { LogThrottle, monotonicNow } from "../log/LogThrottle.js";
import type { WsConnection, WsServer } from "./WsServer.js";
import { BRIDGE_SESSION_ID } from "../machine/BridgeEndpoint.js";

const INVALID_FRAME_WINDOW_MS = 10_000;
const INVALID_FRAME_LIMIT = 10;
const MAX_INPUT_FRAME_BYTES = 1024 * 1024; // design「大きすぎる入力（1MB 超）」
/**
 * 入力を捨てた知らせ（`input_queue_full`）を同じ接続・同じ pane へ送る間隔（20260927-server-size-input-limits の decisions D2）。固まった pane に
 * 打ち続けると 1 打鍵ごとに捨てられるので、毎回は送らない（toast が画面を埋める）が、打ち続けている間は知らせが続く。
 */
export const INPUT_FULL_NOTICE_INTERVAL_MS = 2000;
/** 知らせた時刻を覚える pane の数の上限（閉じた pane の分が溜まらないよう、超えたら忘れる）。 */
const INPUT_FULL_NOTICE_PANES_MAX = 256;

interface RequestEnvelope {
  id: string;
  method: string;
  params: unknown;
}

interface ConnState {
  conn: WsConnection;
  sessionId: string;
  invalidFrameCount: number;
  invalidWindowStartedAt: number;
  /** pane ごとの、入力を捨てた知らせを最後に送った時刻（`INPUT_FULL_NOTICE_INTERVAL_MS` の間引き）。 */
  inputFullNoticeAt: Map<string, number>;
}

export interface WsGatewayOptions {
  /**
   * 不正なフレームの窓（10 秒）を測る時計（ms）。既定は単調な `performance.now()`（`monotonicNow`）——`Date.now()` は時刻の
   * 合わせ直しで戻りうる（戻ると窓が終わらず、進むとすぐ終わる）。D103 の `LogThrottle` と同じ（D106）。テストで差し替える。
   */
  now?: () => number;
  /**
   * 接続が切れた後に呼ぶ（20260927-custom-command-keys：その接続が開いた独自コマンドの popup を止める）。`WsGateway` はコマンドの係を知らない
   * （依存の向きを接続の層 → コマンドの層にしない。architecture.md）。
   */
  onClientGone?: ((clientId: string) => void) | undefined;
}

/**
 * 1 接続の寿命を扱う（architecture.md「WsGateway」）。JSON → `ControlSurface.invoke`、
 * INPUT → `TerminalManager.get(paneId).write`、`EventBus` の購読と送信、`ClientSink` の実装、
 * 不正なフレームの計数、`AuthService.onSessionRevoked` を受けての close コード `4401`。
 */
export class WsGateway {
  private readonly states = new Map<string, ConnState>();
  private readonly now: () => number;
  private readonly onClientGone: ((clientId: string) => void) | undefined;
  /** 入力を捨てたログの間引き（読まない pane へ流し込み続けると 1 通ごとに書くことになる。D103 と同じ考え方）。 */
  private readonly inputDropLog: LogThrottle;

  constructor(
    wsServer: WsServer,
    private readonly surface: ControlSurface,
    private readonly clients: ClientRegistry,
    private readonly sizeAuthority: SizeAuthority,
    private readonly terminals: TerminalManager,
    private readonly bus: EventBus,
    auth: AuthService,
    private readonly logger: Logger,
    opts: WsGatewayOptions = {},
  ) {
    this.now = opts.now ?? monotonicNow;
    this.onClientGone = opts.onClientGone;
    this.inputDropLog = new LogThrottle({ now: this.now });
    wsServer.onConnection((conn, sessionId) => this.handleConnection(conn, sessionId));
    auth.onSessionRevoked((sessionId) => this.handleSessionRevoked(sessionId));
  }

  private handleConnection(conn: WsConnection, sessionId: string): void {
    const clientId = this.clients.register();
    if (sessionId === BRIDGE_SESSION_ID) {
      const rec = this.clients.get(clientId);
      if (rec) rec.viaBridge = true;
    }
    // 窓の始まりは「まだ無い」（-∞）にする：単調な時計はプロセスの起動からの経過なので、0 から始めると起動の直後の
    // 最初の窓が短くなる（D106）。
    this.states.set(clientId, {
      conn,
      sessionId,
      invalidFrameCount: 0,
      invalidWindowStartedAt: Number.NEGATIVE_INFINITY,
      inputFullNoticeAt: new Map(),
    });

    const sink: ClientSink = {
      clientId,
      // OUTPUT は圧縮しない（D98）。PTY の小さな出力（〜4KB）を 1 通ずつ非同期に deflate すると送信の出口が
      // 約 0.8MB/s まで落ち、大量出力の pane の後ろに他の pane の出力が数秒並んでいた（実測）。SNAPSHOT・JSON は
      // 従来どおり圧縮する（D31：大きなスナップショットの帯域を節約する）。
      sendOutput: (paneId, chunk) => conn.sendBinary(encodeOutputFrame(paneId, chunk), { compress: false }),
      sendSnapshot: (paneId, cols, rows, text) => conn.sendBinary(encodeSnapshotFrame(paneId, cols, rows, text)),
      get bufferedAmount() {
        return conn.bufferedAmount;
      },
    };

    // イベントは全クライアントへ配る（design「WebSocket の通信」のイベント表）。
    const unsubscribe = this.bus.subscribe((event) => {
      conn.sendText(JSON.stringify(event));
    });

    conn.onDrain(() => {
      // stale の購読者を再開できるか、この接続が持つ全ての購読先で確かめる（design「流量制御」）。
      for (const paneId of this.clients.subscriptions(clientId)) {
        this.terminals.get(paneId)?.fanout.retryStale();
      }
    });

    conn.onBinary((frame) => {
      let decoded;
      try {
        decoded = decodeFrame(frame);
      } catch {
        this.registerInvalidFrame(clientId);
        return;
      }
      if (decoded.type !== FRAME_TYPE.INPUT) {
        this.registerInvalidFrame(clientId);
        return;
      }
      if (decoded.bytes.byteLength > MAX_INPUT_FRAME_BYTES) {
        // design「大きすぎる入力（1MB 超）」：そのフレームを捨てる。id の無いフレームなので client.error
        // を返す（`registerInvalidFrame` がそれと 10 秒 10 回のフラッド対策の両方を兼ねる。レビュー指摘：
        // 以前はこの判定自体が無く、`ws` の既定 100MiB まで無制限に受け取っていた）。
        this.registerInvalidFrame(clientId);
        return;
      }
      const host = this.terminals.get(decoded.paneId);
      if (!host) return; // 閉じた直後の pane への入力。エラーにはしない。
      this.sizeAuthority.noteInteraction(clientId, decoded.paneId);
      // pane が入力を読まず、サーバに溜まった入力が上限に達していれば、書かずに捨てて知らせる（20260927-server-size-input-limits）。
      // 接続の読み取りは止めない——同じ接続で運ぶ他の pane の入力・RPC まで止まる（decisions D3）。`writeInput` を持たない host は今までどおり。
      if (host.writeInput) {
        if (!host.writeInput(decoded.bytes)) this.inputDropped(clientId, decoded.paneId, decoded.bytes.byteLength);
      } else {
        host.write(decoded.bytes);
      }
    });

    conn.onText((text) => {
      this.handleText(clientId, sink, text, conn).catch((err: unknown) => {
        this.logger.error("failed to handle a request", { clientId, error: String(err) });
      });
    });

    conn.onClose(() => {
      unsubscribe.dispose();
      for (const paneId of this.clients.subscriptions(clientId)) {
        this.terminals.get(paneId)?.fanout.unsubscribe(clientId);
      }
      this.sizeAuthority.onClientGone(clientId);
      this.clients.unregister(clientId);
      this.states.delete(clientId);
      try {
        this.onClientGone?.(clientId);
      } catch (err) {
        this.logger.error("failed to clean up after a client", { clientId, error: String(err) });
      }
    });
  }

  private async handleText(clientId: string, sink: ClientSink, text: string, conn: WsConnection): Promise<void> {
    let msg: Partial<RequestEnvelope>;
    try {
      msg = JSON.parse(text) as Partial<RequestEnvelope>;
    } catch {
      this.registerInvalidFrame(clientId);
      return;
    }
    if (typeof msg.id !== "string" || typeof msg.method !== "string") {
      this.registerInvalidFrame(clientId);
      return;
    }
    const result = await this.surface.invoke({ clientId, sink, sameMachine: conn.sameMachine === true }, msg.method, msg.params);
    if (result.ok) {
      conn.sendText(JSON.stringify({ id: msg.id, result: result.result }));
      if (msg.method === "client.detach") conn.close(1000, "detached"); // このブラウザの接続だけを切る
    } else {
      conn.sendText(JSON.stringify({ id: msg.id, error: result.error }));
    }
  }

  /**
   * INPUT を捨てたとき（20260927-server-size-input-limits）。送った接続へ `client.error`（`input_queue_full`・paneId）を同じ pane について
   * `INPUT_FULL_NOTICE_INTERVAL_MS` に 1 回だけ送り、ログは `LogThrottle` で間引く。不正なフレームではないので `registerInvalidFrame` に数えない
   * （数えると、固まった pane に打ち続けたブラウザの接続が閉じられ、全 pane が巻き込まれる）。
   */
  private inputDropped(clientId: string, paneId: string, bytes: number): void {
    const state = this.states.get(clientId);
    if (!state) return;
    const now = this.now();
    const last = state.inputFullNoticeAt.get(paneId);
    if (last === undefined || now - last >= INPUT_FULL_NOTICE_INTERVAL_MS) {
      if (last === undefined && state.inputFullNoticeAt.size >= INPUT_FULL_NOTICE_PANES_MAX) state.inputFullNoticeAt.clear();
      state.inputFullNoticeAt.set(paneId, now);
      state.conn.sendText(
        JSON.stringify({
          event: "client.error",
          data: { code: "input_queue_full", message: `pane ${paneId} is not reading input; dropped ${bytes} bytes`, paneId },
        }),
      );
    }
    const allowed = this.inputDropLog.take();
    if (allowed) {
      this.logger.warn("dropped input to a pane that is not reading", {
        clientId,
        paneId,
        bytes,
        ...(allowed.suppressed > 0 ? { suppressed: allowed.suppressed } : {}),
      });
    }
  }

  private registerInvalidFrame(clientId: string): void {
    const state = this.states.get(clientId);
    if (!state) return;
    const now = this.now();
    if (now - state.invalidWindowStartedAt > INVALID_FRAME_WINDOW_MS) {
      state.invalidFrameCount = 0;
      state.invalidWindowStartedAt = now;
    }
    state.invalidFrameCount++;
    state.conn.sendText(JSON.stringify({ event: "client.error", data: { code: "invalid_params", message: "malformed frame" } }));
    if (state.invalidFrameCount > INVALID_FRAME_LIMIT) {
      state.conn.close(1008, "too many invalid frames");
    }
  }

  private handleSessionRevoked(sessionId: string): void {
    for (const state of this.states.values()) {
      if (state.sessionId === sessionId) state.conn.close(4401, "session revoked");
    }
  }
}
