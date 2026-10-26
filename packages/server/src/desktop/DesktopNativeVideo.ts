import {DesktopNativeAudio} from "./DesktopNativeAudio.js";
import {DesktopNativeAudioControl} from "@sodashitsu/protocol";
import {DesktopNativeDatagrams} from "./DesktopNativeDatagrams.js";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  DesktopMediaSettings,
  type DesktopIceServers,
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
    captureMs: z.number().finite().min(0).max(60000).optional(),
    conversionMs: z.number().finite().min(0).max(60000).optional(),
    encodeMs: z.number().finite().min(0).max(60000).optional(),
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
  private retired=new Set<string>();
  private active:
    | {
        id: string;
        settings: import("@sodashitsu/protocol").DesktopMediaSettings;
        peer?:DesktopNativeDatagrams;audio?:DesktopNativeAudio;
        started:boolean;
        bitrate:number;adaptAt:number;acks:number;losses:number;maxAck:number;
        seq: number;
        pending: {
          seq: number;
          at: number;
          captureMs: number;
          conversionMs: number;
          encodeMs: number;
        }[];
        statsAt: number;
        lastAck: number;
        drawnAt?: number;
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
      datagrams?:boolean;audioEnabled?:boolean;synthetic?:boolean;
      iceServers?:z.infer<typeof DesktopIceServers>;
      window?: 1 | 3;
      width: number;
      sourceWidth: number;
      sourceHeight: number;
      exact?: { width: number; height: number };
      fps: number;
      maxFps?: 60;
      send(value: unknown): boolean;
      write(value: unknown): void;
      policy(video: boolean): void;
      buffered(): number;
    },
  ) {}
  fromViewer(raw: unknown): boolean {
    const m = raw as { type: string; enabled?: boolean; settings?: unknown };
    if((m.type==="rtc_signal"||m.type==="media_fallback")&&this.retired.has((raw as {id:string}).id))return true;
    if(m.type==="native_audio_control"){
      const control=DesktopNativeAudioControl.parse(raw),s=this.active;if(s?.id===control.id&&this.hooks.audioEnabled){s.settings.audio=false;s.audio?.stop();}return true;
    }
    if(m.type==="rtc_signal"){
      const active=this.active;if(!active?.peer)return false;
      void active.peer.signal(raw).catch(()=>this.fallback(active));return true;
    }
    if(m.type==="media_fallback"){
      const active=this.active;if(!active?.peer||(raw as {id?:string}).id!==active.id)return false;this.fallback(active);return true;
    }
    if(m.type==="native_video_ack"){
      // UDP ACKs are accepted only from its authenticated control datachannel.
      if(this.active?.peer)return true;
      this.ack(raw,false);return true;
    }
    if (m.type !== "media") return false;
    this.stop("stopped");
    if (!m.enabled) return false;
    const settings = DesktopMediaSettings.parse(m.settings ?? {});
    if (settings.transport !== "native") return false;
    const id = randomUUID();
    const fps=settings.fps??this.hooks.fps;
    if (!this.hooks.enabled || (settings.audio&&!this.hooks.audioEnabled) || fps>(this.hooks.maxFps??this.hooks.fps)) {
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
      id,settings,started:false,bitrate:settings.maxBitrateKbps,adaptAt:performance.now(),acks:0,losses:0,maxAck:0,
      seq: 0,
      pending: [],
      statsAt: 0,
      lastAck: 0,
      at: performance.now(),
      timestamp: -1,
      stream: false,
    };
    const active=this.active;
    const udp=settings.udp===true&&this.hooks.datagrams===true;
    this.hooks.send({type:"media_status",id,state:"negotiating",audio:false,...(settings.audio?{nativeAudio:true}:{}),...(udp?{datagrams:true,iceServers:this.hooks.iceServers??[]}: {})});
    if(udp){
      active.peer=new DesktopNativeDatagrams({id,audio:settings.audio,audioFailed:()=>{if(this.active===active){active.settings.audio=false;active.audio?.stop(false);this.hooks.send({type:"native_audio_status",id,state:"unavailable"});}},iceServers:this.hooks.iceServers??[],send:value=>this.hooks.send(value),
        ready:()=>{if(this.active===active)this.begin(active);},
        ack:value=>{if(this.active===active)this.ack(value,true);},
        keyframe:()=>{if(this.active===active&&active.started)this.hooks.write({type:"native_keyframe",id});},
        fail:()=>this.fallback(active)});
    }else this.begin(active);
    return true;
  }
  private begin(s:NonNullable<DesktopNativeVideo["active"]>){
    if(this.active!==s||s.started)return;s.started=true;s.at=performance.now();
    this.hooks.policy(true);
    this.hooks.write({type:"native_video",enabled:true,id:s.id,bitrateKbps:s.settings.maxBitrateKbps,fps:s.settings.fps??this.hooks.fps,...(this.hooks.window===3?{window:3}:{})});
    if(s.settings.audio&&this.hooks.audioEnabled)s.audio=new DesktopNativeAudio({id:s.id,synthetic:this.hooks.synthetic===true,active:()=>this.active===s&&s.settings.audio,videoTimestamp:()=>s.timestamp,
      write:value=>this.hooks.write(value),state:state=>{if(this.active===s)this.hooks.send({type:"native_audio_status",id:s.id,state});},
      send:bytes=>this.active===s&&(s.peer?s.peer.sendAudio(bytes):this.hooks.buffered()<=65536&&this.hooks.send(bytes))});
  }
  private fallback(s:NonNullable<DesktopNativeVideo["active"]>){
    if(this.active!==s||!s.peer)return;
    if(s.started)this.hooks.send({type:"native_transport_reset",id:s.id});
    const settings={...s.settings,udp:false};this.stop("stopped",false);
    this.fromViewer({type:"media",enabled:true,settings});
  }
  private ack(raw:unknown,direct:boolean){
    const ack=DesktopNativeVideoAck.parse(raw),s=this.active;
    if(!s||ack.id!==s.id||ack.generation!==1||ack.seq<=s.lastAck)return;
    if(ack.dropped&&!direct)throw Error("Dropped ACK requires native datagrams");
    const pending=s.pending[0];if(ack.seq!==pending?.seq)throw Error("Native video ACK order");
    s.lastAck=ack.seq;if(!ack.dropped)s.drawnAt=pending.at;s.pending.shift();
    const now=performance.now(),ackMs=Math.min(60000,Math.max(0,now-pending.at));
    if(direct){
      // Same reliable FIFO as frame notices, before releasing source credit.
      if(!this.hooks.send({...ack,type:"native_draw_ack"})){this.fallback(s);return;}
      s.acks++;if(ack.dropped)s.losses++;s.maxAck=Math.max(s.maxAck,ackMs);
      if(s.settings.adaptive&&s.acks>=8&&now-s.adaptAt>=1000){
        let bitrate=s.bitrate;
        if(s.losses||s.maxAck>150)bitrate=Math.max(128,Math.floor(bitrate*.8));
        else if(s.maxAck<60)bitrate=Math.min(s.settings.maxBitrateKbps,Math.ceil(bitrate*1.1));
        if(bitrate!==s.bitrate){s.bitrate=bitrate;this.hooks.write({type:"native_bitrate",id:s.id,kbps:bitrate});}
        s.adaptAt=now;s.acks=s.losses=s.maxAck=0;
      }
    }
    if(this.hooks.window===3&&now-s.statsAt>=1000){s.statsAt=now;this.hooks.send({type:"native_video_stats",id:s.id,width:s.width!,height:s.height!,window:3,pending:s.pending.length,captureMs:pending.captureMs,conversionMs:pending.conversionMs,encodeMs:pending.encodeMs,ackMs,decodeMs:ack.decodeMs??0});}
    this.hooks.write({type:"native_video_ack",id:s.id,seq:ack.seq});
  }
  fromHelper(raw: unknown): boolean {
    const m = raw as { type: string; id?: string };
    if (m.type !== "native_frame" && m.type !== "native_video_stopped") return false;
    const s = this.active;
    if (!s || m.id !== s.id) return true;
    if(!s.started)throw Error("Native encoder started before peer");
    if (m.type === "native_video_stopped") {
      if(s.peer)this.fallback(s);else this.stop("unavailable");
      return true;
    }
    const frame = HelperVideo.parse(raw);
    if (
      s.pending.length >= (this.hooks.window ?? 1) ||
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
      this.hooks.send({ type: "media_status", id: s.id, state: "native", audio: false,...(s.settings.audio?{nativeAudio:true}:{}),...(s.peer?{datagrams:true}:{}) });
      this.hooks.send({
        type: "media_stream",
        id: s.id,
        generation: 1,
        mime: "video/h264",
        ...(s.peer?{datagrams:true}:{}),
        ...(this.hooks.window === 3 ? { window: 3 } : {}),
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
    s.pending.push({
      seq: frame.seq,
      at: performance.now(),
      captureMs: frame.captureMs ?? 0,
      conversionMs: frame.conversionMs ?? 0,
      encodeMs: frame.encodeMs ?? 0,
    });
    s.timestamp = frame.timestamp;
    s.at = performance.now();
    if(s.peer){
      if(!this.hooks.send({type:"native_frame_notice",id:s.id,generation:1,seq:frame.seq,bytes:payload.length})||!s.peer.send(frame.seq,payload))this.fallback(s);
    }else if (!this.hooks.send(encodeDesktopMediaChunk(1, frame.seq, payload))) this.stop("congested");
    return true;
  }
  tick(now = performance.now()) {
    const s = this.active;
    if(s&&s.started&&now-(s.pending[0]?.at??s.at)>(s.pending.length?2500:5000)){
      if(s.peer)this.fallback(s);else this.stop(s.pending.length?"congested":"unavailable");
    }
  }
  hasFreshDraw(now = performance.now()): boolean {
    const s = this.active;
    return !!s?.stream && s.drawnAt !== undefined && now - s.drawnAt < 2000;
  }
  stop(reason: "stopped" | "unavailable" | "congested" = "stopped",notify=true) {
    const s = this.active;
    if (!s) return;
    this.active = undefined;
    this.retired.add(s.id);if(this.retired.size>32)this.retired.delete(this.retired.values().next().value!);
    s.audio?.stop(false);s.peer?.close();
    if(s.started){
    this.hooks.write({ type: "native_video", enabled: false, id: s.id });
    this.hooks.policy(false);
    this.hooks.write({ type: "keyframe" });
    this.hooks.write({ type: "release" });
    }
    if(notify)this.hooks.send({ type: "media_status", id: s.id, state: "images", audio: false, reason });
  }
}
