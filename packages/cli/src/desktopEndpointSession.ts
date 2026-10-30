import type {DesktopRegionRect} from "@sodashitsu/protocol";
import WebSocket from "ws";
import {performance} from "node:perf_hooks";
import {randomUUID} from "node:crypto";
import {DESKTOP_ENDPOINT_PROTOCOL,DesktopMethods,DesktopAgentEndpointResults as results,DesktopAgentEndpointResponse,parseDesktopAgentGrant,type DesktopResults,type RemoteDesktopInput} from "@sodashitsu/protocol";
import {DesktopEndpointWire} from "@sodashitsu/client-core/desktop/DesktopEndpointWire";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import type {DesktopAgentConnection} from "./desktopSession.js";
import type {GlobalOpts} from "./cliArgs.js";
import type {SessionStore} from "./session.js";
import {desktopIdentityDirectory} from "./commands/desktopIdentity.js";
import {login} from "./httpAuth.js";
import {AuthError,RpcFailure} from "./wsClient.js";
import {UnauthenticatedError} from "./withSession.js";
type Method=keyof typeof results;
type Permit=Awaited<ReturnType<DesktopEndpointStore["localIdentity"]>>;
const failure=()=>Error("Encrypted desktop agent session ended");
/** Only opaque handshakes/ciphertext go to Root; no plaintext desktop RPC. */
export class DesktopEncryptedAgentSession implements DesktopAgentConnection {
 readonly abort=new AbortController();
 expiresAt=0;
 private closed=false;
 private authenticated=false;
 private initial=true;
 private lease="";
 private nextId=0;
 private expiresMono=performance.now()+120000;
 private releaseSeen=false;
 private pending:{id:string;method:Method;deadline:number;timer:ReturnType<typeof setTimeout>;resolve(value:unknown):void;reject(error:Error):void}|undefined;
 private readonly socket:WebSocket;
 private readonly wire:DesktopEndpointWire;
 private readonly ready:Promise<void>;
 private readyResolve!:()=>void;
 private readyReject!:(error:Error)=>void;
 private readonly finished:Promise<void>;
 private finish!:()=>void;
 private timer:ReturnType<typeof setTimeout>;
 private readonly stopped=()=>this.close();
 private constructor(private readonly store:DesktopEndpointStore,private readonly permit:Permit,private readonly signal:AbortSignal,origin:string,cookie:string,machine:string,pin:string){
  this.finished=new Promise(resolve=>{this.finish=resolve;});this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
  const session=randomUUID(),url=new URL("/desktop-e2e",origin);url.protocol=url.protocol==="https:"?"wss:":"ws:";
  this.socket=new WebSocket(url,DESKTOP_ENDPOINT_PROTOCOL,{headers:{origin,cookie,host:url.host},maxPayload:4*1024*1024,handshakeTimeout:5000,followRedirects:false,perMessageDeflate:false});
  this.wire=new DesktopEndpointWire({crypto,identity:permit.identity,session,role:"agent",peerRole:"provider",expectedFingerprint:pin,active:()=>this.active(),sendRaw:raw=>{
   if(!this.active()||this.socket.readyState!==WebSocket.OPEN||this.socket.bufferedAmount>8*1024*1024)throw failure();
   if(typeof raw==="string"){
    const message=JSON.parse(raw);if(this.initial&&message.type==="hello"&&message.hello?.generation===1){this.initial=false;this.socket.send(JSON.stringify({type:"viewer",machineId:machine,session,hello:message.hello}));return;}
   }
   this.socket.send(raw);
  },onReady:()=>{this.authenticated=true;this.readyResolve();},onRecord:(lane,record)=>{
   if(!this.active()||!record.length)throw failure();
   if(lane==="control"&&record[0]===4&&record.length===1&&this.releaseSeen){void this.wire.send("control",new Uint8Array([5])).then(()=>this.close(),()=>this.close());return;}
   if(lane!=="agent"||record[0]!==1||record.length>4*1024*1024)throw failure();
   const response=DesktopAgentEndpointResponse.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(record.subarray(1))));
   const pending=this.pending;if(!pending||response.id!==pending.id||performance.now()>=pending.deadline||("result" in response)===(response.error!==undefined))throw failure();
   const value=response.error?undefined:results[pending.method].parse(response.result);if(!this.active()||performance.now()>=pending.deadline)throw failure();
   this.pending=undefined;clearTimeout(pending.timer);
   if(response.error){pending.reject(new RpcFailure("server_busy","Fresh desktop observation is not ready"));return;}
   if(pending.method==="desktop.agent.release")this.releaseSeen=true;pending.resolve(value);
  },onClose:()=>this.close()});
  this.timer=setTimeout(()=>this.close(),15000);this.timer.unref();
  this.socket.once("unexpected-response",(_request,response)=>{this.readyReject(response.statusCode===401?new AuthError("Desktop authentication failed"):failure());this.close();});
  this.socket.on("error",()=>this.close());this.socket.on("close",()=>this.close());
  this.socket.on("message",(raw,binary)=>{const bytes=Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);void this.wire.receive(binary?new Uint8Array(bytes):bytes.toString()).catch(()=>this.close());});
  this.socket.once("open",()=>{void this.wire.start().catch(()=>this.close());});
  signal.addEventListener("abort",this.stopped,{once:true});if(signal.aborted)this.close();
 }
 private active():boolean{return !this.closed&&!this.signal.aborted&&this.permit.active()&&performance.now()<this.expiresMono;}
 private async request(method:Method,params:unknown):Promise<unknown>{
  if(!this.active()||!this.authenticated||this.pending||++this.nextId>1000)throw failure();
  const id=String(this.nextId),timeout=method==="desktop.agent.act"?60000:10000;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.close(),timeout);timer.unref();this.pending={id,method,deadline:performance.now()+timeout,timer,resolve,reject};
   const bytes=new TextEncoder().encode(JSON.stringify({id,method,params}));if(bytes.length>65536){this.close();return;}const record=new Uint8Array(bytes.length+1);record[0]=1;record.set(bytes,1);void this.wire.send("agent",record).catch(()=>this.close());
  });
 }
 static async open(options:{opts:GlobalOpts;sessions:SessionStore;code:string;fingerprint:string|undefined;identityDir:string|undefined;signal:AbortSignal}):Promise<DesktopEncryptedAgentSession>{
  const grant=parseDesktopAgentGrant(options.code),origin=new URL(options.opts.url).origin;
  if(!options.fingerprint||options.fingerprint!==grant.provider||origin!==grant.origin||Date.now()>=grant.expiresAt)throw Error("Verify an independent provider fingerprint and grant origin before connecting");
  const directory=desktopIdentityDirectory(options.identityDir);let cookie:string|undefined;let cached=false;
  for(let attempt=0;attempt<2;attempt++){
   const store=new DesktopEndpointStore({stateDir:directory});let session:DesktopEncryptedAgentSession|undefined;
   try{
    if(!await store.directoryAvailable())throw Error("Initialize this CLI identity explicitly before connecting");const permit=await store.localIdentity();
    if(await permit.identity.fingerprint()!==grant.recipient||!permit.active()||options.signal.aborted)throw Error("Desktop grant recipient does not match this CLI identity");
    if(attempt===0){cookie=await options.sessions.get(options.opts.url);cached=cookie!==undefined;}
    if(!cookie){if(!options.opts.token)throw new UnauthenticatedError("No Root session; log in before connecting");cookie=await login(options.opts.url,options.opts.token,(input,init)=>fetch(input,{...init,signal:AbortSignal.any([options.signal,AbortSignal.timeout(10000)])}));await options.sessions.set(options.opts.url,cookie);}
    if(options.signal.aborted)throw failure();session=new DesktopEncryptedAgentSession(store,permit,options.signal,origin,cookie,grant.machineId,options.fingerprint);
    await session.ready;clearTimeout(session.timer);if(!session.active())throw failure();
    const attached=results["desktop.agent.attach"].parse(await session.request("desktop.agent.attach",{ticket:grant.ticket,scope:grant.scope}));
    session.lease=attached.leaseId;session.expiresAt=attached.expiresAt;const remaining=Math.max(1,Math.min(120000,attached.expiresAt-Date.now()));session.expiresMono=Math.min(session.expiresMono,performance.now()+remaining);
    session.timer=setTimeout(()=>session!.close(),remaining);session.timer.unref();return session;
   }catch(error){
    const retry=error instanceof AuthError&&cached&&attempt===0&&!session?.authenticated&&!options.signal.aborted;session?.close();store.close();await store.settled();if(!retry)throw error;await options.sessions.clear(options.opts.url);cookie=undefined;cached=false;
   }
  }
  throw failure();
 }
 observe(afterFrameSeq?:number,region?:DesktopRegionRect){return this.request("desktop.agent.observe",DesktopMethods["desktop.agent.observe"].parse({leaseId:this.lease,...(afterFrameSeq===undefined?{}:{afterFrameSeq}),...(region?{region}:{})})) as Promise<DesktopResults["desktop.agent.observe"]>;}
 async act(observationId:string,inputs:RemoteDesktopInput[]){try{return await this.request("desktop.agent.act",DesktopMethods["desktop.agent.act"].parse({leaseId:this.lease,observationId,inputs})) as DesktopResults["desktop.agent.act"];}catch(error){this.close();throw error;}}
 async release(){try{const result=await this.request("desktop.agent.release",{leaseId:this.lease}) as DesktopResults["desktop.agent.release"];const timer=setTimeout(()=>this.close(),2500);timer.unref();await this.finished;clearTimeout(timer);return result;}finally{this.close();}}
 close():void{
  if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.signal.removeEventListener("abort",this.stopped);this.readyReject(failure());
  const pending=this.pending;this.pending=undefined;if(pending){clearTimeout(pending.timer);pending.reject(failure());}
  this.store.close();this.wire.close();this.socket.terminate();this.abort.abort();this.finish();void this.store.settled();
 }
}
