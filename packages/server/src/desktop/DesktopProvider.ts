import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { performance } from "node:perf_hooks";
import { unlockFailure } from "./unlockFailure.js";
import { z } from "zod";
import WebSocket from "ws";
import {
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
  allowClipboard?: boolean;
  allowMedia?: boolean;
  allowDisplayResize?: boolean;
  allowUnlock?: boolean;
  unlockLeaseCommand?: string[];
  iceServers?: z.infer<typeof DesktopIceServers>;
  origins(): string[];
}
type Share = {
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
  process?: ChildProcessWithoutNullStreams;
  dead: boolean;
  attached: boolean;
  ready: boolean;
  control: boolean;
  secureDesktop?: boolean;
  lockScreenCover?: boolean;
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
    if (this.config?.allowUnlock && this.config.unlockLeaseCommand)
      this.unlockLease.start(this.config.unlockLeaseCommand);
  }
  capabilities() {
    return {
      available: !!this.config,
      allowInput: this.config?.allowInput === true,
      deltas: true,
      imageSettings: true,
      features: true,
      displayResize: this.config?.allowDisplayResize === true,
    };
  }
  async start(owner: string, raw: z.infer<typeof DesktopStartParams>): Promise<{ started: true }> {
    const p = DesktopStartParams.parse(raw),
      cfg = this.config;
    if (!cfg) throw new RpcError("not_found", "Bでデスクトップ補助プログラムが設定されていません");
    if (p.options.display && (!cfg.allowDisplayResize || !p.options.features))
      throw new RpcError("unauthorized", "Bでディスプレイ解像度の変更が許可されていません");
    if (this.active?.dead && this.active.process) {
      const child = this.active.process,
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
    if (this.active) throw new RpcError("server_busy", "Bのデスクトップは共有中です");
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
    const ws = new WebSocket(url, {
      handshakeTimeout: 10000,
      maxPayload: 65536,
      perMessageDeflate: false,
      followRedirects: false,
    });
    const s: Share = {
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
        if (
          performance.now() - s.lastSeen > 12000 ||
          (performance.now() - s.started > 15000 && !s.ready)
        )
          this.stop(s);
      }, 1000),
    };
    s.timer.unref();
    this.active = s;
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
            this.launch(s, cfg, p.options);
            settled = true;
            resolve({ started: true });
            return;
          }
          if (!s.attached) {
            this.stop(s);
            return;
          }
          const m = RemoteDesktopViewerMessage.parse(rawMessage);
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
            s.control = m.enabled && s.allowInput && s.ready;
            this.write(s, { type: "control", enabled: s.control });
            this.send(s, { type: "control", enabled: s.control });
          } else if (m.type === "sas") {
            if (s.secureDesktop && !s.lockScreenCover && s.control && s.ready && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "dismiss_lock_screen") {
            if (s.lockScreenCover && s.secureDesktop && s.control && s.ready && cfg.allowInput && performance.now() - s.lastSeen < 5000)
              this.write(s, m);
          } else if (m.type === "input") {
            if (
              s.control &&
              m.frameSeq >= s.seq - 1 &&
              m.frameSeq <= s.seq &&
              m.seq > s.inputSeq &&
              performance.now() - s.lastSeen < 5000 &&
              s.seq > 0 &&
              performance.now() - s.frameAt < 2000
            ) {
              s.inputSeq = m.seq;
              this.write(s, { ...m, expiresAt: Date.now() + 500 });
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
    const child = spawn(cfg.command[0]!, cfg.command.slice(1), {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    s.process = child;
    child.once("error", () => this.stop(s));
    child.once("close", () => {
      if (this.active === s) this.active = undefined;
      this.stop(s);
    });
    child.stdin.on("error", () => this.stop(s));
    // Native errors can contain paths/window titles. Never forward or log stdout/stderr contents.
    child.stderr.resume();
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
          if (raw.type === "ready" && !s.ready) {
            const ready = DesktopReady.parse(raw);
            s.secureDesktop = ready.secureDesktop === true;
            s.lockScreenCover = ready.lockScreenCover === true;
            if (s.secureDesktop && !cfg.allowUnlock) throw new Error("Unlock is not locally permitted");
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
            s.ready = true;
            s.allowClipboard = !s.secureDesktop && cfg.allowClipboard === true && ready.allowClipboard === true;
            s.dynamicQuality = ready.dynamicQuality === true;
            s.allowInput = ready.allowInput && cfg.allowInput;
            const {
              image: appliedImage,
              allowClipboard,
              allowMedia,
              dynamicQuality,
              display,
              ...legacyReady
            } = ready;
            const enabledMedia = !s.secureDesktop && cfg.allowMedia === true && dynamicQuality === true;
            this.send(s, {
              ...legacyReady,
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
          } else if (raw.type === "session_unlocked" && s.ready && s.secureDesktop) {
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
            if (!this.send(s, packet)) return;
          } else if (raw.type === "clipboard_result" && s.ready) {
            const result = DesktopClipboardResult.parse(raw);
            if (s.clipboardPending.delete(result.id) && s.clipboardGranted) this.send(s, result);
          } else if (raw.type === "input_ack" && s.ready) {
            const ack = z
              .object({ type: z.literal("input_ack"), seq: z.number().int().positive() })
              .strict()
              .parse(raw);
            if (ack.seq <= s.inputSeq) this.send(s, ack);
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
    this.write(s, {
      type: "configure",
      options,
      allowInput: cfg.allowInput,
      allowClipboard: cfg.allowClipboard === true,
      allowDisplayResize: cfg.allowDisplayResize === true,
    });
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
  }
  // Also used when pausing clients for handoff; rollback can reuse this provider.
  dispose(): void {
    this.unlockLease.stop();
    this.companion.dispose();
    for (const pending of this.pendingStarts) pending.cancelled = true;
    if (this.active) this.stop(this.active);
  }
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
