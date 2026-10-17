import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopCdpLauncher } from "./DesktopCdpLauncher.js";
import { DesktopCdpRelay } from "./DesktopCdpRelay.js";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture(deviceFile?: string, launcher?: DesktopCdpLauncher) {
  let active = true,
    revoke = (_id: string) => {};
  const auth = {
    verifySession: (s: string) => active && s === "session",
    authorizeUpgrade: async (req: { headers: Record<string, string> }) =>
      req.headers.cookie === "test=session" && active
        ? { ok: true, sessionId: "session" }
        : { ok: false },
    onSessionRevoked: (cb: (id: string) => void) => {
      revoke = cb;
      return { dispose() {} };
    },
  } as unknown as AuthService;
  const origins = {
    admit: (req: { origin: string }, reject: () => void) => {
      if (req.origin === "http://test") return true;
      reject();
      return false;
    },
  } as unknown as OriginRejectionLog;
  const relay = new DesktopCdpRelay(auth, origins, deviceFile, launcher);
  const http = createServer();
  http.on("upgrade", (req, socket, head) => void relay.upgrade(req, socket, head));
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const port = (http.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  cleanups.push(async () => {
    for (const s of sockets) s.terminate();
    relay.close();
    await new Promise<void>((r) => http.close(() => r()));
  });
  async function connect(
    role = "viewer",
    headers: Record<string, string> = role === "viewer"
      ? { cookie: "test=session", origin: "http://test" }
      : {},
  ) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/desktop-cdp?role=${role}`, { headers });
    sockets.push(ws);
    const messages: Record<string, any>[] = [];
    ws.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    await once(ws, "open");
    const wait = async (type: string) => {
      await vi.waitFor(() => expect(messages.some((m) => m.type === type)).toBe(true));
      return messages.splice(
        messages.findIndex((m) => m.type === type),
        1,
      )[0]!;
    };
    return { ws, messages, wait, send: (m: unknown) => ws.send(JSON.stringify(m)) };
  }
  const invite = async (v: Awaited<ReturnType<typeof connect>>) => {
    v.send({ type: "invite" });
    return (await v.wait("invitation"))["token"] as string;
  };
  const pair = async (v: Awaited<ReturnType<typeof connect>>, allowInput = true, allowFit = false) => {
    const token = await invite(v);
    const b = await connect("bridge");
    b.send({ type: "hello", token, title: "Existing VSCode", allowInput, allowFit });
    await b.wait("paired");
    return { b, token };
  };
  return {
    relay,
    connect,
    invite,
    pair,
    revoke: () => {
      active = false;
      revoke("session");
    },
  };
}
const text = { type: "input", input: { kind: "text", text: "日本語" } };
it("requires cookie and allowed Origin for viewers, and rejects browser-origin bridges", async () => {
  const f = await fixture();
  await expect(f.connect("viewer", { origin: "http://test" })).rejects.toThrow("401");
  await expect(
    f.connect("viewer", { cookie: "test=session", origin: "https://evil.invalid" }),
  ).rejects.toThrow("403");
  await expect(f.connect("bridge", { origin: "http://test" })).rejects.toThrow("403");
});
it("pairs once, isolates viewers, and requires both local and remote input permission", async () => {
  const f = await fixture(),
    a = await f.connect(),
    other = await f.connect();
  await a.wait("status");
  await other.wait("status");
  const { b, token } = await f.pair(a);
  const replay = await f.connect("bridge");
  const denied = once(replay.ws, "close");
  replay.send({ type: "hello", token, title: "reuse", allowInput: true });
  expect((await denied)[0]).toBe(1008);
  a.send({type:"input",input:{kind:"text",text:"DENIED before permission"}});
  other.send({ type: "control", enabled: true });
  other.send({type:"input",input:{kind:"text",text:"DENIED other viewer"}});
  a.send({ type: "control", enabled: true });
  await vi.waitFor(() =>
    expect(a.messages.some((m) => m.type === "status" && m.control === true)).toBe(true),
  );
  a.send(text);
  expect((await b.wait("input"))["input"]).toEqual(text.input);
  expect(b.messages.filter((m) => m.type === "input")).toHaveLength(0);
  b.send({ type: "frame", seq: 1, width: 800, height: 600, data: "/9j/AA==" });
  expect((await a.wait("frame"))["seq"]).toBe(1);
  expect(other.messages.some((m) => m.type === "frame")).toBe(false);
  a.send({ type: "ack", seq: 1 });
  expect((await b.wait("ack"))["seq"]).toBe(1);
  const closed = once(b.ws, "close");
  a.send({ type: "stop" });
  await closed;
  const read = await f.pair(a, false);
  a.send({ type: "control", enabled: true });
  await vi.waitFor(() =>
    expect(a.messages.filter((m) => m.type === "status").at(-1)?.control).toBe(false),
  );
  a.send(text);
  a.send({ type: "stop" });
  await once(read.b.ws, "close");
  expect(read.b.messages.some((m) => m.type === "input")).toBe(false);
});
it("rejects expired invitations, arbitrary CDP requests and out-of-order frames", async () => {
  const f = await fixture(),
    v = await f.connect();
  const token = await f.invite(v);
  const time = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(time + 300001);
  const b = await f.connect("bridge"),
    end = once(b.ws, "close");
  b.send({ type: "hello", token, title: "expired", allowInput: true });
  expect((await end)[0]).toBe(1008);
  vi.restoreAllMocks();
  const paired = await f.pair(v);
  paired.b.send({ type: "frame", seq: 1, width: 800, height: 600, data: "/9j/AA==" });
  await v.wait("frame");
  const ordered = once(paired.b.ws, "close");
  paired.b.send({ type: "frame", seq: 2, width: 800, height: 600, data: "/9j/AA==" });
  expect((await ordered)[0]).toBe(1008);
  const invalid = once(v.ws, "close");
  v.send({ type: "input", input: { kind: "text", text: "x", method: "Runtime.evaluate" } });
  expect((await invalid)[0]).toBe(1008);
});
it("revocation closes the bridge and viewer; a new invitation disconnects the previous bridge", async () => {
  const f = await fixture(),
    v = await f.connect();
  const first = await f.pair(v);
  const close = once(first.b.ws, "close");
  await f.invite(v);
  await close;
  const second = await f.pair(v);
  const viewerClosed = once(v.ws, "close"),
    bridgeClosed = once(second.b.ws, "close");
  f.revoke();
  await Promise.all([viewerClosed, bridgeClosed]);
});

it("reserves viewer capacity when unauthenticated bridge slots are exhausted", async () => {
  const f=await fixture();
  await Promise.all(Array.from({length:16},()=>f.connect("bridge")));
  await expect(f.connect("bridge")).rejects.toThrow("503");
  const viewer=await f.connect(); expect((await viewer.wait("status"))["connected"]).toBe(false);
});
it("closing a viewer invalidates its unconsumed invitation", async () => {
  const f=await fixture(),v=await f.connect(),token=await f.invite(v);
  const closed=once(v.ws,"close");v.ws.close();await closed;
  const b=await f.connect("bridge"),rejected=once(b.ws,"close");
  b.send({type:"hello",token,title:"orphan",allowInput:true});expect((await rejected)[0]).toBe(1008);
});

it("requires local fit permission and this viewer's control before forwarding a viewport", async () => {
  const f = await fixture(), viewer = await f.connect(), other = await f.connect();
  const viewport = { type: "viewport", size: { width: 900, height: 600 } };
  const { b } = await f.pair(viewer, true, true);
  viewer.send(viewport);
  other.send({ type: "control", enabled: true });
  other.send(viewport);
  viewer.send({ type: "control", enabled: true });
  expect((await b.wait("control")).enabled).toBe(true);
  expect(b.messages.some(m => m.type === "viewport")).toBe(false);
  viewer.send(viewport);
  expect(await b.wait("viewport")).toEqual(viewport);
  viewer.send({ type: "viewport", size: null });
  expect((await b.wait("viewport")).size).toBeNull();
  viewer.send({ type: "control", enabled: false });
  await b.wait("control");
  viewer.send(viewport);
  viewer.send({ type: "control", enabled: false });
  await b.wait("control");
  expect(b.messages.some(m => m.type === "viewport")).toBe(false);
  const disabled = await f.pair(viewer, true, false);
  viewer.send({ type: "control", enabled: true });
  await disabled.b.wait("control");
  viewer.send(viewport);
  viewer.send({ type: "control", enabled: false });
  await disabled.b.wait("control");
  expect(disabled.b.messages.some(m => m.type === "viewport")).toBe(false);
});

it.each([
  { width: 159, height: 600 },
  { width: 900, height: 2401 },
  { width: 900.5, height: 600 },
  { width: 900, height: 600, method: "Runtime.evaluate" },
])("rejects invalid viewport dimensions or extra operations: %j", async size => {
  const f = await fixture(), viewer = await f.connect();
  const closed = once(viewer.ws, "close");
  viewer.send({ type: "viewport", size });
  expect((await closed)[0]).toBe(1008);
});

async function remembered(f: Awaited<ReturnType<typeof fixture>>) {
  const viewer = await f.connect(), token = await f.invite(viewer), bridge = await f.connect('bridge');
  bridge.send({type:'hello',token,title:'Resident desktop',allowInput:true,allowFit:true,remember:true});
  const registered = await bridge.wait('registered'); await bridge.wait('ready');
  const start = await bridge.wait('start');
  return {viewer,bridge,registered,shareId:start.shareId as string};
}
it('remembers a resident, keeps cleanup busy, rejects duplicate credentials and never steals sharing', async () => {
  const f=await fixture(),{viewer,bridge,registered,shareId}=await remembered(f),other=await f.connect();
  const firstStatus=await other.wait('status');
  expect(firstStatus.devices).toEqual([{id:registered.deviceId,title:'Resident desktop',online:true,busy:true}]);
  expect(JSON.stringify(firstStatus)).not.toContain(registered.secret);
  other.send({type:'connect',deviceId:registered.deviceId}); await other.wait('error');
  const duplicate=await f.connect('bridge'),denied=once(duplicate.ws,'close');
  duplicate.send({type:'resume',deviceId:registered.deviceId,secret:registered.secret,title:'other',allowInput:true});
  expect((await denied)[0]).toBe(1008);
  viewer.send({type:'control',enabled:true});
  expect(await bridge.wait('control')).toEqual({type:'control',enabled:true,shareId});
  viewer.send(text);expect((await bridge.wait('input')).shareId).toBe(shareId);
  viewer.send({type:'stop'});expect(await bridge.wait('stop')).toEqual({type:'stop',shareId});
  other.send({type:'connect',deviceId:registered.deviceId});await other.wait('error');
  bridge.send({type:'stopped',shareId});
  await vi.waitFor(()=>expect(other.messages.filter(m=>m.type==='status').at(-1)?.devices[0].busy).toBe(false));
  other.send({type:'connect',deviceId:registered.deviceId});
  const next=await bridge.wait('start');expect(next.shareId).not.toBe(shareId);
  expect(other.messages.filter(m=>m.type==='status').at(-1)?.control).toBe(false);
});
it('ignores stale resident frames and cleanup acknowledgements across share generations', async () => {
  const f=await fixture(),{viewer,bridge,registered,shareId}=await remembered(f);
  viewer.send({type:'stop'});await bridge.wait('stop');bridge.send({type:'stopped',shareId});
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices[0].busy).toBe(false));
  viewer.send({type:'connect',deviceId:registered.deviceId});const next=await bridge.wait('start');
  bridge.send({type:'frame',shareId,seq:999,width:800,height:600,data:'/9j/AA=='});
  bridge.send({type:'stopped',shareId});
  bridge.send({type:'frame',shareId:next.shareId,seq:1,width:800,height:600,data:'/9j/AA=='});
  expect(await viewer.wait('frame')).toEqual({type:'frame',seq:1,width:800,height:600,data:'/9j/AA=='});
  expect(viewer.messages.some(m=>m.type==='frame')).toBe(false);
  viewer.send({type:'ack',seq:1});expect(await bridge.wait('ack')).toEqual({type:'ack',seq:1,shareId:next.shareId});
});
it('keeps a registered device offline after disconnect and revokes remembered credentials on forget', async () => {
  const f=await fixture(),{viewer,bridge,registered}=await remembered(f);
  const closed=once(bridge.ws,'close');bridge.ws.close();await closed;
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices[0]).toMatchObject({online:false,busy:false}));
  const resumed=await f.connect('bridge');
  resumed.send({type:'resume',deviceId:registered.deviceId,secret:registered.secret,title:'Resumed',allowInput:false,allowFit:true});
  await resumed.wait('ready');expect(resumed.messages.some(m=>m.type==='start')).toBe(false);
  viewer.send({type:'connect',deviceId:registered.deviceId});await resumed.wait('start');
  viewer.send({type:'control',enabled:true});expect((await resumed.wait('control')).enabled).toBe(false);
  const forgotten=once(resumed.ws,'close');viewer.send({type:'forget',deviceId:registered.deviceId});
  expect((await forgotten)[0]).toBe(4403);
  const replay=await f.connect('bridge'),rejected=once(replay.ws,'close');
  replay.send({type:'resume',deviceId:registered.deviceId,secret:registered.secret,title:'old',allowInput:true});
  expect((await rejected)[0]).toBe(4403);
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices).toEqual([]));
});
it('revoking the browser stops its resident share without erasing the remembered device', async () => {
  const f=await fixture(),{viewer,bridge,registered,shareId}=await remembered(f);
  const ended=once(viewer.ws,'close');f.revoke();await ended;
  expect(await bridge.wait('stop')).toEqual({type:'stop',shareId});
  bridge.send({type:'stopped',shareId});
  expect(bridge.ws.readyState).toBe(WebSocket.OPEN);
  expect(registered.secret).toMatch(/^[a-f0-9]{64}$/);
});
it('closes a resident that does not acknowledge cleanup and exposes it offline', async () => {
  const f=await fixture(),{viewer,bridge}=await remembered(f);
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  try {
    const stopped=once(bridge.ws,'message'),closed=once(bridge.ws,'close');
    viewer.send({type:'stop'});await stopped;
    await vi.advanceTimersByTimeAsync(10001);await closed;
  } finally { vi.useRealTimers(); }
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices[0]).toMatchObject({online:false,busy:false}));
});
it('server disconnect closes all transports without forgetting the registered device', async () => {
  const f=await fixture(),{viewer,bridge,registered}=await remembered(f);
  const ended=once(bridge.ws,'close');f.relay.disconnectAll();await ended;
  const resumed=await f.connect('bridge');
  resumed.send({type:'resume',deviceId:registered.deviceId,secret:registered.secret,title:'Restarted',allowInput:true});
  await resumed.wait('ready');expect(resumed.messages.some(m=>m.type==='start')).toBe(false);
  const newViewer=await f.connect();expect((await newViewer.wait('status')).devices[0]).toMatchObject({online:true,busy:false});
  expect(viewer.ws.readyState).not.toBe(WebSocket.OPEN);
});
it('returns permanent revocation for an offline forgotten device, unlike a duplicate live device', async () => {
  const f=await fixture(),{viewer,bridge,registered}=await remembered(f);
  const disconnected=once(bridge.ws,'close');bridge.ws.close();await disconnected;
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices[0].online).toBe(false));
  viewer.send({type:'forget',deviceId:registered.deviceId});
  await vi.waitFor(()=>expect(viewer.messages.filter(m=>m.type==='status').at(-1)?.devices).toEqual([]));
  const retry=await f.connect('bridge'),rejected=once(retry.ws,'close');
  retry.send({type:'resume',deviceId:registered.deviceId,secret:registered.secret,title:'Offline revoked',allowInput:true});
  expect((await rejected)[0]).toBe(4403);
});

it("does not execute a launcher for unselected targets and invalidates cancelled discovery", async () => {
  let resolveTargets: (targets:{id:string;title:string}[])=>void = () => {};
  const cancel = vi.fn();
  const start = vi.fn(() => ({result:new Promise<{id:string;title:string}[]>(r=>{resolveTargets=r;}),
    closed:new Promise<void>(()=>{}),cancel}));
  const launcher = {available:true,busy:false,start} as unknown as DesktopCdpLauncher;
  const f=await fixture(undefined,launcher),v=await f.connect();
  expect((await v.wait("status")).launcherAvailable).toBe(true);
  v.send({type:"launchConnect",targetId:"unlisted"});
  await v.wait("error");expect(start).not.toHaveBeenCalled();
  v.send({type:"launch"});
  await vi.waitFor(()=>expect(start).toHaveBeenCalledOnce());
  v.send({type:"stop"});
  await vi.waitFor(()=>expect(cancel).toHaveBeenCalledOnce());
  resolveTargets([{id:"late",title:"Late VSCode"}]);
  v.send({type:"control",enabled:false});
  await vi.waitFor(()=>expect(v.messages.filter(m=>m.type==="status").at(-1)?.launchPending).toBe(false));
  expect(v.messages.some(m=>m.type==="launchTargets")).toBe(false);
  v.send({type:"launchConnect",targetId:"late"});
  await v.wait("error");expect(start).toHaveBeenCalledOnce();
});
it("scopes discovered targets to their viewer, expires them, and never exposes internal tokens", async () => {
  const cancel=vi.fn();
  const start=vi.fn((_request:unknown)=>({result:Promise.resolve([{id:"chosen",title:"VSCode"}]),closed:new Promise<void>(()=>{}),cancel}));
  const f=await fixture(undefined,{available:true,busy:false,start} as unknown as DesktopCdpLauncher);
  const a=await f.connect(),b=await f.connect();await a.wait("status");await b.wait("status");
  a.send({type:"launch"});await a.wait("launchTargets");
  b.send({type:"launchConnect",targetId:"chosen"});await b.wait("error");
  expect(start).toHaveBeenCalledOnce();
  a.send({type:"launchConnect",targetId:"chosen"});
  await vi.waitFor(()=>expect(start).toHaveBeenCalledTimes(2));
  expect(start.mock.calls[1]![0]).toMatchObject({type:"connect",targetId:"chosen",token:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(a.messages.some(m=>m.type==="invitation")).toBe(false);
  const token=(start.mock.calls[1]![0] as {token:string}).token;
  const bridge=await f.connect("bridge");bridge.send({type:"hello",token,title:"Auto",allowInput:true});
  await bridge.wait("paired");
  expect((await a.wait("status")).control).toBe(false);
  f.revoke();await vi.waitFor(()=>expect(cancel).toHaveBeenCalledOnce());
});
it("rejects expired discovered targets and reports a helper exiting before pairing", async () => {
  const code=`let text='';process.stdin.on('data',b=>{text+=b;if(!text.includes('\\n'))return;const m=JSON.parse(text);if(m.type==='discover'){console.log(JSON.stringify({type:'targets',targets:[{id:'chosen',title:'VSCode'}]}));process.stdin.destroy();}else{console.log(JSON.stringify({type:'connecting'}));process.exit(1);}});`;
  const f=await fixture(undefined,new DesktopCdpLauncher([process.execPath,"-e",code]));
  const v=await f.connect();await v.wait("status");
  v.send({type:"launch"});await v.wait("launchTargets");
  const now=Date.now();const clock=vi.spyOn(Date,"now").mockReturnValue(now+61000);
  v.send({type:"launchConnect",targetId:"chosen"});expect((await v.wait("error")).message).toContain("選び直して");
  clock.mockRestore();
  v.send({type:"launch"});await v.wait("launchTargets");
  v.send({type:"launchConnect",targetId:"chosen"});
  const statusBefore = v.messages.filter(m=>m.type==="status").length;
  expect((await v.wait("error")).message).toContain("終了しました");
  await vi.waitFor(()=>expect(v.messages.filter(m=>m.type==="status").at(-1)?.launchPending).toBe(false));
  // A later global availability update must not replace the viewer's error.
  expect(v.messages.filter(m=>m.type==="status").length).toBe(statusBefore + 2);
  await vi.waitFor(()=>expect(v.messages.filter(m=>m.type==="launcherState").at(-1)?.busy).toBe(false));
});

function rpcConnection() {
  const messages: any[] = [];
  const closes: ((code:number)=>void)[] = [];
  let ended = false;
  const connection = {
    bufferedAmount:0,
    sendText:(raw:string)=>messages.push(JSON.parse(raw)), sendBinary:()=>{},
    onText:()=>{},onBinary:()=>{},onDrain:()=>{},onClose:(fn:(code:number)=>void)=>closes.push(fn),
    close:(code=1000)=>{if(ended)return;ended=true;for(const fn of closes)fn(code);},
  };
  return {connection,messages};
}
it("RPC viewer reserves once and cannot become orphaned if its connection closes during load", async () => {
  const f=await fixture(),a=rpcConnection();
  const first=f.relay.openRpc(a.connection,()=>true);
  const duplicate=f.relay.openRpc(a.connection,()=>true);
  const firstRejected = expect(first).rejects.toThrow("closed");
  const duplicateRejected = expect(duplicate).rejects.toThrow("already open");
  a.connection.close();
  await Promise.all([firstRejected, duplicateRejected]);
  expect(a.messages).toHaveLength(0);
  await expect(f.relay.openRpc(rpcConnection().connection,()=>false)).rejects.toThrow("closed");
});
it("RPC sharing is connection-private and inherits cleanup and narrow input permissions", async () => {
  const cancel=vi.fn(),jobs:any[]=[];
  const launcher={available:true,busy:false,start:vi.fn((request:any)=>{
    jobs.push(request);return {result:Promise.resolve(request.type==="discover"?[{id:"selected",title:"Remote VSCode"}]:[]),
      closed:new Promise<void>(()=>{}),cancel};
  })} as unknown as DesktopCdpLauncher;
  const f=await fixture(undefined,launcher),a=rpcConnection(),other=rpcConnection();
  await f.relay.openRpc(a.connection,()=>true);await f.relay.openRpc(other.connection,()=>true);
  expect(()=>f.relay.sendRpc(a.connection,{type:"invite"})).toThrow("server-configured");
  f.relay.sendRpc(a.connection,{type:"launch"});
  await vi.waitFor(()=>expect(a.messages.some(m=>m.data?.type==="launchTargets")).toBe(true));
  f.relay.sendRpc(a.connection,{type:"launchConnect",targetId:"selected"});
  await vi.waitFor(()=>expect(jobs).toHaveLength(2));
  const b=await f.connect("bridge");
  b.send({type:"hello",token:jobs[1].token,title:"Remote VSCode",allowInput:true});
  await b.wait("paired");
  b.send({type:"frame",seq:1,width:800,height:600,data:"/9j/AA=="});
  await vi.waitFor(()=>expect(a.messages.some(m=>m.event==="vscode.cdp"&&m.data?.type==="frame")).toBe(true));
  expect(other.messages.some(m=>m.data?.type==="frame")).toBe(false);
  f.relay.sendRpc(a.connection,{type:"input",input:{kind:"text",text:"DENIED"}});
  f.relay.sendRpc(a.connection,{type:"control",enabled:true});
  f.relay.sendRpc(a.connection,{type:"input",input:{kind:"text",text:"allowed"}});
  expect((await b.wait("input")).input.text).toBe("allowed");
  expect(b.messages.some(m=>m.input?.text==="DENIED")).toBe(false);
  const closed=once(b.ws,"close");a.connection.close();await closed;
  expect(cancel).toHaveBeenCalledOnce();other.connection.close();
});
it("counts virtual peers toward the common limit and refuses revoked authorization", async () => {
  const f=await fixture(),connections:ReturnType<typeof rpcConnection>[]=[];
  for(let i=0;i<64;i++){
    const conn=rpcConnection();connections.push(conn);await f.relay.openRpc(conn.connection,()=>true);
  }
  await expect(f.relay.openRpc(rpcConnection().connection,()=>true)).rejects.toThrow("unavailable");
  for(const conn of connections)conn.connection.close();
  let active=true;const revoked=rpcConnection();await f.relay.openRpc(revoked.connection,()=>active);
  active=false;f.relay.sendRpc(revoked.connection,{type:"launch"});
  await vi.waitFor(()=>expect(()=>f.relay.sendRpc(revoked.connection,{type:"control",enabled:true})).toThrow("closed"));
  expect(revoked.messages.some(m=>m.data?.type==="launchTargets"||m.data?.type==="frame")).toBe(false);
});
