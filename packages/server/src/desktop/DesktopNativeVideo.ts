import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  DesktopMediaSettings,
  DesktopNativeVideoAck,
  encodeDesktopMediaChunk,
  encodeDesktopH264Packet,
} from "@sodashitsu/protocol";

const HelperVideo = z
  .object({
    type: z.literal("native_frame"),
    id: z.string().uuid(),
    seq: z.number().int().min(1).max(0xffffffff),
    timestamp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    key: z.boolean(),
    codec: z
      .string()
      .regex(/^avc1\.[0-9a-f]{6}$/)
      .optional(),
    width: z.number().int().min(2).max(4096),
    height: z.number().int().min(2).max(2400),
    data: z
      .string()
      .min(4)
      .max(Math.ceil((512 * 1024 - 9) / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
/** Viewer-owned native video, independent from agent snapshots and image ACKs. */
export class DesktopNativeVideo {
  private active:
    | {
        id: string;
        seq: number;
        pending: number;
        lastAck: number;
        at: number;
        timestamp: number;
        stream: boolean;
        codec?: string;
        width?: number;
        height?: number;
      }
    | undefined;
  constructor(
    private hooks: {
      enabled: boolean;
      width: number;
      sourceWidth: number;
      sourceHeight: number;
      exact?: { width: number; height: number };
      fps: number;
      send(value: unknown): boolean;
      write(value: unknown): void;
      policy(video: boolean): void;
      buffered(): number;
    },
  ) {}
  fromViewer(raw: unknown): boolean {
    const m = raw as { type: string; enabled?: boolean; settings?: unknown };
    if (m.type === "native_video_ack") {
      const ack = DesktopNativeVideoAck.parse(raw),
        s = this.active;
      if (!s || ack.id !== s.id || ack.generation !== 1 || ack.seq <= s.lastAck) return true;
      if (ack.seq !== s.pending) throw Error("Native video ACK order");
      s.lastAck = ack.seq;
      s.pending = 0;
      this.hooks.write({ type: "native_video_ack", id: s.id, seq: ack.seq });
      return true;
    }
    if (m.type !== "media") return false;
    this.stop("stopped");
    if (!m.enabled) return false;
    const settings = DesktopMediaSettings.parse(m.settings ?? {});
    if (settings.transport !== "native") return false;
    const id = randomUUID();
    if (!this.hooks.enabled || settings.audio) {
      this.hooks.send({
        type: "media_status",
        id,
        state: "images",
        audio: false,
        reason: "unavailable",
      });
      return true;
    }
    this.active = {
      id,
      seq: 0,
      pending: 0,
      lastAck: 0,
      at: performance.now(),
      timestamp: -1,
      stream: false,
    };
    this.hooks.send({ type: "media_status", id, state: "negotiating", audio: false });
    this.hooks.policy(true);
    this.hooks.write({
      type: "native_video",
      enabled: true,
      id,
      bitrateKbps: settings.maxBitrateKbps,
      fps: this.hooks.fps,
    });
    return true;
  }
  fromHelper(raw: unknown): boolean {
    const m = raw as { type: string; id?: string };
    if (m.type !== "native_frame" && m.type !== "native_video_stopped") return false;
    const s = this.active;
    if (!s || m.id !== s.id) return true;
    if (m.type === "native_video_stopped") {
      this.stop("unavailable");
      return true;
    }
    const frame = HelperVideo.parse(raw);
    if (
      s.pending ||
      frame.seq !== s.seq + 1 ||
      frame.width > this.hooks.width ||
      frame.timestamp <= s.timestamp
    )
      throw Error("Native video frame order");
    if (
      Math.abs(frame.width / frame.height - this.hooks.sourceWidth / this.hooks.sourceHeight) >
        0.02 ||
      (this.hooks.exact &&
        (frame.width !== this.hooks.exact.width || frame.height !== this.hooks.exact.height))
    )
      throw Error("Native video dimensions");
    if (
      s.stream &&
      (frame.width !== s.width ||
        frame.height !== s.height ||
        (frame.codec && frame.codec !== s.codec))
    )
      throw Error("Native video format changed");
    if (this.hooks.buffered() > 512 * 1024) {
      this.stop("congested");
      return true;
    }
    if (!s.stream) {
      if (!frame.key || !frame.codec) throw Error("Native video requires initial SPS/IDR");
      this.hooks.send({ type: "media_status", id: s.id, state: "native", audio: false });
      this.hooks.send({
        type: "media_stream",
        id: s.id,
        generation: 1,
        mime: "video/h264",
        codec: frame.codec,
        width: frame.width,
        height: frame.height,
      });
      s.stream = true;
      s.codec = frame.codec;
      s.width = frame.width;
      s.height = frame.height;
    }
    const payload = encodeDesktopH264Packet(
      frame.timestamp,
      frame.key,
      Buffer.from(frame.data, "base64"),
    );
    s.seq = frame.seq;
    s.pending = frame.seq;
    s.timestamp = frame.timestamp;
    s.at = performance.now();
    if (!this.hooks.send(encodeDesktopMediaChunk(1, frame.seq, payload))) this.stop("congested");
    return true;
  }
  tick(now = performance.now()) {
    const s = this.active;
    if (s && now - s.at > (s.pending ? 2500 : 5000))
      this.stop(s.pending ? "congested" : "unavailable");
  }
  stop(reason: "stopped" | "unavailable" | "congested" = "stopped") {
    const s = this.active;
    if (!s) return;
    this.active = undefined;
    this.hooks.write({ type: "native_video", enabled: false, id: s.id });
    this.hooks.policy(false);
    this.hooks.write({ type: "keyframe" });
    this.hooks.write({ type: "release" });
    this.hooks.send({ type: "media_status", id: s.id, state: "images", audio: false, reason });
  }
}
