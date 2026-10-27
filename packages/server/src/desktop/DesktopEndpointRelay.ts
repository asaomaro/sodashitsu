import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import {
  DESKTOP_ENDPOINT_PROTOCOL,
  DesktopEndpointHello,
  DesktopEndpointMachine,
} from "@sodashitsu/protocol";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { MachineManager } from "../machine/MachineManager.js";
import { DesktopBridgeRpc } from "./bridgeRpc.js";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const rawBytes = (raw: RawData) =>
  Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
const quiet = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* Close every owned connection. */
  }
};
const Viewer = z
  .object({
    type: z.literal("viewer"),
    machineId: DesktopEndpointMachine,
    session: z.string().uuid(),
    hello: DesktopEndpointHello,
    parent: z.string().uuid().optional(),
    attachment: z.string().uuid().optional(),
    binding: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.session === value.hello.session &&
      value.hello.generation === 1 &&
      (value.hello.role === "viewer" || value.hello.role === "agent" && !value.parent && !value.attachment && !value.binding) &&
      [value.parent, value.attachment, value.binding].filter((value) => value !== undefined)
        .length %
        3 ===
        0,
  );
type Root = {
  role:"viewer"|"agent";
  session: string;
  machine: string;
  auth: string;
  origin: string;
  rpc?: DesktopBridgeRpc;
  pairs: Set<Pair>;
  closed: boolean;
  close(): void;
};
type Pair = {
  root: Root;
  viewer: WebSocket;
  provider?: WebSocket;
  session: string;
  at: number;
  hello: z.infer<typeof DesktopEndpointHello>;
  ticketHash: string;
  closed: boolean;
  close(): void;
};
/** A has only public handshakes/routing metadata and opaque records. It never
 * receives endpoint private keys, trust decisions, helper tickets or plaintext. */
export class DesktopEndpointRelay {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: 4 * 1024 * 1024,
    perMessageDeflate: false,
    handleProtocols: (protocols) =>
      protocols.has(DESKTOP_ENDPOINT_PROTOCOL) ? DESKTOP_ENDPOINT_PROTOCOL : false,
  });
  private readonly sockets = new Set<WebSocket>();
  private readonly pending = new Set<WebSocket>();
  private readonly upgrades = new Set<Duplex>();
  private readonly roots = new Map<string, Root>();
  private readonly pairs = new Map<string, Pair>();
  private readonly invites = new Map<string, Pair>();
  private readonly revoked: { dispose(): void };
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(
    private readonly auth: Pick<
      AuthService,
      "authorizeUpgrade" | "verifySession" | "onSessionRevoked"
    >,
    private readonly origins: Pick<OriginRejectionLog, "admit">,
    private readonly machines: Pick<MachineManager, "route">,
  ) {
    this.revoked = auth.onSessionRevoked((id) => {
      for (const root of [...this.roots.values()]) if (root.auth === id) root.close();
    });
    this.timer = setInterval(() => {
      for (const pair of [...this.pairs.values()])
        if (
          !this.auth.verifySession(pair.root.auth) ||
          (!pair.provider && performance.now() - pair.at >= 10000)
        )
          pair.close();
      for (const socket of this.sockets) if (socket.readyState === WebSocket.OPEN) socket.ping();
    }, 1000);
    this.timer.unref();
  }
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reject = (status: string) =>
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if (this.closed || this.sockets.size + this.upgrades.size >= 128) {
      reject("503 Service Unavailable");
      return;
    }
    if (
      req.url !== "/desktop-e2e" ||
      req.headers["sec-websocket-protocol"] !== DESKTOP_ENDPOINT_PROTOCOL
    ) {
      reject("400 Bad Request");
      return;
    }
    this.upgrades.add(socket);
    try {
      const origin = req.headers.origin;
      let session: string | undefined;
      if (origin !== undefined) {
        if (
          !this.origins.admit(
            {
              path: "/desktop-e2e",
              remoteAddress: req.socket.remoteAddress ?? "",
              origin,
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
        if (!auth.ok || !this.auth.verifySession(auth.sessionId)) {
          reject("401 Unauthorized");
          return;
        }
        session = auth.sessionId;
      } else if (this.pending.size >= 8) {
        reject("503 Service Unavailable");
        return;
      }
      if (this.closed || socket.destroyed || this.sockets.size >= 128) {
        reject("503 Service Unavailable");
        return;
      }
      this.server.handleUpgrade(req, socket, head, (ws) => this.accept(ws, session, origin));
    } finally {
      this.upgrades.delete(socket);
    }
  }
  private accept(ws: WebSocket, session: string | undefined, origin: string | undefined): void {
    this.sockets.add(ws);
    this.pending.add(ws);
    let pair: Pair | undefined;
    const timer = setTimeout(() => ws.terminate(), 5000);
    timer.unref();
    ws.on("error", () => ws.terminate());
    ws.once("close", () => {
      clearTimeout(timer);
      this.sockets.delete(ws);
      this.pending.delete(ws);
      pair?.close();
    });
    ws.on("message", (raw, binary) => {
      const bytes = rawBytes(raw);
      try {
        if (!pair) {
          if (binary || bytes.length > 4096) throw Error("endpoint attach");
          const message = JSON.parse(bytes.toString());
          if (session && origin) {
            if (!this.auth.verifySession(session)) throw Error("expired session");
            const metadata = Viewer.parse(message);
            if (this.pairs.has(metadata.session)) throw Error("endpoint already exists");
            let root: Root;
            if (metadata.parent) {
              const parent = this.roots.get(metadata.parent);
              if (
                !parent ||
                parent.role!=="viewer" ||
                parent.closed ||
                parent.auth !== session ||
                parent.origin !== origin ||
                parent.machine !== metadata.machineId ||
                parent.pairs.size >= 8 ||
                !parent.rpc ||
                parent.rpc.isClosed()
              )
                throw Error("invalid endpoint parent");
              root = parent;
            } else {
              if ([...this.roots.values()].filter(root=>root.role===metadata.hello.role).length >= 8) throw Error("endpoint limit");
              const created: Root = {
                role:metadata.hello.role as "viewer"|"agent",
                session: metadata.session,
                machine: metadata.machineId,
                auth: session,
                origin,
                pairs: new Set(),
                closed: false,
                close: () => {
                  if (created.closed) return;
                  created.closed = true;
                  this.roots.delete(created.session);
                  for (const pair of [...created.pairs]) quiet(pair.close);
                  created.pairs.clear();
                  quiet(() => created.rpc?.close());
                },
              };
              root = created;
              this.roots.set(root.session, root);
            }
            const ticket = randomBytes(32).toString("base64url"),
              created: Pair = {
                root,
                viewer: ws,
                session: metadata.session,
                at: performance.now(),
                hello: metadata.hello,
                ticketHash: hash(ticket),
                closed: false,
                close: () => {
                  if (created.closed) return;
                  created.closed = true;
                  this.pairs.delete(created.session);
                  this.invites.delete(created.ticketHash);
                  root.pairs.delete(created);
                  quiet(() => created.viewer.terminate());
                  quiet(() => created.provider?.terminate());
                  if (created.session === root.session) quiet(root.close);
                },
              };
            pair = created;
            root.pairs.add(pair);
            this.pairs.set(pair.session, pair);
            this.invites.set(pair.ticketHash, pair);
            this.pending.delete(ws);
            clearTimeout(timer);
            void this.start(pair, ticket, metadata).catch(() => pair?.close());
          } else {
            const message = z
              .object({
                type: z.literal("provider"),
                ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
              })
              .strict()
              .parse(JSON.parse(bytes.toString()));
            const candidate = this.invites.get(hash(message.ticket));
            if (
              !candidate ||
              candidate.closed ||
              candidate.provider ||
              candidate.root.closed ||
              performance.now() - candidate.at >= 10000 ||
              !this.auth.verifySession(candidate.root.auth)
            )
              throw Error("invalid endpoint ticket");
            this.invites.delete(candidate.ticketHash);
            pair = candidate;
            pair.provider = ws;
            this.pending.delete(ws);
            clearTimeout(timer);
            if (pair.viewer.readyState !== WebSocket.OPEN) throw Error("viewer gone");
            ws.send(JSON.stringify({ type: "hello", hello: pair.hello }));
          }
          return;
        }
        if (
          pair.closed ||
          pair.root.closed ||
          !this.auth.verifySession(pair.root.auth) ||
          !pair.provider ||
          (!binary && bytes.length > 4096)
        )
          throw Error("endpoint stopped");
        const target = ws === pair.viewer ? pair.provider : pair.viewer;
        if (target.readyState !== WebSocket.OPEN || target.bufferedAmount > 8 * 1024 * 1024)
          throw Error("endpoint congested");
        target.send(bytes, { binary });
      } catch {
        if (pair) pair.close();
        else ws.terminate();
      }
    });
  }
  private async start(pair: Pair, ticket: string, metadata: z.infer<typeof Viewer>): Promise<void> {
    const root = pair.root;
    if (!metadata.parent) {
      const route = this.machines.route(root.machine);
      if (route.kind !== "ok") throw Error("machine unavailable");
      const channel = route.link.openChannel();
      if (!channel) throw Error("machine unavailable");
      root.rpc = new DesktopBridgeRpc(channel, root.close, {
        label: "暗号化デスクトップ",
        closeOnTimeout: false,
      });
      await root.rpc.hello();
    }
    if (pair.closed || root.closed || !root.rpc || !this.auth.verifySession(root.auth))
      throw Error("endpoint stopped");
    const url = new URL("/desktop-e2e", root.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    await root.rpc.request(
      "desktop.endpoint.start",
      {
        url: url.href,
        ticket,
        machineId: metadata.machineId,
        session: metadata.session,
        hello: metadata.hello,
        ...(metadata.parent
          ? {
              parent: metadata.parent,
              attachment: metadata.attachment!,
              binding: metadata.binding!,
            }
          : {}),
      },
      { timeoutMs: 30000 },
    );
    if (pair.closed || root.closed) throw Error("endpoint stopped");
  }
  closeShares(): void {
    for (const root of [...this.roots.values()]) quiet(root.close);
    for (const socket of this.pending) quiet(() => socket.terminate());
    for (const socket of this.upgrades) quiet(() => socket.destroy());
    this.pending.clear();
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.revoked.dispose();
    this.closeShares();
    this.server.close();
  }
}
