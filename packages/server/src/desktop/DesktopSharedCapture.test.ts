import {DesktopNativePcmPaths} from "./DesktopNativePcmPath.js";
import {createServer as createUnixServer} from "node:net";
import {chmod} from "node:fs/promises";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import { DesktopSharedCapture, type DesktopHelper } from "./DesktopSharedCapture.js";
import { DesktopProvider } from "./DesktopProvider.js";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";

class Helper extends EventEmitter implements DesktopHelper {
  nativePcm?:NonNullable<DesktopHelper["nativePcm"]>;
  commands: any[] = [];
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode = null;
  kill = vi.fn(() => { this.close(); return true; });
  stdin = new Writable({
    write: (chunk, _, done) => { this.commands.push(JSON.parse(chunk.toString())); done(); },
    final: done => { queueMicrotask(() => this.close()); done(); },
  });
  send(value: unknown) { this.stdout.write(JSON.stringify(value) + "\n"); }
  close() { if (this.exitCode !== null) return; this.exitCode = 0; this.emit("close", 0, null); }
}
const ready = { type: "ready", title: "generated", allowInput: true, width: 320, height: 200, backend: "synthetic", dynamicQuality: true };
const frame = (seq: number) => ({ type: "frame", info: { seq, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 }, data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=" });
function fixture() {
  const pool = new DesktopSharedCapture(), child = new Helper(), spawn = vi.fn(() => child);
  function join(key = "source", configuration: unknown = { type: "configure", options: { width: 320 } }) {
    const session = pool.attach(key, spawn), messages: any[] = [];
    session.stdout.setEncoding("utf8");
    session.stdout.on("data", text => { for (const line of String(text).trim().split("\n")) messages.push(JSON.parse(line)); });
    session.stdin.write(JSON.stringify(configuration) + "\n");
    return { session, messages, send: (value: unknown) => session.stdin.write(JSON.stringify(value) + "\n") };
  }
  return { pool, child, spawn, join };
}

it("routes a physical pointer witness only to its submitting viewer and rewrites the helper sequence",async()=>{
 const f=fixture(),configuration={type:"configure",options:{width:320},nativePointerProof:true},a=f.join("source",configuration),b=f.join("source",configuration);
 try {
  f.child.send({...ready,resourceFences:true,nativePointerProof:true});await vi.waitFor(()=>expect(b.messages[0]).toMatchObject({nativePointerProof:true}));
  expect(a.session.requestControl!(true)).toBe(true);a.send({type:"control",enabled:true});a.send({type:"input",seq:7,input:{kind:"pointer",x:0.5,y:0.5,event:"down",button:0}});
  const first={epoch:crypto.randomUUID(),x:-400,y:50,window:42,pid:7};f.child.send({type:"input_ack",seq:1,pointer:first});await vi.waitFor(()=>expect(a.messages.at(-1)).toEqual({type:"input_ack",seq:7,pointer:first}));expect(b.messages.filter(m=>m.type==="input_ack")).toEqual([]);
  a.session.requestControl!(false);expect(b.session.requestControl!(true)).toBe(true);b.send({type:"control",enabled:true});b.send({type:"input",seq:7,input:{kind:"pointer",x:0.5,y:0.5,event:"down",button:0}});
  f.child.send({type:"input_ack",seq:1,pointer:first});expect(b.messages.filter(m=>m.type==="input_ack")).toEqual([]);
  const second={...first,epoch:crypto.randomUUID(),window:43};f.child.send({type:"input_ack",seq:2,pointer:second});await vi.waitFor(()=>expect(b.messages.at(-1)).toEqual({type:"input_ack",seq:7,pointer:second}));expect(a.messages.filter(m=>m.type==="input_ack")).toHaveLength(1);
 } finally {f.pool.dispose();}
});

it("captures once and lets a fast viewer continue while another waits for its own ACK", async () => {
  const f = fixture(), slow = f.join(), fast = f.join();
  f.child.send(ready);
  await vi.waitFor(() => expect(fast.messages).toHaveLength(1));
  f.child.send(frame(1));
  await vi.waitFor(() => expect(fast.messages).toHaveLength(2));
  fast.send({ type: "ack", seq: 1 });
  f.child.send(frame(2));
  await vi.waitFor(() => expect(fast.messages).toHaveLength(3));
  expect(slow.messages.map(m => m.info?.seq).filter(Boolean)).toEqual([1]);
  expect(fast.messages.map(m => m.info?.seq).filter(Boolean)).toEqual([1, 2]);
  expect(f.spawn).toHaveBeenCalledTimes(1);
  expect(f.child.commands.filter(m => m.type === "configure")).toHaveLength(1);
  expect(f.child.commands.filter(m => m.type === "ack").map(m => m.seq)).toEqual([1, 2]);
  slow.send({ type: "ack", seq: 1 }); fast.send({ type: "ack", seq: 2 });
  f.child.send(frame(3));
  await vi.waitFor(() => expect(slow.messages.at(-1)?.info.seq).toBe(3));
  f.pool.dispose();
});

it("never replays a stored frame to late joiners and accepts only identical source configuration", async () => {
  const f = fixture(), first = f.join();
  f.child.send(ready); f.child.send(frame(1));
  await vi.waitFor(() => expect(first.messages).toHaveLength(2));
  const late = f.join();
  await vi.waitFor(() => expect(late.messages).toHaveLength(1));
  expect(late.messages[0].type).toBe("ready");
  expect(late.messages[0].dynamicQuality).toBe(false);
  const wrong = f.join("source", { type: "configure", options: { width: 640 } });
  expect(wrong.session.exitCode).toBe(0);
  expect(() => f.join("different monitor")).toThrow(/incompatible/);
  f.child.send(frame(2));
  await vi.waitFor(() => expect(late.messages.at(-1)?.info.seq).toBe(2));
  expect(first.session.exitCode).toBeNull();
  f.pool.dispose();
});

it("keeps control exclusive and maps input ACKs to the issuing viewer across handover", async () => {
  const f = fixture(), a = f.join(), b = f.join();
  f.child.send(ready);
  await vi.waitFor(() => expect(b.messages).toHaveLength(1));
  expect(a.session.requestControl!(true)).toBe(true);
  a.send({ type: "control", enabled: true });
  expect(b.session.requestControl!(true)).toBe(false);
  b.send({ type: "control", enabled: false });
  b.send({ type: "input", seq: 1, input: { kind: "key", code: "KeyB", down: true } });
  a.send({ type: "input", seq: 7, input: { kind: "key", code: "KeyA", down: true } });
  expect(f.child.commands.filter(m => m.type === "input")).toMatchObject([{ seq: 1, input: { code: "KeyA" } }]);
  f.child.send({ type: "input_ack", seq: 1 });
  await vi.waitFor(() => expect(a.messages.at(-1)).toEqual({ type: "input_ack", seq: 7 }));
  expect(b.messages).toHaveLength(1);
  expect(a.session.requestControl!(false)).toBe(false);
  expect(f.child.commands.at(-1)).toEqual({ type: "control", enabled: false });
  expect(b.session.requestControl!(true)).toBe(true);
  b.send({ type: "control", enabled: true });
  b.send({ type: "input", seq: 7, input: { kind: "key", code: "KeyB", down: true } });
  f.child.send({ type: "input_ack", seq: 2 });
  await vi.waitFor(() => expect(b.messages.at(-1)).toEqual({ type: "input_ack", seq: 7 }));
  f.pool.dispose();
});

it("disconnects only the bad ACK sender and preserves the helper until its last subscriber leaves", async () => {
  const f = fixture(), a = f.join(), b = f.join();
  f.child.send(ready); f.child.send(frame(1));
  await vi.waitFor(() => expect(b.messages).toHaveLength(2));
  a.send({ type: "ack", seq: 2 });
  expect(a.session.exitCode).toBe(0);
  expect(b.session.exitCode).toBeNull();
  expect(f.child.stdin.writableEnded).toBe(false);
  b.send({ type: "ack", seq: 1 });
  f.child.send(frame(2));
  await vi.waitFor(() => expect(b.messages.at(-1)?.info.seq).toBe(2));
  b.session.stdin.end();
  expect(f.child.stdin.writableEnded).toBe(true);
});

it.each(["secureDesktop", "lockScreenCover", "virtualDisplay", "nativeVideo", "allowClipboard", "allowMedia"])("ends before publishing an incompatible %s ready", async field => {
  const f = fixture(), a = f.join(), b = f.join();
  f.child.send({ ...ready, [field]: true });
  await vi.waitFor(() => expect(a.session.exitCode).toBe(0));
  expect(b.session.exitCode).toBe(0);
  expect(a.messages).toEqual([]); expect(b.messages).toEqual([]);
});

it("invalidates all subscriptions on lock/source exit, drops outstanding routes, and never reuses a dead generation", async () => {
  const f = fixture(), a = f.join(), b = f.join();
  f.child.send(ready);
  await vi.waitFor(() => expect(a.messages).toHaveLength(1));
  expect(a.session.requestControl!(true)).toBe(true);
  a.send({ type: "input", seq: 1 });
  f.child.send({ type: "session_locked" });
  f.child.send(frame(1)); f.child.send({ type: "input_ack", seq: 1 });
  await vi.waitFor(() => expect(a.session.exitCode).toBe(0));
  expect(a.messages.map(m => m.type)).toEqual(["ready", "session_locked"]);
  expect(b.messages.map(m => m.type)).toEqual(["ready", "session_locked"]);
  expect(a.session.requestControl!(true)).toBe(false);
  await vi.waitFor(() => expect(f.child.exitCode).toBe(0));
  const next = new Helper();
  const fresh = f.pool.attach("new scope", () => next);
  expect(fresh.exitCode).toBeNull();
  f.pool.dispose();
});

it("bounds viewer count and rejects deltas whose bases a slow consumer may have missed", async () => {
  const f = fixture(), members = Array.from({ length: 8 }, () => f.join());
  expect(() => f.join()).toThrow(/busy/);
  f.child.send(ready);
  await vi.waitFor(() => expect(members[0]!.messages).toHaveLength(1));
  f.child.send({ ...frame(1), info: { ...frame(1).info, update: { kind: "unchanged", baseSeq: 1 } } });
  await vi.waitFor(() => expect(members[0]!.session.exitCode).toBe(0));
  expect(members.every(m => m.messages.length === 1)).toBe(true);
});


it("rejects malformed image bytes before acknowledging a source even if every viewer is already waiting",async()=>{
 const f=fixture(),a=f.join();f.child.send(ready);f.child.send(frame(1));
 await vi.waitFor(()=>expect(a.messages).toHaveLength(2));
 f.child.send({...frame(2),data:"AA=="});
 await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));
 expect(f.child.commands.filter(m=>m.type==="ack").map(m=>m.seq)).toEqual([1]);
});

it("continues input after 64 missing ACKs and does not route an evicted ACK to another viewer", async () => {
  const f = fixture(), a = f.join(), b = f.join();
  f.child.send(ready);
  await vi.waitFor(() => expect(a.messages).toHaveLength(1));
  expect(a.session.requestControl!(true)).toBe(true);
  for (let seq = 1; seq <= 65; seq++) a.send({ type: "input", seq });
  expect(f.child.commands.filter(m => m.type === "input")).toHaveLength(65);
  f.child.send({ type: "input_ack", seq: 1 });
  f.child.send({ type: "input_ack", seq: 65 });
  await vi.waitFor(() => expect(a.messages.at(-1)).toEqual({ type: "input_ack", seq: 65 }));
  expect(a.messages.filter(m => m.type === "input_ack")).toHaveLength(1);
  expect(b.messages).toHaveLength(1);
  a.session.requestControl!(false);
  expect(b.session.requestControl!(true)).toBe(true);
  b.send({ type: "input", seq: 1 });
  f.child.send({ type: "input_ack", seq: 2 });
  f.child.send({ type: "input_ack", seq: 66 });
  await vi.waitFor(() => expect(b.messages.at(-1)).toEqual({ type: "input_ack", seq: 1 }));
  expect(b.messages.filter(m => m.type === "input_ack")).toHaveLength(1);
  f.pool.dispose();
});

it("waits for the real retiring shared helper before accepting a new ordinary source", async () => {
  const web = createServer(), sockets = new WebSocketServer({ server: web });
  await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  const provider = new DesktopProvider({ command: ["never-launched"], allowInput: true, origins: () => [origin] });
  const pool = (provider as unknown as { sharedCapture: DesktopSharedCapture }).sharedCapture;
  const child = new Helper();
  // A generated process whose EOF has not finished cleanup yet. No OS process/input.
  child.stdin = new Writable({ write: (_, _encoding, done) => done(), final: done => done() });
  const session = pool.attach("old generation", () => child);
  session.stdin.end();
  let connections = 0;
  sockets.on("connection", ws => { connections++; ws.close(); });
  const started = provider.start("new owner", { url: origin.replace("http", "ws") + "/desktop-share", ticket: "a".repeat(43), options: { width: 320, fps: 10, quality: 65 } });
  const outcome = started.then(() => "started", () => "rejected");
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(connections).toBe(0);
    expect(pool.retiring).toBe(child);
    child.close();
    expect(await outcome).toBe("rejected"); // generated relay closes before provider attach
    expect(connections).toBe(1);
  } finally {
    child.close(); provider.dispose();
    for (const ws of sockets.clients) ws.terminate();
    await new Promise<void>(resolve => sockets.close(() => resolve()));
    await new Promise<void>(resolve => web.close(() => resolve()));
  }
});

const protectedConfiguration={type:"configure",options:{width:320},allowElevated:true,allowSharedProtected:true,allowNativeVideo:false};
for(const mode of["elevated-default","elevated-uac"]as const)it(`owns the ${mode} worker until the last viewer and keeps input exclusive`,async()=>{
 const f=fixture(),a=f.join("protected",protectedConfiguration),b=f.join("protected",protectedConfiguration);try{f.child.send({...ready,secureDesktop:true,protectedDesktop:mode,sharedProtected:true});await vi.waitFor(()=>expect(b.messages[0]).toMatchObject({protectedDesktop:mode,sharedProtected:true}));expect(a.session.requestControl!(true)).toBe(true);a.send({type:"control",enabled:true});expect(b.session.requestControl!(true)).toBe(false);a.send({type:"input",seq:12,input:{kind:"key",code:"KeyA",down:true}});f.child.send({type:"input_ack",seq:1});await vi.waitFor(()=>expect(a.messages.at(-1)).toEqual({type:"input_ack",seq:12}));a.session.stdin.end();await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));expect(f.child.exitCode).toBeNull();expect(f.child.commands.at(-1)).toEqual({type:"control",enabled:false});expect(b.session.requestControl!(true)).toBe(true);b.send({type:"control",enabled:true});b.send({type:"input",seq:5,input:{kind:"key",code:"KeyB",down:true}});f.child.send({type:"input_ack",seq:2});await vi.waitFor(()=>expect(b.messages.at(-1)).toEqual({type:"input_ack",seq:5}));f.child.send(frame(1));await vi.waitFor(()=>expect(b.messages.at(-1)?.type).toBe("frame"));expect(f.spawn).toHaveBeenCalledOnce();b.session.stdin.end();await vi.waitFor(()=>expect(f.child.exitCode).toBe(0));}finally{f.pool.dispose();}
});
it.each(["protected_desktop_failure","session_locked","session_unlocked","lock_screen_changed","unlock_failure"])("ends every protected member before accepting more data on %s",async type=>{
 const f=fixture(),a=f.join("protected",protectedConfiguration),b=f.join("protected",protectedConfiguration);try{f.child.send({...ready,secureDesktop:true,protectedDesktop:"elevated-default",sharedProtected:true});f.child.send({type,...(type==="protected_desktop_failure"?{code:"source_changed"}:{})});f.child.send(frame(1));await vi.waitFor(()=>expect(f.child.exitCode).toBe(0));for(const member of[a,b]){expect(member.messages.filter(m=>m.type==="frame")).toHaveLength(0);expect(member.messages.at(-1)).toMatchObject({type:"protected_desktop_failure",code:type==="unlock_failure"?"worker_unavailable":"source_changed"});expect(member.session.requestControl!(true)).toBe(false);}}finally{f.pool.dispose();}
});
it.each(["normal","unproved","lock","media","native","virtual"])("rejects an incompatible protected source before any image: %s",async kind=>{
 const f=fixture(),a=f.join("protected",protectedConfiguration);try{const value:any={...ready,secureDesktop:true,protectedDesktop:"elevated-default",sharedProtected:true};if(kind==="normal"){delete value.secureDesktop;delete value.protectedDesktop;delete value.sharedProtected;}if(kind==="unproved")delete value.sharedProtected;if(kind==="lock")value.lockScreenCover=true;if(kind==="media")value.allowMedia=true;if(kind==="native")value.nativeVideo=true;if(kind==="virtual")value.virtualDisplay=true;f.child.send(value);f.child.send(frame(1));await vi.waitFor(()=>expect(f.child.exitCode).toBe(0));expect(a.messages.filter(m=>m.type==="ready"||m.type==="frame")).toHaveLength(0);}finally{f.pool.dispose();}
});

it("owns one microphone independently of input and releases only its own stream across viewer departure",async()=>{
 const f=fixture(),config={type:"configure",options:{width:320},allowMicrophone:true},first=f.join("source",config),a=f.join("source",config),b=f.join("source",config);
 try{
  f.child.send({...ready,microphone:true});await vi.waitFor(()=>expect(b.messages[0]).toMatchObject({microphone:true}));
  expect(a.session.requestMicrophone!("stream-a",true)).toBe(true);expect(b.session.requestMicrophone!("stream-b",true)).toBe(false);
  a.send({type:"native_microphone",id:"stream-a",enabled:true,pipeName:"generated"});b.send({type:"native_microphone",id:"stream-b",enabled:true,pipeName:"wrong"});
  expect(f.child.commands.filter(m=>m.type==="native_microphone")).toEqual([{type:"native_microphone",id:"stream-a",enabled:true,pipeName:"generated"}]);
  first.session.stdin.end();await vi.waitFor(()=>expect(first.session.exitCode).toBe(0));expect(f.child.exitCode).toBeNull();expect(b.session.requestMicrophone!("stream-b",true)).toBe(false);
  a.send({type:"native_microphone",id:"stream-a",enabled:false});expect(b.session.requestMicrophone!("stream-b",true)).toBe(true);
  b.send({type:"native_microphone",id:"stream-b",enabled:true,pipeName:"next"});a.send({type:"native_microphone",id:"stream-a",enabled:false});a.session.requestMicrophone!("stream-a",false);
  expect(a.session.requestMicrophone!("another",true)).toBe(false);expect(f.child.commands.at(-1)).toMatchObject({id:"stream-b",enabled:true});
  b.session.stdin.end();await vi.waitFor(()=>expect(b.session.exitCode).toBe(0));expect(f.child.commands.at(-1)).toMatchObject({id:"stream-b",enabled:false});expect(a.session.requestMicrophone!("final",true)).toBe(true);
 }finally{f.pool.dispose();}
});
it.each([false,true])("refuses a microphone lease without normal ready proof (protected=%s)",async protectedMode=>{
 const f=fixture(),a=f.join("source",protectedMode?protectedConfiguration:undefined);
 try{f.child.send(protectedMode?{...ready,secureDesktop:true,protectedDesktop:"elevated-default",sharedProtected:true}:ready);await vi.waitFor(()=>expect(a.messages.length).toBe(1));expect(a.session.requestMicrophone!("forged",true)).toBe(false);}finally{f.pool.dispose();}
});
it("does not let an old microphone stop release a newer stream of the same member",async()=>{
 const f=fixture(),config={type:"configure",options:{width:320},allowMicrophone:true},a=f.join("source",config),b=f.join("source",config);
 try{
  f.child.send({...ready,microphone:true});await vi.waitFor(()=>expect(b.messages.length).toBe(1));expect(a.session.requestMicrophone!("old",true)).toBe(true);a.send({type:"native_microphone",id:"old",enabled:true,pipeName:"generated-old"});a.send({type:"native_microphone",id:"old",enabled:false});expect(a.session.requestMicrophone!("new",true)).toBe(true);a.send({type:"native_microphone",id:"new",enabled:true,pipeName:"generated-new"});
  a.send({type:"native_microphone",id:"old",enabled:false});a.session.requestMicrophone!("old",false);expect(b.session.requestMicrophone!("other",true)).toBe(false);expect(f.child.commands.at(-1)).toMatchObject({id:"new",enabled:true});
 }finally{f.pool.dispose();}
});

const cursorConfiguration={type:"configure",options:{width:320,cursor:true},separateCursor:true};
const cursorShape={kind:2 as const,width:1,height:1,pitch:4,hotspotX:0,hotspotY:0};
const cursorPose=(seq:number,shapeId=1,shape=false)=>({type:"cursor",seq,visible:true,x:.25,y:.5,shapeId,...(shape?{shape:cursorShape,data:Buffer.from([0,255,0,255]).toString("base64")}: {})});
it("sends a current cursor shape to late subscribers without replaying image frames",async()=>{
 const f=fixture(),first=f.join("source",cursorConfiguration);f.child.send({...ready,cursor:true});f.child.send(frame(1));f.child.send(cursorPose(1,1,true));f.child.send(cursorPose(2));
 const late=f.join("source",cursorConfiguration);await vi.waitFor(()=>expect(late.messages.some(m=>m.type==="cursor")).toBe(true));
 expect(late.messages.filter(m=>m.type==="frame")).toHaveLength(0);expect(late.messages.at(-1)).toMatchObject({type:"cursor",seq:2,shape:cursorShape,data:Buffer.from([0,255,0,255]).toString("base64")});
 f.child.send(cursorPose(3));expect(first.messages.at(-1)).not.toHaveProperty("shape");expect(late.messages.at(-1)).not.toHaveProperty("shape");
 f.child.send(cursorPose(4,2,true));expect(first.messages.at(-1)).toHaveProperty("shape");expect(late.messages.at(-1)).toHaveProperty("shape");
 f.child.send({type:"cursor",seq:5,visible:false,x:0,y:0,shapeId:0});const hidden=f.join("source",cursorConfiguration);expect(hidden.messages.at(-1)).toMatchObject({type:"cursor",visible:false});
 f.child.send(cursorPose(6,2));expect(hidden.messages.at(-1)).toHaveProperty("shape");expect(first.messages.at(-1)).not.toHaveProperty("shape");f.pool.dispose();
});
it("keeps cursor positions flowing while one viewer holds its image ACK",async()=>{
 const f=fixture(),slow=f.join("source",cursorConfiguration),fast=f.join("source",cursorConfiguration);f.child.send({...ready,cursor:true});f.child.send(frame(1));fast.send({type:"ack",seq:1});f.child.send(cursorPose(1,1,true));f.child.send(frame(2));f.child.send(cursorPose(2));
 await vi.waitFor(()=>expect(slow.messages.filter(m=>m.type==="cursor")).toHaveLength(2));expect(slow.messages.filter(m=>m.type==="frame")).toHaveLength(1);expect(fast.messages.filter(m=>m.type==="frame")).toHaveLength(2);expect(fast.messages.at(-1)).toMatchObject({type:"cursor",seq:2});f.pool.dispose();
});
it("rejects malformed cursor shapes and an unnegotiated cursor source",async()=>{
 const f=fixture(),a=f.join("source",cursorConfiguration),b=f.join("source",cursorConfiguration);f.child.send({...ready,cursor:true});f.child.send({...cursorPose(1,1,true),data:""});expect(a.session.exitCode).toBe(0);expect(b.session.exitCode).toBe(0);
 const old=fixture(),legacy=old.join();old.child.send({...ready,cursor:true});expect(legacy.session.exitCode).toBe(0);
});
it("does not substitute an older cursor shape for an unknown shape id",async()=>{
 const f=fixture(),a=f.join("source",cursorConfiguration);f.child.send({...ready,cursor:true});f.child.send(cursorPose(1,1,true));f.child.send(cursorPose(2,2));expect(a.messages.filter(m=>m.type==="cursor")).toHaveLength(1);f.child.send(cursorPose(3,2,true));expect(a.messages.at(-1)).toMatchObject({type:"cursor",shapeId:2,shape:cursorShape});f.pool.dispose();
});

it("keeps shared clipboard ownership independent of input and does not let another viewer revoke it",async()=>{
 const f=fixture(),cfg={type:"configure",options:{width:320},allowClipboard:true,richClipboard:true},a=f.join("source",cfg),b=f.join("source",cfg);
 f.child.send({...ready,allowClipboard:true,richClipboard:true});await vi.waitFor(()=>expect(b.messages).toHaveLength(1));
 expect(a.session.requestControl!(true)).toBe(true);expect(b.session.requestClipboard!(true,1)).toBe(true);expect(a.session.requestClipboard!(false,1)).toBe(false);expect(a.session.requestClipboard!(true,2)).toBe(false);
 a.session.kill();expect(f.child.commands.filter(m=>m.type==="clipboard_control").at(-1)).toEqual({type:"clipboard_control",enabled:true,generation:1});
 b.send({type:"clipboard",id:1,generation:1,operation:"read",expiresAt:Date.now()+1000});const cmd=f.child.commands.at(-1);f.child.send({type:"clipboard_result",id:cmd.id,ok:true,text:"only b"});await vi.waitFor(()=>expect(b.messages.at(-1)).toMatchObject({type:"clipboard_result",id:1,text:"only b"}));f.pool.dispose();
});

const deltaConfiguration={type:"configure",options:{width:320,deltas:true}};
const withContent=(seq:number,contentId="a".repeat(64))=>{const f=frame(seq);return {...f,info:{...f.info,contentId}};};
const unchanged=(seq:number,baseSeq:number,contentId="a".repeat(64))=>({type:"frame",info:{seq,width:1,height:1,format:"image/png",captureMs:0,encodeMs:0,contentId,update:{kind:"unchanged",baseSeq}},data:""});
it("recovers a late delta subscriber only from a newly captured full frame",async()=>{
 const f=fixture(),a=f.join("source",deltaConfiguration);f.child.send(ready);f.child.send(withContent(1));a.send({type:"ack",seq:1});f.child.send(unchanged(2,1));a.send({type:"ack",seq:2});const b=f.join("source",deltaConfiguration);
 expect(b.messages.map(m=>m.type)).toEqual(["ready"]);expect(f.child.commands.filter(m=>m.type==="keyframe")).toHaveLength(1);f.child.send(withContent(3));await vi.waitFor(()=>expect(b.messages.at(-1)?.info.seq).toBe(3));a.send({type:"ack",seq:3});b.send({type:"ack",seq:3});f.child.send(unchanged(4,3));expect(a.messages.at(-1).info.update.baseSeq).toBe(3);expect(b.messages.at(-1).info.update.baseSeq).toBe(3);f.pool.dispose();
});
it("lets a fast delta viewer continue and requests a fresh full image after a slow ACK",async()=>{
 const f=fixture(),slow=f.join("source",deltaConfiguration),fast=f.join("source",deltaConfiguration);f.child.send(ready);f.child.send(withContent(1));fast.send({type:"ack",seq:1});f.child.send(unchanged(2,1));fast.send({type:"ack",seq:2});f.child.send(unchanged(3,2));fast.send({type:"ack",seq:3});
 expect(slow.messages.filter(m=>m.type==="frame").map(m=>m.info.seq)).toEqual([1]);expect(fast.messages.filter(m=>m.type==="frame").map(m=>m.info.seq)).toEqual([1,2,3]);slow.send({type:"ack",seq:1});expect(f.child.commands.at(-1)).toEqual({type:"keyframe"});f.child.send(withContent(4));await vi.waitFor(()=>expect(slow.messages.at(-1).info.seq).toBe(4));expect(fast.messages.at(-1).info.seq).toBe(4);expect(f.child.commands.filter(m=>m.type==="ack").map(m=>m.seq)).toEqual([1,2,3,4]);f.pool.dispose();
});
it.each(["legacy","base","content"])("rejects an invalid shared delta source: %s",kind=>{
 const f=fixture(),a=f.join("source",kind==="legacy"?{type:"configure",options:{width:320}}:deltaConfiguration);f.child.send(ready);f.child.send(withContent(1));a.send({type:"ack",seq:1});f.child.send(unchanged(2,kind==="base"?999:1,kind==="content"?"b".repeat(64):"a".repeat(64)));expect(a.session.exitCode).toBe(0);f.pool.dispose();
});
it("aggregates keyframe requests and never sends an unmatched delta to a late subscriber",()=>{
 vi.useFakeTimers();const f=fixture();try{const a=f.join("source",deltaConfiguration);f.child.send(ready);f.child.send(withContent(1));const b=f.join("source",deltaConfiguration);for(let i=0;i<50;i++)b.send({type:"keyframe"});expect(f.child.commands.filter(m=>m.type==="keyframe")).toHaveLength(1);vi.advanceTimersByTime(100);f.child.send(unchanged(2,1));expect(b.messages.some(m=>m.type==="frame")).toBe(false);expect(f.child.commands.filter(m=>m.type==="keyframe")).toHaveLength(2);a.send({type:"ack",seq:1});expect(f.child.commands.filter(m=>m.type==="keyframe")).toHaveLength(2);}finally{f.pool.dispose();vi.useRealTimers();}
});
it("allows an older helper to keep sending full images in a delta-enabled cohort",()=>{
 const f=fixture(),a=f.join("source",deltaConfiguration);f.child.send(ready);f.child.send(frame(1));a.send({type:"ack",seq:1});f.child.send(frame(2));expect(a.messages.filter(m=>m.type==="frame")).toHaveLength(2);expect(a.session.exitCode).toBe(null);f.pool.dispose();
});

const monitorLayout={selected:"right",bounds:{x:0,y:0,width:320,height:200},allSupported:true,monitors:[{id:"left",x:-160,y:0,width:160,height:200,primary:false,scalePercent:125},{id:"right",x:0,y:0,width:320,height:200,primary:true,scalePercent:150}]};
it("shares only the proved selected monitor layout and ends every member on topology changes",()=>{
 const f=fixture(),config={type:"configure",options:{width:320,monitors:true,monitorDevice:"right"},allowMonitors:true},a=f.join("right",config),b=f.join("right",config);f.child.send({...ready,monitorLayout});expect(a.messages[0].monitorLayout).toEqual(monitorLayout);expect(b.messages[0].monitorLayout).toEqual(monitorLayout);f.child.send(frame(1));const late=f.join("right",config);expect(late.messages.map(m=>m.type)).toEqual(["ready"]);expect(late.messages[0].monitorLayout.selected).toBe("right");expect(()=>f.join("left",{...config,options:{...config.options,monitorDevice:"left"}})).toThrow(/busy/);a.session.kill();b.send({type:"ack",seq:1});f.child.send(frame(2));expect(b.messages.some(m=>m.type==="frame"&&m.info.seq===2)).toBe(true);f.child.send({type:"monitor_topology_changed"});for(const v of [b,late]){expect(v.messages.at(-1)).toEqual({type:"monitor_topology_changed"});expect(v.session.exitCode).toBe(0);}expect(f.spawn).toHaveBeenCalledTimes(1);f.pool.dispose();
});
it.each(["unrequested","wrong-device"])("rejects an unexpected shared monitor proof: %s",mode=>{
 const f=fixture(),config=mode==="unrequested"?{type:"configure",options:{width:320}}:{type:"configure",options:{width:320,monitors:true,monitorDevice:"left"},allowMonitors:true},a=f.join("source",config);f.child.send({...ready,monitorLayout});expect(a.messages.some(m=>m.type==="ready")).toBe(false);expect(a.session.exitCode).toBe(0);f.pool.dispose();
});

it("isolates regional proof IDs across members, coalesces configuration, and removes detached regions",async()=>{
 const f=fixture(),a=f.join(),b=f.join();
 try {
  f.child.send({...ready,agentRegions:true});f.child.send({...frame(1),info:{...frame(1).info,width:1,height:1}});
  await vi.waitFor(()=>expect(b.messages).toHaveLength(2));a.send({type:"ack",seq:1});b.send({type:"ack",seq:1});
  const region={id:crypto.randomUUID(),x:0,y:0,width:1,height:1};
  a.send({type:"keyframe",region});b.send({type:"keyframe",region});
  await vi.waitFor(()=>expect(f.child.commands.filter(m=>m.type==="keyframe").at(-1)?.regions).toHaveLength(2));
  const specs=f.child.commands.filter(m=>m.type==="keyframe").at(-1).regions;
  expect(specs[0].id).not.toBe(specs[1].id);expect(specs.every((s:any)=>s.id!==region.id)).toBe(true);
  f.child.send({...frame(2),info:{...frame(2).info,width:1,height:1,regions:specs.map((s:any,i:number)=>({...s,digest:String(i).repeat(64)}))}});
  await vi.waitFor(()=>expect(b.messages.at(-1)?.info?.seq).toBe(2));
  expect(a.messages.at(-1).info.regions).toEqual([{...region,digest:"0".repeat(64)}]);
  expect(b.messages.at(-1).info.regions).toEqual([{...region,digest:"1".repeat(64)}]);
  a.session.stdin.end();await vi.waitFor(()=>expect(f.child.commands.filter(m=>m.type==="keyframe").at(-1)?.regions).toHaveLength(1));
  b.send({type:"keyframe",region:null});await vi.waitFor(()=>expect(f.child.commands.filter(m=>m.type==="keyframe").at(-1)?.regions).toEqual([]));
 }finally{f.pool.dispose();}
});

it("maps native capture input evidence to each viewer across exclusive handover",async()=>{
 const f=fixture(),a=f.join(),b=f.join();
 const native=(seq:number,floor:number)=>({...frame(seq),info:{...frame(seq).info,timing:"unavailable",sourceInputSeq:floor}});
 try{
  f.child.send({...ready,backend:"linux-portal",inputCapabilities:{keys:["KeyA"],text:false,pointerButtons:[0],wheel:true}});
  f.child.send(native(1,0));await vi.waitFor(()=>expect(b.messages).toHaveLength(2));a.send({type:"ack",seq:1});b.send({type:"ack",seq:1});
  expect(a.session.requestControl!(true)).toBe(true);a.send({type:"control",enabled:true});
  a.send({type:"input",seq:7,input:{kind:"key",code:"KeyA",down:true}});f.child.send({type:"input_ack",seq:1});
  await vi.waitFor(()=>expect(a.messages.at(-1)).toEqual({type:"input_ack",seq:7}));
  f.child.send(native(2,1));await vi.waitFor(()=>expect(b.messages.at(-1)?.info?.seq).toBe(2));
  expect(a.messages.at(-1).info.sourceInputSeq).toBe(7);expect(b.messages.at(-1).info.sourceInputSeq).toBe(0);
  a.send({type:"ack",seq:2});b.send({type:"ack",seq:2});a.session.requestControl!(false);expect(b.session.requestControl!(true)).toBe(true);b.send({type:"control",enabled:true});
  b.send({type:"input",seq:3,input:{kind:"key",code:"KeyA",down:false}});f.child.send({type:"input_ack",seq:2});f.child.send(native(3,2));
  await vi.waitFor(()=>expect(b.messages.at(-1)?.info?.seq).toBe(3));
  expect(a.messages.at(-1).info.sourceInputSeq).toBe(7);expect(b.messages.at(-1).info.sourceInputSeq).toBe(3);
 }finally{f.pool.dispose();}
});
it("routes native idle only to viewers who acknowledged that exact image and forwards source invalidation",async()=>{
 const f=fixture(),a=f.join(),b=f.join();
 try{
  f.child.send({...ready,backend:"linux-portal"});f.child.send({...frame(1),info:{...frame(1).info,timing:"unavailable",sourceInputSeq:0}});
  await vi.waitFor(()=>expect(b.messages).toHaveLength(2));b.send({type:"ack",seq:1});
  f.child.send({type:"platform_idle",backend:"linux-portal",seq:1,counter:1});
  await vi.waitFor(()=>expect(b.messages.at(-1)?.type).toBe("platform_idle"));expect(a.messages.some(m=>m.type==="platform_idle")).toBe(false);
  f.child.send({type:"platform_failure",backend:"linux-portal",code:"source_changed"});
  await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));expect(b.session.exitCode).toBe(0);
  expect(a.messages.at(-1)).toEqual({type:"platform_failure",backend:"linux-portal",code:"source_changed"});
 }finally{f.pool.dispose();}
});
it.each(["future","decreasing"])("rejects %s shared native source input evidence",async failure=>{
 const f=fixture(),a=f.join();
 try{
  f.child.send({...ready,backend:"macos-sck"});f.child.send({...frame(1),info:{...frame(1).info,timing:"measured",sourceInputSeq:0}});
  await vi.waitFor(()=>expect(a.messages).toHaveLength(2));a.send({type:"ack",seq:1});
  if(failure==="decreasing"){
   a.session.requestControl!(true);a.send({type:"control",enabled:true});a.send({type:"input",seq:3,input:{kind:"key",code:"KeyA",down:true}});
   f.child.send({...frame(2),info:{...frame(2).info,timing:"measured",sourceInputSeq:1}});await vi.waitFor(()=>expect(a.messages.at(-1)?.info?.seq).toBe(2));a.send({type:"ack",seq:2});
  }
  f.child.send({...frame(3),info:{...frame(3).info,timing:"measured",sourceInputSeq:failure==="future"?1:0}});
  await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));
 }finally{f.pool.dispose();}
});

it("preserves a blocked member's captured local input floor after its skipped frame",async()=>{
 const f=fixture(),a=f.join(),b=f.join(),native=(seq:number,floor:number)=>({...frame(seq),info:{...frame(seq).info,timing:"unavailable",sourceInputSeq:floor}});
 try{
  f.child.send({...ready,backend:"linux-portal"});f.child.send(native(1,0));await vi.waitFor(()=>expect(b.messages).toHaveLength(2));b.send({type:"ack",seq:1});
  a.session.requestControl!(true);a.send({type:"control",enabled:true});a.send({type:"input",seq:7,input:{kind:"key",code:"KeyA",down:true}});
  f.child.send(native(2,1));await vi.waitFor(()=>expect(b.messages.at(-1)?.info?.seq).toBe(2));expect(a.messages).toHaveLength(2);
  a.send({type:"ack",seq:1});b.send({type:"ack",seq:2});f.child.send(native(3,1));await vi.waitFor(()=>expect(a.messages.at(-1)?.info?.seq).toBe(3));
  expect(a.messages.at(-1).info.sourceInputSeq).toBe(7);expect(b.messages.at(-1).info.sourceInputSeq).toBe(0);
 }finally{f.pool.dispose();}
});
it.each(["linux-portal","macos-sck"])("preserves typed %s startup permission failure for every configured member",async backend=>{
 const f=fixture(),config={type:"configure",nativePlatform:backend,options:{width:320}},a=f.join("source",config),b=f.join("source",config);
 try{
  f.child.send({type:"platform_failure",backend,code:"permission_cancelled"});await vi.waitFor(()=>expect(a.session.exitCode).toBe(0));
  expect(b.session.exitCode).toBe(0);expect(a.messages).toEqual([{type:"platform_failure",backend,code:"permission_cancelled"}]);expect(b.messages).toEqual(a.messages);
 }finally{f.pool.dispose();}
});

it.skipIf(process.platform==="win32")("keeps the physical PCM owner and nonempty quota across shared subscriber closes",async()=>{
 const f=fixture(),paths=new DesktopNativePcmPaths({retryMs:5});let exited=false;
 const closed=new Promise<void>(resolve=>f.child.once("close",()=>{exited=true;resolve();}));f.child.nativePcm={paths,owner:{closed,exited:()=>exited}};
 const physicalClose=f.child.close.bind(f.child),hold=vi.spyOn(f.child,"close").mockImplementation(()=>{}),a=f.join(),b=f.join();
 expect(a.session.nativePcm).toBe(f.child.nativePcm);
 const lease=await a.session.nativePcm!.paths.create(a.session.nativePcm!.owner,"SodaDesktopAudio-"+"b".repeat(32)),server=createUnixServer();
 try{
  await new Promise<void>(resolve=>server.listen(lease.path,resolve));await chmod(lease.path,0o600);await lease.verify();
  expect(b.session.nativePcm).toBe(f.child.nativePcm);a.session.stdin.end();await new Promise<void>(resolve=>setImmediate(resolve));
  expect(a.session.exitCode).toBe(0);expect(exited).toBe(false);expect(b.session.nativePcm!.owner.exited()).toBe(false);expect(paths.pending).toBe(1);
  b.session.stdin.end();await new Promise<void>(resolve=>setImmediate(resolve));await lease.retire();expect(exited).toBe(false);expect(paths.pending).toBe(1);
  physicalClose();await expect.poll(()=>paths.pending).toBe(0);expect(exited).toBe(true);
 }finally{hold.mockRestore();physicalClose();await new Promise<void>(resolve=>server.close(()=>resolve()));await lease.retire();f.pool.dispose();}
});

it("keeps exclusive native microphone ownership without forwarding inline helper commands",async()=>{
 const f=fixture(),a=f.join(),b=f.join();
 try{
  f.child.send({...ready,microphone:true});await vi.waitFor(()=>expect(b.messages.length).toBe(1));
  expect(a.session.requestMicrophone!("native-a",true,false)).toBe(true);
  expect(b.session.requestMicrophone!("native-b",true,false)).toBe(false);
  a.send({type:"native_microphone",id:"native-a",enabled:true,pipeName:"forged"});
  expect(f.child.commands.some(m=>m.type==="native_microphone")).toBe(false);
  a.session.requestMicrophone!("native-a",false,false);
  expect(b.session.requestMicrophone!("native-b",true,false)).toBe(true);
  b.session.stdin.end();await vi.waitFor(()=>expect(b.session.exitCode).toBe(0));
  expect(f.child.commands.some(m=>m.type==="native_microphone")).toBe(false);
  expect(a.session.requestMicrophone!("native-next",true,false)).toBe(true);
 }finally{f.pool.dispose();}
});
