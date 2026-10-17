import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  DesktopCompanionMessage,
  DesktopMediaSettings,
  DesktopMediaSignal,
  DesktopMediaFeedback,
  decodeDesktopMediaChunk,
  type DesktopOptions,
  type DesktopReady,
  type DesktopIceServers,
} from "@sodashitsu/protocol";
import type { z } from "zod";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";

type Source = {
  owner: object;
  options: DesktopOptions;
  ready: z.infer<typeof DesktopReady>;
  send(value: unknown): boolean;
  buffered(): number;
  policy(video: boolean): void;
};
/** One explicitly attached local B browser and one viewer-owned native share. No screen broadcasts. */
export class DesktopCompanionHub {
  private host: WebSocket | undefined;
  private source: Source | undefined;
  private request:
    | {
        id: string;
        settings: DesktopMediaSettings;
        started: boolean;
        audio: boolean;
        generation: number;
        seq: number;
        state: "waiting" | "negotiating" | "rtc" | "relay";
      }
    | undefined;
  private lastSeen = 0;
  private messages = 0;
  private rateAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    readonly enabled: boolean,
    private readonly iceServers: z.infer<typeof DesktopIceServers> = [],
  ) {}
  bind(source: Source) {
    if (this.source) this.end(this.source.owner);
    this.source = source;
  }
  attach(ws: WebSocket) {
    if (!this.enabled || this.host) {
      ws.close(1008, "Companion unavailable");
      return;
    }
    this.timer = setInterval(() => {
      if (performance.now() - this.lastSeen > 12000) this.closeHost();
    }, 1000);
    this.timer.unref();
    this.host = ws;
    this.lastSeen = performance.now();
    this.messages = 0;
    this.rateAt = this.lastSeen;
    ws.on("error", () => {
      if (this.host === ws) this.closeHost();
    });
    ws.on("close", () => {
      if (this.host === ws) {
        this.closeHost();
      }
    });
    ws.on("message", (raw, binary) => {
      if (this.host !== ws) return;
      try {
        const bytes = Buffer.isBuffer(raw)
          ? raw
          : Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.from(raw);
        const now = performance.now();
        if (now - this.rateAt >= 1000) {
          this.rateAt = now;
          this.messages = 0;
        }
        if (++this.messages > 120) throw Error();
        if (binary) {
          const r = this.request,
            s = this.source;
          if (!r?.started || !s) return;
          const chunk = decodeDesktopMediaChunk(bytes);
          if (chunk.generation !== r.generation) return;
          if (chunk.seq !== r.seq + 1) throw Error();
          r.seq = chunk.seq;
          if (s.buffered() > 512 * 1024) {
            this.stopMedia("congested");
            return;
          }
          s.send(bytes);
          return;
        }
        if (bytes.byteLength > 32768) throw Error();
        const m = DesktopCompanionMessage.parse(JSON.parse(bytes.toString()));
        if (m.type === "heartbeat") {
          this.lastSeen = now;
          return;
        }
        const r = this.request,
          s = this.source;
        if (!r || !s || m.id !== r.id) return;
        if (m.type === "started") {
          if (
            r.started ||
            (m.audio && !r.settings.audio) ||
            Math.abs(m.width / m.height - s.ready.width / s.ready.height) > 0.02
          )
            throw Error();
          r.started = true;
          r.audio = m.audio;
          r.state = "negotiating";
          s.policy(true);
          s.send({
            type: "media_status",
            id: r.id,
            state: r.state,
            audio: m.audio,
            iceServers: this.iceServers,
          });
        } else if (m.type === "rtc_signal") {
          if (!r.started || m.signal.kind === "answer") throw Error();
          s.send(m);
        } else if (m.type === "media_stream") {
          if (!r.started || (m.mime.includes("opus") && !r.audio) || m.generation <= r.generation)
            throw Error();
          r.generation = m.generation;
          r.seq = 0;
          s.send(m);
        } else if (m.type === "media_state") {
          if (m.state === "ended") {
            this.stopMedia("ended");
            return;
          }
          if (!r.started) throw Error();
          r.state = m.state;
          s.send({ type: "media_status", id: r.id, state: r.state, audio: r.audio });
        }
      } catch {
        this.closeHost();
      }
    });
    this.toHost({ type: "companion_ready" });
    this.publishRequest();
  }
  fromViewer(owner: object, raw: unknown): boolean {
    const s = this.source;
    if (!s || s.owner !== owner || !this.enabled) return false;
    const m = raw as { type: string; enabled?: boolean; settings?: unknown };
    if (m.type === "media") {
      this.stopMedia("stopped");
      if (!m.enabled) return true;
      const settings = DesktopMediaSettings.parse(m.settings ?? {}),
        id = randomUUID();
      this.request = {
        id,
        settings,
        started: false,
        audio: false,
        generation: 0,
        seq: 0,
        state: "waiting",
      };
      s.send({
        type: "media_status",
        id,
        state: "waiting",
        audio: settings.audio,
        reason: this.host ? "requested" : "unavailable",
      });
      this.publishRequest();
      return true;
    }
    const r = this.request;
    if (!r) return false;
    if (m.type === "media_fallback") {
      if ((raw as { id: string }).id !== r.id) return false;
      this.toHost(raw);
      return true;
    }
    if (m.type === "rtc_signal") {
      const signal = DesktopMediaSignal.parse(raw);
      if (signal.id !== r.id || signal.signal.kind === "offer") return false;
      this.toHost(signal);
      return true;
    }
    if (m.type === "media_feedback") {
      const feedback = DesktopMediaFeedback.parse(raw);
      if (feedback.id !== r.id) return false;
      this.toHost(feedback);
      return true;
    }
    return false;
  }
  private publishRequest() {
    const r = this.request,
      s = this.source;
    if (r && s)
      this.toHost({
        type: "media_request",
        id: r.id,
        settings: r.settings,
        options: s.options,
        target: { title: s.ready.title, width: s.ready.width, height: s.ready.height },
        iceServers: this.iceServers,
      });
  }
  private toHost(value: unknown) {
    const host = this.host;
    if (!host) return;
    if (host.readyState !== WebSocket.OPEN || host.bufferedAmount >= 65536) {
      this.closeHost();
      return;
    }
    try {
      host.send(JSON.stringify(value));
    } catch {
      this.closeHost();
    }
  }
  private stopMedia(reason: "stopped" | "ended" | "congested") {
    const r = this.request;
    if (!r) return;
    this.request = undefined;
    this.toHost({ type: "media_stop", id: r.id });
    this.source?.policy(false);
    this.source?.send({ type: "media_status", id: r.id, state: "images", audio: false, reason });
  }
  end(owner: object) {
    if (this.source?.owner !== owner) return;
    this.stopMedia("stopped");
    this.source = undefined;
  }
  closeHost() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const ws = this.host;
    this.host = undefined;
    this.stopMedia("ended");
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      const t = setTimeout(() => ws.terminate(), 1000);
      t.unref();
      ws.once("close", () => clearTimeout(t));
      ws.close(1000, "Companion stopped");
    }
  }
  dispose() {
    this.closeHost();
    if (this.source) this.end(this.source.owner);
  }
}

/** Same B authentication and Origin/Host boundary as /ws; never accepts a provider ticket. */
export class DesktopCompanionServer {
  private wss = new WebSocketServer({
    noServer: true,
    maxPayload: 512 * 1024 + 12,
    perMessageDeflate: false,
  });
  private revoked;
  private sessions = new Map<WebSocket, string>();
  constructor(
    private hub: DesktopCompanionHub,
    private auth: AuthService,
    private origins: OriginRejectionLog,
  ) {
    this.revoked = auth.onSessionRevoked((id) => {
      for (const [ws, session] of this.sessions)
        if (id === undefined || id === session) ws.close(1008, "Session revoked");
    });
  }
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (code: string) => {
      socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`);
    };
    if (req.url !== "/desktop-companion" || !this.hub.enabled || !req.headers.origin) {
      reject("403 Forbidden");
      return;
    }
    if (
      !this.origins.admit(
        {
          path: "/desktop-companion",
          remoteAddress: req.socket.remoteAddress ?? "",
          origin: req.headers.origin,
          host: req.headers.host,
        },
        () => reject("403 Forbidden"),
      )
    )
      return;
    const auth = await this.auth.authorizeUpgrade({
      headers: req.headers as Record<string, string | undefined>,
      remoteAddress: req.socket.remoteAddress ?? "",
    });
    if (!auth.ok || socket.destroyed) {
      reject("401 Unauthorized");
      return;
    }
    if (this.sessions.size >= 1) {
      reject("409 Conflict");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.sessions.set(ws, auth.sessionId);
      ws.on("error", () => ws.terminate());
      ws.once("close", () => this.sessions.delete(ws));
      ws.on("message", () => {
        if (!this.auth.verifySession(auth.sessionId)) ws.close(1008, "Session expired");
      });
      this.hub.attach(ws);
    });
  }
  dispose() {
    this.hub.dispose();
    for (const ws of this.sessions.keys()) ws.terminate();
    this.revoked.dispose();
    this.wss.close();
  }
}
