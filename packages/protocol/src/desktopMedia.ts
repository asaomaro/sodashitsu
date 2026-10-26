import { z } from "zod";
export const DESKTOP_CLIPBOARD_LIMIT = 8192;
export const DESKTOP_MEDIA_CHUNK_LIMIT = 512 * 1024;
export const DesktopIceServers = z
  .array(
    z
      .object({
        urls: z.union([
          z.string().regex(/^(stun|stuns|turn|turns):[^\s]{1,1024}$/),
          z
            .array(z.string().regex(/^(stun|stuns|turn|turns):[^\s]{1,1024}$/))
            .min(1)
            .max(4),
        ]),
        username: z.string().max(256).optional(),
        credential: z.string().max(1024).optional(),
      })
      .strict(),
  )
  .max(4);
export const DesktopMediaSettings = z
  .object({
    udp: z.boolean().optional(),
    fps: z.number().int().min(1).max(60).optional(),
    audio: z.boolean().default(false),
    transport: z.enum(["auto", "relay", "native"]).default("auto"),
    adaptive: z.boolean().default(true),
    maxBitrateKbps: z.number().int().min(128).max(12000).default(2500),
  })
  .strict();
export type DesktopMediaSettings = z.infer<typeof DesktopMediaSettings>;
export const DesktopRtcSignal = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["offer", "answer"]), sdp: z.string().min(1).max(24576) }).strict(),
  z
    .object({
      kind: z.literal("candidate"),
      candidate: z
        .object({
          candidate: z.string().max(2048),
          sdpMid: z.string().max(32).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(16).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);
export const DesktopMediaRequest = z
  .object({
    type: z.literal("media"),
    enabled: z.boolean(),
    settings: DesktopMediaSettings.optional(),
  })
  .strict();
export const DesktopMediaSignal = z
  .object({ type: z.literal("rtc_signal"), id: z.string().uuid(), signal: DesktopRtcSignal })
  .strict();
export const DesktopMediaFallback = z
  .object({ type: z.literal("media_fallback"), id: z.string().uuid() })
  .strict();
export const DesktopMediaFeedback = z
  .object({
    type: z.literal("media_feedback"),
    id: z.string().uuid(),
    bufferedMs: z.number().finite().min(0).max(30000),
    congested: z.boolean(),
  })
  .strict();
export const DesktopQuality = z
  .object({
    type: z.literal("quality"),
    fps: z.number().int().min(1).max(30),
    quality: z.number().int().min(20).max(90),
  })
  .strict();
export const DesktopClipboardGrant = z
  .object({ type: z.literal("clipboard_grant"), enabled: z.boolean() })
  .strict();
export const DesktopClipboardRequest = z.discriminatedUnion("operation", [
  z
    .object({
      type: z.literal("clipboard"),
      id: z.number().int().positive(),
      operation: z.literal("read"),
    })
    .strict(),
  z
    .object({
      type: z.literal("clipboard"),
      id: z.number().int().positive(),
      operation: z.literal("write"),
      text: z.string().max(DESKTOP_CLIPBOARD_LIMIT),
    })
    .strict(),
]);
export const DesktopClipboardResult = z
  .object({
    type: z.literal("clipboard_result"),
    id: z.number().int().positive(),
    ok: z.boolean(),
    text: z.string().max(DESKTOP_CLIPBOARD_LIMIT).optional(),
  })
  .strict();
export const DesktopMediaStatus = z
  .object({
    type: z.literal("media_status"),
    id: z.string().uuid(),
    state: z.enum(["waiting", "negotiating", "rtc", "relay", "native", "images"]),
    audio: z.boolean(),
    reason: z.enum(["requested", "stopped", "unavailable", "congested", "ended"]).optional(),
    iceServers: DesktopIceServers.optional(),
    datagrams: z.literal(true).optional(),
    nativeAudio:z.literal(true).optional(),
  })
  .strict();
export const DesktopMediaStream = z.union([
  z
    .object({
      type: z.literal("media_stream"),
      id: z.string().uuid(),
      generation: z.number().int().min(1).max(0xffffffff),
      mime: z.enum(["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("media_stream"),
      id: z.string().uuid(),
      generation: z.number().int().min(1).max(0xffffffff),
      mime: z.literal("video/h264"),
      baseSeq:z.number().int().min(0).max(0xffffffff-1).optional(),
      datagrams: z.literal(true).optional(),
      window: z.literal(3).optional(),
      codec: z.string().regex(/^avc1\.[0-9a-f]{6}$/),
      width: z.number().int().min(2).max(4096),
      height: z.number().int().min(2).max(2400),
    })
    .strict()
    .refine((v) => v.width * v.height <= 8_000_000),
]);
export const DESKTOP_NATIVE_RATE_PROTOCOL = "soda-desktop-native-rate-v1";
export const DESKTOP_VIDEO_LANE_PROTOCOL = "soda-desktop-video-lane-v1";
export const DESKTOP_NATIVE_VIDEO_PROTOCOL = "soda-desktop-native-video-v1";
export const DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL = "soda-desktop-native-video-v2";
export const DesktopNativeVideoAck = z
  .object({
    type: z.literal("native_video_ack"),
    decodeMs: z.number().finite().min(0).max(60000).optional(),
    dropped: z.literal(true).optional(),
    id: z.string().uuid(),
    generation: z.number().int().min(1).max(0xffffffff),
    seq: z.number().int().min(1).max(0xffffffff),
  })
  .strict();
export const DesktopNativeVideoStats = z
  .object({
    type: z.literal("native_video_stats"),
    id: z.string().uuid(),
    width: z.number().int().min(2).max(4096),
    height: z.number().int().min(2).max(2400),
    captureMs: z.number().finite().min(0).max(60000),
    conversionMs: z.number().finite().min(0).max(60000),
    encodeMs: z.number().finite().min(0).max(60000),
    ackMs: z.number().finite().min(0).max(60000),
    decodeMs: z.number().finite().min(0).max(60000),
    pending: z.number().int().min(0).max(3),
    window: z.literal(3),
  })
  .strict();
export type DesktopNativeVideoStats = z.infer<typeof DesktopNativeVideoStats>;
/** One complete Annex-B access unit. One packet may be outstanding until draw ACK. */
export function encodeDesktopH264Packet(
  timestamp: number,
  key: boolean,
  data: Uint8Array,
): Uint8Array {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !data.length ||
    data.length > DESKTOP_MEDIA_CHUNK_LIMIT - 9
  )
    throw Error("native video packet limit");
  const out = new Uint8Array(9 + data.length);
  out[0] = key ? 1 : 0;
  new DataView(out.buffer).setFloat64(1, timestamp);
  out.set(data, 9);
  return out;
}
export function decodeDesktopH264Packet(bytes: Uint8Array) {
  if (bytes.length <= 9 || bytes.length > DESKTOP_MEDIA_CHUNK_LIMIT || bytes[0]! > 1)
    throw Error("native video packet limit");
  const timestamp = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(1);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw Error("native video timestamp");
  return { timestamp, key: bytes[0] === 1, data: bytes.subarray(9) };
}
export const DesktopCompanionMessage = z.union([
  z
    .object({
      type: z.literal("started"),
      id: z.string().uuid(),
      width: z.number().int().min(1).max(16384),
      height: z.number().int().min(1).max(16384),
      surface: z.literal("monitor"),
      audio: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("media_state"),
      id: z.string().uuid(),
      state: z.enum(["rtc", "relay", "ended"]),
    })
    .strict(),
  DesktopMediaSignal,
  DesktopMediaStream.refine((v) => v.mime !== "video/h264"),
  z.object({ type: z.literal("heartbeat") }).strict(),
]);
const magic = [83, 68, 77, 49];
export function isDesktopMediaChunk(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && magic.every((v, i) => bytes[i] === v);
}
export function encodeDesktopMediaChunk(
  generation: number,
  seq: number,
  data: Uint8Array,
): Uint8Array {
  if (
    !Number.isInteger(generation) ||
    generation < 1 ||
    generation > 0xffffffff ||
    !Number.isInteger(seq) ||
    seq < 1 ||
    seq > 0xffffffff ||
    !data.length ||
    data.length > DESKTOP_MEDIA_CHUNK_LIMIT
  )
    throw Error("media chunk limit");
  const out = new Uint8Array(12 + data.length);
  out.set(magic);
  const d = new DataView(out.buffer);
  d.setUint32(4, generation);
  d.setUint32(8, seq);
  out.set(data, 12);
  return out;
}
export function decodeDesktopMediaChunk(bytes: Uint8Array) {
  if (
    !isDesktopMediaChunk(bytes) ||
    bytes.length <= 12 ||
    bytes.length > DESKTOP_MEDIA_CHUNK_LIMIT + 12
  )
    throw Error("media chunk limit");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    generation = d.getUint32(4),
    seq = d.getUint32(8);
  if (!generation || !seq) throw Error("media chunk sequence");
  return { generation, seq, data: bytes.subarray(12) };
}
