import {DesktopSharedMonitorsFailure} from "@sodashitsu/protocol";
import {desktopFeaturesFromProtocols} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_DELTAS_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_CLIPBOARD_PROTOCOL,DesktopSharedClipboardFailure} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_CURSOR_PROTOCOL,DesktopSharedCursorFailure} from "@sodashitsu/protocol";
import {DESKTOP_FOLDERS_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_FILE_CHECKPOINTS_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_MICROPHONE_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_PROTECTED_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_RESOLUTION_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_NATIVE_PLATFORM_PROTOCOL,DesktopNativePlatform,DesktopNativePlatformFailure,desktopNativePlatformFailureMessage,supportsDesktopInput,type DesktopInputCapabilities} from "@sodashitsu/protocol";
import {DESKTOP_SHARED_AUDIO_PROTOCOL} from "@sodashitsu/protocol";
import { DESKTOP_MICROPHONE_OPUS_FEATURE, DESKTOP_MICROPHONE_PROTOCOL, DesktopMicrophoneRequest, DesktopMicrophoneResult } from "@sodashitsu/protocol";
import { DESKTOP_SHARED_DATAGRAM_PROTOCOL,DESKTOP_SHARED_NATIVE_PROTOCOL, DESKTOP_SHARED_PROTOCOL } from "@sodashitsu/protocol";
import {DESKTOP_PROTECTED_PROTOCOL,DesktopProtectedFailure,desktopProtectedFailureMessage} from "@sodashitsu/protocol";
import {DesktopVirtualFailure,desktopVirtualFailureMessage,DESKTOP_VIRTUAL_DISPLAY_PROTOCOL,DESKTOP_NATIVE_CODEC_PROTOCOL,isDesktopNativeStream} from "@sodashitsu/protocol";
import {DESKTOP_NATIVE_ADAPTIVE_PROTOCOL,DesktopNativeProfilePending,DesktopNativeFormatAck,DesktopNativeFormatReady} from "@sodashitsu/protocol";
import {DESKTOP_MONITORS_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_FILES_PROTOCOL,DesktopFileRequest,DesktopFileResult} from "@sodashitsu/protocol";
import {DESKTOP_RICH_CLIPBOARD_PROTOCOL,DesktopRichClipboardRequest,DesktopRichClipboardResult} from "@sodashitsu/protocol";
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
  DESKTOP_AUDIO_PROTOCOL,DesktopNativeAudioStatus,isDesktopAudio,decodeDesktopAudio,
  DesktopNativeVideoStats,DESKTOP_DATAGRAM_PROTOCOL,DesktopNativeFrameNotice,DesktopNativeDrawAck,
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
import { DesktopAgentAccess, type AgentTarget, type AgentFrame, type DesktopAgentRecipient } from "./DesktopAgentAccess.js";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { MachineLink } from "../machine/MachineLink.js";
import { DesktopBridgeRpc } from "./bridgeRpc.js";
import { unlockFailure } from "./unlockFailure.js";

import { DesktopCursorStream } from "./DesktopCursorStream.js";
import { DesktopVideoLanes } from "./DesktopVideoLanes.js";

class DesktopSetupRequired extends Error {}

type Viewer = {
  nativePlatformRequested?:boolean;nativePlatform?:import("@sodashitsu/protocol").DesktopNativePlatform;inputCapabilities?:DesktopInputCapabilities;nativeInputFloor?:number;
  sharedDatagramsRequested?:boolean;sharedDatagrams?:boolean;sharedNativeRequested?:boolean;sharedNative?:boolean;sharedRequested?: boolean; sharedDesktop?: boolean; controlRequests?: boolean[];
  elevatedRequested?:boolean;elevatedDesktop?:boolean;protectedDesktop?: "elevated-default"|"elevated-uac";
  virtualDisplayRequested?:boolean;virtualDisplay?:boolean;
  monitorsRequested?:boolean;monitors?:boolean;
  sharedCursorRequested?:boolean;sharedCursor?:boolean;
  sharedDeltasRequested?:boolean;sharedDeltas?:boolean;
  sharedClipboardRequested?:boolean;sharedClipboard?:boolean;
  foldersRequested?:boolean;folders?:boolean;
  folderCheckpointsRequested?:boolean;folderCheckpoints?:boolean;
  sharedMonitorsRequested?:boolean;sharedMonitors?:boolean;independentMonitorsRequested?:boolean;independentMonitors?:boolean;
  fileCheckpointsRequested?:boolean;fileCheckpoints?:boolean;durableFileCheckpoints?:boolean;durableFolderCheckpoints?:boolean;
  fileRequested?:boolean;files?:boolean;fileLane?:ReturnType<DesktopVideoLanes["issue"]>;
  sharedRate?:boolean;sharedAudioRequested?:boolean;sharedAudio?:boolean;
  sharedMicrophoneRequested?:boolean;sharedMicrophone?:boolean;microphoneRequested?:boolean;microphone?:boolean;sharedProtectedRequested?:boolean;sharedProtectedAvailable?:boolean;sharedProtected?:boolean;sharedResolutionRequested?:boolean;sharedResolution?:boolean;microphoneOpusRequested?:boolean;microphoneOpus?:boolean;microphoneLane?:ReturnType<DesktopVideoLanes["issue"]>;
  richRequested?:boolean;richClipboard?:boolean;richGranted?:boolean;clipboardLane?:ReturnType<DesktopVideoLanes["issue"]>;
  nativeAudioRequested?:boolean;nativeAudio?:boolean;requestedNativeAudio?:boolean;
  nativeDatagramsRequested?:boolean;nativeDatagrams?:boolean;
  imageLaneRequested?:boolean; imageLane?:ReturnType<DesktopVideoLanes["issue"]>; imageAttached?:boolean; imageViewerReady?:boolean; imageActive?:boolean; receiveImage?:(bytes:Buffer,binary:boolean)=>void;
  cursorRequested?:boolean;
  cursor?:boolean;
  cursorStream?:DesktopCursorStream;
  nativeRateRequested?: boolean;
  nativeCodecsRequested?:boolean;nativeCodecs?:boolean;
  nativeAdaptiveRequested?:boolean;nativeAdaptive?:boolean;
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
  media?: { id: string; generation: number; seq: number; native?:boolean; datagrams?:boolean; audioRequested?:boolean;audioSeq?:number;audioGeneration?:number;nextNativeAt?:number;barrier?:{generation:number;at:number;baseSeq?:number}; pending?:number[]; window?:1|3;lastAck?:number;sentAt?:Map<number,number>;freshAt?:Map<number,number>;drawnAt?:number };
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
  private readonly fileLanes:DesktopVideoLanes;
  private readonly microphoneLanes:DesktopVideoLanes;
  private readonly clipboardLanes:DesktopVideoLanes;
  private readonly viewers = new Set<Viewer>();
  private readonly pendingProviders = new Set<WebSocket>();
  private readonly invites = new Map<string, Viewer>();
  private readonly revoked;
  private readonly timer;
  private closed = false;
  readonly agents = new DesktopAgentAccess();
  constructor(
    private readonly auth: Pick<AuthService,"authorizeUpgrade"|"verifySession"|"onSessionRevoked">,
    private readonly origins: Pick<OriginRejectionLog,"admit">,
    private readonly machines: {route(id:string):{kind:"ok";link:Pick<MachineLink,"openChannel">}|{kind:"unknown"|"offline"}},
  ) {
    this.microphoneLanes=new DesktopVideoLanes(id=>auth.verifySession(id),8192);
    this.fileLanes=new DesktopVideoLanes(id=>auth.verifySession(id),262144);
    this.clipboardLanes=new DesktopVideoLanes(id=>auth.verifySession(id),65536);
    this.videoLanes = new DesktopVideoLanes(id => auth.verifySession(id));
    this.imageLanes = new DesktopVideoLanes(id=>auth.verifySession(id),DESKTOP_MAX_FRAME_BYTES+4096);
    this.revoked = auth.onSessionRevoked((id) => {
      for (const v of this.viewers) if (v.sessionId === id) this.stop(v);
    });
    this.timer = setInterval(() => {
      const now = performance.now();
      this.agents.tick();
      this.videoLanes.tick();this.imageLanes.tick();this.clipboardLanes.tick();this.microphoneLanes.tick();this.fileLanes.tick();
      for (const v of this.viewers)
        if (
          !auth.verifySession(v.sessionId) ||
          now - v.lastSeen > 12000 ||
          (v.pending && now - v.frameAt > 5000) ||
          (v.started && !v.ready && now - v.since > (v.nativePlatform?140000:v.virtualDisplay?25000:15000))
        )
          this.stop(v);
    }, 1000);
    this.timer.unref();
  }
  async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reject = (status: string) =>
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    if (this.closed || this.viewers.size + this.pendingProviders.size + this.videoLanes.pendingCount + this.imageLanes.pendingCount+this.clipboardLanes.pendingCount+this.fileLanes.pendingCount+this.microphoneLanes.pendingCount >= 32) {
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
    if (this.closed || socket.destroyed || this.viewers.size + this.pendingProviders.size + this.videoLanes.pendingCount + this.imageLanes.pendingCount+this.clipboardLanes.pendingCount+this.fileLanes.pendingCount+this.microphoneLanes.pendingCount >= 32) {
      reject("503 Service Unavailable");
      return;
    }
    this.server.handleUpgrade(req, socket, head, (ws) => {
      ws.on("error", () => ws.terminate());
      const offered = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map(v => v.trim());
      if(offered.length===1&&offered[0]===DESKTOP_MICROPHONE_PROTOCOL){this.microphoneLanes.accept(ws,sessionId,origin);return;}
      if(offered.length===1&&offered[0]===DESKTOP_FILES_PROTOCOL){this.fileLanes.accept(ws,sessionId,origin);return;}
      if(offered.length===1&&offered[0]===DESKTOP_RICH_CLIPBOARD_PROTOCOL){this.clipboardLanes.accept(ws,sessionId,origin);return;}
      if (offered.length === 1 && offered[0] === DESKTOP_IMAGE_LANE_PROTOCOL) { this.imageLanes.accept(ws,sessionId,origin);return; }
      if (offered.length === 1 && offered[0] === DESKTOP_VIDEO_LANE_PROTOCOL) { this.videoLanes.accept(ws, sessionId, origin); return; }
      if (origin !== undefined) this.viewer(ws, sessionId, origin, String(req.headers["sec-websocket-protocol"]??"").split(",").map(v=>v.trim()).includes(DESKTOP_NATIVE_VIDEO_PROTOCOL), String(req.headers["sec-websocket-protocol"]??"").split(",").map(v=>v.trim()).includes(DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL), offered.includes(DESKTOP_VIDEO_LANE_PROTOCOL),offered.includes(DESKTOP_NATIVE_RATE_PROTOCOL),offered.includes(DESKTOP_CURSOR_PROTOCOL),offered.includes(DESKTOP_IMAGE_LANE_PROTOCOL),offered.includes(DESKTOP_DATAGRAM_PROTOCOL),offered.includes(DESKTOP_AUDIO_PROTOCOL),offered.includes(DESKTOP_RICH_CLIPBOARD_PROTOCOL),offered.includes(DESKTOP_FILES_PROTOCOL),offered.includes(DESKTOP_MONITORS_PROTOCOL),offered.includes(DESKTOP_NATIVE_ADAPTIVE_PROTOCOL),offered.includes(DESKTOP_NATIVE_CODEC_PROTOCOL),offered.includes(DESKTOP_VIRTUAL_DISPLAY_PROTOCOL),offered.includes(DESKTOP_PROTECTED_PROTOCOL),offered.includes(DESKTOP_SHARED_PROTOCOL),offered.includes(DESKTOP_SHARED_NATIVE_PROTOCOL),offered.includes(DESKTOP_SHARED_DATAGRAM_PROTOCOL),offered.includes(DESKTOP_MICROPHONE_PROTOCOL),offered.includes(DESKTOP_SHARED_AUDIO_PROTOCOL),offered.includes(DESKTOP_NATIVE_PLATFORM_PROTOCOL),offered.includes(DESKTOP_MICROPHONE_OPUS_FEATURE),offered.includes(DESKTOP_SHARED_RESOLUTION_PROTOCOL),offered.includes(DESKTOP_SHARED_PROTECTED_PROTOCOL),offered.includes(DESKTOP_SHARED_MICROPHONE_PROTOCOL),offered.includes(DESKTOP_FILE_CHECKPOINTS_PROTOCOL),offered.includes(DESKTOP_FOLDERS_PROTOCOL),offered.includes(DESKTOP_SHARED_CURSOR_PROTOCOL),offered.includes(DESKTOP_SHARED_CLIPBOARD_PROTOCOL),offered.includes(DESKTOP_SHARED_DELTAS_PROTOCOL)||desktopFeaturesFromProtocols(offered).has("sharedDeltas"),desktopFeaturesFromProtocols(offered).has("folderCheckpoints"),desktopFeaturesFromProtocols(offered).has("sharedMonitors"),desktopFeaturesFromProtocols(offered).has("independentMonitors"));
      else this.provider(ws);
    });
  }
  private send(ws: WebSocket, value: unknown): boolean {
    if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > DESKTOP_MAX_FRAME_BYTES + 4096)
      return false;
    ws.send(value instanceof Uint8Array ? value : JSON.stringify(value));
    return true;
  }
  private sendControl(v: Viewer, enabled: boolean): boolean {
    if (!this.viewers.has(v) || !v.provider) return false;
    if (v.sharedDesktop) {
      const queue = v.controlRequests ??= [];
      if (queue.length >= 32) { this.stop(v); return false; }
      queue.push(enabled);
    }
    const sent = this.send(v.provider, { type: "control", enabled });
    if (!sent && v.sharedDesktop) this.stop(v);
    return sent;
  }
  /** Provider-private endpoint integration only; never register on public RPC. */
  grantEndpointAgent(sessionId:string,recipient:DesktopAgentRecipient){
    if(this.closed||!this.auth.verifySession(sessionId))throw new RpcError("unauthorized","Endpoint viewer is unavailable");
    const viewers=[...this.viewers].filter(v=>v.sessionId===sessionId),v=viewers[0];
    if(viewers.length!==1||!v||!v.ready||!v.allowInput||v.secureDesktop||!v.provider||v.ws.readyState!==WebSocket.OPEN)throw new RpcError("unauthorized","Endpoint viewer is unavailable");
    const grant=this.agents.grant(v.agent,recipient);this.send(v.ws,{type:"control",enabled:false});return grant;
  }
  revokeEndpointAgent(sessionId:string):void{for(const v of this.viewers)if(v.sessionId===sessionId)this.agents.revoke(v.agent);}
  private viewer(ws: WebSocket, sessionId: string, origin: string, nativeVideoRequested=false,nativeWindowRequested=false, videoLaneRequested=false,nativeRateRequested=false,cursorRequested=false,imageLaneRequested=false,nativeDatagramsRequested=false,nativeAudioRequested=false,richRequested=false,fileRequested=false,monitorsRequested=false,nativeAdaptiveRequested=false,nativeCodecsRequested=false,virtualDisplayRequested=false,elevatedRequested=false,sharedRequested=false,sharedNativeRequested=false,sharedDatagramsRequested=false,microphoneRequested=false,sharedAudioRequested=false,nativePlatformRequested=false,microphoneOpusRequested=false,sharedResolutionRequested=false,sharedProtectedRequested=false,sharedMicrophoneRequested=false,fileCheckpointsRequested=false,foldersRequested=false,sharedCursorRequested=false,sharedClipboardRequested=false,sharedDeltasRequested=false,folderCheckpointsRequested=false,sharedMonitorsRequested=false,independentMonitorsRequested=false): void {
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
          if (v.provider) this.sendControl(v, v.control);
        },
        state: (active, expiresAt) => this.send(v.ws, { type: "agent_state", active, expiresAt }),
        input: (input: RemoteDesktopInput) =>
          new Promise<void>((resolve, reject) => {
            if(!supportsDesktopInput(v.inputCapabilities,input)){reject(new RpcError("invalid_params",desktopNativePlatformFailureMessage("input_unavailable")));return;}
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
                if(v.nativePlatform)v.nativeInputFloor=Math.max(v.nativeInputFloor??0,seq);
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
      independentMonitorsRequested,sharedMonitorsRequested,folderCheckpointsRequested,sharedCursorRequested,sharedClipboardRequested,sharedDeltasRequested,foldersRequested,fileCheckpointsRequested,sharedMicrophoneRequested,sharedProtectedRequested,sharedResolutionRequested,microphoneOpusRequested,nativePlatformRequested,sharedAudioRequested,microphoneRequested,sharedDatagramsRequested,sharedNativeRequested,sharedRequested,elevatedRequested,virtualDisplayRequested,nativeCodecsRequested,nativeAdaptiveRequested,cursorRequested,nativeDatagramsRequested,nativeAudioRequested,richRequested,fileRequested,monitorsRequested,
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
        } else if(m.type==="native_audio_control"){
          if(v.nativeAudio&&v.ready&&!v.secureDesktop&&v.media?.audioRequested&&m.id===v.media.id&&v.provider)this.send(v.provider,m);
        } else if(m.type==="native_codec_fallback"){
          if(v.nativeCodecs&&v.ready&&v.media?.native&&m.id===v.media.id&&v.provider)this.send(v.provider,m);
        } else if(m.type==="native_format_ack") {
          const b=v.media?.barrier;
          if(v.nativeAdaptive&&v.provider&&v.media&&!v.media.datagrams&&b&&m.id===v.media.id&&m.generation===b.generation&&m.baseSeq===b.baseSeq&&performance.now()-b.at<3000)this.send(v.provider,m);
        } else if(m.type==="native_video_ack") {
          if(v.nativeVideo&&v.media?.native&&v.provider&&m.id===v.media.id&&m.generation===v.media.generation) {
            if(v.media.datagrams||m.dropped)throw Error("Native ACK requires negotiated route");
            if(m.seq<=(v.media.lastAck??0))return;
            if(m.seq!==v.media.pending?.[0])throw new Error("Native ACK order");v.media.pending.shift();v.media.lastAck=m.seq;
            const drawnAt=v.media.freshAt?.get(m.seq)??v.media.sentAt?.get(m.seq);
            if(drawnAt===undefined)delete v.media.drawnAt;else v.media.drawnAt=drawnAt;
            v.media.sentAt?.delete(m.seq);v.media.freshAt?.delete(m.seq);this.send(v.provider,m);
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
            if(m.type==="media"&&m.settings?.udp!==undefined&&(!v.nativeDatagrams||m.settings.transport!=="native"))delete m.settings.udp;
            if(m.type==="media"&&m.settings?.codec!==undefined&&(!v.nativeCodecs||m.settings.transport!=="native"))delete m.settings.codec;
            if(m.type==="media"&&m.settings?.fps!==undefined&&(m.settings.transport!=="native"||v.nativeMaxFps!==60))delete m.settings.fps;
            if(m.type==="clipboard_grant")v.richGranted=m.enabled&&v.richClipboard===true;
            if (m.type === "media") {
              if(v.sharedDesktop&&!v.sharedRate&&m.settings)m.settings.adaptive=false;
              if (v.media) { v.retiredMedia.add(v.media.id); if(v.retiredMedia.size>32)v.retiredMedia.delete(v.retiredMedia.values().next().value!); }
              delete v.media;
              v.requestedNative = m.enabled && m.settings?.transport === "native";
              v.requestedNativeAudio=v.requestedNative&&m.settings?.audio===true&&v.nativeAudio===true;
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
          if (v.provider && !this.sendControl(v, v.control))
            this.stop(v);
        } else if (m.type === "keyframe") {
          if (v.provider) this.send(v.provider, m);
        } else if (m.type === "sas") {
          if (v.secureDesktop && !v.protectedDesktop && !v.lockScreenCover && v.control && v.ready && v.provider && !this.agents.occupied(v.agent))
            this.send(v.provider, m);
        } else if (m.type === "dismiss_lock_screen") {
          if (v.lockScreenCover && v.secureDesktop && v.control && v.ready && v.provider && !this.agents.occupied(v.agent))
            this.send(v.provider, m);
        } else if(m.type==="native_pointer_cancel") {if(v.provider)this.send(v.provider,m);}
        else if (m.type === "input") {
          const cancelPointer=()=>{if(v.provider&&!this.send(v.provider,{type:"native_pointer_cancel"}))this.stop(v);};
          if(!supportsDesktopInput(v.inputCapabilities,m.input)){cancelPointer();return;}
          if (isExtendedDesktopInput(m.input) && !v.extendedInput) {cancelPointer();return;}
          if (m.input.kind === "key" && (m.input.code === "ImeOn" || m.input.code === "ImeOff") && !v.imeKeys) {cancelPointer();return;}
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
          } else cancelPointer();
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
        endpointRequired:z.boolean().optional(),
        allowInput: z.boolean(),
        deltas: z.boolean().optional(),
        imageSettings: z.boolean().optional(),
        imeKeys: z.boolean().optional(),
        extendedInput: z.boolean().optional(),
        videoLane: z.boolean().optional(),imageLane:z.boolean().optional(),
        virtualDisplay:z.boolean().optional(),
        elevatedDesktop:z.boolean().optional(),
        sharedDesktop:z.boolean().optional(),
        sharedDeltas:z.boolean().optional(),
        sharedMonitors:z.boolean().optional(),
        independentMonitors:z.boolean().optional(),
        sharedCursor:z.boolean().optional(),
        sharedClipboard:z.boolean().optional(),
        sharedFiles:z.boolean().optional(),
        sharedMicrophone:z.boolean().optional(),
        sharedProtected:z.boolean().optional(),
        sharedNative:z.boolean().optional(),
        sharedDatagrams:z.boolean().optional(),
        nativePlatform:DesktopNativePlatform.optional(),
        sharedAudio:z.boolean().optional(),
        sharedRate:z.boolean().optional(),
        sharedResolution:z.boolean().optional(),
        monitors:z.boolean().optional(),
        files:z.boolean().optional(),
        fileCheckpoints:z.boolean().optional(),
        durableFileCheckpoints:z.boolean().optional(),
        durableFolderCheckpoints:z.boolean().optional(),
        folders:z.boolean().optional(),
        folderCheckpoints:z.boolean().optional(),
        richClipboard:z.boolean().optional(),
        microphone:z.boolean().optional(),
        microphoneOpus:z.boolean().optional(),
        nativeAudio:z.boolean().optional(),
        nativeVideo: z.boolean().optional(),nativeDatagrams:z.boolean().optional(),
        nativeInputFreshness: z.boolean().optional(),
        nativeVideoWindow:z.literal(3).optional(),
        nativeCodecs:z.boolean().optional(),
        nativeAdaptive:z.literal(true).optional(),
        nativeCadence:z.literal(true).optional(),
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
    if(caps.endpointRequired)throw new DesktopSetupRequired("接続先では暗号化接続が必須です。この窓でブラウザの鍵を作成し、接続先PCの指紋と相互の許可を設定してください。");
    const ticket = randomBytes(32).toString("base64url");
    v.ticketHash = hash(ticket);
    this.invites.set(v.ticketHash, v);
    const url = new URL("/desktop-share", v.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const { deltas, image, adaptive, features, display, ...legacyOptions } = options;
    delete legacyOptions.imeKeys;
    delete legacyOptions.extendedInput;
    delete legacyOptions.sharedRate;delete legacyOptions.nativePlatform;delete legacyOptions.sharedAudio;delete legacyOptions.sharedDatagrams;delete legacyOptions.sharedNative;delete legacyOptions.sharedDesktop;
    delete legacyOptions.independentMonitors;delete legacyOptions.sharedMonitors;delete legacyOptions.folderCheckpoints;delete legacyOptions.sharedDeltas;delete legacyOptions.sharedClipboard;delete legacyOptions.sharedCursor;delete legacyOptions.folders;delete legacyOptions.fileCheckpoints;delete legacyOptions.sharedMicrophone;delete legacyOptions.sharedProtected;delete legacyOptions.sharedResolution;delete legacyOptions.microphoneOpus;delete legacyOptions.microphone;delete legacyOptions.elevatedDesktop;delete legacyOptions.virtualDisplay;delete legacyOptions.monitors;delete legacyOptions.monitorDevice;delete legacyOptions.files;delete legacyOptions.richClipboard;delete legacyOptions.nativeVideo;delete legacyOptions.nativeDatagrams;delete legacyOptions.nativeAudio;
    delete legacyOptions.nativeVideoWindow;
    delete legacyOptions.nativeMaxFps;delete legacyOptions.nativeCadence;delete legacyOptions.nativeAdaptive;delete legacyOptions.nativeCodecs;
    delete legacyOptions.cursor;
    if(caps.nativePlatform){
      if(!v.nativePlatformRequested)throw new DesktopSetupRequired("Linux/macOSのnative共有には接続元サーバーとブラウザの更新が必要です。");
      v.nativePlatform=caps.nativePlatform;
    }
    v.cursor=v.cursorRequested===true&&caps.cursor===true;
    if(v.nativeRateRequested&&caps.nativeMaxFps===60)v.nativeMaxFps=60;else delete v.nativeMaxFps;
    if(v.nativeWindowRequested&&caps.nativeVideoWindow===3)v.nativeVideoWindow=3;else delete v.nativeVideoWindow;
    v.nativeVideo=v.nativeVideoRequested&&caps.nativeVideo===true;
    v.nativeCodecs=v.nativeVideo&&v.nativeCodecsRequested===true&&caps.nativeCodecs===true;
    v.nativeAdaptive=v.nativeVideo&&v.nativeAdaptiveRequested===true&&caps.nativeAdaptive===true;
    const sharedDeltasAvailable=v.sharedDeltasRequested===true&&caps.sharedDeltas===true&&caps.deltas===true&&caps.sharedDesktop===true&&caps.features===true;
    if(v.sharedDeltasRequested)this.send(v.ws,{type:"shared_deltas_available",enabled:sharedDeltasAvailable});
    v.sharedDeltas=options.sharedDeltas===true&&sharedDeltasAvailable;
    if(options.sharedDeltas&&(!v.sharedDeltas||!options.sharedDesktop||options.elevatedDesktop||options.virtualDisplay||options.deltas!==true))throw new DesktopSetupRequired("差分画像共有には通常共有と差分設定を選び、全ての窓と接続先を更新してください。");
    const sharedClipboardAvailable=v.sharedClipboardRequested===true&&caps.sharedClipboard===true&&caps.sharedDesktop===true&&caps.features===true;
    if(v.sharedClipboardRequested)this.send(v.ws,{type:"shared_clipboard_available",enabled:sharedClipboardAvailable});
    v.sharedClipboard=options.sharedClipboard===true&&sharedClipboardAvailable;
    if(options.sharedClipboard&&(!v.sharedClipboard||!options.sharedDesktop||options.elevatedDesktop||options.virtualDisplay))throw new DesktopSetupRequired("クリップボード共有経路には通常共有を選び、全ての窓と接続先を更新してください。");
    const sharedCursorAvailable=v.sharedCursorRequested===true&&v.cursorRequested===true&&caps.sharedCursor===true&&caps.cursor===true&&caps.sharedDesktop===true&&caps.features===true;
    if(v.sharedCursorRequested)this.send(v.ws,{type:"shared_cursor_available",enabled:sharedCursorAvailable});
    v.sharedCursor=options.sharedCursor===true&&sharedCursorAvailable;
    if(options.sharedCursor&&(!v.sharedCursor||!options.sharedDesktop||options.elevatedDesktop||options.virtualDisplay||options.image?.showCursor===false))throw new DesktopSetupRequired("独立カーソル共有は通常画面でカーソル表示を有効にし、全ての窓と接続先を更新してください。");
    v.sharedProtectedAvailable=v.sharedProtectedRequested===true&&caps.sharedProtected===true&&caps.elevatedDesktop===true&&caps.sharedDesktop===true&&caps.features===true;
    // A busy initial single-view request still needs the explicit join controls.
    if(v.sharedProtectedRequested)this.send(v.ws,{type:"shared_protected_available",enabled:v.sharedProtectedAvailable});
    v.elevatedDesktop=options.elevatedDesktop===true&&v.elevatedRequested===true&&caps.elevatedDesktop===true&&caps.features===true;
    if(options.elevatedDesktop&&(!v.elevatedDesktop||options.virtualDisplay||options.monitorDevice||options.display))throw new DesktopSetupRequired(options.virtualDisplay||options.monitorDevice||options.display?desktopProtectedFailureMessage("conflict"):desktopProtectedFailureMessage("not_allowed")+"接続先と接続元を更新し、専用保護サービスを確認してください。");
    v.virtualDisplay=options.virtualDisplay===true&&v.virtualDisplayRequested===true&&caps.virtualDisplay===true;
    if(options.virtualDisplay&&(!v.virtualDisplay||options.monitorDevice))throw new DesktopSetupRequired("接続先を更新し、仮想画面の作成を許可してください。モニター指定との併用はできません。");
    const sharedMonitorsAvailable=v.sharedMonitorsRequested===true&&v.monitorsRequested===true&&caps.monitors===true&&caps.sharedMonitors===true&&caps.sharedDesktop===true&&caps.features===true;
    if(v.sharedMonitorsRequested)this.send(v.ws,{type:"shared_monitors_available",enabled:sharedMonitorsAvailable});
    v.sharedMonitors=options.sharedMonitors===true&&sharedMonitorsAvailable;
    if(options.sharedMonitors&&(!v.sharedMonitors||!options.sharedDesktop||options.elevatedDesktop||options.virtualDisplay))throw new DesktopSetupRequired("モニター共有には全ての窓で同じ選択を行い、両端を更新してBのモニター共有を許可してください。");
    const independentAvailable=v.independentMonitorsRequested===true&&caps.independentMonitors===true&&sharedMonitorsAvailable;
    if(v.independentMonitorsRequested)this.send(v.ws,{type:"independent_monitors_available",enabled:independentAvailable});
    v.independentMonitors=options.independentMonitors===true&&independentAvailable;
    if(options.independentMonitors&&(!v.independentMonitors||!options.sharedDesktop||!options.sharedMonitors||!options.monitorDevice||options.elevatedDesktop||options.virtualDisplay||options.display||options.nativePlatform))throw new DesktopSetupRequired("独立モニター配信には両端の対応と通常モニター共有、表示IDの指定が必要です。");
    v.monitors=v.monitorsRequested===true&&caps.monitors===true;
    if(options.monitorDevice&&!v.monitors)throw new DesktopSetupRequired("接続先を更新し、全モニターの共有と切替を許可してください");
    v.files=v.fileRequested===true&&caps.files===true&&(!options.sharedDesktop||caps.sharedFiles===true);
    v.folders=v.files&&v.foldersRequested===true&&caps.folders===true;
    v.folderCheckpoints=v.folders&&v.folderCheckpointsRequested===true&&caps.folderCheckpoints===true;
    v.fileCheckpoints=v.files&&v.fileCheckpointsRequested===true&&caps.fileCheckpoints===true;
    v.durableFileCheckpoints=v.fileCheckpoints&&caps.durableFileCheckpoints===true;
    v.durableFolderCheckpoints=v.folderCheckpoints&&caps.durableFolderCheckpoints===true;
    v.richClipboard=v.richRequested===true&&caps.richClipboard===true;
    v.sharedMicrophone=v.sharedMicrophoneRequested===true&&caps.sharedMicrophone===true&&options.sharedDesktop===true&&caps.sharedDesktop===true&&v.sharedRequested===true&&caps.features===true;
    v.microphone=v.microphoneRequested===true&&caps.microphone===true&&(!options.sharedDesktop||v.sharedMicrophone)&&!options.elevatedDesktop&&!options.virtualDisplay;
    v.microphoneOpus=v.microphone&&v.microphoneOpusRequested===true&&caps.microphoneOpus===true;
    v.nativeAudio=v.nativeVideo&&v.nativeAudioRequested===true&&caps.nativeAudio===true;
    v.nativeDatagrams=v.nativeVideo&&v.nativeDatagramsRequested===true&&caps.nativeDatagrams===true;
    v.nativeInputFreshness=v.nativeVideo&&caps.nativeInputFreshness===true;
    v.sharedDesktop=options.sharedDesktop===true&&v.sharedRequested===true&&caps.sharedDesktop===true&&caps.features===true;
    v.sharedProtected=v.sharedProtectedAvailable===true&&v.sharedDesktop===true&&v.elevatedDesktop===true;
    if(options.sharedDesktop&&(!v.sharedDesktop||(options.elevatedDesktop&&!v.sharedProtected)||options.virtualDisplay||options.display))throw new DesktopSetupRequired("複数viewer共有は両端の対応が必要です。管理者画面との併用には対応する保護サービスも必要です。仮想画面・解像度変更とは併用できません。");
    v.sharedNative=v.sharedDesktop===true&&!v.elevatedDesktop&&v.sharedNativeRequested===true&&caps.sharedNative===true&&v.nativeVideo===true;
    v.sharedAudio=v.sharedNative===true&&v.sharedAudioRequested===true&&caps.sharedAudio===true&&v.nativeAudio===true;
    v.sharedDatagrams=v.sharedNative===true&&v.sharedDatagramsRequested===true&&caps.sharedDatagrams===true&&v.nativeDatagrams===true;
    v.sharedRate=v.sharedNative===true&&caps.sharedRate===true&&caps.nativeCadence===true;
    if(v.elevatedDesktop||v.sharedDesktop){
      v.nativeVideo=false;v.nativeAudio=false;v.nativeDatagrams=false;v.nativeCodecs=false;v.nativeAdaptive=false;v.nativeInputFreshness=false;
      if(v.elevatedDesktop)v.files=false;v.richClipboard=false;v.monitors=false;v.cursor=false;delete v.nativeVideoWindow;delete v.nativeMaxFps;
    }
    if(v.sharedMonitors)v.monitors=true;
    if(v.sharedCursor)v.cursor=true;
    if(v.sharedClipboard)v.richClipboard=v.richRequested===true&&caps.richClipboard===true;
    v.sharedResolution=v.sharedNative===true&&v.sharedResolutionRequested===true&&v.nativeAdaptiveRequested===true&&caps.sharedResolution===true&&caps.nativeAdaptive===true;
    if(v.sharedNative){
      v.nativeVideo=true;v.nativeAdaptive=v.sharedResolution===true;v.nativeAudio=v.sharedAudio===true;v.nativeCodecs=v.nativeCodecsRequested===true&&caps.nativeCodecs===true;
      v.nativeInputFreshness=caps.nativeInputFreshness===true;v.nativeDatagrams=v.sharedDatagrams===true;
      if(v.nativeWindowRequested&&caps.nativeVideoWindow===3)v.nativeVideoWindow=3;
      if(v.nativeRateRequested&&caps.nativeMaxFps===60)v.nativeMaxFps=60;
    }
    // Capability requires both the viewer opt-in and B's current RPC schema.
    v.imeKeysNegotiated = v.imeKeysRequested && caps.imeKeys === true;
    v.extendedInputNegotiated = v.extendedInputRequested && caps.extendedInput === true;
    if (display && (!caps.displayResize || !caps.features))
      throw new Error("B does not allow display resize");
    v.features = caps.features === true;
    if (adaptive && !v.features) throw new Error("B requires update for adaptive quality");
    if (image && !caps.imageSettings && !v.nativePlatform && (image.colorMode !== "full" || !image.showCursor))
      throw new Error("B requires an update for image settings");
    const negotiated = {
      ...legacyOptions,
      ...(v.microphone?{microphone:true as const,...(v.microphoneOpus?{microphoneOpus:true as const}:{})}:{}),
      ...(v.sharedDesktop?{sharedDesktop:true as const}:{}),
      ...(v.sharedMonitors?{sharedMonitors:true as const}:{}),
      ...(v.independentMonitors?{independentMonitors:true as const}:{}),
      ...(v.sharedDeltas?{sharedDeltas:true as const}:{}),
      ...(v.sharedCursor?{sharedCursor:true as const}:{}),
      ...(v.sharedClipboard?{sharedClipboard:true as const}:{}),
      ...(v.sharedMicrophone&&v.microphone?{sharedMicrophone:true as const}:{}),
      ...(v.sharedProtected?{sharedProtected:true as const}:{}),
      ...(v.sharedNative?{sharedNative:true as const}:{}),
      ...(v.sharedResolution?{sharedResolution:true as const}:{}),
      ...(v.sharedAudio?{sharedAudio:true as const}:{}),
      ...(v.sharedRate?{sharedRate:true as const}:{}),
      ...(v.sharedDatagrams?{sharedDatagrams:true as const}:{}),
      ...(v.elevatedDesktop?{elevatedDesktop:true as const}:{}),
      ...(v.virtualDisplay?{virtualDisplay:true as const}:{}),
      ...(v.monitors?{monitors:true as const,...(options.monitorDevice?{monitorDevice:options.monitorDevice}:{})}:{}),
      ...(v.files?{files:true as const,...(v.fileCheckpoints?{fileCheckpoints:true as const}:{}),...(v.folders?{folders:true as const}:{}),...(v.folderCheckpoints?{folderCheckpoints:true as const}:{})}:{}),
      ...(v.richClipboard?{richClipboard:true as const}:{}),
      ...(v.cursor?{cursor:true as const}:{}),
      ...(v.nativeVideo?{nativeVideo:true as const}:{}),
      ...(v.nativeCodecs?{nativeCodecs:true as const}:{}),
      ...(v.nativeAdaptive?{nativeAdaptive:true as const}:{}),
      ...(v.nativeVideo&&(!v.sharedDesktop||v.sharedRate)&&caps.nativeCadence?{nativeCadence:true as const}:{}),
      ...(v.nativeDatagrams?{nativeDatagrams:true as const}:{}),
      ...(v.nativeAudio?{nativeAudio:true as const}:{}),
      ...(v.nativeVideo&&v.nativeMaxFps===60?{nativeMaxFps:60 as const}:{}),
      ...(v.nativeVideo&&v.nativeVideoWindow===3?{nativeVideoWindow:3 as const}:{}),
      ...(v.imeKeysNegotiated ? { imeKeys: true as const } : {}),
      ...(v.extendedInputNegotiated ? { extendedInput: true as const } : {}),
      ...(display ? { display } : {}),
      ...(caps.features ? { adaptive, features } : {}),
      ...(caps.deltas ? { deltas } : {}),
      ...(caps.imageSettings ? { image } : {}),
      ...(v.nativePlatform?{nativePlatform:v.nativePlatform,deltas:false,adaptive:false,image:{colorMode:"full" as const,showCursor:image?.showCursor??true}}:{}),
    };
    if(v.microphone){
      const bad=()=>{if(this.viewers.has(v)){v.microphone=false;this.send(v.ws,{type:"microphone_closed"});}};
      v.microphoneLane=this.microphoneLanes.issue(v.sessionId,v.origin,(bytes,binary)=>{
        if(binary||bytes.length>1024)throw Error("Microphone result only");const result=DesktopMicrophoneResult.parse(JSON.parse(bytes.toString()));
        if(v.ready&&v.microphone&&!v.secureDesktop&&!v.microphoneLane!.send(result))v.microphoneLane!.fail();
      },()=>{if(this.viewers.has(v))this.send(v.ws,{type:"microphone_ready"});},bad,(bytes,binary)=>{
        if(binary||bytes.length>4096)throw Error("Microphone request only");const request=DesktopMicrophoneRequest.parse(JSON.parse(bytes.toString()));
        if(!v.ready||!v.microphone||v.secureDesktop||(!v.microphoneOpus&&(request.type==="microphone_opus"||request.type==="microphone_start"&&request.codec==="opus"))){v.microphoneLane!.fail();return;}
        if(!v.microphoneLane!.toProvider(request))v.microphoneLane!.fail();
      });this.send(v.ws,{type:"microphone_ticket",ticket:v.microphoneLane.viewerTicket,...(v.microphoneOpus?{codec:"opus"}:{})});
    }
    if(v.files){
      const bad=()=>{if(this.viewers.has(v)){v.files=false;this.send(v.ws,{type:"files_closed"});}};
      v.fileLane=this.fileLanes.issue(v.sessionId,v.origin,(bytes,binary)=>{
        if(binary||bytes.length>100000)throw Error("File lane only");const result=DesktopFileResult.parse(JSON.parse(bytes.toString()));
        if(v.ready&&v.files&&!v.secureDesktop&&!v.fileLane!.send(result))v.fileLane!.fail();
      },()=>{if(this.viewers.has(v))this.send(v.ws,{type:"files_ready"});},bad,(bytes,binary)=>{
        if(binary||bytes.length>100000)throw Error("File lane only");const request=DesktopFileRequest.parse(JSON.parse(bytes.toString()));
        if(!v.ready||!v.files||v.secureDesktop){v.fileLane!.send({type:"desktop_file_result",id:request.id,ok:false,message:"ファイル転送は利用できません"});return;}
        if(!v.fileLane!.toProvider(request))v.fileLane!.fail();
      });this.send(v.ws,{type:"files_ticket",ticket:v.fileLane.viewerTicket});
    }
    if(v.richClipboard){
      const bad=()=>{if(this.viewers.has(v)){v.richGranted=false;v.richClipboard=false;this.send(v.ws,{type:"clipboard_rich_closed"});}};
      v.clipboardLane=this.clipboardLanes.issue(v.sessionId,v.origin,(bytes,binary)=>{
        if(binary||bytes.length>32768)throw Error("Clipboard lane only");const result=DesktopRichClipboardResult.parse(JSON.parse(bytes.toString()));
        if(v.ready&&v.richClipboard&&v.richGranted&&!v.secureDesktop&&!v.clipboardLane!.send(result))v.clipboardLane!.fail();
      },()=>{if(this.viewers.has(v))this.send(v.ws,{type:"clipboard_rich_ready"});},bad,(bytes,binary)=>{
        if(binary||bytes.length>32768)throw Error("Clipboard lane only");const request=DesktopRichClipboardRequest.parse(JSON.parse(bytes.toString()));
        if(!v.ready||!v.richClipboard||!v.richGranted||v.secureDesktop){v.clipboardLane!.send({type:"clipboard_rich_result",id:request.id,ok:false,stage:"done"});return;}
        if(!v.clipboardLane!.toProvider(request))v.clipboardLane!.fail();
      });
      this.send(v.ws,{type:"clipboard_rich_ticket",ticket:v.clipboardLane.viewerTicket});
    }
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
      ...(v.microphoneLane?{microphoneTicket:v.microphoneLane.providerTicket}:{}),
      ...(v.fileLane?{fileTicket:v.fileLane.providerTicket}:{}),
      ...(v.clipboardLane?{clipboardTicket:v.clipboardLane.providerTicket}:{}),
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
        if(imageLane&&(!v.imageActive||!binary||isDesktopMediaChunk(bytes)||isDesktopCursor(bytes)||isDesktopAudio(bytes)))throw Error("Image lane only");
        if (lane) {
          if (!v.videoActive) return;
          if (binary ? !(isDesktopMediaChunk(bytes)||isDesktopAudio(bytes)) : bytes.length > 65536 || !["native_codec_reset","native_profile_pending","native_format_ready","media_status","media_stream","native_video_stats","rtc_signal","native_frame_notice","native_draw_ack","native_transport_reset","native_audio_status"].includes(JSON.parse(bytes.toString()).type)) throw Error("Video lane only");
        }
        const sendMedia = (value: unknown) => lane ? v.videoLane!.send(value) : this.send(v.ws, value);
        if(binary&&isDesktopAudio(bytes)){
          if(!v.ready||!v.features||v.secureDesktop)throw Error("Audio not available");
          if(!v.media||!v.media.native||(v.videoLane&&lane!==true))return;
          if(!v.nativeAudio||!v.media.audioRequested)throw Error("Audio not requested");
          const audio=decodeDesktopAudio(bytes);if(audio.generation!==(v.media.audioGeneration??1)||audio.seq<=(v.media.audioSeq??0))return;v.media.audioSeq=audio.seq;
          if((lane?v.videoLane!.buffered():v.ws.bufferedAmount)<=65536)sendMedia(bytes);return;
        }
        if(binary&&isDesktopCursor(bytes)) {
          if(lane||!v.ready||v.secureDesktop||!v.cursor||!v.cursorStream)throw Error("Cursor is not negotiated");
          v.cursorStream.accept(decodeDesktopCursor(bytes));return;
        }
        if (binary && isDesktopMediaChunk(new Uint8Array(bytes as Buffer))) {
          if (!v.ready || !v.features) throw new Error();
          if (!v.media || (v.videoLane && lane !== !!v.media.native)) return;
          if(v.media.datagrams)throw Error("Native datagram stream cannot carry WSS chunks");
          const chunk = decodeDesktopMediaChunk(bytes);
          if (chunk.generation !== v.media.generation) return;
          if(v.media.barrier?.baseSeq!==undefined)throw Error("Native frame before format ACK");
          if (chunk.seq !== v.media.seq + 1) throw new Error();
          if(v.media.native&&(v.media.pending?.length??0)>=(v.media.window??1))throw new Error("Native video backlog");
          v.media.seq = chunk.seq;
          if(v.media.native){(v.media.pending??=[]).push(chunk.seq);(v.media.sentAt??=new Map()).set(chunk.seq,performance.now());(v.media.freshAt??=new Map()).set(chunk.seq,v.media.nextNativeAt??performance.now());delete v.media.nextNativeAt;}
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
            if (v.snapshot&&(!v.nativePlatform||(info.sourceInputSeq??0)>=(v.nativeInputFloor??0))) {
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
          if (["native_codec_reset","native_profile_pending","native_format_ready","media_status","media_stream","native_video_stats","rtc_signal","native_frame_notice","native_draw_ack","native_transport_reset","native_audio_status"].includes(msg.type)) {
            if (typeof msg.id === "string" && v.retiredMedia.has(msg.id)) return;
            if (lane && !v.requestedNative) return;
            if (v.videoLane && !lane && v.requestedNative && ((msg.type === "media_status" && msg.state !== "images") || msg.type === "media_stream" || msg.type === "rtc_signal")) return;
          }
          if(msg.type==="clipboard_busy"&&v.sharedClipboard){this.send(v.ws,{type:"clipboard_busy"});return;}
          if(msg.type==="shared_clipboard_failure"&&v.sharedClipboard){DesktopSharedClipboardFailure.parse(msg);this.send(v.ws,{type:"error",message:"接続先の補助プログラムがクリップボード共有に対応していません。更新するか、全ての窓でクリップボード経路の共有を解除してください。"});this.stop(v);return;}
          if(msg.type==="shared_monitors_failure"&&v.sharedMonitors){DesktopSharedMonitorsFailure.parse(msg);this.send(v.ws,{type:"error",message:"接続先の補助プログラムがモニター共有に対応していません。更新するか、全ての窓でモニター選択の共有を解除してください。"});this.stop(v);return;}
          if(msg.type==="shared_cursor_failure"&&v.sharedCursor){DesktopSharedCursorFailure.parse(msg);this.send(v.ws,{type:"error",message:"接続先の補助プログラムが独立カーソル共有に対応していません。更新するか、全ての窓で独立カーソル共有を解除してください。"});this.stop(v);return;}
          if(msg.type==="platform_failure"&&v.nativePlatform){const failure=DesktopNativePlatformFailure.parse(msg);if(failure.backend!==v.nativePlatform)throw Error("Unexpected native failure");this.send(v.ws,{type:"error",message:desktopNativePlatformFailureMessage(failure.code)});this.stop(v);return;}
          if(v.elevatedDesktop&&["unlock_failure","session_locked","session_unlocked","lock_screen_changed"].includes(msg.type)){this.send(v.ws,{type:"error",message:desktopProtectedFailureMessage("source_changed")});this.stop(v);return;}
          if(msg.type==="protected_desktop_failure"&&v.elevatedDesktop){const failure=DesktopProtectedFailure.parse(msg);this.send(v.ws,{type:"error",message:desktopProtectedFailureMessage(failure.code)});this.stop(v);return;}
          if(msg.type==="virtual_display_failure"&&v.virtualDisplay){const failure=DesktopVirtualFailure.parse(msg);this.send(v.ws,{type:"error",message:desktopVirtualFailureMessage(failure.code)});this.stop(v);return;}
          if(msg.type==="monitor_topology_changed"&&Object.keys(msg).length===1&&v.monitors&&v.ready&&!v.secureDesktop){this.send(v.ws,{type:"monitor_topology_changed"});this.stop(v);return;}
          if (msg.type === "ready" && !v.ready) {
            const ready = DesktopReady.parse(msg);
            if(v.sharedProtected&&ready.sharedProtected!==true)throw Error("Shared protected helper proof missing");
            if(v.nativePlatform?(ready.backend!==v.nativePlatform||!ready.inputCapabilities):(ready.backend==="linux-portal"||ready.backend==="macos-sck"||ready.inputCapabilities))throw Error("Unexpected native backend");
            if(ready.inputCapabilities)v.inputCapabilities=ready.inputCapabilities;
            if(v.elevatedDesktop&&(!ready.protectedDesktop||!ready.secureDesktop||ready.lockScreenCover))throw Error("Requested protected worker not selected");
            if(ready.protectedDesktop&&!v.elevatedDesktop)throw Error("Unrequested protected worker");
            if(ready.protectedDesktop)v.protectedDesktop=ready.protectedDesktop;else delete v.protectedDesktop;
            if(v.virtualDisplay&&(ready.virtualDisplay!==true||ready.secureDesktop||ready.lockScreenCover))throw Error("Virtual display not selected");
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
            v.microphone=v.microphone===true&&ready.microphone===true&&!v.secureDesktop;
            v.nativeAudio=v.nativeAudio===true&&ready.nativeAudio===true&&v.nativeVideo&&!v.secureDesktop;
            v.nativeDatagrams=v.nativeDatagrams===true&&ready.nativeDatagrams===true&&v.nativeVideo;
            if(ready.nativeVideoWindow!==3||!v.nativeVideo)delete v.nativeVideoWindow;
            v.cursor=v.cursor===true&&ready.cursor===true&&!v.secureDesktop;
            if(v.cursor)v.cursorStream=new DesktopCursorStream(bytes=>this.send(v.ws,bytes),()=>v.ws.bufferedAmount);
            v.nativeCodecs=v.nativeCodecs===true&&ready.nativeCodecs===true&&v.nativeVideo;
            v.nativeAdaptive=v.nativeAdaptive===true&&ready.nativeAdaptive===true&&v.nativeVideo;
            v.sharedRate=v.sharedRate===true&&ready.nativeCadence===true&&v.nativeVideo;
            if(ready.nativeMaxFps!==60||!v.nativeVideo)delete v.nativeMaxFps;
            v.files=v.files===true&&ready.files===true&&!v.secureDesktop;
            v.richClipboard=v.richClipboard===true&&ready.richClipboard===true&&ready.allowClipboard===true&&!v.secureDesktop;
            const { imeKeys, extendedInput, sharedProtected:helperSharedProtected, sharedProtectedAvailable:_helperSharedAvailable, protectedDesktop, virtualDisplay, monitorLayout, files, fileCheckpoints:_fileCheckpoints,durableFileCheckpoints:_durableFileCheckpoints,durableFolderCheckpoints:_durableFolderCheckpoints,folders:_folders,folderCheckpoints:_folderCheckpoints, nativeVideo,nativeDatagrams,nativeAudio,microphone,microphoneOpus,richClipboard,nativeVideoWindow,nativeMaxFps,nativeAdaptive,nativeCodecs,nativeCodecCandidates,cursor,inputCapabilities,imageLane:helperImageLane, ...legacyReady } = ready;
            this.send(v.ws, { ...legacyReady, ...(v.sharedProtectedAvailable?{sharedProtectedAvailable:true}:{}),...(v.sharedProtected&&helperSharedProtected?{sharedProtected:true}:{}), ...(v.nativePlatform&&inputCapabilities?{inputCapabilities}:{}), ...(v.elevatedDesktop&&protectedDesktop?{protectedDesktop}:{}), ...(v.virtualDisplay&&virtualDisplay?{virtualDisplay:true}:{}), ...(v.imageLane?{imageLane:true}:{}), ...(v.nativeVideo?{nativeVideo:true}:{}),...(v.nativeCodecs?{nativeCodecs:true,nativeCodecCandidates:nativeCodecCandidates??[]}:{}),...(v.nativeAdaptive?{nativeAdaptive:true}:{}),...(v.nativeDatagrams?{nativeDatagrams:true}:{}),...(v.nativeAudio?{nativeAudio:true}:{}),...(v.microphone?{microphone:true,...(v.microphoneOpus&&ready.microphoneOpus?{microphoneOpus:true}:{})}:{}),...(v.monitors&&monitorLayout&&!v.secureDesktop?{monitorLayout}:{}),...(v.files?{files:true,...(v.fileCheckpoints&&ready.fileCheckpoints?{fileCheckpoints:true,...(v.durableFileCheckpoints&&ready.durableFileCheckpoints?{durableFileCheckpoints:true}:{})}:{}),...(v.folders&&ready.folders?{folders:true}:{}),...(v.folderCheckpoints&&ready.folderCheckpoints?{folderCheckpoints:true,...(v.durableFolderCheckpoints&&ready.durableFolderCheckpoints?{durableFolderCheckpoints:true}:{})}:{})}:{}),...(v.richClipboard?{richClipboard:true}:{}),...(v.nativeVideoWindow===3?{nativeVideoWindow:3}:{}), ...(v.nativeMaxFps===60?{nativeMaxFps:60}:{}), ...(v.cursor?{cursor:true}:{}), ...(v.imeKeys && imeKeys ? { imeKeys: true } : {}), ...(v.extendedInput && extendedInput ? { extendedInput: true } : {}) });
          } else if (msg.type === "session_locked" && !v.secureDesktop && v.ready) {
            this.send(v.ws, { type: "session_locked" });
            this.stop(v);
          } else if (msg.type === "session_unlocked" && v.secureDesktop && !v.protectedDesktop && v.ready) {
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
            if(status.nativeAudio&&(!v.nativeAudio||!v.requestedNativeAudio))throw Error("Audio not requested");
            if((status.nativeCodecs||status.codec||status.codecRequested||status.codecFallback)&&!v.nativeCodecs)throw Error("Native codec not negotiated");
            if(status.datagrams&&!v.nativeDatagrams)throw Error("Native datagrams not negotiated");
            if (status.state === "images") { if(v.media && status.id!==v.media.id)return; delete v.media; }
            else if (!v.media || v.media.id !== status.id)
              v.media = { id: status.id, generation: 0, seq: 0 };
            if(v.media&&(lane||v.requestedNative)&&status.state!=="images")v.media.native=true;
            if(v.media)v.media.audioRequested=status.nativeAudio===true;
            if(v.media)v.media.datagrams=status.datagrams===true;
            if(v.media&&status.state==="native"){v.media.native=true;v.media.audioGeneration=1;v.media.window=v.nativeVideoWindow??1;v.media.pending=[];v.media.lastAck=0;v.media.sentAt=new Map();v.media.freshAt=new Map();delete v.media.drawnAt;}
            sendMedia(status);
          } else if(msg.type==="native_profile_pending"){
            const pending=DesktopNativeProfilePending.parse(msg),media=v.media;
            if(!v.nativeAdaptive||!media?.native||pending.id!==media.id||pending.generation!==media.generation+1||media.barrier)throw Error("Unexpected native profile barrier");
            media.barrier={generation:pending.generation,at:performance.now()};sendMedia(pending);
          } else if(msg.type==="native_format_ready"){
            const ack=DesktopNativeFormatReady.parse(msg),media=v.media,b=media?.barrier;
            if(!v.nativeAdaptive||!media||!b||ack.id!==media.id||ack.generation!==b.generation||ack.baseSeq!==b.baseSeq||performance.now()-b.at>=3000)throw Error("Unexpected native format ACK");
            media.nextNativeAt=b.at;delete media.barrier;
          } else if (msg.type === "media_stream" && v.media) {
            const stream = DesktopMediaStream.parse(msg);
            if (stream.id !== v.media.id || stream.generation <= v.media.generation)
              throw new Error();
            if(isDesktopNativeStream(stream)&&!v.nativeCodecs&&(stream.mime!=="video/h264"||stream.codecName!==undefined))throw Error("Codec stream not negotiated");
            if((isDesktopNativeStream(stream))!==!!v.media.native)throw new Error();
            if(isDesktopNativeStream(stream)&&(stream.window??1)!==(v.media.window??1))throw new Error();
            if(isDesktopNativeStream(stream)&&!!stream.datagrams!==!!v.media.datagrams)throw Error("Native stream route changed");
            if(isDesktopNativeStream(stream)&&stream.baseSeq!==undefined){
              const b=v.media.barrier;if(!v.nativeAdaptive||!b||b.generation!==stream.generation||stream.baseSeq!==v.media.seq||v.media.pending?.length||performance.now()-b.at>=3000)throw Error("Native stream barrier");b.baseSeq=stream.baseSeq;
            }else if(v.media.native&&v.media.generation!==0)throw Error("Native reconfigure requires barrier");
            v.media.generation = stream.generation;
            v.media.seq = isDesktopNativeStream(stream)?(stream.baseSeq??0):0;
            if(isDesktopNativeStream(stream))v.media.lastAck=v.media.seq;
            sendMedia(stream);
          } else if(msg.type==="native_audio_status"){
            const status=DesktopNativeAudioStatus.parse(msg);
            if(!v.nativeAudio||!v.media?.native||!v.media.audioRequested||status.id!==v.media.id)throw Error("Audio status not requested");
            sendMedia(status);
          } else if(msg.type==="native_frame_notice"){
            const notice=DesktopNativeFrameNotice.parse(msg),media=v.media;
            if(media?.barrier?.baseSeq!==undefined)throw Error("Native notice before format ACK");
            if(!v.nativeDatagrams||!media?.native||!media.datagrams||notice.id!==media.id||notice.generation!==media.generation||notice.seq!==media.seq+1||(media.pending?.length??0)>=(media.window??1))throw Error("Native frame notice order");
            media.seq=notice.seq;(media.pending??=[]).push(notice.seq);(media.sentAt??=new Map()).set(notice.seq,performance.now());(media.freshAt??=new Map()).set(notice.seq,media.nextNativeAt??performance.now());delete media.nextNativeAt;
            if(!sendMedia(notice))throw Error("Native metadata congestion");
          } else if(msg.type==="native_draw_ack"){
            const ack=DesktopNativeDrawAck.parse(msg),media=v.media;
            if(!v.nativeDatagrams||!media?.native||!media.datagrams||ack.id!==media.id||ack.generation!==media.generation||ack.seq!==media.pending?.[0])throw Error("Native direct ACK order");
            const at=media.freshAt?.get(ack.seq)??media.sentAt?.get(ack.seq);media.pending.shift();media.lastAck=ack.seq;if(!ack.dropped&&at!==undefined)media.drawnAt=at;media.sentAt?.delete(ack.seq);media.freshAt?.delete(ack.seq);
          } else if(msg.type==="native_codec_reset"){
            const reset=z.object({type:z.literal("native_codec_reset"),id:z.string().uuid()}).strict().parse(msg);
            if(!v.nativeCodecs||!v.media?.native||reset.id!==v.media.id)throw Error("Wrong codec reset");
            this.agents.revoke(v.agent);v.control=false;if(v.provider)this.sendControl(v, false);this.send(v.ws,{type:"control",enabled:false});
          } else if(msg.type==="native_transport_reset"){
            const reset=z.object({type:z.literal("native_transport_reset"),id:z.string().uuid()}).strict().parse(msg);
            if(!v.nativeDatagrams||!v.media?.datagrams||reset.id!==v.media.id)throw Error("Wrong native reset");
            this.agents.revoke(v.agent);v.control=false;if(v.provider)this.sendControl(v, false);this.send(v.ws,{type:"control",enabled:false});
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
          ){v.richGranted=msg.enabled&&v.richClipboard===true;this.send(v.ws, { type: "clipboard_state", enabled: msg.enabled });}
          else if (msg.type === "clipboard_result" && v.features)
            this.send(v.ws, DesktopClipboardResult.parse(msg));
          else if (msg.type === "media_unavailable" && v.features)
            this.send(v.ws, { type: "media_unavailable" });
          else if (msg.type === "control" && typeof msg.enabled === "boolean") {
            if (v.sharedDesktop) {
              const requested = v.controlRequests?.shift();
              if (requested === undefined || (!requested && msg.enabled)) throw Error("Unexpected shared control response");
              // A grant/release can be followed immediately by a new request. A
              // response for that older request cannot revoke the newer grant.
              if (v.controlRequests?.length) return;
              if (requested && !msg.enabled && v.control) { v.control = false; this.agents.revoke(v.agent); }
            }
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
    if(v.nativePlatform&&(full.info.sourceInputSeq??0)<(v.nativeInputFloor??0))return;
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
    delete v.controlRequests;
    this.agents.revoke(v.agent);
    v.fileLane?.close();
    v.microphoneLane?.close();
    v.clipboardLane?.close();
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
    this.fileLanes.close();
    this.microphoneLanes.close();
    this.clipboardLanes.close();
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
