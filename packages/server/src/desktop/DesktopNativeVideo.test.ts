import { expect, it, vi } from "vitest";
import { DesktopNativeVideo } from "./DesktopNativeVideo.js";
import { decodeDesktopMediaChunk, decodeDesktopH264Packet } from "@sodashitsu/protocol";
import { performance } from "node:perf_hooks";

it("uses the acknowledged frame age and does not renew freshness for delayed or duplicate ACKs", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(10000);
  try {
    const f = fixture(true, 3), id = f.start();
    expect(f.video.hasFreshDraw()).toBe(false);
    f.video.fromHelper(f.frame(id));
    expect(f.video.hasFreshDraw()).toBe(false);
    clock.mockReturnValue(12001);
    f.video.fromViewer({type:"native_video_ack",id,generation:1,seq:1});
    expect(f.video.hasFreshDraw()).toBe(false);
    f.video.fromHelper(f.frame(id,2));
    f.video.fromViewer({type:"native_video_ack",id,generation:2,seq:2});
    expect(f.video.hasFreshDraw()).toBe(false);
    f.video.fromViewer({type:"native_video_ack",id,generation:1,seq:2});
    expect(f.video.hasFreshDraw()).toBe(true);
    clock.mockReturnValue(14001);
    f.video.fromViewer({type:"native_video_ack",id,generation:1,seq:2});
    expect(f.video.hasFreshDraw()).toBe(false);
    f.video.stop();
    expect(f.video.hasFreshDraw()).toBe(false);
    f.start();
    expect(f.video.hasFreshDraw()).toBe(false);
  } finally { clock.mockRestore(); }
});
function fixture(enabled = true, window?: 3) {
  const send = vi.fn((_value: unknown) => true),
    write = vi.fn<(value: Record<string, unknown>) => void>(),
    policy = vi.fn();
  let buffered = 0;
  const video = new DesktopNativeVideo({
    enabled,
    ...(window === 3 ? { window } : {}),
    width: 1280,
    sourceWidth: 1600,
    sourceHeight: 1000,
    fps: 30,
    send,
    write,
    policy,
    buffered: () => buffered,
  });
  const start = () => {
    expect(
      video.fromViewer({ type: "media", enabled: true, settings: { transport: "native" } }),
    ).toBe(true);
    return write.mock.calls.find(([v]) => v.type === "native_video")![0].id as string;
  };
  const frame = (id: string, seq = 1) => ({
    type: "native_frame",
    id,
    seq,
    width: 1280,
    height: 800,
    timestamp: seq * 33333,
    key: seq === 1,
    ...(seq === 1 ? { codec: "avc1.42041f" } : {}),
    data: Buffer.from([0, 0, 0, 1, seq === 1 ? 0x65 : 0x41, 1, 2]).toString("base64"),
  });
  return { video, send, write, policy, start, frame, backlog: () => (buffered = 600000) };
}
it("bounds native frames by draw ACK and preserves image policy/snapshot recovery", () => {
  const f = fixture(),
    id = f.start();
  expect(f.policy).toHaveBeenLastCalledWith(true);
  expect(f.video.fromHelper(f.frame(id))).toBe(true);
  const binary = f.send.mock.calls
    .map(([v]) => v)
    .find((v) => v instanceof Uint8Array) as Uint8Array;
  const chunk = decodeDesktopMediaChunk(binary),
    packet = decodeDesktopH264Packet(chunk.data);
  expect(chunk.seq).toBe(1);
  expect(packet.timestamp).toBe(33333);
  expect(packet.key).toBe(true);
  expect(() => f.video.fromHelper(f.frame(id, 2))).toThrow("order");
  expect(() => f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 2 })).toThrow(
    "ACK",
  );
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1 });
  f.video.fromHelper(f.frame(id, 2));
  f.video.stop();
  expect(f.policy).toHaveBeenLastCalledWith(false);
  expect(f.write).toHaveBeenCalledWith({ type: "keyframe" });
  expect(f.write).toHaveBeenCalledWith({ type: "release" });
  expect(f.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id,
    state: "images",
    audio: false,
    reason: "stopped",
  });
  f.video.fromHelper(f.frame(id, 3));
  expect(f.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id,
    state: "images",
    audio: false,
    reason: "stopped",
  });
});
it("rejects native audio and locally disabled video without starting a helper", () => {
  const f = fixture(false);
  f.video.fromViewer({ type: "media", enabled: true, settings: { transport: "native" } });
  expect(f.write).not.toHaveBeenCalled();
  const g = fixture();
  g.video.fromViewer({
    type: "media",
    enabled: true,
    settings: { transport: "native", audio: true },
  });
  expect(g.write).not.toHaveBeenCalled();
});
it("falls back to images on startup failure, missing draw ACK, and congestion", () => {
  const a = fixture(),
    id = a.start();
  a.video.fromHelper({ type: "native_video_stopped", id });
  expect(a.policy).toHaveBeenLastCalledWith(false);
  const b = fixture(),
    bid = b.start();
  b.video.fromHelper(b.frame(bid));
  b.video.tick(performance.now() + 3000);
  expect(b.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id: bid,
    state: "images",
    audio: false,
    reason: "congested",
  });
  const c = fixture(),
    cid = c.start();
  c.backlog();
  c.video.fromHelper(c.frame(cid));
  expect(c.send).toHaveBeenLastCalledWith({
    type: "media_status",
    id: cid,
    state: "images",
    audio: false,
    reason: "congested",
  });
});
it("requires initial IDR/SPS and stable format, dimensions, and increasing timestamps", () => {
  const a = fixture(),
    id = a.start();
  expect(() => a.video.fromHelper({ ...a.frame(id), key: false })).toThrow("SPS/IDR");
  const b = fixture(),
    bid = b.start();
  expect(() => b.video.fromHelper({ ...b.frame(bid), height: 700 })).toThrow("dimensions");
  const c = fixture(),
    cid = c.start();
  c.video.fromHelper(c.frame(cid));
  c.video.fromViewer({ type: "native_video_ack", id: cid, generation: 1, seq: 1 });
  expect(() => c.video.fromHelper({ ...c.frame(cid, 2), timestamp: 33333 })).toThrow("order");
});

it("switches to browser media without accepting frames or ACKs from the stopped native request", () => {
  const f = fixture(),
    id = f.start();
  f.video.fromHelper(f.frame(id));
  expect(
    f.video.fromViewer({ type: "media", enabled: true, settings: { transport: "auto" } }),
  ).toBe(false);
  expect(f.policy).toHaveBeenLastCalledWith(false);
  const count = f.send.mock.calls.length;
  f.video.fromHelper(f.frame(id, 2));
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1 });
  expect(f.send.mock.calls).toHaveLength(count);
});

it("allows three negotiated frames while enforcing FIFO ACK and returning a slot", () => {
  const f = fixture(true, 3),
    id = f.start();
  for (let seq = 1; seq <= 3; seq++) f.video.fromHelper(f.frame(id, seq));
  expect(() => f.video.fromHelper(f.frame(id, 4))).toThrow("order");
  expect(() => f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 2 })).toThrow(
    "ACK",
  );
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1, decodeMs: 5 });
  f.video.fromHelper(f.frame(id, 4));
  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ type: "media_stream", window: 3 }));
  f.video.fromViewer({ type: "native_video_ack", id, generation: 1, seq: 1 });
  expect(() => f.video.fromHelper(f.frame(id, 5))).toThrow("order");
  f.video.stop();
});
it("expires the oldest outstanding frame even when newer frames were sent", async () => {
  const { performance } = await import("node:perf_hooks");
  const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
  try {
    const f = fixture(true, 3),
      id = f.start();
    f.video.fromHelper(f.frame(id));
    clock.mockReturnValue(3000);
    f.video.fromHelper(f.frame(id, 2));
    f.video.tick(3600);
    expect(f.send).toHaveBeenLastCalledWith({
      type: "media_status",
      id,
      state: "images",
      audio: false,
      reason: "congested",
    });
  } finally {
    clock.mockRestore();
  }
});

it.each([false,true])("uses an independent 60fps ceiling only when helper capability is confirmed (%s)",confirmed=>{
 const write=vi.fn(),send=vi.fn(()=>true),video=new DesktopNativeVideo({enabled:true,width:640,sourceWidth:640,sourceHeight:360,fps:10,...(confirmed?{maxFps:60 as const}:{}),send,write,policy:()=>{},buffered:()=>0});
 video.fromViewer({type:"media",enabled:true,settings:{transport:"native",fps:60}});
 if(confirmed)expect(write.mock.calls.find(([m])=>m.type==="native_video")?.[0].fps).toBe(60);
 else {expect(write).not.toHaveBeenCalled();expect(send).toHaveBeenCalledWith(expect.objectContaining({state:"images",reason:"unavailable"}));}
 video.stop();
});

it.each([[true,true],[true,false],[false,true]])('changes cadence without restarting video, input or image policy only when opted in (%s/%s)',(cadence,adaptive)=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0);
 try {
  const write=vi.fn(),send=vi.fn((_value:unknown)=>true),policy=vi.fn();
  const video=new DesktopNativeVideo({enabled:true,cadence,window:3,width:1280,sourceWidth:1600,sourceHeight:1000,fps:30,write,send,policy,buffered:()=>0});
  video.fromViewer({type:'media',enabled:true,settings:{transport:'native',adaptive}});
  const id=write.mock.calls.find(([m])=>m.type==='native_video')![0].id;
  const template=fixture().frame;
  for(let seq=1;seq<=24;seq++){
   clock.mockReturnValue(seq*200);video.fromHelper({...template(id,seq),captureMs:50});
   clock.mockReturnValue(seq*200+20);video.fromViewer({type:'native_video_ack',id,generation:1,seq});
  }
  const updates=write.mock.calls.filter(([m])=>m.type==='native_rate');
  if(cadence&&adaptive)expect(updates).toEqual([[{type:'native_rate',id,fps:17,kbps:2500}]]);
  else expect(updates).toEqual([]);
  expect(policy.mock.calls).toEqual([[true]]);expect(write.mock.calls.filter(([m])=>m.type==='release')).toHaveLength(0);
  expect(send.mock.calls.filter(([m])=>(m as {type?:string}).type==='media_stream')).toHaveLength(1);
  video.stop();
 }finally{clock.mockRestore();}
});
