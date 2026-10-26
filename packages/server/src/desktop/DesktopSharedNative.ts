import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DesktopNativeCodec, desktopCodecMatches } from "@sodashitsu/protocol";
import { DesktopNativeHelperFrame } from "./DesktopNativeVideo.js";

const Start = z.object({
  type: z.literal("native_video"), enabled: z.boolean(), id: z.string().uuid(),
  codec: DesktopNativeCodec.optional(), bitrateKbps: z.number().int().min(128).max(12000).optional(),
  fps: z.number().int().min(1).max(60).optional(), window: z.literal(3).optional(),
}).strict();
type Consumer = { id: string; seq: number; pending: number[]; window: 1 | 3; needsKey: boolean };

/** One encoder and independent decoder credit. A missed reference frame requires a
 * future random-access unit; frames captured before a viewer joined are not replayed.
 */
export class DesktopSharedNative<T extends object> {
  private consumers = new Map<T, Consumer>();
  private source: { id: string; key: string; requested: z.infer<typeof DesktopNativeCodec>; fallback?: "encoder"|"unavailable"; seq: number; timestamp: number; keyframeAt: number; codec?: string; family?: z.infer<typeof DesktopNativeCodec>; width?: number; height?: number } | undefined;
  constructor(private hooks: {
    window?: 1 | 3;
    now?(): number;
    write(value: unknown): void;
    send(member: T, value: unknown): void;
    policy(active: boolean): void;
  }) {}

  command(member: T, raw: unknown): boolean {
    const value = raw as { type: string; id?: string; seq?: number };
    if (value.type === "native_video") {
      const start = Start.parse(raw);
      if (!start.enabled) { if (this.consumers.get(member)?.id === start.id) this.detach(member); return true; }
      if (start.fps === undefined || start.bitrateKbps === undefined) throw Error("Missing native source limits");
      this.detach(member);
      const key = JSON.stringify({ fps: start.fps, bitrateKbps: start.bitrateKbps, codec: start.codec ?? "h264" });
      if (this.source && this.source.key !== key) {
        this.hooks.send(member, { type: "native_video_stopped", id: start.id });
        return true;
      }
      this.consumers.set(member, { id: start.id, seq: 0, pending: [], window: start.window ?? 1, needsKey: true });
      if (!this.source) {
        const id = randomUUID();
        this.source = { id, key, requested:start.codec??"h264", seq: 0, timestamp: -1, keyframeAt: -Infinity };
        this.hooks.policy(true);
        const { window: _window, ...configuration } = start;
        this.hooks.write({ ...configuration, id, ...(this.hooks.window === 3 ? { window: 3 } : {}) });
      }
      return true;
    }
    if (value.type === "native_keyframe") {
      const consumer=this.consumers.get(member),source=this.source;
      if(consumer&&value.id===consumer.id&&source){
        consumer.needsKey=true;
        const now=this.hooks.now?.()??performance.now();
        if(now-source.keyframeAt>=100){source.keyframeAt=now;this.hooks.write({type:"native_keyframe",id:source.id});}
      }
      return true;
    }
    if (value.type === "native_video_ack") {
      const consumer = this.consumers.get(member);
      if (!consumer || value.id !== consumer.id) return true;
      if (value.seq !== consumer.pending[0]) throw Error("Shared native ACK order");
      consumer.pending.shift();
      return true;
    }
    return false;
  }

  receive(raw: unknown): boolean {
    const value = raw as { type: string; id?: string };
    if (value.type !== "native_frame" && value.type !== "native_video_stopped") return false;
    const source = this.source;
    if (!source || value.id !== source.id) return true;
    if (value.type === "native_video_stopped") {
      const members = [...this.consumers];
      this.consumers.clear(); this.source = undefined;
      this.hooks.policy(false);
      for (const [member, consumer] of members) this.hooks.send(member, { type: "native_video_stopped", id: consumer.id });
      return true;
    }
    const frame = DesktopNativeHelperFrame.parse(raw);
    if ((frame.generation ?? 1) !== 1 || frame.seq !== source.seq + 1 || frame.timestamp <= source.timestamp)
      throw Error("Shared native source order");
    const family = frame.codecName ?? "h264";
    if (!source.codec) {
      if (!frame.key || !frame.codec || !desktopCodecMatches(family, frame.codec)) throw Error("Missing shared random-access configuration");
      if(family!==source.requested&&(family!=="h264"||!frame.codecFallback))throw Error("Unexpected shared codec fallback");
      if(frame.codecFallback)source.fallback=frame.codecFallback;
      source.codec = frame.codec; source.family = family; source.width = frame.width; source.height = frame.height;
    } else if (family !== source.family || (frame.codec && frame.codec !== source.codec) || frame.width !== source.width || frame.height !== source.height)
      throw Error("Shared encoder format changed");
    source.seq = frame.seq; source.timestamp = frame.timestamp;
    for (const [member, consumer] of [...this.consumers]) {
      if (consumer.pending.length >= consumer.window) { consumer.needsKey = true; continue; }
      if (consumer.needsKey) {
        if (!frame.key || consumer.pending.length) continue;
        consumer.needsKey = false;
      }
      const seq = ++consumer.seq;
      consumer.pending.push(seq);
      this.hooks.send(member, { ...frame, id: consumer.id, seq, ...(frame.key ? { codec: source.codec } : {}), ...(source.fallback?{codecFallback:source.fallback}:{}) });
    }
    if (this.source === source) this.hooks.write({ type: "native_video_ack", id: source.id, seq: frame.seq });
    return true;
  }

  detach(member: T): void {
    if (!this.consumers.delete(member) || this.consumers.size || !this.source) return;
    const source = this.source;
    this.source = undefined;
    this.hooks.write({ type: "native_video", enabled: false, id: source.id });
    this.hooks.policy(false);
  }
  dispose(): void {
    for (const member of [...this.consumers.keys()]) this.detach(member);
  }
}
