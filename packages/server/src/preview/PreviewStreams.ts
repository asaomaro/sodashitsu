import { randomUUID } from "node:crypto";
import { request, type ClientRequest, type IncomingMessage } from "node:http";
import WebSocket from "ws";
import { PREVIEW_CHUNK_BYTES, PREVIEW_READ_BYTES, PREVIEW_WS_BYTES, RpcError, type PreviewApp, type PreviewHeaders, type PreviewResults } from "@sodashitsu/protocol";

const HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
function sanitized(headers: PreviewHeaders, requestSide: boolean): PreviewHeaders {
  const out: PreviewHeaders = {}, connection = String(headers.connection ?? "").toLowerCase().split(",").map((s) => s.trim());
  for (const [name, value] of Object.entries(headers)) {
    const n = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(n) || (Array.isArray(value) ? value : [value]).some((v) => /[\r\n\u0000]/.test(v))) throw new RpcError("invalid_params", "invalid HTTP header");
    if (HOP.has(n) || connection.includes(n) || requestSide && (n === "host" || n === "forwarded" || n.startsWith("x-forwarded-") || n.startsWith("sec-websocket-"))) continue;
    out[n] = value;
  }
  return out;
}

type Base = { id: string; owner: string; requestId: string; touched: number; reading: boolean; writing: boolean; bytesIn: number; bytesOut: number; failed: boolean };
type Http = Base & { kind: "http"; req: ClientRequest; response?: IncomingMessage; iterator?: AsyncIterator<Buffer>; headSent: boolean; pending: Buffer; writeEnded: boolean; origin: string; port: number };
type Ws = Base & { kind: "ws"; ws: WebSocket; queue: { data: Buffer; binary: boolean }[]; queued: number; ended: boolean };
type Stream = Http | Ws;

/** A bounded pull protocol carried in ordinary authenticated RPC JSON channels.
 * It shares the existing SSH/reverse bridge, but never pauses that entire link.
 */
export class PreviewStreams {
  private readonly streams = new Map<string, Stream>();
  private readonly sweeper: ReturnType<typeof setInterval>;
  constructor(private readonly authorize: (owner: string, requestId: string) => { app: PreviewApp; origin: string }, private readonly checkPort: (port: number) => Promise<void>) {
    this.sweeper = setInterval(() => { for (const s of this.streams.values()) if (Date.now() - s.touched > 30_000) this.close(s.id); }, 1000);
    this.sweeper.unref();
  }
  private base(owner: string, requestId: string): Base {
    if (this.streams.size >= 64 || [...this.streams.values()].filter((s) => s.owner === owner).length >= 24) throw new RpcError("server_busy", "preview stream limit");
    return { id: randomUUID(), owner, requestId, touched: Date.now(), reading: false, writing: false, bytesIn: 0, bytesOut: 0, failed: false };
  }
  private get(owner: string, id: string): Stream {
    const s = this.streams.get(id);
    if (!s || s.owner !== owner) throw new RpcError("not_found", "preview stream not found");
    try { this.authorize(owner, s.requestId); } catch (error) { this.close(id); throw error; }
    s.touched = Date.now();
    if (s.failed) { this.close(id); throw new RpcError("spawn_failed", "preview upstream connection failed"); }
    return s;
  }
  async begin(owner: string, p: { requestId: string; method: string; path: string; headers: PreviewHeaders }): Promise<{ streamId: string }> {
    const { app, origin } = this.authorize(owner, p.requestId);
    await this.checkPort(app.port);
    const current = this.authorize(owner, p.requestId);
    if (current.app.generation !== app.generation) throw new RpcError("not_found", "preview changed");
    const base = this.base(owner, p.requestId);
    const h = sanitized(p.headers, true);
    const u = new URL(origin);
    h["x-forwarded-host"] = u.host; h["x-forwarded-proto"] = u.protocol.slice(0, -1);
    const req = request({ hostname: "127.0.0.1", port: app.port, method: p.method, path: p.path, headers: h, agent: false, maxHeaderSize: 32 * 1024 });
    const s: Http = { ...base, kind: "http", req, headSent: false, pending: Buffer.alloc(0), writeEnded: false, origin, port: app.port };
    this.streams.set(s.id, s);
    req.setTimeout(30_000, () => { s.failed = true; req.destroy(); });
    req.on("error", () => { s.failed = true; });
    req.on("response", (res) => { s.response = res; res.on("error", () => { s.failed = true; }); s.iterator = res[Symbol.asyncIterator](); });
    req.flushHeaders(); return { streamId: s.id };
  }
  async write(owner: string, p: { streamId: string; data: string; end: boolean }): Promise<{}> {
    const s = this.get(owner, p.streamId);
    if (s.kind !== "http" || s.writing || s.writeEnded) throw new RpcError("invalid_params", "HTTP stream is not writable");
    const b = Buffer.from(p.data, "base64"); s.bytesIn += b.length;
    if (b.length > PREVIEW_CHUNK_BYTES || s.bytesIn > 64 * 1024 * 1024) { this.close(s.id); throw new RpcError("invalid_params", "preview upload limit"); }
    s.writing = true;
    try {
      if (b.length) await new Promise<void>((resolve, reject) => s.req.write(b, (e) => e ? reject(e) : resolve()));
      if (p.end) { s.writeEnded = true; s.req.end(); }
      return {};
    } catch { this.close(s.id); throw new RpcError("spawn_failed", "preview upload failed"); }
    finally { s.writing = false; }
  }
  async read(owner: string, id: string, maxBytes = PREVIEW_CHUNK_BYTES): Promise<PreviewResults["preview.http.read"]> {
    const s = this.get(owner, id);
    if (s.kind !== "http" || s.reading) throw new RpcError("invalid_params", "HTTP read already pending");
    if (!s.response) return { kind: "wait" };
    if (!s.headSent) {
      s.headSent = true;
      const raw = Object.fromEntries(Object.entries(s.response.headers).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined));
      const h = sanitized(raw, false);
      if (typeof h.location === "string") {
        try { const u = new URL(h.location); if (["127.0.0.1", "localhost"].includes(u.hostname) && Number(u.port || 80) === s.port && u.protocol === "http:") h.location = s.origin + u.pathname + u.search + u.hash; } catch { /* relative redirects stay relative */ }
      }
      return { kind: "head", status: s.response.statusCode ?? 502, headers: h };
    }
    s.reading = true;
    try {
      if (!s.pending.length) {
        // One iterator.next may remain pending across short polls, but never more than one.
        const item = await s.iterator!.next();
        if (item.done) { this.close(id); return { kind: "end" }; }
        s.pending = Buffer.from(item.value);
      }
      // Drain only bytes already buffered. Never wait for a batch to fill (SSE).
      const limit = Math.min(PREVIEW_READ_BYTES, Math.max(1, maxBytes));
      const parts: Buffer[] = [];
      let size = 0;
      for (;;) {
        const part = s.pending.subarray(0, limit - size);
        parts.push(part); size += part.length; s.pending = s.pending.subarray(part.length);
        if (size >= limit || s.response.readableLength === 0) break;
        const next = await s.iterator!.next();
        if (next.done) break;
        s.pending = Buffer.from(next.value);
      }
      const b = Buffer.concat(parts, size);
      s.bytesOut += b.length;
      if (s.bytesOut > 256 * 1024 * 1024) { this.close(id); throw new RpcError("invalid_params", "preview download limit"); }
      return { kind: "data", data: b.toString("base64") };
    } catch { this.close(id); throw new RpcError("spawn_failed", "preview response interrupted"); }
    finally { s.reading = false; s.touched = Date.now(); }
  }
  async wsBegin(owner: string, p: { requestId: string; path: string; headers: PreviewHeaders; protocols: string[] }): Promise<{ streamId: string; protocol: string }> {
    const { app } = this.authorize(owner, p.requestId);
    await this.checkPort(app.port);
    if (this.authorize(owner, p.requestId).app.generation !== app.generation) throw new RpcError("not_found", "preview changed");
    const base = this.base(owner, p.requestId);
    const h = sanitized(p.headers, true);
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}${p.path}`, p.protocols, { headers: h, handshakeTimeout: 5000, maxPayload: PREVIEW_WS_BYTES, perMessageDeflate: false, followRedirects: false });
    const s: Ws = { ...base, kind: "ws", ws, queue: [], queued: 0, ended: false };
    this.streams.set(s.id, s);
    ws.on("error", () => { s.failed = true; });
    ws.on("close", () => { s.ended = true; });
    ws.on("message", (raw, binary) => {
      const data = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)]);
      s.bytesOut += data.length; s.queued += data.length;
      if (s.queued > 1024 * 1024 || s.queue.length >= 256 || s.bytesOut > 256 * 1024 * 1024) { s.failed = true; ws.terminate(); return; }
      s.queue.push({ data, binary }); if (s.queued >= 128 * 1024 || s.queue.length >= 128) ws.pause();
    });
    try {
      await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); ws.once("close", () => reject(new Error("closed"))); });
      this.get(owner, s.id); return { streamId: s.id, protocol: ws.protocol };
    } catch { this.close(s.id); throw new RpcError("spawn_failed", "preview WebSocket connection failed"); }
  }
  async wsWrite(owner: string, p: { streamId: string; data: string; binary: boolean }): Promise<{}> {
    const s = this.get(owner, p.streamId);
    if (s.kind !== "ws" || s.writing || s.ws.readyState !== WebSocket.OPEN) throw new RpcError("invalid_params", "WebSocket is not writable");
    const b = Buffer.from(p.data, "base64"); s.bytesIn += b.length;
    if (b.length > PREVIEW_WS_BYTES || s.bytesIn > 64 * 1024 * 1024 || s.ws.bufferedAmount > PREVIEW_WS_BYTES) { this.close(s.id); throw new RpcError("server_busy", "preview WebSocket limit"); }
    s.writing = true;
    try { await new Promise<void>((resolve, reject) => s.ws.send(b, { binary: p.binary }, (error) => error ? reject(error) : resolve())); return {}; }
    catch { this.close(s.id); throw new RpcError("spawn_failed", "preview WebSocket write failed"); }
    finally { s.writing = false; }
  }
  wsRead(owner: string, id: string): PreviewResults["preview.ws.read"] {
    const s = this.get(owner, id);
    if (s.kind !== "ws") throw new RpcError("invalid_params", "not a WebSocket");
    const item = s.queue.shift();
    if (item) { s.queued -= item.data.length; if (s.queued < 64 * 1024 && s.queue.length < 64) s.ws.resume(); return { kind: "data", data: item.data.toString("base64"), binary: item.binary }; }
    if (s.ended) { this.close(id); return { kind: "end" }; }
    return { kind: "wait" };
  }
  cancel(owner: string, id: string): {} { const s = this.streams.get(id); if (s && s.owner !== owner) throw new RpcError("unauthorized", "not this stream"); this.close(id); return {}; }
  private close(id: string): void { const s = this.streams.get(id); if (!s) return; this.streams.delete(id); if (s.kind === "http") { s.req.destroy(); s.response?.destroy(); } else s.ws.terminate(); }
  clientGone(id: string): void { for (const s of this.streams.values()) if (s.owner === id) this.close(s.id); }
  cancelRequest(id: string): void { for (const s of this.streams.values()) if (s.requestId === id) this.close(s.id); }
  stats(): { streams: number; queuedMessages: number; queuedBytes: number } { return { streams: this.streams.size, queuedMessages: [...this.streams.values()].reduce((n, s) => n + (s.kind === "ws" ? s.queue.length : 0), 0), queuedBytes: [...this.streams.values()].reduce((n, s) => n + (s.kind === "ws" ? s.queued : s.pending.length), 0) }; }
  dispose(): void { clearInterval(this.sweeper); for (const s of this.streams.values()) this.close(s.id); }
}
