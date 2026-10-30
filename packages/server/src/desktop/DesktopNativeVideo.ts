import {DesktopNativeCodec,DesktopNativeCodecString,desktopCodecMime,desktopCodecMatches} from "@sodashitsu/protocol";
import {DesktopNativeResolution} from "./DesktopNativeResolution.js";
import {DesktopNativeFormatAck} from "@sodashitsu/protocol";
import {DesktopNativeQuality} from "./DesktopNativeQuality.js";
import {DesktopNativeAudio,type DesktopNativeAudioHooks,type DesktopAudioLease} from "./DesktopNativeAudio.js";
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

export const DesktopNativeHelperFrame = z
  .object({
    type: z.literal("native_frame"),
    id: z.string().uuid(),
    generation:z.number().int().min(1).max(0xffffffff).optional(),
    seq: z.number().int().min(1).max(0xffffffff),
    timestamp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    key: z.boolean(),
    codecName:DesktopNativeCodec.optional(),codecFallback:z.enum(["encoder","unavailable"]).optional(),
    captureMs: z.number().finite().min(0).max(60000).optional(),
    conversionMs: z.number().finite().min(0).max(60000).optional(),
    encodeMs: z.number().finite().min(0).max(60000).optional(),
    codec: DesktopNativeCodecString.optional(),
    width: z.number().int().min(2).max(4096),
    height: z.number().int().min(2).max(2400),
    data: z
      .string()
      .min(4)
      .max(Math.ceil((512 * 1024 - 9) / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  })
  .strict();
const HelperVideo = DesktopNativeHelperFrame;
/** Viewer-owned native video, independent from agent snapshots and image ACKs. */
export class DesktopNativeVideo {
  private retired=new Set<string>();
  private active:
    | {
        id: string;
        settings: import("@sodashitsu/protocol").DesktopMediaSettings;
        peer?:DesktopNativeDatagrams;audio?:DesktopAudioLease;
        started:boolean;quality?:DesktopNativeQuality;resolution?:DesktopNativeResolution;
        requestedCodec:DesktopNativeCodec;codecName?:DesktopNativeCodec;codecFallback?:"encoder"|"decoder"|"unavailable";retried:boolean;
        generation:number;fps:number;nextFrameAt?:number;
        barrier?:{generation:number;width:number;height:number;at:number;baseSeq?:number};
        bitrate:number;adaptAt:number;acks:number;losses:number;maxAck:number;
        seq: number;
        pending: {
          seq: number;
          at: number;freshAt:number;
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
      nativePcm?:DesktopNativeAudioHooks["nativePcm"];codecs?:boolean;sharedResolution?:boolean;adaptive?:boolean;cadence?:boolean;sharedRate?:boolean;datagrams?:boolean;audioEnabled?:boolean;audioBridge?:DesktopNativeAudioHooks["bridge"];synthetic?:boolean;audioFactory?:(hooks:DesktopNativeAudioHooks)=>DesktopAudioLease;
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
  fromViewer(raw: unknown,replacement?:{requested:DesktopNativeCodec;reason:"encoder"|"decoder"|"unavailable";retried:boolean}): boolean {
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
    if(m.type==="native_codec_fallback"){
      const s=this.active;if(s&&(raw as {id?:string}).id===s.id&&this.hooks.codecs){if(s.codecName!=="h264"&&!s.retried)this.retryH264(s,"decoder");else if(s.peer)this.fallback(s);else this.stop("unavailable");}return true;
    }
    if(m.type==="native_format_ack"){
      if(!this.active?.peer)this.formatAck(raw);return true;
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
    if(!this.hooks.codecs)delete settings.codec;
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
      id,settings,requestedCodec:replacement?.requested??settings.codec??"h264",retried:replacement?.retried??false,...(replacement?{codecFallback:replacement.reason}:{}),generation:1,fps,started:false,...(this.hooks.cadence&&settings.adaptive?{quality:new DesktopNativeQuality({fps,kbps:settings.maxBitrateKbps,window:this.hooks.window??1},performance.now())}:{}),bitrate:settings.maxBitrateKbps,adaptAt:performance.now(),acks:0,losses:0,maxAck:0,
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
    this.hooks.send({type:"media_status",id,state:"negotiating",audio:false,...this.codecStatus(active),...(settings.audio?{nativeAudio:true}:{}),...(udp?{datagrams:true,iceServers:this.hooks.iceServers??[]}: {})});
    if(udp){
      active.peer=new DesktopNativeDatagrams({id,codecs:this.hooks.codecs===true,audio:settings.audio,audioFailed:()=>{if(this.active===active){active.settings.audio=false;active.audio?.stop(false);this.hooks.send({type:"native_audio_status",id,state:"unavailable"});}},iceServers:this.hooks.iceServers??[],send:value=>this.hooks.send(value),
        ready:()=>{if(this.active===active)this.begin(active);},
        ack:value=>{if(this.active===active)this.ack(value,true);},
        ...(this.hooks.adaptive?{formatAck:(value:unknown)=>{if(this.active===active)this.formatAck(value);}}:{}),
        keyframe:()=>{if(this.active===active&&active.started)this.hooks.write({type:"native_keyframe",id});},
        fail:()=>this.fallback(active)});
    }else this.begin(active);
    return true;
  }
  private begin(s:NonNullable<DesktopNativeVideo["active"]>){
    if(this.active!==s||s.started)return;s.started=true;s.at=performance.now();
    this.hooks.policy(true);
    this.hooks.write({type:"native_video",enabled:true,id:s.id,...(this.hooks.sharedRate?{adaptive:s.settings.adaptive}:{}),...(this.hooks.sharedResolution?{resolution:true}:{}),...(this.hooks.codecs?{codec:s.settings.codec??"h264"}:{}),bitrateKbps:s.settings.maxBitrateKbps,fps:s.settings.fps??this.hooks.fps,...(this.hooks.window===3?{window:3}:{})});
    if(s.settings.audio&&this.hooks.audioEnabled)s.audio=(this.hooks.audioFactory??(hooks=>new DesktopNativeAudio(hooks)))({...(this.hooks.nativePcm?{nativePcm:this.hooks.nativePcm}:{}),...(this.hooks.audioBridge?{bridge:this.hooks.audioBridge}:{}),id:s.id,synthetic:this.hooks.synthetic===true,active:()=>this.active===s&&s.settings.audio,videoTimestamp:()=>s.timestamp,
      write:value=>this.hooks.write(value),state:state=>{if(this.active===s)this.hooks.send({type:"native_audio_status",id:s.id,state});},
      send:bytes=>this.active===s&&(s.peer?s.peer.sendAudio(bytes):this.hooks.buffered()<=65536&&this.hooks.send(bytes))});
  }
  private fallback(s:NonNullable<DesktopNativeVideo["active"]>){
    if(this.active!==s||!s.peer)return;
    if(s.started)this.hooks.send({type:"native_transport_reset",id:s.id});
    const settings={...s.settings,udp:false};this.stop("stopped",false);
    this.fromViewer({type:"media",enabled:true,settings},s.codecFallback?{requested:s.requestedCodec,reason:s.codecFallback,retried:s.retried}:undefined);
  }
  private codecStatus(s:NonNullable<DesktopNativeVideo["active"]>){return this.hooks.codecs?{nativeCodecs:true,codecRequested:s.requestedCodec,...(s.codecName?{codec:s.codecName}:{}),...(s.codecFallback?{codecFallback:s.codecFallback}:{})}:{};}
  private retryH264(s:NonNullable<DesktopNativeVideo["active"]>,reason:"encoder"|"decoder"){
    if(this.active!==s||s.retried)return;
    if(!this.hooks.send({type:"native_codec_reset",id:s.id})){this.stop("congested");return;}const settings={...s.settings,codec:"h264"};this.stop("stopped",false);this.fromViewer({type:"media",enabled:true,settings},{requested:s.requestedCodec,reason,retried:true});
  }
  private ack(raw:unknown,direct:boolean){
    const ack=DesktopNativeVideoAck.parse(raw),s=this.active;
    if(!s||ack.id!==s.id||ack.generation!==s.generation||ack.seq<=s.lastAck)return;
    if(ack.dropped&&!direct)throw Error("Dropped ACK requires native datagrams");
    const pending=s.pending[0];if(ack.seq!==pending?.seq)throw Error("Native video ACK order");
    s.lastAck=ack.seq;if(!ack.dropped)s.drawnAt=pending.freshAt;s.pending.shift();
    const now=performance.now(),ackMs=Math.min(60000,Math.max(0,now-pending.at));
    if(direct){
      // Same reliable FIFO as frame notices, before releasing source credit.
      if(!this.hooks.send({...ack,type:"native_draw_ack"})){this.fallback(s);return;}
      s.acks++;if(ack.dropped)s.losses++;s.maxAck=Math.max(s.maxAck,ackMs);
      if(!s.quality&&s.settings.adaptive&&s.acks>=8&&now-s.adaptAt>=1000){
        let bitrate=s.bitrate;
        if(s.losses||s.maxAck>150)bitrate=Math.max(128,Math.floor(bitrate*.8));
        else if(s.maxAck<60)bitrate=Math.min(s.settings.maxBitrateKbps,Math.ceil(bitrate*1.1));
        if(bitrate!==s.bitrate){s.bitrate=bitrate;this.hooks.write({type:"native_bitrate",id:s.id,kbps:bitrate});}
        s.adaptAt=now;s.acks=s.losses=s.maxAck=0;
      }
    }
    const rate=!s.barrier?s.quality?.sample({ack:ackMs,cost:pending.captureMs+pending.conversionMs+pending.encodeMs,decode:ack.decodeMs??0,lost:ack.dropped===true,buffered:Math.max(this.hooks.buffered(),s.peer?.buffered()??0)},now):undefined;
    if(rate){s.bitrate=rate.kbps;s.fps=rate.fps;this.hooks.write({type:"native_rate",id:s.id,...rate});}
    if(this.hooks.window===3&&now-s.statsAt>=1000){s.statsAt=now;this.hooks.send({type:"native_video_stats",id:s.id,width:s.width!,height:s.height!,window:3,pending:s.pending.length,captureMs:pending.captureMs,conversionMs:pending.conversionMs,encodeMs:pending.encodeMs,ackMs,decodeMs:ack.decodeMs??0});}
    this.hooks.write({type:"native_video_ack",id:s.id,seq:ack.seq,...(this.hooks.sharedResolution&&ack.dropped?{dropped:true}:{})});
    if(!s.barrier&&s.resolution){
      const size=s.resolution.sample(Math.max(pending.captureMs+pending.conversionMs+pending.encodeMs,ack.decodeMs??0),now,ack.dropped===true||Math.max(this.hooks.buffered(),s.peer?.buffered()??0)>65536);
      if(size&&(size.width!==s.width||size.height!==s.height))this.profile(s,size);
    }
  }
  private profile(s:NonNullable<DesktopNativeVideo["active"]>,size:{width:number;height:number}){
    if(this.active!==s||s.barrier||!s.stream||s.generation>=0xffffffff)return;
    if(this.hooks.sharedResolution){this.hooks.write({type:"native_resolution",id:s.id,...size});return;}
    s.barrier={...size,generation:s.generation+1,at:performance.now()};
    if(!this.hooks.send({type:"native_profile_pending",id:s.id,generation:s.barrier.generation})){this.stop("congested");return;}
    this.hooks.write({type:"native_profile",id:s.id,generation:s.barrier.generation,...size,fps:s.fps,bitrateKbps:s.bitrate});
  }
  private formatAck(raw:unknown){
    const ack=DesktopNativeFormatAck.parse(raw),s=this.active,b=s?.barrier;
    if(!this.hooks.adaptive||!s||!b||ack.id!==s.id||ack.generation!==b.generation||ack.baseSeq!==b.baseSeq||performance.now()-b.at>=3000)return;
    if(!this.hooks.send({...ack,type:"native_format_ready"})){this.stop("congested");return;}
    s.nextFrameAt=b.at;delete s.barrier;s.at=performance.now();
    this.hooks.write({...ack,type:"native_profile_resume"});
  }
  fromHelper(raw: unknown): boolean {
    const m = raw as { type: string; id?: string };
    if(m.type==="native_profile_prepare"){
      const s=this.active;if(!s||m.id!==s.id)return true;
      const p=z.object({type:z.literal("native_profile_prepare"),id:z.string().uuid(),generation:z.number().int(),width:z.number().int().min(2),height:z.number().int().min(2)}).strict().parse(raw);
      if(!this.hooks.sharedResolution||!this.hooks.adaptive||!s.stream||s.barrier||p.generation!==s.generation+1||p.width>this.hooks.width||Math.abs(p.width/p.height-this.hooks.sourceWidth/this.hooks.sourceHeight)>.02)throw Error("Shared native profile preparation");
      s.barrier={width:p.width,height:p.height,generation:p.generation,at:performance.now()};
      if(!this.hooks.send({type:"native_profile_pending",id:s.id,generation:p.generation}))this.stop("congested");return true;
    }
    if(m.type==="native_profile_applied"){
      const s=this.active,b=s?.barrier;if(!s||m.id!==s.id)return true;
      if(!this.hooks.adaptive||!b)throw Error("Unexpected native profile");
      const p=z.object({type:z.literal("native_profile_applied"),id:z.string().uuid(),generation:z.number().int(),baseSeq:z.number().int(),width:z.number().int(),height:z.number().int(),codec:DesktopNativeCodecString}).strict().parse(raw);
      if(performance.now()-b.at>=3000||p.generation!==b.generation||p.baseSeq!==s.seq||s.pending.length||p.width!==b.width||p.height!==b.height)throw Error("Native profile barrier");
      if(!desktopCodecMatches(s.codecName??"h264",p.codec))throw Error("Codec family changed during resize");
      b.baseSeq=p.baseSeq;s.generation=p.generation;s.width=p.width;s.height=p.height;s.codec=p.codec;
      this.hooks.send({type:"media_stream",id:s.id,generation:s.generation,baseSeq:p.baseSeq,mime:desktopCodecMime(s.codecName??"h264"),...(this.hooks.codecs?{codecName:s.codecName??"h264"}:{}),codec:p.codec,width:p.width,height:p.height,...(s.peer?{datagrams:true}:{}),...(this.hooks.window===3?{window:3}:{})});
      return true;
    }
    if (m.type !== "native_frame" && m.type !== "native_video_stopped") return false;
    const s = this.active;
    if (!s || m.id !== s.id) return true;
    if(!s.started)throw Error("Native encoder started before peer");
    if (m.type === "native_video_stopped") {
      if(this.hooks.codecs&&s.codecName!=="h264"&&!s.retried&&(s.settings.codec??"h264")!=="h264")this.retryH264(s,"encoder");else if(s.peer)this.fallback(s);else this.stop("unavailable");
      return true;
    }
    const frame = HelperVideo.parse(raw);
    if (
      (frame.generation??1)!==s.generation ||
      s.barrier?.baseSeq!==undefined ||
      s.pending.length >= (this.hooks.window ?? 1) ||
      frame.seq !== s.seq + 1 ||
      frame.width > this.hooks.width ||
      frame.timestamp <= s.timestamp
    )
      throw Error("Native video frame order");
    if (
      Math.abs(frame.width / frame.height - this.hooks.sourceWidth / this.hooks.sourceHeight) >
        0.02 ||
      (this.hooks.exact && s.generation===1 &&
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
      const actual=frame.codecName??"h264",requested=s.settings.codec??"h264";
      if(!this.hooks.codecs&&(actual!=="h264"||frame.codecFallback))throw Error("Native codec not negotiated");
      if(actual!==requested&&(actual!=="h264"||!frame.codecFallback))throw Error("Unexpected native codec fallback");
      if(!frame.codec||!desktopCodecMatches(actual,frame.codec))throw Error("Native codec family mismatch");
      s.codecName=actual;
      if(frame.codecFallback){s.codecFallback=frame.codecFallback;s.retried=true;s.settings.codec="h264";}
      if (!frame.key || !frame.codec) throw Error("Native video requires initial SPS/IDR");
      this.hooks.send({ type: "media_status", id: s.id, state: "native", audio: false,...this.codecStatus(s),...(s.settings.audio?{nativeAudio:true}:{}),...(s.peer?{datagrams:true}:{}) });
      this.hooks.send({
        type: "media_stream",
        id: s.id,
        generation: s.generation,
        mime: desktopCodecMime(s.codecName??"h264"),
        ...(this.hooks.codecs?{codecName:s.codecName??"h264"}:{}),
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
      if(this.hooks.adaptive&&s.settings.adaptive){const width=this.hooks.sharedResolution?Math.min(this.hooks.width,this.hooks.sourceWidth):frame.width,height=this.hooks.sharedResolution?Math.round(this.hooks.sourceHeight*width/this.hooks.sourceWidth/2)*2:frame.height;s.resolution=new DesktopNativeResolution({width,height,fps:s.settings.fps??this.hooks.fps});}
    }
    const payload = encodeDesktopH264Packet(
      frame.timestamp,
      frame.key,
      Buffer.from(frame.data, "base64"),
    );
    s.seq = frame.seq;
    s.pending.push({
      seq: frame.seq,
      at: performance.now(),freshAt:s.nextFrameAt??performance.now(),
      captureMs: frame.captureMs ?? 0,
      conversionMs: frame.conversionMs ?? 0,
      encodeMs: frame.encodeMs ?? 0,
    });
    delete s.nextFrameAt;
    s.timestamp = frame.timestamp;
    s.at = performance.now();
    if(s.peer){
      if(!this.hooks.send({type:"native_frame_notice",id:s.id,generation:s.generation,seq:frame.seq,bytes:payload.length})||!s.peer.send(frame.seq,payload))this.fallback(s);
    }else if (!this.hooks.send(encodeDesktopMediaChunk(s.generation, frame.seq, payload))) this.stop("congested");
    return true;
  }
  tick(now = performance.now()) {
    const s = this.active;
    if(s?.barrier){if(now-s.barrier.at>=3000)this.stop("unavailable");return;}
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
