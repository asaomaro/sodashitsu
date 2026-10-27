import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  DesktopNativeCodec,
  DesktopNativeCodecString,
  desktopCodecMatches,
} from "@sodashitsu/protocol";
import { DesktopNativeHelperFrame } from "./DesktopNativeVideo.js";

const Start = z
  .object({
    type: z.literal("native_video"),
    enabled: z.boolean(),
    id: z.string().uuid(),
    codec: DesktopNativeCodec.optional(),
    bitrateKbps: z.number().int().min(128).max(12000).optional(),
    adaptive: z.boolean().optional(),
    resolution: z.boolean().optional(),
    fps: z.number().int().min(1).max(60).optional(),
    window: z.literal(3).optional(),
  })
  .strict();
type Size = { width: number; height: number };
type Consumer = {
  adaptive: boolean;
  resizable: boolean;
  desired?: Size;
  commitSeq?: number;
  generation: number;
  maximum: { fps: number; kbps: number };
  rate: { fps: number; kbps: number };
  id: string;
  seq: number;
  pending: number[];
  window: 1 | 3;
  needsKey: boolean;
  profile?: { generation: number; applied: boolean; resumed: boolean };
};
type Profile<T> = Size & {
  generation: number;
  waiting: Set<T>;
  applied: boolean;
  baseSeq?: number;
  timer?: ReturnType<typeof setTimeout>;
};
type Source<T> = {
  rate: { fps: number; kbps: number };
  id: string;
  key: string;
  requested: z.infer<typeof DesktopNativeCodec>;
  fallback?: "encoder" | "unavailable";
  seq: number;
  timestamp: number;
  keyframeAt: number;
  keyTimer?: ReturnType<typeof setTimeout>;
  codec?: string;
  family?: z.infer<typeof DesktopNativeCodec>;
  width?: number;
  height?: number;
  maximum?: Size;
  generation: number;
  profile?: Profile<T>;
  drawing?: Set<T>;
  drawTimer?: ReturnType<typeof setTimeout>;
  settling?: boolean;
  settleTimer?: ReturnType<typeof setTimeout>;
};

/** One encoder with independent decoder credit and format generations. Fixed
 * viewers keep the initial dimensions; a resize waits only for finite ACKs. */
export class DesktopSharedNative<T extends object> {
  private consumers = new Map<T, Consumer>();
  private source: Source<T> | undefined;
  constructor(
    private hooks: {
      window?: 1 | 3;
      adaptive?: boolean;
      now?(): number;
      write(value: unknown): void;
      send(member: T, value: unknown): void;
      policy(active: boolean): void;
      sourceStopped?(): void;
    },
  ) {}
  command(member: T, raw: unknown): boolean {
    const value = raw as { type: string; id?: string; seq?: number; dropped?: boolean };
    if (value.type === "native_video") {
      const start = Start.parse(raw);
      if (!start.enabled) {
        if (this.consumers.get(member)?.id === start.id) this.detach(member);
        return true;
      }
      if (
        start.fps === undefined ||
        start.bitrateKbps === undefined ||
        (start.resolution && !this.hooks.adaptive)
      )
        throw Error("Missing native source limits");
      this.detach(member);
      const key = JSON.stringify({
        fps: start.fps,
        bitrateKbps: start.bitrateKbps,
        codec: start.codec ?? "h264",
      });
      if (this.source && this.source.key !== key) {
        this.hooks.send(member, { type: "native_video_stopped", id: start.id });
        return true;
      }
      this.consumers.set(member, {
        adaptive: start.adaptive === true,
        resizable: start.resolution === true,
        generation: 1,
        maximum: { fps: start.fps, kbps: start.bitrateKbps },
        rate: { fps: start.fps, kbps: start.bitrateKbps },
        id: start.id,
        seq: 0,
        pending: [],
        window: start.window ?? 1,
        needsKey: true,
      });
      if (!this.source) {
        const id = randomUUID();
        this.source = {
          rate: { fps: start.fps, kbps: start.bitrateKbps },
          id,
          key,
          requested: start.codec ?? "h264",
          seq: 0,
          timestamp: -1,
          keyframeAt: -Infinity,
          generation: 1,
        };
        this.hooks.policy(true);
        const {
          adaptive: _adaptive,
          resolution: _resolution,
          window: _window,
          ...configuration
        } = start;
        this.hooks.write({
          ...configuration,
          id,
          ...(this.hooks.window === 3 ? { window: 3 } : {}),
        });
      }
      this.rate();
      this.resize();
      return true;
    }
    if (value.type === "native_resolution") {
      const consumer = this.consumers.get(member),
        source = this.source;
      if (!consumer || value.id !== consumer.id || !consumer.resizable || !source?.maximum)
        return true;
      const size = z
        .object({
          type: z.literal("native_resolution"),
          id: z.string().uuid(),
          width: z.number().int().min(2).max(8192),
          height: z.number().int().min(2).max(8192),
        })
        .strict()
        .parse(raw);
      if (
        size.width % 2 ||
        size.height % 2 ||
        size.width > source.maximum.width ||
        size.height > source.maximum.height ||
        Math.abs(size.width / size.height - source.maximum.width / source.maximum.height) > 0.02
      )
        throw Error("Shared resolution limits");
      consumer.desired = { width: size.width, height: size.height };
      this.resize();
      return true;
    }
    if (value.type === "native_profile_resume") {
      const consumer = this.consumers.get(member),
        source = this.source,
        p = source?.profile;
      if (!consumer || value.id !== consumer.id || !source || !p) return true;
      const ack = z
        .object({
          type: z.literal("native_profile_resume"),
          id: z.string().uuid(),
          generation: z.number().int(),
          baseSeq: z.number().int(),
        })
        .strict()
        .parse(raw);
      if (
        !p.applied ||
        !consumer.profile?.applied ||
        consumer.profile.resumed ||
        ack.generation !== consumer.generation ||
        ack.baseSeq !== consumer.seq ||
        consumer.pending.length
      )
        throw Error("Shared format ACK");
      consumer.profile.resumed = true;
      p.waiting.delete(member);
      this.resume(source, p);
      return true;
    }
    if (value.type === "native_rate" || value.type === "native_bitrate") {
      const consumer = this.consumers.get(member);
      if (!consumer || value.id !== consumer.id || !consumer.adaptive) return true;
      const change = z
        .object({
          type: z.enum(["native_rate", "native_bitrate"]),
          id: z.string().uuid(),
          fps: z.number().int().min(1).max(60).optional(),
          kbps: z.number().int().min(128).max(12000),
        })
        .strict()
        .parse(raw);
      if (change.type === "native_rate" && change.fps === undefined)
        throw Error("Missing shared cadence");
      if (
        (change.fps ?? consumer.rate.fps) > consumer.maximum.fps ||
        change.kbps > consumer.maximum.kbps
      )
        throw Error("Shared rate exceeds requested limits");
      consumer.rate = { fps: change.fps ?? consumer.rate.fps, kbps: change.kbps };
      this.rate();
      return true;
    }
    if (value.type === "native_keyframe") {
      const consumer = this.consumers.get(member),
        source = this.source;
      if (consumer && value.id === consumer.id && source) {
        consumer.needsKey = true;
        this.keyframe(source);
      }
      return true;
    }
    if (value.type === "native_video_ack") {
      const consumer = this.consumers.get(member);
      if (!consumer || value.id !== consumer.id) return true;
      if (value.seq !== consumer.pending[0]) throw Error("Shared native ACK order");
      consumer.pending.shift();
      if (value.dropped !== undefined && value.dropped !== true) throw Error("Shared dropped ACK");
      if (consumer.commitSeq === value.seq) {
        delete consumer.commitSeq;
        const source = this.source;
        if (source?.drawing) {
          if (value.dropped) {
            consumer.needsKey = true;
            this.keyframe(source);
          } else {
            source.drawing.delete(member);
            this.drawn(source);
          }
        }
      }
      if (
        !consumer.pending.length &&
        this.source?.drawing?.has(member) &&
        consumer.commitSeq === undefined
      )
        this.keyframe(this.source);
      this.applied(member, consumer);
      return true;
    }
    return false;
  }
  receive(raw: unknown): boolean {
    const value = raw as { type: string; id?: string };
    if (!["native_frame", "native_video_stopped", "native_profile_applied"].includes(value.type))
      return false;
    const source = this.source;
    if (!source || value.id !== source.id) return true;
    if (value.type === "native_video_stopped") {
      this.finish(source, false);
      return true;
    }
    if (value.type === "native_profile_applied") {
      const p = source.profile,
        applied = z
          .object({
            type: z.literal("native_profile_applied"),
            id: z.string().uuid(),
            generation: z.number().int(),
            baseSeq: z.number().int(),
            width: z.number().int(),
            height: z.number().int(),
            codec: DesktopNativeCodecString,
          })
          .strict()
          .parse(raw);
      if (
        !p ||
        p.applied ||
        applied.generation !== p.generation ||
        applied.baseSeq !== source.seq ||
        applied.width !== p.width ||
        applied.height !== p.height ||
        !desktopCodecMatches(source.family ?? "h264", applied.codec)
      )
        throw Error("Shared profile barrier");
      p.applied = true;
      p.baseSeq = applied.baseSeq;
      source.generation = p.generation;
      source.width = p.width;
      source.height = p.height;
      source.codec = applied.codec;
      for (const [member, consumer] of [...this.consumers]) this.applied(member, consumer);
      this.resume(source, p);
      return true;
    }
    const frame = DesktopNativeHelperFrame.parse(raw);
    if (
      (frame.generation ?? 1) !== source.generation ||
      frame.seq !== source.seq + 1 ||
      frame.timestamp <= source.timestamp ||
      source.profile?.applied
    )
      throw Error("Shared native source order");
    const family = frame.codecName ?? "h264";
    if (!source.codec) {
      if (!frame.key || !frame.codec || !desktopCodecMatches(family, frame.codec))
        throw Error("Missing shared random-access configuration");
      if (family !== source.requested && (family !== "h264" || !frame.codecFallback))
        throw Error("Unexpected shared codec fallback");
      if (frame.codecFallback) source.fallback = frame.codecFallback;
      source.codec = frame.codec;
      source.family = family;
      source.width = frame.width;
      source.height = frame.height;
      source.maximum = { width: frame.width, height: frame.height };
    } else if (
      family !== source.family ||
      (frame.codec && frame.codec !== source.codec) ||
      frame.width !== source.width ||
      frame.height !== source.height
    )
      throw Error("Shared encoder format changed");
    const held = source.settling === true;
    if (held && !frame.key) throw Error("Shared profile requires held IDR");
    source.seq = frame.seq;
    source.timestamp = frame.timestamp;
    if (!source.profile)
      for (const [member, consumer] of [...this.consumers]) {
        if (
          consumer.seq === 0 &&
          (held || (consumer.desired ?? source.maximum!).width > source.width!)
        ) {
          consumer.needsKey = true;
          continue;
        }
        if (consumer.pending.length >= consumer.window) {
          consumer.needsKey = true;
          continue;
        }
        if (consumer.needsKey) {
          if (!frame.key || consumer.pending.length) continue;
          consumer.needsKey = false;
        }
        const seq = ++consumer.seq;
        consumer.pending.push(seq);
        if (held || (source.drawing?.has(member) && consumer.commitSeq === undefined)) {
          consumer.commitSeq = seq;
          (source.drawing ??= new Set()).add(member);
        }
        this.hooks.send(member, {
          ...frame,
          id: consumer.id,
          seq,
          generation: consumer.generation,
          ...(frame.key ? { codec: source.codec } : {}),
          ...(source.fallback ? { codecFallback: source.fallback } : {}),
        });
      }
    if (this.source === source) {
      this.hooks.write({ type: "native_video_ack", id: source.id, seq: frame.seq });
      if (held) {
        clearTimeout(source.settleTimer);
        delete source.settleTimer;
        delete source.settling;
        this.rate();
        if (source.drawing?.size) {
          source.drawTimer = setTimeout(() => {
            if (this.source !== source || !source.drawing) return;
            for (const member of [...source.drawing]) {
              const consumer = this.consumers.get(member);
              if (!consumer) continue;
              this.detach(member);
              this.hooks.send(member, { type: "native_video_stopped", id: consumer.id });
            }
          }, 2000);
          source.drawTimer.unref();
        } else this.drawn(source);
        if (
          this.source === source &&
          !source.profile &&
          [...this.consumers.values()].some(
            (c) => c.seq === 0 && (c.desired ?? source.maximum!).width <= source.width!,
          )
        ) {
          this.keyframe(source);
        }
      }
    }
    return true;
  }
  private resize() {
    const source = this.source;
    if (
      !source?.maximum ||
      source.profile ||
      source.settling ||
      source.drawing?.size ||
      !this.consumers.size ||
      source.generation >= 0xffffffff
    )
      return;
    const requests = [...this.consumers.values()].map((c) =>
      c.resizable ? (c.desired ?? source.maximum!) : source.maximum!,
    );
    const target = requests.reduce((max, size) => (size.width > max.width ? size : max));
    if (target.width === source.width && target.height === source.height) return;
    const p: Profile<T> = {
      ...target,
      generation: source.generation + 1,
      waiting: new Set(),
      applied: false,
    };
    source.profile = p;
    p.timer = setTimeout(() => {
      if (this.source !== source || source.profile !== p) return;
      if (!p.applied) {
        this.finish(source, true);
        return;
      }
      for (const member of [...p.waiting]) {
        const consumer = this.consumers.get(member);
        if (!consumer) continue;
        this.detach(member);
        this.hooks.send(member, { type: "native_video_stopped", id: consumer.id });
      }
      this.resume(source, p);
    }, 2000);
    p.timer.unref();
    for (const [member, consumer] of [...this.consumers]) {
      consumer.needsKey = true;
      if (!consumer.seq) continue;
      if (!consumer.resizable || consumer.generation >= 0xffffffff) {
        this.finish(source, true);
        return;
      }
      p.waiting.add(member);
      consumer.profile = { generation: consumer.generation + 1, applied: false, resumed: false };
      this.hooks.send(member, {
        type: "native_profile_prepare",
        id: consumer.id,
        generation: consumer.profile.generation,
        ...target,
      });
    }
    if (this.source === source && source.profile === p)
      this.hooks.write({
        type: "native_profile",
        id: source.id,
        generation: p.generation,
        ...target,
        fps: source.rate.fps,
        bitrateKbps: source.rate.kbps,
      });
  }
  private applied(member: T, consumer: Consumer) {
    const source = this.source,
      p = source?.profile,
      profile = consumer.profile;
    if (
      !source ||
      !p?.applied ||
      !p.waiting.has(member) ||
      !profile ||
      profile.applied ||
      consumer.pending.length
    )
      return;
    profile.applied = true;
    consumer.generation = profile.generation;
    this.hooks.send(member, {
      type: "native_profile_applied",
      id: consumer.id,
      generation: consumer.generation,
      baseSeq: consumer.seq,
      width: p.width,
      height: p.height,
      codec: source.codec,
    });
  }
  private resume(source: Source<T>, p: Profile<T>) {
    if (this.source !== source || source.profile !== p || !p.applied || p.waiting.size) return;
    clearTimeout(p.timer);
    delete source.profile;
    source.settling = true;
    source.settleTimer = setTimeout(() => {
      if (this.source === source && source.settling) this.finish(source, true);
    }, 2000);
    source.settleTimer.unref();
    for (const consumer of this.consumers.values()) delete consumer.profile;
    this.hooks.write({
      type: "native_profile_resume",
      id: source.id,
      generation: p.generation,
      baseSeq: p.baseSeq,
    });
  }
  private keyframe(source: Source<T>) {
    if (this.source !== source) return;
    const now = this.hooks.now?.() ?? performance.now(),
      delay = 100 - (now - source.keyframeAt);
    if (delay <= 0) {
      clearTimeout(source.keyTimer);
      delete source.keyTimer;
      source.keyframeAt = now;
      this.hooks.write({ type: "native_keyframe", id: source.id });
    } else if (!source.keyTimer) {
      source.keyTimer = setTimeout(() => {
        delete source.keyTimer;
        if (this.source !== source) return;
        source.keyframeAt = this.hooks.now?.() ?? performance.now();
        this.hooks.write({ type: "native_keyframe", id: source.id });
      }, delay);
      source.keyTimer.unref();
    }
  }
  private drawn(source: Source<T>) {
    if (this.source !== source || source.drawing?.size) return;
    clearTimeout(source.drawTimer);
    delete source.drawTimer;
    delete source.drawing;
    this.resize();
  }
  private rate() {
    const source = this.source;
    if (!source || source.profile || source.settling || !this.consumers.size) return;
    const rates = [...this.consumers.values()].map((c) => c.rate),
      rate = {
        fps: Math.max(...rates.map((v) => v.fps)),
        kbps: Math.max(...rates.map((v) => v.kbps)),
      };
    if (rate.fps === source.rate.fps && rate.kbps === source.rate.kbps) return;
    source.rate = rate;
    this.hooks.write({ type: "native_rate", id: source.id, ...rate });
  }
  audioSource(member: T, id: string) {
    const source = this.source;
    if (!source || this.consumers.get(member)?.id !== id) return;
    return {
      id: source.id,
      timestamp: () => source.timestamp,
      active: () => this.source === source,
    };
  }
  detach(member: T): void {
    const consumer = this.consumers.get(member),
      source = this.source;
    if (!consumer || !source) return;
    this.consumers.delete(member);
    source.profile?.waiting.delete(member);
    source.drawing?.delete(member);
    if (this.consumers.size) {
      this.rate();
      if (source.profile) this.resume(source, source.profile);
      this.drawn(source);
      return;
    }
    this.finish(source, true);
  }
  private finish(source: Source<T>, stop: boolean) {
    if (this.source !== source) return;
    clearTimeout(source.profile?.timer);
    clearTimeout(source.settleTimer);
    clearTimeout(source.drawTimer);
    clearTimeout(source.keyTimer);
    const members = [...this.consumers];
    this.consumers.clear();
    this.source = undefined;
    this.hooks.sourceStopped?.();
    if (stop) this.hooks.write({ type: "native_video", enabled: false, id: source.id });
    this.hooks.policy(false);
    for (const [member, consumer] of members)
      this.hooks.send(member, { type: "native_video_stopped", id: consumer.id });
  }
  dispose(): void {
    if (this.source) this.finish(this.source, true);
  }
}
