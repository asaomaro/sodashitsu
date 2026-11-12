import {readFileSync} from "node:fs";
import WebSocket from "ws";
import {mkdtemp,rename,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import type {AddressInfo} from "node:net";
import {afterEach,expect,it,vi} from "vitest";
import {WebSocketServer} from "ws";
import {DesktopSigninRequired,RemoteDesktopViewerMessage,desktopFeaturesProtocol} from "@sodashitsu/protocol";
import {DesktopEndpointIdentity} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {desktopSecretProtector} from "@sodashitsu/client-core/desktop/DesktopEndpointProtector.node";
import {DesktopSigninIdentity} from "./DesktopSigninIdentity.js";
import {DesktopEndpointWire} from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";
import {DesktopSigninEndpoint} from "./DesktopSigninEndpoint.js";
import type {DesktopSigninCallScope} from "./DesktopSigninDispatch.js";
const directories:string[]=[],stores:DesktopEndpointStore[]=[];
const endpoints:DesktopSigninEndpoint[]=[],servers:WebSocketServer[]=[],wires:DesktopEndpointWire[]=[];
afterEach(async()=>{for(const wire of wires)wire.close();wires.length=0;for(const endpoint of endpoints)await endpoint.close();endpoints.length=0;for(const server of servers){for(const socket of server.clients)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}servers.length=0;for(const store of stores.splice(0)){store.close();await store.settled();}for(const dir of directories.splice(0))await rm(dir,{recursive:true,force:true});});
const packet=(kind:number,value:unknown)=>{const bytes=typeof value==="undefined"?new Uint8Array():new TextEncoder().encode(JSON.stringify(value)),out=new Uint8Array(bytes.length+1);out[0]=kind;out.set(bytes,1);return out;};
async function fixture(input=true,caPem?:string,relayHint?:string,realStore=false){
  const viewer=await DesktopEndpointIdentity.create(crypto),viewerFP=await viewer.fingerprint();
  let store:DesktopEndpointStore|undefined;
  if(realStore){const stateDir=await mkdtemp(join(tmpdir(),"soda-signin-wire-"));directories.push(stateDir);store=new DesktopEndpointStore({stateDir,...(process.platform==="win32"?{platform:"win32" as const,protector:{...desktopSecretProtector("linux"),mode:"dpapi-user" as const},checkWindowsPath:async()=>{},commitWindowsVault:rename}:{})});stores.push(store);await store.initialize();await store.setRequired(true);await store.trust({fingerprint:viewerFP,role:"viewer",label:"generated"});}
  const provider=store?(await store.localIdentity()).identity:await DesktopEndpointIdentity.create(crypto),providerFP=await provider.fingerprint();
  const server=new WebSocketServer({host:"127.0.0.1",port:0});servers.push(server);await new Promise<void>(resolve=>server.once("listening",resolve));
  const origin="http://127.0.0.1:"+(server.address() as AddressInfo).port,ownerSid="S-1-5-21-1-2-3-1001",machineId="a".repeat(32),session=randomUUID(),revision=randomUUID();
  const enrollment=DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision,ownerSid,origin,...(caPem===undefined?{}:{caPem}),machineId,token:"t".repeat(43),provider:providerFP,allowSignin:true,allowInput:input,peers:[{fingerprint:viewerFP,label:"generated"}]})),ownerSid);
  const abort=new AbortController();let active=true,rawSend:(value:string|Uint8Array)=>void=()=>{};
  const records:{lane:string;kind:number;body:Uint8Array}[]=[],helperSend=vi.fn(),helperClose=vi.fn();let release!:()=>void,rejectStop!:(error:Error)=>void;
  const stopped=new Promise<void>((resolve,reject)=>{release=resolve;rejectStop=reject;});void stopped.catch(()=>{});
  const worker=vi.fn<NonNullable<ConstructorParameters<typeof DesktopSigninEndpoint>[0]["worker"]>>(options=>{options.signal.addEventListener("abort",()=>helperClose(),{once:true});return {send:helperSend,close:helperClose,settled:()=>stopped};});
  const scope:DesktopSigninCallScope={active:()=>active,signal:abort.signal,revision,provider:providerFP,allowInput:input};
  const identity=store?new DesktopSigninIdentity({enrollment,store,active:()=>active,signal:abort.signal}):undefined;
  const gate={endpoint:vi.fn((fingerprint:string,scope:DesktopSigninCallScope)=>identity?identity.endpoint(fingerprint,scope):Promise.resolve({identity:provider,allowInput:input,active:()=>active}))};
  const requests:WebSocket.ClientOptions[]=[],requestUrls:string[]=[];
  const endpoint=new DesktopSigninEndpoint({socket:(url,options)=>{requests.push(options);requestUrls.push(url);return new WebSocket(url,"soda-desktop-e2e-v1",options);},enrollment,identity:gate,active:()=>active,signal:abort.signal,worker});endpoints.push(endpoint);
  const peer=new DesktopEndpointWire({crypto,identity:viewer,session,role:"viewer",peerRole:"provider",expectedFingerprint:providerFP,active:()=>active,sendRaw:value=>rawSend(value),onRecord:(lane,value)=>{records.push({lane,kind:value[0]!,body:new Uint8Array(value.subarray(1))});},onReady:()=>{},onClose:()=>{}});wires.push(peer);
  let resolveHello!:(value:unknown)=>void;const hello=new Promise(resolve=>{resolveHello=resolve;});
  server.on("connection",socket=>{socket.on("close",()=>peer.close());socket.on("error",()=>peer.close());let admitted=false;rawSend=value=>socket.send(value);socket.on("message",(raw,binary)=>{
    const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);
    if(!admitted){expect(JSON.parse(bytes.toString())).toEqual({type:"provider",ticket:"q".repeat(43)});admitted=true;void peer.start().catch(()=>{});return;}
    if(!binary){const value=JSON.parse(bytes.toString());if(value.type==="hello")resolveHello(value.hello);}
    void peer.receive(binary?new Uint8Array(bytes):bytes.toString()).catch(()=>{});
  });});
  // Root supplies a public hello, which alone is NOT a consent or peer proof.
  // Create this initial public value from the same actual viewer handshake.
  const {DesktopEndpointHandshake}=await import("@sodashitsu/client-core/desktop/DesktopE2e");
  const declared=await DesktopEndpointHandshake.create(crypto,viewer,{session,role:"viewer",peerRole:"provider",expectedFingerprint:providerFP,generation:1});
  const params={url:relayHint??origin.replace("http:","ws:")+"/desktop-e2e",ticket:"q".repeat(43),machineId,session,hello:declared.hello};
  await endpoint.start("generated-owner",params,scope);await hello;await vi.waitFor(()=>expect(peer.isReady).toBe(true));
  const send=(value:unknown)=>peer.send("control",packet(1,value));
  const connect=async(signin=true)=>{await peer.send("control",packet(2,{type:"connect",protocols:[desktopFeaturesProtocol(signin?["signin","endpointClose"]:["endpointClose"])]}));};
  const start=async()=>{await connect();await vi.waitFor(()=>expect(records.some(value=>value.kind===3)).toBe(true));await send({type:"start",machineId,options:{width:1280,fps:10,quality:65}});await vi.waitFor(()=>expect(records.some(value=>value.kind===1)).toBe(true));return DesktopSigninRequired.parse(JSON.parse(Buffer.from(records.find(value=>value.kind===1)!.body).toString()));};
  return {store,viewerFP,requests,requestUrls,origin,endpoint,worker,helperSend,helperClose,scope,params,records,peer,abort,release,rejectStop,gate,start,connect,send,lose:()=>{active=false;}};
}
it("requires a fresh sealed offer/grant before creating a native worker",async()=>{
  const f=await fixture();try{const offer=await f.start();expect(f.worker).not.toHaveBeenCalled();await f.send({type:"signin_grant",id:offer.id,control:true});await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());expect(f.worker.mock.calls[0]![0]).toMatchObject({control:true,settings:{width:1280,fps:10,quality:65}});await f.send({type:"control",enabled:true});await vi.waitFor(()=>expect(f.helperSend).toHaveBeenCalledWith({type:"control",enabled:true}));}finally{f.release();}
});
it.each(["wrong-offer","input-ceiling","missing-feature","forbidden-command"])("rejects %s without granting extra native authority",async mode=>{
  const f=await fixture(mode!=="input-ceiling");try{
    if(mode==="missing-feature"){await f.connect(false);await vi.waitFor(()=>expect(f.gate.endpoint).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(f.peer.isReady).toBe(false));expect(f.worker).not.toHaveBeenCalled();return;}
    const offer=await f.start();await f.send({type:"signin_grant",id:mode==="wrong-offer"?randomUUID():offer.id,control:true});
    if(mode==="forbidden-command"){await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());await f.send({type:"agent_grant",enabled:true});await vi.waitFor(()=>expect(f.helperClose).toHaveBeenCalled());expect(f.helperSend).not.toHaveBeenCalled();}
    else{await vi.waitFor(()=>expect(f.peer.isReady).toBe(false));expect(f.worker).not.toHaveBeenCalled();}
  }finally{f.release();}
});
it("keeps native ownership reserved until the prior worker confirms shutdown",async()=>{
  const f=await fixture();try{const offer=await f.start();await f.send({type:"signin_grant",id:offer.id,control:false});await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());f.endpoint.clientGone("generated-owner");expect(f.helperClose).toHaveBeenCalled();await expect(f.endpoint.start("next",f.params,f.scope)).rejects.toThrow();f.release();await f.endpoint.close();}finally{f.release();}
});
it("reaps a worker returned after synchronous factory cancellation before freeing ownership",async()=>{
 const f=await fixture();try{let resolve!:()=>void;const stopped=new Promise<void>(done=>{resolve=done;});
 f.worker.mockImplementationOnce(()=>{f.endpoint.clientGone("generated-owner");return {send:f.helperSend,close:f.helperClose,settled:()=>stopped};});
 const offer=await f.start();await f.send({type:"signin_grant",id:offer.id,control:false});await vi.waitFor(()=>expect(f.helperClose).toHaveBeenCalled());await expect(f.endpoint.start("next",f.params,f.scope)).rejects.toThrow();resolve();await f.endpoint.close();}finally{f.release();}
});
it("permanently closes the endpoint when native stop cannot be confirmed",async()=>{
 const f=await fixture();try{const offer=await f.start();await f.send({type:"signin_grant",id:offer.id,control:false});await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());f.endpoint.clientGone("generated-owner");f.rejectStop(new Error("generated missing stop proof"));await new Promise<void>(resolve=>setImmediate(resolve));await expect(f.endpoint.start("next",f.params,f.scope)).rejects.toThrow();}finally{f.release();}
});

it("passes enrollment CA to the sealed transport and preserves TLS verification",async()=>{const caPem=readFileSync(new URL("../../../tui/src/testing/tls/cert.pem",import.meta.url),"utf8"),f=await fixture(true,caPem);try{expect(f.requests[0]).toMatchObject({ca:caPem,rejectUnauthorized:true,followRedirects:false});}finally{f.release();}});

it("connects to the enrolled relay instead of a caller's local listener",async()=>{
 const hint="ws://127.0.0.1:1/desktop-e2e",f=await fixture(true,undefined,hint);
 try{expect(f.params.url).toBe(hint);expect(f.requestUrls).toEqual([f.origin.replace("http:","ws:")+"/desktop-e2e"]);expect(f.peer.isReady).toBe(true);expect(f.worker).not.toHaveBeenCalled();}finally{f.release();}
});

it.each(["viewer-command","passive-output"])("revokes actual persisted viewer trust before %s without polling",async mode=>{
 const f=await fixture(true,undefined,undefined,true);try{
  const offer=await f.start();await f.send({type:"signin_grant",id:offer.id,control:true});await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());
  await f.store!.revoke(f.viewerFP,"viewer");
  const pixelsBefore=f.records.filter(record=>record.lane==="image").length;
  if(mode==="viewer-command")await f.send(RemoteDesktopViewerMessage.parse({type:"input",seq:1,input:{kind:"key",code:"Space",down:true}}));
  else f.worker.mock.calls[0]![0].record(new Uint8Array([1,2,3]),true);
  await vi.waitFor(()=>expect(f.peer.isReady).toBe(false));expect(f.helperSend).not.toHaveBeenCalled();expect(f.helperClose).toHaveBeenCalled();expect(f.records.filter(record=>record.lane==="image")).toHaveLength(pixelsBefore);
 }finally{f.release();}
});
it.each(["input","control","admin","exec"])("view-only sealed viewer cannot issue %s",async mode=>{
 const f=await fixture(false,undefined,undefined,true);try{
  const offer=await f.start();await f.send({type:"signin_grant",id:offer.id,control:false});await vi.waitFor(()=>expect(f.worker).toHaveBeenCalledOnce());
  const command=mode==="input"?RemoteDesktopViewerMessage.parse({type:"input",seq:1,input:{kind:"key",code:"Space",down:true}}):mode==="control"?RemoteDesktopViewerMessage.parse({type:"control",enabled:true}):{type:mode,command:"generated-never-executed"};
  await f.send(command);await vi.waitFor(()=>expect(f.peer.isReady).toBe(false));expect(f.helperSend).not.toHaveBeenCalled();expect(f.helperClose).toHaveBeenCalled();
 }finally{f.release();}
});
