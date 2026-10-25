import { z } from "zod";
export const DESKTOP_CURSOR_PROTOCOL = "soda-desktop-cursor-v1";
export const DESKTOP_CURSOR_MAX_BYTES = 512 * 1024;
const Shape = z.object({
  kind:z.union([z.literal(1),z.literal(2),z.literal(4)]),
  width:z.number().int().min(1).max(256),height:z.number().int().min(1).max(256),
  pitch:z.number().int().min(1).max(2048),
  hotspotX:z.number().int().min(0).max(255),hotspotY:z.number().int().min(0).max(255),
  premultiplied:z.boolean().optional(),
}).strict().refine(s=>s.hotspotX<s.width&&s.hotspotY<s.height&&s.pitch>=(s.kind===1?Math.ceil(s.width/8):s.width*4));
export const DesktopCursorInfo=z.object({
  type:z.literal("cursor"),seq:z.number().int().min(1).max(0xffffffff),
  visible:z.boolean(),x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1),
  shapeId:z.number().int().min(0).max(0xffffffff),shape:Shape.optional(),
}).strict().refine(s=>!s.visible||s.shapeId>0);
export type DesktopCursorInfo=z.infer<typeof DesktopCursorInfo>;
export type DesktopCursorPacket={info:DesktopCursorInfo;data:Uint8Array};
const magic=[83,68,67,85];
export function isDesktopCursor(bytes:Uint8Array):boolean{return bytes.length>=4&&magic.every((b,i)=>bytes[i]===b);}
function validate(info:DesktopCursorInfo,data:Uint8Array){
 const expected=info.shape?info.shape.pitch*info.shape.height*(info.shape.kind===1?2:1):0;
 if(data.byteLength!==expected||data.byteLength>DESKTOP_CURSOR_MAX_BYTES||(info.shape&&info.shapeId===0))throw Error("Invalid cursor shape bytes");
}
export function parseDesktopCursor(info:unknown,data:Uint8Array):DesktopCursorPacket {const parsed=DesktopCursorInfo.parse(info);validate(parsed,data);return {info:parsed,data};}
export function encodeDesktopCursor(info:DesktopCursorInfo,data:Uint8Array=new Uint8Array()):Uint8Array {
 info=DesktopCursorInfo.parse(info);validate(info,data);
 const json=new TextEncoder().encode(JSON.stringify(info));if(json.length>2048)throw Error("Cursor metadata limit");
 const packet=new Uint8Array(8+json.length+data.length);packet.set(magic);packet[4]=1;new DataView(packet.buffer).setUint16(6,json.length);packet.set(json,8);packet.set(data,8+json.length);return packet;
}
export function decodeDesktopCursor(bytes:Uint8Array):DesktopCursorPacket {
 if(!isDesktopCursor(bytes)||bytes.length<8||bytes.length>DESKTOP_CURSOR_MAX_BYTES+2056||bytes[4]!==1||bytes[5]!==0)throw Error("Invalid cursor packet");
 const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(6);
 if(size<2||size>2048||8+size>bytes.length)throw Error("Cursor metadata limit");
 const info=DesktopCursorInfo.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(8,8+size)))),data=bytes.subarray(8+size);
 validate(info,data);return {info,data};
}
