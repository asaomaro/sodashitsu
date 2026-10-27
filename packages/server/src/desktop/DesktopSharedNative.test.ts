import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { DesktopSharedNative } from "./DesktopSharedNative.js";

// Previously generated hardware packets. No capture/encoder/OS input in this test.
const fixture = JSON.parse(readFileSync(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url), "utf8"));
function setup() {
  const commands: any[] = [], messages = new Map<object, any[]>(), policies: boolean[] = [];
  const native = new DesktopSharedNative<object>({ window: 3, now:()=>1000, write: value => commands.push(value), send: (member, value) => { const list = messages.get(member) ?? []; list.push(value); messages.set(member, list); }, policy: active => policies.push(active) });
  const a = {}, b = {}, aid = randomUUID(), bid = randomUUID();
  const start = (member: object, id: string, overrides = {}) => native.command(member, { type: "native_video", enabled: true, id, fps: 30, bitrateKbps: 2500, codec: "h264", ...overrides });
  const ack = (member: object, id: string, seq: number) => native.command(member, { type: "native_video_ack", id, seq });
  const frame = (seq: number, key = false) => {
    const packet = fixture.packets[key ? 0 : 1];
    return { type: "native_frame", id: commands.findLast(m => m.type === "native_video" && m.enabled).id, seq, timestamp: seq * 33333, key, codecName: "h264", ...(key ? { codec: packet.codec } : {}), width: fixture.width, height: fixture.height, data: packet.data };
  };
  return { native, commands, messages, policies, a, b, aid, bid, start, ack, frame };
}

it("encodes once while a slow consumer drops references and rejoins only at a future key frame", () => {
  const f = setup(); f.start(f.a, f.aid); f.start(f.b, f.bid);
  f.native.receive(f.frame(1, true)); f.ack(f.a, f.aid, 1);
  f.native.receive(f.frame(2)); f.ack(f.a, f.aid, 2);
  f.ack(f.b, f.bid, 1);
  f.native.receive(f.frame(3)); f.ack(f.a, f.aid, 3);
  expect(f.messages.get(f.b)?.map(m => m.seq)).toEqual([1]);
  f.native.receive(f.frame(4, true));
  expect(f.messages.get(f.a)?.map(m => m.seq)).toEqual([1, 2, 3, 4]);
  expect(f.messages.get(f.b)?.map(m => [m.seq, m.timestamp, m.key])).toEqual([[1, 33333, true], [2, 133332, true]]);
  expect(f.commands.filter(m => m.type === "native_video" && m.enabled)).toHaveLength(1);
  expect(f.commands.filter(m => m.type === "native_video_ack").map(m => m.seq)).toEqual([1, 2, 3, 4]);
  f.native.dispose();
});

it("does not replay a previous key frame and keeps pending windows independent", () => {
  const f = setup(); f.start(f.a, f.aid, { window: 3 }); f.native.receive(f.frame(1, true));
  f.start(f.b, f.bid);
  expect(f.messages.get(f.b)).toBeUndefined();
  f.native.receive(f.frame(2)); f.native.receive(f.frame(3)); f.native.receive(f.frame(4));
  expect(f.messages.get(f.a)?.map(m => m.seq)).toEqual([1, 2, 3]);
  expect(f.messages.get(f.b)).toBeUndefined();
  f.ack(f.a, f.aid, 1); f.native.receive(f.frame(5, true));
  expect(f.messages.get(f.a)?.map(m => m.seq)).toEqual([1, 2, 3]);
  expect(f.messages.get(f.b)?.map(m => m.seq)).toEqual([1]);
  f.ack(f.a, f.aid, 2); f.ack(f.a, f.aid, 3);
  f.native.receive(f.frame(6, true));
  expect(f.messages.get(f.a)?.at(-1)).toMatchObject({ seq: 4, timestamp: 199998, key: true });
  f.native.dispose();
});

it("isolates different encoder settings and stops only when the last native subscriber leaves", () => {
  const f = setup(); f.start(f.a, f.aid); f.start(f.b, f.bid, { bitrateKbps: 5000 });
  expect(f.messages.get(f.b)).toEqual([{ type: "native_video_stopped", id: f.bid }]);
  expect(f.commands.filter(m => m.type === "native_video" && m.enabled)).toHaveLength(1);
  f.start(f.b, f.bid); f.native.detach(f.a);
  expect(f.commands.some(m => m.type === "native_video" && !m.enabled)).toBe(false);
  f.native.receive(f.frame(1, true));
  expect(f.messages.get(f.b)?.at(-1)).toMatchObject({ id: f.bid, seq: 1 });
  f.native.detach(f.b);
  expect(f.commands.filter(m => m.type === "native_video" && !m.enabled)).toHaveLength(1);
  expect(f.policies).toEqual([true, false]);
  expect(f.commands.some(m => m.type === "release" || m.type === "control")).toBe(false);
});

it("checks each consumer ACK against its own id and local sequence", () => {
  const f = setup(); f.start(f.a, f.aid); f.start(f.b, f.bid); f.native.receive(f.frame(1, true));
  f.ack(f.a, f.bid, 1);
  expect(() => f.ack(f.a, f.aid, 2)).toThrow(/ACK order/);
  f.native.receive(f.frame(2));
  expect(f.messages.get(f.a)).toHaveLength(1);
  f.ack(f.a, f.aid, 1); f.native.receive(f.frame(3, true));
  expect(f.messages.get(f.a)).toHaveLength(2);
  expect(f.messages.get(f.b)).toHaveLength(1);
  f.native.dispose();
});

it("forgets all decoder credit on source stop and never accepts an old generation frame", () => {
  const f = setup(); f.start(f.a, f.aid); f.start(f.b, f.bid); const old = f.frame(1, true);
  f.native.receive(old);
  f.native.receive({ type: "native_video_stopped", id: old.id });
  expect(f.messages.get(f.a)?.at(-1)).toEqual({ type: "native_video_stopped", id: f.aid });
  f.start(f.a, randomUUID());
  expect(f.frame(1, true).id).not.toBe(old.id);
  expect(f.native.receive(old)).toBe(true);
  expect(f.messages.get(f.a)).toHaveLength(2);
  f.native.dispose();
});

it.each(["sequence", "timestamp", "generation", "format", "configuration"])("rejects invalid source %s before issuing source credit", kind => {
  const f = setup(); f.start(f.a, f.aid); f.native.receive(f.frame(1, true));
  const next = f.frame(2);
  if (kind === "sequence") next.seq = 3;
  if (kind === "timestamp") next.timestamp = 1;
  if (kind === "generation") Object.assign(next, { generation: 2 });
  if (kind === "format") next.width += 2;
  if (kind === "configuration") Object.assign(next, { codec: "avc1.640034" });
  expect(() => f.native.receive(next)).toThrow();
  expect(f.commands.filter(m => m.type === "native_video_ack")).toHaveLength(1);
  f.native.dispose();
});

it("requires an explicit fallback when the encoder returns a different codec",()=>{
 const f=setup();f.start(f.a,f.aid,{codec:"hevc"});
 expect(()=>f.native.receive(f.frame(1,true))).toThrow(/fallback/);
 expect(f.commands.filter(m=>m.type==="native_video_ack")).toHaveLength(0);f.native.dispose();
});

it("carries the established fallback proof to a late consumer's future key frame",()=>{
 const f=setup();f.start(f.a,f.aid,{codec:"hevc"});
 f.native.receive({...f.frame(1,true),codecFallback:"unavailable"});f.ack(f.a,f.aid,1);
 f.start(f.b,f.bid,{codec:"hevc"});f.native.receive(f.frame(2));f.ack(f.a,f.aid,2);
 expect(f.messages.get(f.b)).toBeUndefined();f.native.receive(f.frame(3,true));
 expect(f.messages.get(f.b)?.[0]).toMatchObject({codecName:"h264",codecFallback:"unavailable",key:true,seq:1});f.native.dispose();
});


it("maps consumer keyframe recovery to the live source without borrowing another viewer id",()=>{
 const f=setup();f.start(f.a,f.aid);f.start(f.b,f.bid);f.native.receive(f.frame(1,true));
 const root=f.frame(2).id;
 f.native.command(f.a,{type:"native_keyframe",id:f.bid});
 expect(f.commands.some(m=>m.type==="native_keyframe")).toBe(false);
 f.native.command(f.a,{type:"native_keyframe",id:f.aid});
 f.native.command(f.b,{type:"native_keyframe",id:f.bid});
 const requests=f.commands.filter(m=>m.type==="native_keyframe");
 expect(requests).toHaveLength(1);expect(requests[0].id).toBe(root);expect([f.aid,f.bid]).not.toContain(root);
 f.ack(f.a,f.aid,1);f.ack(f.b,f.bid,1);f.native.receive(f.frame(2));
 expect(f.messages.get(f.a)).toHaveLength(1);expect(f.messages.get(f.b)).toHaveLength(1);
 f.native.receive(f.frame(3,true));
 expect(f.messages.get(f.a)?.at(-1)).toMatchObject({seq:2,key:true});expect(f.messages.get(f.b)?.at(-1)).toMatchObject({seq:2,key:true});f.native.dispose();
});

it("ignores recovery from a retired consumer and never applies it to a new source",()=>{
 const f=setup();f.start(f.a,f.aid);f.native.detach(f.a);
 const id= randomUUID();f.start(f.a,id);f.native.command(f.a,{type:"native_keyframe",id:f.aid});
 expect(f.commands.some(m=>m.type==="native_keyframe")).toBe(false);
 f.native.command(f.a,{type:"native_keyframe",id});expect(f.commands.filter(m=>m.type==="native_keyframe")).toHaveLength(1);f.native.dispose();
});

it("aggregates adaptive requests without a single slow viewer lowering the other viewer",()=>{
 const f=setup();f.start(f.a,f.aid,{adaptive:true});f.start(f.b,f.bid,{adaptive:true});
 const rate=(member:object,id:string,fps:number,kbps:number)=>f.native.command(member,{type:"native_rate",id,fps,kbps});
 rate(f.a,f.aid,10,1000);expect(f.commands.filter(m=>m.type==="native_rate")).toHaveLength(0);
 rate(f.b,f.bid,15,1500);expect(f.commands.at(-1)).toMatchObject({type:"native_rate",id:f.frame(1,true).id,fps:15,kbps:1500});
 rate(f.a,f.aid,20,2000);expect(f.commands.at(-1)).toMatchObject({fps:20,kbps:2000});
 f.native.detach(f.a);expect(f.commands.at(-1)).toMatchObject({fps:15,kbps:1500});
 f.start(f.a,f.aid,{adaptive:true});expect(f.commands.at(-1)).toMatchObject({fps:30,kbps:2500});expect(f.commands.filter(m=>m.type==="native_video"&&m.enabled)).toHaveLength(1);f.native.dispose();
});
it("fixed peers retain their ceiling, and rate messages cannot cross ids, generations or limits",()=>{
 const f=setup();f.start(f.a,f.aid,{adaptive:true});f.start(f.b,f.bid);
 f.native.command(f.a,{type:"native_rate",id:f.aid,fps:10,kbps:1000});f.native.command(f.b,{type:"native_rate",id:f.bid,fps:5,kbps:128});f.native.command(f.a,{type:"native_rate",id:f.bid,fps:5,kbps:128});expect(f.commands.some(m=>m.type==="native_rate")).toBe(false);
 expect(()=>f.native.command(f.a,{type:"native_rate",id:f.aid,fps:31,kbps:2500})).toThrow(/limits/);expect(()=>f.native.command(f.a,{type:"native_rate",id:f.aid,fps:10,kbps:2501})).toThrow(/limits/);
 f.native.detach(f.b);expect(f.commands.at(-1)).toMatchObject({fps:10,kbps:1000});f.native.detach(f.a);f.start(f.a,"11111111-1111-4111-8111-111111111111",{adaptive:true});const count=f.commands.length;f.native.command(f.a,{type:"native_rate",id:f.aid,fps:5,kbps:128});expect(f.commands).toHaveLength(count);f.native.dispose();
});

// Profiles contain matching generated SPS/IDR pixels for both dimensions.
const profiles=JSON.parse(readFileSync(new URL("../../../../scripts/remote-desktop/fixtures/h264-native-adaptive.json",import.meta.url),"utf8")).profiles;
function profileSetup(){
 const commands:any[]=[],messages=new Map<object,any[]>(),policies:boolean[]=[],native=new DesktopSharedNative<object>({adaptive:true,window:3,write:value=>commands.push(value),send:(member,value)=>{const rows=messages.get(member)??[];rows.push(value);messages.set(member,rows);},policy:active=>policies.push(active)}),a={},b={},c={},ids=new Map([[a,randomUUID()],[b,randomUUID()],[c,randomUUID()]]);
 const start=(member:object,resolution=true)=>native.command(member,{type:"native_video",enabled:true,id:ids.get(member),fps:30,bitrateKbps:2500,codec:"h264",window:3,adaptive:true,resolution});
 const source=()=>commands.find(m=>m.type==="native_video"&&m.enabled).id;
 const frame=(seq:number,generation=1,profile=0)=>{const p=profiles[profile],packet=p.packets[0];native.receive({type:"native_frame",id:source(),seq,generation,timestamp:seq*33333,key:true,codecName:"h264",codec:packet.codec,width:p.width,height:p.height,data:packet.data});};
 const request=(member:object,width=960,height=600)=>native.command(member,{type:"native_resolution",id:ids.get(member),width,height});
 const ack=(member:object,seq:number)=>native.command(member,{type:"native_video_ack",id:ids.get(member),seq});
 const apply=(seq:number)=>{const p=commands.findLast(m=>m.type==="native_profile"),codec=profiles.find((v:any)=>v.width===p.width).packets[0].codec;native.receive({type:"native_profile_applied",id:source(),generation:p.generation,baseSeq:seq,width:p.width,height:p.height,codec});};
 const resume=(member:object)=>{const p=messages.get(member)!.findLast(m=>m.type==="native_profile_applied");native.command(member,{type:"native_profile_resume",id:ids.get(member),generation:p.generation,baseSeq:p.baseSeq});};
 return{native,commands,messages,policies,a,b,c,ids,start,source,frame,request,ack,apply,resume};
}
it("resizes only at the aggregate request, drains each old ACK and keeps the common audio owner",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);const audio=f.native.audioSource(f.a,f.ids.get(f.a)!)!;f.request(f.a);expect(f.commands.some(m=>m.type==="native_profile")).toBe(false);f.request(f.b);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.apply(1);expect(f.messages.get(f.a)?.some(m=>m.type==="native_profile_applied")).toBe(false);f.ack(f.a,1);f.resume(f.a);expect(f.commands.some(m=>m.type==="native_profile_resume")).toBe(false);f.ack(f.b,1);f.resume(f.b);expect(f.commands.filter(m=>m.type==="native_profile_resume")).toEqual([{type:"native_profile_resume",id:f.source(),generation:2,baseSeq:1}]);f.frame(2,2,1);expect(f.messages.get(f.a)?.at(-1)).toMatchObject({type:"native_frame",seq:2,generation:2,width:960,height:600});expect(f.messages.get(f.b)?.at(-1)).toMatchObject({seq:2,generation:2});expect(audio.active()).toBe(true);expect(audio.timestamp()).toBe(66666);expect(f.native.audioSource(f.b,f.ids.get(f.b)!)?.id).toBe(audio.id);}finally{f.native.dispose();}
});
it("a joining fixed viewer restores the ceiling and receives generation one without old-frame replay",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);f.apply(1);f.resume(f.a);f.resume(f.b);f.frame(2,2,1);f.start(f.c,false);expect(f.messages.get(f.c)).toBeUndefined();f.ack(f.a,2);f.ack(f.b,2);expect(f.commands.findLast(m=>m.type==="native_profile")).toMatchObject({generation:3,width:1280,height:800});f.apply(2);f.resume(f.a);f.resume(f.b);f.frame(3,3,0);expect(f.messages.get(f.c)).toBeUndefined();expect(f.commands.findLast(m=>m.type==="native_keyframe")).toMatchObject({id:f.source()});f.frame(4,3,0);expect(f.messages.get(f.c)?.at(-1)).toMatchObject({seq:1,generation:1,width:1280});expect(f.messages.get(f.a)?.at(-1)).toMatchObject({seq:4,generation:3});f.request(f.a);f.request(f.b);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(2);f.ack(f.a,3);f.ack(f.b,3);f.native.detach(f.c);expect(f.commands.findLast(m=>m.type==="native_profile")).toMatchObject({generation:4,width:960});}finally{f.native.dispose();}
});
it.each(["generation","base","size","codec"])("rejects an inconsistent shared profile %s",kind=>{
 const f=profileSetup();try{f.start(f.a);f.frame(1);f.ack(f.a,1);f.request(f.a);const p={type:"native_profile_applied",id:f.source(),generation:2,baseSeq:1,width:960,height:600,codec:profiles[1].packets[0].codec};if(kind==="generation")p.generation=3;if(kind==="base")p.baseSeq=0;if(kind==="size")p.width=1280;if(kind==="codec")p.codec="hvc1.1.6.L120.B0";expect(()=>f.native.receive(p)).toThrow();expect(f.commands.some(m=>m.type==="native_profile_resume")).toBe(false);}finally{f.native.dispose();}
});
it("rejects format ACK replay and frames emitted before all decoder ACKs",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);f.apply(1);f.resume(f.a);expect(()=>f.resume(f.a)).toThrow("Shared format ACK");expect(()=>f.frame(2,2,1)).toThrow("Shared native source order");f.resume(f.b);f.frame(2,2,1);}finally{f.native.dispose();}
});
it("removes a departing decoder waiter without stopping the other viewer",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);f.apply(1);f.resume(f.a);f.native.detach(f.b);expect(f.commands.filter(m=>m.type==="native_profile_resume")).toHaveLength(1);f.frame(2,2,1);expect(f.messages.get(f.a)?.at(-1)).toMatchObject({seq:2,generation:2});expect(f.commands.some(m=>m.type==="native_video"&&!m.enabled)).toBe(false);}finally{f.native.dispose();}
});

it.each(["helper","viewer","settle","draw"])("bounds shared profile wait and preserves responsive ownership: %s",async kind=>{
 vi.useFakeTimers();const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);const audio=f.native.audioSource(f.a,f.ids.get(f.a)!)!;if(kind!=="helper"){f.apply(1);f.resume(f.a);if(kind!=="viewer")f.resume(f.b);if(kind==="draw"){f.frame(2,2,1);f.ack(f.a,2);f.native.command(f.b,{type:"native_video_ack",id:f.ids.get(f.b),seq:2,dropped:true});}}await vi.advanceTimersByTimeAsync(2001);
 if(kind==="helper"||kind==="settle"){expect(audio.active()).toBe(false);expect(f.policies.at(-1)).toBe(false);expect(f.messages.get(f.a)?.at(-1)).toMatchObject({type:"native_video_stopped"});expect(f.commands.filter(m=>m.type==="native_profile_resume")).toHaveLength(kind==="settle"?1:0);}else{expect(audio.active()).toBe(true);expect(f.policies).toEqual([true]);expect(f.messages.get(f.b)?.at(-1)).toMatchObject({type:"native_video_stopped"});expect(f.commands.filter(m=>m.type==="native_profile_resume")).toHaveLength(1);f.frame(kind==="draw"?3:2,2,1);expect(f.messages.get(f.a)?.at(-1)).toMatchObject({seq:kind==="draw"?3:2,generation:2});}
 }finally{f.native.dispose();vi.useRealTimers();}
});
it("coalesces another resolution request until the current format exchange completes",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);f.request(f.a,1280,800);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.apply(1);f.resume(f.a);f.resume(f.b);f.request(f.a,1280,800);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.frame(2,2,1);f.request(f.a,1280,800);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.ack(f.a,2);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.ack(f.b,2);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(2);expect(f.commands.findLast(m=>m.type==="native_profile")).toMatchObject({generation:3,width:1280,height:800});}finally{f.native.dispose();}
});

it("reapplies aggregate cadence changes only after the helper has emitted its held IDR",()=>{
 const f=profileSetup();try{f.start(f.a);f.start(f.b);f.frame(1);f.ack(f.a,1);f.ack(f.b,1);f.request(f.a);f.request(f.b);for(const member of[f.a,f.b])f.native.command(member,{type:"native_rate",id:f.ids.get(member),fps:10,kbps:1000});expect(f.commands.some(m=>m.type==="native_rate")).toBe(false);f.apply(1);f.resume(f.a);f.resume(f.b);expect(f.commands.some(m=>m.type==="native_rate")).toBe(false);f.frame(2,2,1);expect(f.commands.findLast(m=>m.type==="native_rate")).toMatchObject({fps:10,kbps:1000});const ackAt=f.commands.findLastIndex(m=>m.type==="native_video_ack"),rateAt=f.commands.findLastIndex(m=>m.type==="native_rate");expect(rateAt).toBeGreaterThan(ackAt);}finally{f.native.dispose();}
});
it("does not give a late subscriber either profile's previously held keyframe",()=>{
 const f=profileSetup();try{f.start(f.a);f.frame(1);f.ack(f.a,1);f.request(f.a);f.apply(1);f.start(f.b);f.resume(f.a);f.frame(2,2,1);expect(f.messages.get(f.b)).toBeUndefined();f.ack(f.a,2);expect(f.commands.findLast(m=>m.type==="native_profile")).toMatchObject({generation:3,width:1280});f.apply(2);f.resume(f.a);f.frame(3,3,0);expect(f.messages.get(f.b)).toBeUndefined();f.frame(4,3,0);expect(f.messages.get(f.b)?.at(-1)).toMatchObject({seq:1,generation:1,timestamp:133332});}finally{f.native.dispose();}
});

it("keeps the drawing fence after a dropped held IDR until a future keyframe is actually drawn",()=>{
 const f=profileSetup();try{f.start(f.a);f.frame(1);f.ack(f.a,1);f.request(f.a);f.apply(1);f.resume(f.a);f.request(f.a,1280,800);f.frame(2,2,1);f.native.command(f.a,{type:"native_video_ack",id:f.ids.get(f.a),seq:2,dropped:true});expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.frame(3,2,1);expect(f.commands.filter(m=>m.type==="native_profile")).toHaveLength(1);f.ack(f.a,3);expect(f.commands.findLast(m=>m.type==="native_profile")).toMatchObject({generation:3,width:1280});}finally{f.native.dispose();}
});
