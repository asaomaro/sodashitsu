import { z } from "zod";
import { DESKTOP_MEDIA_CHUNK_LIMIT, DesktopNativeVideoAck } from "./desktopMedia.js";
export const DESKTOP_DATAGRAM_PROTOCOL = "soda-desktop-datagrams-v1";
export const DESKTOP_VIDEO_CHANNEL = "soda-h264-v1";
export const DESKTOP_CONTROL_CHANNEL = "soda-native-control-v1";
export const DESKTOP_DATAGRAM_BYTES = 16384;
const HEADER = 20, PAYLOAD = DESKTOP_DATAGRAM_BYTES - HEADER;
const magic = [83, 68, 85, 68];
export const DesktopNativeFrameNotice = z.object({
  type: z.literal("native_frame_notice"), id: z.string().uuid(), generation: z.literal(1),
  seq: z.number().int().min(1).max(0xffffffff), bytes: z.number().int().min(10).max(DESKTOP_MEDIA_CHUNK_LIMIT),
}).strict();
export const DesktopNativeDrawAck = DesktopNativeVideoAck.omit({type:true}).extend({type:z.literal("native_draw_ack")}).strict();
export const DesktopNativeKeyframe = z.object({type:z.literal("native_keyframe"),id:z.string().uuid()}).strict();
/** A peer lifetime binds these fragments to one authenticated stream id. */
export function encodeDesktopDatagrams(seq:number, bytes:Uint8Array):Uint8Array[] {
  if(!Number.isInteger(seq)||seq<1||seq>0xffffffff||bytes.length<10||bytes.length>DESKTOP_MEDIA_CHUNK_LIMIT)throw Error("Datagram frame limit");
  const count=Math.ceil(bytes.length/PAYLOAD), packets:Uint8Array[]=[];
  for(let part=0;part<count;part++){
    const payload=bytes.subarray(part*PAYLOAD,(part+1)*PAYLOAD),out=new Uint8Array(HEADER+payload.length),view=new DataView(out.buffer);
    out.set(magic);out[4]=1;view.setUint16(6,part);view.setUint16(8,count);view.setUint32(12,bytes.length);view.setUint32(16,seq);out.set(payload,HEADER);packets.push(out);
  }
  return packets;
}
export function decodeDesktopDatagram(bytes:Uint8Array){
  if(bytes.length<=HEADER||bytes.length>DESKTOP_DATAGRAM_BYTES||!magic.every((b,i)=>bytes[i]===b)||bytes[4]!==1||bytes[5]!==0||bytes[10]!==0||bytes[11]!==0)throw Error("Invalid native datagram");
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),part=view.getUint16(6),count=view.getUint16(8),total=view.getUint32(12),seq=view.getUint32(16);
  if(!seq||total<10||total>DESKTOP_MEDIA_CHUNK_LIMIT||count!==Math.ceil(total/PAYLOAD)||part>=count||bytes.length-HEADER!==Math.min(PAYLOAD,total-part*PAYLOAD))throw Error("Invalid native fragment size");
  return {seq,part,count,total,data:bytes.subarray(HEADER)};
}
