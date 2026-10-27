import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { expect, it, vi } from "vitest";
import { DesktopSharedCapture, type DesktopHelper } from "./DesktopSharedCapture.js";
import { DesktopProvider } from "./DesktopProvider.js";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";

class Helper extends EventEmitter implements DesktopHelper {
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
