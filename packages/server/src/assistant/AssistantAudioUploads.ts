import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type { Stats } from "node:fs";
import { AssistantAudioBeginParams,AssistantAudioChunkParams,AssistantAudioIdParams,RpcError } from "@sodashitsu/protocol";
import { sendCodexAudio } from "./CodexAudio.js";

interface Target {threadId:string;projectDir:string;paneId:string;instanceId:string}
interface Upload {
 id:string;owner:string;target:Target;prove:()=>Target;mime:string;size:number;received:number;chunks:Buffer[];
 expires:number;controller:AbortController;timer:ReturnType<typeof setTimeout>;running:Promise<unknown>|null;
}
interface Options {send?:typeof sendCodexAudio;now?:()=>number;files?:{lstat:(path:string)=>Promise<Stats>;unlink:(path:string)=>Promise<void>}}
interface Stored {path:string;dev:number;ino:number;expires:number;timer:ReturnType<typeof setTimeout>|null}
const EXT:Record<string,string>={"audio/wav":"wav","audio/mpeg":"mp3","audio/mp4":"m4a","audio/ogg":"ogg","audio/flac":"flac","audio/webm":"webm"};
const FILE=/^[a-f0-9-]{36}\.(wav|mp3|m4a|ogg|flac|webm)$/;
const RETAIN_MS=5*60*1000;

/** One upload per authenticated connection, two in the server, 25MiB each.
 * No timer, file, model or child is allocated until an explicit begin/commit.
 */
export class AssistantAudioUploads {
 private readonly uploads=new Map<string,Upload>();
 private readonly owned=new Set<ChildProcess>();
 private readonly pending=new Set<Promise<unknown>>();
 private readonly retained=new Map<string,Stored>();
 private readonly deleting=new Set<Promise<void>>();
 private saving:Promise<unknown>=Promise.resolve();
 private closed=false;
 private readonly directory:string;
 constructor(stateDir:string,private readonly options:Options={}){this.directory=join(stateDir,"assistant-audio");}
 private now():number{return this.options.now?.()??performance.now();}
 begin(owner:string,raw:unknown,prove:()=>Target):{uploadId:string} {
  const input=AssistantAudioBeginParams.parse(raw);
  const expires=this.now()+input.ttlMs;
  const available=()=>{if(this.closed || this.uploads.size>=2 || this.owned.size>=2 || [...this.uploads.values()].some(u=>u.owner===owner))throw new RpcError("agent_pane_busy","前の音声処理の終了を待ってください");};
  available();
  const target={...prove()},id=randomUUID(),controller=new AbortController();
  available();
  if(this.now()>=expires)throw new RpcError("agent_pane_busy","音声の送信期限が切れました");
  const timer=setTimeout(()=>this.cancel(owner,{uploadId:id}),Math.max(1,expires-this.now()));timer.unref();
  const upload:Upload={id,owner,target,prove,mime:input.mime,size:input.size,received:0,chunks:[],expires,controller,timer,running:null};
  this.uploads.set(id,upload);return{uploadId:id};
 }
 private get(owner:string,id:string):Upload {
  const u=this.uploads.get(id);if(!u || u.owner!==owner)throw new RpcError("not_found","音声の送信対象が見つかりません");return u;
 }
 private live(u:Upload):void {
  const check=()=>{u.controller.signal.throwIfAborted();if(this.closed || this.now()>=u.expires)throw new RpcError("agent_pane_busy","音声の送信期限が切れました");};
  check();const current=u.prove();check();
  if(current.paneId!==u.target.paneId || current.instanceId!==u.target.instanceId || current.threadId!==u.target.threadId || current.projectDir!==u.target.projectDir)throw new RpcError("agent_not_found","音声の送信先が変更されました");
 }
 chunk(owner:string,raw:unknown):void {
  const p=AssistantAudioChunkParams.parse(raw),u=this.get(owner,p.uploadId);this.live(u);
  const bytes=Buffer.from(p.data,"base64");
  if(u.running || bytes.toString("base64")!==p.data || p.offset!==u.received || u.received+bytes.length>u.size)throw new RpcError("invalid_params","音声データの順序・容量を確認してください");
  u.chunks.push(bytes);u.received+=bytes.length;
 }
 cancel(owner:string,raw:unknown):void {
  const p=AssistantAudioIdParams.parse(raw),u=this.uploads.get(p.uploadId);
  if(!u || u.owner!==owner)return;u.controller.abort();if(!u.running)this.release(u);
 }
 onClientGone(owner:string):void{for(const u of this.uploads.values())if(u.owner===owner)this.cancel(owner,{uploadId:u.id});}
 private release(u:Upload):void{clearTimeout(u.timer);for(const chunk of u.chunks)chunk.fill(0);u.chunks=[];if(this.uploads.get(u.id)===u)this.uploads.delete(u.id);}
 commit(owner:string,raw:unknown):Promise<{sent:true;turnId:string}> {
  const p=AssistantAudioIdParams.parse(raw),u=this.get(owner,p.uploadId);this.live(u);
  if(u.running || u.received!==u.size)throw new RpcError("invalid_params","音声データが揃っていません");
  // Defer work by one microtask so cancellation always sees the physical in-flight slot.
  const running=Promise.resolve().then(()=>this.send(u));u.running=running;this.pending.add(running);
  void running.then(()=>this.pending.delete(running),()=>this.pending.delete(running));return running;
 }
 private async remove(stored:Stored):Promise<void> {
  const files=this.options.files??{lstat,unlink};
  try {
   const info=await files.lstat(stored.path);
   if(info.isFile()&&!info.isSymbolicLink()&&info.dev===stored.dev&&info.ino===stored.ino)await files.unlink(stored.path);
  } catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
  if(this.retained.get(stored.path)===stored)this.retained.delete(stored.path);
 }
 private arm(stored:Stored):void {
  if(this.closed || stored.timer)return;
  stored.timer=setTimeout(()=>{
   stored.timer=null;if(this.closed)return;
   const task=this.remove(stored).catch(()=>{});this.deleting.add(task);
   void task.finally(()=>this.deleting.delete(task));
  },Math.max(1,stored.expires-Date.now()));stored.timer.unref();
 }
 private async sweep(incoming:number):Promise<void> {
  let names:string[];try{names=await readdir(this.directory);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
  if(names.length>128)throw new RpcError("agent_pane_busy","音声の一時保存領域を確認してください");
  let total=0,count=0;
  for(const name of names) {
   if(!FILE.test(name))continue;const path=join(this.directory,name);
   let info;try{info=await (this.options.files?.lstat??lstat)(path);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")continue;throw error;}
   if(!info.isFile() || info.isSymbolicLink())throw new RpcError("agent_pane_busy","音声の一時保存ファイルを確認してください");
   if(Date.now()-info.mtimeMs>=RETAIN_MS){await this.remove({path,dev:info.dev,ino:info.ino,expires:0,timer:null});continue;}
   total+=info.size;++count;
  }
  if(count+1>64 || total+incoming>200*1024*1024)throw new RpcError("agent_pane_busy","音声の一時保存の期限が切れるまで待ってください");
 }
 private async store(u:Upload):Promise<Stored> {
  this.live(u);await this.sweep(u.size);this.live(u);
  await mkdir(this.directory,{recursive:true,mode:0o700});this.live(u);
  const path=join(this.directory,`${u.id}.${EXT[u.mime]}`),file=await open(path,"wx",0o600);
  let saved:Stored|null=null,complete=false;
  try {
   const identity=await file.stat();saved={path,dev:identity.dev,ino:identity.ino,expires:Date.now()+RETAIN_MS,timer:null};
   this.live(u);
   for(const chunk of u.chunks){let used=0;while(used<chunk.length){this.live(u);const result=await file.write(chunk,used,chunk.length-used);if(!result.bytesWritten)throw Error("音声を保存できません");used+=result.bytesWritten;}chunk.fill(0);}
   const after=await file.stat();if(after.size!==u.size)throw Error("保存した音声の容量が一致しません");
   saved.expires=after.mtimeMs+RETAIN_MS;complete=true;return saved;
  } finally {await file.close();if(!complete&&saved)await this.remove(saved);}
 }
 private async send(u:Upload):Promise<{sent:true;turnId:string}> {
  let saved:Stored|null=null,attempted=false;
  try {
   // Admission, file creation and writing share a queue: the next sweep sees this
   // complete file and includes its bytes/count before admitting another upload.
   const saving=this.saving.then(()=>this.store(u));this.saving=saving.then(()=>{},()=>{});
   saved=await saving;
   this.live(u);attempted=true;
   const result=await (this.options.send??sendCodexAudio)({...u.target,path:saved.path},u.controller.signal,u.expires,()=>this.live(u),{owned:this.owned});
   return{sent:true,...result};
  } finally {
   try {if(saved) {
    if(attempted) {
     // Keep uncertain/acknowledged submissions briefly: Codex may still be opening the file.
     this.retained.set(saved.path,saved);this.arm(saved);
    } else await this.remove(saved);
   }} finally {this.release(u);}
  }
 }
 async suspend():Promise<void> {
  this.closed=true;for(const saved of this.retained.values()){if(saved.timer)clearTimeout(saved.timer);saved.timer=null;}
  for(const u of this.uploads.values())this.cancel(u.owner,{uploadId:u.id});
  await Promise.allSettled([...this.pending]);
  while(this.deleting.size)await Promise.allSettled([...this.deleting]);
  if(this.owned.size)throw Error("音声proxyの終了を確認できません");
 }
 resume():void{this.closed=false;for(const saved of this.retained.values())this.arm(saved);}
 async close():Promise<void>{try{await this.suspend();}finally{this.retained.clear();}}
}
