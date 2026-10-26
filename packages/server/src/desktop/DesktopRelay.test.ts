import {DESKTOP_PROTECTED_PROTOCOL,DESKTOP_FILES_PROTOCOL} from "@sodashitsu/protocol";
import {DESKTOP_MONITORS_PROTOCOL} from "@sodashitsu/protocol";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import WebSocket, {WebSocketServer} from "ws";
import type { AuthService } from "../auth/AuthService.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { LinkChannel, MachineLink } from "../machine/MachineLink.js";
import { DesktopRelay } from "./DesktopRelay.js";
import { DesktopProvider, desktopConfigFromEnv } from "./DesktopProvider.js";
import { DesktopNativeVideo } from "./DesktopNativeVideo.js";
import { performance } from "node:perf_hooks";
import type { Writable } from "node:stream";
import { DESKTOP_VIRTUAL_DISPLAY_PROTOCOL, DESKTOP_AUDIO_PROTOCOL, isDesktopAudio, DESKTOP_RICH_CLIPBOARD_PROTOCOL, decodeDesktopFrame, DESKTOP_IME_PROTOCOL, DesktopReady, DesktopOptions, DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL, DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL, DESKTOP_VIDEO_LANE_PROTOCOL, DESKTOP_DATAGRAM_PROTOCOL, DESKTOP_IMAGE_LANE_PROTOCOL, DESKTOP_NATIVE_RATE_PROTOCOL, DESKTOP_CURSOR_PROTOCOL, isDesktopCursor, encodeDesktopCursor, decodeDesktopMediaChunk, isDesktopMediaChunk } from "@sodashitsu/protocol";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const helper = fileURLToPath(
  new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
);
async function fixture(allowInput = true, legacy = false, configured = true, secure = false, unlockAllowed = true, cover = false, nativeFailure?: string, readyFailure?: string, imeKeys = true, unconditionalIme = false, extendedInput = true, dxgi = false, nativeFixture = false, protectedConfig?:{mode?:"elevated-default"|"elevated-uac";allowed?:boolean;force?:boolean;expectEnv?:"0"|"1"}) {
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-test-")),
    record = join(dir, "inputs.jsonl"),endedMarker=join(dir,"scope-ended"),ledger=join(dir,"ledger.jsonl");
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const web = createServer();
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`,
    endpoint = origin.replace("http", "ws") + "/desktop-share";
  const provider = new DesktopProvider(configured ? {
    command: [process.execPath, helper, "--allow-input", "--record", record, ...(protectedConfig?["--protected-end-marker",endedMarker,"--input-ledger",ledger,...(protectedConfig.mode?["--protected-mode",protectedConfig.mode]:[]),...(protectedConfig.force?["--protected-unconditional"]:[]),...(protectedConfig.expectEnv?["--expect-elevated-request",protectedConfig.expectEnv]:[])]:[]), ...(secure ? ["--secure"] : []), ...(cover ? ["--lock-cover"] : []), ...(nativeFailure ? ["--startup-failure", nativeFailure] : []), ...(readyFailure ? ["--ready-failure", readyFailure] : []), ...(!imeKeys ? ["--no-ime-keys"] : []), ...(unconditionalIme ? ["--unconditional-ime-keys"] : []), ...(!extendedInput ? ["--no-extended-input"] : []), ...(dxgi ? ["--dxgi"] : []), ...(nativeFixture ? ["--static","--native-60fps","--native-fixture",fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json",import.meta.url))] : [])],
    allowInput,
    allowNativeVideo: nativeFixture,
    allowElevated:protectedConfig?.allowed===true,
    ...(protectedConfig?{allowClipboard:true,fileRoot:dir,allowMonitors:true,allowVirtualDisplay:true}:{}),
    allowUnlock: unlockAllowed,
    origins: () => [origin],
  } : undefined);
  let revoke: (id: string) => void = () => undefined;
  const auth = {
    authorizeUpgrade: async (req: { headers: Record<string, string> }) =>
      req.headers.cookie === "test=ok" ? { ok: true, sessionId: "ok" } : { ok: false },
    verifySession: (id: string) => id === "ok",
    onSessionRevoked: (f: typeof revoke) => {
      revoke = f;
      return { dispose() {} };
    },
  } as unknown as AuthService;
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const origins = new OriginRejectionLog(logger, {
    isAllowed: (o, h) => o === origin && h === new URL(origin).host,
    isHostAllowed: () => true,
    allowedHostPorts: () => [new URL(origin).host],
  });
  const startRequests: {options: Record<string,unknown>;videoTicket?:string;imageTicket?:string}[] = [];
  let closed = 0,
    starts = 0, providerStartCalls = 0;
  const link = {
    openChannel() {
      const owner = `channel-${starts++}`;
      let onText: (s: string) => void = () => undefined,
        onClose: () => void = () => undefined,
        ended = false;
      const channel = {
        onText(f: typeof onText) {
          onText = f;
        },
        onBinary() {},
        onClose(f: typeof onClose) {
          onClose = f;
        },
        sendText(text: string) {
          const m = JSON.parse(text);
          if(m.method === "desktop.start") startRequests.push(m.params);
          void (async () => {
            try {
              if(legacy && m.method === "desktop.start") {
                const {imeKeys: _ime, extendedInput: _extended, ...oldShape}=DesktopOptions.shape;
                const {z}=await import("zod");
                z.object(oldShape).strict().parse(m.params.options);
              }
              const result =
                m.method === "client.hello"
                  ? {}
                  : m.method === "desktop.capabilities"
                    ? legacy
                      ? { available: true, allowInput }
                      : provider.capabilities()
                    : (providerStartCalls++, await provider.start(owner, m.params));
              onText(JSON.stringify({ id: m.id, result }));
            } catch {
              onText(JSON.stringify({ id: m.id, error: { message: "denied" } }));
            }
          })();
        },
        close() {
          if (ended) return;
          ended = true;
          closed++;
          provider.clientGone(owner);
          onClose();
        },
      };
      return channel as unknown as LinkChannel;
    },
  } as unknown as MachineLink;
  const relay = new DesktopRelay(auth, origins, {
    route: (id) => (id === "remote" ? { kind: "ok", link } : { kind: "unknown" }),
  });
  web.on("upgrade", (req, socket, head) => {
    void relay.upgrade(req, socket, head);
  });
  cleanup.push(async () => {
    relay.dispose();
    provider.dispose();
    await new Promise<void>((r) => web.close(() => r()));
  });
  async function viewer(ime: boolean | "extended" | "native" | "pipeline" | "lane" | "rate" | "cursor" | "images" | "udp" | "audio" | "rich" | "monitors" | "virtual" | "protected" = false) {
    const ws = new WebSocket(endpoint, ime === "protected" ? [DESKTOP_PROTECTED_PROTOCOL,DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_RICH_CLIPBOARD_PROTOCOL,DESKTOP_FILES_PROTOCOL,DESKTOP_MONITORS_PROTOCOL,DESKTOP_CURSOR_PROTOCOL] : ime === "virtual" ? [DESKTOP_VIRTUAL_DISPLAY_PROTOCOL] : ime === "monitors" ? [DESKTOP_MONITORS_PROTOCOL] : ime === "rich" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_RICH_CLIPBOARD_PROTOCOL] : ime === "audio" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_AUDIO_PROTOCOL] : ime === "udp" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_DATAGRAM_PROTOCOL] : ime === "images" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL] : ime === "cursor" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_CURSOR_PROTOCOL] : ime === "rate" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_NATIVE_RATE_PROTOCOL] : ime === "lane" ? [DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL,DESKTOP_VIDEO_LANE_PROTOCOL] : ime === "pipeline" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL] : ime === "native" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL] : ime === "extended" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL] : ime ? [DESKTOP_IME_PROTOCOL] : [], { headers: { cookie: "test=ok", origin } });
    const messages: Record<string, unknown>[] = [],
      frames: Uint8Array[] = [];
    ws.on("error", () => undefined);
    ws.on("message", (bytes, binary) => {
      if (binary) frames.push(new Uint8Array(bytes as Buffer));
      else messages.push(JSON.parse(bytes.toString()));
    });
    await new Promise<void>((r, reject) => {
      ws.once("open", r);
      ws.once("error", reject);
    });
    return {
      ws,
      messages,
      frames,
      send(value: unknown) {
        ws.send(JSON.stringify(value));
      },
    };
  }
  return {
    viewer,
    relay,
    provider,
    endpoint,
    origin,
    record,endedMarker,ledger,
    revoke: () => revoke("ok"),
    closed: () => closed,
    providerStartCalls: () => providerStartCalls,
    startRequests,
  };
}
const start = { type: "start", machineId: "remote", options: { width: 320, fps: 10, quality: 65 } };
it("keeps image freshness for unmarked and agent input even when native video is fresh", async () => {
  const f=await fixture(), viewer=await f.viewer();viewer.send(start);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);
  const share=(f.provider as unknown as {active:{frameAt:number;seq:number;ws:WebSocket;native?:DesktopNativeVideo;deferNativeSnapshots?:boolean;process:{stdin:Writable}}}).active;
  // This test injects the private B-side input handler directly. Keep its ACKs
  // local: A did not allocate these sequences. Browser coverage below uses the
  // real end-to-end ACK path.
  const localAcks=vi.spyOn(share.ws,"send").mockImplementation(()=>{});
  const helperWrites=vi.spyOn(share.process.stdin,"write");
  const helperInput=(seq:number)=>helperWrites.mock.calls.map(([data])=>typeof data==="string"?JSON.parse(data):undefined).find(m=>m?.type==="input"&&m.seq===seq);
  const recorded=()=>readFile(f.record,"utf8").catch((error:NodeJS.ErrnoException)=>{if(error.code==="ENOENT")return "";throw error;});
  try {
  let id="";
  const native=new DesktopNativeVideo({enabled:true,width:320,sourceWidth:320,sourceHeight:180,fps:10,send:()=>true,write:(m:any)=>{if(m.type==="native_video"&&m.enabled)id=m.id;},policy:()=>{},buffered:()=>0});
  native.fromViewer({type:"media",enabled:true,settings:{transport:"native"}});
  native.fromHelper({type:"native_frame",id,seq:1,width:320,height:180,timestamp:1,key:true,codec:"avc1.42041f",data:Buffer.from([0,0,0,1,0x65,1]).toString("base64")});
  native.fromViewer({type:"native_video_ack",id,generation:1,seq:1});
  share.native=native;share.frameAt=performance.now()-3000;
  const inject=(seq:number,text:string,marked=false)=>share.ws.emit("message",Buffer.from(JSON.stringify({type:"input",seq,frameSeq:share.seq,input:{kind:"text",text},...(marked?{nativeDraw:true}:{})})),false);
  inject(1,"DENIED_IMAGE");inject(2,"ACCEPT_NATIVE",true);
  await expect.poll(async()=>(await recorded()).includes("ACCEPT_NATIVE")).toBe(true);
  expect(await readFile(f.record,"utf8")).not.toContain("DENIED_IMAGE");
  expect(helperInput(2)).not.toHaveProperty("deferNativeSnapshot");
  share.deferNativeSnapshots=true;
  inject(3,"ACCEPT_NATIVE_DEFER",true);
  await expect.poll(async()=>(await recorded()).includes("ACCEPT_NATIVE_DEFER")).toBe(true);
  expect(helperInput(3)).toHaveProperty("deferNativeSnapshot",true);
  share.frameAt=performance.now();inject(4,"ACCEPT_IMAGE_WITH_OPTIN");
  await expect.poll(async()=>(await recorded()).includes("ACCEPT_IMAGE_WITH_OPTIN")).toBe(true);
  expect(helperInput(4)).not.toHaveProperty("deferNativeSnapshot");
  native.stop();share.frameAt=performance.now();
  inject(5,"DENIED_STOPPED",true);inject(6,"ACCEPT_IMAGE");
  await expect.poll(async()=>(await readFile(f.record,"utf8")).includes('"text":"ACCEPT_IMAGE"')).toBe(true);
  expect(await readFile(f.record,"utf8")).not.toContain("DENIED_STOPPED");
  await expect.poll(()=>localAcks.mock.calls.some(([data])=>typeof data==="string"&&JSON.parse(data).type==="input_ack"&&JSON.parse(data).seq===6)).toBe(true);
  } finally {helperWrites.mockRestore();localAcks.mockRestore();}
});
it("reconnects when an installed worker ends after secure ready and the parent verifies a different desktop",async()=>{
  const f=await fixture(true,false,true,true,true,false,undefined,"source_transition"),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.map(m=>m.type)).toEqual(["ready","lock_screen_changed"]);
  expect(viewer.frames).toHaveLength(0);
});
it("preserves the first secure runtime fault over a later parent transition",async()=>{
  const f=await fixture(true,false,true,true,true,false,undefined,"worker_initialization"),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.map(m=>m.type)).toEqual(["ready","error"]);
  expect(viewer.messages.at(-1)?.message).toContain("認証画面の準備に失敗");
  expect(JSON.stringify(viewer.messages)).not.toContain("private");
});
it("does not accept secure runtime diagnostics from a normal desktop",async()=>{
  const f=await fixture(true,false,true,false,true,false,undefined,"source_transition"),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.map(m=>m.type)).toEqual(["ready"]);
});
it.each(["source_transition", "worker_input_desktop_default", "worker_session_unlocked"])("reclassifies %s before ready without images or control", async (code) => {
  const f=await fixture(true,false,true,true,true,false,code),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages).toContainEqual({type:"lock_screen_changed"});
  expect(viewer.messages.some(m=>m.type==="ready"||m.type==="control")).toBe(false);
  expect(viewer.frames).toHaveLength(0);
});
it("keeps fixed startup failure details and drops native exception contents", async()=>{
  const f=await fixture(true,false,true,true,true,false,"worker_start_or_connection"),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.find(m=>m.type==="error")?.message).toContain("起動または接続できません");
  expect(JSON.stringify(viewer.messages)).not.toContain("private");
});
it.each([false,true])("rejects untrusted startup diagnostics (unlock=%s)",async(unlock)=>{
  const f=await fixture(true,false,true,true,unlock,false,unlock?"private unknown code":"source_transition"),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.some(m=>m.type==="lock_screen_changed"||m.type==="error")).toBe(false);
});
it("explains missing provider setup before trying to start a helper", async () => {
  const f = await fixture(true, false, false), viewer = await f.viewer();
  viewer.send(start);
  await expect.poll(() => viewer.messages.find(m => m.type === "error")?.message).toContain("soda serve --desktop");
  expect(viewer.messages.find(m => m.type === "error")?.message).toContain("接続先PC");
  expect(viewer.frames).toHaveLength(0);
  expect(f.providerStartCalls()).toBe(0);
  await expect.poll(() => viewer.ws.readyState).toBe(WebSocket.CLOSED);
});
it("automatically connects B to A, isolates viewers and enforces both input permissions", async () => {
  const f = await fixture(),
    a = await f.viewer(),
    other = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  expect(a.messages).toContainEqual(
    expect.objectContaining({ type: "ready", backend: "synthetic" }),
  );
  expect(a.messages.find((m) => m.type === "ready")).not.toHaveProperty("image");
  expect(other.frames).toHaveLength(0);
  expect(other.messages).toHaveLength(0);
  const frame = decodeDesktopFrame(a.frames[0]!).info;
  const text = {
    type: "input",
    seq: 1,
    frameSeq: frame.seq,
    input: { kind: "text", text: "日本語" },
  };
  a.send(text);
  a.send({ type: "control", enabled: true });
  await expect.poll(() => a.messages.some((m) => m.type === "control" && m.enabled)).toBe(true);
  other.send({ ...text, seq: 2 });
  a.send({ ...text, seq: 3 });
  await expect.poll(() => a.messages.some((m) => m.type === "input_ack" && m.seq === 3)).toBe(true);
  expect((await readFile(f.record, "utf8")).trim()).toBe(JSON.stringify(text.input));
  a.send({ type: "ack", seq: frame.seq });
  await expect.poll(() => a.frames.length).toBeGreaterThan(1);
  expect(a.messages).toContainEqual(expect.objectContaining({ type: "stats" }));
  f.revoke();
  await expect.poll(() => a.ws.readyState).toBe(WebSocket.CLOSED);
  expect(f.closed()).toBe(1);
  other.ws.close();
});
it("refuses control when B is readonly and closes an unacknowledged share", async () => {
  const f = await fixture(false),
    a = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  a.send({ type: "control", enabled: true });
  await expect
    .poll(() => a.messages.some((m) => m.type === "control" && m.enabled === false))
    .toBe(true);
  a.send({ type: "input", seq: 1, frameSeq: 1, input: { kind: "text", text: "DENIED" } });
  a.send({ type: "heartbeat" });
  await expect.poll(() => a.ws.readyState, { timeout: 8000 }).toBe(WebSocket.CLOSED);
  await expect(readFile(f.record, "utf8")).rejects.toThrow();
}, 12000);
it("rejects unauthenticated viewers, wrong Origins, unused tickets and unexpected ACKs", async () => {
  const f = await fixture();
  for (const headers of [
    { origin: f.origin },
    { origin: "https://evil.test", cookie: "test=ok" },
  ]) {
    const ws = new WebSocket(f.endpoint, { headers });
    await expect(
      new Promise((r, reject) => {
        ws.once("open", r);
        ws.once("error", reject);
      }),
    ).rejects.toThrow();
  }
  const provider = new WebSocket(f.endpoint);
  provider.on("error", () => undefined);
  await new Promise<void>((r) => provider.once("open", r));
  provider.send(JSON.stringify({ type: "provider", ticket: "x".repeat(43) }));
  await expect.poll(() => provider.readyState).toBe(WebSocket.CLOSED);
  const a = await f.viewer();
  a.send(start);
  await expect.poll(() => a.frames.length).toBe(1);
  a.send({ type: "ack", seq: 999 });
  await expect.poll(() => a.ws.readyState).toBe(WebSocket.CLOSED);
});
it("keeps command/origin policy local and refuses arbitrary relay addresses before spawning", async () => {
  const cfg = desktopConfigFromEnv(
    {
      SODA_DESKTOP_COMMAND: JSON.stringify([process.execPath, helper]),
      SODA_DESKTOP_ORIGINS: "https://allowed.test",
    },
    () => [],
  );
  expect(cfg?.allowInput).toBe(false);
  const p = new DesktopProvider(cfg);
  cleanup.push(async () => p.dispose());
  for (const url of [
    "ws://192.168.1.2/desktop-share",
    "wss://untrusted.test/desktop-share",
    "wss://allowed.test/other",
    "wss://user:pass@allowed.test/desktop-share",
    "wss://allowed.test/desktop-share?q=secret",
  ])
    await expect(
      p.start("owner", { url, ticket: "x".repeat(43), options: start.options }),
    ).rejects.toThrow();
  expect(desktopConfigFromEnv({ SODA_DESKTOP_COMMAND: '["sh",null]' }, () => [])).toBeUndefined();
});

it("negotiates defaults with an old B and refuses unsupported reduced colors", async () => {
  const defaults = await fixture(true, true),
    a = await defaults.viewer();
  a.send({
    ...start,
    options: { ...start.options, deltas: true, image: { colorMode: "full", showCursor: true } },
  });
  await expect.poll(() => a.frames.length).toBe(1);
  expect(a.messages).toContainEqual(expect.objectContaining({ type: "ready" }));
  a.ws.close();
  const reduced = await fixture(true, true),
    b = await reduced.viewer();
  b.send({
    ...start,
    options: { ...start.options, image: { colorMode: "rgb332", showCursor: true } },
  });
  await expect.poll(() => b.ws.readyState).toBe(WebSocket.CLOSED);
  expect(b.frames).toHaveLength(0);
  expect(b.messages).toContainEqual(expect.objectContaining({ type: "error" }));
});

it("allows a fresh share after handoff cleanup is rolled back", async () => {
  const f = await fixture(),
    first = await f.viewer();
  first.send(start);
  await expect.poll(() => first.frames.length, { timeout: 5000 }).toBe(1);
  f.provider.dispose(); // composeServer.closeClients uses this before a handoff attempt.
  await expect.poll(() => first.ws.readyState, { timeout: 5000 }).toBe(WebSocket.CLOSED);
  const resumed = await f.viewer(); // composeServer.reopenClients reuses the original instance.
  resumed.send(start);
  await expect
    .poll(() => resumed.frames.length > 0 || resumed.ws.readyState === WebSocket.CLOSED, {
      timeout: 5000,
    })
    .toBe(true);
  expect(resumed.frames).toHaveLength(1);
  expect(resumed.messages).toContainEqual(expect.objectContaining({ type: "ready" }));
  resumed.ws.close();
}, 10000);

it("stops an active synthetic share immediately when local permissions are revoked", async () => {
  const f = await fixture(), viewer = await f.viewer();
  viewer.send(start);
  await expect.poll(() => viewer.frames.length).toBe(1);
  f.provider.configure(undefined);
  await expect.poll(() => viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(f.provider.capabilities().available).toBe(false);
});


it("never grants agent access on a lock screen and closes the old generation when unlocked", async () => {
  const f=await fixture(true,false,true,true), viewer=await f.viewer();
  viewer.send({...start,options:{...start.options,features:true}});
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  expect(viewer.messages.find(m=>m.type==="ready")).toMatchObject({secureDesktop:true,allowClipboard:false,allowMedia:false});
  viewer.send({type:"agent_grant",enabled:true});
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  expect(viewer.messages.some(m=>m.type==="agent_ticket")).toBe(false);
  viewer.send({type:"sas"});
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.some(m=>m.type==="session_unlocked")).toBe(true);
});
it("rejects a source which advertises a lock screen without the local unlock ceiling", async () => {
  const f=await fixture(true,false,true,true,false), viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.frames).toHaveLength(0);
  expect(viewer.messages.some(m=>m.type==="ready")).toBe(false);
});

it("has no cover frames or agent access and dismisses only after human control", async () => {
  const f=await fixture(true,false,true,true,true,true),viewer=await f.viewer();
  viewer.send({...start,options:{...start.options,features:true}});
  await expect.poll(()=>viewer.messages.find(m=>m.type==="ready")).toMatchObject({secureDesktop:true,lockScreenCover:true,allowClipboard:false,allowMedia:false});
  viewer.send({type:"dismiss_lock_screen"});
  viewer.send({type:"agent_grant",enabled:true});
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  expect(viewer.ws.readyState).toBe(WebSocket.OPEN);
  expect(viewer.frames).toHaveLength(0);
  expect(viewer.messages.some(m=>m.type==="agent_ticket"||m.type==="lock_screen_changed")).toBe(false);
  viewer.send({type:"input",seq:1,frameSeq:1,input:{kind:"text",text:"must-not-send"}});
  viewer.send({type:"dismiss_lock_screen"});
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.some(m=>m.type==="lock_screen_changed")).toBe(true);
  expect(await readFile(f.record,"utf8").catch(()=>"")).toBe("");
});

it.each([true,false])("forwards named IME keys only when advertised by the helper (%s)", async supported => {
  const f=await fixture(true,false,true,false,true,false,undefined,undefined,supported),viewer=await f.viewer(true);
  viewer.send(start);
  await expect.poll(()=>viewer.messages.some(m=>m.type==="ready")).toBe(true);
  expect(viewer.messages.find(m=>m.type==="ready")?.imeKeys).toBe(supported?true:undefined);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  const frameSeq=decodeDesktopFrame(viewer.frames.at(-1)!).info.seq;
  viewer.send({type:"input",seq:1,frameSeq,input:{kind:"key",code:"ImeOn",down:true}});
  viewer.send({type:"input",seq:2,frameSeq,input:{kind:"key",code:"ImeOn",down:false}});
  viewer.send({type:"input",seq:3,frameSeq,input:{kind:"key",code:"KeyA",down:true}});
  await expect.poll(()=>viewer.messages.some(m=>m.type==="input_ack"&&m.seq===3)).toBe(true);
  const record=await readFile(f.record,"utf8");
  expect(record.includes('"code":"ImeOn"')).toBe(supported);
  expect(viewer.ws.readyState).toBe(WebSocket.OPEN);
});

it.each([false,true])("keeps strict legacy viewers connected without unsolicited IME fields (helper=%s)", async unconditional => {
  const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,unconditional),viewer=await f.viewer();
  viewer.send(start);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  const ready=viewer.messages.find(m=>m.type==="ready")!;
  const {imeKeys: _ime, extendedInput: _extended, ...oldShape}=DesktopReady.shape;
  const {z}=await import("zod");
  expect(()=>z.object(oldShape).strict().parse(ready)).not.toThrow();
  expect(ready).not.toHaveProperty("imeKeys");
  expect(viewer.ws.readyState).toBe(WebSocket.OPEN);
});
it("does not pass the new IME option to a provider without capability support", async()=>{
  const f=await fixture(true,true),viewer=await f.viewer(true);
  viewer.send(start);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  expect(viewer.messages.find(m=>m.type==="ready")).not.toHaveProperty("imeKeys");
  expect(f.startRequests[0]!.options).not.toHaveProperty("imeKeys");
  expect(viewer.ws.readyState).toBe(WebSocket.OPEN);
});

it.each([true,false])("keeps middle click and gates side buttons/added keys by helper support (%s)",async supported=>{
  const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,supported),viewer=await f.viewer("extended");
  viewer.send(start);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  expect(viewer.ws.protocol).toBe(DESKTOP_INPUT_PROTOCOL);
  expect(viewer.messages.find(m=>m.type==="ready")?.extendedInput).toBe(supported?true:undefined);
  viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  const frameSeq=decodeDesktopFrame(viewer.frames.at(-1)!).info.seq;
  let seq=0;
  for(const button of [1,3,4])for(const event of ["down","up"])
    viewer.send({type:"input",seq:++seq,frameSeq,input:{kind:"pointer",x:0.5,y:0.5,event,button}});
  for(const code of ["F24","Tab"])for(const down of [true,false])
    viewer.send({type:"input",seq:++seq,frameSeq,input:{kind:"key",code,down}});
  await expect.poll(()=>viewer.messages.some(m=>m.type==="input_ack"&&m.seq===seq)).toBe(true);
  const record=await readFile(f.record,"utf8");
  expect(record.includes('"button":1')).toBe(true);
  for(const button of [3,4])expect(record.includes('"button":'+button)).toBe(supported);
  expect(record.includes('"code":"F24"')).toBe(supported);
  expect(viewer.ws.readyState).toBe(WebSocket.OPEN);
});
it("does not add extended ready fields for an IME-only viewer",async()=>{
  const f=await fixture(),viewer=await f.viewer(true);viewer.send(start);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  expect(viewer.ws.protocol).toBe(DESKTOP_IME_PROTOCOL);
  expect(viewer.messages.find(m=>m.type==="ready")).toMatchObject({imeKeys:true});
  expect(viewer.messages.find(m=>m.type==="ready")).not.toHaveProperty("extendedInput");
  expect(f.startRequests[0]!.options).not.toHaveProperty("extendedInput");
});

it("negotiates DXGI only on the local helper channel and keeps legacy viewer ready compatible", async () => {
  const f = await fixture(true, false, true, false, true, false, undefined, undefined, true, false, true, true);
  const viewer = await f.viewer();
  viewer.send(start);
  await expect.poll(() => viewer.frames.length).toBeGreaterThan(0);
  const configure = JSON.parse(await readFile(f.record + ".configure.json", "utf8"));
  expect(configure.captureBackends).toEqual(["dxgi"]);
  expect(f.startRequests[0]!.options).not.toHaveProperty("captureBackends");
  const ready = viewer.messages.find(m => m.type === "ready");
  expect(ready?.backend).toBe("windows-gdi");
  expect(DesktopReady.parse(ready).backend).toBe("windows-gdi");
  viewer.send({type:"stop"});
});

it("never sends native video options to an older provider even when the new browser offers the header",async()=>{
 const f=await fixture(true,true),v=await f.viewer("native");v.send(start);
 await expect.poll(()=>v.frames.length).toBeGreaterThan(0);expect(f.startRequests[0]!.options).not.toHaveProperty("nativeVideo");
 expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeVideo");v.send({type:"stop"});
});
it("keeps images usable when a new provider has an old native-unaware helper",async()=>{
 const f=await fixture(),v=await f.viewer("native");v.send(start);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options.nativeVideo).toBe(true);expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeVideo");v.send({type:"stop"});
});

it("strips pipeline options for an older provider despite the viewer v2 header", async () => {
 const f=await fixture(true,true),v=await f.viewer("pipeline");v.send(start);
 await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options).not.toHaveProperty("nativeVideoWindow");
 expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeVideoWindow");v.send({type:"stop"});
});
it("downgrades the pipeline when the helper lacks the capability", async () => {
 const f=await fixture(),v=await f.viewer("pipeline");v.send(start);
 await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options.nativeVideoWindow).toBe(3);
 expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeVideoWindow");v.send({type:"stop"});
});

it.each(["malformed", "source congestion", "viewer congestion"])("isolates H264 video from input ACKs and preserves main/image control after %s",async fault=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),v=await f.viewer("lane");
 v.send({...start,options:{width:640,fps:30,quality:65,features:true}});
 await expect.poll(()=>v.messages.some(m=>m.type==="video_ticket")).toBe(true);
 const ticket=v.messages.find(m=>m.type==="video_ticket")!.ticket;
 const video=new WebSocket(f.endpoint,DESKTOP_VIDEO_LANE_PROTOCOL,{headers:{cookie:"test=ok",origin:f.origin}}),events:any[]=[],packets:Buffer[]=[];
 video.on("error",()=>{});
 video.on("message",(b,binary)=>{if(binary)packets.push(Buffer.from(b as Buffer));else events.push(JSON.parse(b.toString()));});
 await new Promise<void>((resolve,reject)=>{video.once("open",resolve);video.once("error",reject);});
 video.send(JSON.stringify({type:"video_viewer",ticket}));
 await expect.poll(()=>v.messages.some(m=>m.type==="video_ready")).toBe(true);
 await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 v.send({type:"ack",seq:decodeDesktopFrame(v.frames[0]!).info.seq});
 v.send({type:"control",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);
 v.send({type:"media",enabled:true,settings:{transport:"native"}});
 await expect.poll(()=>packets.length).toBeGreaterThan(0);
 expect(events.some(m=>m.type==="media_stream"&&m.mime==="video/h264")).toBe(true);
 expect(v.frames.some(b=>isDesktopMediaChunk(b))).toBe(false);
 const native=events.find(m=>m.type==="media_stream"),packet=decodeDesktopMediaChunk(packets[0]!);
 v.send({type:"native_video_ack",id:native.id,generation:packet.generation,seq:packet.seq});
 v.send({type:"input",seq:1,frameSeq:decodeDesktopFrame(v.frames[0]!).info.seq,input:{kind:"key",code:"ArrowRight",down:true}});
 await expect.poll(()=>v.messages.some(m=>m.type==="input_ack"&&m.seq===1)).toBe(true);
 // Fail only generated video; never disconnect an actual machine or inject OS input.
 const share=(f.provider as any).active;
 if(fault==="malformed")share.videoSocket.send(JSON.stringify({type:"input_ack",seq:999}));
 else {
   const socket=fault==="source congestion" ? share.videoSocket : [...(f.relay as any).videoLanes.pairs][0].viewer;
   Object.defineProperty(socket,"bufferedAmount",{configurable:true,get:()=>600000});
   const next=decodeDesktopMediaChunk(packets[packets.length-1]!);
   for(let seq=2;seq<=next.seq;seq++)v.send({type:"native_video_ack",id:native.id,generation:1,seq});
 }
 await expect.poll(()=>video.readyState).toBe(WebSocket.CLOSED);
 expect(v.ws.readyState).toBe(WebSocket.OPEN);
 await expect.poll(()=>v.messages.some(m=>m.type==="video_closed")).toBe(true);
 v.send({type:"release"});v.send({type:"control",enabled:false});
 await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled===false)).toBe(true);
 expect((f.provider as any).active.dead).toBe(false);
 await expect.poll(()=>v.frames.length).toBeGreaterThan(1);
 const fresh=decodeDesktopFrame(v.frames[v.frames.length-1]!).info.seq;
 v.send({type:"ack",seq:fresh});v.send({type:"control",enabled:true});
 await expect.poll(()=>v.messages.filter(m=>m.type==="control"&&m.enabled).length).toBe(2);
 v.send({type:"input",seq:2,frameSeq:fresh,input:{kind:"key",code:"ArrowRight",down:false}});
 await expect.poll(()=>v.messages.some(m=>m.type==="input_ack"&&m.seq===2)).toBe(true);
 v.send({type:"stop"});
});
it("does not expose video tickets to legacy viewers or pass them to legacy providers",async()=>{
 const oldB=await fixture(true,true),newViewer=await oldB.viewer("lane");newViewer.send(start);
 await expect.poll(()=>newViewer.frames.length).toBeGreaterThan(0);
 expect(oldB.startRequests[0]).not.toHaveProperty("videoTicket");expect(newViewer.messages.some(m=>m.type==="video_ticket")).toBe(false);newViewer.send({type:"stop"});
 const newB=await fixture(),oldViewer=await newB.viewer("native");oldViewer.send(start);await expect.poll(()=>oldViewer.frames.length).toBeGreaterThan(0);
 expect(newB.startRequests[0]).not.toHaveProperty("videoTicket");expect(oldViewer.messages.some(m=>m.type==="video_ticket")).toBe(false);oldViewer.send({type:"stop"});
});

it("ignores delayed native stop metadata after a browser-media switch and does not stop browser media when the idle lane closes",async()=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),v=await f.viewer("lane");
 v.send({...start,options:{width:640,fps:30,quality:65,features:true}});
 await expect.poll(()=>v.messages.some(m=>m.type==="video_ticket")).toBe(true);
 const video=new WebSocket(f.endpoint,DESKTOP_VIDEO_LANE_PROTOCOL,{headers:{cookie:"test=ok",origin:f.origin}}),events:any[]=[];
 video.on("error",()=>{});video.on("message",(b,binary)=>{if(!binary)events.push(JSON.parse(b.toString()));});
 await new Promise<void>((r,j)=>{video.once("open",r);video.once("error",j);});video.send(JSON.stringify({type:"video_viewer",ticket:v.messages.find(m=>m.type==="video_ticket")!.ticket}));
 await expect.poll(()=>v.messages.some(m=>m.type==="video_ready")).toBe(true);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 v.send({type:"ack",seq:decodeDesktopFrame(v.frames[0]!).info.seq});v.send({type:"media",enabled:true,settings:{transport:"native"}});
 await expect.poll(()=>events.some(m=>m.type==="media_stream")).toBe(true);
 const share=(f.provider as any).active,serverViewer=[...(f.relay as any).viewers][0],source=share.videoSocket as WebSocket;
 const held:any[]=[],send=source.send.bind(source);
 vi.spyOn(source,"send").mockImplementation(((data:any)=>{if(typeof data==="string"&&JSON.parse(data).state==="images")held.push(JSON.parse(data));else send(data);}) as any);
 v.send({type:"media",enabled:true,settings:{transport:"relay"}});await expect.poll(()=>held.length).toBe(1);
 const id="11111111-1111-4111-8111-111111111111";
 serverViewer.provider.emit("message",Buffer.from(JSON.stringify({type:"media_status",id,state:"negotiating",audio:false})),false);
 await expect.poll(()=>v.messages.some(m=>m.type==="media_status"&&m.id===id)).toBe(true);
 send(JSON.stringify(held[0]));
 await new Promise<void>(r=>{source.once("pong",()=>r());source.ping();});
 expect(serverViewer.media.id).toBe(id);
 const before=v.messages.filter(m=>m.type==="media_status"&&m.state==="images").length;
 source.terminate();await expect.poll(()=>v.messages.some(m=>m.type==="video_closed")).toBe(true);
 expect(serverViewer.media.id).toBe(id);expect(v.messages.filter(m=>m.type==="media_status"&&m.state==="images")).toHaveLength(before);
 v.send({type:"stop"});
});

it.each(["rate","pipeline"] as const)("negotiates native 60fps independently of image fps only with viewer header (%s)",async mode=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),v=await f.viewer(mode);
 v.send({...start,options:{width:640,fps:10,quality:65,features:true}});await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 const ready=v.messages.find(m=>m.type==="ready")!;
 expect(ready.nativeMaxFps).toBe(mode==="rate"?60:undefined);expect(f.startRequests[0]!.options.fps).toBe(10);
 expect(f.startRequests[0]!.options.nativeMaxFps).toBe(mode==="rate"?60:undefined);
 const share=(f.provider as any).active,writes=vi.spyOn(share.process.stdin,"write");
 v.send({type:"media",enabled:true,settings:{transport:"native",fps:60}});
 await expect.poll(()=>writes.mock.calls.map(([data])=>typeof data==="string"?JSON.parse(data):undefined).find(m=>m?.type==="native_video"&&m.enabled)?.fps).toBe(mode==="rate"?60:10);
 expect(writes.mock.calls.map(([data])=>typeof data==="string"?JSON.parse(data):undefined).filter(m=>m?.type==="policy").every(m=>m.fps<=10)).toBe(true);
 v.send({type:"stop"});
});

it("keeps the legacy native rate when only the helper lacks 60fps support",async()=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true);
 const cfg=(f.provider as any).config;f.provider.configure({...cfg,command:cfg.command.filter((arg:string)=>arg!=="--native-60fps")});
 const v=await f.viewer("rate");v.send({...start,options:{width:640,fps:10,quality:65,features:true}});await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options.nativeMaxFps).toBe(60);expect(v.messages.find(m=>m.type==="ready")?.nativeVideo).toBe(true);expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeMaxFps");
 const writes=vi.spyOn((f.provider as any).active.process.stdin,"write");v.send({type:"media",enabled:true,settings:{transport:"native",fps:60}});
 await expect.poll(()=>writes.mock.calls.map(([data])=>typeof data==="string"?JSON.parse(data):undefined).find(m=>m?.type==="native_video"&&m.enabled)?.fps).toBe(10);v.send({type:"stop"});
});

it("cursor packets advance independently and cannot renew image freshness or grant input",async()=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,"--static","--cursor"]});
 const v=await f.viewer("cursor");v.send({...start,options:{...start.options,fps:1}});
 await expect.poll(()=>v.frames.filter(b=>!isDesktopCursor(b)).length).toBeGreaterThan(0);
 await expect.poll(()=>v.frames.filter(isDesktopCursor).length).toBeGreaterThan(1);
 expect(v.messages.find(m=>m.type==="ready")?.cursor).toBe(true);expect(f.startRequests[0]!.options.cursor).toBe(true);
 const server=[...(f.relay as any).viewers][0],source=(f.provider as any).active;
 v.send({type:"control",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="control"&&m.enabled)).toBe(true);
 server.pending=0;const before=server.frameAt=performance.now()-6000,sourceBefore=source.frameAt;
 for(let seq=100;seq<103;seq++)server.provider.emit("message",Buffer.from(encodeDesktopCursor({type:"cursor",seq,visible:true,x:.2,y:.3,shapeId:1})),true);
 expect(server.frameAt).toBe(before);expect(source.frameAt).toBe(sourceBefore);
 v.send({type:"input",seq:1,frameSeq:server.seq,input:{kind:"key",code:"KeyA",down:true}});
 await new Promise<void>(r=>{v.ws.once("pong",()=>r());v.ws.ping();});expect(server.viewerSeq).toBe(0);expect(source.inputSeq).toBe(0);v.send({type:"stop"});
});
it.each(["viewer","provider","secure"])("does not send cursor extensions to an incompatible %s",async missing=>{
 const f=await fixture(true,missing==="provider",true,missing==="secure"),cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,"--cursor"]});
 const v=await f.viewer(missing==="viewer"?"extended":"cursor");v.send(start);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("cursor");expect(v.frames.some(isDesktopCursor)).toBe(false);
 if(missing!=="secure")expect(f.startRequests[0]!.options).not.toHaveProperty("cursor");v.send({type:"stop"});
});
it("a viewer cannot inject cursor packets into the provider direction",async()=>{
 const f=await fixture(),v=await f.viewer("cursor");v.send(start);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 v.ws.send(encodeDesktopCursor({type:"cursor",seq:1,visible:false,x:0,y:0,shapeId:0}));await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);
});


it.each([false,true])("holds the first image until parent-ready ACK and image pairing, secure=%s",async secure=>{
 const f=await fixture(true,false,true,secure),v=await f.viewer("images");v.send(start);
 await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);
 const ready=v.messages.find(m=>m.type==="ready")!;expect(ready.imageLane).toBe(true);expect(f.startRequests[0]!.imageTicket).toMatch(/^[A-Za-z0-9_-]{43}$/);
 const server=Array.from((f.relay as any).viewers)[0] as any;expect(server.ready).toBe(true);expect(v.frames).toHaveLength(0);
 const ticket=v.messages.find(m=>m.type==="image_ticket")!.ticket;
 const image=new WebSocket(f.endpoint,DESKTOP_IMAGE_LANE_PROTOCOL,{headers:{cookie:"test=ok",origin:f.origin}}),frames:Uint8Array[]=[];
 image.on("error",()=>{});image.on("message",(bytes,binary)=>{expect(binary).toBe(true);frames.push(new Uint8Array(bytes as Buffer));});
 await new Promise<void>((resolve,reject)=>{image.once("open",resolve);image.once("error",reject);});image.send(JSON.stringify({type:"video_viewer",ticket}));
 await expect.poll(()=>server.imageAttached).toBe(true);expect(frames).toHaveLength(0);expect(v.frames).toHaveLength(0);
 v.send({type:"image_ready"});await expect.poll(()=>frames.length).toBe(1);expect(v.frames).toHaveLength(0);
 const info=decodeDesktopFrame(frames[0]!).info;v.send({type:"ack",seq:info.seq});await expect.poll(()=>frames.length).toBeGreaterThan(1);
 expect(v.frames).toHaveLength(0);f.revoke();await expect.poll(()=>image.readyState).toBe(WebSocket.CLOSED);await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);
});
it("falls back to the parent with the held image when attachment fails before activation",async()=>{
 const f=await fixture(),v=await f.viewer("images");v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);
 const server=Array.from((f.relay as any).viewers)[0] as any;expect(v.frames).toHaveLength(0);server.imageLane.fail();
 await expect.poll(()=>v.frames.length).toBe(1);expect(v.messages.some(m=>m.type==="image_closed")).toBe(true);expect(v.ws.readyState).toBe(WebSocket.OPEN);
 v.send({type:"ack",seq:decodeDesktopFrame(v.frames[0]!).info.seq});await expect.poll(()=>v.frames.length).toBeGreaterThan(1);v.send({type:"stop"});
});
it.each([true,false])("keeps legacy image routing when viewer/provider image capability is absent, viewer=%s",async viewer=>{
 const f=await fixture(true,viewer),v=await f.viewer(viewer?"images":false);v.send(start);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]).not.toHaveProperty("imageTicket");expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("imageLane");expect(v.messages.some(m=>m.type==="image_ticket")).toBe(false);v.send({type:"stop"});
});

it("image channel cannot send controls and losing an active channel closes its parent",async()=>{
 const f=await fixture(),v=await f.viewer("images");v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);
 const ticket=v.messages.find(m=>m.type==="image_ticket")!.ticket,server=Array.from((f.relay as any).viewers)[0] as any;
 const image=new WebSocket(f.endpoint,DESKTOP_IMAGE_LANE_PROTOCOL,{headers:{cookie:"test=ok",origin:f.origin}});image.on("error",()=>{});
 await new Promise<void>((resolve,reject)=>{image.once("open",resolve);image.once("error",reject);});image.send(JSON.stringify({type:"video_viewer",ticket}));v.send({type:"image_ready"});
 await expect.poll(()=>server.imageActive).toBe(true);
 image.send(JSON.stringify({type:"input",seq:1,input:{kind:"key",code:"F13",down:true}}));
 await expect.poll(()=>image.readyState).toBe(WebSocket.CLOSED);await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);
 const recorded=await readFile(f.record,"utf8").catch(()=>"");expect(recorded).not.toContain('"code":"F13"');
});

it.each(["viewer","provider","helper","secure"])("native datagrams require current viewer/provider/helper and normal desktop, missing=%s",async missing=>{
 const f=await fixture(true,missing==="provider",true,missing==="secure",true,false,undefined,undefined,true,false,true,false,true);
 const cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,...(missing==="helper"?[]:["--native-datagrams"])]});
 const v=await f.viewer(missing==="viewer"?"native":"udp");v.send(start);await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeDatagrams");if(missing==="viewer"||missing==="provider")expect(f.startRequests[0]!.options).not.toHaveProperty("nativeDatagrams");v.send({type:"stop"});
});
it("dropped/parent ACKs cannot renew native freshness, while validated source draw ACKs can",async()=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,"--native-datagrams"]});
 const v=await f.viewer("udp");v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);expect(v.messages.find(m=>m.type==="ready")?.nativeDatagrams).toBe(true);
 const server=Array.from((f.relay as any).viewers)[0] as any,id="22222222-2222-4222-8222-222222222222";
 const emit=(m:unknown)=>server.provider.emit("message",Buffer.from(JSON.stringify(m)),false);
 emit({type:"media_status",id,state:"native",audio:false,datagrams:true});emit({type:"media_stream",id,generation:1,mime:"video/h264",codec:"avc1.42041f",width:640,height:360,window:3,datagrams:true});
 emit({type:"native_frame_notice",id,generation:1,seq:1,bytes:100});expect(server.media.pending).toEqual([1]);
 emit({type:"native_draw_ack",id,generation:1,seq:1,dropped:true});expect(server.media.pending).toEqual([]);expect(server.media.drawnAt).toBeUndefined();
 emit({type:"native_frame_notice",id,generation:1,seq:2,bytes:100});emit({type:"native_draw_ack",id,generation:1,seq:2});expect(server.media.drawnAt).toBeTypeOf("number");
 emit({type:"native_frame_notice",id,generation:1,seq:3,bytes:100});v.send({type:"native_video_ack",id,generation:1,seq:3,dropped:true});await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);
});

it.each(["native_frame_notice","native_draw_ack","native_transport_reset"])("ignores a retired native %s after parent stop overtakes buffered metadata",async type=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),v=await f.viewer("udp");v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);
 const server=Array.from((f.relay as any).viewers)[0] as any,id="22222222-2222-4222-8222-222222222222";
 // A received a native stream, then the parent's stop precedes a delayed
 // packet on the independent bulk socket. These are server-side state checks.
 server.media={id,generation:1,seq:1,native:true,datagrams:true,pending:[1],window:3,sentAt:new Map([[1,performance.now()]])};server.requestedNative=true;
 v.send({type:"media",enabled:false});await expect.poll(()=>server.media).toBeUndefined();expect(server.retiredMedia.has(id)).toBe(true);
 const fail=vi.fn();server.videoActive=true;server.videoLane={fail,close:()=>{},buffered:()=>0,send:()=>true};
 const message=type==="native_frame_notice"?{type,id,generation:1,seq:2,bytes:100}:type==="native_draw_ack"?{type,id,generation:1,seq:1}:{type,id};
 server.receiveVideo(Buffer.from(JSON.stringify(message)),false);
 expect(fail).not.toHaveBeenCalled();expect(v.ws.readyState).toBe(WebSocket.OPEN);expect(server.media).toBeUndefined();v.send({type:"stop"});
});

it.each(["viewer","provider","helper","permission","secure"])("does not enable native audio with missing %s capability/permission",async missing=>{
 const f=await fixture(true,missing==="provider",true,missing==="secure",true,false,undefined,undefined,true,false,true,false,true);
 const cfg=(f.provider as any).config;f.provider.configure({...cfg,allowMedia:missing!=="permission",command:[...cfg.command,...(missing==="helper"?[]:["--native-audio"])]});
 const v=await f.viewer(missing==="viewer"?"native":"audio");v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("nativeAudio");if(missing==="viewer"||missing==="provider")expect(f.startRequests[0]!.options).not.toHaveProperty("nativeAudio");v.send({type:"stop"});
});
it("forwards explicit native audio but never renews input freshness, and stops its capture with video",async()=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowMedia:true,command:[...cfg.command,"--native-audio"]});
 const v=await f.viewer("audio");v.send({...start,options:{width:640,fps:10,quality:65,features:true}});await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);expect(v.messages.find(m=>m.type==="ready")?.nativeAudio).toBe(true);
 v.send({type:"media",enabled:true,settings:{transport:"native",audio:true}});await expect.poll(()=>v.messages.some(m=>m.type==="native_audio_status"&&m.state==="running")).toBe(true);await expect.poll(()=>v.frames.filter(isDesktopAudio).length).toBeGreaterThan(2);
 const server=Array.from((f.relay as any).viewers)[0] as any;expect(server.media.drawnAt).toBeUndefined();expect(server.control).toBe(false);
 v.send({type:"media",enabled:false});await expect.poll(()=>(f.provider as any).active.native.active).toBeUndefined();expect(server.media).toBeUndefined();v.send({type:"stop"});
});

it("does not send a rich clipboard write to a helper whose local input ceiling is disabled",async()=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowInput:true,allowClipboard:true,command:[...cfg.command.filter((arg:string)=>arg!=="--allow-input"),"--allow-clipboard","--rich-clipboard"]});
 const v=await f.viewer("rich");v.send({...start,options:{...start.options,features:true}});await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);expect(v.messages.find(m=>m.type==="ready")?.allowInput).toBe(false);expect(v.messages.find(m=>m.type==="ready")?.richClipboard).toBe(true);
 const ticket=String(v.messages.find(m=>m.type==="clipboard_rich_ticket")?.ticket),pipe=new WebSocket(f.endpoint,DESKTOP_RICH_CLIPBOARD_PROTOCOL,{headers:{cookie:"test=ok",origin:f.origin}}),responses:any[]=[];pipe.on("message",raw=>responses.push(JSON.parse(raw.toString())));pipe.on("error",()=>{});
 try{await new Promise<void>((resolve,reject)=>{pipe.once("open",resolve);pipe.once("error",reject);});pipe.send(JSON.stringify({type:"video_viewer",ticket}));await expect.poll(()=>v.messages.some(m=>m.type==="clipboard_rich_ready")).toBe(true);v.send({type:"clipboard_grant",enabled:true});await expect.poll(()=>v.messages.some(m=>m.type==="clipboard_state"&&m.enabled)).toBe(true);const writes=vi.spyOn((f.provider as any).active.process.stdin,"write"),id="22222222-2222-4222-8222-222222222222";pipe.send(JSON.stringify({type:"clipboard_rich",id,operation:"begin",size:3}));await expect.poll(()=>responses.find(m=>m.id===id)?.ok).toBe(false);expect(writes.mock.calls.map(([raw])=>typeof raw==="string"?JSON.parse(raw):null).some(m=>m?.type==="clipboard_rich"&&m.operation==="begin")).toBe(false);expect(v.ws.readyState).toBe(WebSocket.OPEN);}finally{pipe.terminate();v.send({type:"stop"});}
});

it("negotiates a selected monitor only for opted-in viewers and applies it before ready",async()=>{const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowMonitors:true,command:[...cfg.command,"--monitors"]});const v=await f.viewer("monitors");v.send({...start,options:{...start.options,monitorDevice:"left"}});await expect.poll(()=>v.messages.find(m=>m.type==="ready")?.monitorLayout).toMatchObject({selected:"left",bounds:{x:-640,y:-200,width:640,height:480}});expect(f.startRequests[0]!.options).toMatchObject({monitors:true,monitorDevice:"left"});v.send({type:"stop"});});
it("does not show monitor metadata or send new options to legacy viewers",async()=>{const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowMonitors:true,command:[...cfg.command,"--monitors"]});const v=await f.viewer(false);v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==="ready")).toBe(true);expect(v.messages.find(m=>m.type==="ready")).not.toHaveProperty("monitorLayout");expect(f.startRequests[0]!.options).not.toHaveProperty("monitors");expect(f.startRequests[0]!.options).not.toHaveProperty("monitorDevice");v.send({type:"stop"});});
it("rejects an explicit monitor request when the helper ignores it instead of enabling the wrong screen",async()=>{const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowMonitors:true});const v=await f.viewer("monitors");v.send({...start,options:{...start.options,monitorDevice:"left"}});await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);expect(v.messages.some(m=>m.type==="ready")).toBe(false);});

it.each([[true,true],[true,false],[false,true]])('requires both B capability and helper-ready before native cadence commands (%s/%s)',async(capability,helper)=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true);
 const cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,...(helper?['--native-cadence']:[])]});
 if(!capability){const caps={...f.provider.capabilities()};Reflect.deleteProperty(caps,'nativeCadence');vi.spyOn(f.provider,'capabilities').mockReturnValue(caps);}
 const v=await f.viewer('rate');v.send({...start,options:{...start.options,nativeCadence:true}});
 await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options.nativeCadence).toBe(capability?true:undefined);
 expect((f.provider as any).active.native.hooks.cadence).toBe(capability&&helper);
 expect(v.messages.find(m=>m.type==='ready')).not.toHaveProperty('nativeCadence');
 v.send({type:'stop'});
});

it('negotiates resolution only for its viewer protocol, with unchanged ready for old viewers',async()=>{
 const f=await fixture(true,false,true,false,true,false,undefined,undefined,true,false,true,false,true);
 const cfg=(f.provider as any).config;f.provider.configure({...cfg,command:[...cfg.command,'--native-adaptive','--native-cadence']});
 const v=await f.viewer('rate');v.send({...start,options:{...start.options,nativeAdaptive:true}});await expect.poll(()=>v.frames.length).toBeGreaterThan(0);
 expect(f.startRequests[0]!.options.nativeAdaptive).toBeUndefined();expect(v.messages.find(m=>m.type==='ready')).not.toHaveProperty('nativeAdaptive');v.send({type:'stop'});
});

it("creates only an explicitly requested virtual source with all gates enabled",async()=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowVirtualDisplay:true,command:[...cfg.command,"--virtual-display","--headless"]});const v=await f.viewer("virtual");
 v.send({...start,options:{...start.options,features:true,virtualDisplay:true}});await expect.poll(()=>v.messages.find(m=>m.type==='ready')).toMatchObject({virtualDisplay:true,title:'Generated owned virtual desktop'});expect(f.startRequests[0]!.options.virtualDisplay).toBe(true);v.send({type:'stop'});
});
it.each(['viewer','permission','helper'] as const)("rejects a virtual request when the %s gate is missing, without publishing a physical ready",async gate=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowVirtualDisplay:gate!=='permission',command:[...cfg.command,...(gate==='helper'?[]:['--virtual-display'])]});const v=await f.viewer(gate==='viewer'?false:'virtual');
 v.send({...start,options:{...start.options,features:true,virtualDisplay:true}});await expect.poll(()=>v.ws.readyState).toBe(WebSocket.CLOSED);expect(v.messages.some(m=>m.type==='ready')).toBe(false);if(gate!=='helper')expect(f.startRequests).toHaveLength(0);
});
it("does not send virtual fields to a regular legacy viewer",async()=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowVirtualDisplay:true,command:[...cfg.command,'--virtual-display']});const v=await f.viewer(false);v.send(start);await expect.poll(()=>v.messages.some(m=>m.type==='ready')).toBe(true);expect(f.startRequests[0]!.options).not.toHaveProperty('virtualDisplay');expect(v.messages.find(m=>m.type==='ready')).not.toHaveProperty('virtualDisplay');v.send({type:'stop'});
});

it("allows an explicitly negotiated virtual source to become ready after sixteen seconds",async()=>{
 const f=await fixture(),cfg=(f.provider as any).config;f.provider.configure({...cfg,allowVirtualDisplay:true,command:[...cfg.command,'--virtual-display','--headless','--configure-delay-ms','16000']});
 const v=await f.viewer('virtual');const heartbeat=setInterval(()=>{if(v.ws.readyState===WebSocket.OPEN)v.send({type:'heartbeat'});},1000);
 try{v.send({...start,options:{...start.options,features:true,virtualDisplay:true}});await expect.poll(()=>v.messages.find(m=>m.type==='ready'),{timeout:21000}).toMatchObject({virtualDisplay:true});expect(v.ws.readyState).toBe(WebSocket.OPEN);v.send({type:'stop'});}finally{clearInterval(heartbeat);}
},30000);

function protectedFixture(config:{mode?:"elevated-default"|"elevated-uac";allowed?:boolean;force?:boolean;expectEnv?:"0"|"1"},legacy=false,secure=false){
  return fixture(true,legacy,true,secure,false,false,undefined,undefined,true,false,true,false,true,config);
}
const protectedStart={...start,options:{...start.options,features:true,elevatedDesktop:true}};
it.each(["elevated-default","elevated-uac"] as const)("requires the actual %s helper proof and keeps protected input human-only",async mode=>{
  const f=await protectedFixture({mode,allowed:true,expectEnv:"1"}),viewer=await f.viewer("protected");viewer.send(protectedStart);
  await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);
  const ready=viewer.messages.find(m=>m.type==="ready");expect(ready).toMatchObject({secureDesktop:true,protectedDesktop:mode,allowInput:true,allowClipboard:false,allowMedia:false});
  for(const key of ["files","richClipboard","nativeVideo","nativeAudio","nativeDatagrams","cursor","monitorLayout","display"])expect(ready).not.toHaveProperty(key);
  expect(f.startRequests[0]!.options).toMatchObject({elevatedDesktop:true,features:true});
  for(const key of ["files","richClipboard","nativeVideo","nativeAudio","nativeDatagrams","cursor","monitors","virtualDisplay"])expect(f.startRequests[0]!.options).not.toHaveProperty(key);
  viewer.send({type:"agent_grant",enabled:true});viewer.send({type:"control",enabled:true});
  await expect.poll(()=>viewer.messages.filter(m=>m.type==="control").at(-1)?.enabled).toBe(true);
  const share=(f.provider as unknown as {active:{process:{stdin:Writable};ws:WebSocket}}).active,writes=vi.spyOn(share.process.stdin,"write");
  const fromA:string[]=[];const observe=(data:unknown)=>{try{fromA.push(JSON.parse(String(data)).type);}catch{}};share.ws.on("message",observe);
  viewer.send({type:"sas"});viewer.send({type:"input",seq:1,frameSeq:1,input:{kind:"key",code:"ControlLeft",down:true}});
  await expect.poll(()=>viewer.messages.some(m=>m.type==="input_ack"&&m.seq===1)).toBe(true);
  expect(viewer.messages.some(m=>m.type==="agent_ticket")).toBe(false);
  expect(fromA).not.toContain("sas");share.ws.off("message",observe);
  share.ws.emit("message",Buffer.from(JSON.stringify({type:"sas"})),false);
  expect(writes.mock.calls.map(([v])=>typeof v==="string"?JSON.parse(v):{}).some(m=>m.type==="sas")).toBe(false);
  await writeFile(f.endedMarker,"changed");
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);
  expect(viewer.messages.find(m=>m.type==="error")).toMatchObject({message:expect.stringContaining("接続し直し")});
  expect(viewer.messages.some(m=>["session_locked","session_unlocked"].includes(String(m.type)))).toBe(false);
  const events=(await readFile(f.ledger,"utf8")).trim().split("\n").map(line=>JSON.parse(line));expect(events.find(m=>m.type==="scope-ended")).toMatchObject({held:[]});
  writes.mockRestore();
});
it.each([false,true])("refuses normal/legacy secure helper fallback for a protected request (secure=%s)",async secure=>{
  const f=await protectedFixture({allowed:true},false,secure),viewer=await f.viewer("protected");viewer.send(protectedStart);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);expect(viewer.frames).toHaveLength(0);expect(viewer.messages.some(m=>m.type==="ready")).toBe(false);
  expect(viewer.messages.some(m=>m.type==="error")).toBe(true);
});
it.each(["permission","protocol","old-peer"] as const)("rejects protected sharing before desktop.start when %s is missing",async missing=>{
  const f=await protectedFixture({mode:"elevated-default",allowed:missing!=="permission"},missing==="old-peer"),viewer=await f.viewer(missing==="protocol"?false:"protected");viewer.send(protectedStart);
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);expect(f.startRequests).toHaveLength(0);expect(viewer.frames).toHaveLength(0);
});
it.each([{virtualDisplay:true},{monitorDevice:"all"},{display:{width:640,height:480}}])("rejects protected source conflicts before RPC: %j",async conflict=>{
  const f=await protectedFixture({mode:"elevated-default",allowed:true}),viewer=await f.viewer("protected");viewer.send({...protectedStart,options:{...protectedStart.options,...conflict}});
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);expect(f.startRequests).toHaveLength(0);expect(viewer.frames).toHaveLength(0);
});
it("rejects an unsolicited protected source before publishing its first frame",async()=>{
  const f=await protectedFixture({mode:"elevated-default",allowed:true,force:true}),viewer=await f.viewer("protected");viewer.send({...start,options:{...start.options,features:true}});
  await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);expect(viewer.frames).toHaveLength(0);expect(viewer.messages.some(m=>m.type==="ready")).toBe(false);
});
it("overrides an inherited elevated request on an ordinary share",async()=>{
  const previous=process.env.SODA_DESKTOP_ELEVATED_REQUEST;process.env.SODA_DESKTOP_ELEVATED_REQUEST="1";
  try{
    const f=await protectedFixture({allowed:true,expectEnv:"0"}),viewer=await f.viewer();viewer.send(start);
    await expect.poll(()=>viewer.frames.length).toBeGreaterThan(0);expect(viewer.messages.find(m=>m.type==="ready")).not.toHaveProperty("protectedDesktop");expect(f.startRequests[0]!.options).not.toHaveProperty("elevatedDesktop");
  }finally{if(previous===undefined)delete process.env.SODA_DESKTOP_ELEVATED_REQUEST;else process.env.SODA_DESKTOP_ELEVATED_REQUEST=previous;}
});

it("enforces the local elevated ceiling on direct provider RPC before opening a connection",async()=>{
 const f=await protectedFixture({allowed:false});
 await expect(f.provider.start("direct",{url:f.endpoint,ticket:"a".repeat(43),options:{...start.options,features:true,elevatedDesktop:true}})).rejects.toMatchObject({code:"unauthorized"});
 expect((f.provider as unknown as {active?:unknown}).active).toBeUndefined();
});
it.each([{nativeVideo:true},{files:true},{richClipboard:true},{monitors:true},{cursor:true},{display:{width:640,height:480}}] as const)("rejects protected side-channel/source options at B as well: %j",async conflict=>{
 const f=await protectedFixture({allowed:true});
 await expect(f.provider.start("direct",{url:f.endpoint,ticket:"a".repeat(43),options:{...start.options,features:true,elevatedDesktop:true,...conflict}})).rejects.toMatchObject({code:"invalid_params"});
 expect((f.provider as unknown as {active?:unknown}).active).toBeUndefined();
});

it.each([false,true])("provider independently refuses normal/legacy secure ready for elevated requests (secure=%s)",async secure=>{
 const web=createServer(),server=new WebSocketServer({server:web}),messages:Record<string,unknown>[]=[],frames:Buffer[]=[];
 await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(web.address() as AddressInfo).port}`;
 const provider=new DesktopProvider({command:[process.execPath,helper,"--allow-input",...(secure?["--secure"]:[])],allowInput:true,allowElevated:true,allowUnlock:true,origins:()=>[origin]});
 cleanup.push(async()=>{provider.dispose();for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));await new Promise<void>(resolve=>web.close(()=>resolve()));});
 server.on("connection",socket=>socket.on("message",(data,binary)=>{if(binary){frames.push(Buffer.from(data as Buffer));return;}const message=JSON.parse(data.toString());messages.push(message);if(message.type==="provider")socket.send(JSON.stringify({type:"attached"}));}));
 await provider.start("direct",{url:origin.replace("http","ws")+"/desktop-share",ticket:"a".repeat(43),options:{...start.options,features:true,elevatedDesktop:true}});
 await expect.poll(()=>messages.find(m=>m.type==="protected_desktop_failure")).toMatchObject({code:"service_incompatible"});
 expect(messages.some(m=>m.type==="ready")).toBe(false);expect(frames).toHaveLength(0);
});
it.each([false,true])("relay independently refuses normal/legacy secure ready from a provider (secure=%s)",async secure=>{
 const f=await protectedFixture({allowed:true});let socket:WebSocket|undefined;
 const mocked=vi.spyOn(f.provider,"start").mockImplementation(async(_owner,p)=>{
   socket=new WebSocket(p.url);const current=socket;
   await new Promise<void>((resolve,reject)=>{current.once("error",reject);current.once("open",()=>current.send(JSON.stringify({type:"provider",ticket:p.ticket})));current.on("message",data=>{if(JSON.parse(data.toString()).type==="attached"){current.send(JSON.stringify({type:"ready",title:"Generated old provider",allowInput:true,width:320,height:180,backend:"synthetic",...(secure?{secureDesktop:true}:{})}));setTimeout(()=>current.close(),20);resolve();}});});
   return {started:true as const};
 });
 cleanup.push(async()=>{socket?.terminate();mocked.mockRestore();});
 const viewer=await f.viewer("protected");viewer.send(protectedStart);
 await expect.poll(()=>viewer.ws.readyState).toBe(WebSocket.CLOSED);expect(viewer.messages.some(m=>m.type==="ready")).toBe(false);expect(viewer.frames).toHaveLength(0);
});
