import {expect,it} from "vitest";
import {encodeDesktopCursor,decodeDesktopCursor,isDesktopCursor,type DesktopCursorInfo} from "./desktopCursor.js";
const pose:DesktopCursorInfo={type:"cursor",seq:1,visible:true,x:.5,y:.25,shapeId:1};
const shape={kind:2 as const,width:2,height:2,pitch:8,hotspotX:1,hotspotY:1,premultiplied:true};
it("roundtrips shape/pose without consuming image metadata, including subarray byte offsets",()=>{
 const data=new Uint8Array(16).fill(128),bytes=encodeDesktopCursor({...pose,shape},data),offset=new Uint8Array(bytes.length+7);offset.set(bytes,7);
 expect(isDesktopCursor(bytes)).toBe(true);expect(decodeDesktopCursor(offset.subarray(7))).toEqual({info:{...pose,shape},data});
 expect(decodeDesktopCursor(encodeDesktopCursor(pose)).data.length).toBe(0);
});
it("accepts padded monochrome AND/XOR planes and hidden positions without any shape",()=>{
 const mono={...shape,kind:1 as const,width:9,pitch:4,hotspotX:8};
 expect(decodeDesktopCursor(encodeDesktopCursor({...pose,shape:mono},new Uint8Array(16))).info.shape).toEqual(mono);
 expect(()=>encodeDesktopCursor({...pose,visible:false,shapeId:0})).not.toThrow();
});
it.each(["bytes","version","reserved","metadata","geometry","hotspot","zero-shape","extra"])("rejects malformed cursor %s",fault=>{
 let info:any={...pose,shape},data=new Uint8Array(16),bytes=encodeDesktopCursor(info,data);
 if(fault==="bytes")bytes=bytes.subarray(0,bytes.length-1);
 if(fault==="version")bytes[4]=2;
 if(fault==="reserved")bytes[5]=1;
 if(fault==="metadata"){bytes[6]=255;bytes[7]=255;}
 if(fault==="geometry")info={...info,shape:{...shape,width:257}};
 if(fault==="hotspot")info={...info,shape:{...shape,hotspotX:2}};
 if(fault==="zero-shape")info={...info,shapeId:0};
 if(fault==="extra")info={...info,control:true};
 expect(()=>fault==="bytes"||fault==="version"||fault==="reserved"||fault==="metadata"?decodeDesktopCursor(bytes):encodeDesktopCursor(info,data)).toThrow();
});
