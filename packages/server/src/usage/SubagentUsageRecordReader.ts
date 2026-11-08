import type {BigIntStats} from "node:fs";
import type {SubagentUsage} from "@sodashitsu/protocol";
import {readRange,type OpenedFile} from "../agent/safeFile.js";
import {SubagentUsageAccumulator,type ChildUsageKind} from "./SubagentUsageAccumulator.js";
export type ChildUsageRecord=OpenedFile&{unchanged():Promise<boolean>;confirmedRevision?():BigIntStats};
export interface ChildUsageRecordSource {key:string;kind:ChildUsageKind;recordId:string;startedAt:number;}
interface Entry {revision:BigIntStats;offset:number;skipping:boolean;values:SubagentUsageAccumulator;busy:boolean;}
const MAX_FILE=512*1024*1024,CHUNK=4*1024*1024,MAX_LINE=256*1024;
const same=(a:BigIntStats,b:BigIntStats)=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>a[k]===b[k]);
/** Reopen only after an append, using the same exact relation/namespace proof as the original opener. */
export function verifyAppendedRecord(record:ChildUsageRecord,initial:BigIntStats,open:()=>Promise<ChildUsageRecord|undefined>,current:()=>boolean):ChildUsageRecord {
 let confirmed=initial;
 return {...record,confirmedRevision:()=>confirmed,unchanged:async()=>{
  if(!current())return false;
  if(await record.unchanged())return current();
  const old=await record.fd.stat({bigint:true});
  if(!current()||old.dev!==initial.dev||old.ino!==initial.ino||old.size<=initial.size)return false;
  const fresh=await open();if(!fresh)return false;
  let accepted=false;
  try{
   const revision=await fresh.fd.stat({bigint:true});
   if(!current()||fresh.st.uid!==record.st.uid||revision.dev!==old.dev||revision.ino!==old.ino||revision.size<old.size||!await fresh.unchanged()||!current())return false;
   const again=await record.fd.stat({bigint:true});if(!current()||!same(revision,again))return false;
   confirmed=revision;accepted=true;
  }finally{await fresh.fd.close().catch(()=>undefined);}
  return accepted&&current();
 }};
}
/** One explicit child query advances at most 4MiB. Never opens client paths or retains conversation bodies. */
export class SubagentUsageRecordReader {
 private readonly entries=new Map<string,Entry>();
 private active=0;
 private closed=false;
 forget(key:string):void{this.entries.delete(key);}
 close():void{this.closed=true;this.entries.clear();}
 async read(source:ChildUsageRecordSource,record:ChildUsageRecord,current:()=>boolean):Promise<SubagentUsage|undefined>{
  if(this.closed||!current()||this.active>=4)return undefined;
  const previous=this.entries.get(source.key);if(previous?.busy)return undefined;
  const revision=await record.fd.stat({bigint:true});if(this.closed||!current()||this.active>=4||this.entries.get(source.key)!==previous||previous?.busy)return undefined;
  if(revision.size>BigInt(MAX_FILE)||!revision.isFile()||revision.nlink!==1n){this.entries.delete(source.key);return undefined;}
  let entry=this.entries.get(source.key);if(entry?.busy)return undefined;
  if(!entry||entry.revision.dev!==revision.dev||entry.revision.ino!==revision.ino||revision.size<entry.revision.size||(revision.size===entry.revision.size&&!same(entry.revision,revision))){
   if(!entry&&this.entries.size>=64){const removable=[...this.entries].find(([,e])=>!e.busy);if(!removable)return undefined;this.entries.delete(removable[0]);}
   entry={revision,offset:0,skipping:false,values:new SubagentUsageAccumulator(source.kind,source.recordId,source.startedAt),busy:false};this.entries.set(source.key,entry);
  }
  const own=entry;this.entries.delete(source.key);this.entries.set(source.key,own);own.busy=true;this.active++;
  let enabled=true,timer:ReturnType<typeof setTimeout>|undefined;
  const check=()=>enabled&&!this.closed&&this.entries.get(source.key)===own&&current();
  const work=async()=>{
   let accepted=false;
   try{
    const bytes=await readRange(record.fd,own.offset,Math.min(CHUNK,Number(revision.size)-own.offset));if(!check())return undefined;
    let consumed=0,yielded=0;
    for(let at=0;at<bytes.length;){
     if(!check())return undefined;
     const nl=bytes.indexOf(10,at);
     if(own.skipping){if(nl<0){consumed=bytes.length;break;}own.skipping=false;at=nl+1;consumed=at;continue;}
     if(nl<0){if(bytes.length-at>MAX_LINE){own.skipping=true;own.values.partial=true;consumed=bytes.length;}break;}
     if(nl-at>MAX_LINE)own.values.partial=true;
     else if(nl>at){try{own.values.consume(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(at,nl))));}catch{own.values.partial=true;}}
     at=nl+1;consumed=at;if(consumed-yielded>=512*1024){yielded=consumed;await new Promise<void>(resolve=>setImmediate(resolve));}
    }
    if(!check())return undefined;
    const after=await record.fd.stat({bigint:true});if(!check()||after.dev!==revision.dev||after.ino!==revision.ino||after.size<revision.size||after.size===revision.size&&!same(revision,after)||!await record.unchanged()||!check())return undefined;
    const confirmed=record.confirmedRevision?.()??after;if(confirmed.dev!==revision.dev||confirmed.ino!==revision.ino||confirmed.size<after.size)return undefined;
    own.offset+=consumed;own.revision=confirmed;accepted=true;
    return own.values.snapshot(own.offset<Number(confirmed.size)||own.skipping);
   }catch{return undefined;}
   finally{if(!accepted&&this.entries.get(source.key)===own)this.entries.delete(source.key);own.busy=false;this.active--;}
  };
  try{return await Promise.race([work(),new Promise<undefined>(resolve=>{timer=setTimeout(()=>{enabled=false;resolve(undefined);},2000);})]);}
  finally{enabled=false;if(timer)clearTimeout(timer);}
 }
}
