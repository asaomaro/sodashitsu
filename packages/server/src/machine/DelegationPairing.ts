import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import { RpcError, delegationUrl, type PairingRequest } from "@sodashitsu/protocol";
import { labelProblem } from "./machineRules.js";

type Grant = { machineId: string; token: string };
type Incoming = PairingRequest & { ws: WebSocket; attempts: number; busy: boolean };
type Outgoing = {
  url: string;
  ws: WebSocket;
  timer: ReturnType<typeof setTimeout>;
  expiresAt: number;
  confirm?: { resolve: (g: Grant & { url: string }) => void; reject: (e: Error) => void };
};
const TTL = 5 * 60_000;
/** Unauthenticated transport has no bridge access. Only a code learned out of band can mint a grant. */
export class DelegationPairing {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  private readonly incoming = new Map<string, Incoming>();
  private readonly outgoing = new Map<string, Outgoing>();
  private readonly rate = new Map<string, { count: number; until: number }>();
  private readonly sweep: ReturnType<typeof setInterval>;
  constructor(
    private readonly deps: {
      invite: (label: string) => Promise<Grant>;
      changed: (request: PairingRequest, closed: boolean) => void;
      now?: () => number;
    },
  ) {
    this.sweep = setInterval(() => this.expire(), 1000);
    this.sweep.unref();
  }
  private now() {
    return this.deps.now?.() ?? Date.now();
  }
  private expire() {
    const now = this.now();
    for (const p of this.incoming.values()) if (p.expiresAt <= now) p.ws.terminate();
    for (const [ip, r] of this.rate) if (r.until <= now) this.rate.delete(ip);
  }
  list() {
    this.expire();
    return {
      requests: [...this.incoming.values()]
        .filter((p) => p.expiresAt > this.now() && !p.busy)
        .map(({ id, label, code, expiresAt, address }) => ({
          id,
          label,
          code,
          expiresAt,
          address,
        })),
    };
  }
  reject(id: string) {
    const p = this.incoming.get(id);
    if (!p) throw new RpcError("not_found", "申請が見つかりません");
    p.busy = true;
    p.ws.terminate();
    return {};
  }
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = () =>
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n", () => socket.destroy());
    if (req.headers.origin !== undefined || req.url !== "/machine-pairing") return reject();
    this.expire();
    const address = req.socket.remoteAddress ?? "unknown";
    const r = this.rate.get(address) ?? { count: 0, until: this.now() + TTL };
    // Bound both the key map and total unauthenticated sockets, including those not sending their first frame.
    if (
      this.wss.clients.size >= 16 ||
      (this.rate.size >= 256 && !this.rate.has(address)) ||
      r.count >= 10
    )
      return reject();
    r.count++;
    this.rate.set(address, r);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      let p: Incoming | undefined;
      const first = setTimeout(() => ws.terminate(), 10_000);
      first.unref();
      ws.on("error", () => undefined);
      ws.once("close", () => {
        clearTimeout(first);
        if (p && this.incoming.get(p.id) === p) {
          this.incoming.delete(p.id);
          this.deps.changed(p, true);
        }
      });
      ws.on("message", (bytes, binary) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (binary) {
          ws.terminate();
          return;
        }
        let data: any;
        try {
          data = JSON.parse(String(bytes));
        } catch {
          ws.terminate();
          return;
        }
        if (!p) {
          if (
            data?.type !== "request" ||
            typeof data.label !== "string" ||
            labelProblem(data.label, [])
          ) {
            ws.terminate();
            return;
          }
          clearTimeout(first);
          let code: string;
          do {
            code = String(randomInt(100_000_000)).padStart(8, "0");
          } while ([...this.incoming.values()].some((existing) => existing.code === code));
          p = {
            id: randomUUID(),
            label: data.label,
            code,
            expiresAt: this.now() + TTL,
            address,
            ws,
            attempts: 0,
            busy: false,
          };
          this.incoming.set(p.id, p);
          ws.send(JSON.stringify({ type: "pending", id: p.id, expiresAt: p.expiresAt }));
          this.deps.changed(p, false);
          return;
        }
        if (p.busy) return;
        if (p.expiresAt <= this.now()) {
          ws.terminate();
          return;
        }
        const code = data?.code;
        if (data?.type !== "confirm" || typeof code !== "string" || !/^\d{8}$/.test(code)) {
          ws.terminate();
          return;
        }
        if (!timingSafeEqual(Buffer.from(code), Buffer.from(p.code))) {
          if (++p.attempts >= 5) {
            p.busy = true;
            ws.terminate();
          } else ws.send(JSON.stringify({ type: "error", message: "確認コードが違います" }));
          return;
        }
        // Consume before asynchronous disk writes, preventing parallel/replayed confirmations.
        p.busy = true;
        this.deps
          .invite(p.label)
          .then((grant) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "accepted", ...grant }), () => ws.close());
          })
          .catch(() => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "登録できません。名前の重複や登録上限を確認してください",
                }),
                () => ws.close(),
              );
          });
      });
    });
  }
  async request(url: string, label: string): Promise<{ id: string; expiresAt: number }> {
    if (this.outgoing.size >= 8) throw new RpcError("server_busy", "申請数の上限です");
    const problem = labelProblem(label, []);
    if (problem) throw new RpcError("invalid_params", problem);
    const target = new URL(delegationUrl(url));
    target.pathname = "/machine-pairing";
    const id = randomUUID();
    const ws = new WebSocket(target, {
      followRedirects: false,
      handshakeTimeout: 10_000,
      perMessageDeflate: false,
      maxPayload: 1024,
    });
    const timer = setTimeout(() => ws.terminate(), TTL);
    timer.unref();
    const entry: Outgoing = { url: delegationUrl(url), ws, timer, expiresAt: this.now() + TTL };
    this.outgoing.set(id, entry);
    return new Promise((resolve, reject) => {
      let pending = false;
      let reason = "";
      const failed = () =>
        new RpcError(
          "invalid_params",
          `申請が終了しました。接続先・TLS・有効期限を確認して再申請してください${reason ? `（${reason}）` : ""}`,
        );
      ws.on("unexpected-response", (_req, res) => {
        reason = `接続先がHTTP ${res.statusCode} を返しました`;
        res.resume();
        ws.terminate();
      });
      ws.on("error", (error: NodeJS.ErrnoException) => {
        // Show a bounded transport code, never raw exception text or response bodies.
        if (!reason && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code))
          reason = error.code;
      });
      ws.once("close", () => {
        clearTimeout(timer);
        this.outgoing.delete(id);
        entry.confirm?.reject(failed());
        if (!pending) reject(failed());
      });
      ws.once("open", () => ws.send(JSON.stringify({ type: "request", label })));
      ws.on("message", (bytes, binary) => {
        if (binary) {
          ws.terminate();
          return;
        }
        let data: any;
        try {
          data = JSON.parse(String(bytes));
        } catch {
          ws.terminate();
          return;
        }
        if (data?.type === "pending" && !pending && Number.isFinite(data.expiresAt)) {
          pending = true;
          resolve({ id, expiresAt: entry.expiresAt });
          return;
        }
        if (data?.type === "error" && entry.confirm) {
          entry.confirm.reject(
            new RpcError("invalid_params", "コードの照合または登録に失敗しました"),
          );
          delete entry.confirm;
          return;
        }
        if (
          data?.type === "accepted" &&
          entry.confirm &&
          /^[0-9a-f]{32}$/.test(data.machineId) &&
          /^[A-Za-z0-9_-]{43}$/.test(data.token)
        ) {
          entry.confirm.resolve({ url: entry.url, machineId: data.machineId, token: data.token });
          delete entry.confirm;
          ws.close();
          return;
        }
        ws.terminate();
      });
    });
  }
  confirm(id: string, code: string): Promise<Grant & { url: string }> {
    const p = this.outgoing.get(id);
    if (!p || p.ws.readyState !== WebSocket.OPEN || p.expiresAt <= this.now())
      throw new RpcError("not_found", "有効な申請が見つかりません");
    if (p.confirm) throw new RpcError("server_busy", "照合中です");
    return new Promise((resolve, reject) => {
      p.confirm = { resolve, reject };
      p.ws.send(JSON.stringify({ type: "confirm", code }));
    });
  }
  close() {
    clearInterval(this.sweep);
    for (const ws of this.wss.clients) ws.terminate();
    for (const p of this.outgoing.values()) p.ws.terminate();
    this.wss.close();
  }
}
