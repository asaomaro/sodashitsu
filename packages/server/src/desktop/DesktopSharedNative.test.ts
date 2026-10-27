import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
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
