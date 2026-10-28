import {Agent as HttpsAgent} from "node:https";
import {EventEmitter} from "node:events";
import type {AddressInfo} from "node:net";
import {afterEach,expect,it,vi} from "vitest";
import {WebSocketServer,type ClientOptions} from "ws";
import {BRIDGE_FRAME as F,encodeBridgeFrame as frame,encodeJson,BridgeFrameDecoder} from "../machine/bridgeFrames.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import {DesktopSigninConnector,type DesktopSigninSocket} from "./DesktopSigninConnector.js";
import type {DesktopSigninHandlers} from "./DesktopSigninDispatch.js";

const owner="S-1-5-21-1-2-3-1001",revision="11111111-1111-4111-8111-111111111111";
function enrollment(origin="https://root.invalid",caPem?:string) {return DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision,ownerSid:owner,origin,...(caPem===undefined?{}:{caPem}),machineId:"a".repeat(32),token:"t".repeat(43),provider:"2".repeat(64),allowSignin:true,peers:[{fingerprint:"3".repeat(64),label:"generated"}]})),owner);}
function handlers(){return {
  hello:vi.fn<DesktopSigninHandlers["hello"]>(async id=>({clientId:id,snapshot:{protocol:1,serverVersion:"generated",host:{os:"windows",windowsBuild:1,hostname:"generated"},workspaces:[],tabs:[],panes:[],groups:[],focus:null,limits:{scrollbackLines:0}}})),
  capabilities:vi.fn<DesktopSigninHandlers["capabilities"]>(()=>({available:false,allowInput:false})),
  status:vi.fn<DesktopSigninHandlers["status"]>(()=>({available:true,initialized:true,required:true,fingerprint:"2".repeat(64),peers:[]})),
  start:vi.fn<DesktopSigninHandlers["start"]>(async()=>({started:true})),clientGone:vi.fn<DesktopSigninHandlers["clientGone"]>(),
};}
class Socket extends EventEmitter implements DesktopSigninSocket {
  readyState=0;bufferedAmount=0;
  send=vi.fn();ping=vi.fn();terminate=vi.fn(()=>{this.readyState=3;this.emit("close");});
  open(){this.readyState=1;this.emit("open");}
  message(bytes:Uint8Array){this.emit("message",Buffer.from(bytes),true);}
}
const connectors:DesktopSigninConnector[]=[];
afterEach(()=>{for(const connector of connectors)connector.close();connectors.length=0;vi.useRealTimers();});
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(){
  const sockets:Socket[]=[],requests:{url:string;options:ClientOptions}[]=[],abort=new AbortController(),h=handlers();let now=0,active=true;let onActive:(()=>void)|undefined;
  const connector=new DesktopSigninConnector({enrollment:enrollment(),handlers:h,signal:abort.signal,active:()=>{onActive?.();return active;},now:()=>now,socket:(url,options)=>{requests.push({url,options});const s=new Socket();sockets.push(s);return s;}});connectors.push(connector);
  return {connector,sockets,requests,abort,h,onCheck:(callback:()=>void)=>{onActive=callback;},clock:(value:number)=>{now=value;},lose:()=>{active=false;}};
}
it("uses only the fixed credential and refuses TLS/redirect/compression overrides",()=>{
  const f=fixture();expect(f.requests).toHaveLength(1);
  expect(f.requests[0]).toMatchObject({url:"wss://root.invalid/machine-delegation",options:{headers:{authorization:"Bearer "+"t".repeat(43),"x-soda-machine-id":"a".repeat(32)},rejectUnauthorized:true,followRedirects:false,handshakeTimeout:5000,perMessageDeflate:false,maxPayload:32768}});
  expect(f.requests[0]!.options.agent).toBeInstanceOf(HttpsAgent);
  f.sockets[0]!.open();expect(f.sockets[0]!.send).toHaveBeenCalledTimes(2);f.connector.close();expect(f.sockets[0]!.terminate).toHaveBeenCalledOnce();
});
it.each(["pong","message"])("does not revive a 45-second expired connection when %s precedes its timer",async mode=>{
  vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();s.message(frame(F.OPEN,1));
  f.clock(45000);
  if(mode==="pong")s.emit("pong");else s.message(frame(F.TEXT,1,encodeJson({id:"h",method:"client.hello",params:{protocol:1,kind:"external"}})));
  await flush();expect(s.terminate).toHaveBeenCalledOnce();expect(f.h.hello).not.toHaveBeenCalled();expect(f.h.clientGone).toHaveBeenCalledOnce();
});
it("pings and reconnects with fresh owners without replaying an old request or grant",async()=>{
  vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();s.message(frame(F.OPEN,1));
  s.message(frame(F.TEXT,1,encodeJson({id:"h",method:"client.hello",params:{protocol:1,kind:"external"}})));await flush();
  const oldOwner=f.h.hello.mock.calls[0]![0];
  await vi.advanceTimersByTimeAsync(15000);expect(s.ping).toHaveBeenCalledOnce();
  s.emit("close");expect(f.h.clientGone).toHaveBeenCalledExactlyOnceWith(oldOwner);
  await vi.advanceTimersByTimeAsync(1000);expect(f.sockets).toHaveLength(2);
  const fresh=f.sockets[1]!;fresh.open();expect(f.h.start).not.toHaveBeenCalled();expect(f.h.hello).toHaveBeenCalledTimes(1);
  s.emit("open");s.message(frame(F.OPEN,2));s.emit("pong");expect(f.sockets).toHaveLength(2);expect(fresh.terminate).not.toHaveBeenCalled();
  fresh.message(frame(F.OPEN,1));fresh.message(frame(F.TEXT,1,encodeJson({id:"h",method:"client.hello",params:{protocol:1,kind:"external"}})));await flush();
  expect(f.h.hello.mock.calls[1]![0]).not.toBe(oldOwner);f.abort.abort();expect(fresh.terminate).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60000);expect(f.sockets).toHaveLength(2);
});
it.each(["text","oversize","owner","abort"])("closes %s without retrying after shutdown",async mode=>{
  vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();
  if(mode==="text")s.emit("message",Buffer.from("private-generated-diagnostic"),false);
  if(mode==="oversize")s.message(new Uint8Array(32769));
  if(mode==="owner"){f.lose();s.message(frame(F.PING,0));}
  if(mode==="abort")f.abort.abort();
  expect(s.terminate).toHaveBeenCalledOnce();f.connector.close();await vi.advanceTimersByTimeAsync(60000);expect(f.sockets).toHaveLength(1);
});
it("handles throwing socket construction and abort while the factory returns",async()=>{
  vi.useFakeTimers();const abort=new AbortController(),factory=vi.fn(()=>{throw new Error("private-generated-diagnostic");});
  const connector=new DesktopSigninConnector({enrollment:enrollment(),handlers:handlers(),signal:abort.signal,active:()=>true,socket:factory});connectors.push(connector);
  await vi.advanceTimersByTimeAsync(31000);expect(factory.mock.calls.length).toBeLessThan(8);abort.abort();const count=factory.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(factory).toHaveBeenCalledTimes(count);
  const other=new AbortController(),socket=new Socket();const second=new DesktopSigninConnector({enrollment:enrollment(),handlers:handlers(),signal:other.signal,active:()=>true,socket:()=>{other.abort();return socket;}});connectors.push(second);expect(socket.terminate).toHaveBeenCalledOnce();expect(socket.send).not.toHaveBeenCalled();
});
it("speaks to a real generated Root socket and stops every channel on disconnect",async()=>{
  const server=new WebSocketServer({host:"127.0.0.1",port:0,maxPayload:65536,perMessageDeflate:false});
  await new Promise<void>(resolve=>server.once("listening",resolve));const port=(server.address() as AddressInfo).port;
  const h=handlers(),abort=new AbortController();
  let done!:(value:unknown)=>void;const result=new Promise(resolve=>{done=resolve;});
  server.on("connection",(socket,request)=>{
    expect(request.headers.authorization).toBe("Bearer "+"t".repeat(43));expect(request.headers["x-soda-machine-id"]).toBe("a".repeat(32));expect(request.headers.origin).toBeUndefined();
    const decoder=new BridgeFrameDecoder({role:"link"});
    socket.on("message",raw=>{for(const value of decoder.push(Buffer.isBuffer(raw)?raw:Buffer.from(raw as ArrayBuffer))){
      if(value.type===F.HELLO){socket.send(frame(F.OPEN,1));socket.send(frame(F.TEXT,1,encodeJson({id:"h",method:"client.hello",params:{protocol:1,kind:"external"}})));}
      else if(value.type===F.TEXT)done(JSON.parse(Buffer.from(value.payload).toString()));
    }});
  });
  const connector=new DesktopSigninConnector({enrollment:enrollment("http://127.0.0.1:"+port),handlers:h,active:()=>true,signal:abort.signal});connectors.push(connector);
  try{await expect(result).resolves.toMatchObject({id:"h",result:{snapshot:{workspaces:[]}}});expect(h.hello).toHaveBeenCalledOnce();abort.abort();expect(h.clientGone).toHaveBeenCalledOnce();}
  finally{connector.close();for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it("rejects late open before the handshake timeout callback and times out a stalled socket",async()=>{
  vi.useFakeTimers();const f=fixture();f.clock(5000);f.sockets[0]!.open();expect(f.sockets[0]!.terminate).toHaveBeenCalledOnce();expect(f.sockets[0]!.send).not.toHaveBeenCalled();f.connector.close();
  const g=fixture();await vi.advanceTimersByTimeAsync(5000);expect(g.sockets[0]!.terminate).toHaveBeenCalledOnce();g.connector.close();
});
it("accepts a fresh pong but cannot extend the next fixed deadline after it expires",()=>{
  vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();f.clock(44999);s.emit("pong");expect(s.terminate).not.toHaveBeenCalled();f.clock(89999);s.emit("pong");expect(s.terminate).toHaveBeenCalledOnce();
});
it("rejects an untrusted TLS certificate before sending delegation credentials",async()=>{
  const {execFileSync}=await import("node:child_process"),{mkdtempSync,readFileSync,rmSync}=await import("node:fs"),{join}=await import("node:path"),{tmpdir}=await import("node:os"),{createServer}=await import("node:https"),{WebSocket}=await import("ws");
  const directory=mkdtempSync(join(tmpdir(),"soda-signin-tls-"));
  let server:ReturnType<typeof createServer>|undefined,wss:WebSocketServer|undefined;
  const abort=new AbortController();let connector:DesktopSigninConnector|undefined;
  try{
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(directory,"key.pem"),"-out",join(directory,"cert.pem"),"-days","1","-subj","/CN=localhost","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
    server=createServer({key:readFileSync(join(directory,"key.pem")),cert:readFileSync(join(directory,"cert.pem"))});wss=new WebSocketServer({noServer:true});let upgrades=0;
    server.on("tlsClientError",()=>{});server.on("upgrade",(request,socket,head)=>{upgrades++;wss!.handleUpgrade(request,socket,head,()=>{});});
    await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const port=(server.address() as AddressInfo).port;
    let complete!:(value:string)=>void;const result=new Promise<string>(resolve=>{complete=resolve;});
    connector=new DesktopSigninConnector({enrollment:enrollment("https://127.0.0.1:"+port),handlers:handlers(),signal:abort.signal,active:()=>true,socket:(url,options)=>{const socket=new WebSocket(url,options);socket.once("open",()=>complete("opened"));socket.once("error",()=>complete("rejected"));return socket;}});connectors.push(connector);
    await expect(result).resolves.toBe("rejected");expect(upgrades).toBe(0);
  }finally{abort.abort();connector?.close();if(wss){for(const socket of wss.clients)socket.terminate();await new Promise<void>(resolve=>wss!.close(()=>resolve()));}if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});
it("rechecks freshness after returning from the host callback",()=>{
  vi.useFakeTimers();const f=fixture(),s=f.sockets[0]!;s.open();f.onCheck(()=>f.clock(45000));s.emit("pong");expect(s.terminate).toHaveBeenCalledOnce();
});
it("installs error handling before aborting a real CONNECTING websocket",async()=>{
  const {WebSocket}=await import("ws");const server=new WebSocketServer({host:"127.0.0.1",port:0});await new Promise<void>(resolve=>server.once("listening",resolve));
  const abort=new AbortController();let socket:InstanceType<typeof WebSocket>|undefined;
  const connector=new DesktopSigninConnector({enrollment:enrollment("http://127.0.0.1:"+(server.address() as AddressInfo).port),handlers:handlers(),signal:abort.signal,active:()=>true,socket:(url,options)=>{socket=new WebSocket(url,options);abort.abort();return socket;}});connectors.push(connector);
  try{expect(socket!.listenerCount("error")).toBeGreaterThan(0);}
  finally{socket!.on("error",()=>{});connector.close();socket!.terminate();for(const peer of server.clients)peer.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it.each(["matched","wrong","hostname"])("uses enrollment CA with verified TLS: %s",async mode=>{
  const {execFileSync}=await import("node:child_process"),{mkdtempSync,readFileSync,rmSync}=await import("node:fs"),{join}=await import("node:path"),{tmpdir}=await import("node:os"),{createServer}=await import("node:https"),{WebSocket}=await import("ws");
  const directory=mkdtempSync(join(tmpdir(),"soda-signin-tls-"));
  let server:ReturnType<typeof createServer>|undefined,wss:WebSocketServer|undefined;
  const abort=new AbortController();let connector:DesktopSigninConnector|undefined;
  try{
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(directory,"key.pem"),"-out",join(directory,"cert.pem"),"-days","1","-subj","/CN=generated.invalid","-addext","subjectAltName=IP:"+(mode==="hostname"?"127.0.0.2":"127.0.0.1")],{stdio:"ignore"});
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(directory,"other-key.pem"),"-out",join(directory,"other-cert.pem"),"-days","1","-subj","/CN=other"],{stdio:"ignore"});
    server=createServer({key:readFileSync(join(directory,"key.pem")),cert:readFileSync(join(directory,"cert.pem"))});wss=new WebSocketServer({noServer:true});let upgrades=0;
    server.on("tlsClientError",()=>{});server.on("upgrade",(request,socket,head)=>{upgrades++;wss!.handleUpgrade(request,socket,head,()=>{});});
    await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));const port=(server.address() as AddressInfo).port;
    let complete!:(value:string)=>void;const result=new Promise<string>(resolve=>{complete=resolve;});
    connector=new DesktopSigninConnector({enrollment:enrollment("https://127.0.0.1:"+port,readFileSync(join(directory,mode==="wrong"?"other-cert.pem":"cert.pem"),"utf8")),handlers:handlers(),signal:abort.signal,active:()=>true,socket:(url,options)=>{const socket=new WebSocket(url,options);socket.once("open",()=>complete("opened"));socket.once("error",error=>complete((error as NodeJS.ErrnoException).code??"unknown"));return socket;}});connectors.push(connector);
    await expect(result).resolves.toBe(mode==="matched"?"opened":mode==="hostname"?"ERR_TLS_CERT_ALTNAME_INVALID":"DEPTH_ZERO_SELF_SIGNED_CERT");expect(upgrades).toBe(mode==="matched"?1:0);
  }finally{abort.abort();connector?.close();if(wss){for(const socket of wss.clients)socket.terminate();await new Promise<void>(resolve=>wss!.close(()=>resolve()));}if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));rmSync(directory,{recursive:true,force:true});}
});