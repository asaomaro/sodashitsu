export const DESKTOP_SHARED_MICROPHONE_PROTOCOL="soda-desktop-shared-microphone-v1";
export const DESKTOP_SHARED_PROTECTED_PROTOCOL="soda-desktop-shared-protected-v1";
export const DESKTOP_SHARED_RESOLUTION_PROTOCOL="soda-desktop-shared-resolution-v1";
import {DesktopNativePlatform,DesktopInputCapabilities} from "./desktopNativePlatform.js";
export const DESKTOP_IMAGE_LANE_PROTOCOL = "soda-desktop-images-v1";
export const DESKTOP_SHARED_PROTOCOL = "soda-desktop-shared-v1";
export const DESKTOP_SHARED_NATIVE_PROTOCOL = "soda-desktop-shared-native-v1";
export const DESKTOP_SHARED_AUDIO_PROTOCOL = "soda-desktop-shared-audio-v1";
export const DESKTOP_SHARED_DATAGRAM_PROTOCOL = "soda-desktop-shared-datagrams-v1";
import {DesktopNativeCodec,DesktopNativeCodecFallback} from "./desktopCodecs.js";
import {DesktopNativeFormatAck} from "./desktopNativeAdaptive.js";
import {DesktopProtectedMode} from "./desktopProtected.js";
import {DesktopMonitorLayout} from "./desktopMonitors.js";
import { z } from "zod";
import {DesktopNativeAudioControl} from "./desktopAudio.js";
import {
  DesktopMediaRequest,
  DesktopNativeVideoAck,
  DesktopMediaSignal,
  DesktopMediaFallback,
  DesktopMediaFeedback,
  DesktopQuality,
  DesktopClipboardGrant,
  DesktopClipboardRequest,
} from "./desktopMedia.js";

// Opt in outside the strict JSON start schema so old relays can still connect.
export const DESKTOP_IME_PROTOCOL = "soda-desktop-ime-v1";
export const DESKTOP_INPUT_PROTOCOL = "soda-desktop-input-v1";

export const DESKTOP_MAX_FRAME_BYTES = 2 * 1024 * 1024;
export const DesktopDisplaySize = z
  .object({
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(200).max(2400),
  })
  .strict()
  .refine((v) => v.width * v.height <= 8_000_000);
export const DesktopImageSettings = z
  .object({
    colorMode: z.enum(["full", "rgb565", "rgb332", "gray16"]),
    showCursor: z.boolean(),
  })
  .strict();
export const DesktopOptions = z
  .object({
    width: z.number().int().min(320).max(1920).default(1280),
    fps: z.number().int().min(1).max(30).default(10),
    quality: z.number().int().min(20).max(90).default(65),
    deltas: z.boolean().optional(),
    image: DesktopImageSettings.optional(),
    adaptive: z.boolean().optional(),
    features: z.boolean().optional(),
    imeKeys: z.literal(true).optional(),
    extendedInput: z.literal(true).optional(),
    elevatedDesktop:z.literal(true).optional(),
    nativePlatform:DesktopNativePlatform.optional(),
    sharedDesktop:z.literal(true).optional(),
    sharedCursor:z.literal(true).optional(),
    sharedClipboard:z.literal(true).optional(),
    sharedMicrophone:z.literal(true).optional(),
    sharedProtected:z.literal(true).optional(),
    sharedNative:z.literal(true).optional(),
    sharedDatagrams:z.literal(true).optional(),
    sharedAudio:z.literal(true).optional(),
    sharedRate:z.literal(true).optional(),
    sharedResolution:z.literal(true).optional(),
    virtualDisplay:z.literal(true).optional(),
    monitors:z.literal(true).optional(),
    monitorDevice:z.string().min(1).max(128).refine(v=>!v.includes("\0")).optional(),
    files: z.literal(true).optional(),
    fileCheckpoints:z.literal(true).optional(),
    folders:z.literal(true).optional(),
    richClipboard: z.literal(true).optional(),
    microphone: z.literal(true).optional(),
    microphoneOpus:z.literal(true).optional(),
    nativeAudio: z.literal(true).optional(),
    nativeDatagrams: z.literal(true).optional(),
    nativeVideo: z.literal(true).optional(),
    nativeVideoWindow: z.literal(3).optional(),
    nativeCodecs: z.literal(true).optional(),
    nativeAdaptive: z.literal(true).optional(),
    nativeCadence: z.literal(true).optional(),
    nativeMaxFps: z.literal(60).optional(),
    cursor: z.literal(true).optional(),
    display: DesktopDisplaySize.optional(),
  })
  .strict();
export type DesktopOptions = z.infer<typeof DesktopOptions>;
const legacyKeyPattern = /^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Numpad[0-9]|Arrow(?:Left|Right|Up|Down)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|Enter|Escape|Tab|Space|Backspace|Delete|Insert|Home|End|PageUp|PageDown|CapsLock|ImeOn|ImeOff|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash)$/;
const extendedKeyPattern = /^(F(?:1[3-9]|2[0-4])|NumLock|ScrollLock|Pause|PrintScreen|ContextMenu|Numpad(?:Enter|Add|Subtract|Multiply|Divide|Decimal|Comma|Equal)|Convert|NonConvert|KanaMode|IntlBackslash|IntlYen|IntlRo|Lang3|Lang4|Lang5|ZenkakuHankaku|(?:Audio)?Volume(?:Mute|Up|Down)|MediaTrackNext|MediaTrackPrevious|MediaStop|MediaPlayPause|MediaSelect|LaunchMail|LaunchApp1|LaunchApp2|BrowserBack|BrowserForward|BrowserRefresh|BrowserStop|BrowserSearch|BrowserFavorites|BrowserHome)$/;
const keyCode = z.string().max(32).refine(code => legacyKeyPattern.test(code) || extendedKeyPattern.test(code));
export const RemoteDesktopInput = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pointer"),
      x: z.number().min(0).max(1).finite(),
      y: z.number().min(0).max(1).finite(),
      event: z.enum(["move", "down", "up"]),
      button: z.number().int().min(0).max(4),
    })
    .strict(),
  z.object({ kind: z.literal("wheel"), delta: z.number().int().min(-1200).max(1200) }).strict(),
  z.object({ kind: z.literal("key"), code: keyCode, down: z.boolean() }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(1024) }).strict(),
]);
export type RemoteDesktopInput = z.infer<typeof RemoteDesktopInput>;
export function isExtendedDesktopInput(input: RemoteDesktopInput): boolean {
  return input.kind === "pointer" ? input.button > 2 : input.kind === "key" && !legacyKeyPattern.test(input.code);
}
export const RemoteDesktopViewerMessage = z.union([
  DesktopNativeCodecFallback,
  DesktopNativeFormatAck,
  DesktopNativeAudioControl,
  DesktopMediaRequest,
  DesktopNativeVideoAck,
  DesktopMediaSignal,
  DesktopMediaFallback,
  DesktopMediaFeedback,
  DesktopQuality,
  DesktopClipboardGrant,
  DesktopClipboardRequest,
  z
    .object({
      type: z.literal("start"),
      machineId: z.string().min(1).max(128),
      options: DesktopOptions,
    })
    .strict(),
  z.object({ type: z.literal("control"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("sas") }).strict(),
  z.object({ type: z.literal("dismiss_lock_screen") }).strict(),
  z
    .object({
      type: z.literal("input"),
      input: RemoteDesktopInput,
      seq: z.number().int().positive(),
      frameSeq: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal("ack"), seq: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("heartbeat") }).strict(),
  z.object({ type: z.literal("release") }).strict(),
  z.object({ type: z.literal("keyframe") }).strict(),
  z.object({ type: z.literal("agent_grant"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("stop") }).strict(),
]);
export const DesktopReady = z
  .object({
    type: z.literal("ready"),
    title: z.string().max(256),
    allowInput: z.boolean(),
    width: z.number().int().positive().max(32768),
    height: z.number().int().positive().max(32768),
    backend: z.enum(["windows-gdi", "windows-dxgi", "synthetic", "linux-portal", "macos-sck"]),
    inputCapabilities: DesktopInputCapabilities.optional(),
    secureDesktop: z.boolean().optional(),
    protectedDesktop:DesktopProtectedMode.optional(),
    sharedProtected:z.literal(true).optional(),
    sharedProtectedAvailable:z.literal(true).optional(),
    lockScreenCover: z.boolean().optional(),
    imeKeys: z.boolean().optional(),
    extendedInput: z.boolean().optional(),
    virtualDisplay:z.literal(true).optional(),
    monitorLayout:DesktopMonitorLayout.optional(),
    files:z.literal(true).optional(),
    fileCheckpoints:z.literal(true).optional(),
    folders:z.literal(true).optional(),
    richClipboard:z.literal(true).optional(),
    microphone:z.literal(true).optional(),
    microphoneOpus:z.literal(true).optional(),
    nativeAudio:z.literal(true).optional(),
    nativeDatagrams:z.literal(true).optional(),
    nativeVideo: z.boolean().optional(),
    nativeCodecCandidates:z.array(DesktopNativeCodec).max(4).optional(),
    nativeVideoWindow: z.literal(3).optional(),
    nativeCodecs: z.literal(true).optional(),
    nativeAdaptive: z.literal(true).optional(),
    nativeCadence: z.literal(true).optional(),
    nativeMaxFps: z.literal(60).optional(),
    imageLane: z.literal(true).optional(),
    cursor: z.literal(true).optional(),
    allowClipboard: z.boolean().optional(),
    allowMedia: z.boolean().optional(),
    dynamicQuality: z.boolean().optional(),
    display: z
      .object({ modes: z.array(DesktopDisplaySize).min(1).max(128) })
      .strict()
      .optional(),
    image: DesktopImageSettings.optional(),
  })
  .strict()
  .refine((v) => !v.lockScreenCover || v.secureDesktop === true)
  .refine(v=>!v.protectedDesktop||(v.secureDesktop===true&&!v.lockScreenCover&&!v.virtualDisplay&&!v.allowMedia&&!v.allowClipboard&&!v.display&&!v.monitorLayout&&!v.files&&!v.richClipboard&&!v.nativeVideo&&!v.nativeAudio&&!v.microphone&&!v.nativeDatagrams));
export const DesktopFrameInfo = z
  .object({
    seq: z.number().int().positive(),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(2400),
    format: z.enum(["image/jpeg", "image/png"]),
    sourceInputSeq:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    timing: z.enum(["measured","encode-only","unavailable"]).optional(),
    captureMs: z.number().finite().min(0).max(60000),
    encodeMs: z.number().finite().min(0).max(60000),
    contentId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    update: z
      .discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("patch"),
            baseSeq: z.number().int().positive(),
            patches: z
              .array(
                z
                  .object({
                    x: z.number().int().min(0),
                    y: z.number().int().min(0),
                    width: z.number().int().positive(),
                    height: z.number().int().positive(),
                    offset: z.number().int().min(0),
                    length: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1)
              .max(8),
          })
          .strict(),
        z.object({ kind: z.literal("unchanged"), baseSeq: z.number().int().positive() }).strict(),
      ])
      .optional(),
    sourceCpuMs: z.number().finite().min(0).optional(),
    sourceMemoryBytes: z.number().finite().min(0).optional(),
  })
  .strict()
  .refine((v) => v.width * v.height <= 8_000_000);
export type DesktopFrameInfo = z.infer<typeof DesktopFrameInfo>;
export const DesktopStartParams = z
  .object({
    url: z.string().url().max(2048),
    ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    microphoneTicket:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    fileTicket:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    clipboardTicket:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    imageTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    videoTicket: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
    options: DesktopOptions,
  })
  .strict();
export const DesktopPermissions = z.object({
  enabled: z.boolean(),
  allowInput: z.boolean(),
  allowClipboard: z.boolean(),
  allowSystemAudio: z.boolean().optional(),
  allowMicrophone: z.boolean().optional(),
  microphoneEndpoint: z.string().max(512).refine(v=>!v.includes("\0")).optional(),
  allowDisplayResize: z.boolean(),
  allowUnlock: z.boolean().optional(),
  allowMonitors:z.boolean().optional(),
  allowVirtualDisplay:z.boolean().optional(),
  allowElevated:z.boolean().optional(),
  fileRoot: z.string().max(4096).refine(v=>!v.includes("\0")).optional(),
}).strict();
export type DesktopPermissions = z.infer<typeof DesktopPermissions>;
export interface DesktopSettingsResult {
  nativePlatform?:import("./desktopNativePlatform.js").DesktopNativePlatform;
  setupMessage?:string;
  permissions: DesktopPermissions;
  supported: boolean;
  canConfigure: boolean;
}
export const DesktopMethods = {
  "desktop.settings.get": z.object({}).strict(),
  "desktop.settings.set": DesktopPermissions,
  "desktop.capabilities": z.object({}).strict(),
  "desktop.start": DesktopStartParams,
  "desktop.agent.attach": z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
  "desktop.agent.observe": z
    .object({
      leaseId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      afterFrameSeq: z.number().int().positive().optional(),
    })
    .strict(),
  "desktop.agent.act": z
    .object({
      leaseId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      observationId: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      inputs: z.array(RemoteDesktopInput).min(1).max(32),
    })
    .strict(),
  "desktop.agent.release": z.object({ leaseId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
};
export interface DesktopResults {
  "desktop.settings.get": DesktopSettingsResult;
  "desktop.settings.set": DesktopSettingsResult;
  "desktop.capabilities": {
    endpointRequired?:boolean;
    available: boolean;
    allowInput: boolean;
    deltas?: boolean;
    imageSettings?: boolean;
    imeKeys?: boolean;
    extendedInput?: boolean;
    monitors?:boolean;
    virtualDisplay?:boolean;
    elevatedDesktop?:boolean;
    nativePlatform?:import("./desktopNativePlatform.js").DesktopNativePlatform;
    sharedDesktop?:boolean;
    sharedCursor?:boolean;
    sharedClipboard?:boolean;
    sharedFiles?:boolean;
    sharedMicrophone?:boolean;
    sharedProtected?:boolean;
    sharedNative?:boolean;
    sharedDatagrams?:boolean;
    sharedAudio?:boolean;
    sharedRate?:boolean;
    sharedResolution?:boolean;
    files?: boolean;
    fileCheckpoints?:boolean;
    folders?:boolean;
    richClipboard?: boolean;
    microphone?: boolean;
    microphoneOpus?: boolean;
    nativeAudio?: boolean;
    nativeDatagrams?: boolean;
    nativeVideo?: boolean;
    nativeVideoWindow?: 3;
    nativeCodecs?: boolean;
    nativeAdaptive?: boolean;
    nativeCadence?: boolean;
    nativeMaxFps?: 60;
    cursor?: boolean;
    features?: boolean;
    displayResize?: boolean;
  };
  "desktop.start": { started: true };
  "desktop.agent.attach": { leaseId: string; expiresAt: number };
  "desktop.agent.observe": {
    observationId: string;
    frameSeq: number;
    width: number;
    height: number;
    format: "image/jpeg" | "image/png";
    imageBase64: string;
    latestFrameMaxAgeMs: number;
  };
  "desktop.agent.act": { acknowledged: number; afterFrameSeq: number };
  "desktop.agent.release": { released: true };
}

/** Binary network frame: u16 header length, bounded JSON metadata, image bytes. */
export function encodeDesktopFrame(info: DesktopFrameInfo, image: Uint8Array): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(DesktopFrameInfo.parse(info)));
  if (
    (image.byteLength === 0 && info.update?.kind !== "unchanged") ||
    image.byteLength > DESKTOP_MAX_FRAME_BYTES ||
    header.length > 2048
  )
    throw new Error("desktop frame limit");
  const out = new Uint8Array(2 + header.length + image.byteLength);
  new DataView(out.buffer).setUint16(0, header.length);
  out.set(header, 2);
  out.set(image, header.length + 2);
  return out;
}
export function decodeDesktopFrame(bytes: Uint8Array): {
  info: DesktopFrameInfo;
  image: Uint8Array;
} {
  if (bytes.byteLength < 3 || bytes.byteLength > DESKTOP_MAX_FRAME_BYTES + 2050)
    throw new Error("desktop frame limit");
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0);
  if (n < 2 || n > 2048 || n + 2 > bytes.byteLength) throw new Error("desktop frame header");
  const info = DesktopFrameInfo.parse(
    JSON.parse(new TextDecoder().decode(bytes.subarray(2, n + 2))),
  );
  const image = bytes.subarray(n + 2);
  if (info.update && !info.contentId) throw new Error("desktop update content id");
  if (info.update?.kind === "unchanged") {
    if (image.length) throw new Error("desktop unchanged payload");
  } else if (info.update?.kind === "patch") {
    let end = 0,
      pixels = 0;
    if (info.format !== "image/png") throw new Error("desktop patch format");
    for (const [index, p] of info.update.patches.entries()) {
      pixels += p.width * p.height;
      if (
        pixels > info.width * info.height ||
        info.update.patches
          .slice(0, index)
          .some(
            (q) =>
              p.x < q.x + q.width &&
              q.x < p.x + p.width &&
              p.y < q.y + q.height &&
              q.y < p.y + p.height,
          )
      )
        throw new Error("desktop overlapping patches");
      if (
        p.x + p.width > info.width ||
        p.y + p.height > info.height ||
        p.offset !== end ||
        p.length > image.length - end ||
        !imageMatches(
          { ...info, width: p.width, height: p.height },
          image.subarray(p.offset, p.offset + p.length),
        )
      )
        throw new Error("desktop patch dimensions");
      end += p.length;
    }
    if (end !== image.length) throw new Error("desktop patch payload");
  } else if (!imageMatches(info, image)) throw new Error("desktop image dimensions");
  return { info, image };
}
function imageMatches(info: DesktopFrameInfo, b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (info.format === "image/png")
    return (
      b.length >= 24 &&
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a &&
      view.getUint32(12) === 0x49484452 &&
      view.getUint32(16) === info.width &&
      view.getUint32(20) === info.height
    );
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i++] !== 0xff) return false;
    while (b[i] === 0xff) i++;
    const marker = b[i++]!;
    if (marker === 0xda || marker === 0xd9 || i + 2 > b.length) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const len = view.getUint16(i);
    if (len < 2 || i + len > b.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return (
        len >= 8 && view.getUint16(i + 3) === info.height && view.getUint16(i + 5) === info.width
      );
    i += len;
  }
  return false;
}

/** Ordered reliable stream: reject deltas without their exact base, including size/content changes. */
export class DesktopFrameChain {
  last: DesktopFrameInfo | undefined;
  accept(info: DesktopFrameInfo): void {
    const prev = this.last;
    if (prev && info.seq <= prev.seq) throw new Error("desktop frame order");
    if (
      info.update &&
      (!prev ||
        info.update.baseSeq !== prev.seq ||
        info.width !== prev.width ||
        info.height !== prev.height ||
        !info.contentId ||
        !prev.contentId)
    )
      throw new Error("desktop frame base");
    if (info.update?.kind === "unchanged" && info.contentId !== prev?.contentId)
      throw new Error("desktop unchanged content");
    this.last = info;
  }
}
