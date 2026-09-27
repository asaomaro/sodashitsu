import { chmod, mkdtemp, rename, rm, unlink } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { dirname, join } from "node:path";
import type { Logger } from "../log/Logger.js";
import type { WsConnection, WsServer } from "../ws/WsServer.js";
import {
  BRIDGE_FRAME,
  BRIDGE_LIMITS,
  BRIDGE_VERSION,
  BridgeFrameDecoder,
  encodeBridgeFrame,
  encodeJson,
  markerBytes,
  parseClosePayload,
  truncateUtf8,
  type BridgeFrame,
} from "./bridgeFrames.js";

/**
 * リモートの `wtm serve` の中継の受け口（20260927-multi-host-machines の design「リモートの受け口」・decisions D3）。状態ディレクトリの
 * Unix ドメイン socket（0600＝同じ利用者だけ）で、`wtm bridge` が SSH の標準入出力と素通しで繋ぐ。1 本の socket の上に論理的な接続
 * （チャネル）を多重化し、各チャネルを `WsConnection` として `WsGateway` に渡す——`/ws` の 1 接続と同じもの（`client.hello` から）。
 * **受け口に繋がった接続は認証済みとして扱う**（繋げるのは状態ディレクトリを読める同じ利用者だけ。token はハッシュでしか保存されず読めない）。
 * Windows では置かない（呼び出し側が判断する）。新しい TCP の待ち受けは作らない。
 */
export const BRIDGE_SOCKET_FILE_NAME = "bridge.sock";

export function bridgeSocketPathFor(stateDir: string): string {
  return join(stateDir, BRIDGE_SOCKET_FILE_NAME);
}

/** `WsGateway` の失効（`onSessionRevoked`）で閉じられない、ブラウザのセッションと重ならない値。 */
export const BRIDGE_SESSION_ID = "bridge";

export interface BridgeHelloInfo {
  version: string;
  hostname: string;
  sessionName: string | null;
}

const DRAIN_POLL_MS = 50; // `WsServerWs` と同じ（design「流量制御」）

/** 受け口が扱う socket の最小の形（テストは Duplex の対を渡す）。 */
export interface BridgeSocketLike {
  write(chunk: Uint8Array): boolean;
  end(): void;
  readonly writableLength: number;
  readonly destroyed: boolean;
  destroy(): void;
  on(event: "data", cb: (chunk: Buffer) => void): unknown;
  on(event: "close", cb: () => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
}

export class BridgeEndpoint implements WsServer {
  private readonly listeners: ((conn: WsConnection, sessionId: string) => void)[] = [];
  private readonly sockets = new Set<SocketState>();
  private server: Server | undefined;
  private listenPath: string | undefined;
  /** `close()` を始めた（以後の OPEN・PING は扱わない）。 */
  private closing = false;
  /** 0600 に絞り終えるまでは繋がった socket を捨てる（絞る前の権限で繋いだ相手を認証済みとして扱わない）。 */
  private accepting = false;
  /** 引き継ぎの間は新しいチャネルを開かない（`/ws` の `setReady(false)` と同じ。開こうとしたチャネルはすぐ 1012 で閉じる）。 */
  private ready = true;

  constructor(
    private readonly hello: BridgeHelloInfo,
    private readonly logger: Logger,
  ) {}

  onConnection(cb: (conn: WsConnection, sessionId: string) => void): void {
    this.listeners.push(cb);
  }

  /** 新しいチャネルを受け付けるか（引き継ぎの `closeClients`/`reopenClients`）。 */
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  /** 全チャネルを閉じる（停止・引き継ぎ）。socket は閉じない（`close()` が閉じる）。 */
  closeAll(code: number, reason: string): void {
    for (const s of this.sockets) for (const ch of [...s.channels.values()]) ch.close(code, reason);
  }

  /**
   * 状態ディレクトリの socket で待ち受ける。**0600 になってから見える場所に置く**: 0700 の一時ディレクトリの中で待ち受けて 0600 にし、
   * それから `bridge.sock` へ rename する（rename は残っていた古い socket のファイルを置き換える）。待ち受けと chmod の間に、状態ディレクトリを
   * 読める別の利用者（umask で group に開いている等）が繋いで認証済みのチャネルを得る窓を作らない。失敗したら待ち受けを閉じて投げる。
   */
  async listen(path: string): Promise<void> {
    const server = createServer((sock: Socket) => {
      if (!this.accepting) {
        sock.destroy();
        return;
      }
      this.handleSocket(sock);
    });
    server.on("error", (err) =>
      this.logger.warn("bridge socket error", { path, error: String(err) }),
    );
    const tmpDir = await mkdtemp(join(dirname(path), ".b-")); // 0700
    const tmpPath = join(tmpDir, "s");
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(tmpPath, () => {
          server.off("error", reject);
          resolve();
        });
      });
      await chmod(tmpPath, 0o600);
      await rename(tmpPath, path);
    } catch (err) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    this.server = server;
    this.listenPath = path;
    this.accepting = true;
  }

  /** 受け口を閉じる。書いた CLOSE の枠を送り切ってから（上限 500ms）socket を閉じる。 */
  async close(): Promise<void> {
    this.accepting = false;
    this.closing = true;
    this.ready = false;
    const socks = [...this.sockets];
    await Promise.all(
      socks.map(
        (s) =>
          new Promise<void>((resolve) => {
            if (s.sock.destroyed || s.dead) {
              resolve();
              return;
            }
            const timer = setTimeout(() => {
              s.sock.destroy();
              resolve();
            }, 500);
            timer.unref();
            s.sock.on("close", () => {
              clearTimeout(timer);
              resolve();
            });
            s.sock.end();
          }),
      ),
    );
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    // 待ち受けたのは rename の前のパスなので、`bridge.sock` のファイルは自分で消す（まだロックを持っている間）。
    const listenPath = this.listenPath;
    this.listenPath = undefined;
    if (listenPath !== undefined) await unlink(listenPath).catch(() => undefined);
  }

  /** 繋がった socket を扱う（`listen` から呼ぶ。テストは直接呼ぶ）。 */
  handleSocket(sock: BridgeSocketLike): void {
    const state: SocketState = {
      sock,
      decoder: new BridgeFrameDecoder({ role: "endpoint" }),
      channels: new Map(),
      dead: false,
    };
    this.sockets.add(state);
    sock.on("error", () => undefined);
    sock.on("close", () => this.dropSocket(state));
    sock.write(markerBytes());
    sock.write(
      encodeBridgeFrame(
        BRIDGE_FRAME.HELLO,
        0,
        encodeJson({
          bridge: BRIDGE_VERSION,
          protocol: 1,
          version: this.hello.version,
          hostname: this.hello.hostname,
          sessionName: this.hello.sessionName,
        }),
      ),
    );
    sock.on("data", (chunk: Buffer) => {
      if (state.dead || this.closing) return;
      let frames: BridgeFrame[];
      try {
        frames = state.decoder.push(
          new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        );
      } catch (err) {
        this.fail(state, String(err));
        return;
      }
      for (const f of frames) {
        if (state.dead) return;
        this.handleFrame(state, f);
      }
    });
  }

  private handleFrame(state: SocketState, f: BridgeFrame): void {
    switch (f.type) {
      case BRIDGE_FRAME.PING:
        state.sock.write(encodeBridgeFrame(BRIDGE_FRAME.PONG, 0, f.payload));
        return;
      case BRIDGE_FRAME.OPEN: {
        if (state.channels.has(f.channel)) {
          this.fail(state, `channel ${f.channel} is already open`);
          return;
        }
        if (state.channels.size >= BRIDGE_LIMITS.maxChannels) {
          this.fail(state, "too many channels");
          return;
        }
        const ch = new BridgeChannel(f.channel, state);
        state.channels.set(f.channel, ch);
        if (!this.ready) {
          ch.close(1012, "server restarting");
          return;
        }
        for (const cb of this.listeners) cb(ch, BRIDGE_SESSION_ID);
        return;
      }
      case BRIDGE_FRAME.CLOSE: {
        const ch = state.channels.get(f.channel);
        if (!ch) return; // 行き違い
        const { code, reason } = parseClosePayload(f.payload);
        ch.remoteClosed(code, reason);
        return;
      }
      case BRIDGE_FRAME.TEXT: {
        const ch = state.channels.get(f.channel);
        if (!ch) return;
        ch.deliverText(new TextDecoder().decode(f.payload));
        return;
      }
      case BRIDGE_FRAME.BINARY: {
        const ch = state.channels.get(f.channel);
        if (!ch) return;
        ch.deliverBinary(f.payload);
        return;
      }
      default:
        return;
    }
  }

  private fail(state: SocketState, why: string): void {
    this.logger.warn("bridge: closing a connection after a protocol violation", { reason: why });
    state.sock.destroy();
    this.dropSocket(state);
  }

  private dropSocket(state: SocketState): void {
    if (state.dead) return;
    state.dead = true;
    this.sockets.delete(state);
    for (const ch of [...state.channels.values()]) ch.remoteClosed(1006, "bridge closed");
  }
}

interface SocketState {
  sock: BridgeSocketLike;
  decoder: BridgeFrameDecoder;
  channels: Map<number, BridgeChannel>;
  dead: boolean;
}

/** 1 チャネル＝`/ws` の 1 接続（`WsConnection`）。 */
class BridgeChannel implements WsConnection {
  private readonly textCbs: ((s: string) => void)[] = [];
  private readonly binaryCbs: ((b: Uint8Array) => void)[] = [];
  private readonly closeCbs: ((code: number) => void)[] = [];
  private readonly drainTimers: ReturnType<typeof setInterval>[] = [];
  private closed = false;

  constructor(
    private readonly id: number,
    private readonly state: SocketState,
  ) {}

  /** socket の書き込み待ち（同じ socket のほかのチャネルの分も含む＝保守的に止まる）。 */
  get bufferedAmount(): number {
    return this.state.sock.writableLength;
  }

  sendText(json: string): void {
    this.send(BRIDGE_FRAME.TEXT, new TextEncoder().encode(json));
  }

  sendBinary(frame: Uint8Array): void {
    this.send(BRIDGE_FRAME.BINARY, frame);
  }

  private send(
    type: typeof BRIDGE_FRAME.TEXT | typeof BRIDGE_FRAME.BINARY,
    payload: Uint8Array,
  ): void {
    if (this.closed || this.state.dead || this.state.sock.destroyed) return;
    if (payload.byteLength > BRIDGE_LIMITS.maxRemoteMessageBytes) {
      // `/ws` の上限を超える 1 通は送れない（受け手が接続ごと切る）。このチャネルだけ閉じる。
      this.close(1009, "message too big");
      return;
    }
    this.state.sock.write(encodeBridgeFrame(type, this.id, payload));
  }

  onText(cb: (s: string) => void): void {
    this.textCbs.push(cb);
  }
  onBinary(cb: (b: Uint8Array) => void): void {
    this.binaryCbs.push(cb);
  }
  onDrain(cb: () => void): void {
    const timer = setInterval(cb, DRAIN_POLL_MS);
    timer.unref();
    this.drainTimers.push(timer);
  }
  onClose(cb: (code: number) => void): void {
    this.closeCbs.push(cb);
  }

  /** こちらから閉じる（`WsGateway` の 1008・`client.detach`・停止）。手元へ CLOSE を送る。 */
  close(code: number, reason: string): void {
    if (this.closed) return;
    if (!this.state.dead && !this.state.sock.destroyed) {
      this.state.sock.write(
        encodeBridgeFrame(
          BRIDGE_FRAME.CLOSE,
          this.id,
          encodeJson({ code, reason: truncateUtf8(reason, 120) }),
        ),
      );
    }
    this.finish(code);
  }

  deliverText(s: string): void {
    if (this.closed) return;
    for (const cb of this.textCbs) cb(s);
  }
  deliverBinary(b: Uint8Array): void {
    if (this.closed) return;
    for (const cb of this.binaryCbs) cb(b);
  }
  /** 手元が閉じた・socket が切れた。 */
  remoteClosed(code: number, _reason: string): void {
    if (this.closed) return;
    this.finish(code);
  }

  private finish(code: number): void {
    this.closed = true;
    this.state.channels.delete(this.id);
    for (const t of this.drainTimers) clearInterval(t);
    for (const cb of this.closeCbs) cb(code);
  }
}
