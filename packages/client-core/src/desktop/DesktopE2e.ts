/** Endpoint-only primitives. Crypto is injected; this module has no I/O, storage,
 * implicit peer trust or production-route activation. */
type CryptoProvider = typeof globalThis.crypto;
type Key = Awaited<ReturnType<CryptoProvider["subtle"]["importKey"]>>;
export const DESKTOP_E2E_VERSION = "soda-desktop-e2e-v1";
export const DESKTOP_E2E_LANES = ["control","image","video","cursor","audio","microphone","clipboard","files","agent"] as const;
export type DesktopE2eLane = typeof DESKTOP_E2E_LANES[number];
export type DesktopE2eRole = "provider"|"viewer"|"agent";
export type DesktopE2eHello = Readonly<{version:typeof DESKTOP_E2E_VERSION;generation:number;session:string;role:DesktopE2eRole;identity:string;ephemeral:string;nonce:string}>;
const roles = ["provider","viewer","agent"] as const;
const sessionPermit={};
const MAX_PACKET = 4*1024*1024, HEADER = 46, MAX_RECORDS = 1048576, MAX_BYTES = 1024*1024*1024;
const fail = ():never => {throw Error("Desktop endpoint authentication failed");};
const text = (value:unknown) => new TextEncoder().encode(JSON.stringify(value));
const owned = (value:Uint8Array):ArrayBuffer => new Uint8Array(value).buffer;
const hex = (value:ArrayBuffer|Uint8Array) => Array.from(value instanceof Uint8Array?value:new Uint8Array(value),byte=>byte.toString(16).padStart(2,"0")).join("");
function bytes(value:string,length:number):Uint8Array<ArrayBuffer> {
 if(typeof value!=="string"||value.length!==length*2||!/^[a-f0-9]+$/.test(value))return fail();
 return Uint8Array.from(value.match(/../g)!,value=>parseInt(value,16));
}
function validate(raw:DesktopE2eHello):DesktopE2eHello {
 if(!raw||typeof raw!=="object"||Object.keys(raw).sort().join(",")!=="ephemeral,generation,identity,nonce,role,session,version"||raw.version!==DESKTOP_E2E_VERSION||!Number.isInteger(raw.generation)||raw.generation<1||raw.generation>0xffffffff||!roles.includes(raw.role)||!/^[-a-f0-9]{36}$/.test(raw.session)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(raw.session))return fail();
 if(bytes(raw.identity,65)[0]!==4||bytes(raw.ephemeral,65)[0]!==4)return fail();bytes(raw.nonce,32);
 return Object.freeze({...raw});
}
const tuple = (value:DesktopE2eHello) => [value.version,value.generation,value.session,value.role,value.identity,value.ephemeral,value.nonce];
function transcript(own:DesktopE2eHello,peer:DesktopE2eHello):Uint8Array<ArrayBuffer> {
 if(own.generation!==peer.generation||own.session!==peer.session||own.role===peer.role||(own.role!=="provider"&&peer.role!=="provider"))return fail();
 return text([DESKTOP_E2E_VERSION,"P256-ECDSA-ECDH-HKDF-SHA256-AES256GCM",...([own,peer].sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role)).map(tuple))]);
}
export class DesktopEndpointIdentity {
 #key:Key;
 private constructor(private crypto:CryptoProvider,key:Key,readonly publicKey:string){this.#key=key;}
 static async createStored(crypto:CryptoProvider,persist:(privateKey:Key,publicKey:string)=>Promise<void>):Promise<DesktopEndpointIdentity> {
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);if(!("privateKey" in pair))return fail();
  const publicKey=hex(await crypto.subtle.exportKey("raw",pair.publicKey)),identity=await this.fromStoredKey(crypto,pair.privateKey,publicKey);
  await persist(pair.privateKey,publicKey);return identity;
 }
 static async create(crypto:CryptoProvider,persist?:(privateKey:Uint8Array,publicKey:string)=>Promise<void>):Promise<DesktopEndpointIdentity> {
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  if(!("privateKey" in pair))return fail();
  const publicKey=hex(await crypto.subtle.exportKey("raw",pair.publicKey)),secret=new Uint8Array(await crypto.subtle.exportKey("pkcs8",pair.privateKey));
  try {if(persist)await persist(secret,publicKey);return await this.restore(crypto,secret,publicKey);}finally{secret.fill(0);}
 }
 static async restore(crypto:CryptoProvider,secret:Uint8Array,publicKey:string):Promise<DesktopEndpointIdentity> {
  if(!secret.length||secret.length>4096)return fail();
  try {
   const key=await crypto.subtle.importKey("pkcs8",owned(secret),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
   return await this.fromStoredKey(crypto,key,publicKey);
  }catch{return fail();}
 }
 /** Restore a structured-cloned IndexedDB key without exporting its secret. */
 static async fromStoredKey(crypto:CryptoProvider,key:Key,publicKey:string):Promise<DesktopEndpointIdentity> {
  try {
   const algorithm=key.algorithm as {name?:string;namedCurve?:string};
   if(key.type!=="private"||key.extractable||key.usages.length!==1||key.usages[0]!=="sign"||algorithm.name!=="ECDSA"||algorithm.namedCurve!=="P-256")return fail();
   const pub=await crypto.subtle.importKey("raw",owned(bytes(publicKey,65)),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]),challenge=crypto.getRandomValues(new Uint8Array(32));
   const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,challenge);
   if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},pub,signature,challenge))return fail();
   return new DesktopEndpointIdentity(crypto,key,publicKey);
  }catch{return fail();}
 }
 async fingerprint():Promise<string>{return hex(await this.crypto.subtle.digest("SHA-256",owned(bytes(this.publicKey,65))));}
 async sign(message:Uint8Array):Promise<string>{return hex(await this.crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},this.#key,owned(message)));}
}

export class DesktopEndpointHandshake {
 #ephemeral:Key|undefined;
 #consumed=false;#cancelled=false;#session:DesktopEndpointSession|undefined;
 private constructor(private crypto:CryptoProvider,private identity:DesktopEndpointIdentity,private expectedFingerprint:string,private expectedRole:DesktopE2eRole,ephemeral:Key,readonly hello:DesktopE2eHello,private generation:number){this.#ephemeral=ephemeral;}
 static async create(crypto:CryptoProvider,identity:DesktopEndpointIdentity,options:{session:string;role:DesktopE2eRole;expectedFingerprint:string;peerRole:DesktopE2eRole;generation:number}):Promise<DesktopEndpointHandshake> {
  bytes(options.expectedFingerprint,32);if(!Number.isInteger(options.generation)||options.generation<1||options.generation>0xffffffff)return fail();
  const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);if(!("privateKey" in pair))return fail();
  const hello=validate({version:DESKTOP_E2E_VERSION,generation:options.generation,session:options.session,role:options.role,identity:identity.publicKey,ephemeral:hex(await crypto.subtle.exportKey("raw",pair.publicKey)),nonce:hex(crypto.getRandomValues(new Uint8Array(32)))});
  return new DesktopEndpointHandshake(crypto,identity,options.expectedFingerprint,options.peerRole,pair.privateKey,hello,options.generation);
 }
 async proof(raw:DesktopE2eHello):Promise<string>{if(this.#consumed||this.#cancelled)return fail();const result=await this.identity.sign(transcript(this.hello,validate(raw)));if(this.#cancelled)return fail();return result;}
 close():void{this.#cancelled=true;this.#ephemeral=undefined;this.#session?.close();}
 async finish(raw:DesktopE2eHello,proof:string):Promise<DesktopEndpointSession> {
  if(this.#consumed||this.#cancelled)return fail();this.#consumed=true;
  try {
   const peer=validate(raw);if(peer.role!==this.expectedRole)return fail();const message=transcript(this.hello,peer);
   if(hex(await this.crypto.subtle.digest("SHA-256",owned(bytes(peer.identity,65))))!==this.expectedFingerprint)return fail();
   const publicKey=await this.crypto.subtle.importKey("raw",owned(bytes(peer.identity,65)),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
   if(!await this.crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},publicKey,owned(bytes(proof,64)),owned(message)))return fail();
   if(this.#cancelled||!this.#ephemeral)return fail();
   const remote=await this.crypto.subtle.importKey("raw",owned(bytes(peer.ephemeral,65)),{name:"ECDH",namedCurve:"P-256"},false,[]),shared=new Uint8Array(await this.crypto.subtle.deriveBits({name:"ECDH",public:remote},this.#ephemeral,256));
   try {
    this.#ephemeral=undefined;if(this.#cancelled)return fail();
    const root=await this.crypto.subtle.importKey("raw",owned(shared),"HKDF",false,["deriveKey"]),salt=new Uint8Array(await this.crypto.subtle.digest("SHA-256",owned(message)));
    if(this.#cancelled)return fail();this.#session=DesktopEndpointSession.establish(sessionPermit,this.crypto,root,salt,this.hello.role,peer.role,this.generation);return this.#session;
   }finally{shared.fill(0);}
  }catch{return fail();}
 }
}

/** A maximum-64-record replay window. Authentication must succeed BEFORE accept. */
export class DesktopReplayWindow {
 private top=0;private bits=0n;
 get latest():number{return this.top;}
 accepts(seq:number):boolean{return Number.isInteger(seq)&&seq>0&&seq<=MAX_RECORDS&&(seq>this.top||(this.top-seq<64&&(this.bits&(1n<<BigInt(this.top-seq)))===0n));}
 accept(seq:number):boolean {
  if(!this.accepts(seq))return false;
  if(seq>this.top){this.bits=seq-this.top>=64?1n:((this.bits<<BigInt(seq-this.top))|1n)&((1n<<64n)-1n);this.top=seq;}
  else this.bits|=1n<<BigInt(this.top-seq);
  return true;
 }
}
type LaneState={sent:number;sentBytes:number;receivedBytes:number;pending:number;tail:Promise<void>;receiveTail:Promise<void>;opening:Set<number>;replay:DesktopReplayWindow};
export class DesktopEndpointSession {
 #closed=false;#receiving=0;#receiveBytes=0;#root:Key|undefined;#keys=new Map<string,Promise<Key>>();#lanes=new Map<DesktopE2eLane,LaneState>();
 private constructor(private crypto:CryptoProvider,root:Key,private salt:Uint8Array<ArrayBuffer>,readonly localRole:DesktopE2eRole,readonly peerRole:DesktopE2eRole,readonly generation:number){this.#root=root;}
 /** Internal factory receives only non-extractable endpoint key material. */
 static establish(permit:object,crypto:CryptoProvider,root:Key,salt:Uint8Array<ArrayBuffer>,local:DesktopE2eRole,peer:DesktopE2eRole,generation:number):DesktopEndpointSession{if(permit!==sessionPermit)return fail();return new this(crypto,root,salt.slice(),local,peer,generation);}
 private state(lane:DesktopE2eLane):LaneState {
  if(this.#closed||!DESKTOP_E2E_LANES.includes(lane))return fail();
  let state=this.#lanes.get(lane);if(!state){state={sent:0,sentBytes:0,receivedBytes:0,pending:0,tail:Promise.resolve(),receiveTail:Promise.resolve(),opening:new Set(),replay:new DesktopReplayWindow()};this.#lanes.set(lane,state);}return state;
 }
 private key(lane:DesktopE2eLane,sender:DesktopE2eRole):Promise<Key> {
  if(this.#closed||!this.#root)return fail();
  const id=lane+":"+sender;let key=this.#keys.get(id);
  if(!key){key=this.crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:owned(this.salt),info:owned(text([DESKTOP_E2E_VERSION,lane,sender,this.generation]))},this.#root,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);this.#keys.set(id,key);}return key;
 }
 private iv(seq:number):Uint8Array<ArrayBuffer>{const iv=new Uint8Array(12),view=new DataView(iv.buffer);view.setUint32(0,this.generation);view.setUint32(8,seq);return iv;}
 async seal(lane:DesktopE2eLane,plaintext:Uint8Array):Promise<Uint8Array<ArrayBuffer>> {
  const state=this.state(lane);if(plaintext.length>MAX_PACKET-HEADER-16||state.pending>=4||state.sent>=MAX_RECORDS||state.sentBytes+plaintext.length>MAX_BYTES)return fail();
  const copy=new Uint8Array(plaintext),seq=++state.sent,previous=state.tail;state.pending++;state.sentBytes+=copy.length;let release!:()=>void;state.tail=new Promise<void>(resolve=>{release=resolve;});
  const header=new Uint8Array(HEADER),view=new DataView(header.buffer);header.set([83,68,69,49,roles.indexOf(this.localRole),DESKTOP_E2E_LANES.indexOf(lane)]);view.setUint32(6,this.generation);view.setUint32(10,seq);header.set(this.salt,14);
  try {
   await previous;if(this.#closed)return fail();
   const key=await this.key(lane,this.localRole);if(this.#closed)return fail();const encrypted=new Uint8Array(await this.crypto.subtle.encrypt({name:"AES-GCM",iv:this.iv(seq),additionalData:header,tagLength:128},key,copy));
   if(this.#closed){encrypted.fill(0);return fail();}const packet=new Uint8Array(header.length+encrypted.length);packet.set(header);packet.set(encrypted,header.length);return packet;
  }catch{this.close();return fail();}finally{copy.fill(0);state.pending--;release();}
 }
 async open(lane:DesktopE2eLane,raw:Uint8Array):Promise<Uint8Array<ArrayBuffer>> {
  const state=this.state(lane);if(raw.length<HEADER+16||raw.length>MAX_PACKET||this.#receiving>=8||this.#receiveBytes+raw.length>16*1024*1024)return fail();
  // Inspect only the fixed header before bounded admission. A repeated pending
  // counter never allocates a payload copy or starts another decrypt.
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),seq=view.getUint32(10);
  if(state.opening.has(seq)||!state.replay.accepts(seq))return fail();
  state.opening.add(seq);this.#receiving++;this.#receiveBytes+=raw.length;
  const previous=this.ordered(lane)?state.receiveTail:Promise.resolve();let release!:()=>void;
  if(this.ordered(lane))state.receiveTail=new Promise<void>(resolve=>{release=resolve;});else release=()=>{};
  const packet=new Uint8Array(raw);
  try {await previous;return await this.decrypt(lane,packet,seq,state);}
  finally{state.opening.delete(seq);this.#receiving--;this.#receiveBytes-=packet.length;release();}
 }
 private async decrypt(lane:DesktopE2eLane,packet:Uint8Array<ArrayBuffer>,reserved:number,state:LaneState):Promise<Uint8Array<ArrayBuffer>> {
  if(this.#closed)return fail();
  const header=packet.subarray(0,HEADER),view=new DataView(packet.buffer),seq=view.getUint32(10),size=packet.length-HEADER-16;
  if(seq!==reserved||header[0]!==83||header[1]!==68||header[2]!==69||header[3]!==49||header[4]!==roles.indexOf(this.peerRole)||header[5]!==DESKTOP_E2E_LANES.indexOf(lane)||view.getUint32(6)!==this.generation||header.subarray(14).some((value,index)=>value!==this.salt[index])||!state.replay.accepts(seq)||this.ordered(lane)&&seq!==state.replay.latest+1||state.receivedBytes+size>MAX_BYTES)return fail();
  let plaintext:Uint8Array<ArrayBuffer>;
  try {const key=await this.key(lane,this.peerRole);if(this.#closed)return fail();plaintext=new Uint8Array(await this.crypto.subtle.decrypt({name:"AES-GCM",iv:this.iv(seq),additionalData:header,tagLength:128},key,packet.subarray(HEADER)));}catch{return fail();}
  if(this.#closed||this.ordered(lane)&&seq!==state.replay.latest+1||state.receivedBytes+size>MAX_BYTES||!state.replay.accept(seq)){plaintext.fill(0);return fail();}state.receivedBytes+=plaintext.length;return plaintext;
 }
 private ordered(lane:DesktopE2eLane):boolean{return lane!=="video"&&lane!=="cursor"&&lane!=="audio";}
 close():void {this.#closed=true;this.#root=undefined;this.#keys.clear();this.#lanes.clear();this.salt.fill(0);}
}
