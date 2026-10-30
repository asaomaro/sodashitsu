import {
  desktopAssistantOrigin,
  METHOD_SCHEMAS,
  type ParamsOf,
  type ResultOf,
} from "@sodashitsu/protocol";
import { getCACertificates } from "node:tls";
import WebSocket from "ws";

export type AssistantMethod =
  | "assistant.source"
  | "assistant.reply"
  | "assistant.reply_key"
  | "assistant.get"
  | "assistant.ensure"
  | "assistant.adopt"
  | "assistant.prompt"
  | "assistant.send_keys"
  | "agent.kinds"
  | "agent.conversation";
interface Socket {
  on(name: "open" | "pong" | "close" | "error", callback: () => void): unknown;
  on(name: "message", callback: (data: Buffer, binary: boolean) => void): unknown;
  send(message: string): unknown;
  ping(): unknown;
  terminate(): unknown;
}
export interface AssistantRpcOptions {
  cookie(origin: string): Promise<string | null>;
  status(connected: boolean): void;
  changed(): void;
  socket?: (url: string, cookie: string, origin: string) => Socket;
  now?: () => number;
}
interface Pending {
  expires: number;
  timer: ReturnType<typeof setTimeout>;
  resolve(value: unknown): void;
  reject(error: Error): void;
}

/** Native-main only, fixed RPC set. Reconnection never replays a command or keystroke. */
export class AssistantRpc {
  private socket: Socket | null = null;
  private generation = 0;
  private ready = false;
  private stopped = true;
  private pending = new Map<string, Pending>();
  private serial = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  private cookieInFlight: Promise<string | null> | null = null;
  private backoff = 1000;
  constructor(
    private readonly origin: string,
    private readonly options: AssistantRpcOptions,
  ) {
    this.origin = desktopAssistantOrigin(origin);
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }
  stop(): void {
    this.stopped = true;
    ++this.generation;
    if (this.retry) clearTimeout(this.retry);
    if (this.watch) clearInterval(this.watch);
    this.retry = this.watch = null;
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error("接続が切れました。送信済みか確認してから操作してください。"));
    }
    this.pending.clear();
    socket?.terminate();
    this.options.status(false);
  }
  reconnect(): void {
    this.stop();
    this.start();
  }

  request<M extends AssistantMethod>(method: M, input: ParamsOf<M>): Promise<ResultOf<M>> {
    if (!this.ready || !this.socket || this.stopped)
      return Promise.reject(Error("操舵室へ接続してから操作してください。"));
    if (this.pending.size >= 16)
      return Promise.reject(Error("前の操作が完了するまでお待ちください。"));
    const params = METHOD_SCHEMAS[method].parse(input);
    const id = `assistant-rpc-${++this.serial}`;
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const item: Pending = {
        expires: this.now() + 20_000,
        timer: setTimeout(() => {
          this.pending.delete(id);
          reject(Error("応答を確認できません。送信を繰り返す前に操舵室で結果を確認してください。"));
        }, 20_000),
        resolve: (value) => resolve(value as ResultOf<M>),
        reject,
      };
      this.pending.set(id, item);
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch {
        this.reconnect();
      }
    });
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
  private async connect(): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    const live = () => !this.stopped && this.generation === generation;
    let socket: Socket | null = null;
    const helloExpires = this.now() + 10_000;
    let pingAt = 0;
    let pongExpires: number | null = null;
    const finish = () => {
      if (!live()) return;
      const delay = this.backoff;
      this.stop();
      this.backoff = Math.min(30_000, delay * 2);
      this.stopped = false;
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.connect();
      }, delay);
    };
    const handshake = () => {
      if (!live()) return false;
      if (this.now() >= helloExpires) {
        finish();
        return false;
      }
      return true;
    };
    this.watch = setInterval(() => {
      if (!live()) return;
      if (!this.ready) {
        handshake();
        return;
      }
      if (pongExpires !== null && this.now() >= pongExpires) {
        finish();
        return;
      }
      if (pongExpires === null && this.now() >= pingAt) {
        pongExpires = this.now() + 10_000;
        try {
          socket!.ping();
        } catch {
          finish();
        }
      }
    }, 250);
    try {
      if (this.cookieInFlight) {
        finish();
        return;
      }
      this.cookieInFlight = this.options.cookie(this.origin).finally(() => {
        this.cookieInFlight = null;
      });
      const cookie = await this.cookieInFlight;
      if (!handshake()) return;
      if (!cookie || cookie.length > 8192 || /[\r\n]/.test(cookie)) {
        finish();
        return;
      }
      const url = new URL("/ws", this.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const authorities =
        url.protocol === "wss:"
          ? [...getCACertificates("default"), ...getCACertificates("system")]
          : null;
      if (!handshake()) return;
      socket = (
        this.options.socket ??
        ((url, cookie, origin) =>
          new WebSocket(url, {
            headers: { Cookie: cookie, Origin: origin },
            followRedirects: false,
            maxPayload: 8 * 1024 * 1024,
            handshakeTimeout: 10_000,
            ...(authorities ? { ca: authorities, rejectUnauthorized: true } : {}),
          }))
      )(url.href, cookie, this.origin);
      socket.on("close", finish);
      socket.on("error", finish);
      if (!live()) {
        socket.terminate();
        return;
      }
      this.socket = socket;
      socket.on("open", () => {
        if (!handshake()) return;
        try {
          socket!.send(
            JSON.stringify({
              id: "assistant-rpc-hello",
              method: "client.hello",
              params: { protocol: 1, kind: "external" },
            }),
          );
        } catch {
          finish();
        }
      });
      socket.on("pong", () => {
        if (!live()) return;
        if (pongExpires !== null && this.now() >= pongExpires) {
          finish();
          return;
        }
        pongExpires = null;
        pingAt = this.now() + 20_000;
      });
      socket.on("message", (bytes, binary) => {
        if (!live() || binary) return;
        if (!this.ready && !handshake()) return;
        if (bytes.byteLength > 8 * 1024 * 1024) {
          finish();
          return;
        }
        try {
          const message = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
          if (!message || typeof message !== "object" || Array.isArray(message)) throw Error();
          if (!this.ready) {
            if (!handshake()) return;
            if (message.id !== "assistant-rpc-hello") return;
            if (message.error || !message.result || typeof message.result !== "object")
              throw Error();
            this.ready = true;
            this.backoff = 1000;
            pingAt = this.now() + 20_000;
            this.options.status(true);
            if (!handshake()) return;
            return;
          }
          if (typeof message.id === "string") {
            const item = this.pending.get(message.id);
            if (!item) return;
            this.pending.delete(message.id);
            clearTimeout(item.timer);
            if (this.now() >= item.expires)
              item.reject(Error("操作の応答が遅れました。結果を確認してください。"));
            else if (message.error) {
              const error = message.error as { message?: unknown };
              item.reject(
                Error(
                  typeof error.message === "string"
                    ? error.message.slice(0, 1000)
                    : "操作できませんでした。",
                ),
              );
            } else item.resolve(message.result);
          } else if (
            message.event === "pane.updated" ||
            message.event === "pane.closed" ||
            message.event === "workspace.updated"
          )
            this.options.changed();
        } catch {
          finish();
        }
      });
    } catch {
      finish();
    }
  }
}
