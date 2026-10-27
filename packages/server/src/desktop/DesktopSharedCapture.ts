import {DesktopSharedAudio} from "./DesktopSharedAudio.js";
import type {DesktopNativeAudioHooks,DesktopAudioLease} from "./DesktopNativeAudio.js";
import { DesktopSharedNative } from "./DesktopSharedNative.js";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { DesktopReady, DesktopFrameInfo, encodeDesktopFrame, decodeDesktopFrame, DESKTOP_MAX_FRAME_BYTES } from "@sodashitsu/protocol";

/** The subset used by DesktopProvider, for both OS children and shared subscriptions. */
export interface DesktopHelper extends EventEmitter {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  createAudio?(hooks:DesktopNativeAudioHooks):DesktopAudioLease;
  requestControl?(enabled: boolean): boolean;
}

type Subscription = DesktopHelper & {
  configured: boolean;
  pending: number;
  closed: boolean;
  stdout: PassThrough;
  stderr: PassThrough;
};

/** One ordinary desktop helper, bounded independent full-image consumers, one input owner.
 * No saved frame is replayed to a new consumer. Protected desktops are never pooled.
 */
export class DesktopSharedCapture {
  private group: {
    key: string;
    child: DesktopHelper;
    members: Set<Subscription>;
    ready?: Record<string, unknown>;
    native?: DesktopSharedNative<Subscription>;
    audio?: DesktopSharedAudio<Subscription>;
    control?: Subscription;
    configuration?: string;
    frameSeq: number;
    inputSeq: number;
    inputs: Map<number, { member: Subscription; seq: number }>;
    ended: boolean;
  } | undefined;

  /** A new source must wait for the old OS helper, not just its virtual subscribers. */
  get retiring(): DesktopHelper | undefined { return this.group?.ended ? this.group.child : undefined; }

  attach(key: string, spawn: () => DesktopHelper): DesktopHelper {
    let g = this.group;
    if (g && (g.ended || g.key !== key || g.members.size >= 8))
      throw new Error("Shared desktop source is busy or incompatible");
    if (!g) {
      const child = spawn();
      g = this.group = { key, child, members: new Set(), frameSeq: 0, inputSeq: 0, inputs: new Map(), ended: false };
      const current = g;
      const end = () => this.end(current);
      child.on("error", end);
      child.once("close", () => {
        end();
        if (this.group === current) this.group = undefined;
      });
      child.stdin.on("error", end);
      // Never forward native diagnostics, which may contain desktop metadata.
      child.stderr.on("data", () => {});
      let buffer = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (current.ended) return;
        buffer += chunk;
        if (buffer.length > 3 * 1024 * 1024) { end(); return; }
        let n: number;
        while ((n = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, n).trim();
          buffer = buffer.slice(n + 1);
          if (!line) continue;
          try { this.receive(current, JSON.parse(line)); }
          catch { end(); return; }
        }
      });
    }
    const current = g;
    const member = Object.assign(new EventEmitter(), {
      configured: false, pending: 0, closed: false,
      exitCode: null as number | null, signalCode: null as NodeJS.Signals | null,
      stdout: new PassThrough(), stderr: new PassThrough(),
      stdin: undefined as unknown as Writable,
      kill: () => { this.detach(current, member); return true; },
      createAudio:(hooks:DesktopNativeAudioHooks)=>{
        const source=current.native?.audioSource(member,hooks.id);
        if(!source||current.ended||member.closed||!current.ready?.nativeAudio){hooks.state("unavailable");return {stop(){}};}
        if(!current.audio)current.audio=new DesktopSharedAudio<Subscription>({id:source.id,synthetic:current.ready.backend==="synthetic",timestamp:source.timestamp,active:()=>!current.ended&&source.active(),write:value=>this.write(current,value)});
        return current.audio.attach(member,hooks);
      },
      requestControl: (enabled: boolean) => {
        if (member.closed || !member.configured || !current.ready || current.ended) return false;
        if (!enabled) {
          if (current.control === member) {
            delete current.control;
            for (const [seq, route] of current.inputs) if (route.member === member) current.inputs.delete(seq);
            this.write(current, { type: "control", enabled: false });
          }
          return false;
        }
        if (current.control && current.control !== member) return false;
        current.control = member;
        return true;
      },
    }) as Subscription;
    let input = "";
    member.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        if (member.closed || current.ended) { done(); return; }
        input += chunk.toString();
        if (input.length > 65536) { this.detach(current, member); done(); return; }
        let n: number;
        try {
          while ((n = input.indexOf("\n")) >= 0) {
            const value = JSON.parse(input.slice(0, n));
            input = input.slice(n + 1);
            this.command(current, member, value);
          }
        } catch { this.detach(current, member); }
        done();
      },
      final: done => { this.detach(current, member); done(); },
    });
    current.members.add(member);
    return member;
  }

  private command(g: NonNullable<DesktopSharedCapture["group"]>, s: Subscription, value: any): void {
    if (value.type === "configure" && !s.configured) {
      // Compare the complete fixed helper configuration, not caller-supplied identity.
      const configuration = JSON.stringify(value);
      if (g.configuration && g.configuration !== configuration) throw Error("Capture configuration changed");
      s.configured = true;
      if (!g.configuration) { g.configuration = configuration; this.write(g, value); }
      else if (g.ready) this.emit(s, g.ready);
      return;
    }
    if (!s.configured) throw Error("Missing capture configuration");
    if (g.native?.command(s, value)) return;
    if (value.type === "policy") return; // The shared native pool sets aggregate image policy.
    if (value.type === "ack") {
      if (!s.pending || value.seq !== s.pending) throw Error("Wrong subscriber ACK");
      s.pending = 0;
    } else if (value.type === "heartbeat" || value.type === "keyframe") this.write(g, value);
    else if (value.type === "control") {
      if (g.control === s && value.enabled === true) this.write(g, value);
    } else if (value.type === "release") {
      if (g.control === s) this.write(g, value);
    } else if (value.type === "input") {
      if (g.control !== s) return;
      // Expired/rejected helper input may never be acknowledged. Retain only the
      // newest ACK routes, as DesktopInputAcks does, without blocking new input.
      if (g.inputs.size >= 64) g.inputs.delete(g.inputs.keys().next().value!);
      if (!Number.isSafeInteger(g.inputSeq + 1)) { this.end(g); return; }
      const seq = ++g.inputSeq;
      g.inputs.set(seq, { member: s, seq: value.seq });
      this.write(g, { ...value, seq });
    } else throw Error("Unsupported shared capture command");
  }

  private receive(g: NonNullable<DesktopSharedCapture["group"]>, value: any): void {
    if (g.native?.receive(value)) return;
    if (value.type === "ready" && !g.ready) {
      const { inputAckPipe: _inputAckPipe, deferNativeSnapshots: _defer, ...wire } = value;
      const ready = DesktopReady.parse(wire);
      if (ready.secureDesktop || ready.protectedDesktop || ready.lockScreenCover || ready.virtualDisplay || (ready.nativeVideo && !JSON.parse(g.configuration!).allowNativeVideo) || ready.allowMedia || ready.allowClipboard)
        throw Error("Source cannot be shared");
      g.ready = { ...ready, dynamicQuality: false, inputAckPipe: false, ...(value.deferNativeSnapshots===true?{deferNativeSnapshots:true}:{}) };
      if (ready.nativeVideo) g.native = new DesktopSharedNative<Subscription>({
        sourceStopped:()=>{g.audio?.dispose();delete g.audio;},
        adaptive:ready.nativeAdaptive===true,window: ready.nativeVideoWindow === 3 ? 3 : 1,
        write: value => this.write(g, value), send: (s, value) => this.emit(s, value),
        policy: active => { const config=JSON.parse(g.configuration!);this.write(g,{type:"policy",fps:active?1:config.options.fps,quality:config.options.quality}); },
      });
      for (const s of g.members) if (s.configured) this.emit(s, g.ready);
    } else if (value.type === "frame" && g.ready) {
      const info = DesktopFrameInfo.parse(value.info);
      if (info.update || info.seq <= g.frameSeq || typeof value.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) || value.data.length > Math.ceil(DESKTOP_MAX_FRAME_BYTES / 3) * 4)
        throw Error("Shared capture requires full ordered frames");
      decodeDesktopFrame(encodeDesktopFrame(info, Buffer.from(value.data, "base64")));
      g.frameSeq = info.seq;
      // Bounded acceptance at the source replaces the slowest subscriber's ACK.
      // Every subscriber still ACKs exactly its own delivered frame.
      for (const s of g.members) {
        if (!s.configured || s.pending || s.closed) continue;
        s.pending = info.seq;
        this.emit(s, value);
      }
      this.write(g, { type: "ack", seq: info.seq });
    } else if (value.type === "input_ack" && Number.isSafeInteger(value.seq)) {
      const route = g.inputs.get(value.seq);
      if (route) { g.inputs.delete(value.seq); this.emit(route.member, { type: "input_ack", seq: route.seq }); }
    } else {
      // A source/lock transition ends the entire generation before more data is accepted.
      if (value.type === "session_locked") for (const s of g.members) this.emit(s, { type: "session_locked" });
      this.end(g);
    }
  }

  private emit(s: Subscription, value: unknown): void {
    if (s.closed) return;
    // One frame per subscriber; no queue may grow behind a paused stream.
    if (s.stdout.readableLength > 3 * 1024 * 1024) { s.kill(); return; }
    s.stdout.write(JSON.stringify(value) + "\n");
  }
  private write(g: NonNullable<DesktopSharedCapture["group"]>, value: unknown): void {
    if (g.ended) return;
    if (g.child.stdin.writableLength > 65536) { this.end(g); return; }
    g.child.stdin.write(JSON.stringify(value) + "\n");
  }
  private detach(g: NonNullable<DesktopSharedCapture["group"]>, s: Subscription): void {
    if (s.closed) return;
    s.closed = true;
    g.audio?.detach(s);
    g.native?.detach(s);
    g.members.delete(s);
    if (g.control === s) { delete g.control; this.write(g, { type: "control", enabled: false }); }
    for (const [seq, route] of g.inputs) if (route.member === s) g.inputs.delete(seq);
    s.exitCode = 0;
    s.stdout.end(); s.stderr.end();
    queueMicrotask(() => s.emit("close", 0, null));
    if (!g.members.size) this.end(g);
  }
  private end(g: NonNullable<DesktopSharedCapture["group"]>): void {
    if (g.ended) return;
    g.ended = true;
    g.audio?.dispose();delete g.audio;
    g.native?.dispose(); delete g.native;
    delete g.ready;
    for (const s of [...g.members]) this.detach(g, s);
    g.inputs.clear();
    g.child.stdin.end();
    if (g.child.exitCode === null && g.child.signalCode === null) {
      const timer = setTimeout(() => g.child.kill(), 1500);
      timer.unref();
      g.child.once("close", () => clearTimeout(timer));
    }
  }
  dispose(): void { if (this.group) this.end(this.group); }
}
