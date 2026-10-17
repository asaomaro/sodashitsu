import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { DesktopBridgeMessage, DesktopViewerMessage } from "@sodashitsu/protocol";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { DesktopCdpLauncher, type LaunchJob, type LaunchTarget } from "./DesktopCdpLauncher.js";
import { RpcError } from "@sodashitsu/protocol";
import type { WsConnection } from "../ws/WsServer.js";
import { RpcDesktopCdpPeer, type DesktopCdpPeer } from "./DesktopCdpPeer.js";
import { DesktopCdpDevices } from "./DesktopCdpDevices.js";

type Resident = {
  socket: DesktopCdpPeer; deviceId: string; title: string; allowInput: boolean; allowFit: boolean;
  owner?: Viewer; shareId?: string; stopping: boolean;
};

type Viewer = {
  socket: DesktopCdpPeer;
  sessionId: string;
  authorized: () => boolean;
  bridge?: DesktopCdpPeer;
  resident?: Resident;
  token?: string;
  expires?: number;
  control: boolean;
  allowInput: boolean;
  allowFit: boolean;
  pending?: number;
  lastSeq: number;
  title: string;
  rateAt: number;
  rate: number;
  frameAt: number;
  pairingEpoch: number;
  launch?: LaunchJob;
  launching?: boolean;
  launchTargets?: LaunchTarget[];
  launchExpires?: number;
};
/** Authenticated viewers share a single renderer; optional device credentials keep a bridge idle between shares. */
export class DesktopCdpRelay {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4 * 1024 * 1024,
    perMessageDeflate: false,
  });
  private readonly viewers = new Set<Viewer>();
  private readonly invites = new Map<string, Viewer>();
  private readonly live = new Set<DesktopCdpPeer>();
  private readonly alive = new Set<DesktopCdpPeer>();
  private readonly pendingBridges = new Set<DesktopCdpPeer>();
  private readonly residents = new Map<string, Resident>();
  private readonly devices: DesktopCdpDevices;
  private readonly loaded: Promise<void>;
  private registryFailed = false;
  private readonly timers = new Map<DesktopCdpPeer, ReturnType<typeof setTimeout>>();
  private readonly revoked;
  private readonly patrol;
  private closed = false;
  private readonly rpcOpened = new WeakSet<WsConnection>();
  private readonly rpcPeers = new WeakMap<WsConnection, RpcDesktopCdpPeer>();
  constructor(
    private readonly auth: AuthService,
    private readonly origins: OriginRejectionLog,
    deviceFile?: string,
    private readonly launcher = new DesktopCdpLauncher(),
  ) {
    this.devices = new DesktopCdpDevices(deviceFile);
    this.loaded = this.devices.load().catch(() => { this.registryFailed = true; });
    this.revoked = auth.onSessionRevoked((id) => {
      for (const v of this.viewers)
        if (v.sessionId === id) {
          this.stop(v);
          v.socket.close(4401, "session revoked");
          this.deadline(v.socket, 1000);
        }
    });
    this.patrol = setInterval(() => {
      const now = Date.now();
      for (const ws of this.live) {
        if (!this.alive.delete(ws)) ws.terminate();
        else ws.ping();
      }
      for (const v of this.viewers) {
        if (v.expires && now >= v.expires) this.removeInvite(v);
        if (!v.authorized()) v.socket.close(4401, "session revoked");
      }
    }, 10000);
    this.patrol.unref();
  }
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    await this.loaded;
    const reject = (code: string) => {
      socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`);
    };
    if (this.closed || this.registryFailed || this.live.size >= 64) {
      reject("503 Service Unavailable");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const role = url.searchParams.get("role");
    if (url.searchParams.size !== 1 || (role !== "viewer" && role !== "bridge")) {
      reject("400 Bad Request");
      return;
    }
    let sessionId = "";
    if (role === "viewer") {
      if (
        !this.origins.admit(
          {
            path: "/desktop-cdp",
            remoteAddress: req.socket.remoteAddress ?? "",
            origin: req.headers.origin,
            host: req.headers.host,
          },
          () => reject("403 Forbidden"),
        )
      )
        return;
      const result = await this.auth.authorizeUpgrade({
        headers: req.headers as Record<string, string | undefined>,
        remoteAddress: req.socket.remoteAddress ?? "",
      });
      if (!result.ok) {
        reject("401 Unauthorized");
        return;
      }
      sessionId = result.sessionId;
    } else if (this.pendingBridges.size >= 16) {
      reject("503 Service Unavailable");
      return;
    } else if (req.headers.origin !== undefined) {
      // Bridge is a Node client, never a cross-origin website. Its first frame carries a one-use capability.
      reject("403 Forbidden");
      return;
    }
    if (this.closed || socket.destroyed || this.live.size >= 64) {
      reject("503 Service Unavailable");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.track(ws);
      if (role === "viewer") this.viewer(ws, sessionId);
      else this.bridge(ws);
    });
  }
  private track(ws: DesktopCdpPeer): void {
    this.live.add(ws); this.alive.add(ws);
    ws.on("pong", () => this.alive.add(ws));
    ws.on("error", () => ws.terminate());
    ws.on("close", () => {
      this.live.delete(ws); this.pendingBridges.delete(ws); this.alive.delete(ws); this.clearTimer(ws);
    });
  }
  async openRpc(connection: WsConnection, authorized: () => boolean): Promise<void> {
    if (this.rpcOpened.has(connection)) throw new RpcError("invalid_params", "VSCode channel already open");
    this.rpcOpened.add(connection); // Reserve synchronously: RPC handlers may run concurrently.
    let live = true;
    connection.onClose(() => { live = false; });
    await this.loaded;
    if (!live || !authorized()) throw new RpcError("not_found", "VSCode connection is closed");
    if (this.closed || this.registryFailed || this.live.size >= 64)
      throw new RpcError("server_busy", "VSCode sharing is unavailable");
    if (this.rpcPeers.has(connection)) throw new RpcError("invalid_params", "VSCode channel already open");
    const peer = new RpcDesktopCdpPeer(connection);
    this.rpcPeers.set(connection, peer);
    this.track(peer);
    // Gateway/bridge authenticate the connection and revoke it on disconnect.
    this.viewer(peer, "rpc", () => authorized() && peer.readyState === WebSocket.OPEN);
  }
  sendRpc(connection: WsConnection, message: unknown): void {
    const peer = this.rpcPeers.get(connection);
    if (!peer || peer.readyState !== WebSocket.OPEN) throw new RpcError("not_found", "VSCode channel is closed");
    // Remote setup uses the target server's fixed launcher origin, never the controller's origin.
    if ((message as {type?:string})?.type === "invite") throw new RpcError("invalid_params", "Use the server-configured VSCode launcher");
    peer.receive(message);
  }
  private send(ws: DesktopCdpPeer, value: unknown): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (ws.bufferedAmount > 4 * 1024 * 1024) {
      ws.close(1013, "slow connection");
      return false;
    }
    ws.send(JSON.stringify(value));
    return true;
  }
  private clearTimer(ws: DesktopCdpPeer): void {
    const t = this.timers.get(ws);
    if (t) clearTimeout(t);
    this.timers.delete(ws);
  }
  private deadline(ws: DesktopCdpPeer, ms: number): void {
    this.clearTimer(ws);
    const t = setTimeout(() => ws.terminate(), ms);
    t.unref();
    this.timers.set(ws, t);
  }
  private removeInvite(v: Viewer): void {
    if (v.token) this.invites.delete(v.token);
    delete v.token;
    delete v.expires;
  }
  private status(v: Viewer): void {
    this.send(v.socket, {
      type: "status",
      connected: !!v.bridge,
      title: v.title,
      allowInput: v.allowInput,
      allowFit: v.allowFit,
      control: v.control,
      launcherAvailable: this.launcher.available,
      launcherBusy: this.launcher.busy,
      launchPending: v.launching === true,
      devices: this.devices.list().map(d => {
        const r = this.residents.get(d.id);
        return { id: d.id, title: r?.title ?? d.title, online: !!r, busy: !!r?.shareId };
      }),
    });
  }
  private broadcast(): void { for (const v of this.viewers) this.status(v); }
  private launcherState(): void {
    for (const v of this.viewers) this.send(v.socket, {type:"launcherState",busy:this.launcher.busy});
  }
  private forward(v: Viewer, message: object): void {
    if (v.bridge) this.send(v.bridge, v.resident ? { ...message, shareId: v.resident.shareId } : message);
  }
  private startResident(v: Viewer, r: Resident): void {
    if (r.shareId || r.socket.readyState !== WebSocket.OPEN || v.socket.readyState !== WebSocket.OPEN || !v.authorized()) return;
    this.stop(v);
    r.owner = v; r.shareId = randomUUID(); r.stopping = false;
    v.bridge = r.socket; v.resident = r; v.title = r.title;
    v.allowInput = r.allowInput; v.allowFit = r.allowInput && r.allowFit;
    v.frameAt = 0; v.lastSeq = 0;
    this.send(r.socket, { type: "start", shareId: r.shareId });
    this.broadcast();
  }
  private stop(v: Viewer): void {
    ++v.pairingEpoch;
    v.launch?.cancel();
    delete v.launch; delete v.launchTargets; delete v.launchExpires; v.launching = false;
    this.removeInvite(v);
    const bridge = v.bridge;
    const resident = v.resident;
    delete v.bridge;
    delete v.resident;
    delete v.pending;
    v.control = false;
    v.allowInput = false;
    v.allowFit = false;
    v.title = "";
    v.lastSeq = 0;
    if (bridge) {
      this.clearTimer(bridge);
      if (resident) {
        delete resident.owner;
        resident.stopping = true;
        this.send(bridge, { type: "stop", shareId: resident.shareId });
        this.deadline(bridge, 10000);
      } else {
        bridge.close(1000, "sharing stopped");
        this.deadline(bridge, 1000);
      }
    }
    this.broadcast();
  }
  private launch(v: Viewer, targetId?: string): void {
    if (!this.launcher.available || this.launcher.busy || v.bridge || v.launching) {
      this.send(v.socket, {type:"error", message:"Windows起動処理が未設定か使用中です"}); return;
    }
    if (targetId && (!v.launchExpires || Date.now() >= v.launchExpires || !v.launchTargets?.some(t => t.id === targetId))) {
      this.send(v.socket, {type:"error", message:"対象を再取得してVSCodeを選び直してください"}); return;
    }
    this.removeInvite(v);
    delete v.launchTargets; delete v.launchExpires;
    const epoch = ++v.pairingEpoch;
    let job: LaunchJob;
    try {
      if (targetId) {
        const token = randomBytes(32).toString("hex");
        v.token = token; v.expires = Date.now() + 15000; this.invites.set(token, v);
        job = this.launcher.start({type:"connect",targetId,token});
      } else job = this.launcher.start({type:"discover"});
    } catch {
      this.removeInvite(v);
      this.send(v.socket, {type:"error",message:"Windows起動処理を実行できませんでした"}); return;
    }
    v.launch = job; v.launching = true; this.status(v); this.launcherState();
    // Updating global availability must not overwrite a just-delivered failure status.
    void job.closed.then(() => { if (!this.closed) this.launcherState(); });
    if (targetId) void job.closed.then(() => {
      if (epoch !== v.pairingEpoch || v.launch !== job) return;
      this.stop(v);
      this.send(v.socket, {type:"error",message:"Windows側の起動・接続が終了しました。再接続してください"});
    });
    void job.result.then(targets => {
      if (epoch !== v.pairingEpoch || v.socket.readyState !== WebSocket.OPEN || !v.authorized()) return;
      if (!targetId) {
        delete v.launch; v.launching = false;
        v.launchTargets = targets; v.launchExpires = Date.now() + 60000;
        this.status(v); this.send(v.socket, {type:"launchTargets", targets});
      }
    }, () => {
      if (epoch !== v.pairingEpoch) return;
      this.stop(v);
      this.send(v.socket, {type:"error",message:"Windows側の起動・接続に失敗しました。起動設定とVSCodeの状態を確認してください"});
    });
  }
  private viewer(ws: DesktopCdpPeer, sessionId: string, authorized = () => this.auth.verifySession(sessionId)): void {
    const v: Viewer = {
      socket: ws,
      sessionId,
      authorized,
      control: false,
      allowInput: false,
      allowFit: false,
      title: "",
      lastSeq: 0,
      rateAt: Date.now(),
      rate: 0,
      frameAt: 0,
      pairingEpoch: 0,
    };
    this.viewers.add(v);
    this.status(v);
    ws.on("close", () => {
      this.stop(v);
      this.viewers.delete(v);
    });
    let requests = Promise.resolve();
    let queued = 0;
    ws.on("message", (raw, binary) => {
      if (++queued > 256) { --queued; ws.close(1008, "request backlog"); return; }
      requests = requests.then(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (binary || raw.toString().length > 40000 || !v.authorized()) {
        ws.close(1008, "invalid request");
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.close(1008, "invalid request");
        return;
      }
      const m = DesktopViewerMessage.safeParse(data);
      if (!m.success) {
        ws.close(1008, "invalid request");
        return;
      }
      const now = Date.now();
      if (now - v.rateAt >= 1000) {
        v.rateAt = now;
        v.rate = 0;
      }
      if (++v.rate > 240) {
        ws.close(1008, "rate exceeded");
        return;
      }
      switch (m.data.type) {
        case "launch": this.launch(v); break;
        case "launchConnect": this.launch(v, m.data.targetId); break;
        case "connect": {
          const r = this.residents.get(m.data.deviceId);
          if (r && !r.shareId) this.startResident(v, r);
          else this.send(ws, { type: "error", message: "共有元がオフラインか使用中です" });
          break;
        }
        case "forget": {
          await this.devices.forget(m.data.deviceId);
          const r = this.residents.get(m.data.deviceId);
          if (r) {
            if (r.owner) this.stop(r.owner);
            r.socket.close(4403, "device forgotten");
            this.deadline(r.socket, 1000);
          }
          this.broadcast();
          break;
        }
        case "invite": {
          this.stop(v);
          const token = randomBytes(32).toString("hex");
          v.token = token;
          v.expires = now + 300000;
          this.invites.set(token, v);
          this.send(ws, { type: "invitation", token, expires: v.expires });
          break;
        }
        case "stop":
          this.stop(v);
          break;
        case "control":
          v.control = m.data.enabled && v.allowInput && !!v.bridge;
          this.forward(v, { type: "control", enabled: v.control });
          this.status(v);
          break;
        case "input":
          if (v.control && v.allowInput && v.bridge) this.forward(v, m.data);
          break;
        case "viewport":
          if (v.control && v.allowInput && v.allowFit && v.bridge) this.forward(v, m.data);
          break;
        case "ack":
          if (v.bridge && v.pending === m.data.seq) {
            delete v.pending;
            this.clearTimer(v.bridge);
            this.forward(v, m.data);
          }
          break;
      }
    }).catch(() => ws.close(1011, "device registry unavailable")).finally(() => { --queued; }); });
  }
  private bridge(ws: DesktopCdpPeer): void {
    this.pendingBridges.add(ws);
    this.deadline(ws, 5000);
    let owner: Viewer | undefined;
    let resident: Resident | undefined;
    ws.on("close", () => {
      if (resident && this.residents.get(resident.deviceId) === resident) {
        owner = resident.owner;
        this.residents.delete(resident.deviceId);
      }
      if (owner?.bridge === ws) {
        delete owner.bridge;
        delete owner.resident;
        delete owner.pending;
        owner.control = false;
        owner.allowInput = false;
        owner.allowFit = false;
        owner.title = "";
      }
      this.broadcast();
    });
    let requests = Promise.resolve();
    let queued = 0;
    ws.on("message", (raw, binary) => {
      if (binary || (!owner && !resident && raw.toString().length > 2048) || ++queued > 8) {
        ws.close(1008, "invalid request"); return;
      }
      requests = requests.then(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (binary || (!owner && !resident && raw.toString().length > 2048)) {
        ws.close(1008, "invalid request");
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        ws.close(1008, "invalid request");
        return;
      }
      const m = DesktopBridgeMessage.safeParse(data);
      if (!m.success) {
        ws.close(1008, "invalid request");
        return;
      }
      if (!owner && !resident) {
        if (m.data.type === "resume") {
          const device = this.devices.verify(m.data.deviceId, m.data.secret);
          if (!device) { ws.close(4403, "device revoked"); return; }
          if (this.residents.has(device.id)) { ws.close(1008, "device already online"); return; }
          resident = { socket: ws, deviceId: device.id, title: m.data.title, allowInput: m.data.allowInput,
            allowFit: m.data.allowFit && m.data.allowInput, stopping: false };
          this.residents.set(device.id, resident);
          this.pendingBridges.delete(ws); this.clearTimer(ws);
          this.send(ws, { type: "ready", deviceId: device.id }); this.broadcast();
          return;
        }
        if (m.data.type !== "hello") {
          ws.close(1008, "pairing required");
          return;
        }
        const v = this.invites.get(m.data.token);
        if (
          !v ||
          !v.expires ||
          Date.now() >= v.expires ||
          !v.authorized() ||
          v.socket.readyState !== WebSocket.OPEN
        ) {
          ws.close(1008, "pairing rejected");
          return;
        }
        this.removeInvite(v);
        if (m.data.remember) {
          const pairingEpoch = v.pairingEpoch;
          const { device, secret } = await this.devices.register(m.data.title);
          if (ws.readyState !== WebSocket.OPEN) { this.broadcast(); return; }
          resident = { socket: ws, deviceId: device.id, title: m.data.title, allowInput: m.data.allowInput,
            allowFit: m.data.allowFit && m.data.allowInput, stopping: false };
          this.residents.set(device.id, resident);
          this.pendingBridges.delete(ws); this.clearTimer(ws);
          this.send(ws, { type: "registered", deviceId: device.id, secret });
          this.send(ws, { type: "ready", deviceId: device.id });
          if (pairingEpoch === v.pairingEpoch) this.startResident(v, resident);
          else this.broadcast();
          return;
        }
        this.pendingBridges.delete(ws);
        this.clearTimer(ws);
        owner = v;
        v.launching = false;
        v.bridge = ws;
        v.allowInput = m.data.allowInput;
        v.allowFit = m.data.allowFit && m.data.allowInput;
        v.title = m.data.title;
        v.frameAt = 0;
        this.send(ws, { type: "paired" });
        this.status(v);
        return;
      }
      if (resident) {
        if ((m.data.type === "frame" || m.data.type === "stopped") && m.data.shareId !== resident.shareId) return;
        if (m.data.type === "stopped" && resident.shareId) {
          const v = resident.owner;
          if (v?.bridge === ws) {
            delete v.bridge; delete v.resident; delete v.pending;
            v.control = v.allowInput = v.allowFit = false; v.title = "";
          }
          delete resident.owner; delete resident.shareId; resident.stopping = false;
          this.clearTimer(ws); this.broadcast(); return;
        }
        if (resident.stopping || !resident.owner) return;
      }
      const v = resident?.owner ?? owner;
      if (!v) return;
      if (v.bridge !== ws || m.data.type !== "frame" || !v.authorized()) {
        ws.close(1008, "invalid request");
        return;
      }
      if (v.pending !== undefined || m.data.seq <= v.lastSeq) {
        ws.close(1008, "frame ordering");
        return;
      }
      if (Date.now() - v.frameAt < 50) {
        ws.close(1008, "frame rate exceeded");
        return;
      }
      v.frameAt = Date.now();
      v.lastSeq = m.data.seq;
      v.pending = m.data.seq;
      const { shareId: _shareId, ...frame } = m.data;
      if (this.send(v.socket, frame)) this.deadline(ws, 10000);
    }).catch(() => ws.close(1011, "device registry unavailable")).finally(() => { --queued; }); });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.patrol);
    this.revoked.dispose();
    this.invites.clear();
    this.disconnectAll();
    this.wss.close();
  }
  disconnectAll(): void {
    for (const v of this.viewers) this.stop(v);
    this.invites.clear();
    for (const ws of this.live) {
      this.clearTimer(ws);
      ws.terminate();
    }
  }
}
