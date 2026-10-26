import {it,expect,vi} from "vitest";
import {encodeDesktopDatagrams,encodeDesktopH264Packet,decodeDesktopDatagram} from "@sodashitsu/protocol";
import {DesktopDatagramFrames} from "./datagramFrames.js";
function setup(ready=true){let now=0;const frame=vi.fn(),drop=vi.fn(),keyframe=vi.fn();const frames=new DesktopDatagramFrames({now:()=>now,frame,drop,keyframe},ready);return {frames,frame,drop,keyframe,time:(v:number)=>now=v};}
function packet(seq:number,key=seq===1,size=100){return encodeDesktopH264Packet(seq*16667,key,new Uint8Array(size).fill(seq));}
it("reassembles bounded reversed fragments once, including packets arriving before reliable notices",()=>{
 const f=setup(),p=packet(1,true,40000),parts=encodeDesktopDatagrams(1,p);for(const part of [...parts].reverse())f.frames.fragment(part);
 expect(f.frame).toHaveBeenCalledExactlyOnceWith(1,p);f.frames.notice(1,p.length);f.frames.fragment(parts[0]!);expect(f.frame).toHaveBeenCalledOnce();
});
it("waits for format before delivering early packets, without needing a late reliable notice",()=>{
 const f=setup(false),p=packet(1);f.frames.fragment(encodeDesktopDatagrams(1,p)[0]!);expect(f.frame).not.toHaveBeenCalled();f.frames.start();expect(f.frame).toHaveBeenCalledExactlyOnceWith(1,p);f.frames.notice(1,p.length);
});
it("expires a completely lost frame, drops dependent deltas and resumes at the next IDR",()=>{
 const f=setup(),p1=packet(1),p2=packet(2),p3=packet(3,true);f.frames.notice(1,p1.length);
 f.time(25);f.frames.notice(2,p2.length);f.frames.fragment(encodeDesktopDatagrams(2,p2)[0]!);f.time(50);f.frames.notice(3,p3.length);f.frames.fragment(encodeDesktopDatagrams(3,p3)[0]!);
 f.time(149);f.frames.tick();expect(f.frame).not.toHaveBeenCalled();f.time(150);f.frames.tick();expect(f.drop.mock.calls.flat()).toEqual([1,2]);expect(f.frame).toHaveBeenCalledExactlyOnceWith(3,p3);
 const p4=packet(4,true);f.frames.notice(4,p4.length);f.frames.fragment(encodeDesktopDatagrams(4,p4)[0]!);expect(f.frame).toHaveBeenLastCalledWith(4,p4);expect(f.keyframe).toHaveBeenCalledTimes(2);
});
it("rejects conflicting duplicates/total sizes and a fourth outstanding frame",()=>{
 const f=setup(),p=packet(1,true,40000),parts=encodeDesktopDatagrams(1,p);f.frames.fragment(parts[0]!);const altered=parts[0]!.slice();altered[20]=altered[20]!^1;
 expect(()=>f.frames.fragment(altered)).toThrow("Conflicting");expect(()=>f.frames.notice(1,p.length-1)).toThrow("Conflicting");
 expect(()=>f.frames.fragment(encodeDesktopDatagrams(4,packet(4))[0]!)).toThrow("window");
});
it("validates fragment lengths, reserved fields and limits, respecting Uint8Array offsets",()=>{
 const part=encodeDesktopDatagrams(1,packet(1,true,40000))[0]!,offset=new Uint8Array(part.length+9);offset.set(part,9);expect(decodeDesktopDatagram(offset.subarray(9)).seq).toBe(1);
 for(const at of [4,5,8,10,12]){const bad=part.slice();bad[at]=255;expect(()=>decodeDesktopDatagram(bad)).toThrow();}
 expect(()=>decodeDesktopDatagram(part.subarray(0,part.length-1))).toThrow();expect(()=>encodeDesktopDatagrams(1,new Uint8Array(600000))).toThrow();
});
it("stops timers/retained frames and never paints a complete but expired frame",()=>{
 const f=setup(false),p=packet(1);f.frames.fragment(encodeDesktopDatagrams(1,p)[0]!);f.time(151);f.frames.start();expect(f.drop).toHaveBeenCalledExactlyOnceWith(1);expect(f.frame).not.toHaveBeenCalled();f.frames.stop();f.frames.notice(2,p.length);f.frames.fragment(encodeDesktopDatagrams(2,p)[0]!);expect(f.frame).not.toHaveBeenCalled();
});

it("expires an entirely missing access unit from a later fragment without waiting for reliable notices",()=>{
 const f=setup(),p2=packet(2),p3=packet(3,true);f.frames.fragment(encodeDesktopDatagrams(2,p2)[0]!);f.time(151);f.frames.tick();
 expect(f.drop.mock.calls.flat()).toEqual([1,2]);expect(f.frame).not.toHaveBeenCalled();f.frames.fragment(encodeDesktopDatagrams(3,p3)[0]!);expect(f.frame).toHaveBeenCalledExactlyOnceWith(3,p3);
 // Notices may arrive after direct rendering/ACK; they cannot resurrect a drop.
 f.frames.notice(1,packet(1).length);f.frames.notice(2,p2.length);f.frames.notice(3,p3.length);expect(f.frame).toHaveBeenCalledOnce();
});

it('resets only the decoder boundary, discards old fragments and keeps global sequence monotonic',()=>{
 const f=setup(false),old=packet(1,true,40000);f.frames.fragment(encodeDesktopDatagrams(1,old)[0]!);
 f.frames.reset(7);f.frames.start();for(const part of encodeDesktopDatagrams(1,old))f.frames.fragment(part);expect(f.frame).not.toHaveBeenCalled();
 const p=packet(8,true);f.frames.notice(8,p.length);for(const part of encodeDesktopDatagrams(8,p))f.frames.fragment(part);expect(f.frame).toHaveBeenCalledExactlyOnceWith(8,p);
 expect(()=>f.frames.notice(1,p.length)).toThrow('order');
});
