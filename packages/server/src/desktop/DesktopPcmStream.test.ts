import {expect,it,vi} from "vitest";
import {DESKTOP_PCM_HELLO,DESKTOP_PCM_BYTES} from "@sodashitsu/protocol";
import {DesktopPcmStream} from "./DesktopPcmStream.js";
function frame(seq:number,timestamp=seq*20000){const b=Buffer.alloc(16+DESKTOP_PCM_BYTES);b.writeUInt32LE(DESKTOP_PCM_BYTES);b.writeUInt32LE(seq,4);b.writeBigUInt64LE(BigInt(timestamp),8);b.fill(seq,16);return b;}
it("reads arbitrarily split PCM headers and aligned frame copies without retaining the input buffer",()=>{
 const ready=vi.fn(),received:any[]=[],stream=new DesktopPcmStream(ready,f=>received.push(f)),bytes=Buffer.concat([DESKTOP_PCM_HELLO,frame(1),frame(2)]);
 for(let i=0;i<bytes.length;i+=7)stream.push(bytes.subarray(i,i+7));expect(ready).toHaveBeenCalledOnce();expect(received.map(f=>f.seq)).toEqual([1,2]);bytes.fill(0);expect(received[1].pcm.every((v:number)=>v===2)).toBe(true);expect(received[0].timestamp).toBe(20000);stream.clear();
});
it("rejects unsupported formats, oversized PCM, nonconsecutive sequence and unsafe timestamps before encoding",()=>{
 const invalid=DESKTOP_PCM_HELLO.slice();invalid[5]=1;expect(()=>new DesktopPcmStream(()=>{},()=>{}).push(invalid)).toThrow("format");
 for(const kind of ["size","seq","timestamp"]){const b=frame(1);if(kind==="size")b.writeUInt32LE(0xffffffff);if(kind==="seq")b.writeUInt32LE(2,4);if(kind==="timestamp")b.writeBigUInt64LE(9007199254740992n,8);const receive=vi.fn(),stream=new DesktopPcmStream(()=>{},receive);expect(()=>stream.push(Buffer.concat([DESKTOP_PCM_HELLO,b]))).toThrow();expect(receive).not.toHaveBeenCalled();}
});
