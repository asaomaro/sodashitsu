import {lstat,realpath} from "node:fs/promises";
import type {BigIntStats} from "node:fs";
import type {SubagentInfo} from "@sodashitsu/protocol";
import {openCodexChildRecord} from "./CodexChildRecord.js";
import {readRange} from "./safeFile.js";
import {CodexChildTurnStream,type CodexTurnObservation} from "./CodexChildTurnStream.js";
const CHILD_BYTES=4*1024*1024,TAIL=256*1024,MAX_FILE=512*1024*1024,MAX_CACHE=64;
type Observation=CodexTurnObservation&{hasTranscript?:boolean};
export interface CodexObservationOwner{paneId:string;instanceId:string;generation:number;epoch?:number;}
interface Entry{
 key:string;scope:string;pane:string;child:string;parent:string;startedAt:number;file:string;revision:BigIntStats;
 primary:CodexChildTurnStream;suffix?:CodexChildTurnStream;baseEOF:number;fastProbed:boolean;initialDone:boolean;reset:boolean;available:boolean;touch:number;
}
const same=(a:BigIntStats,b:BigIntStats)=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>a[k]===b[k]);
/** Scope/file-bound incremental observations. Only metadata and constant-space JSON state are cached. */
export class CodexChildObservationCache{
 private readonly entries=new Map<string,Entry>();
 private readonly owners=new Map<string,{pane:string;cursor:number}>();
 private active=0;
 private queue:Array<{check:()=>boolean;resolve:(release:(()=>void)|undefined)=>void}>=[];
 private closed=false;
 private serial=0;
 private bytes=0;
 progress():{cacheSize:number;bytes:number;offsets:number[];targets:number[];known:number}{return {cacheSize:this.entries.size,bytes:this.bytes,offsets:[...this.entries.values()].map(e=>e.primary.offset),targets:[...this.entries.values()].map(e=>Number(e.revision.size)),known:[...this.entries.values()].filter(e=>this.observation(e).model!==undefined).length};}
 forget(pane:string):void{for(const [key,e]of this.entries)if(e.pane===pane)this.entries.delete(key);for(const[key,o]of this.owners)if(o.pane===pane)this.owners.delete(key);}
 close():void{this.closed=true;this.entries.clear();this.owners.clear();for(const q of this.queue.splice(0))q.resolve(undefined);}
 private acquire(check:()=>boolean):Promise<(()=>void)|undefined>{
  if(!check())return Promise.resolve(undefined);
  if(this.active<4){this.active++;return Promise.resolve(()=>this.release());}
  if(this.queue.length>=64)return Promise.resolve(undefined);
  return new Promise(resolve=>this.queue.push({check,resolve}));
 }
 private release():void{
  this.active--;
  while(this.queue.length){const ticket=this.queue.shift()!;if(!ticket.check()){ticket.resolve(undefined);continue;}this.active++;ticket.resolve(()=>this.release());break;}
 }
 private async slot(check:()=>boolean,work:()=>Promise<void>):Promise<void>{const release=await this.acquire(check);if(!release)return;try{if(check())await work();}finally{release();}}
 private observation(e:Entry):Observation{
  if(!e.available||e.reset)return {};
  const base={hasTranscript:true};
  if(e.primary.invalid||e.suffix?.invalid)return base;
  if(!e.primary.partial&&e.primary.offset===Number(e.revision.size)&&e.initialDone)return {...e.primary.value,...base};
  if(e.suffix?.seenTurn&&!e.suffix.partial&&e.suffix.offset===Number(e.revision.size)&&e.suffix.lastTurnEnd>e.primary.lastTurnEnd)return {...e.suffix.value,...base};
  return base;
 }
 private needs(e:Entry):boolean{return e.reset||!e.fastProbed||!e.initialDone||e.primary.offset<Number(e.revision.size)||e.primary.partial;}
 private evict():boolean{
  if(this.entries.size<MAX_CACHE)return true;
  const candidates=[...this.entries.values()].filter(e=>e.reset||e.primary.invalid||!this.needs(e)).sort((a,b)=>a.touch-b.touch);
  if(!candidates.length)return false;this.entries.delete(candidates[0]!.key);return true;
 }
 private retire(scope:string):void{this.owners.delete(scope);for(const[k,e]of this.entries)if(e.scope===scope)this.entries.delete(k);}
 private async probe(e:Entry,check:()=>boolean):Promise<boolean>{
  const st=await lstat(e.file,{bigint:true}).catch(()=>undefined);
  const path=await realpath(e.file).catch(()=>null);
  if(!check()||this.entries.get(e.key)!==e)return false;
  if(!st||!st.isFile()||st.isSymbolicLink()||st.nlink!==1n||path!==e.file){e.reset=true;e.available=false;return false;}
  if(st.dev!==e.revision.dev||st.ino!==e.revision.ino||st.size<e.revision.size||(st.size===e.revision.size&&!same(st,e.revision))){e.reset=true;e.available=false;return false;}
  e.revision=st;return true;
 }
 async read(home:string,parent:string,items:readonly SubagentInfo[],current:()=>boolean,owner:CodexObservationOwner):Promise<Map<string,Observation>>{
  const scope=JSON.stringify([owner.paneId,owner.instanceId,parent,owner.epoch??0,owner.generation,home]);
  if(this.closed)return new Map();
  if(!current()){this.retire(scope);return new Map();}
  if(items.length>64||new Set(items.map(i=>i.id)).size!==items.length)return new Map();
  for(const[key,o]of this.owners)if(o.pane===owner.paneId&&key!==scope){this.owners.delete(key);for(const[k,e]of this.entries)if(e.scope===key)this.entries.delete(k);}
  let rotation=this.owners.get(scope);if(!rotation){rotation={pane:owner.paneId,cursor:0};this.owners.set(scope,rotation);}
  while(this.owners.size>64){const old=this.owners.keys().next().value!;this.owners.delete(old);for(const[k,e]of this.entries)if(e.scope===old)this.entries.delete(k);}
  const keys=items.map(item=>JSON.stringify([scope,item.id,item.startedAt])),keep=new Set(keys);
  for(const[k,e]of this.entries)if(e.scope===scope&&!keep.has(k))this.entries.delete(k);
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;const expires=performance.now()+2000;
  const check=()=>active&&!this.closed&&current()&&performance.now()<expires-100;
  this.bytes=0;
  const work=async()=>{
   await Promise.all(keys.map(key=>this.slot(check,async()=>{const e=this.entries.get(key);if(e)await this.probe(e,check);})));if(!check())return;
   const selected:number[]=[];
   for(let n=0;n<items.length&&selected.length<4;n++){const i=(rotation!.cursor+n)%items.length,e=this.entries.get(keys[i]!);if(!e||this.needs(e))selected.push(i);}
   if(selected.length)rotation!.cursor=(selected.at(-1)!+1)%Math.max(1,items.length);
   await Promise.all(selected.map(i=>this.slot(check,async()=>{
    try{await this.advance(home,parent,items[i]!,keys[i]!,scope,owner.paneId,check);}
    catch{if(!check())return;const entry=this.entries.get(keys[i]!);if(entry){entry.reset=true;entry.available=false;}}
   })));
  };
  try{await Promise.race([work().catch(()=>undefined),new Promise<void>(resolve=>{timer=setTimeout(resolve,Math.max(0,expires-100-performance.now()));})]);}
  finally{active=false;if(timer)clearTimeout(timer);}
  if(this.closed)return new Map();
  if(!current()){this.retire(scope);return new Map();}
  // Reserve the last 100ms for fresh path checks; never expose an unvalidated cached candidate.
  const result=new Map<string,Observation>();let finalActive=true,finalTimer:ReturnType<typeof setTimeout>|undefined;
  const finalCheck=()=>finalActive&&!this.closed&&current()&&performance.now()<expires;
  const finalize=async()=>{await Promise.all(keys.map((key,index)=>this.slot(finalCheck,async()=>{const e=this.entries.get(key);if(!e)return;await this.probe(e,finalCheck);if(finalCheck()&&this.entries.get(key)===e)result.set(items[index]!.id,this.observation(e));})));};
  try{await Promise.race([finalize(),new Promise<void>(resolve=>{finalTimer=setTimeout(resolve,Math.max(0,expires-performance.now()));})]);}
  finally{finalActive=false;if(finalTimer)clearTimeout(finalTimer);}
  if(!current()){this.retire(scope);return new Map();}
  return !this.closed?result:new Map();
 }

 private async advance(home:string,parent:string,item:SubagentInfo,key:string,scope:string,pane:string,check:()=>boolean):Promise<void>{
  if(!check())return;
  const opened=await openCodexChildRecord(home,parent,item.id).catch(()=>undefined);if(!opened){if(check())this.entries.delete(key);return;}
  try{
   if(!check())return;
   let e=this.entries.get(key);const before=await opened.fd.stat({bigint:true});
   if(!check())return;
   if(before.size>BigInt(MAX_FILE)){this.entries.delete(key);return;}
   if(!e||e.reset||e.file!==opened.file||e.revision.dev!==before.dev||e.revision.ino!==before.ino||before.size<e.revision.size||(before.size===e.revision.size&&!same(before,e.revision))){
    if(!e&&!this.evict())return;
    e={key,scope,pane,child:item.id,parent,startedAt:item.startedAt,file:opened.file,revision:before,primary:new CodexChildTurnStream(0,item.startedAt),baseEOF:Number(before.size),fastProbed:false,initialDone:false,reset:false,available:true,touch:++this.serial};this.entries.set(key,e);
   }
   const entry=e;entry.touch=++this.serial;entry.revision=before;entry.available=true;
   const valid=()=>check()&&this.entries.get(key)===entry;
   let remaining=CHILD_BYTES-opened.metadataBytes;this.bytes+=opened.metadataBytes;
   const read=async(offset:number,length:number)=>{const bytes=await readRange(opened.fd,offset,Math.max(0,Math.min(length,remaining)));remaining-=bytes.length;this.bytes+=bytes.length;return bytes;};
   if(!entry.fastProbed&&valid()){
    const start=Math.max(0,Number(before.size)-TAIL),tail=await read(start,Number(before.size)-start);if(!valid())return;
    const fast=new CodexChildTurnStream(start,item.startedAt,start>0);fast.consume(tail);entry.fastProbed=true;
    if(fast.seenTurn&&!fast.invalid&&!fast.partial){entry.primary=new CodexChildTurnStream(Number(before.size),item.startedAt);entry.primary.seed(fast.value,fast.lastTurnEnd,fast.lastTurnTimestamp);entry.initialDone=true;}
    else{entry.baseEOF=Number(before.size);entry.suffix=new CodexChildTurnStream(entry.baseEOF,item.startedAt,tail.at(-1)!==10);}
   }
   const feed=async(stream:CodexChildTurnStream)=>{
    if(stream.invalid||stream.offset>=Number(before.size)||remaining<=0||!valid())return;
    const bytes=await read(stream.offset,Number(before.size)-stream.offset);
    for(let at=0;at<bytes.length&&valid()&&!stream.invalid;at+=512*1024){stream.consume(bytes.subarray(at,Math.min(bytes.length,at+512*1024)));await new Promise<void>(resolve=>setImmediate(resolve));}
   };
   // Suffix wins first during catch-up, but the complete prefix scan remains fair and resumable.
   if(entry.suffix)await feed(entry.suffix);
   await feed(entry.primary);
   if(!valid())return;
   if(entry.primary.offset===Number(before.size)&&!entry.primary.partial&&!entry.primary.invalid){entry.initialDone=true;delete entry.suffix;}
   const after=await opened.fd.stat({bigint:true});
   if(after.dev!==before.dev||after.ino!==before.ino||after.size<before.size||(after.size===before.size&&!same(after,before))){entry.reset=true;entry.available=false;return;}
   entry.revision=after;
  }finally{await opened.fd.close().catch(()=>undefined);}
 }
}
