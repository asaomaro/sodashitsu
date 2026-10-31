import {DesktopEndpointAgentRpc} from "./DesktopEndpointAgentRpc.js";
import type {DesktopAgentRecipient} from "./DesktopAgentAccess.js";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {WebSocket,type RawData} from "ws";
import {z} from "zod";
import {DESKTOP_FILES_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL,DESKTOP_MICROPHONE_PROTOCOL,DESKTOP_RICH_CLIPBOARD_PROTOCOL,DESKTOP_VIDEO_LANE_PROTOCOL,DesktopStartParams,DesktopEndpointMachine} from "@sodashitsu/protocol";
import type {LinkChannel} from "../machine/MachineLink.js";
import type {DesktopProviderApi as DesktopProvider,DesktopProviderEndpointScope} from "./DesktopProvider.js";
import {DesktopRelay} from "./DesktopRelay.js";

const children=new Set([DESKTOP_FILES_PROTOCOL,DESKTOP_IMAGE_LANE_PROTOCOL,DESKTOP_MICROPHONE_PROTOCOL,DESKTOP_RICH_CLIPBOARD_PROTOCOL,DESKTOP_VIDEO_LANE_PROTOCOL]);
const secretHash=(value:string)=>createHash("sha256").update(value).digest("hex");
const failure=()=>Error("Private desktop endpoint unavailable");
const cleanup=(fn:()=>void)=>{try{fn();}catch{/* Complete the remaining revocations. */}};
const bytes=(raw:RawData)=>Buffer.isBuffer(raw)?raw:Array.isArray(raw)?Buffer.concat(raw):Buffer.from(raw);
const Envelope=z.object({id:z.string().regex(/^[1-9][0-9]{0,15}$/),method:z.enum(["client.hello","desktop.capabilities","desktop.start"]),params:z.unknown()}).strict();
export interface DesktopEndpointLocalSocket {
 readonly bufferedAmount:number;
 send(raw:string|Uint8Array):void;
 close():void;
}
export interface DesktopEndpointRoot {
 active():boolean;
 grantAgent(recipient:DesktopAgentRecipient):{ticket:string;expiresAt:number;scope:string};
 revokeAgent():void;
 /** Endpoint code only. Copy records synchronously before deferred processing. */
 open(protocols:readonly string[],onRecord:(bytes:Uint8Array,binary:boolean)=>void,onClose:()=>void):Promise<DesktopEndpointLocalSocket>;
 /** Invoke synchronously from trust revocation, owner close and source changes. */
 close():void;
}
type RootState={session:string;machine:string;publicMachine:string;cookie:string;agentScope:string;scope:DesktopProviderEndpointScope;closed:boolean;parent:boolean;sockets:Set<WebSocket>;channels:Set<LinkChannel>;close():void};
/** Trusted B-owner backplane. Nothing is mounted on the public HTTP server.
 * Reuses desktop permission/helper/ACK/lane logic on private loopback only.
 * Cookie, private route ID, provider tickets and plaintext never go to A. */
export class DesktopEndpointBackplane {
 private readonly server=createServer((_req,res)=>{res.writeHead(404);res.end();});
 private readonly roots=new Map<string,RootState>();
 private readonly cookies=new Map<string,RootState>();
 private readonly routes=new Map<string,RootState>();
 private readonly revoked=new Set<(id:string)=>void>();
 private readonly relay:DesktopRelay;
 private readonly agentOwners=new Map<DesktopEndpointAgentRpc,RootState>();
 private origin="";
 private closed=false;
 private closing:Promise<void>|undefined;
 private channelId=0;
 private readonly timer:ReturnType<typeof setInterval>;
 private constructor(private readonly provider:DesktopProvider) {
  this.server.headersTimeout=5000;this.server.requestTimeout=5000;this.server.maxConnections=64;
  const valid=(id:string|undefined)=>{const root=id?this.roots.get(id):undefined;return !!root&&!root.closed&&root.scope.active();};
  this.relay=new DesktopRelay({verifySession:valid,authorizeUpgrade:async req=>{
   const cookie=req.headers.cookie??"";
   if(!/^SodaDesktopEndpoint=[a-f0-9]{64}$/.test(cookie))return {ok:false};
   const root=this.cookies.get(secretHash(cookie));
   return root&&valid(root.session)?{ok:true,sessionId:root.session}:{ok:false};
  },onSessionRevoked:cb=>{this.revoked.add(cb);return {dispose:()=>{this.revoked.delete(cb);}};}},{admit:(request,deny)=>{
   const okay=request.origin===this.origin&&request.host===new URL(this.origin).host&&request.remoteAddress==="127.0.0.1";
   if(!okay)deny();return okay;
  }},{route:id=>{const root=this.routes.get(id);return root&&valid(root.session)?{kind:"ok",link:{openChannel:()=>this.channel(root)}}:{kind:"unknown"};}});
  this.server.on("upgrade",(req,socket,head)=>{if(this.closed){socket.destroy();return;}void this.relay.upgrade(req,socket,head).catch(()=>socket.destroy());});
  this.timer=setInterval(()=>{for(const root of this.roots.values())if(!root.scope.active())root.close();},250);this.timer.unref();
 }
 static async create(provider:DesktopProvider):Promise<DesktopEndpointBackplane> {
  const plane=new DesktopEndpointBackplane(provider);
  try {
   await new Promise<void>((resolve,reject)=>{plane.server.once("error",reject);plane.server.listen(0,"127.0.0.1",()=>{plane.server.off("error",reject);resolve();});});
   plane.origin=`http://127.0.0.1:${(plane.server.address() as AddressInfo).port}`;return plane;
  }catch{await plane.close();throw failure();}
 }
 root(publicMachine:string,active:()=>boolean,nativeOrigin=this.origin):DesktopEndpointRoot {
  if(this.closed||this.roots.size>=8||!DesktopEndpointMachine.safeParse(publicMachine).success||!active())throw failure();
  const scope=this.provider.endpointScope(this.origin,()=>!this.closed&&active(),nativeOrigin);
  const root:RootState={session:randomUUID(),machine:randomUUID(),publicMachine,cookie:"SodaDesktopEndpoint="+randomBytes(32).toString("hex"),agentScope:randomBytes(32).toString("base64url"),scope,closed:false,parent:false,sockets:new Set(),channels:new Set(),close:()=>{
   if(root.closed)return;root.closed=true;
   // Stop native/UDP/helper ownership before revoking the plaintext sockets.
   cleanup(()=>scope.close());for(const [rpc,owner] of [...this.agentOwners])if(owner===root)cleanup(()=>rpc.close());this.roots.delete(root.session);this.routes.delete(root.machine);this.cookies.delete(secretHash(root.cookie));root.cookie="";
   for(const channel of [...root.channels])cleanup(()=>channel.close(1000,"endpoint stopped"));root.channels.clear();
   for(const callback of this.revoked)cleanup(()=>callback(root.session));
   for(const socket of root.sockets)cleanup(()=>socket.terminate());root.sockets.clear();
  }};
  this.roots.set(root.session,root);this.cookies.set(secretHash(root.cookie),root);this.routes.set(root.machine,root);
  return {active:()=>!root.closed&&scope.active(),close:root.close,grantAgent:recipient=>{
   if(root.closed||!scope.active()||!root.parent)throw failure();const fingerprint=recipient.fingerprint,active=recipient.active;
   const granted=this.relay.grantEndpointAgent(root.session,{fingerprint,scope:root.agentScope,active:()=>!root.closed&&scope.active()&&active()});return{...granted,scope:root.agentScope};
  },revokeAgent:()=>this.relay.revokeEndpointAgent(root.session),open:(protocols,onRecord,onClose)=>this.open(root,protocols,onRecord,onClose)};
 }
 agent(fingerprint:string,scope:string,active:()=>boolean,onClose?:(reason:"released"|"stopped")=>void):DesktopEndpointAgentRpc {
  const root=[...this.roots.values()].find(value=>value.agentScope===scope);
  if(this.closed||!root||root.closed||!root.scope.active()||this.agentOwners.size>=8)throw failure();
  let rpc:DesktopEndpointAgentRpc;
  rpc=new DesktopEndpointAgentRpc(this.relay.agents,fingerprint,()=>!this.closed&&!root.closed&&root.scope.active()&&active(),{scope,onClose:reason=>{this.agentOwners.delete(rpc);onClose?.(reason);}});if(this.closed||root.closed||!root.scope.active()){rpc.close();throw failure();}this.agentOwners.set(rpc,root);return rpc;
 }
 private channel(root:RootState):LinkChannel|undefined {
  if(root.closed||!root.scope.active()||root.channels.size)return;
  const owner=randomUUID();let ended=false,busy=false,onText=(text:string)=>{void text;},onClose=(_code:number,_reason:string)=>{};
  const channel:LinkChannel={id:++this.channelId,pendingBytes:0,onText:cb=>{onText=cb;},onBinary:()=>{},onClose:cb=>{onClose=cb;},sendBinary:()=>channel.close(1008,"invalid desktop RPC"),close:(code,reason)=>{
   if(ended)return;ended=true;root.channels.delete(channel);try{root.scope.release(owner);}finally{cleanup(()=>onClose(code,reason));}
  },sendText:text=>{
   if(ended||root.closed||!root.scope.active()||text.length>65536||busy){channel.close(1008,"invalid desktop RPC");return;}
   busy=true;void (async()=>{
    let id:string|undefined;
    try {
     const message=Envelope.parse(JSON.parse(text));id=message.id;
     let result:unknown;
     if(message.method==="client.hello") {z.object({protocol:z.literal(1),kind:z.literal("external")}).strict().parse(message.params);result={};}
     else if(message.method==="desktop.capabilities"){z.object({}).strict().parse(message.params);const {endpointRequired:_required,...caps}=this.provider.capabilities();result=caps;}
     else result=await root.scope.start(owner,DesktopStartParams.parse(message.params));
     if(ended||root.closed||!root.scope.active()){channel.close(1008,"endpoint expired");return;}
     onText(JSON.stringify({id,result}));
    }catch{
     if(id&&!ended&&!root.closed&&root.scope.active())onText(JSON.stringify({id,error:{message:"Desktop endpoint request rejected"}}));
     else channel.close(1008,"invalid desktop RPC");
    }finally{busy=false;}
   })();
  }};
  root.channels.add(channel);return channel;
 }
 private async open(root:RootState,protocols:readonly string[],onRecord:(bytes:Uint8Array,binary:boolean)=>void,onClose:()=>void):Promise<DesktopEndpointLocalSocket> {
  if(this.closed||root.closed||!root.scope.active()||protocols.length>32||protocols.some(value=>!/^soda-desktop-[a-z0-9-]{1,64}$/.test(value))||new Set(protocols).size!==protocols.length||root.sockets.size>=8)throw failure();
  const child=protocols.length===1&&children.has(protocols[0]!);
  if(child?!root.parent:root.parent)throw failure();
  if(!child)root.parent=true;
  const ws=new WebSocket(this.origin.replace(/^http/,"ws")+"/desktop-share",[...protocols],{headers:{origin:this.origin,cookie:root.cookie},maxPayload:4*1024*1024,handshakeTimeout:5000,perMessageDeflate:false,followRedirects:false});root.sockets.add(ws);
  ws.on("error",()=>ws.terminate());
  ws.on("message",(raw,binary)=>{
   if(root.closed||!root.scope.active()){root.close();return;}
   try{onRecord(new Uint8Array(bytes(raw)),binary);}catch{if(!child)root.close();else ws.terminate();}
  });
  ws.once("close",()=>{root.sockets.delete(ws);if(!child)root.close();cleanup(onClose);});
  try {
   await new Promise<void>((resolve,reject)=>{const fail=()=>reject(failure());ws.once("error",fail);ws.once("close",fail);ws.once("open",()=>{ws.off("error",fail);ws.off("close",fail);resolve();});});
   if(root.closed||!root.scope.active())throw failure();
   let started=false;
   return {get bufferedAmount(){return ws.bufferedAmount;},close:()=>ws.close(),send:raw=>{
    if(root.closed||!root.scope.active()||ws.readyState!==WebSocket.OPEN||ws.bufferedAmount>4*1024*1024){root.close();throw failure();}
    if((typeof raw==="string"?raw.length*2:raw.byteLength)>4*1024*1024){root.close();throw failure();}
    if(!child) {
     if(typeof raw!=="string"){root.close();throw failure();}
     let message:{type?:string;machineId?:string};
     try{message=JSON.parse(raw);if(!message||typeof message!=="object"||Array.isArray(message))throw failure();}catch{root.close();throw failure();}
     if(message.type==="start"){
      if(started||message.machineId!==root.publicMachine){root.close();throw failure();}
      started=true;ws.send(JSON.stringify({...message,machineId:root.machine}));return;
     }
    }
    ws.send(raw);
   }};
  }catch{ws.terminate();if(!child)root.close();throw failure();}
 }
 close():Promise<void> {
  if(this.closing)return this.closing;this.closed=true;clearInterval(this.timer);for(const root of [...this.roots.values()])cleanup(root.close);for(const rpc of [...this.agentOwners.keys()])cleanup(()=>rpc.close());this.agentOwners.clear();cleanup(()=>this.relay.dispose());
  this.closing=new Promise<void>(resolve=>this.server.close(()=>resolve()));return this.closing;
 }
}
