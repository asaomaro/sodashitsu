import {DesktopProtectedFailure,desktopProtectedFailureMessage} from "@sodashitsu/protocol";
import {DesktopVirtualFailure} from "@sodashitsu/protocol";
import {DesktopFiles} from "./DesktopFiles.js";
import {DESKTOP_FILES_PROTOCOL,DesktopFileRequest,DesktopFileResult} from "@sodashitsu/protocol";
import {DesktopRichClipboard} from "./DesktopRichClipboard.js";
import {DESKTOP_RICH_CLIPBOARD_PROTOCOL} from "@sodashitsu/protocol";
import { spawn } from "node:child_process";
import { DesktopSharedCapture, type DesktopHelper } from "./DesktopSharedCapture.js";
import { performance } from "node:perf_hooks";
import { unlockFailure } from "./unlockFailure.js";
import { z } from "zod";
import WebSocket from "ws";
import {
  DESKTOP_VIDEO_LANE_PROTOCOL, DESKTOP_IMAGE_LANE_PROTOCOL,
  DESKTOP_CURSOR_MAX_BYTES,
  isExtendedDesktopInput,
  DesktopFrameInfo,
  DesktopFrameChain,
  DesktopReady,
  DesktopStartParams,
  RemoteDesktopViewerMessage,
  DESKTOP_MAX_FRAME_BYTES,
  encodeDesktopFrame,
  decodeDesktopFrame,
  DesktopClipboardResult,
  DesktopIceServers,
  RpcError,
} from "@sodashitsu/protocol";

import { DesktopCursorStream } from "./DesktopCursorStream.js";
import { DesktopInputAcks } from "./DesktopInputAcks.js";
import {DesktopNativeVideo} from "./DesktopNativeVideo.js";
import { DesktopCompanionHub } from "./DesktopCompanion.js";
import { DesktopUnlockLease } from "./DesktopUnlockLease.js";

const HelperFrame = z
  .object({
    type: z.literal("frame"),
    info: DesktopFrameInfo,
    data: z
      .string()
      .min(0)
      .max(Math.ceil(DESKTOP_MAX_FRAME_BYTES / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
export interface DesktopProviderConfig {
  command: string[];
  allowInput: boolean;
  allowMonitors?:boolean;
  allowVirtualDisplay?:boolean;
  allowElevated?:boolean;
  fileRoot?:string;
  allowClipboard?: boolean;
  allowMedia?: boolean;
  allowNativeVideo?: boolean;
  allowDisplayResize?: boolean;
  allowUnlock?: boolean;
  unlockLeaseCommand?: string[];
  iceServers?: z.infer<typeof DesktopIceServers>;
  origins(): string[];
}
type Share = {
  files?:Promise<DesktopFiles|undefined>;fileSocket?:WebSocket;
  richClipboard?:DesktopRichClipboard;clipboardSocket?:WebSocket;
  imageExpected?:boolean; imageSocket?: WebSocket; imageReady?: boolean; imageFailed?: boolean; heldImage?: Uint8Array;
  videoSocket?: WebSocket;
  videoReady?: boolean;
  inputAcks: DesktopInputAcks;
  cursor?: DesktopCursorStream;
  native?: DesktopNativeVideo;
  deferNativeSnapshots?: boolean;
  chain: DesktopFrameChain;
  owner: string;
  allowClipboard: boolean;
  dynamicQuality: boolean;
  clipboardGranted: boolean;
  clipboardId: number;
  clipboardGeneration: number;
  clipboardPending: Set<number>;
  quality: number;
  video: boolean;
  ws: WebSocket;
  process?: DesktopHelper;
  shared?: boolean;
  dead: boolean;
  attached: boolean;
  ready: boolean;
  control: boolean;
  secureDesktop?: boolean;
  protectedDesktop?: "elevated-default"|"elevated-uac";
  lockScreenCover?: boolean;
  imeKeys?: boolean;
  extendedInput?: boolean;
  allowInput: boolean;
  lastSeen: number;
  seq: number;
  pending: number;
  inputSeq: number;
  frameAt: number;
  started: number;
  timer: ReturnType<typeof setInterval>;
};

/** Opt-in B-side provider. Executable and input ceiling are local settings, never RPC arguments. */
export class DesktopProvider {
  private readonly unlockLease = new DesktopUnlockLease();
  private active: Share | undefined;
  private readonly sharedCapture = new DesktopSharedCapture();
  private readonly shared = new Set<Share>();
  private sharedKey: string | undefined;
  private pendingStarts = new Set<{ owner: string; cancelled: boolean }>();
  readonly companion: DesktopCompanionHub;
  constructor(private config: DesktopProviderConfig | undefined) {
    this.companion = new DesktopCompanionHub(config?.allowMedia === true, config?.iceServers ?? []);
  }
  configure(config: DesktopProviderConfig | undefined): void {
    this.dispose();
    this.config = config;
    this.companion.configure(config?.allowMedia === true, config?.iceServers ?? []);
    this.resumeUnlockLease();
  }
  /** Handoff rollback reopens the local lease; a successful handoff creates a new provider. */
  resumeUnlockLease(): void {
    if ((this.config?.allowUnlock||this.config?.allowVirtualDisplay||this.config?.allowElevated) && this.config.unlockLeaseCommand)
      this.unlockLease.start(this.config.unlockLeaseCommand);
  }
  capabilities() {
    return {
      sharedDesktop: true,
      sharedNative: this.config?.allowNativeVideo === true,
      available: !!this.config,
      allowInput: this.config?.allowInput === true,
      deltas: true,
      imageSettings: true,
      imeKeys: true,
      extendedInput: true,
      monitors:this.config?.allowMonitors===true,
      virtualDisplay:this.config?.allowVirtualDisplay===true,
      elevatedDesktop:this.config?.allowElevated===true,
      files:!!this.config?.fileRoot,
      richClipboard:this.config?.allowClipboard===true,
      imageLane: true,
      videoLane: true,
      nativeVideo: true,nativeDatagrams:true,nativeAudio:true,
      nativeInputFreshness: true,
      nativeCodecs: true,
      nativeAdaptive: true,
      nativeCadence: true,
      nativeVideoWindow: 3 as const,
      nativeMaxFps: 60 as const,
      cursor: true as const,
      features: true,
      displayResize: this.config?.allowDisplayResize === true,
    };
  }
  async start(owner: string, raw: z.infer<typeof DesktopStartParams>): Promise<{ started: true }> {
    const p = DesktopStartParams.parse(raw),
      cfg = this.config;
    if (!cfg) throw new RpcError("not_found", "Bでデスクトップ補助プログラムが設定されていません");
    if (p.options.sharedDesktop && (!p.options.features || p.options.elevatedDesktop || p.options.virtualDisplay || p.options.display || (p.options.nativeVideo && !p.options.sharedNative) || p.options.nativeAudio || p.options.nativeDatagrams || p.options.nativeAdaptive || p.options.nativeCadence || p.options.richClipboard || p.options.files || p.options.monitors || p.options.monitorDevice || p.options.cursor))
      throw new RpcError("invalid_params", "複数viewer共有では管理者画面・仮想画面・解像度変更・音声・クリップボードなどの追加経路を併用できません。");
    if(p.options.sharedNative&&(!p.options.sharedDesktop||!p.options.nativeVideo||!cfg.allowNativeVideo))throw new RpcError("unauthorized","共有動画が接続先で許可されていません。");
    if(p.options.elevatedDesktop){
      if(!cfg.allowElevated||!p.options.features)throw new RpcError("unauthorized","管理者画面の共有が接続先で許可されていません。");
      if(p.options.virtualDisplay||p.options.monitorDevice||p.options.monitors||p.options.display||p.options.files||p.options.richClipboard||p.options.nativeVideo||p.options.nativeAudio||p.options.nativeDatagrams||p.options.nativeCodecs||p.options.nativeAdaptive||p.options.nativeCadence||p.options.nativeVideoWindow||p.options.nativeMaxFps||p.options.cursor)throw new RpcError("invalid_params",desktopProtectedFailureMessage("conflict"));
    }
    if(p.options.virtualDisplay&&(!cfg.allowVirtualDisplay||!p.options.features||p.options.monitorDevice))throw new RpcError("unauthorized","仮想画面の作成が許可されていないか、モニター指定と併用されています");
    if(p.options.monitorDevice&&(!cfg.allowMonitors||p.options.monitors!==true))throw new RpcError("unauthorized","モニター切替が許可されていません");
    if (p.options.display && (!cfg.allowDisplayResize || !p.options.features))
      throw new RpcError("unauthorized", "Bでディスプレイ解像度の変更が許可されていません");
    const finishing = this.active?.dead ? this.active.process : this.sharedCapture.retiring;
    if (finishing) {
      const child = finishing,
        pending = { owner, cancelled: false };
      this.pendingStarts.add(pending);
      try {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            child.off("close", done);
            resolve();
          };
          const timer = setTimeout(done, 2000);
          child.once("close", done);
        });
        if (pending.cancelled) throw new RpcError("unauthorized", "Desktop request cancelled");
      } finally {
        this.pendingStarts.delete(pending);
      }
    }
    if (this.config !== cfg) throw new RpcError("unauthorized", "Desktop permissions changed");
    if (this.sharedCapture.retiring) throw new RpcError("server_busy", "前の共有画面を終了中です。少し待ってから接続し直してください。");
    const sharedKey = JSON.stringify(p.options.sharedDesktop ? sharedHelperOptions(p.options) : p.options);
    if (this.active || (this.shared.size && (!p.options.sharedDesktop || this.sharedKey !== sharedKey)) || this.shared.size >= 8)
      throw new RpcError("server_busy", "Bのデスクトップは異なる設定で共有中か、viewer数の上限です。同じ複数viewer設定で接続してください。");
    const url = new URL(p.url);
    if (
      url.pathname !== "/desktop-share" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !allowedRelay(url, cfg.origins())
    )
      throw new RpcError("unauthorized", "Bで許可されていない共有先です");
    if ((cfg.allowUnlock||cfg.allowVirtualDisplay||cfg.allowElevated)&&cfg.unlockLeaseCommand) this.unlockLease.ensureRunning();
    const ws = new WebSocket(url, {
      handshakeTimeout: 10000,
      maxPayload: 65536,
      perMessageDeflate: false,
      followRedirects: false,
    });
    const s: Share = {
      shared: p.options.sharedDesktop === true,
      inputAcks: new DesktopInputAcks(seq => { if (!s.dead) this.send(s,{type:"input_ack",seq}); }),
      imageExpected:!!p.imageTicket,
      chain: new DesktopFrameChain(),
      owner,
      allowClipboard: false,
      dynamicQuality: false,
      clipboardGranted: false,
      clipboardId: 0,
      clipboardGeneration: 0,
      clipboardPending: new Set(),
      quality: p.options.quality,
      video: false,
      ws,
      dead: false,
      attached: false,
      ready: false,
      control: false,
      allowInput: false,
      lastSeen: performance.now(),
      seq: 0,
      pending: 0,
      inputSeq: 0,
      frameAt: 0,
      started: performance.now(),
      timer: setInterval(() => {
        s.native?.tick();
        if (
          performance.now() - s.lastSeen > 12000 ||
          (performance.now() - s.started > (p.options.virtualDisplay?25000:15000) && !s.ready)
        )
          this.stop(s);
      }, 1000),
    };
    s.timer.unref();
    if (s.shared) { this.shared.add(s); this.sharedKey = sharedKey; }
    else this.active = s;
    ws.on("error", () => this.stop(s));
    ws.on("close", () => this.stop(s));
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(new RpcError("spawn_failed", "共有用の接続を開始できませんでした"));
        }
      };
      ws.once("close", fail);
      ws.once("open", () => ws.send(JSON.stringify({ type: "provider", ticket: p.ticket })));
      ws.on("message", (bytes, binary) => {
        if (s.dead) return;
        if (binary) {
          this.stop(s);
          return;
        }
        try {
          const rawMessage = JSON.parse(bytes.toString());
          if (rawMessage.type === "attached" && !s.attached) {
            s.attached = true;
            s.lastSeen = performance.now();
            if (p.videoTicket) {
              const video = s.videoSocket = new WebSocket(url, DESKTOP_VIDEO_LANE_PROTOCOL, {handshakeTimeout:10000,maxPayload:1024,perMessageDeflate:false,followRedirects:false});
              video.on("open", () => video.send(JSON.stringify({type:"video_provider",ticket:p.videoTicket})));
              video.on("error", () => video.terminate());
              video.on("close", () => { s.videoReady=false; s.native?.stop("unavailable"); });
              // A never sends video/application data back over the send-only lane.
              video.on("message", () => video.terminate());
            }
            if(p.imageTicket){
              const image=s.imageSocket=new WebSocket(url,DESKTOP_IMAGE_LANE_PROTOCOL,{handshakeTimeout:10000,maxPayload:1024,perMessageDeflate:false,followRedirects:false});
              image.on("open",()=>image.send(JSON.stringify({type:"video_provider",ticket:p.imageTicket})));
              image.on("error",()=>image.terminate());image.on("message",()=>image.terminate());
              image.on("close",()=>this.failImages(s));
            }
            if(p.fileTicket){
              if(p.options.files!==true||!cfg.fileRoot)throw Error("File transfer not negotiated");
              const socket=s.fileSocket=new WebSocket(p.url,DESKTOP_FILES_PROTOCOL,{handshakeTimeout:10000,followRedirects:false,perMessageDeflate:false,maxPayload:100000});
              s.files=DesktopFiles.open(cfg.fileRoot,()=>!s.dead&&s.ready&&!s.secureDesktop&&performance.now()-s.lastSeen<5000).then(async worker=>{if(s.dead){await worker.close();return undefined;}return worker;}).catch(()=>undefined);
              socket.on("open",()=>socket.send(JSON.stringify({type:"video_provider",ticket:p.fileTicket})));
              const stop=()=>{void s.files?.then(worker=>worker?.close());socket.terminate();};let pending=0;
              socket.on("error",stop);socket.on("close",stop);socket.on("message",async(raw,binary)=>{if(s.dead)return;try{
                const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(++pending>4||binary||bytes.length>100000)throw Error("File request limit");
                const m=DesktopFileRequest.parse(JSON.parse(bytes.toString())),worker=await s.files;
                const result=worker?await worker.run(m):{type:"desktop_file_result",id:m.id,ok:false,message:"共有フォルダを利用できません。接続先で設定を確認してください"};
                if(!s.dead&&socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<262144)socket.send(JSON.stringify(DesktopFileResult.parse(result)));else stop();
              }catch{stop();}finally{pending--;}});
            }
            if(p.clipboardTicket){
              if(p.options.richClipboard!==true||cfg.allowClipboard!==true)throw Error("Rich clipboard not negotiated");
              const socket=s.clipboardSocket=new WebSocket(p.url,DESKTOP_RICH_CLIPBOARD_PROTOCOL,{handshakeTimeout:10000,followRedirects:false,perMessageDeflate:false,maxPayload:32768});
              socket.on("open",()=>socket.send(JSON.stringify({type:"video_provider",ticket:p.clipboardTicket})));
              const stop=()=>{s.richClipboard?.stop();delete s.richClipboard;socket.terminate();};
              socket.on("error",stop);socket.on("close",stop);socket.on("message",(raw,binary)=>{if(s.dead)return;try{const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);if(binary||bytes.length>32768)throw Error("Clipboard lane format");if(!s.richClipboard)throw Error("Clipboard not ready");s.richClipboard.fromViewer(JSON.parse(bytes.toString()));}catch{stop();}});
            }
            this.launch(s, cfg, p.options);
            settled = true;
            resolve({ started: true });
            return;
          }
          if (!s.attached) {
            this.stop(s);
            return;
          }
          if (rawMessage.type === "video_ready" && p.videoTicket && Object.keys(rawMessage).length === 1) { s.videoReady = s.videoSocket?.readyState === WebSocket.OPEN; return; }
          if(p.imageTicket&&Object.keys(rawMessage).length===1&&rawMessage.type==="image_ready"){
            if(!s.imageFailed&&s.ready&&s.imageSocket?.readyState===WebSocket.OPEN){s.imageReady=true;const held=s.heldImage;delete s.heldImage;if(held)this.sendImage(s,held);}else this.failImages(s);return;
          }
          if(p.imageTicket&&Object.keys(rawMessage).length===1&&rawMessage.type==="image_closed"){this.failImages(s);return;}
          // Private A->B marker, negotiated through RPC capabilities. Browser
          // messages and agent actions retain their existing strict schemas.
          const nativeDraw = rawMessage.type === "input" && rawMessage.nativeDraw === true;
          if (nativeDraw) delete rawMessage.nativeDraw;
          const m = RemoteDesktopViewerMessage.parse(rawMessage);
          if(m.type==="media"&&m.enabled&&m.settings?.transport==="native"&&p.videoTicket&&!s.videoReady){this.send(s,{type:"media_unavailable"});return;}
          if(m.type==="media"&&!m.enabled&&s.ready&&!s.secureDesktop){s.native?.fromViewer(m);this.companion.fromViewer(s,m);return;}
          if(m.type==="native_audio_control"&&s.ready&&!s.secureDesktop){s.native?.fromViewer(m);return;}
          if((m.type==="rtc_signal"||m.type==="media_fallback")&&s.ready&&!s.secureDesktop&&s.native?.fromViewer(m))return;
          if(m.type==="native_codec_fallback"||m.type==="native_format_ack"||m.type==="native_video_ack"||(m.type==="media"&&(m.settings?.transport==="native"||s.native))) {
            if(!s.ready||s.secureDesktop){this.send(s,{type:"media_unavailable"});return;}
            else {
              if(m.type==="media"&&m.settings?.transport==="native")this.companion.fromViewer(s,{type:"media",enabled:false});
              if(s.native?.fromViewer(m))return;
            }
          }
          if (
            m.type === "media" ||
            m.type === "media_fallback" ||
            m.type === "rtc_signal" ||
            m.type === "media_feedback"
          ) {
            if (!s.ready || s.secureDesktop || !this.companion.fromViewer(s, m))
              this.send(s, { type: "media_unavailable" });
          } else if (m.type === "quality") {
            if (
              s.dynamicQuality &&
              p.options.adaptive &&
              m.fps <= p.options.fps &&
              m.quality <= p.options.quality
            ) {
              s.quality = m.quality;
              this.write(s, { type: "policy", fps: s.video ? 1 : m.fps, quality: m.quality });
            }
          } else if (m.type === "clipboard_grant") {
            s.clipboardGranted = m.enabled && s.allowClipboard;
            s.clipboardGeneration++;
            s.clipboardPending.clear();
            s.richClipboard?.revoke();
            if (s.allowClipboard)
              this.write(s, {
                type: "clipboard_control",
                enabled: s.clipboardGranted,
                generation: s.clipboardGeneration,
              });
            this.send(s, { type: "clipboard_state", enabled: s.clipboardGranted });
          } else if (m.type === "clipboard") {
            if (
              !s.clipboardGranted ||
              !s.ready ||
              m.id <= s.clipboardId ||
              s.clipboardPending.size ||
              performance.now() - s.lastSeen > 5000 ||
              (m.operation === "write" && !cfg.allowInput)
            ) {
              this.send(s, { type: "clipboard_result", id: m.id, ok: false });
            } else {
              s.clipboardId = m.id;
              s.clipboardPending.add(m.id);
              this.write(s, {
                ...m,
                generation: s.clipboardGeneration,
                expiresAt: Date.now() + 1000,
              });
            }
          } else if (m.type === "heartbeat") {
            s.lastSeen = performance.now();
            this.write(s, m);
          } else if (m.type === "stop") this.stop(s);
          else if (m.type === "release") {
            if (s.control) this.write(s, m);
          } else if (m.type === "ack") {
            if (m.seq !== s.pending) {
              this.stop(s);
              return;
            }
            s.pending = 0;
            this.write(s, m);
          } else if (m.type === "keyframe") {
            this.write(s, m);
          } else if (m.type === "control") {
            const enabled = m.enabled && s.allowInput && s.ready;
            s.control = s.process?.requestControl ? s.process.requestControl(enabled) : enabled;
            this.write(s, { type: "control", enabled: s.control });
            this.send(s, { type: "control", enabled: s.control });
          } else if (m.type === "sas") {
            if (s.secureDesktop && !s.protectedDesktop && !s.lockScreenCover && s.control && s.ready && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "dismiss_lock_screen") {
            if (s.lockScreenCover && s.secureDesktop && s.control && s.ready && cfg.allowInput && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "input") {
            if (isExtendedDesktopInput(m.input) && !s.extendedInput) return;
            if (m.input.kind === "key" && (m.input.code === "ImeOn" || m.input.code === "ImeOff") && !s.imeKeys) return;
            if (
              s.control &&
              m.frameSeq >= s.seq - 1 &&
              m.frameSeq <= s.seq &&
              m.seq > s.inputSeq &&
              performance.now() - s.lastSeen < 5000 &&
              s.seq > 0 &&
              (nativeDraw ? s.native?.hasFreshDraw() === true : performance.now() - s.frameAt < 2000)
            ) {
              s.inputSeq = m.seq;
              s.inputAcks.submitted(m.seq);
              this.write(s, { ...m, expiresAt: Date.now() + 500, ...(nativeDraw && s.deferNativeSnapshots ? {deferNativeSnapshot:true} : {}) });
            }
          } else {
            this.stop(s);
          }
        } catch {
          this.stop(s);
        }
      });
    });
  }
  private launch(
    s: Share,
    cfg: DesktopProviderConfig,
    options: z.infer<typeof DesktopStartParams>["options"],
  ): void {
    const spawnHelper = () => spawn(cfg.command[0]!, cfg.command.slice(1), {
      shell: false,
      windowsHide: true,
      env:{...process.env,SODA_DESKTOP_ELEVATED_REQUEST:options.elevatedDesktop===true&&cfg.allowElevated===true?"1":"0",SODA_DESKTOP_VIRTUAL_REQUEST:options.virtualDisplay===true&&cfg.allowVirtualDisplay===true?"1":"0"},
      stdio: ["pipe", "pipe", "pipe"],
    });
    const child = options.sharedDesktop ? this.sharedCapture.attach(this.sharedKey!, spawnHelper) : spawnHelper();
    s.process = child;
    child.once("error", () => this.stop(s));
    child.once("close", () => {
      if (this.active === s) this.active = undefined;
      this.stop(s);
    });
    child.stdin.on("error", () => this.stop(s));
    // Native errors can contain paths/window titles. Never forward or log stdout/stderr contents.
    child.stderr.on("data", (chunk: Buffer) => { if (!s.dead) s.inputAcks.push(chunk); });
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (s.dead) return;
      buffer += chunk;
      if (buffer.length > 3 * 1024 * 1024) {
        this.stop(s);
        return;
      }
      let n: number;
      while ((n = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, n).trim();
        buffer = buffer.slice(n + 1);
        if (!line) continue;
        try {
          const raw = JSON.parse(line);
          if(options.elevatedDesktop&&["unlock_failure","session_locked","session_unlocked","lock_screen_changed"].includes(raw.type)){this.send(s,{type:"protected_desktop_failure",code:raw.type==="unlock_failure"?"worker_unavailable":"source_changed"});this.stop(s);return;}
          if(raw.type==="protected_desktop_failure"&&options.elevatedDesktop&&cfg.allowElevated){this.send(s,DesktopProtectedFailure.parse(raw));this.stop(s);return;}
          if(raw.type==="virtual_display_failure"&&options.virtualDisplay&&cfg.allowVirtualDisplay){this.send(s,DesktopVirtualFailure.parse(raw));this.stop(s);return;}
          if(raw.type==="monitor_topology_changed"&&Object.keys(raw).length===1&&s.ready&&!s.secureDesktop&&options.monitors===true&&cfg.allowMonitors===true){this.send(s,{type:"monitor_topology_changed"});this.stop(s);return;}
          if (raw.type === "ready" && !s.ready) {
            const {deferNativeSnapshots, inputAckPipe, ...wireReady}=raw;
            const ready = DesktopReady.parse(wireReady);
            if(options.elevatedDesktop&&(!ready.protectedDesktop||!ready.secureDesktop||ready.lockScreenCover)){
              this.send(s,{type:"protected_desktop_failure",code:"service_incompatible"});throw Error("Requested protected worker unavailable");
            }
            if(ready.protectedDesktop&&(!options.elevatedDesktop||!cfg.allowElevated))throw Error("Unrequested protected worker");
            if(ready.protectedDesktop)s.protectedDesktop=ready.protectedDesktop;else delete s.protectedDesktop;
            s.secureDesktop = ready.secureDesktop === true;
            s.inputAcks.enabled = !s.secureDesktop && inputAckPipe === true;
            s.deferNativeSnapshots=options.nativeVideo===true&&cfg.allowNativeVideo===true&&!s.secureDesktop&&deferNativeSnapshots===true;
            s.lockScreenCover = ready.lockScreenCover === true;
            s.imeKeys = options.imeKeys === true && ready.imeKeys === true && !s.lockScreenCover;
            s.extendedInput = options.extendedInput === true && ready.extendedInput === true && !s.lockScreenCover;
            if (s.secureDesktop && !s.protectedDesktop && !cfg.allowUnlock) throw new Error("Unlock is not locally permitted");
            if (
              !s.secureDesktop && options.display &&
              (!ready.display ||
                ready.width !== options.display.width ||
                ready.height !== options.display.height)
            )
              throw new Error("Helper did not apply requested display mode");
            if (
              options.image &&
              (ready.image
                ? ready.image.colorMode !== options.image.colorMode ||
                  ready.image.showCursor !== options.image.showCursor
                : options.image.colorMode !== "full" || !options.image.showCursor)
            )
              throw new Error("Helper does not support requested image settings");
            if(options.virtualDisplay&&(ready.virtualDisplay!==true||s.secureDesktop||ready.lockScreenCover)){this.send(s,{type:"virtual_display_failure",code:"helper_incompatible"});throw Error("Helper did not create requested virtual monitor");}
            if(!s.secureDesktop&&options.monitorDevice&&(!ready.monitorLayout||ready.monitorLayout.selected!==options.monitorDevice))throw Error("Helper did not select requested monitor");
            if(ready.monitorLayout&&(ready.monitorLayout.bounds.width!==ready.width||ready.monitorLayout.bounds.height!==ready.height))throw Error("Monitor capture size mismatch");
            s.ready = true;
            s.allowClipboard = !s.secureDesktop && cfg.allowClipboard === true && ready.allowClipboard === true;
            s.dynamicQuality = ready.dynamicQuality === true;
            s.allowInput = ready.allowInput && cfg.allowInput;
            const {
              imeKeys,
              extendedInput,
              protectedDesktop,virtualDisplay,monitorLayout,files, nativeVideo,nativeDatagrams,nativeAudio,richClipboard,
              nativeVideoWindow,
              nativeMaxFps,nativeCadence,nativeAdaptive,nativeCodecs,nativeCodecCandidates,
              cursor,
              image: appliedImage,
              allowClipboard,
              allowMedia,
              dynamicQuality,
              display,
              ...legacyReady
            } = ready;
            if(options.richClipboard===true&&richClipboard===true&&s.allowClipboard&&s.clipboardSocket)s.richClipboard=new DesktopRichClipboard({allowed:write=>s.ready&&!s.dead&&!s.secureDesktop&&s.allowClipboard&&s.clipboardGranted&&performance.now()-s.lastSeen<5000&&(!write||s.allowInput),generation:()=>s.clipboardGeneration,write:value=>this.write(s,value),send:value=>{const socket=s.clipboardSocket;if(!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>65536)return false;socket.send(JSON.stringify(value));return true;}});
            const enabledMedia = !s.secureDesktop && cfg.allowMedia === true && dynamicQuality === true;
            const nativeEnabled=!s.secureDesktop&&options.nativeVideo===true&&cfg.allowNativeVideo===true&&nativeVideo===true;
            if(options.cursor===true&&cursor===true&&!s.secureDesktop)s.cursor=new DesktopCursorStream(bytes=>this.send(s,bytes),()=>s.ws.bufferedAmount);
            const nativeRate=options.nativeMaxFps===60&&nativeMaxFps===60&&nativeEnabled?60:undefined;
            const audioEnabled=options.nativeAudio===true&&nativeAudio===true&&nativeEnabled&&cfg.allowMedia===true&&(process.platform==="win32"||ready.backend==="synthetic");
            const udpEnabled=options.nativeDatagrams===true&&nativeDatagrams===true&&nativeEnabled;
            const nativeWindow=options.nativeVideoWindow===3&&nativeVideoWindow===3&&nativeEnabled?3:1;
            s.native=new DesktopNativeVideo({enabled:nativeEnabled,codecs:options.nativeCodecs===true&&nativeCodecs===true,adaptive:options.nativeAdaptive===true&&nativeAdaptive===true,cadence:options.nativeCadence===true&&nativeCadence===true,datagrams:udpEnabled,audioEnabled,synthetic:ready.backend==="synthetic",iceServers:cfg.iceServers??[],window:nativeWindow,width:options.display?.width??options.width,sourceWidth:ready.width,sourceHeight:ready.height,...(options.display?{exact:options.display}:{}),fps:options.fps,...(nativeRate?{maxFps:nativeRate}:{}),send:value=>this.sendVideo(s,value),write:value=>this.write(s,value),buffered:()=>s.videoReady?s.videoSocket!.bufferedAmount:s.ws.bufferedAmount,policy:video=>{s.video=video;this.write(s,{type:"policy",fps:video?1:options.fps,quality:s.quality});}});
            this.send(s, {
              ...legacyReady,
              ...(options.elevatedDesktop&&protectedDesktop?{protectedDesktop}:{}),
              ...(options.virtualDisplay&&virtualDisplay&&!s.secureDesktop?{virtualDisplay:true}:{}),
              ...(options.monitors===true&&cfg.allowMonitors===true&&monitorLayout&&!s.secureDesktop?{monitorLayout}:{}),
              ...(options.files===true&&cfg.fileRoot&&s.fileSocket&&!s.secureDesktop?{files:true}:{}),
              ...(s.richClipboard?{richClipboard:true}:{}),
              ...(nativeEnabled?{nativeVideo:true}:{}),
              ...(nativeEnabled&&options.nativeCodecs&&nativeCodecs?{nativeCodecs:true,nativeCodecCandidates:nativeCodecCandidates??[]}:{}),
              ...(nativeEnabled&&options.nativeAdaptive&&nativeAdaptive?{nativeAdaptive:true}:{}),
              ...(udpEnabled?{nativeDatagrams:true}:{}),
              ...(audioEnabled?{nativeAudio:true}:{}),
              ...(nativeWindow===3?{nativeVideoWindow:3}:{}),
              ...(nativeRate?{nativeMaxFps:nativeRate}:{}),
              ...(s.cursor?{cursor:true}:{}),
              // Keep the existing viewer wire format; capture is a helper detail.
              backend: legacyReady.backend === "windows-dxgi" ? "windows-gdi" : legacyReady.backend,
              ...(s.imeKeys && imeKeys ? { imeKeys: true } : {}),
              ...(s.extendedInput && extendedInput ? { extendedInput: true } : {}),
              ...(options.image ? { image: appliedImage } : {}),
              ...(options.features
                ? {
                    allowClipboard: s.allowClipboard,
                    allowMedia: enabledMedia,
                    dynamicQuality: dynamicQuality === true,
                    ...(!s.secureDesktop && cfg.allowDisplayResize && display ? { display } : {}),
                  }
                : {}),
              allowInput: s.allowInput,
            });
            if (options.features && enabledMedia)
              this.companion.bind({
                owner: s,
                options: { ...options, width: options.display?.width ?? options.width },
                ready,
                send: (value) => this.send(s, value),
                buffered: () => s.ws.bufferedAmount,
                policy: (video) => {
                  s.video = video;
                  this.write(s, {
                    type: "policy",
                    fps: video ? 1 : options.fps,
                    quality: s.quality,
                  });
                },
              });
          } else if (raw.type === "session_locked" && cfg.allowUnlock && s.ready && !s.secureDesktop) {
            this.send(s, { type: "session_locked" });
            this.stop(s);
            return;
          } else if (raw.type === "session_unlocked" && s.ready && s.secureDesktop && !s.protectedDesktop) {
            this.send(s, { type: "session_unlocked" });
            this.stop(s);
            return;
          } else if (raw.type === "lock_screen_changed" && cfg.allowUnlock && s.ready && s.secureDesktop && s.lockScreenCover) {
            this.send(s, { type: "lock_screen_changed" });
            this.stop(s);
            return;
          } else if (raw.type === "unlock_failure" && cfg.allowUnlock && (!s.ready || s.secureDesktop) && unlockFailure(raw.code)) {
            // First terminal result wins; a later parent transition must never
            // overwrite an installed worker's explicit failure.
            this.send(s, { type: "unlock_failure", code: raw.code });
            this.stop(s);
            return;
          } else if (raw.type === "frame" && s.ready && !s.lockScreenCover) {
            const frame = HelperFrame.parse(raw);
            if (
              s.pending ||
              frame.info.seq <= s.seq ||
              frame.info.width > (options.display?.width ?? options.width) ||
              (!s.secureDesktop && options.display &&
                (frame.info.width !== options.display.width ||
                  frame.info.height !== options.display.height))
            ) {
              this.stop(s);
              return;
            }
            const image = Buffer.from(frame.data, "base64");
            const packet = encodeDesktopFrame(frame.info, image);
            decodeDesktopFrame(packet);
            s.chain.accept(frame.info);
            s.seq = frame.info.seq;
            s.pending = s.seq;
            s.frameAt = performance.now();
            if(s.imageExpected&&!s.imageFailed&&!s.imageReady)s.heldImage=packet;
            else if (!this.sendImage(s, packet)) return;
          } else if (raw.type==="cursor"&&s.ready&&!s.secureDesktop&&s.cursor) {
            const {data,...info}=raw;
            if(data!==undefined&&(typeof data!=="string"||data.length>Math.ceil(DESKTOP_CURSOR_MAX_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)))throw Error("Invalid cursor bytes");
            s.cursor.accept({info,data:Buffer.from(data??"","base64")});
          } else if (s.ready&&!s.secureDesktop&&s.native?.fromHelper(raw)) {
            // Native video has its own bounded frame/draw ACK.
          } else if(raw.type==="clipboard_rich_result"&&s.ready){
            try{s.richClipboard?.fromHelper(raw);}catch{s.richClipboard?.stop();delete s.richClipboard;s.clipboardSocket?.terminate();}
          } else if (raw.type === "clipboard_result" && s.ready) {
            const result = DesktopClipboardResult.parse(raw);
            if (s.clipboardPending.delete(result.id) && s.clipboardGranted) this.send(s, result);
          } else if (raw.type === "input_ack" && s.ready) {
            const ack = z
              .object({ type: z.literal("input_ack"), seq: z.number().int().positive() })
              .strict()
              .parse(raw);
            s.inputAcks.ack(ack.seq);
          } else {
            this.stop(s);
            return;
          }
        } catch {
          this.stop(s);
          return;
        }
      }
    });
    const {sharedNative:_sharedNative,sharedDesktop:_sharedDesktop,files:_files,nativeCadence:_nativeCadence,nativeAdaptive:_nativeAdaptive,nativeCodecs:_nativeCodecs,...helperOptions}=options;
    this.write(s, {
      type: "configure",
      options:options.sharedDesktop ? sharedHelperOptions(options) : helperOptions,
      captureBackends: ["dxgi"],
      inputAckPipe: !options.sharedDesktop,
      allowMonitors:options.monitors===true&&cfg.allowMonitors===true,
      allowVirtualDisplay:options.virtualDisplay===true&&cfg.allowVirtualDisplay===true,
      ...(options.elevatedDesktop?{allowElevated:cfg.allowElevated===true}:{}),
      richClipboard:options.richClipboard===true&&cfg.allowClipboard===true,
      allowSystemAudio:options.nativeAudio===true&&cfg.allowMedia===true&&cfg.allowNativeVideo===true,
      audioClientPid:process.pid,
      nativeCodecs:(options.sharedDesktop||options.nativeCodecs===true)&&cfg.allowNativeVideo===true,
      nativeAdaptive:options.nativeAdaptive===true&&cfg.allowNativeVideo===true,
      nativeCadence:options.nativeCadence===true&&cfg.allowNativeVideo===true,
      nativeDatagrams:options.nativeDatagrams===true&&cfg.allowNativeVideo===true,
      separateCursor: options.cursor===true,
      ...((options.sharedDesktop||options.nativeMaxFps===60)&&cfg.allowNativeVideo===true?{nativeMaxFps:60}:{}),
      allowNativeVideo: (options.sharedDesktop||options.nativeVideo===true)&&cfg.allowNativeVideo===true,
      deferNativeSnapshots: (options.sharedDesktop||options.nativeVideo===true)&&cfg.allowNativeVideo===true,
      ...((options.sharedDesktop||options.nativeVideoWindow===3)&&cfg.allowNativeVideo===true?{nativeVideoWindow:3}:{}),
      allowInput: cfg.allowInput,
      allowClipboard: !options.sharedDesktop && cfg.allowClipboard === true,
      allowDisplayResize: !options.sharedDesktop && cfg.allowDisplayResize === true,
    });
  }
  private failImages(s:Share){
    if(s.dead||s.imageFailed)return;if(s.imageReady){this.stop(s);return;}s.imageFailed=true;s.imageReady=false;s.imageSocket?.terminate();
    const held=s.heldImage;delete s.heldImage;if(held)this.send(s,held);
  }
  private sendImage(s:Share,data:Uint8Array):boolean{
    if(!s.imageReady)return this.send(s,data);
    const image=s.imageSocket;
    if(s.dead)return false;
    if(image?.readyState!==WebSocket.OPEN||image.bufferedAmount>DESKTOP_MAX_FRAME_BYTES+4096){this.stop(s);return false;}
    image.send(data);return true;
  }
  private sendVideo(s: Share, data: unknown): boolean {
    const video = s.videoSocket;
    if (!s.videoReady) return this.send(s, data);
    if (s.dead) return false;
    if (video?.readyState !== WebSocket.OPEN || video.bufferedAmount > 512 * 1024) { s.videoReady=false; video?.terminate(); return false; }
    video.send(data instanceof Uint8Array ? data : JSON.stringify(data));
    return true;
  }
  private send(s: Share, data: unknown): boolean {
    if (
      s.dead ||
      s.ws.readyState !== WebSocket.OPEN ||
      s.ws.bufferedAmount > DESKTOP_MAX_FRAME_BYTES + 4096
    ) {
      this.stop(s);
      return false;
    }
    s.ws.send(data instanceof Uint8Array ? data : JSON.stringify(data));
    return true;
  }
  private write(s: Share, value: unknown): void {
    if (!s.process || s.dead) return;
    if (s.process.stdin.writableLength > 64 * 1024) {
      this.stop(s);
      return;
    }
    s.process.stdin.write(JSON.stringify(value) + "\n", (err) => {
      if (err) this.stop(s);
    });
  }
  private stop(s: Share): void {
    if (s.dead) return;
    s.dead = true;
    if (s.shared) { this.shared.delete(s); if (!this.shared.size) this.sharedKey = undefined; }
    delete s.heldImage; s.imageSocket?.terminate();
    s.videoSocket?.terminate();
    void s.files?.then(worker=>worker?.close());s.fileSocket?.terminate();
    s.richClipboard?.stop();s.clipboardSocket?.terminate();
    s.native?.stop();
    this.companion.end(s);
    s.clipboardGranted = false;
    s.clipboardPending.clear();
    clearInterval(s.timer);
    const clearActive = () => {
      if (this.active === s) this.active = undefined;
    };
    if (s.process && s.process.exitCode === null && s.process.signalCode === null)
      s.process.once("close", clearActive);
    else clearActive();
    s.process?.stdin.end();
    const child = s.process;
    if (child) {
      const t = setTimeout(() => child.kill(), 1500);
      t.unref();
      child.once("close", () => clearTimeout(t));
    }
    s.ws.close(1000, "desktop stopped");
    const timer = setTimeout(() => s.ws.terminate(), 1000);
    timer.unref();
    s.ws.once("close", () => clearTimeout(timer));
  }
  clientGone(owner: string): void {
    for (const pending of this.pendingStarts) if (pending.owner === owner) pending.cancelled = true;
    if (this.active?.owner === owner) this.stop(this.active);
    for (const s of [...this.shared]) if (s.owner === owner) this.stop(s);
  }
  // Also used when pausing clients for handoff; rollback can reuse this provider.
  dispose(): void {
    this.unlockLease.stop();
    this.companion.dispose();
    for (const pending of this.pendingStarts) pending.cancelled = true;
    if (this.active) this.stop(this.active);
    for (const s of [...this.shared]) this.stop(s);
    this.sharedCapture.dispose();
  }
}
function sharedHelperOptions(options: z.infer<typeof DesktopStartParams>["options"]) {
  return {width:options.width,fps:options.fps,quality:options.quality,...(options.image?{image:options.image}:{}),deltas:false,adaptive:false,features:true,imeKeys:true,extendedInput:true};
}
function allowedRelay(url: URL, origins: string[]): boolean {
  if (
    url.protocol !== "wss:" &&
    !(url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    return false;
  const httpOrigin = url.origin.replace(/^ws/, "http");
  return origins.some((origin) => {
    try {
      return new URL(origin).origin.replace(/^ws/, "http") === httpOrigin;
    } catch {
      return false;
    }
  });
}
export function desktopConfigFromEnv(
  env: NodeJS.ProcessEnv,
  delegatedOrigins: () => string[],
): DesktopProviderConfig | undefined {
  if (!env.SODA_DESKTOP_COMMAND) return;
  try {
    const command: unknown = JSON.parse(env.SODA_DESKTOP_COMMAND);
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.length > 32 ||
      command.some((v) => typeof v !== "string" || !v || v.includes("\0"))
    )
      return;
    return {
      command: command as string[],
      allowInput: env.SODA_DESKTOP_ALLOW_INPUT === "1",
      allowMonitors:env.SODA_DESKTOP_ALLOW_MONITORS==="1",
      allowVirtualDisplay:env.SODA_DESKTOP_ALLOW_VIRTUAL_DISPLAY==="1",
      allowElevated:env.SODA_DESKTOP_ALLOW_ELEVATED==="1",
      allowClipboard: env.SODA_DESKTOP_ALLOW_CLIPBOARD === "1",
      allowMedia: env.SODA_DESKTOP_ALLOW_MEDIA === "1",
      allowDisplayResize: env.SODA_DESKTOP_ALLOW_DISPLAY_RESIZE === "1",
      allowUnlock: env.SODA_DESKTOP_ALLOW_UNLOCK === "1",
      iceServers: DesktopIceServers.parse(
        env.SODA_DESKTOP_ICE_SERVERS ? JSON.parse(env.SODA_DESKTOP_ICE_SERVERS) : [],
      ),
      origins: desktopOriginsFromEnv(env, delegatedOrigins),
    };
  } catch {
    return;
  }
}

/** Destination policy is independent of whether a custom helper command is configured. */
export function desktopOriginsFromEnv(env: NodeJS.ProcessEnv, delegatedOrigins: () => string[]): () => string[] {
  const allowed = (env.SODA_DESKTOP_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return () => [...allowed, ...delegatedOrigins()];
}
