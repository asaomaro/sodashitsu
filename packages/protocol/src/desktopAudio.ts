import {z} from "zod";
export const DESKTOP_AUDIO_PROTOCOL="soda-desktop-audio-v1";
export const DESKTOP_AUDIO_CHANNEL="soda-opus-v1";
export const DESKTOP_AUDIO_MAX_BYTES=8192;
export const DESKTOP_PCM_BYTES=3840;
export const DESKTOP_PCM_HELLO=new Uint8Array([83,68,65,80,1,2,16,0,128,187,0,0,192,3,0,0]);
export const DesktopNativeAudioStatus=z.object({type:z.literal("native_audio_status"),id:z.string().uuid(),state:z.enum(["starting","running","unavailable","stopped"])}).strict();
export const DesktopNativeAudioControl=z.object({type:z.literal("native_audio_control"),id:z.string().uuid(),enabled:z.literal(false)}).strict();
const magic=[83,68,65,85];
export function isDesktopAudio(bytes:Uint8Array){return bytes.length>=4&&magic.every((b,i)=>bytes[i]===b);}
export function encodeDesktopAudio(generation:number,seq:number,timestamp:number,data:Uint8Array){
 if(!Number.isInteger(generation)||generation<1||generation>0xffffffff||!Number.isInteger(seq)||seq<1||seq>0xffffffff||!Number.isSafeInteger(timestamp)||timestamp<0||data.length<1||data.length>DESKTOP_AUDIO_MAX_BYTES)throw Error("Native audio limits");
 const out=new Uint8Array(24+data.length),view=new DataView(out.buffer);out.set(magic);out[4]=1;view.setUint32(8,generation);view.setUint32(12,seq);view.setFloat64(16,timestamp);out.set(data,24);return out;
}
export function decodeDesktopAudio(bytes:Uint8Array){
 if(!isDesktopAudio(bytes)||bytes.length<25||bytes.length>24+DESKTOP_AUDIO_MAX_BYTES||bytes[4]!==1||bytes[5]!==0||bytes[6]!==0||bytes[7]!==0)throw Error("Invalid native audio packet");
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),generation=view.getUint32(8),seq=view.getUint32(12),timestamp=view.getFloat64(16);
 if(!generation||!seq||!Number.isSafeInteger(timestamp)||timestamp<0)throw Error("Invalid native audio timestamp/order");
 return {generation,seq,timestamp,data:bytes.subarray(24)};
}
