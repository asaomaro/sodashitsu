import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";

const hash = (ticket: string) => createHash("sha256").update(ticket).digest("hex");
type Pair = {
  sessionId: string; origin: string; at: number;
  provider?: WebSocket; viewer?: WebSocket; dead: boolean;
  receive(bytes: Buffer, binary: boolean): void;
  ready(): void; failed(): void;
};
/** One-use, role/session/parent-bound tickets. The video sockets never accept input. */
export class DesktopVideoLanes {
  private tickets = new Map<string, { pair: Pair; role: "provider" | "viewer" }>();
  private pairs = new Set<Pair>();
  private pending = new Set<WebSocket>();
  constructor(private validSession: (id: string) => boolean) {}
  get pendingCount() { return this.pending.size; }
  issue(sessionId: string, origin: string, receive: Pair["receive"], ready: () => void, failed: () => void) {
    const pair: Pair = { sessionId, origin, receive, ready, failed, at: performance.now(), dead: false };
    this.pairs.add(pair);
    const providerTicket = randomBytes(32).toString("base64url"), viewerTicket = randomBytes(32).toString("base64url");
    this.tickets.set(hash(providerTicket), { pair, role: "provider" });
    this.tickets.set(hash(viewerTicket), { pair, role: "viewer" });
    return {
      providerTicket, viewerTicket,
      send: (value: unknown) => {
        const ws = pair.viewer;
        if (pair.dead || !pair.provider || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 512 * 1024) return false;
        ws.send(value instanceof Uint8Array ? value : JSON.stringify(value));
        return true;
      },
      buffered: () => pair.viewer?.bufferedAmount ?? 0,
      close: () => this.end(pair, false),
      fail: () => this.end(pair, true),
    };
  }
  accept(ws: WebSocket, sessionId: string, origin?: string) {
    if (this.pending.size >= 8) { ws.terminate(); return; }
    this.pending.add(ws);
    let pair: Pair | undefined;
    const deadline = setTimeout(() => ws.terminate(), 5000);
    deadline.unref();
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      clearTimeout(deadline); this.pending.delete(ws);
      if (pair) this.end(pair, true);
    });
    ws.on("message", (raw, binary) => {
      const bytes = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      try {
        if (!pair) {
          if (binary || bytes.length > 256) throw Error("Video attach required");
          const m = JSON.parse(bytes.toString());
          if (Object.keys(m).length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(m.ticket)) throw Error("Invalid video ticket");
          const invite = this.tickets.get(hash(m.ticket));
          if (!invite || invite.pair.dead || performance.now() - invite.pair.at >= 10000 || !this.validSession(invite.pair.sessionId)) throw Error("Expired video ticket");
          const p = invite.pair, role = invite.role;
          if (role === "viewer" ? m.type !== "video_viewer" || sessionId !== p.sessionId || origin !== p.origin || p.viewer : m.type !== "video_provider" || origin !== undefined || p.provider) throw Error("Wrong video owner");
          this.tickets.delete(hash(m.ticket)); pair = p; p[role] = ws;
          clearTimeout(deadline); this.pending.delete(ws);
          if (p.provider && p.viewer) p.ready();
          return;
        }
        if (pair.dead || ws !== pair.provider || !pair.viewer || !this.validSession(pair.sessionId)) throw Error("Video receive only");
        pair.receive(bytes, binary);
      } catch { ws.terminate(); }
    });
  }
  tick() {
    for (const p of this.pairs) {
      if (!this.validSession(p.sessionId) || ((!p.viewer || !p.provider) && performance.now() - p.at >= 10000)) this.end(p, true);
      else for (const ws of [p.viewer, p.provider]) if (ws?.readyState === WebSocket.OPEN) ws.ping();
    }
  }
  private end(p: Pair, notify: boolean) {
    if (p.dead) return;
    p.dead = true; this.pairs.delete(p);
    for (const [key, invite] of this.tickets) if (invite.pair === p) this.tickets.delete(key);
    for (const ws of [p.viewer, p.provider]) if (ws) ws.terminate();
    if (notify) p.failed();
  }
  close() {
    for (const p of this.pairs) this.end(p, false);
    for (const ws of this.pending) ws.terminate();
    this.pending.clear();
  }
}
