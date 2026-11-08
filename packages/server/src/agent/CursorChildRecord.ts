import { lstat, realpath, opendir, mkdtemp, open, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { Stats,BigIntStats } from "node:fs";
import {createHash} from "node:crypto";
import {cursorChildContextMetadata,type CursorChildContext} from "./CursorChildContext.js";
import { locateExtra, type ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { openVerified, readRange, type OpenedFile } from "./safeFile.js";
import { cursorChildLineage, cursorChildTerminal, type CursorChildLineage, type CursorChildStop } from "./CursorChildMetadata.js";
import { queryCursorChildMetadata } from "./CursorChildMetadataQuery.js";

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DB_MAX=32*1024*1024,WAL_MAX=8*1024*1024,TRANSCRIPT_MAX=512*1024*1024;
const same=(a:Stats,b:Stats)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
export interface CursorChildRoots extends ExtraRoots { cursorConfigHome?:string }
export interface CursorChildRecord extends OpenedFile {snapshotSeal?:string;context?:CursorChildContext;metadataUnchanged?():Promise<boolean>;lineage:CursorChildLineage;terminal?:CursorChildStop["status"];unchanged():Promise<boolean>}
interface Proof extends OpenedFile {path:string;unchanged():Promise<boolean>}
async function directory(path:string):Promise<boolean>{const s=await lstat(path).catch(()=>undefined);return !!s&&s.isDirectory()&&!s.isSymbolicLink()&&await realpath(path).catch(()=>undefined)===path;}
async function proof(path:string,max=TRANSCRIPT_MAX):Promise<Proof|undefined>{
 let opened:OpenedFile|null=null;
 try{
  const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>max||await realpath(path)!==path)return;
  opened=await openVerified(path);if(!opened||!same(before,opened.st))return;
  const own=opened;
  const unchanged=async()=>{try{const [leaf,fd]=await Promise.all([lstat(path),own.fd.stat()]);return leaf.isFile()&&!leaf.isSymbolicLink()&&leaf.nlink===1&&same(leaf,own.st)&&same(fd,own.st)&&await realpath(path)===path;}catch{return false;}};
  if(!await unchanged())return;
  opened=null;return{...own,path,unchanged};
 }catch{return;}finally{await opened?.fd.close().catch(()=>undefined);}
}
async function absent(path:string):Promise<boolean>{try{await lstat(path);return false;}catch(e){return (e as NodeJS.ErrnoException).code==="ENOENT";}}
async function copy(source:Proof,target:string,current:()=>boolean,deadline:number):Promise<boolean>{
 const out=await open(target,"wx",0o600);
 try{
  for(let offset=0;offset<source.st.size;){
   if(!current()||performance.now()>=deadline)return false;
   const data=await readRange(source.fd,offset,Math.min(256*1024,source.st.size-offset));if(!data.length)return false;
   let written=0;while(written<data.length){const n=await out.write(data,written,data.length-written,offset+written);if(!n.bytesWritten)return false;written+=n.bytesWritten;}
   offset+=data.length;
  }
  return current()&&await source.unchanged();
 }finally{await out.close();}
}
/** No CLI launch or original SQLite query. Database and WAL are copied from
 * verified fds to an owned private directory; only bounded metadata is queried.
 * Cache identity is the complete DB/WAL revision, never only a child UUID. */
export class CursorChildRecords {
 private cache=new Map<string,{signature:string;lineage:CursorChildLineage;context?:CursorChildContext}>();
 private active=0;
 private closed=false;
 private generation=0;
 constructor(private readonly roots:CursorChildRoots={}){}
 close():void{this.closed=true;this.generation++;this.cache.clear();}
 forget():void{this.generation++;this.cache.clear();}
 private async databaseGroup(parent:string):Promise<string|undefined>{
  const home=this.roots.home??homedir();
  const configured=process.env.CURSOR_CONFIG_DIR,xdg=process.env.XDG_CONFIG_HOME;
  // The installed resolver tests trimmed non-emptiness but preserves the path itself.
  const config=this.roots.cursorConfigHome||(configured?.trim()?configured:xdg?.trim()?join(xdg,"cursor"):join(home,".cursor"));
  const root=await realpath(join(config,"chats")).catch(()=>undefined);if(!root||!await directory(root))return;
  const handle=await opendir(root).catch(()=>undefined);if(!handle)return;
  const deadline=performance.now()+1000;let found:string|undefined,count=0;
  for await(const entry of handle){
   if(++count>1000||performance.now()>deadline)return;
   if(!entry.isDirectory()||entry.isSymbolicLink()||!/^[a-f0-9]{32}$/i.test(entry.name))continue;
   const group=join(root,entry.name),parentDir=join(group,parent);
   if(!await directory(group)||!await directory(parentDir))continue;
   const f=await proof(join(parentDir,"store.db"));if(!f)continue;
   await f.fd.close();if(found)return;found=group;
  }
  return found;
 }
 async open(parent:string,child:string,verified:()=>boolean):Promise<CursorChildRecord|undefined>{
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const work=this.openOwned(parent,child,()=>active&&verified()).then(async record=>{
   if(active&&verified())return record;
   await record?.fd.close().catch(()=>undefined);return undefined;
  });
  try{return await Promise.race([work,new Promise<undefined>(resolve=>{timer=setTimeout(()=>{active=false;resolve(undefined);},2000);})]);}
  finally{if(timer)clearTimeout(timer);}
 }
 private async openOwned(parent:string,child:string,verified:()=>boolean):Promise<CursorChildRecord|undefined>{
  if(this.closed||this.active>=2||!UUID.test(parent)||!UUID.test(child)||parent===child||!verified())return;
  this.active++;let release=true,temp:string|undefined,retained:CursorChildRecord|undefined;
  const generation=this.generation,opened:Proof[]=[],current=()=>!this.closed&&this.generation===generation&&verified(),deadline=performance.now()+2000;
  try{
   const [group,parentFile]=await Promise.all([this.databaseGroup(parent),locateExtra("cursor",parent,this.roots)]);
   if(!group||!parentFile||!current()||performance.now()>=deadline)return;
   // Both old primary-file and current primary-directory locators use this
   // documented direct-child path; no arbitrary hook path is accepted.
   const transcriptRoot=parentFile.endsWith(join(parent,`${parent}.jsonl`))?dirname(parentFile):join(dirname(parentFile),parent);
   const childFile=join(transcriptRoot,"subagents",`${child}.jsonl`),childDir=join(group,child),parentDir=join(group,parent);
   const dirs=[group,parentDir,childDir,transcriptRoot,join(transcriptRoot,"subagents")];
   if(!(await Promise.all(dirs.map(directory))).every(Boolean))return;
   const parentTranscript=await proof(parentFile),parentDb=await proof(join(parentDir,"store.db")),childTranscript=await proof(childFile);
   for(const p of [parentTranscript,parentDb,childTranscript])if(p)opened.push(p);
   if(!parentTranscript||!parentDb||!childTranscript)return;
   const db=await proof(join(childDir,"store.db"),DB_MAX);if(!db)return;opened.push(db);
   const walFile=db.path+"-wal",walMissing=await absent(walFile),wal=walMissing?undefined:await proof(walFile,WAL_MAX);
   if(wal)opened.push(wal);if(!walMissing&&!wal)return;
   const files=[db,...(wal?[wal]:[])];
   const identity=(st:BigIntStats)=>[st.dev,st.ino,st.size,st.mtimeNs,st.ctimeNs].map(String).join(":");
   const nsStamps=await Promise.all(files.map(async f=>({path:f.path,id:identity(await f.fd.stat({bigint:true}))})));
   const sameSnapshot=async()=>{
    if(!current()||walMissing&&!await absent(walFile))return false;
    for(const stamp of nsStamps){const now=await lstat(stamp.path,{bigint:true}).catch(()=>undefined);if(!now||!now.isFile()||now.isSymbolicLink()||now.nlink!==1n||identity(now)!==stamp.id||await realpath(stamp.path).catch(()=>undefined)!==stamp.path)return false;}
    return current();
   };
   const proofNs=await Promise.all(opened.map(async f=>({path:f.path,id:identity(await f.fd.stat({bigint:true}))})));
   // Metadata-only revalidation remains usable after the retained transcript FD closes.
   const metadataUnchanged=async()=>{
    if(!current()||!await sameSnapshot()||!(await Promise.all(dirs.map(directory))).every(Boolean))return false;
    for(const stamp of proofNs){const now=await lstat(stamp.path,{bigint:true}).catch(()=>undefined);if(!now||!now.isFile()||now.isSymbolicLink()||now.nlink!==1n||identity(now)!==stamp.id||await realpath(stamp.path).catch(()=>undefined)!==stamp.path)return false;}
    return current();
   };
   const signature=createHash("sha256").update(JSON.stringify([nsStamps,walMissing])).digest("hex");
   const key=JSON.stringify([parent,child]),cached=this.cache.get(key);
   let lineage=cached?.signature===signature?{...cached.lineage}:undefined;
   let context=cached?.signature===signature&&cached.context?{...cached.context}:undefined;
   if(!lineage){
    temp=await mkdtemp(join(tmpdir(),"soda-cursor-child-meta-"));const replica=join(temp,"store.db");
    for(const f of files)if(!await copy(f,f===db?replica:replica+"-wal",current,deadline))return;
    if(!current()||performance.now()>=deadline)return;
    const query=await queryCursorChildMetadata(replica,deadline-performance.now());
    if(!query.closed()){
     // A failed physical close keeps its bounded slot/private files. No new
     // job may reuse them, and a late reply can never publish metadata.
     release=false;const ownTemp=temp;temp=undefined;
     void query.physicalClose.finally(async()=>{if(ownTemp)await rm(ownTemp,{recursive:true,force:true}).catch(()=>undefined);this.active--;});
     return;
    }
    if(!query.value)return;
    lineage=cursorChildLineage(Buffer.from(query.value).toString("hex"),parent,child);if(!lineage)return;
    try{context=cursorChildContextMetadata(JSON.parse(query.value).context);}catch{context=undefined;}
   }
   const checks=async()=>current()&&await sameSnapshot()&&(await Promise.all(dirs.map(directory))).every(Boolean)&&(await Promise.all(opened.map(f=>f.unchanged()))).every(Boolean)&&(!walMissing||await absent(walFile))&&current();
   if(!await checks())return;
   const tailStart=Math.max(0,childTranscript.st.size-256*1024),tail=await readRange(childTranscript.fd,tailStart,childTranscript.st.size-tailStart),terminal=cursorChildTerminal(tail);
   if(!await checks())return;
   this.cache.delete(key);this.cache.set(key,{signature,lineage:{...lineage},...(context?{context:{...context}}:{})});while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);
   // DB proof fds are closed here. Later unchanged checks compare the same
   // original revisions/path identities; the transcript fd remains pinned.
   const stamps=opened.filter(f=>f!==childTranscript).map(f=>({path:f.path,st:f.st}));
   const unchanged=async()=>{
    if(!current()||!await sameSnapshot()||!await childTranscript.unchanged()||!(await Promise.all(dirs.map(directory))).every(Boolean)||walMissing&&!await absent(walFile))return false;
    for(const f of stamps){const s=await lstat(f.path).catch(()=>undefined);if(!s||!s.isFile()||s.isSymbolicLink()||s.nlink!==1||!same(s,f.st)||await realpath(f.path).catch(()=>undefined)!==f.path)return false;}
    return current();
   };
   retained={fd:childTranscript.fd,st:childTranscript.st,lineage,snapshotSeal:signature,metadataUnchanged,...(context?{context:{...context}}:{}),...(terminal?{terminal}:{}),unchanged};return retained;
  }catch{return;}finally{
   await Promise.all(opened.filter(f=>f.fd!==retained?.fd).map(f=>f.fd.close().catch(()=>undefined)));
   if(temp)await rm(temp,{recursive:true,force:true}).catch(()=>undefined);
   if(release)this.active--;
  }
 }
}
