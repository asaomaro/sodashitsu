import {DesktopEndpointHandshake,DESKTOP_E2E_LANES,type DesktopEndpointIdentity,type DesktopEndpointSession,type DesktopE2eHello,type DesktopE2eLane,type DesktopE2eRole} from "./DesktopE2e.js";

type Raw=string|Uint8Array;
type Pending={lane:DesktopE2eLane;bytes:Uint8Array;resolve():void;reject(error:Error):void};
type Exchange={handshake:DesktopEndpointHandshake;generation:number;deadline:number;kind:"initial"|"rotate"};
export interface DesktopEndpointWireOptions {
 crypto:typeof globalThis.crypto;
 identity:DesktopEndpointIdentity;
 session:string;
 role:DesktopE2eRole;
 peerRole:DesktopE2eRole;
 expectedFingerprint:string;
 /** Combine the endpoint trust permit with the source/process epoch. */
 active():boolean;
 /** One ordered, reliable physical connection. Must copy/consume synchronously. */
 sendRaw(data:Raw):void;
 /** Consume/copy synchronously: bytes are zeroed on return. Promises are not
  * awaited. Deferred consumers must also recheck their owner/source epoch. */
 onRecord(lane:DesktopE2eLane,bytes:Uint8Array):void;
 onReady():void;
 onClose():void;
 now?:()=>number;
 /** Lower limits are useful for generated tests; production may only lower them. */
 rotateBytes?:number;
 rotateRecords?:number;
}
const failure=()=>Error("Desktop encrypted connection is unavailable");
const MAX_RECORD=4*1024*1024-63,MAX_QUEUED=16*1024*1024,MAX_PENDING=8;
const utf8=new TextEncoder();
/** Endpoint-only ordered transport. No relay, storage, UI, OS input or capture.
 * Each physical socket owns its handshake, counters, FIFO and rekey barrier.
 * Public rekey messages cannot publish data without pinned transcript proofs. */
export class DesktopEndpointWire {
 private closed=false;
 private started=false;
 private starting:Promise<void>|undefined;
 private ready=false;
 private session:DesktopEndpointSession|undefined;
 private exchange:Exchange|undefined;
 private generation=1;
 private incoming=Promise.resolve();
 private receiving=0;
 private receivingBytes=0;
 private queue:Pending[]=[];
 private queuedBytes=0;
 private flushing=false;
 private rotating=false;
 private preparingRotation=false;
 private rotationDeadline:number|undefined;
 private sent=new Map<DesktopE2eLane,{bytes:number;records:number}>();
 private received=new Map<DesktopE2eLane,{bytes:number;records:number}>();
 private authenticatedAt:number;
 private pingAt:number;
 private readonly timer:ReturnType<typeof setInterval>;
 private readonly rotateBytes:number;
 private readonly rotateRecords:number;
 constructor(private readonly options:DesktopEndpointWireOptions) {
  this.options={...options};
  if((options.role==="provider")===(options.peerRole==="provider"))throw failure();
  this.rotateBytes=options.rotateBytes??768*1024*1024;
  this.rotateRecords=options.rotateRecords??750000;
  if(!Number.isInteger(this.rotateBytes)||this.rotateBytes<1||this.rotateBytes>768*1024*1024||!Number.isInteger(this.rotateRecords)||this.rotateRecords<1||this.rotateRecords>750000)throw failure();
  this.authenticatedAt=this.pingAt=this.now();
  this.timer=setInterval(()=>this.poll(),1000);
  (this.timer as unknown as {unref?:()=>void}).unref?.();
 }
 private now():number{return (this.options.now??(()=>performance.now()))();}
 private expired():boolean {
  const now=this.now();
  return this.rotationDeadline!==undefined&&now>=this.rotationDeadline||!!this.exchange&&now>=this.exchange.deadline||!this.ready&&now-this.authenticatedAt>=15000||this.ready&&now-this.authenticatedAt>=60000;
 }
 private alive():void{if(this.closed||!this.options.active()||this.expired())throw failure();}
 get bufferedAmount():number{return this.queuedBytes;}
 get isReady():boolean{return this.ready&&!this.closed;}
 start():Promise<void> {
  if(this.started){this.close();return Promise.reject(failure());}
  this.started=true;this.starting=this.prepareStart();return this.starting;
 }
 private async prepareStart():Promise<void> {
  try {
   this.alive();
   const exchange=await this.createExchange("initial",1);this.alive();this.exchange=exchange;
   if(this.options.role!=="provider")this.raw({type:"hello",hello:exchange.handshake.hello});
  }catch{this.close();throw failure();}
 }
 private async createExchange(kind:Exchange["kind"],generation:number):Promise<Exchange> {
  const handshake=await DesktopEndpointHandshake.create(this.options.crypto,this.options.identity,{session:this.options.session,role:this.options.role,peerRole:this.options.peerRole,expectedFingerprint:this.options.expectedFingerprint,generation});
  if(this.closed||!this.options.active()||this.expired()){handshake.close();throw failure();}
  return {handshake,generation,kind,deadline:this.now()+15000};
 }
 private raw(value:unknown):void{this.alive();this.options.sendRaw(JSON.stringify(value));}
 /** Bounded before the payload copy, including while WebCrypto is pending. */
 receive(raw:Raw):Promise<void> {
  const size=typeof raw==="string"?raw.length*2:raw.byteLength;
  if(this.closed)return Promise.reject(failure());
  if(!this.started||!this.options.active()||size>4*1024*1024||this.receiving>=MAX_PENDING||this.receivingBytes+size>MAX_QUEUED){this.close();return Promise.reject(failure());}
  const snapshot=typeof raw==="string"?raw:new Uint8Array(raw);
  this.receiving++;this.receivingBytes+=size;
  const work=this.incoming.then(async()=>{
   await this.starting;
   this.alive();
   if(typeof snapshot==="string")await this.message(snapshot);
   else await this.record(snapshot);
   this.alive();
  });
  this.incoming=work.catch(()=>this.close());
  return work.catch(()=>{this.close();throw failure();}).finally(()=>{if(typeof snapshot!=="string")snapshot.fill(0);this.receiving--;this.receivingBytes-=size;});
 }
 private async message(raw:string):Promise<void> {
  if(raw.length>4096)throw failure();
  const msg=JSON.parse(raw) as {type?:string;hello?:DesktopE2eHello;proof?:string;generation?:number};
  if(!msg||typeof msg!=="object"||Array.isArray(msg))throw failure();
  if(msg.type==="rotate") {
   if(Object.keys(msg).sort().join(",")!=="hello,type"||this.options.role==="provider"||!this.ready||this.exchange||!msg.hello||msg.hello.generation!==this.generation+1)throw failure();
   this.rotating=true;
   this.rotationDeadline??=this.now()+15000;
   // Flush already-sealed old records before returning the new hello. JS sends
   // the hello only after the active old seal completes on this physical FIFO.
   await this.drainSeal();this.alive();
   const exchange=await this.createExchange("rotate",this.generation+1);this.alive();this.exchange=exchange;
   const proof=await exchange.handshake.proof(msg.hello);this.alive();
   this.peerHello=msg.hello;
   this.raw({type:"hello",hello:exchange.handshake.hello,proof});return;
  }
  const exchange=this.exchange;if(!exchange)throw failure();
  if(msg.type==="hello") {
   const provider=this.options.role==="provider";
   const expected=provider&&exchange.kind==="initial"?"hello,type":"hello,proof,type";
   if(Object.keys(msg).sort().join(",")!==expected||!msg.hello||msg.hello.generation!==exchange.generation)throw failure();
   if(provider&&exchange.kind==="initial") {
    if(this.peerHello)throw failure();
    const proof=await exchange.handshake.proof(msg.hello);this.alive();
    this.peerHello=msg.hello;
    this.raw({type:"hello",hello:exchange.handshake.hello,proof});return;
   }
   if(typeof msg.proof!=="string")throw failure();
   const proof=await exchange.handshake.proof(msg.hello);this.alive();
   const session=await exchange.handshake.finish(msg.hello,msg.proof);
   try{this.alive();this.raw({type:"proof",generation:exchange.generation,proof});this.install(session,exchange);}catch{session.close();throw failure();}
   return;
  }
  if(msg.type==="proof") {
   if(Object.keys(msg).sort().join(",")!=="generation,proof,type"||msg.generation!==exchange.generation||typeof msg.proof!=="string"||!this.peerHello)throw failure();
   const session=await exchange.handshake.finish(this.peerHello,msg.proof);
   try{this.alive();this.install(session,exchange);}catch{session.close();throw failure();}return;
  }
  throw failure();
 }
 private peerHello:DesktopE2eHello|undefined;
 private install(session:DesktopEndpointSession,exchange:Exchange):void {
  this.alive();if(this.exchange!==exchange)throw failure();
  const initial=!this.ready;this.session?.close();this.session=session;
  this.generation=exchange.generation;this.exchange=undefined;this.peerHello=undefined;
  this.sent.clear();this.received.clear();this.rotating=false;this.rotationDeadline=undefined;this.ready=true;
  this.authenticatedAt=this.pingAt=this.now();
  if(initial)this.options.onReady();this.alive();void this.flush();
 }
 private exceeded(map:Map<DesktopE2eLane,{bytes:number;records:number}>,lane:DesktopE2eLane,bytes:number):boolean {
  const state=map.get(lane)??{bytes:0,records:0};state.bytes+=bytes;state.records++;map.set(lane,state);
  return state.bytes>=this.rotateBytes||state.records>=this.rotateRecords;
 }
 private async record(packet:Uint8Array):Promise<void> {
  if(!this.ready||!this.session||packet.length<63||this.exchange&&this.options.role!=="provider")throw failure();
  const lane=DESKTOP_E2E_LANES[packet[5]!];if(!lane)throw failure();
  const plaintext=await this.session.open(lane,packet);
  try {
   this.alive();this.authenticatedAt=this.now();
   if(!plaintext.length)throw failure();
   const kind=plaintext[0]!;
   if(kind===0)this.options.onRecord(lane,plaintext.subarray(1));
   else if(kind===1&&lane==="control"&&plaintext.length===1){void this.enqueue("control",new Uint8Array([2])).catch(()=>{});}
   else if(kind===3&&lane==="control"&&plaintext.length===1&&this.options.role==="provider"){void this.rotate();}
   else if(kind!==2||lane!=="control"||plaintext.length!==1)throw failure();
   this.alive();
   if(this.exceeded(this.received,lane,plaintext.length)&&this.options.role==="provider")void this.rotate();
  }finally{plaintext.fill(0);}
 }
 send(lane:DesktopE2eLane,bytes:Uint8Array):Promise<void> {
  if(bytes.byteLength>MAX_RECORD)return Promise.reject(failure());
  const framed=new Uint8Array(bytes.byteLength+1);framed.set(bytes,1);
  const result=this.enqueue(lane,framed);framed.fill(0);return result;
 }
 private enqueue(lane:DesktopE2eLane,bytes:Uint8Array):Promise<void> {
  if(this.closed||!this.started||!this.options.active()||!DESKTOP_E2E_LANES.includes(lane)||this.queue.length>=MAX_PENDING||this.queuedBytes+bytes.length>MAX_QUEUED){this.close();return Promise.reject(failure());}
  return new Promise((resolve,reject)=>{const snapshot=new Uint8Array(bytes);this.queue.push({lane,bytes:snapshot,resolve,reject});this.queuedBytes+=snapshot.length;void this.flush();});
 }
 private sealDone:Promise<void>=Promise.resolve();
 private async drainSeal():Promise<void>{while(true){const pending=this.sealDone;await pending;if(pending===this.sealDone)return;}}
 private transmit(lane:DesktopE2eLane,bytes:Uint8Array):Promise<void> {
  const snapshot=new Uint8Array(bytes),previous=this.sealDone;
  const work=previous.then(async()=>{
   this.alive();const session=this.session;if(!session)throw failure();
   const packet=await session.seal(lane,snapshot);this.alive();this.options.sendRaw(packet);
  }).finally(()=>snapshot.fill(0));
  this.sealDone=work.catch(()=>{});return work;
 }
 private requestRotation():void {
  this.rotating=true;this.rotationDeadline??=this.now()+15000;
  // This reserved authenticated record works even when the provider uses a
  // different (higher) local budget. It joins the same old-key output FIFO.
  void this.transmit("control",new Uint8Array([3])).catch(()=>this.close());
 }
 private async flush():Promise<void> {
  if(this.flushing||!this.ready||this.rotating||this.closed)return;
  this.flushing=true;
  try {
   while(this.queue.length&&!this.rotating&&!this.closed) {
    this.alive();const item=this.queue[0]!;
    {
     await this.transmit(item.lane,item.bytes);this.alive();
     const rotate=this.exceeded(this.sent,item.lane,item.bytes.length);
     this.queue.shift();this.queuedBytes-=item.bytes.length;item.bytes.fill(0);item.resolve();
     if(rotate){if(this.options.role==="provider")void this.rotate();else this.requestRotation();}
    }
   }
  }catch{this.close();}finally{this.flushing=false;}
 }
 private async rotate():Promise<void> {
  if(this.closed||this.options.role!=="provider"||this.exchange||this.preparingRotation)return;
  this.preparingRotation=true;
  this.rotating=true;
  this.rotationDeadline=this.now()+15000;
  try {
   await this.drainSeal();this.alive();if(this.exchange)return;
   if(this.generation===0xffffffff)throw failure();
   const exchange=await this.createExchange("rotate",this.generation+1);this.alive();
   this.exchange=exchange;this.raw({type:"rotate",hello:exchange.handshake.hello});
  }catch{this.close();}finally{this.preparingRotation=false;}
 }
 /** Authenticated liveness only: raw ping/hello traffic cannot extend it. */
 poll():void {
  if(this.closed)return;
  try {
   this.alive();const now=this.now();
   if(this.ready&&!this.rotating&&now-this.pingAt>=20000){this.pingAt=now;void this.enqueue("control",new Uint8Array([1])).catch(()=>{});}
  }catch{this.close();}
 }
 close():void {
  if(this.closed)return;this.closed=true;clearInterval(this.timer);
  this.session?.close();this.exchange?.handshake.close();this.session=undefined;this.exchange=undefined;this.peerHello=undefined;
  for(const item of this.queue){item.bytes.fill(0);item.reject(failure());}this.queue=[];this.queuedBytes=0;
  this.options.onClose();
 }
}
