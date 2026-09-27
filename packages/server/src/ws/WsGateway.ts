import { decodeFrame, encodeOutputFrame, encodeSnapshotFrame, FRAME_TYPE } from "@wtm/protocol";
import type { ControlSurface } from "../surface/ControlSurface.js";
import type { ClientRegistry } from "../clients/ClientRegistry.js";
import type { SizeAuthority } from "../clients/SizeAuthority.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import type { ClientSink } from "../terminal/OutputFanout.js";
import type { EventBus } from "../bus/EventBus.js";
import type { AuthService } from "../auth/AuthService.js";
import type { Logger } from "../log/Logger.js";
import { monotonicNow } from "../log/LogThrottle.js";
import type { WsConnection, WsServer } from "./WsServer.js";

const INVALID_FRAME_WINDOW_MS = 10_000;
const INVALID_FRAME_LIMIT = 10;
const MAX_INPUT_FRAME_BYTES = 1024 * 1024; // design「大きすぎる入力（1MB 超）」

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
    wsServer.onConnection((conn, sessionId) => this.handleConnection(conn, sessionId));
    auth.onSessionRevoked((sessionId) => this.handleSessionRevoked(sessionId));
  }

  private handleConnection(conn: WsConnection, sessionId: string): void {
    const clientId = this.clients.register();
    // 窓の始まりは「まだ無い」（-∞）にする：単調な時計はプロセスの起動からの経過なので、0 から始めると起動の直後の
    // 最初の窓が短くなる（D106）。
    this.states.set(clientId, { conn, sessionId, invalidFrameCount: 0, invalidWindowStartedAt: Number.NEGATIVE_INFINITY });

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
      host.write(decoded.bytes);
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
    const result = await this.surface.invoke({ clientId, sink }, msg.method, msg.params);
    if (result.ok) {
      conn.sendText(JSON.stringify({ id: msg.id, result: result.result }));
      if (msg.method === "client.detach") conn.close(1000, "detached"); // このブラウザの接続だけを切る
    } else {
      conn.sendText(JSON.stringify({ id: msg.id, error: result.error }));
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
