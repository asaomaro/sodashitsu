import {constants} from "node:fs";
import {lstat,mkdir,mkdtemp,open,rename,rm} from "node:fs/promises";
import type {Stats} from "node:fs";
import {join,dirname,resolve} from "node:path";
import {checkDesktopWindowsPath,commitDesktopWindowsVault} from "./DesktopEndpointAcl.node.js";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {DesktopEndpointIdentity} from "./DesktopE2e.js";
import {desktopSecretProtector,type DesktopSecretProtector} from "./DesktopEndpointProtector.node.js";
const Fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const Role=z.enum(["viewer","agent"]);
export const DesktopTrustedPeer=z.object({fingerprint:Fingerprint,role:Role,label:z.string().trim().min(1).max(80)}).strict();
export type DesktopTrustedPeer=z.infer<typeof DesktopTrustedPeer>;
const Vault=z.object({version:z.literal(1),required:z.boolean().default(false),publicKey:z.string().regex(/^04[a-f0-9]{128}$/),secret:z.string().min(1).max(4096).regex(/^[A-Za-z0-9+/]+={0,2}$/),peers:z.array(DesktopTrustedPeer).max(64).refine(peers=>new Set(peers.map(peer=>peer.role+":"+peer.fingerprint)).size===peers.length)}).strict();
const Envelope=z.object({version:z.literal(1),mode:z.enum(["owner-file","dpapi-user"]),data:z.string().min(4).max(90000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).strict();
type Vault=z.infer<typeof Vault>;
const failure=()=>Error("Desktop endpoint key storage is unavailable");
/** Local-owner persistence only. These methods are not exposed through RPC;
 * route integration must enforce the existing local configuration authority. */
export class DesktopEndpointStore {
 readonly directory:string;
 private readonly protector:DesktopSecretProtector;
 private readonly platform:NodeJS.Platform;
 private readonly denied=new Set<string>();
 private readonly revisions=new Map<string,number>();
 private readonly pending=new Set<string>();
 private closed=false;
 private policyRevision=0;
 private queue:Promise<unknown>=Promise.resolve();
 constructor(private options:{stateDir:string;protector?:DesktopSecretProtector;platform?:NodeJS.Platform;checkWindowsPath?:(path:string,allowMissing?:boolean)=>Promise<void>;commitWindowsVault?:(source:string,destination:string)=>Promise<void>;revoke?:(peer:DesktopTrustedPeer)=>void}) {
  this.options={...options,stateDir:resolve(options.stateDir)};this.directory=join(this.options.stateDir,"desktop-endpoint");this.platform=options.platform??process.platform;this.protector=options.protector??desktopSecretProtector(this.platform);
  if(this.platform==="win32"&&this.protector.mode!=="dpapi-user")throw failure();
 }
 private check(stat:Stats,directory:boolean):void {
  if(stat.isSymbolicLink()||!(directory?stat.isDirectory():stat.isFile()))throw failure();
  if(this.platform!=="win32"&&(stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0))throw failure();
 }
 private async pathPolicy(path:string,allowMissing=false):Promise<void> {
  if(this.platform==="win32"){await (this.options.checkWindowsPath??checkDesktopWindowsPath)(path,allowMissing);return;}
  let current=resolve(path);
  if(allowMissing)while(true){try{await lstat(current);break;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw failure();const parent=dirname(current);if(parent===current)throw failure();current=parent;}}
  while(true){
   const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.uid!==process.getuid?.()&&stat.uid!==0))throw failure();
   // A root-owned sticky ancestor (/tmp) cannot replace another user's child.
   if((stat.mode&0o022)!==0&&!(stat.uid===0&&(stat.mode&0o1000)!==0))throw failure();
   const parent=dirname(current);if(parent===current)break;current=parent;
  }
 }
 private async syncDirectory(path:string):Promise<void> {
  if(this.platform==="win32")return;const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await handle.sync();}finally{await handle.close();}
 }
 private async directoryExists():Promise<boolean> {
  try{this.check(await lstat(this.directory),true);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw failure();}
 }
 /** Read-only: validates ancestors even when the requested directory is absent. */
 async directoryAvailable():Promise<boolean> {
  if(this.closed)throw failure();await this.pathPolicy(this.options.stateDir,true);
  try{await this.stateRoot();return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}
 }
 private async stateRoot():Promise<void> {
  const parent=await lstat(this.options.stateDir);if(!parent.isDirectory()||parent.isSymbolicLink()||this.platform!=="win32"&&(parent.uid!==process.getuid?.()||(parent.mode&0o022)!==0))throw failure();
 }
 /** Explicit initialization only. Never changes existing permissions. */
 prepareDirectory():Promise<void> {
  const run=this.queue.then(async()=>{
   if(this.closed)throw failure();await this.pathPolicy(this.options.stateDir,true);
   const missing:string[]=[];let current=this.options.stateDir;
   while(true){try{const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw failure();break;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;missing.push(current);const parent=dirname(current);if(parent===current)throw failure();current=parent;}}
   await this.pathPolicy(current);
   for(const path of missing.reverse()){
    if(this.closed)throw failure();await this.pathPolicy(dirname(path));
    try{await mkdir(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw failure();}
    await this.pathPolicy(path);const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||this.platform!=="win32"&&(stat.uid!==process.getuid?.()||(stat.mode&0o022)!==0))throw failure();
   }
   await this.stateRoot();
  });this.queue=run.catch(()=>undefined);return run;
 }
 close():void{this.closed=true;}
 /** Owner must await authorized in-flight persistence before StateDirLock release. */
 async settled():Promise<void>{await this.queue;}
 private async load(ownedWrite=false):Promise<Vault|undefined> {
  if(this.closed)throw failure();
  await this.pathPolicy(this.options.stateDir);if(!await this.directoryExists())return;
  if(this.platform==="win32")await this.pathPolicy(this.directory);
  if(!ownedWrite)await this.noWriter();
  const file=join(this.directory,"identity.json");let stat:Stats;
  try{stat=await lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw failure();}this.check(stat,false);if(this.platform==="win32")await this.pathPolicy(file);if(stat.size>131072)throw failure();
  const handle=await open(file,constants.O_RDONLY|(this.platform!=="win32"?constants.O_NOFOLLOW:0));let clear:Uint8Array|undefined;
  try {
   const actual=await handle.stat();this.check(actual,false);if(actual.ino!==stat.ino||actual.dev!==stat.dev||actual.size>131072)throw failure();
   const envelope=Envelope.parse(JSON.parse(await handle.readFile("utf8")));if(envelope.mode!==this.protector.mode)throw failure();
   const encoded=Buffer.from(envelope.data,"base64");try{clear=new Uint8Array(await this.protector.unprotect(encoded));}finally{encoded.fill(0);}if(clear.length>65536)throw failure();const vault=Vault.parse(JSON.parse(new TextDecoder().decode(clear)));if(!ownedWrite)await this.noWriter();return vault;
  }catch{throw failure();}finally{clear?.fill(0);await handle.close();}
 }
 private async noWriter():Promise<void> {
  try{await lstat(join(this.directory,"write.lock"));}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw failure();}throw Error("Desktop endpoint key storage is busy");
 }
 private async identity(data:Vault):Promise<DesktopEndpointIdentity> {
  const secret=Buffer.from(data.secret,"base64");try{return await DesktopEndpointIdentity.restore(crypto,secret,data.publicKey);}catch{throw failure();}finally{secret.fill(0);}
 }
 async status():Promise<{initialized:false;required?:true}|{initialized:true;required:boolean;fingerprint:string;peers:DesktopTrustedPeer[]}> {
  const data=await this.load(),marker=await this.readMarker();if(!data)return marker?{initialized:false,required:true}:{initialized:false};const identity=await this.identity(data);return {initialized:true,required:data.required||marker,fingerprint:await identity.fingerprint(),peers:data.peers.filter(peer=>!this.denied.has(peer.role+":"+peer.fingerprint)).map(peer=>({...peer}))};
 }
 private async readMarker():Promise<boolean> {
  await this.pathPolicy(this.options.stateDir);const path=join(this.options.stateDir,"desktop-endpoint-required.json");
  let stat:Stats;try{stat=await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw failure();}
  this.check(stat,false);if(stat.size>256)throw failure();if(this.platform==="win32")await this.pathPolicy(path);
  const handle=await open(path,constants.O_RDONLY|(this.platform!=="win32"?constants.O_NOFOLLOW:0));
  try{const actual=await handle.stat();this.check(actual,false);if(actual.ino!==stat.ino||actual.dev!==stat.dev||actual.size>256)throw failure();return z.object({version:z.literal(1),required:z.boolean()}).strict().parse(JSON.parse(await handle.readFile("utf8"))).required;}catch{throw failure();}finally{await handle.close();}
 }
 private async writeMarker(required:boolean):Promise<void> {
  await this.pathPolicy(this.options.stateDir);const stage=await mkdtemp(join(this.directory,".policy-")),temp=join(stage,"required.json"),destination=join(this.options.stateDir,"desktop-endpoint-required.json");
  try {
   const handle=await open(temp,"wx",0o600);try{await handle.writeFile(JSON.stringify({version:1,required}));await handle.sync();}finally{await handle.close();}
   if(this.platform==="win32")await (this.options.commitWindowsVault??commitDesktopWindowsVault)(temp,destination);else await rename(temp,destination);
   await this.syncDirectory(this.options.stateDir);if(this.platform==="win32")await this.pathPolicy(destination);
  }finally{await rm(stage,{recursive:true,force:true});}
 }
 /** Node-local key access only; never expose through RPC or serialize the result.
  * One owner must close before releasing its process lock. active() does not
  * watch modifications made by another store/process; callers bind their epoch. */
 async localIdentity():Promise<{identity:DesktopEndpointIdentity;active():boolean}> {
  const policy=this.policyRevision,data=await this.load();if(!data)throw failure();
  const identity=await this.identity(data),latest=await this.load();
  if(this.closed||policy!==this.policyRevision||!latest||latest.publicKey!==data.publicKey||latest.secret!==data.secret)throw failure();
  return {identity,active:()=>!this.closed&&policy===this.policyRevision};
 }
 /** Permit remains bound to this owner instance. Its consumer must also bind
  * active() to the source/process epoch and check it after asynchronous work. */
 async endpoint(peerFingerprint:string,role:z.infer<typeof Role>):Promise<{identity:DesktopEndpointIdentity;active():boolean}> {
  Fingerprint.parse(peerFingerprint);Role.parse(role);const policy=this.policyRevision,key=role+":"+peerFingerprint,revision=this.revisions.get(key)??0,data=await this.load();if(!data||this.denied.has(key)||this.pending.has(key)||!data.peers.some(peer=>peer.role===role&&peer.fingerprint===peerFingerprint))throw Error("Desktop endpoint peer is not trusted");
  const identity=await this.identity(data),latest=await this.load();
  if(this.closed||policy!==this.policyRevision||this.denied.has(key)||this.pending.has(key)||(this.revisions.get(key)??0)!==revision||!latest||latest.publicKey!==data.publicKey||latest.secret!==data.secret||!latest.peers.some(peer=>peer.role===role&&peer.fingerprint===peerFingerprint))throw Error("Desktop endpoint peer is not trusted");return {identity,active:()=>!this.closed&&policy===this.policyRevision&&!this.denied.has(key)&&!this.pending.has(key)&&(this.revisions.get(key)??0)===revision};
 }
 initialize():Promise<{fingerprint:string}> {return this.mutate(async data=>{
  if(data)return {data,result:{fingerprint:await (await this.identity(data)).fingerprint()}};
  let secret="";const identity=await DesktopEndpointIdentity.create(crypto,async value=>{secret=Buffer.from(value).toString("base64");});const created:Vault={version:1,required:false,publicKey:identity.publicKey,secret,peers:[]};return {data:created,result:{fingerprint:await identity.fingerprint()}};
 });}
 /** A policy change also invalidates every issued/pending endpoint permit. */
 setRequired(required:boolean):Promise<void> {
  z.boolean().parse(required);this.policyRevision++;
  return this.mutate(async data=>{if(!data)throw failure();await this.identity(data);if(required)await this.writeMarker(true);return {data:{...data,required},result:undefined,...(!required?{committed:()=>this.writeMarker(false)}:{})};});
 }
 trust(raw:DesktopTrustedPeer):Promise<void> {
  const peer=DesktopTrustedPeer.parse(raw),key=peer.role+":"+peer.fingerprint,revision=(this.revisions.get(key)??0)+1;this.revisions.set(key,revision);this.pending.add(key);return this.mutate(async data=>{if(!data)throw failure();await this.identity(data);const peers=data.peers.filter(value=>value.fingerprint!==peer.fingerprint||value.role!==peer.role);if(peers.length>=64)throw failure();return {data:{...data,peers:[...peers,peer]},result:undefined,committed:()=>{if(this.revisions.get(key)===revision){this.denied.delete(key);this.pending.delete(key);}}};});
 }
 revoke(fingerprint:string,role:z.infer<typeof Role>):Promise<void> {
  Fingerprint.parse(fingerprint);Role.parse(role);const key=role+":"+fingerprint;this.revisions.set(key,(this.revisions.get(key)??0)+1);this.denied.add(key);this.pending.delete(key);let hookFailed=false;try{this.options.revoke?.({fingerprint,role,label:"revoked"});}catch{hookFailed=true;}
  return this.mutate(async data=>{if(!data)throw failure();return {data:{...data,peers:data.peers.filter(peer=>peer.fingerprint!==fingerprint||peer.role!==role)},result:undefined};}).then(()=>{if(hookFailed)throw Error("Desktop peer was revoked; active-session cleanup failed");});
 }
 private mutate<T>(change:(data:Vault|undefined)=>Promise<{data:Vault;result:T;committed?:()=>void|Promise<void>}>):Promise<T> {
  const run=this.queue.then(async()=>{
   if(this.closed)throw failure();
   await this.pathPolicy(this.options.stateDir);await this.stateRoot();
   try{await mkdir(this.directory,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw failure();}if(!await this.directoryExists())throw failure();await this.syncDirectory(this.options.stateDir);if(this.platform==="win32")await this.pathPolicy(this.directory);
   const lock=join(this.directory,"write.lock"),nonce=randomUUID();let lease;
   try{lease=await open(lock,"wx",0o600);}catch{throw Error("Desktop endpoint key storage is busy");}
   let stage:string|undefined,updated:{data:Vault;result:T;committed?:()=>void|Promise<void>}|undefined;
   try {
    await lease.writeFile(nonce);await lease.sync();updated=await change(await this.load(true));Vault.parse(updated.data);
    const clear=new TextEncoder().encode(JSON.stringify(updated.data));let protectedBytes:Uint8Array;
    try{protectedBytes=await this.protector.protect(clear);}finally{clear.fill(0);}
    try {
     stage=await mkdtemp(join(this.directory,".write-"));const temp=join(stage,"identity.json"),file=await open(temp,"wx",0o600);
     try{await file.writeFile(JSON.stringify({version:1,mode:this.protector.mode,data:Buffer.from(protectedBytes).toString("base64")}));await file.sync();}finally{await file.close();}
     if(this.platform==="win32")await (this.options.commitWindowsVault??commitDesktopWindowsVault)(temp,join(this.directory,"identity.json"));else await rename(temp,join(this.directory,"identity.json"));await this.syncDirectory(this.directory);if(this.platform==="win32")await this.pathPolicy(join(this.directory,"identity.json"));
    }finally{protectedBytes.fill(0);}
   }finally {
    try{if(stage)await rm(stage,{recursive:true,force:true});}finally{const ours=await lease.stat();await lease.close();try{const current=await lstat(lock);if(current.ino===ours.ino&&current.dev===ours.dev){await rm(lock);await this.syncDirectory(this.directory);}}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw failure();}}
   }
   if(!updated)throw failure();await updated.committed?.();return updated.result;
  });this.queue=run.catch(()=>undefined);return run;
 }
}
