import { DelegationPairing } from "./DelegationPairing.js";
import { EventEmitter } from "node:events";
import { PassThrough, type Duplex } from "node:stream";
import type { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer, createWebSocketStream } from "ws";
import { RpcError, delegationUrl, type DelegationStatus } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import type { BridgeEndpoint, BridgeSocketLike } from "./BridgeEndpoint.js";
import type { DelegationGrants } from "./DelegationGrants.js";
import { OutboundDelegationStore } from "./OutboundDelegationStore.js";
import { realClock, type Clock } from "./MachineLink.js";
import { MachineLink, type ChildLike } from "./MachineLink.js";
import type { MachineManager } from "./MachineManager.js";

/** Adapt an authenticated WS stream to the existing, bounded bridge protocol. No shell or SSH is involved. */
function childOf(stream: Duplex, ws: WebSocket): ChildLike {
  const child = new EventEmitter(),
    stderr = new PassThrough();
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    stream.destroy();
    stderr.destroy();
    child.emit("close", 0, null);
  };
  stream.on("close", finish);
  ws.once("close", finish);
  stream.on("error", (error: NodeJS.ErrnoException) => child.emit("error", error));
  return Object.assign(child, {
    stdin: stream,
    stdout: stream,
    stderr,
    kill: () => {
      stream.destroy();
      return true;
    },
  }) as ChildLike;
}
type Outbound = {
  status: DelegationStatus;
  key: string;
  ws?: WebSocket | undefined;
  retry?: ReturnType<typeof setTimeout> | undefined;
  attempt: number;
  stopped: boolean;
  health?: unknown;
};
export class ReverseConnections {
  private readonly wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 65 * 1024 * 1024,
  });
  private readonly outbound = new Map<string, Outbound>();
  private readonly pending = new Map<string, Duplex>();
  private authenticating = 0;
  private mutations: Promise<unknown> = Promise.resolve();
  private readonly store: OutboundDelegationStore;
  readonly pairing: DelegationPairing;
  private readonly clock: Clock;
  private enabled = false;
  private suspended = false;
  constructor(
    private readonly deps: {
      grants: DelegationGrants;
      machines: MachineManager;
      endpoint: () => BridgeEndpoint;
      logger: Logger;
      stateDir: string;
      clock?: Clock;
      pairingChanged?: (id: string, message: string, closed: boolean) => void;
    },
  ) {
    this.pairing = new DelegationPairing({
      invite: (label) => this.invite(label),
      changed: (p, closed) =>
        deps.pairingChanged?.(
          p.id,
          `操作委譲の申請: ${p.label} (${p.address}) 確認コード: ${p.code}（5分間有効）`,
          closed,
        ),
    });
    this.store = new OutboundDelegationStore(deps.stateDir);
    this.clock = deps.clock ?? realClock;
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutations.then(fn);
    this.mutations = run.catch(() => undefined);
    return run;
  }
  private save() {
    return this.store.save(
      [...this.outbound.values()].map((e) => ({
        url: e.status.url,
        machineId: e.status.id,
        token: e.key,
      })),
    );
  }
  async restore() {
    try {
      for (const p of await this.store.load()) {
        const url = delegationUrl(p.url);
        if (this.outbound.has(p.machineId)) continue;
        const e: Outbound = {
          status: { id: p.machineId, url, state: "connecting", message: null },
          key: p.token,
          attempt: 0,
          stopped: false,
        };
        this.outbound.set(p.machineId, e);
        this.connect(e);
      }
    } catch {
      this.deps.logger.warn(
        "cannot resume outbound delegations; check local saved delegation settings",
      );
    }
  }
  setReady(ready: boolean) {
    this.enabled = ready;
    if (ready && !this.suspended)
      for (const e of this.outbound.values()) if (!e.ws && !e.retry) this.connect(e);
  }
  async connections() {
    const profiles = await this.deps.grants.connections(),
      live = this.deps.machines.list();
    return {
      connections: profiles.map((p) => ({
        id: p.id,
        label: p.label,
        target: p.target,
        transport: p.transport ?? "ssh",
        enabled: p.enabled,
        state: p.enabled ? (live.find((m) => m.id === p.id)?.state ?? "connecting") : "disabled",
        message: live.find((m) => m.id === p.id)?.message ?? null,
      })),
    };
  }
  async add(input: { label: string; target: string; session?: string | undefined }) {
    if (!this.enabled || this.suspended) throw new RpcError("server_busy", "サーバーは準備中です");
    const result = await this.deps.grants.add(input);
    await this.deps.machines.refresh();
    return result;
  }
  async manage(id: string, action: "enable" | "disable" | "remove") {
    await this.deps.grants.manage(id, action);
    await this.deps.machines.refresh();
    return {};
  }
  async requestPairing(url: string, label: string) {
    if (!this.enabled || this.suspended) throw new RpcError("server_busy", "サーバーは準備中です");
    return this.pairing.request(url, label);
  }
  async confirmPairing(id: string, code: string) {
    const grant = await this.pairing.confirm(id, code);
    return this.start(grant);
  }
  async invite(label: string) {
    if (!this.enabled) throw new RpcError("server_busy", "サーバーは準備中です");
    const result = await this.deps.grants.invite(label);
    await this.deps.machines.refresh();
    return result;
  }
  /** This route deliberately rejects browser Origins and uses only a machine-specific credential. */
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const reject = (status: string) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`, () => socket.destroy());
    };
    if (!this.enabled) return reject("503 Service Unavailable");
    if (req.url === "/machine-pairing") {
      this.pairing.upgrade(req, socket, head);
      return;
    }
    if (req.headers.origin !== undefined || req.url !== "/machine-delegation")
      return reject("403 Forbidden");
    const id = req.headers["x-soda-machine-id"],
      auth = req.headers.authorization;
    if (typeof id !== "string" || typeof auth !== "string" || !auth.startsWith("Bearer "))
      return reject("401 Unauthorized");
    if (this.authenticating >= 16) return reject("429 Too Many Requests");
    let profile;
    this.authenticating++;
    try {
      profile = await this.deps.grants.authorize(id, auth.slice(7));
    } catch {
      return reject("401 Unauthorized");
    } finally {
      this.authenticating--;
    }
    if (!profile || !this.enabled || socket.destroyed) return reject("401 Unauthorized");
    if (this.pending.has(id)) return reject("409 Conflict");
    this.pending.set(id, socket);
    const release = () => {
      if (this.pending.get(id) === socket) this.pending.delete(id);
    };
    socket.once("close", release);
    try {
      await this.deps.machines.refresh();
      if (!this.enabled || socket.destroyed) {
        release();
        return reject("503 Service Unavailable");
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        const stream = createWebSocketStream(ws);
        const link = new MachineLink(profile!, {
          spawn: () => childOf(stream, ws),
          logger: this.deps.logger,
        });
        ws.once("close", release);
        ws.on("error", () => undefined);
        if (!this.deps.machines.acceptIncoming(id, link)) {
          release();
          ws.terminate();
          stream.destroy();
        }
      });
    } catch {
      release();
      socket.destroy();
    }
  }
  start(p: { url: string; machineId: string; token: string }): Promise<DelegationStatus> {
    return this.exclusive(async () => {
      if (!this.enabled || this.suspended)
        throw new RpcError("server_busy", "サーバーは準備中です");
      let url: string;
      try {
        url = delegationUrl(p.url);
      } catch {
        throw new RpcError("invalid_params", "接続先にはHTTPS/WSSのサーバーURLが必要です");
      }
      const id = p.machineId;
      const existing = this.outbound.get(id);
      if (existing)
        throw new RpcError(
          "invalid_params",
          "この委譲は開始済みです。停止してから再実行してください",
        );
      if (this.outbound.size >= 16)
        throw new RpcError("invalid_params", "同時に委譲できる接続は16件までです");
      const entry: Outbound = {
        status: { id, url, state: "connecting", message: null },
        key: p.token,
        attempt: 0,
        stopped: false,
      };
      this.outbound.set(id, entry);
      try {
        await this.save();
      } catch {
        this.outbound.delete(id);
        throw new RpcError("internal", "委譲設定を保存できません");
      }
      this.connect(entry);
      return { ...entry.status };
    });
  }
  list() {
    return { delegations: [...this.outbound.values()].map((e) => ({ ...e.status })) };
  }
  stop(id: string) {
    return this.exclusive(async () => {
      const entry = this.outbound.get(id);
      if (!entry) throw new RpcError("not_found", "委譲が見つかりません");
      const remaining = [...this.outbound.values()]
        .filter((e) => e !== entry)
        .map((e) => ({ url: e.status.url, machineId: e.status.id, token: e.key }));
      try {
        await this.store.save(remaining);
      } catch {
        throw new RpcError("internal", "委譲停止の設定を保存できません");
      }
      this.dispose(entry);
      this.outbound.delete(id);
      return {};
    });
  }
  suspend() {
    this.suspended = true;
    this.enabled = false;
    for (const e of this.outbound.values()) {
      this.clock.clearInterval(e.health);
      e.health = undefined;
      clearTimeout(e.retry);
      e.retry = undefined;
      e.ws?.terminate();
      e.ws = undefined;
    }
    for (const ws of this.wss.clients) ws.terminate();
  }
  resume() {
    this.enabled = true;
    this.suspended = false;
    for (const e of this.outbound.values()) if (!e.stopped && !e.ws) this.connect(e);
  }
  close() {
    this.suspend();
    for (const e of this.outbound.values()) this.dispose(e);
    this.outbound.clear();
    this.pairing.close();
    this.wss.close();
  }
  private dispose(e: Outbound) {
    this.clock.clearInterval(e.health);
    e.health = undefined;
    e.stopped = true;
    clearTimeout(e.retry);
    e.ws?.terminate();
    e.ws = undefined;
    e.key = "";
  }
  private connect(e: Outbound) {
    if (e.stopped || this.suspended || !this.enabled) return;
    e.retry = undefined;
    e.status.state = e.attempt ? "reconnecting" : "connecting";
    const ws = new WebSocket(e.status.url, {
      headers: { authorization: `Bearer ${e.key}`, "x-soda-machine-id": e.status.id },
      followRedirects: false,
      handshakeTimeout: 10_000,
      perMessageDeflate: false,
      maxPayload: 5 * 1024 * 1024,
    });
    e.ws = ws;
    ws.on("error", () => {
      e.status.message = "接続できません。接続先・招待・TLS証明書を確認してください";
    });
    ws.once("open", () => {
      if (e.stopped || this.suspended || e.ws !== ws) {
        ws.terminate();
        return;
      }
      e.attempt = 0;
      e.status.state = "online";
      e.status.message = null;
      let lastPong = this.clock.now();
      ws.on("pong", () => {
        lastPong = this.clock.now();
      });
      e.health = this.clock.setInterval(() => {
        if (this.clock.now() - lastPong >= 45_000) ws.terminate();
        else if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 15_000);
      const stream = createWebSocketStream(ws);
      this.deps.endpoint().handleSocket(stream as BridgeSocketLike);
    });
    ws.once("close", () => {
      if (e.ws !== ws) return;
      this.clock.clearInterval(e.health);
      e.health = undefined;
      e.ws = undefined;
      if (e.stopped || this.suspended || !this.enabled) return;
      e.status.state = "reconnecting";
      e.status.message ??= "接続が切れました。自動で再接続します";
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(e.attempt++, 5));
      e.retry = setTimeout(() => this.connect(e), delay);
      e.retry.unref();
    });
  }
}
