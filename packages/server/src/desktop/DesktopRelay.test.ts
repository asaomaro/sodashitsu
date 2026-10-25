import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { AuthService } from "../auth/AuthService.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { LinkChannel, MachineLink } from "../machine/MachineLink.js";
import { DesktopRelay } from "./DesktopRelay.js";
import { DesktopProvider, desktopConfigFromEnv } from "./DesktopProvider.js";
import { DesktopNativeVideo } from "./DesktopNativeVideo.js";
import { performance } from "node:perf_hooks";
import { decodeDesktopFrame, DESKTOP_IME_PROTOCOL, DesktopReady, DesktopOptions, DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL, DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL } from "@sodashitsu/protocol";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const helper = fileURLToPath(
  new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
);
async function fixture(allowInput = true, legacy = false, configured = true, secure = false, unlockAllowed = true, cover = false, nativeFailure?: string, readyFailure?: string, imeKeys = true, unconditionalIme = false, extendedInput = true, dxgi = false) {
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-test-")),
    record = join(dir, "inputs.jsonl");
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const web = createServer();
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(web.address() as AddressInfo).port}`,
    endpoint = origin.replace("http", "ws") + "/desktop-share";
  const provider = new DesktopProvider(configured ? {
    command: [process.execPath, helper, "--allow-input", "--record", record, ...(secure ? ["--secure"] : []), ...(cover ? ["--lock-cover"] : []), ...(nativeFailure ? ["--startup-failure", nativeFailure] : []), ...(readyFailure ? ["--ready-failure", readyFailure] : []), ...(!imeKeys ? ["--no-ime-keys"] : []), ...(unconditionalIme ? ["--unconditional-ime-keys"] : []), ...(!extendedInput ? ["--no-extended-input"] : []), ...(dxgi ? ["--dxgi"] : [])],
    allowInput,
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
  const startRequests: {options: Record<string,unknown>}[] = [];
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
  async function viewer(ime: boolean | "extended" | "native" | "pipeline" = false) {
    const ws = new WebSocket(endpoint, ime === "pipeline" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL,DESKTOP_NATIVE_VIDEO_PIPELINE_PROTOCOL] : ime === "native" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL,DESKTOP_NATIVE_VIDEO_PROTOCOL] : ime === "extended" ? [DESKTOP_IME_PROTOCOL,DESKTOP_INPUT_PROTOCOL] : ime ? [DESKTOP_IME_PROTOCOL] : [], { headers: { cookie: "test=ok", origin } });
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
    provider,
    endpoint,
    origin,
    record,
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
  const share=(f.provider as unknown as {active:{frameAt:number;seq:number;ws:WebSocket;native?:DesktopNativeVideo}}).active;
  // This test injects the private B-side input handler directly. Keep its ACKs
  // local: A did not allocate these sequences. Browser coverage below uses the
  // real end-to-end ACK path.
  const localAcks=vi.spyOn(share.ws,"send").mockImplementation(()=>{});
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
  native.stop();share.frameAt=performance.now();
  inject(3,"DENIED_STOPPED",true);inject(4,"ACCEPT_IMAGE");
  await expect.poll(async()=>(await readFile(f.record,"utf8")).includes("ACCEPT_IMAGE")).toBe(true);
  expect(await readFile(f.record,"utf8")).not.toContain("DENIED_STOPPED");
  await expect.poll(()=>localAcks.mock.calls.some(([data])=>typeof data==="string"&&JSON.parse(data).type==="input_ack"&&JSON.parse(data).seq===4)).toBe(true);
  } finally {localAcks.mockRestore();}
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
