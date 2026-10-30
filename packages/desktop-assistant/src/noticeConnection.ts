import { desktopAssistantOrigin, type AssistantNotice } from "@sodashitsu/protocol";
import WebSocket from "ws";
import { getCACertificates } from "node:tls";
import { NoticeFeed } from "./noticeFeed.js";

interface Socket {
  on(name: "open" | "pong", callback: () => void): unknown;
  on(name: "message", callback: (data: Buffer, binary: boolean) => void): unknown;
  on(name: "close" | "error", callback: () => void): unknown;
  send(message: string): unknown;
  ping(): unknown;
  close(): unknown;
  terminate(): unknown;
}
export interface NoticeConnectionOptions {
  machineId?: string;
  cookie: (origin: string) => Promise<string | null>;
  changed: (notices: readonly AssistantNotice[], added: boolean) => void;
  status: (status: "connecting" | "connected" | "login" | "offline") => void;
  socket?: (url: string, cookie: string, origin: string) => Socket;
  /** Internal adapter/test seam, never a renderer or public RPC option. */
  trustedAuthorities?: () => readonly string[];
  /** Internal monotonic-clock seam. */
  now?: () => number;
}

/** One read-only authenticated socket. It sends hello/state/form subscription only, never input or agent prompts. */
export class NoticeConnection {
  readonly feed: NoticeFeed;
  private generation = 0;
  private socket: Socket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private delay = 1000;
  private stopped = true;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pongDeadline: ReturnType<typeof setTimeout> | null = null;
  private pongExpiresAt: number | null = null;
  private cookieInFlight: Promise<string | null> | null = null;
  constructor(
    private readonly origin: string,
    private readonly options: NoticeConnectionOptions,
  ) {
    this.origin = desktopAssistantOrigin(origin);
    if (options.machineId && !/^[a-f0-9]{32}$/.test(options.machineId))
      throw Error("Invalid machine id");
    this.feed = new NoticeFeed(origin, options.changed, Date.now, options.machineId ?? "local");
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
    if (this.deadline) clearTimeout(this.deadline);
    this.retry = this.deadline = null;
    this.clearHeartbeat();
    const socket = this.socket;
    this.socket = null;
    socket?.terminate();
  }
  reconnect(): void {
    this.stop();
    this.start();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    const live = () => !this.stopped && generation === this.generation;
    const expiresAt = this.now() + 10_000;
    let socket: Socket | null = null;
    const finish = () => {
      if (!live()) return;
      const closedGeneration = ++this.generation;
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = null;
      this.socket = null;
      this.clearHeartbeat();
      socket?.terminate();
      this.options.status("offline");
      if (!this.stopped && this.generation === closedGeneration) this.schedule();
    };
    const handshake = () => {
      if (!live()) return false;
      if (this.now() >= expiresAt) {
        finish();
        return false;
      }
      return true;
    };
    this.options.status("connecting");
    if (!handshake()) return;
    // Cookie retrieval and the complete hello/shared-state handshake have a fixed deadline.
    const expire = () => {
      if (!live()) return;
      const remaining = expiresAt - this.now();
      if (remaining > 0) this.deadline = setTimeout(expire, Math.ceil(remaining));
      else finish();
    };
    this.deadline = setTimeout(expire, Math.ceil(expiresAt - this.now()));
    try {
      // Repeated deadlines cannot accumulate unbounded native cookie operations.
      if (this.cookieInFlight) {
        finish();
        return;
      }
      this.cookieInFlight = this.options.cookie(this.origin).finally(() => {
        this.cookieInFlight = null;
      });
      const cookie = await this.cookieInFlight;
      if (!handshake()) return;
      if (!cookie) {
        const closedGeneration = ++this.generation;
        if (this.deadline) clearTimeout(this.deadline);
        this.deadline = null;
        this.options.status("login");
        if (!this.stopped && this.generation === closedGeneration) this.schedule();
        return;
      }
      if (cookie.length > 8192 || /[\r\n]/.test(cookie))
        throw Error("Invalid authentication cookie");
      const url = new URL("/ws", this.origin);
      if (this.options.machineId) url.searchParams.set("machine", this.options.machineId);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = (
        this.options.socket ??
        ((url, cookie, origin) => {
          const authorities = url.startsWith("wss:")
            ? [
                ...(this.options.trustedAuthorities?.() ?? [
                  ...getCACertificates("default"),
                  ...getCACertificates("system"),
                ]),
              ]
            : null;
          if (!handshake()) throw Error("Connection deadline expired");
          return new WebSocket(url, {
            headers: { Cookie: cookie, Origin: origin },
            followRedirects: false,
            maxPayload: 8 * 1024 * 1024,
            handshakeTimeout: 10_000,
            ...(url.startsWith("wss:")
              ? {
                  // Read existing Node/OS trust. Never install a certificate or disable verification.
                  ca: authorities!,
                  rejectUnauthorized: true,
                }
              : {}),
          });
        })
      )(url.href, cookie, this.origin);
      socket.on("close", finish);
      socket.on("error", finish);
      if (!live()) {
        socket.terminate();
        return;
      }
      this.socket = socket;
      if (!handshake()) return;
      let stage: "hello" | "shared" | "asks" | "ready" = "hello";
      socket.on("open", () => {
        if (!handshake()) return;
        try {
          socket!.send(
            JSON.stringify({
              id: "assistant-hello",
              method: "client.hello",
              params: { protocol: 1, kind: "desktop" },
            }),
          );
        } catch {
          finish();
        }
      });
      socket.on("pong", () => {
        if (!live()) return;
        if (this.pongExpiresAt !== null && this.now() >= this.pongExpiresAt) {
          finish();
          return;
        }
        if (this.pongDeadline) clearTimeout(this.pongDeadline);
        this.pongDeadline = null;
        this.pongExpiresAt = null;
      });
      socket.on("message", (bytes, binary) => {
        if (!live() || binary) return;
        if (stage !== "ready" && !handshake()) return;
        if (bytes.byteLength > 8 * 1024 * 1024) {
          finish();
          return;
        }
        try {
          const message = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
          if (!message || typeof message !== "object") throw Error("Invalid message");
          if (stage !== "ready" && !handshake()) return;
          if (stage === "hello" && message.id === "assistant-hello") {
            if (message.error || !message.result || typeof message.result !== "object")
              throw Error("Hello rejected");
            this.feed.snapshot((message.result as { snapshot: unknown }).snapshot);
            if (!handshake()) return;
            stage = "shared";
            socket!.send(
              JSON.stringify({ id: "assistant-shared", method: "notification.state", params: {} }),
            );
          } else if (stage === "shared" && message.id === "assistant-shared") {
            if (message.error) throw Error("Notice state rejected");
            this.feed.shared(message.result);
            if (!handshake()) return;
            stage = "asks";
            socket!.send(
              JSON.stringify({
                id: "assistant-asks",
                method: "ask.subscribe",
                params: { renderer: "assistant" },
              }),
            );
          } else if (stage === "asks" && message.id === "assistant-asks") {
            if (message.error) throw Error("Form subscription rejected");
            this.feed.questions(message.result);
            if (!handshake()) return;
            stage = "ready";
            if (this.deadline) clearTimeout(this.deadline);
            this.deadline = null;
            this.delay = 1000;
            this.options.status("connected");
            if (!handshake()) return;
            this.heartbeat = setInterval(() => {
              if (!live()) return;
              if (this.pongExpiresAt !== null) {
                finish();
                return;
              }
              this.pongExpiresAt = this.now() + 10_000;
              const expirePong = () => {
                if (!live() || this.pongExpiresAt === null) return;
                const remaining = this.pongExpiresAt - this.now();
                if (remaining > 0) this.pongDeadline = setTimeout(expirePong, Math.ceil(remaining));
                else finish();
              };
              this.pongDeadline = setTimeout(expirePong, 10_000);
              try {
                socket!.ping();
              } catch {
                finish();
              }
            }, 20_000);
          } else if ("event" in message && stage !== "hello") {
            this.feed.event(message);
            if (stage !== "ready") handshake();
          }
        } catch {
          finish();
        }
      });
    } catch {
      finish();
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongDeadline) clearTimeout(this.pongDeadline);
    this.heartbeat = this.pongDeadline = null;
    this.pongExpiresAt = null;
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }

  private schedule(): void {
    if (this.stopped || this.retry) return;
    const delay = this.delay;
    this.delay = Math.min(30_000, this.delay * 2);
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, delay);
  }
}
