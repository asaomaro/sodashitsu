import {unlockFailure} from "./unlockFailure.js";
import type {NativePcmCapability} from "./DesktopNativePcmPath.js";
import {DesktopSourceIdle} from "@sodashitsu/client-core/desktop/DesktopSourceIdle";
import {DesktopNativePlatformFailure} from "@sodashitsu/protocol";
import {randomUUID} from "node:crypto";
import {DesktopRegionSpec,type DesktopRegionSpec as RegionSpec} from "@sodashitsu/protocol";
import type {DesktopResourceChannel} from "./DesktopResourceChannel.js";
import {DesktopHelperInputAck} from "./DesktopPointerWitness.js";
import {
  parseDesktopCursor,
  DESKTOP_CURSOR_MAX_BYTES,
  type DesktopCursorInfo,
} from "@sodashitsu/protocol";
import { DesktopSharedClipboard } from "./DesktopSharedClipboard.js";
import { DesktopSharedAudio } from "./DesktopSharedAudio.js";
import type { DesktopNativeAudioHooks, DesktopAudioLease } from "./DesktopNativeAudio.js";
import { DesktopSharedNative } from "./DesktopSharedNative.js";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import {
  DesktopProtectedFailure,
  DesktopReady,
  DesktopFrameInfo,
  DesktopFrameChain,
  encodeDesktopFrame,
  decodeDesktopFrame,
  DESKTOP_MAX_FRAME_BYTES,
} from "@sodashitsu/protocol";

/** The subset used by DesktopProvider, for both OS children and shared subscriptions. */
export interface DesktopHelper extends EventEmitter {
  resourceChannel?: DesktopResourceChannel;
  nativePcm?: NativePcmCapability;
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals | number): boolean;
  createAudio?(hooks: DesktopNativeAudioHooks): DesktopAudioLease;
  requestControl?(enabled: boolean): boolean;
  requestClipboard?(enabled: boolean, generation: number): boolean;
  requestMicrophone?(id: string, enabled: boolean,inline?:boolean): boolean;
}

type Subscription = DesktopHelper & {
  nativeCapturedInput:number;
  nativeInputs:Array<{physical:number;local:number}>;
  region?:{requested:RegionSpec;physical:RegionSpec};
  cursorShape: number;
  images: DesktopFrameChain;
  configured: boolean;
  pending: number;
  closed: boolean;
  stdout: PassThrough;
  stderr: PassThrough;
};

/** One purpose-bound desktop helper, bounded full-image consumers, one input owner.
 * No saved frame is replayed. Protected sources require explicit worker proof.
 */
export class DesktopSharedCapture {
  private group:
    | {
        key: string;
        child: DesktopHelper;
        members: Set<Subscription>;
        ready?: Record<string, unknown>;
        native?: DesktopSharedNative<Subscription>;
        audio?: DesktopSharedAudio<Subscription>;
        control?: Subscription;
        clipboard?: DesktopSharedClipboard<Subscription>;
        microphone?: { member: Subscription; id: string;inline:boolean };
        cursorSeq: number;
        cursorPose?: DesktopCursorInfo;
        cursorShape?: { id: number; shape: NonNullable<DesktopCursorInfo["shape"]>; data: string };
        configuration?: string;
        protectedSource?: boolean;
        frameSeq: number;
        images: DesktopFrameChain;
        deltas: boolean;
        keyframeAt: number;
        regionDirty?:boolean;
        regionTimer?:ReturnType<typeof setTimeout>;
        sourceIdle:DesktopSourceIdle;
        nativeInputSeq:number;
        inputSeq: number;
        inputs: Map<number, { member: Subscription; seq: number }>;
        ended: boolean;
      }
    | undefined;

  get running():boolean{return this.group!==undefined;}

  /** A new source must wait for the old OS helper, not just its virtual subscribers. */
  get retiring(): DesktopHelper | undefined {
    return this.group?.ended ? this.group.child : undefined;
  }

  attach(key: string, spawn: () => DesktopHelper): DesktopHelper {
    let g = this.group;
    if (g && (g.ended || g.key !== key || g.members.size >= 8))
      throw new Error("Shared desktop source is busy or incompatible");
    if (!g) {
      const child = spawn();
      g = this.group = {
        key,
        child,
        members: new Set(),
        frameSeq: 0,
        images: new DesktopFrameChain(),
        deltas: false,
        keyframeAt: -Infinity,
        sourceIdle:new DesktopSourceIdle(),
        nativeInputSeq:0,
        inputSeq: 0,
        inputs: new Map(),
        cursorSeq: 0,
        ended: false,
      };
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
        if (buffer.length > 3 * 1024 * 1024) {
          end();
          return;
        }
        let n: number;
        while ((n = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, n).trim();
          buffer = buffer.slice(n + 1);
          if (!line) continue;
          try {
            this.receive(current, JSON.parse(line));
          } catch {
            end();
            return;
          }
        }
      });
    }
    const current = g;
    const member = Object.assign(new EventEmitter(), {
      resourceChannel: current.child.resourceChannel,
      nativePcm: current.child.nativePcm,
      nativeCapturedInput:0,
      nativeInputs:[],
      configured: false,
      pending: 0,
      closed: false,
      cursorShape: 0,
      images: new DesktopFrameChain(),
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: undefined as unknown as Writable,
      kill: () => {
        this.detach(current, member);
        return true;
      },
      createAudio: (hooks: DesktopNativeAudioHooks) => {
        const source = current.native?.audioSource(member, hooks.id);
        if (!source || current.ended || member.closed || !current.ready?.nativeAudio) {
          hooks.state("unavailable");
          return { stop() {} };
        }
        if (!current.audio)
          current.audio = new DesktopSharedAudio<Subscription>({
            id: source.id,
            synthetic: current.ready.backend === "synthetic",
            timestamp: source.timestamp,
            active: () => !current.ended && source.active(),
            write: (value) => this.write(current, value),
          });
        return current.audio.attach(member, hooks);
      },
      requestMicrophone: (id: string, enabled: boolean,inline=true) => {
        if (!enabled) {
          if (current.microphone?.member === member && current.microphone.id === id) {
            if(current.microphone.inline)this.write(current, { type: "native_microphone", id, enabled: false });
            delete current.microphone;
          }
          return false;
        }
        if (
          member.closed ||
          !member.configured ||
          current.ended ||
          !current.ready?.microphone ||
          current.protectedSource
        )
          return false;
        if (current.microphone)
          return current.microphone.member === member && current.microphone.id === id;
        current.microphone = { member, id,inline };
        return true;
      },
      requestClipboard: (enabled: boolean, generation: number) => {
        if (member.closed || !member.configured || current.ended) return false;
        return current.clipboard?.grant(member, enabled, generation) === true;
      },
      requestControl: (enabled: boolean) => {
        if (member.closed || !member.configured || !current.ready || current.ended) return false;
        if (!enabled) {
          if (current.control === member) {
            delete current.control;
            for (const [seq, route] of current.inputs)
              if (route.member === member) current.inputs.delete(seq);
            this.write(current, { type: "control", enabled: false });
          }
          return false;
        }
        if (!current.ready.allowInput || current.control && current.control !== member) return false;
        current.control = member;
        return true;
      },
    }) as Subscription;
    let input = "";
    member.stdin = new Writable({
      write: (chunk, _encoding, done) => {
        if (member.closed || current.ended) {
          done();
          return;
        }
        input += chunk.toString();
        if (input.length > 65536) {
          this.detach(current, member);
          done();
          return;
        }
        let n: number;
        try {
          while ((n = input.indexOf("\n")) >= 0) {
            const value = JSON.parse(input.slice(0, n));
            input = input.slice(n + 1);
            this.command(current, member, value);
          }
        } catch {
          this.detach(current, member);
        }
        done();
      },
      final: (done) => {
        this.detach(current, member);
        done();
      },
    });
    current.members.add(member);
    return member;
  }

  private command(
    g: NonNullable<DesktopSharedCapture["group"]>,
    s: Subscription,
    value: any,
  ): void {
    if (value.type === "configure" && !s.configured) {
      // Compare the complete fixed helper configuration, not caller-supplied identity.
      const configuration = JSON.stringify(value);
      if (g.configuration && g.configuration !== configuration)
        throw Error("Capture configuration changed");
      s.configured = true;
      if (!g.configuration) {
        g.configuration = configuration;
        g.protectedSource = value.allowSharedProtected === true;
        g.deltas = value.options?.deltas === true;
        const {allowSharedUnlock:_localUnlock,...physical}=value;
        this.write(g, physical);
      } else if (g.ready) {
        this.emit(s, g.ready);
        this.cursor(g, s);
        if (g.deltas) this.imageKeyframe(g);
      }
      return;
    }
    if (!s.configured) throw Error("Missing capture configuration");
    if (g.clipboard?.command(s, value)) return;
    if (g.native?.command(s, value)) return;
    if (value.type === "native_microphone") {
      if (g.microphone?.member !== s || g.microphone.id !== value.id || !g.microphone.inline) return;
      this.write(g, value);
      if (value.enabled === false) delete g.microphone;
      return;
    }
    if (value.type === "policy") return; // The shared native pool sets aggregate image policy.
    if (value.type === "ack") {
      if (!s.pending || value.seq !== s.pending) throw Error("Wrong subscriber ACK");
      s.pending = 0;
      if (g.deltas && s.images.last?.seq !== g.images.last?.seq) this.imageKeyframe(g);
    } else if (value.type === "keyframe") {
      if(value.region!==undefined){
        const size=g.images.last;
        if(g.ready?.agentRegions!==true||g.protectedSource||!size)throw Error("Region verification unavailable");
        if(value.region===null)delete s.region;
        else{const spec=DesktopRegionSpec.parse(value.region);if(spec.x+spec.width>size.width||spec.y+spec.height>size.height)throw Error("Region outside capture");s.region={requested:spec,physical:{...spec,id:randomUUID()}};}
        g.regionDirty=true;
      }
      this.imageKeyframe(g);
    }
    else if (value.type === "heartbeat") this.write(g, value);
    else if (value.type === "control") {
      if (g.control === s && value.enabled === true) this.write(g, value);
    } else if (value.type === "release") {
      if (g.control === s) this.write(g, value);
    } else if(value.type==="dismiss_lock_screen"||value.type==="sas") {
      if(g.control===s && g.ready?.secureDesktop===true && !g.protectedSource && JSON.parse(g.configuration!).allowSharedUnlock===true &&
         (value.type==="dismiss_lock_screen"?g.ready.lockScreenCover===true:!g.ready.lockScreenCover))this.write(g,{type:value.type});
    } else if (value.type === "input") {
      if (g.control !== s || g.ready?.lockScreenCover) return;
      // Expired/rejected helper input may never be acknowledged. Retain only the
      // newest ACK routes, as DesktopInputAcks does, without blocking new input.
      if (g.inputs.size >= 64) g.inputs.delete(g.inputs.keys().next().value!);
      if (!Number.isSafeInteger(g.inputSeq + 1)) {
        this.end(g);
        return;
      }
      const seq = ++g.inputSeq;
      g.inputs.set(seq, { member: s, seq: value.seq });
      if(g.ready?.backend==="linux-portal"||g.ready?.backend==="macos-sck"){
        if(s.nativeInputs.length>=64)s.nativeInputs.shift();
        s.nativeInputs.push({physical:seq,local:value.seq});
      }
      this.write(g, { ...value, seq });
    } else throw Error("Unsupported shared capture command");
  }

  private receive(g: NonNullable<DesktopSharedCapture["group"]>, value: any): void {
    if (g.clipboard?.receive(value)) return;
    if (g.native?.receive(value)) return;
    if (value.type === "ready" && !g.ready) {
      const { inputAckPipe: _inputAckPipe, deferNativeSnapshots: _defer, nativePointerProof, ...wire } = value;
      const ready = DesktopReady.parse(wire);
      const configuration = JSON.parse(g.configuration!);
      const lockedSource = !g.protectedSource && configuration.allowSharedUnlock===true && ready.secureDesktop===true && !ready.protectedDesktop && !ready.sharedProtected &&
        (ready.backend==="windows-gdi"||ready.backend==="windows-dxgi");
      const protectedSource =
        ready.secureDesktop === true &&
        !!ready.protectedDesktop &&
        ready.sharedProtected === true &&
        !ready.lockScreenCover;
      if (g.protectedSource && !protectedSource) {
        for (const member of [...g.members])
          this.emit(member, { type: "protected_desktop_failure", code: "service_incompatible" });
        this.end(g);
        return;
      }
      if (
        (g.protectedSource
          ? !protectedSource ||
            ready.nativeVideo ||
            ready.nativeAudio ||
            ready.microphone ||
            ready.cursor ||
            ready.files ||
            ready.richClipboard
          : lockedSource ? ready.nativeVideo||ready.nativeAudio||ready.microphone||ready.cursor||ready.files||ready.richClipboard||ready.allowClipboard||ready.allowMedia||ready.monitorLayout||ready.agentRegions
          : ready.secureDesktop || ready.protectedDesktop || ready.sharedProtected) ||
        (ready.lockScreenCover && !lockedSource) ||
        ready.virtualDisplay ||
        (ready.nativeVideo && !JSON.parse(g.configuration!).allowNativeVideo) ||
        ready.allowMedia ||
        (ready.allowClipboard && !JSON.parse(g.configuration!).allowClipboard)
      )
        throw Error("Source cannot be shared");
      if(ready.monitorLayout&&(configuration.allowMonitors!==true||configuration.options.monitors!==true||(configuration.options.monitorDevice&&ready.monitorLayout.selected!==configuration.options.monitorDevice)))throw Error("Unexpected shared monitor layout");
      if (ready.cursor && (!configuration.separateCursor || configuration.options.cursor !== true))
        throw Error("Unexpected shared cursor source");
      if (
        configuration.allowClipboard === true &&
        ready.allowClipboard === true &&
        !g.protectedSource
      )
        g.clipboard = new DesktopSharedClipboard<Subscription>({
          allowed: () => !g.ended && g.ready?.allowClipboard === true,
          write: (value) => this.write(g, value),
          send: (member, value) => this.emit(member, value),
        });
      g.ready = {
        ...ready,
        dynamicQuality: false,
        inputAckPipe: false,
        ...(nativePointerProof===true&&configuration.nativePointerProof===true&&!g.protectedSource&&ready.resourceFences===true?{nativePointerProof:true}:{}),
        ...(value.deferNativeSnapshots === true ? { deferNativeSnapshots: true } : {}),
      };
      if (ready.nativeVideo)
        g.native = new DesktopSharedNative<Subscription>({
          sourceStopped: () => {
            g.audio?.dispose();
            delete g.audio;
          },
          adaptive: ready.nativeAdaptive === true,
          window: ready.nativeVideoWindow === 3 ? 3 : 1,
          write: (value) => this.write(g, value),
          send: (s, value) => this.emit(s, value),
          policy: (active) => {
            const config = JSON.parse(g.configuration!);
            this.write(g, {
              type: "policy",
              fps: active ? 1 : config.options.fps,
              quality: config.options.quality,
            });
          },
        });
      for (const s of g.members) if (s.configured) this.emit(s, g.ready);
    } else if (value.type === "cursor" && g.ready?.cursor === true && !g.protectedSource) {
      const { data, ...info } = value;
      if (
        data !== undefined &&
        (typeof data !== "string" ||
          data.length > Math.ceil(DESKTOP_CURSOR_MAX_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
      )
        throw Error("Shared cursor data limit");
      const bytes = Buffer.from(data ?? "", "base64");
      if (data !== undefined && bytes.toString("base64") !== data)
        throw Error("Invalid shared cursor encoding");
      const packet = parseDesktopCursor(info, bytes);
      if (packet.info.seq <= g.cursorSeq) return;
      g.cursorSeq = packet.info.seq;
      const { shape, ...pose } = packet.info;
      g.cursorPose = pose;
      if (shape) g.cursorShape = { id: pose.shapeId, shape, data: bytes.toString("base64") };
      for (const member of g.members) if (member.configured) this.cursor(g, member);
    } else if(value.type==="platform_idle"&&g.ready){
      const backend=g.ready.backend==="linux-portal"?"linux-portal":undefined;
      const notice=g.sourceIdle.receive(value,{backend,ready:true,pending:0,seq:g.frameSeq});
      if(notice)for(const member of g.members)if(member.configured&&!member.closed&&!member.pending&&member.images.last?.seq===notice.seq)this.emit(member,notice);
    } else if(value.type==="platform_failure"){
      const failure=DesktopNativePlatformFailure.parse(value),expected=g.ready?.backend??(g.configuration?JSON.parse(g.configuration).nativePlatform:undefined);
      if(failure.backend!==expected)throw Error("Wrong shared native failure scope");
      for(const member of [...g.members])if(member.configured)this.emit(member,failure);
      this.end(g);
    } else if (value.type === "frame" && g.ready) {
      const info = DesktopFrameInfo.parse(value.info);
      const native=g.ready.backend==="linux-portal"||g.ready.backend==="macos-sck";
      if(native){
        if(!info.timing||info.sourceInputSeq===undefined||info.sourceInputSeq<g.nativeInputSeq||info.sourceInputSeq>g.inputSeq)throw Error("Invalid shared native input evidence");
        g.nativeInputSeq=info.sourceInputSeq;
        for(const member of g.members){
          while(member.nativeInputs.length&&member.nativeInputs[0]!.physical<=info.sourceInputSeq){const input=member.nativeInputs.shift()!;member.nativeCapturedInput=Math.max(member.nativeCapturedInput,input.local);}
        }
      }else if(info.timing!==undefined||info.sourceInputSeq!==undefined)throw Error("Unrequested shared native frame");
      if (
        (info.update && !g.deltas) ||
        info.seq <= g.frameSeq ||
        typeof value.data !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) ||
        value.data.length > Math.ceil(DESKTOP_MAX_FRAME_BYTES / 3) * 4
      )
        throw Error("Shared capture requires full ordered frames");
      decodeDesktopFrame(encodeDesktopFrame(info, Buffer.from(value.data, "base64")));
      g.images.accept(info);
      g.frameSeq = info.seq;
      g.sourceIdle.frame();
      let recover = false;
      // Bounded acceptance at the source replaces the slowest subscriber's ACK.
      // Every subscriber still ACKs exactly its own delivered frame.
      for (const s of g.members) {
        if (!s.configured || s.pending || s.closed) continue;
        if (info.update && s.images.last?.seq !== info.update.baseSeq) {
          recover = true;
          continue;
        }
        const {regions,...plain}=info;
        const proof=s.region&&regions?.find(p=>p.id===s.region!.physical.id);
        if(proof&&s.region&&(proof.x!==s.region.physical.x||proof.y!==s.region.physical.y||proof.width!==s.region.physical.width||proof.height!==s.region.physical.height))throw Error("Region proof bounds changed");
        const delivered={...plain,...(native?{sourceInputSeq:s.nativeCapturedInput}:{}),...(proof&&s.region?{regions:[{...proof,id:s.region.requested.id}]}:{})};
        s.images.accept(delivered);
        s.pending = info.seq;
        this.emit(s, {...value,info:delivered});
      }
      this.write(g, { type: "ack", seq: info.seq });
      if (recover) this.imageKeyframe(g);
    } else if (value.type === "input_ack" && Number.isSafeInteger(value.seq)) {
      const ack=DesktopHelperInputAck.parse(value);
      const route = g.inputs.get(ack.seq);
      if (route) {
        g.inputs.delete(ack.seq);
        this.emit(route.member, { type: "input_ack", seq: route.seq,...(ack.pointer&&g.ready?.nativePointerProof===true?{pointer:ack.pointer}:{}) });
      }
    } else {
      // A source/lock transition ends the entire generation before more data is accepted.
      if (
        g.protectedSource &&
        [
          "protected_desktop_failure",
          "unlock_failure",
          "session_locked",
          "session_unlocked",
          "lock_screen_changed",
        ].includes(value.type)
      ) {
        const failure =
          value.type === "protected_desktop_failure"
            ? DesktopProtectedFailure.parse(value)
            : {
                type: "protected_desktop_failure",
                code: value.type === "unlock_failure" ? "worker_unavailable" : "source_changed",
              };
        for (const member of [...g.members]) this.emit(member, failure);
      } else if(value.type==="monitor_topology_changed"&&Object.keys(value).length===1&&g.ready?.monitorLayout)
        for(const member of [...g.members])this.emit(member,{type:"monitor_topology_changed"});
      else if(Object.keys(value).length===1 && (value.type==="session_locked"&&!g.ready?.secureDesktop ||
          value.type==="session_unlocked"&&g.ready?.secureDesktop || value.type==="lock_screen_changed"&&g.ready?.secureDesktop&&g.ready.lockScreenCover))
        for(const member of [...g.members])this.emit(member,{type:value.type});
      else if(value.type==="unlock_failure" && Object.keys(value).length===2 && JSON.parse(g.configuration!).allowSharedUnlock===true && (!g.ready||g.ready.secureDesktop) && unlockFailure(value.code))
        for(const member of [...g.members])this.emit(member,{type:"unlock_failure",code:value.code});
      this.end(g);
    }
  }

  private cursor(g: NonNullable<DesktopSharedCapture["group"]>, s: Subscription): void {
    const pose = g.cursorPose;
    if (!pose || s.closed) return;
    if (pose.visible && g.cursorShape?.id !== pose.shapeId) return;
    const attach = pose.visible && s.cursorShape !== pose.shapeId;
    this.emit(s, {
      ...pose,
      ...(attach ? { shape: g.cursorShape!.shape, data: g.cursorShape!.data } : {}),
    });
    if (attach) s.cursorShape = pose.shapeId;
  }
  private imageKeyframe(g: NonNullable<DesktopSharedCapture["group"]>): void {
    const now = performance.now();
    if (now - g.keyframeAt < 100) {
      if(g.regionDirty&&!g.regionTimer){g.regionTimer=setTimeout(()=>{delete g.regionTimer;if(!g.ended)this.imageKeyframe(g);},Math.max(1,Math.ceil(100-(now-g.keyframeAt))));g.regionTimer.unref();}
      return;
    }
    g.keyframeAt = now;
    if(g.regionDirty){g.regionDirty=false;clearTimeout(g.regionTimer);delete g.regionTimer;this.write(g,{type:"keyframe",regions:[...g.members].flatMap(member=>member.region?[member.region.physical]:[])});}
    else this.write(g, { type: "keyframe" });
  }
  private emit(s: Subscription, value: unknown): void {
    if (s.closed) return;
    // One frame per subscriber; no queue may grow behind a paused stream.
    if (s.stdout.readableLength > 3 * 1024 * 1024) {
      s.kill();
      return;
    }
    s.stdout.write(JSON.stringify(value) + "\n");
  }
  private write(g: NonNullable<DesktopSharedCapture["group"]>, value: unknown): void {
    if (g.ended) return;
    if (g.child.stdin.writableLength > 65536) {
      this.end(g);
      return;
    }
    g.child.stdin.write(JSON.stringify(value) + "\n");
  }
  private detach(g: NonNullable<DesktopSharedCapture["group"]>, s: Subscription): void {
    if (s.closed) return;
    s.closed = true;
    if (g.microphone?.member === s) {
      if(g.microphone.inline)this.write(g, { type: "native_microphone", id: g.microphone.id, enabled: false });
      delete g.microphone;
    }
    g.clipboard?.detach(s);
    g.audio?.detach(s);
    g.native?.detach(s);
    g.members.delete(s);
    if(s.region){delete s.region;g.regionDirty=true;if(g.members.size)this.imageKeyframe(g);}
    if (g.control === s) {
      delete g.control;
      this.write(g, { type: "control", enabled: false });
    }
    for (const [seq, route] of g.inputs) if (route.member === s) g.inputs.delete(seq);
    s.exitCode = 0;
    s.stdout.end();
    s.stderr.end();
    queueMicrotask(() => s.emit("close", 0, null));
    if (!g.members.size) this.end(g);
  }
  private end(g: NonNullable<DesktopSharedCapture["group"]>): void {
    if (g.ended) return;
    g.ended = true;
    clearTimeout(g.regionTimer);delete g.regionTimer;
    g.audio?.dispose();
    delete g.audio;
    g.native?.dispose();
    delete g.native;
    delete g.ready;
    for (const s of [...g.members]) this.detach(g, s);
    g.inputs.clear();
    g.child.stdin.end();
    if (g.child.exitCode === null && g.child.signalCode === null) {
      const timer = setTimeout(() => g.child.kill(), g.child.resourceChannel?.fencing?6000:1500);
      timer.unref();
      g.child.once("close", () => clearTimeout(timer));
    }
  }
  dispose(): void {
    if (this.group) this.end(this.group);
  }
}
