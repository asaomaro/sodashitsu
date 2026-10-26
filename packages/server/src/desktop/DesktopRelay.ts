import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import {
  RemoteDesktopViewerMessage,
  DESKTOP_INPUT_PROTOCOL,
  DESKTOP_CURSOR_PROTOCOL,
  isDesktopCursor,
  decodeDesktopCursor,
  DESKTOP_NATIVE_RATE_PROTOCOL,
  DESKTOP_VIDEO_LANE_PROTOCOL, DESKTOP_IMAGE_LANE_PROTOCOL,
  DESKTOP_NATIVE_VIDEO_PROTOCOL,
  DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,
  DesktopNativeVideoStats,
  isExtendedDesktopInput,
  DesktopFrameChain,
  DesktopReady,
  decodeDesktopFrame,
  DESKTOP_IME_PROTOCOL,
  DESKTOP_MAX_FRAME_BYTES,
  RpcError,
  DesktopMediaStatus,
  DesktopMediaStream,
  DesktopMediaSignal,
  DesktopClipboardResult,
  decodeDesktopMediaChunk,
  isDesktopMediaChunk,
  type RemoteDesktopInput,
} from "@sodashitsu/protocol";
import { DesktopAgentAccess, type AgentTarget, type AgentFrame } from "./DesktopAgentAccess.js";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { MachineManager } from "../machine/MachineManager.js";
import { DesktopBridgeRpc } from "./bridgeRpc.js";
import { unlockFailure } from "./unlockFailure.js";

import { DesktopCursorStream } from "./DesktopCursorStream.js";
import { DesktopVideoLanes } from "./DesktopVideoLanes.js";

class DesktopSetupRequired extends Error {}

type Viewer = {
  imageLaneRequested?:boolean; imageLane?:ReturnType<DesktopVideoLanes["issue"]>; imageAttached?:boolean; imageViewerReady?:boolean; imageActive?:boolean; receiveImage?:(bytes:Buffer,binary:boolean)=>void;
  cursorRequested?:boolean;
  cursor?:boolean;
  cursorStream?:DesktopCursorStream;
  nativeRateRequested?: boolean;
  nativeMaxFps?: 60;
  videoLaneRequested?: boolean;
  videoLane?: ReturnType<DesktopVideoLanes["issue"]>;
  videoActive?: boolean;
  receiveVideo?: (bytes: Buffer, binary: boolean) => void;
  chain: DesktopFrameChain;
  features?: boolean;
  nativeVideoRequested: boolean;
  nativeWindowRequested:boolean;
  nativeVideoWindow?:3;
  nativeVideo?: boolean;
  retiredMedia: Set<string>;
  requestedNative?: boolean;
  media?: { id: string; generation: number; seq: number; native?:boolean; pending?:number[]; window?:1|3;lastAck?:number;sentAt?:Map<number,number>;drawnAt?:number };
  nativeInputFreshness?: boolean;
  snapshot?: {
    promise: Promise<void>;
    resolve(): void;
    reject(e: Error): void;
    timer: ReturnType<typeof setTimeout>;
  };
  agent: AgentTarget;
  latest?: AgentFrame;
  inputWaits: Map<number, { resolve(): void; reject(e: Error): void }>;
  ws: WebSocket;
  sessionId: string;
  origin: string;
  provider?: WebSocket;
  rpc?: DesktopBridgeRpc;
  ticketHash?: string;
  started: boolean;
  ready: boolean;
  control: boolean;
  allowInput: boolean;
  secureDesktop?: boolean;
  lockScreenCover?: boolean;
  imeKeys?: boolean;
  imeKeysRequested: boolean;
  imeKeysNegotiated?: boolean;
  extendedInputRequested: boolean;
  extendedInputNegotiated?: boolean;
  extendedInput?: boolean;
  pending: number;
  seq: number;
  inputSeq: number;
  viewerSeq: number;
  viewerAcks: Map<number, number>;
  frameAt: number;
  lastSeen: number;
  messages: number;
  rateAt: number;
  frames: number;
  bytes: number;
  since: number;
  ackTimes: number[];
  fps: number;
  frameRateAt: number;
  frameRate: number;
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/** A-side viewer-owned relay. Bulk traffic never goes through the machine/PTY stream. */
export class DesktopRelay {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: protocols => protocols.has(DESKTOP_INPUT_PROTOCOL)
      ? DESKTOP_INPUT_PROTOCOL : protocols.values().next().value || false,
    perMessageDeflate: false,
    maxPayload: DESKTOP_MAX_FRAME_BYTES + 2050,
  });
  private readonly videoLanes: DesktopVideoLanes;
  private readonly imageLanes: DesktopVideoLanes;
  private readonly viewers = new Set<Viewer>();
  private readonly pendingProviders = new Set<WebSocket>();
  private readonly invites = new Map<string, Viewer>();
  private readonly revoked;
  private readonly timer;
  private closed = false;
  readonly agents = new DesktopAgentAccess();
  constructor(
    private readonly auth: AuthService,
    private readonly origins: OriginRejectionLog,
    private readonly machines: Pick<MachineManager, "route">,
  ) {
    this.videoLanes = new DesktopVideoLanes(id => auth.verifySession(id));
    this.imageLanes = new DesktopVideoLanes(id=>auth.verifySession(id),DESKTOP_MAX_FRAME_BYTES+4096);
    this.revoked = auth.onSessionRevoked((id) => {
      for (const v of this.viewers) if (v.sessionId === id) this.stop(v);
    });
    this.timer = setInterval(() => {
      const now = performance.now();
      this.agents.tick();
      this.videoLanes.tick();this.imageLanes.tick();
      for (const v of this.viewers)
        if (
          !auth.verifySession(v.sessionId) ||
          now - v.lastSeen > 12000 ||
          (v.pending && now - v.frameAt > 5000) ||
          (v.started && !v.ready && now - v.since > 15000)
        )
          this.stop(v);
    }, 1000);
    this.timer.unref();
  }
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reject = (status: string) =>
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if (this.closed || this.viewers.size + this.pendingProviders.size + this.videoLanes.pendingCount + this.imageLanes.pendingCount >= 32) {
      reject("503 Service Unavailable");
      return;
    }
    if (req.url !== "/desktop-share") {
      reject("400 Bad Request");
      return;
    }
    const origin = req.headers.origin;
    let sessionId = "";
    if (origin !== undefined) {
      if (
        !this.origins.admit(
          {
            path: "/desktop-share",
            remoteAddress: req.socket.remoteAddress ?? "",
            origin,
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
    } else if (this.pendingProviders.size >= 8) {
      reject("503 Service Unavailable");
      return;
    }
    if (this.closed || socket.destroyed || this.viewers.size + this.pendingProviders.size + this.videoLanes.pendingCount + this.imageLanes.pendingCount >= 32) {
      reject("503 Service Unavailable");
      return;
    }
    this.server.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => ws.terminate());
      const offered = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map(v => v.trim());
      if (offered.length === 1 && offered[0] === DESKTOP_IMAGE_LANE_PROTOCOL) { this.imageLanes.accept(ws,sessionId,origin);return; }
      if (offered.length === 1 && offered[0] === DESKTOP_VIDEO_LANE_PROTOCOL) { this.videoLanes.accept(ws, sessionId, origin); return; }
      if (origin !== undefined) this.viewer(ws, sessionId, origin, String(req.headers["sec-websocket-protocol"]??"").split(",").map(v=>v.trim()).includes(DESKTOP_NATIVE_VIDEO_PROTOCOL), String(req.headers["sec-websocket-protocol"]??"").split(",").map(v=>v.trim()).includes(DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL), offered.includes(DESKTOP_VIDEO_LANE_PROTOCOL),offered.includes(DESKTOP_NATIVE_RATE_PROTOCOL),offered.includes(DESKTOP_CURSOR_PROTOCOL),offered.includes(DESKTOP_IMAGE_LANE_PROTOCOL));
      else this.provider(ws);
    });
  }
  private send(ws: WebSocket, value: unknown): boolean {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > DESKTOP_MAX_FRAME_BYTES + 4096)
      return false;
    ws.send(value instanceof Uint8Array ? value : JSON.stringify(value));
    return true;
  }
  private viewer(ws: WebSocket, sessionId: string, origin: string, nativeVideoRequested=false,nativeWindowRequested=false, videoLaneRequested=false,nativeRateRequested=false,cursorRequested=false,imageLaneRequested=false): void {
    const now = performance.now();
    const v: Viewer = {
      chain: new DesktopFrameChain(),
      agent: {
        frame: () => this.agentFrame(v),
        capture: (after) => this.capture(v, after),
        releaseInputs: () => {
          if (v.provider) this.send(v.provider, { type: "release" });
        },
        control: (enabled) => {
          v.control = enabled && v.allowInput && v.ready;
          for (const wait of v.inputWaits.values())
            wait.reject(new RpcError("unauthorized", "Agent control revoked"));
          v.inputWaits.clear();
          if (v.provider) this.send(v.provider, { type: "control", enabled: v.control });
        },
        state: (active, expiresAt) => this.send(v.ws, { type: "agent_state", active, expiresAt }),
        input: (input: RemoteDesktopInput) =>
          new Promise<void>((resolve, reject) => {
            if (isExtendedDesktopInput(input) && !v.extendedInput) {
              reject(new RpcError("invalid_params", "接続先はこの追加キー・マウスボタンに対応していません"));
              return;
            }
            if (input.kind === "key" && (input.code === "ImeOn" || input.code === "ImeOff") && !v.imeKeys) {
              reject(new RpcError("invalid_params", "接続先はIMEキーに対応していません"));
              return;
            }
            if (
              !v.provider ||
              !this.viewers.has(v) ||
              !v.control ||
              !v.latest ||
              performance.now() - v.frameAt >= 2000
            ) {
              reject(new RpcError("unauthorized", "Desktop control unavailable"));
              return;
            }
            const seq = ++v.inputSeq;
            const timer = setTimeout(() => {
              v.inputWaits.delete(seq);
              reject(
                new RpcError(
                  "server_busy",
                  "Input acknowledgement timed out; observe before retrying",
                ),
              );
            }, 1500);
            v.inputWaits.set(seq, {
              resolve: () => {
                clearTimeout(timer);
                resolve();
              },
              reject: (e) => {
                clearTimeout(timer);
                reject(e);
              },
            });
            if (!this.send(v.provider, { type: "input", seq, frameSeq: v.seq, input })) {
              v.inputWaits.get(seq)?.reject(new RpcError("server_busy", "Desktop unavailable"));
              v.inputWaits.delete(seq);
            }
          }),
      },
      cursorRequested,
      nativeRateRequested,
      videoLaneRequested,imageLaneRequested,
      nativeVideoRequested,
      nativeWindowRequested,
      retiredMedia: new Set(),
      inputWaits: new Map(),
      ws,
      sessionId,
      origin,
      started: false,
      ready: false,
      control: false,
      allowInput: false,
      pending: 0,
      seq: 0,
      inputSeq: 0,
      viewerSeq: 0,
      viewerAcks: new Map(),
      imeKeysRequested: ws.protocol === DESKTOP_IME_PROTOCOL || ws.protocol === DESKTOP_INPUT_PROTOCOL,
      extendedInputRequested: ws.protocol === DESKTOP_INPUT_PROTOCOL,
      frameAt: 0,
      lastSeen: now,
      messages: 0,
      rateAt: now,
      frames: 0,
      bytes: 0,
      since: now,
      ackTimes: [],
      fps: 10,
      frameRateAt: now,
      frameRate: 0,
    };
    this.viewers.add(v);
    ws.on("close", () => this.stop(v));
    ws.on("message", (rawBytes, binary) => {
      const bytes = Buffer.isBuffer(rawBytes)
        ? rawBytes
        : Array.isArray(rawBytes)
          ? Buffer.concat(rawBytes)
          : Buffer.from(rawBytes);
      if (!this.viewers.has(v)) return;
      const now = performance.now();
      if (now - v.rateAt >= 1000) {
        v.rateAt = now;
        v.messages = 0;
      }
      if (
        binary ||
        bytes.byteLength > 65536 ||
        ++v.messages > 300 ||
        !this.auth.verifySession(sessionId)
      ) {
        this.stop(v);
        return;
      }
      try {
        const rawMessage=JSON.parse(bytes.toString());
        if(rawMessage.type==="image_ready"&&Object.keys(rawMessage).length===1){
          if(!v.imageLane||!v.ready)throw Error("Unexpected image acknowledgement");v.imageViewerReady=true;this.activateImages(v);return;
        }
        const m = RemoteDesktopViewerMessage.parse(rawMessage);
        if (m.type === "start") {
          if (v.started) {
            this.stop(v);
            return;
          }
          v.started = true;
          v.since = now;
          v.fps = m.options.fps;
          void this.start(v, m.machineId, m.options).catch((error: unknown) => {
            this.send(ws, {
              type: "error",
              message: error instanceof DesktopSetupRequired
                ? error.message
                : "共有を開始できません。Bの補助プログラム設定・共有先の許可・接続状態を確認してください。",
            });
            this.stop(v);
          });
        } else if(m.type==="native_video_ack") {
          if(v.nativeVideo&&v.media?.native&&v.provider&&m.id===v.media.id&&m.generation===v.media.generation) {
            if(m.seq<=(v.media.lastAck??0))return;
            if(m.seq!==v.media.pending?.[0])throw new Error("Native ACK order");v.media.pending.shift();v.media.lastAck=m.seq;
            const drawnAt=v.media.sentAt?.get(m.seq);
            if(drawnAt===undefined)delete v.media.drawnAt;else v.media.drawnAt=drawnAt;
            v.media.sentAt?.delete(m.seq);this.send(v.provider,m);
          }
        } else if (
          m.type === "media" ||
          m.type === "media_fallback" ||
          m.type === "rtc_signal" ||
          m.type === "media_feedback" ||
          m.type === "quality" ||
          m.type === "clipboard_grant" ||
          m.type === "clipboard"
        ) {
          if (v.features && v.ready && v.provider && (!v.secureDesktop || m.type === "quality")) {
            if(m.type==="media"&&m.enabled&&m.settings?.transport==="native"&&(!v.nativeVideo || (v.videoLane && !v.videoActive))) { this.send(v.ws,{type:"media_unavailable"}); return; }
            if (m.type === "rtc_signal" && m.signal.kind === "offer") throw new Error();
            if(m.type==="media"&&m.settings?.fps!==undefined&&(m.settings.transport!=="native"||v.nativeMaxFps!==60))delete m.settings.fps;
            if (m.type === "media") {
              if (v.media) { v.retiredMedia.add(v.media.id); if(v.retiredMedia.size>32)v.retiredMedia.delete(v.retiredMedia.values().next().value!); }
              delete v.media;
              v.requestedNative = m.enabled && m.settings?.transport === "native";
            }
            this.send(v.provider, m);
          }
        } else if (m.type === "heartbeat") {
          v.lastSeen = now;
          if (v.provider) this.send(v.provider, m);
        } else if (m.type === "stop") this.stop(v);
        else if (m.type === "agent_grant") {
          if (m.enabled && v.ready && v.allowInput && !v.secureDesktop) {
            this.send(v.ws, { type: "agent_ticket", ...this.agents.grant(v.agent) });
            this.send(v.ws, { type: "control", enabled: false });
          } else this.agents.revoke(v.agent);
        } else if (m.type === "release") {
          if (v.provider && v.control && !this.agents.occupied(v.agent)) this.send(v.provider, m);
        } else if (m.type === "control") {
          if (this.agents.occupied(v.agent) && !m.enabled) return;
          this.agents.revoke(v.agent);
          v.control = m.enabled && v.allowInput && v.ready;
          if (v.provider && !this.send(v.provider, { type: "control", enabled: v.control }))
            this.stop(v);
        } else if (m.type === "keyframe") {
          if (v.provider) this.send(v.provider, m);
        } else if (m.type === "sas") {
          if (v.secureDesktop && !v.lockScreenCover && v.control && v.ready && v.provider && !this.agents.occupied(v.agent))
            this.send(v.provider, m);
        } else if (m.type === "dismiss_lock_screen") {
          if (v.lockScreenCover && v.secureDesktop && v.control && v.ready && v.provider && !this.agents.occupied(v.agent))
            this.send(v.provider, m);
        } else if (m.type === "input") {
          if (isExtendedDesktopInput(m.input) && !v.extendedInput) return;
          if (m.input.kind === "key" && (m.input.code === "ImeOn" || m.input.code === "ImeOff") && !v.imeKeys) return;
          if (
            v.control &&
            !this.agents.occupied(v.agent) &&
            v.provider &&
            m.seq > v.viewerSeq &&
            m.frameSeq <= v.seq &&
            m.frameSeq >= v.seq - 1 &&
            v.seq > 0 &&
            (v.nativeInputFreshness && v.media?.native
              ? v.media.drawnAt !== undefined && now - v.media.drawnAt < 2000
              : now - v.frameAt < 5000)
          ) {
            v.viewerSeq = m.seq;
            const seq = ++v.inputSeq;
            v.viewerAcks.set(seq, m.seq);
            if (v.viewerAcks.size > 64) v.viewerAcks.delete(v.viewerAcks.keys().next().value!);
            if (!this.send(v.provider, { ...m, seq, ...(v.nativeInputFreshness && v.media?.native ? {nativeDraw:true} : {}) })) this.stop(v);
          }
        } else if (m.type === "ack") {
          if (!v.provider || v.pending !== m.seq) {
            this.stop(v);
            return;
          }
          v.pending = 0;
          v.ackTimes.push(now - v.frameAt);
          if (v.ackTimes.length > 120) v.ackTimes.shift();
          if (!this.send(v.provider, m)) {
            this.stop(v);
            return;
          }
          const sorted = [...v.ackTimes].sort((a, b) => a - b),
            seconds = Math.max(0.001, (now - v.since) / 1000);
          this.send(ws, {
            type: "stats",
            frames: v.frames,
            bytes: v.bytes,
            fps: v.frames / seconds,
            mbps: (v.bytes * 8) / seconds / 1e6,
            ackP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
          });
        }
      } catch {
        this.stop(v);
      }
    });
  }
  private async start(
    v: Viewer,
    machineId: string,
    options: import("@sodashitsu/protocol").DesktopOptions,
  ): Promise<void> {
    const route = this.machines.route(machineId);
    if (route.kind !== "ok") throw new Error("machine unavailable");
    const channel = route.link.openChannel();
    if (!channel) throw new Error("machine unavailable");
    const rpc = new DesktopBridgeRpc(channel, () => this.stop(v));
    v.rpc = rpc;
    await rpc.hello();
    if (!this.viewers.has(v)) return;
    const caps = z
      .object({
        available: z.boolean(),
        allowInput: z.boolean(),
        deltas: z.boolean().optional(),
        imageSettings: z.boolean().optional(),
        imeKeys: z.boolean().optional(),
        extendedInput: z.boolean().optional(),
        videoLane: z.boolean().optional(),imageLane:z.boolean().optional(),
        nativeVideo: z.boolean().optional(),
        nativeInputFreshness: z.boolean().optional(),
        nativeVideoWindow:z.literal(3).optional(),
        nativeMaxFps:z.literal(60).optional(),
        cursor:z.boolean().optional(),
        features: z.boolean().optional(),
        displayResize: z.boolean().optional(),
      })
      .parse(await rpc.request("desktop.capabilities", {}));
    if (!this.viewers.has(v)) return;
    if (!caps.available) throw new DesktopSetupRequired(
      "接続先PCでデスクトップ共有が許可されていません。接続先の設定「デスクトップ共有」で許可するか、soda serve --desktop で起動してください。",
    );
    const ticket = randomBytes(32).toString("base64url");
    v.ticketHash = hash(ticket);
    this.invites.set(v.ticketHash, v);
    const url = new URL("/desktop-share", v.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const { deltas, image, adaptive, features, display, ...legacyOptions } = options;
    delete legacyOptions.imeKeys;
    delete legacyOptions.extendedInput;
    delete legacyOptions.nativeVideo;
    delete legacyOptions.nativeVideoWindow;
    delete legacyOptions.nativeMaxFps;
    delete legacyOptions.cursor;
    v.cursor=v.cursorRequested===true&&caps.cursor===true;
    if(v.nativeRateRequested&&caps.nativeMaxFps===60)v.nativeMaxFps=60;else delete v.nativeMaxFps;
    if(v.nativeWindowRequested&&caps.nativeVideoWindow===3)v.nativeVideoWindow=3;else delete v.nativeVideoWindow;
    v.nativeVideo=v.nativeVideoRequested&&caps.nativeVideo===true;
    v.nativeInputFreshness=v.nativeVideo&&caps.nativeInputFreshness===true;
    // Capability requires both the viewer opt-in and B's current RPC schema.
    v.imeKeysNegotiated = v.imeKeysRequested && caps.imeKeys === true;
    v.extendedInputNegotiated = v.extendedInputRequested && caps.extendedInput === true;
    if (display && (!caps.displayResize || !caps.features))
      throw new Error("B does not allow display resize");
    v.features = caps.features === true;
    if (adaptive && !v.features) throw new Error("B requires update for adaptive quality");
    if (image && !caps.imageSettings && (image.colorMode !== "full" || !image.showCursor))
      throw new Error("B requires an update for image settings");
    const negotiated = {
      ...legacyOptions,
      ...(v.cursor?{cursor:true as const}:{}),
      ...(v.nativeVideo?{nativeVideo:true as const}:{}),
      ...(v.nativeVideo&&v.nativeMaxFps===60?{nativeMaxFps:60 as const}:{}),
      ...(v.nativeVideo&&v.nativeVideoWindow===3?{nativeVideoWindow:3 as const}:{}),
      ...(v.imeKeysNegotiated ? { imeKeys: true as const } : {}),
      ...(v.extendedInputNegotiated ? { extendedInput: true as const } : {}),
      ...(display ? { display } : {}),
      ...(caps.features ? { adaptive, features } : {}),
      ...(caps.deltas ? { deltas } : {}),
      ...(caps.imageSettings ? { image } : {}),
    };
    if (v.nativeVideo && v.videoLaneRequested && caps.videoLane) {
      v.videoLane = this.videoLanes.issue(v.sessionId, v.origin,
        (bytes, binary) => v.receiveVideo?.(bytes, binary),
        () => {
          if (!this.viewers.has(v)) return;
          v.videoActive = true;
          if (v.provider) this.send(v.provider, {type:"video_ready"});
          this.send(v.ws, {type:"video_ready"});
        },
        () => {
          if (!this.viewers.has(v)) return;
          v.videoActive = false;
          const media = v.media;
          if (media?.native) { if (v.provider) this.send(v.provider,{type:"media",enabled:false}); delete v.media; this.send(v.ws, {type:"media_status",id:media.id,state:"images",audio:false,reason:"unavailable"}); }
          this.send(v.ws, {type:"video_closed"});
        });
      this.send(v.ws, {type:"video_ticket",ticket:v.videoLane.viewerTicket});
    }
    if(v.imageLaneRequested&&caps.imageLane){
      v.imageLane=this.imageLanes.issue(v.sessionId,v.origin,(bytes,binary)=>v.receiveImage?.(bytes,binary),
        ()=>{v.imageAttached=true;this.activateImages(v);},
        ()=>{if(!this.viewers.has(v))return;if(v.imageActive){this.send(v.ws,{type:"error",message:"画像の専用接続が切れました。接続し直してください。"});this.stop(v);return;}v.imageAttached=false;if(v.provider)this.send(v.provider,{type:"image_closed"});this.send(v.ws,{type:"image_closed"});});
      this.send(v.ws,{type:"image_ticket",ticket:v.imageLane.viewerTicket});
    }
    await rpc.request("desktop.start", {
      url: url.href,
      ticket,
      ...(v.videoLane ? {videoTicket:v.videoLane.providerTicket} : {}),
      ...(v.imageLane?{imageTicket:v.imageLane.providerTicket}:{}),
      options: negotiated,
    });
  }
  private activateImages(v:Viewer){
    if(!this.viewers.has(v)||v.imageActive||!v.imageAttached||!v.imageViewerReady||!v.ready||!v.provider)return;
    v.imageActive=true;this.send(v.provider,{type:"image_ready"});
  }
  private provider(ws: WebSocket): void {
    this.pendingProviders.add(ws);
    const deadline = setTimeout(() => ws.terminate(), 5000);
    deadline.unref();
    let owner: Viewer | undefined;
    ws.on("close", () => {
      clearTimeout(deadline);
      this.pendingProviders.delete(ws);
      if (owner) this.stop(owner);
    });
    const receive = (rawBytes: import("ws").RawData, binary: boolean, lane = false, imageLane = false) => {
      const bytes = Buffer.isBuffer(rawBytes)
        ? rawBytes
        : Array.isArray(rawBytes)
          ? Buffer.concat(rawBytes)
          : Buffer.from(rawBytes);
      try {
        if (!owner) {
          if (binary || bytes.byteLength > 1024) throw new Error();
          const msg = z
            .object({
              type: z.literal("provider"),
              ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
            })
            .strict()
            .parse(JSON.parse(bytes.toString()));
          const v = this.invites.get(hash(msg.ticket));
          if (
            !v ||
            v.provider ||
            !this.viewers.has(v) ||
            !this.auth.verifySession(v.sessionId) ||
            performance.now() - v.since > 10000
          )
            throw new Error();
          owner = v;
          v.provider = ws;
          this.invites.delete(v.ticketHash!);
          delete v.ticketHash;
          clearTimeout(deadline);
          this.pendingProviders.delete(ws);
          v.receiveVideo = (bytes, binary) => receive(bytes, binary, true);
          v.receiveImage=(bytes,binary)=>receive(bytes,binary,false,true);
          this.send(ws, { type: "attached" });
          return;
        }
        const v = owner;
        if(imageLane&&(!v.imageActive||!binary||isDesktopMediaChunk(bytes)||isDesktopCursor(bytes)))throw Error("Image lane only");
        if (lane) {
          if (!v.videoActive) return;
          if (binary ? !isDesktopMediaChunk(bytes) : bytes.length > 65536 || !["media_status","media_stream","native_video_stats"].includes(JSON.parse(bytes.toString()).type)) throw Error("Video lane only");
        }
        const sendMedia = (value: unknown) => lane ? v.videoLane!.send(value) : this.send(v.ws, value);
        if(binary&&isDesktopCursor(bytes)) {
          if(lane||!v.ready||v.secureDesktop||!v.cursor||!v.cursorStream)throw Error("Cursor is not negotiated");
          v.cursorStream.accept(decodeDesktopCursor(bytes));return;
        }
        if (binary && isDesktopMediaChunk(new Uint8Array(bytes as Buffer))) {
          if (!v.ready || !v.features) throw new Error();
          if (!v.media || (v.videoLane && lane !== !!v.media.native)) return;
          const chunk = decodeDesktopMediaChunk(bytes);
          if (chunk.generation !== v.media.generation) return;
          if (chunk.seq !== v.media.seq + 1) throw new Error();
          if(v.media.native&&(v.media.pending?.length??0)>=(v.media.window??1))throw new Error("Native video backlog");
          v.media.seq = chunk.seq;
          if(v.media.native){(v.media.pending??=[]).push(chunk.seq);(v.media.sentAt??=new Map()).set(chunk.seq,performance.now());}
          if ((lane ? v.videoLane!.buffered() : v.ws.bufferedAmount) > 512 * 1024) {
            if (lane) { v.videoLane!.fail(); return; }
            if (v.provider) this.send(v.provider, { type: "media", enabled: false });
            delete v.media;
            return;
          }
          sendMedia(new Uint8Array(bytes));
          return;
        }
        if (binary) {
          if(v.imageActive&&!imageLane)throw Error("Image requires its negotiated lane");
          if (!v.ready || v.pending || v.lockScreenCover) throw new Error();
          const { info, image } = decodeDesktopFrame(new Uint8Array(bytes as Buffer));
          if (info.seq <= v.seq) throw new Error();
          const now = performance.now();
          if (now - v.frameRateAt >= 1000) {
            v.frameRateAt = now;
            v.frameRate = 0;
          }
          if (++v.frameRate > v.fps + 3) throw new Error();
          v.chain.accept(info);
          if (!info.update && !v.secureDesktop) {
            v.latest = { info, image: image.slice(), at: now };
            if (v.snapshot) {
              const pending = v.snapshot;
              delete v.snapshot;
              clearTimeout(pending.timer);
              pending.resolve();
            }
          }
          v.seq = info.seq;
          v.pending = info.seq;
          v.frameAt = now;
          v.frames++;
          v.bytes += bytes.byteLength;
          if (!(imageLane?v.imageLane!.send(bytes):this.send(v.ws, new Uint8Array(bytes as Buffer)))) this.stop(v);
        } else {
          if (bytes.byteLength > 65536) throw new Error();
          const msg = JSON.parse(bytes.toString());
          if (["media_status","media_stream","native_video_stats","rtc_signal"].includes(msg.type)) {
            if (typeof msg.id === "string" && v.retiredMedia.has(msg.id)) return;
            if (lane && !v.requestedNative) return;
            if (v.videoLane && !lane && v.requestedNative && ((msg.type === "media_status" && msg.state !== "images") || msg.type === "media_stream" || msg.type === "rtc_signal")) return;
          }
          if (msg.type === "ready" && !v.ready) {
            const ready = DesktopReady.parse(msg);
            v.ready = true;
            v.allowInput = ready.allowInput;
            v.secureDesktop = ready.secureDesktop === true;
            v.lockScreenCover = ready.lockScreenCover === true;
            v.imeKeys = v.imeKeysNegotiated === true && ready.imeKeys === true && !v.lockScreenCover;
            v.extendedInput = v.extendedInputNegotiated === true && ready.extendedInput === true && !v.lockScreenCover;
            if (v.secureDesktop) {
              this.agents.revoke(v.agent);
              delete v.latest;
              if (ready.allowMedia || ready.allowClipboard || ready.display) throw new Error();
            }
            v.since = performance.now();
            v.nativeVideo=v.nativeVideo===true&&ready.nativeVideo===true&&!v.secureDesktop;
            if(ready.nativeVideoWindow!==3||!v.nativeVideo)delete v.nativeVideoWindow;
            v.cursor=v.cursor===true&&ready.cursor===true&&!v.secureDesktop;
            if(v.cursor)v.cursorStream=new DesktopCursorStream(bytes=>this.send(v.ws,bytes),()=>v.ws.bufferedAmount);
            if(ready.nativeMaxFps!==60||!v.nativeVideo)delete v.nativeMaxFps;
            const { imeKeys, extendedInput, nativeVideo,nativeVideoWindow,nativeMaxFps,cursor,imageLane:helperImageLane, ...legacyReady } = ready;
            this.send(v.ws, { ...legacyReady, ...(v.imageLane?{imageLane:true}:{}), ...(v.nativeVideo?{nativeVideo:true}:{}),...(v.nativeVideoWindow===3?{nativeVideoWindow:3}:{}), ...(v.nativeMaxFps===60?{nativeMaxFps:60}:{}), ...(v.cursor?{cursor:true}:{}), ...(v.imeKeys && imeKeys ? { imeKeys: true } : {}), ...(v.extendedInput && extendedInput ? { extendedInput: true } : {}) });
          } else if (msg.type === "session_locked" && !v.secureDesktop && v.ready) {
            this.send(v.ws, { type: "session_locked" });
            this.stop(v);
          } else if (msg.type === "session_unlocked" && v.secureDesktop && v.ready) {
            this.send(v.ws, { type: "session_unlocked" });
            this.stop(v);
          } else if (msg.type === "lock_screen_changed" && v.secureDesktop && v.lockScreenCover && v.ready) {
            this.send(v.ws, { type: "lock_screen_changed" });
            this.stop(v);
          } else if (msg.type === "unlock_failure" && (!v.ready || v.secureDesktop) && unlockFailure(msg.code)) {
            const failure = unlockFailure(msg.code)!;
            this.send(v.ws, failure.retry
              ? { type: "lock_screen_changed" }
              : { type: "error", message: failure.message });
            this.stop(v);
          } else if (msg.type === "media_status" && v.features && !v.secureDesktop) {
            const status = DesktopMediaStatus.parse(msg);
            if(status.state==="native"&&!v.nativeVideo)throw new Error();
            if (status.state === "images") { if(v.media && status.id!==v.media.id)return; delete v.media; }
            else if (!v.media || v.media.id !== status.id)
              v.media = { id: status.id, generation: 0, seq: 0 };
            if(v.media && lane && status.state !== "images") v.media.native=true;
            if(v.media&&status.state==="native"){v.media.native=true;v.media.window=v.nativeVideoWindow??1;v.media.pending=[];v.media.lastAck=0;v.media.sentAt=new Map();delete v.media.drawnAt;}
            sendMedia(status);
          } else if (msg.type === "media_stream" && v.media) {
            const stream = DesktopMediaStream.parse(msg);
            if (stream.id !== v.media.id || stream.generation <= v.media.generation)
              throw new Error();
            if((stream.mime==="video/h264")!==!!v.media.native)throw new Error();
            if(stream.mime==="video/h264"&&(stream.window??1)!==(v.media.window??1))throw new Error();
            v.media.generation = stream.generation;
            v.media.seq = 0;
            sendMedia(stream);
          } else if(msg.type==="native_video_stats"&&v.nativeVideoWindow===3&&v.media?.native) {
            const stats=DesktopNativeVideoStats.parse(msg);if(stats.id!==v.media.id)throw new Error();this.send(v.ws,stats);
          } else if (msg.type === "rtc_signal" && v.features) {
            const signal = DesktopMediaSignal.parse(msg);
            if (signal.id !== v.media?.id || signal.signal.kind === "answer") throw new Error();
            this.send(v.ws, signal);
          } else if (
            msg.type === "clipboard_state" &&
            v.features &&
            typeof msg.enabled === "boolean"
          )
            this.send(v.ws, { type: "clipboard_state", enabled: msg.enabled });
          else if (msg.type === "clipboard_result" && v.features)
            this.send(v.ws, DesktopClipboardResult.parse(msg));
          else if (msg.type === "media_unavailable" && v.features)
            this.send(v.ws, { type: "media_unavailable" });
          else if (msg.type === "control" && typeof msg.enabled === "boolean") {
            if (msg.enabled === v.control)
              this.send(v.ws, {
                type: "control",
                enabled: v.control && !this.agents.occupied(v.agent),
              });
          } else if (
            msg.type === "input_ack" &&
            Number.isSafeInteger(msg.seq) &&
            msg.seq > 0 &&
            msg.seq <= v.inputSeq
          ) {
            const wait = v.inputWaits.get(msg.seq);
            if (wait) {
              v.inputWaits.delete(msg.seq);
              wait.resolve();
            } else {
              const viewerSeq = v.viewerAcks.get(msg.seq);
              if (viewerSeq !== undefined) {
                v.viewerAcks.delete(msg.seq);
                this.send(v.ws, { type: "input_ack", seq: viewerSeq });
              }
            }
          } else throw new Error();
        }
      } catch {
        if (lane && owner?.videoLane) { owner.videoLane.fail(); return; }
        ws.terminate();
        if (owner) this.stop(owner);
      }
    };
    ws.on("message", (bytes, binary) => receive(bytes, binary));
  }
  private agentFrame(v: Viewer): AgentFrame | undefined {
    if (v.secureDesktop) return;
    const full = v.latest,
      current = v.chain.last;
    if (!full || !current || full.info.contentId !== current.contentId) return;
    return { info: { ...full.info, seq: current.seq }, image: full.image, at: v.frameAt };
  }
  private async capture(v: Viewer, after?: number): Promise<void> {
    if (v.secureDesktop) throw new RpcError("unauthorized", "Lock screen is human-only");
    const current = this.agentFrame(v);
    if (
      current &&
      performance.now() - current.at < 2000 &&
      (after === undefined || current.info.seq > after)
    )
      return;
    if (!this.viewers.has(v) || !v.provider)
      throw new RpcError("server_busy", "Desktop unavailable");
    let waiting = v.snapshot?.promise;
    if (!v.snapshot) {
      let resolve!: () => void, reject!: (e: Error) => void;
      const promise = new Promise<void>((a, b) => {
        resolve = a;
        reject = b;
      });
      const timer = setTimeout(() => {
        delete v.snapshot;
        reject(new RpcError("server_busy", "Fresh full frame unavailable"));
      }, 2500);
      v.snapshot = { promise, resolve, reject, timer };
      waiting = promise;
      // Legacy sources already send full images. Delta sources send a fresh full JPEG on demand.
      if (v.chain.last?.contentId && !this.send(v.provider, { type: "keyframe" })) this.stop(v);
    }
    await waiting;
  }
  private stop(v: Viewer): void {
    if (!this.viewers.delete(v)) return;
    this.agents.revoke(v.agent);
    v.videoLane?.close();v.imageLane?.close();
    if (v.snapshot) {
      clearTimeout(v.snapshot.timer);
      v.snapshot.reject(new RpcError("unauthorized", "Desktop stopped"));
      delete v.snapshot;
    }
    delete v.latest;
    if (v.ticketHash) this.invites.delete(v.ticketHash);
    v.rpc?.close();
    for (const ws of [v.ws, v.provider])
      if (ws) {
        ws.close(1000, "desktop stopped");
        const t = setTimeout(() => ws.terminate(), 1000);
        t.unref();
        ws.once("close", () => clearTimeout(t));
      }
  }
  clientGone(owner: string): void {
    this.agents.clientGone(owner);
  }
  closeShares(): void {
    for (const v of [...this.viewers]) this.stop(v);
    for (const ws of this.pendingProviders) ws.terminate();
    this.pendingProviders.clear();
    this.videoLanes.close();this.imageLanes.close();
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
