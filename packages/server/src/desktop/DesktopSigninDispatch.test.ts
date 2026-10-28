import {createHash} from "node:crypto";
import {afterEach, expect, it, vi} from "vitest";
import type {WsConnection} from "../ws/WsServer.js";
import {DesktopSigninDispatch, type DesktopSigninHandlers} from "./DesktopSigninDispatch.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

const ownerSid = "S-1-5-21-1-2-3-1001", machineId = "a".repeat(32);
const session = "11111111-1111-4111-8111-111111111111", identity = "04"+"a".repeat(128);
const fingerprint = createHash("sha256").update(Buffer.from(identity,"hex")).digest("hex");
const start = () => ({url:"wss://root.invalid/desktop-e2e",ticket:"q".repeat(43),machineId,session,hello:{version:"soda-desktop-e2e-v1",generation:1,session,role:"viewer",identity,ephemeral:"04"+"b".repeat(128),nonce:"c".repeat(64)}});
function connection() {
  let text = (_value: string) => {}, binary = (_value: Uint8Array) => {}, close = (_code: number) => {};
  const conn: WsConnection = {bufferedAmount:0,sendText:vi.fn(),sendBinary:vi.fn(),close:vi.fn(),onDrain:()=>{},onText:cb=>{text=cb;},onBinary:cb=>{binary=cb;},onClose:cb=>{close=cb;}};
  return {conn, raw:(value:string)=>text(value), request:(id:string,method:string,params:unknown={})=>text(JSON.stringify({id,method,params})), binary:()=>binary(new Uint8Array()), disconnect:()=>close(1006)};
}
const flush = async () => {for(let i=0;i<8;i++)await Promise.resolve();};
const instances: DesktopSigninDispatch[] = [];
afterEach(()=>{for(const value of instances)value.close();instances.length=0;vi.restoreAllMocks();vi.useRealTimers();});
function fixture() {
  let active = true, now = 0, check: (()=>void) | undefined;
  const abort = new AbortController();
  const enrollment = DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision:session,ownerSid,origin:"https://root.invalid",machineId,token:"t".repeat(43),provider:"2".repeat(64),allowSignin:true,peers:[{fingerprint,label:"Generated viewer"}]})),ownerSid);
  const handlers = {
    hello:vi.fn<DesktopSigninHandlers["hello"]>(async owner=>({clientId:owner,snapshot:{protocol:1,serverVersion:"generated",host:{os:"windows",windowsBuild:1,hostname:"generated"},workspaces:[],tabs:[],panes:[],groups:[],focus:null,limits:{scrollbackLines:0}}})),
    capabilities:vi.fn<DesktopSigninHandlers["capabilities"]>(async()=>({available:true,allowInput:false})),
    status:vi.fn<DesktopSigninHandlers["status"]>(async()=>({available:true,initialized:true,required:true,fingerprint:"2".repeat(64),peers:[]})),
    start:vi.fn<DesktopSigninHandlers["start"]>(async()=>({started:true})),clientGone:vi.fn<DesktopSigninHandlers["clientGone"]>(),
  };
  const dispatch = new DesktopSigninDispatch({enrollment,handlers,signal:abort.signal,active:()=>{check?.();return active;},now:()=>now});instances.push(dispatch);
  const c=connection();dispatch.accept(c.conn);
  return {...c,dispatch,handlers,abort,onCheck:(callback:()=>void)=>{check=callback;},lose:()=>{active=false;},clock:(value:number)=>{now=value;},hello:async()=>{c.request("hello","client.hello",{protocol:1,kind:"external"});await flush();}};
}
it("dispatches only the four requests with a private owner and fixed policy",async()=>{
  const f=fixture();await f.hello();f.request("caps","desktop.capabilities");await flush();f.request("status","desktop.endpoint.status");await flush();f.request("start","desktop.endpoint.start",start());await flush();
  expect(f.conn.close).not.toHaveBeenCalled();expect(f.conn.sendText).toHaveBeenCalledTimes(4);
  expect(JSON.parse(vi.mocked(f.conn.sendText).mock.calls[3]![0])).toEqual({id:"start",result:{started:true}});
  const [owner,params,scope]=f.handlers.start.mock.calls[0]!;
  expect(owner).toMatch(/^[a-f0-9-]{36}$/);expect(owner).not.toBe(ownerSid);expect(params).toEqual(start());
  expect(scope).toMatchObject({revision:session,provider:"2".repeat(64),allowInput:false});expect(Object.isFrozen(scope)).toBe(true);expect(scope.active()).toBe(true);
  f.disconnect();expect(scope.active()).toBe(false);expect(scope.signal.aborted).toBe(true);expect(f.handlers.clientGone).toHaveBeenCalledExactlyOnceWith(owner);
  f.dispatch.close();f.disconnect();expect(f.handlers.clientGone).toHaveBeenCalledTimes(1);
});
it.each(["exec","workspace.exec","terminal.input","file.read","plugin.call","desktop.start","desktop.endpoint.initialize","desktop.endpoint.trust","desktop.endpoint.required","desktop.agent.act"])("closes unknown method %s without forwarding",async method=>{
  const f=fixture();await f.hello();f.request("bad",method,{secret:"never log"});await flush();
  expect(f.conn.close).toHaveBeenCalledOnce();expect(f.handlers.start).not.toHaveBeenCalled();expect(f.handlers.capabilities).not.toHaveBeenCalled();
});
it.each(["before-hello","second-hello","duplicate-id","binary","malformed","oversize","extra-field","wrong-origin","wrong-machine","agent-role","unregistered-key"])("rejects %s at the channel boundary",async mode=>{
  const f=fixture();if(mode!=="before-hello")await f.hello();
  if(mode==="before-hello")f.request("1","desktop.endpoint.status");
  else if(mode==="second-hello")f.request("2","client.hello",{protocol:1,kind:"external"});
  else if(mode==="duplicate-id")f.request("hello","desktop.endpoint.status");
  else if(mode==="binary")f.binary();
  else if(mode==="malformed")f.raw("{invalid");
  else if(mode==="oversize")f.raw("あ".repeat(6000));
  else if(mode==="extra-field")f.raw(JSON.stringify({id:"2",method:"desktop.capabilities",params:{},command:"exec"}));
  else {const p=start();if(mode==="wrong-origin")p.url="wss://elsewhere.invalid/desktop-e2e";if(mode==="wrong-machine")p.machineId="b".repeat(32);if(mode==="agent-role")p.hello.role="agent";if(mode==="unregistered-key")p.hello.identity="04"+"d".repeat(128);f.request("2","desktop.endpoint.start",p);}
  await flush();expect(f.conn.close).toHaveBeenCalledOnce();expect(f.handlers.start).not.toHaveBeenCalled();expect(f.handlers.status).not.toHaveBeenCalled();
});
it.each(["disconnect","abort","owner","deadline","lifetime","parallel"])("cancels pending start on %s and discards its late completion",async mode=>{
  const f=fixture();await f.hello();let finish!:(value:{started:true})=>void;
  f.handlers.start.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  f.request("start","desktop.endpoint.start",start());await flush();
  const scope=f.handlers.start.mock.calls[0]![2];expect(scope.active()).toBe(true);
  if(mode==="disconnect")f.disconnect();if(mode==="abort")f.abort.abort();if(mode==="owner")f.lose();if(mode==="deadline")f.clock(5000);if(mode==="lifetime")f.clock(120000);
  if(mode==="parallel")f.request("next","desktop.capabilities");
  finish({started:true});await flush();
  expect(f.conn.sendText).toHaveBeenCalledTimes(1);expect(scope.active()).toBe(false);expect(scope.signal.aborted).toBe(true);expect(f.handlers.clientGone).toHaveBeenCalledOnce();
});
it("bounds a stalled request with a timer, even without further messages",async()=>{
  vi.useFakeTimers();const f=fixture();await f.hello();f.handlers.start.mockImplementation(()=>new Promise(()=>{}));f.request("s","desktop.endpoint.start",start());
  await vi.advanceTimersByTimeAsync(5000);expect(f.conn.close).toHaveBeenCalledOnce();expect(f.handlers.start.mock.calls[0]![2].signal.aborted).toBe(true);
});
it("expires idle channels and rejects pre-aborted dispatchers",async()=>{
  vi.useFakeTimers();const f=fixture();await f.hello();await vi.advanceTimersByTimeAsync(120000);expect(f.conn.close).toHaveBeenCalledOnce();
  f.abort.abort();const c=connection();f.dispatch.accept(c.conn);expect(c.conn.close).toHaveBeenCalledOnce();
});
it("checks idle lifetime using the clock before the timer callback runs",async()=>{
  const f=fixture();await f.hello();f.clock(120000);f.request("late","desktop.capabilities");await flush();
  expect(f.handlers.capabilities).not.toHaveBeenCalled();expect(f.conn.close).toHaveBeenCalledOnce();
});
it.each(["entry","completion","serialization"])("rejects synchronous abort from the host active callback at %s",async mode=>{
  const f=fixture();await f.hello();
  const invalidate=()=>f.onCheck(()=>f.abort.abort());
  if(mode==="entry")invalidate();
  if(mode==="completion")f.handlers.capabilities.mockImplementation(async()=>{invalidate();return {available:true,allowInput:false};});
  if(mode==="serialization")f.handlers.capabilities.mockResolvedValue({available:true,allowInput:false,toJSON:()=>{invalidate();return {};}} as never);
  f.request("caps","desktop.capabilities");await flush();
  if(mode==="entry")expect(f.handlers.capabilities).not.toHaveBeenCalled();
  expect(f.conn.sendText).toHaveBeenCalledTimes(1);expect(f.conn.close).toHaveBeenCalledOnce();expect(f.handlers.clientGone).toHaveBeenCalledOnce();
});
it("counts the next response against the remaining send buffer budget",async()=>{
  const f=fixture();await f.hello();Object.defineProperty(f.conn,"bufferedAmount",{value:64*1024-1});
  f.request("caps","desktop.capabilities");await flush();expect(f.conn.sendText).toHaveBeenCalledTimes(1);expect(f.conn.close).toHaveBeenCalledOnce();
});
it("caps concurrent channels and reclaims a closed channel",()=>{
  const f=fixture(),more=Array.from({length:16},connection);for(const c of more)f.dispatch.accept(c.conn);
  expect(more[14]!.conn.close).not.toHaveBeenCalled();expect(more[15]!.conn.close).toHaveBeenCalledOnce();
  f.disconnect();const c=connection();f.dispatch.accept(c.conn);expect(c.conn.close).not.toHaveBeenCalled();f.dispatch.close();expect(c.conn.close).toHaveBeenCalledOnce();
});
it("limits retained request IDs without unbounded replay memory",async()=>{
  const f=fixture();await f.hello();for(let i=1;i<1000;i++){f.request(String(i),"desktop.capabilities");await flush();}
  expect(f.conn.close).not.toHaveBeenCalled();f.request("1000","desktop.capabilities");expect(f.conn.close).toHaveBeenCalledOnce();expect(f.handlers.capabilities).toHaveBeenCalledTimes(999);
});
it.each(["result-size","backpressure","error","serialize","post-serialize-owner"])("contains %s without logging handler diagnostics",async mode=>{
  const f=fixture();await f.hello();const log=vi.spyOn(console,"log"),error=vi.spyOn(console,"error"),warn=vi.spyOn(console,"warn");
  if(mode==="result-size")f.handlers.capabilities.mockResolvedValue(Object.assign({available:true,allowInput:false},{diagnostic:"private".repeat(10000)}));
  if(mode==="backpressure")Object.defineProperty(f.conn,"bufferedAmount",{value:64*1024+1});
  if(mode==="error")f.handlers.capabilities.mockRejectedValue(new Error("private handler diagnostic"));
  if(mode==="serialize")f.handlers.capabilities.mockResolvedValue({available:true,allowInput:false,toJSON:()=>{throw new Error("private");}} as never);
  if(mode==="post-serialize-owner")f.handlers.capabilities.mockResolvedValue({available:true,allowInput:false,toJSON:()=>{f.lose();return {};}} as never);
  f.request("caps","desktop.capabilities");await flush();expect(f.conn.close).toHaveBeenCalledOnce();expect(f.conn.sendText).toHaveBeenCalledTimes(1);
  expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();
});
it("continues cleanup when one clientGone or transport close throws",async()=>{
  const f=fixture(),c=connection();f.dispatch.accept(c.conn);f.handlers.clientGone.mockImplementation(()=>{throw new Error("private");});vi.mocked(f.conn.close).mockImplementation(()=>{throw new Error("private");});
  expect(()=>f.dispatch.close()).not.toThrow();expect(c.conn.close).toHaveBeenCalledOnce();expect(f.handlers.clientGone).toHaveBeenCalledTimes(2);
});
