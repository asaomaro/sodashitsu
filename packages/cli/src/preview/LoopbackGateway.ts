import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

const COOKIE = "__Host-soda-preview";
const RESERVED = "/.soda-preview/";
const BODY_LIMIT = 2048;
const MAX_REQUESTS = 32;
const LEASE_MS = 30 * 60_000;
const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

export type PreviewHeaders = Record<string, string | string[]>;

/** Only the fixed, preauthorized application transport is exposed to this listener. */
export interface PreviewGatewayTransport {
  prepareWebsocket?(req: { path: string; headers: PreviewHeaders; protocols: string[]; signal: AbortSignal }): Promise<{ protocol: string; attach(socket: WebSocket): Promise<void>; close(): Promise<void> }>;
  http(req: { method: string; path: string; headers: PreviewHeaders; body: AsyncIterable<Uint8Array>; signal: AbortSignal }, res: {
    head(status: number, headers: PreviewHeaders): void;
    write(chunk: Uint8Array): Promise<void>;
    end(): void;
  }): Promise<void>;
  websocket(req: { path: string; headers: PreviewHeaders; protocols: string[]; signal: AbortSignal }, socket: WebSocket): Promise<void>;
}

function equals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

function cleanHeaders(headers: Record<string, string | string[] | undefined>, upstream: boolean): PreviewHeaders {
  const result: PreviewHeaders = {};
  const connection = String(headers.connection ?? "").toLowerCase().split(",").map((s) => s.trim());
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value === undefined || HOP.has(lower) || connection.includes(lower)) continue;
    if (upstream && (lower === "host" || lower === "forwarded" || lower.startsWith("x-forwarded-") || lower.startsWith("sec-websocket-"))) continue;
    if (upstream && lower === "cookie") {
      const cookie = String(value).split(";").filter((p) => !p.trim().split("=")[0]?.startsWith(COOKIE)).join(";").trim();
      if (cookie) result.cookie = cookie;
    } else if (!upstream && lower === "set-cookie") {
      const cookies = (Array.isArray(value) ? value : [value]).filter((s) => !s.trim().split("=")[0]?.startsWith(COOKIE))
        // Application cookies cannot widen their host boundary through an HTTP response.
        .map((s) => s.replace(/;\s*domain\s*=[^;]*/gi, ""));
      if (cookies.length) result[lower] = cookies;
    } else result[lower] = value;
  }
  return result;
}

/** One app/session, one random direct child of .localhost, loopback-only socket. */
export class LoopbackGateway {
  private readonly server = createServer({ maxHeaderSize: 32 * 1024, requestTimeout: 120_000 }, (req, res) => {
    void this.handle(req, res).catch(() => { if (res.headersSent) res.destroy(); else res.writeHead(502).end(); });
  });
  private readonly protocols = new WeakMap<IncomingMessage, string>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false,
    handleProtocols: (protocols, request) => this.protocols.has(request) ? this.protocols.get(request) || false : protocols.values().next().value || false });
  private readonly secret = randomBytes(32).toString("base64url");
  private readonly ticket = randomBytes(32).toString("base64url");
  private ticketUsed = false;
  private readonly requests = new Set<AbortController>();
  private readonly sockets = new Set<Duplex>();
  private readonly expiresAt: number;
  private closed = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  private host = "";
  private origin = "";
  private readonly parent: string;

  private constructor(private readonly transport: PreviewGatewayTransport, parentOrigin: string, leaseMs: number) {
    const parent = new URL(parentOrigin);
    if (!["https:", "http:"].includes(parent.protocol) || parent.origin !== parentOrigin || parent.username || parent.password)
      throw new Error("parent must be an exact HTTP(S) origin");
    if (parent.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(parent.hostname))
      throw new Error("non-loopback parent requires HTTPS");
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > LEASE_MS) throw new Error("invalid preview lease");
    this.parent = parent.origin;
    this.expiresAt = Date.now() + leaseMs;
    this.timer = setTimeout(() => { void this.close(); }, leaseMs);
    this.timer.unref();
    this.server.maxConnections = 64;
    this.server.headersTimeout = 10_000;
    this.server.on("connection", (socket) => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); });
    this.server.on("upgrade", (req, socket, head) => {
      void (async () => {
      if (!this.admit(req) || !this.authenticated(req) || req.headers.origin !== this.origin || this.requests.size >= MAX_REQUESTS || !this.path(req)) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); return;
      }
      const ctrl = this.track();
      // handleUpgrade may reject before its callback (bad key/version, etc.).
      // Own the underlying socket before entering it so these slots are released too.
      socket.once("close", () => this.release(ctrl));
      const args = { path: req.url!, headers: cleanHeaders(req.headers, true), protocols: String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim()).filter(Boolean), signal: ctrl.signal };
      let prepared: Awaited<ReturnType<NonNullable<PreviewGatewayTransport["prepareWebsocket"]>>> | undefined;
      try {
        prepared = await transport.prepareWebsocket?.(args);
        if (prepared) {
          if (ctrl.signal.aborted || prepared.protocol && !args.protocols.includes(prepared.protocol)) { await prepared.close(); socket.destroy(); return; }
          this.protocols.set(req, prepared.protocol);
          ctrl.signal.addEventListener("abort", () => { void prepared?.close(); }, { once: true });
        }
      } catch { this.release(ctrl); socket.destroy(); return; }
      try { this.wss.handleUpgrade(req, socket, head, (ws) => {
        ws.on("error", () => undefined);
        ctrl.signal.addEventListener("abort", () => ws.terminate(), { once: true });
        ws.once("close", () => this.release(ctrl));
        void (prepared ? prepared.attach(ws) : transport.websocket(args, ws))
          .catch(() => ws.close(1011, "preview connection failed"));
      }); } catch { this.release(ctrl); socket.destroy(); }
      })().catch(() => socket.destroy());
    });
  }

  static async listen(transport: PreviewGatewayTransport, parentOrigin: string, leaseMs = LEASE_MS): Promise<LoopbackGateway> {
    const gateway = new LoopbackGateway(transport, parentOrigin, leaseMs);
    try {
      await new Promise<void>((resolve, reject) => {
        gateway.server.once("error", reject);
        gateway.server.listen(0, "127.0.0.1", () => { gateway.server.off("error", reject); resolve(); });
      });
      const address = gateway.server.address();
      if (!address || typeof address === "string") throw new Error("no preview listener");
      gateway.host = `p${randomUUID().replaceAll("-", "")}.localhost:${address.port}`;
      gateway.origin = `http://${gateway.host}`;
      return gateway;
    } catch (error) { await gateway.close(); throw error; }
  }

  /** Send this capability only to the selected authenticated viewer. Never log it. */
  bootstrap(): { origin: string; url: string; expiresAt: number } {
    return { origin: this.origin, url: `${this.origin}${RESERVED}bootstrap#${this.ticket}`, expiresAt: this.expiresAt };
  }

  private admit(req: IncomingMessage): boolean {
    return !this.closed && Date.now() < this.expiresAt && req.headers.host === this.host &&
      ["127.0.0.1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
  }
  private path(req: IncomingMessage): boolean {
    const raw = req.url ?? "";
    return raw.startsWith("/") && !raw.startsWith("//") && !/[\\\r\n\u0000]/.test(raw) && !raw.startsWith(RESERVED);
  }
  private authenticated(req: IncomingMessage): boolean {
    const cookies = (req.headers.cookie ?? "").split(";").map((s) => s.trim()).filter((s) => s.startsWith(COOKIE + "="));
    return cookies.length === 1 && equals(cookies[0]!.slice(COOKIE.length + 1), this.secret);
  }
  private track(): AbortController { const ctrl = new AbortController(); this.requests.add(ctrl); return ctrl; }
  private release(ctrl: AbortController): void { this.requests.delete(ctrl); ctrl.abort(); }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!this.admit(req)) { res.writeHead(403).end(); return; }
    const raw = req.url ?? "";
    if (raw === RESERVED + "bootstrap" && req.method === "GET") {
      if (this.authenticated(req)) { res.writeHead(303, { Location: "/" }).end(); return; }
      const nonce = randomBytes(16).toString("base64url");
      res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${this.parent}; base-uri 'none'; form-action 'none'`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><p id="state">Connecting preview…</p><script nonce="${nonce}">const t=location.hash.slice(1);history.replaceState(null,'',location.pathname);fetch('./authorize',{method:'POST',headers:{'Content-Type':'text/plain'},body:t}).then(r=>{if(!r.ok)throw Error();location.replace('/')}).catch(()=>{document.querySelector('#state').textContent='Preview authorization failed. Start a new preview session.'})</script>`);
      return;
    }
    if (raw === RESERVED + "authorize" && req.method === "POST") {
      if (req.headers.origin !== this.origin || this.ticketUsed || req.headers["content-type"] !== "text/plain") { res.writeHead(403).end(); return; }
      let body = "";
      for await (const chunk of req) { body += String(chunk); if (body.length > BODY_LIMIT) { res.writeHead(413).end(); return; } }
      if (this.ticketUsed || !equals(body, this.ticket)) { res.writeHead(403).end(); return; }
      this.ticketUsed = true;
      res.setHeader("Set-Cookie", `${COOKIE}=${this.secret}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${Math.max(1, Math.floor((this.expiresAt - Date.now()) / 1000))}`);
      res.writeHead(204).end(); return;
    }
    if (!this.path(req) || !this.authenticated(req)) { res.writeHead(403).end(); return; }
    if (req.headers.origin !== undefined && req.headers.origin !== this.origin) { res.writeHead(403).end(); return; }
    if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method ?? "")) { res.writeHead(405).end(); return; }
    if (this.requests.size >= MAX_REQUESTS) { res.writeHead(429).end(); return; }
    const ctrl = this.track();
    let timeout = setTimeout(() => ctrl.abort(), 120_000);
    timeout.unref();
    let received = 0;
    let sent = 0;
    const body = async function* () {
      for await (const chunk of req) {
        received += (chunk as Buffer).length;
        if (received > 64 * 1024 * 1024) throw new Error("preview upload too large");
        yield chunk as Buffer;
      }
    };
    res.once("close", () => this.release(ctrl));
    ctrl.signal.addEventListener("abort", () => { if (!res.writableEnded) res.destroy(); }, { once: true });
    try {
      await this.transport.http({ method: req.method!, path: raw, headers: cleanHeaders(req.headers, true), body: body(), signal: ctrl.signal }, {
        head: (status, headers) => {
          if (res.destroyed) return;
          // An upstream CSP is preserved; sandbox is also enforced by the parent iframe.
          for (const [name, value] of Object.entries(cleanHeaders(headers, false))) res.setHeader(name, value);
          const upstreamCsp = res.getHeader("Content-Security-Policy");
          res.setHeader("Content-Security-Policy", [...(Array.isArray(upstreamCsp) ? upstreamCsp : upstreamCsp ? [String(upstreamCsp)] : []), `frame-ancestors ${this.parent}`]);
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Referrer-Policy", "no-referrer");
          if (String(headers["content-type"] ?? "").startsWith("text/event-stream")) {
            clearTimeout(timeout);
            timeout = setTimeout(() => ctrl.abort(), Math.max(1, this.expiresAt - Date.now()));
            timeout.unref();
          }
          res.writeHead(status);
        },
        write: async (chunk) => {
          if (ctrl.signal.aborted) throw new Error("preview cancelled");
          sent += chunk.byteLength;
          if (sent > 256 * 1024 * 1024) throw new Error("preview download too large");
          await new Promise<void>((resolve, reject) => { res.write(chunk, (error) => error ? reject(error) : resolve()); });
        },
        end: () => res.end(),
      });
    } finally { clearTimeout(timeout); this.release(ctrl); }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    for (const ctrl of this.requests) ctrl.abort();
    this.requests.clear();
    for (const ws of this.wss.clients) ws.terminate();
    for (const socket of this.sockets) socket.destroy();
    this.wss.close();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
