import {expect,it} from "vitest";
import {encodeDesktopAudio,decodeDesktopAudio,isDesktopAudio} from "./desktopAudio.js";
it("bounds Opus packets and validates offsets/reserved/timestamps without image or input semantics",()=>{
 const packet=encodeDesktopAudio(1,9,20000,new Uint8Array([1,2,3])),backing=new Uint8Array(packet.length+7);backing.set(packet,7);expect(isDesktopAudio(packet)).toBe(true);expect(decodeDesktopAudio(backing.subarray(7))).toEqual({generation:1,seq:9,timestamp:20000,data:new Uint8Array([1,2,3])});
 for(const i of [4,5,6,7]){const bad=packet.slice();bad[i]=255;expect(()=>decodeDesktopAudio(bad)).toThrow();}
 const bad=packet.slice();new DataView(bad.buffer).setFloat64(16,NaN);expect(()=>decodeDesktopAudio(bad)).toThrow();expect(()=>decodeDesktopAudio(packet.subarray(0,24))).toThrow();expect(()=>encodeDesktopAudio(1,1,0,new Uint8Array(8193))).toThrow();
});
