import type {BigIntStats} from "node:fs";
import {lstat,realpath} from "node:fs/promises";
import {dirname,join} from "node:path";
import {createHash} from "node:crypto";
import {locateExtra,openExtra,type ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import {openVerified,readRange} from "./safeFile.js";
import {readAntigravityDescriptorProofs,type AntigravityDescriptorProof} from "./AntigravitySubagentReader.js";
const fields=["dev","ino","size","mtimeNs","ctimeNs"] as const;
export const sameAgyRevision=(a:BigIntStats,b:BigIntStats)=>fields.every(k=>a[k]===b[k]);
const stamp=(s:BigIntStats)=>fields.map(k=>String(s[k]));
const owner=(s:BigIntStats)=>!process.geteuid||s.uid===BigInt(process.geteuid());
export interface AgyParentStamp {file:string;revision:BigIntStats;identity:string;dirs:readonly {file:string;revision:BigIntStats}[]}
export interface AgyTerminalFact extends AntigravityDescriptorProof {key:string;hasTranscript:boolean}
export interface AgyTerminalSnapshot extends AgyParentStamp {descriptors:readonly AntigravityDescriptorProof[];facts:readonly AgyTerminalFact[]}
/** One complete bounded provider parse. A metadata-only observation callback also retires truncated namespaces. */
export async function readAgyTerminalSnapshot(parent:string,roots:ExtraRoots,current:()=>boolean,observed:(stamp:AgyParentStamp)=>void):Promise<AgyTerminalSnapshot|undefined>{
 if(!current())return;
 const file=await locateExtra("agy",parent,roots),opened=file&&await openExtra("agy",parent,roots);if(!file||!opened)return;
 try{
  const revision=await opened.fd.stat({bigint:true});if(!current()||!owner(revision))return;
  const system=dirname(dirname(file)),brain=dirname(system),dirs=[];
  for(const path of [brain,system,dirname(file),join(system,"subagents")]){
   const st=await lstat(path,{bigint:true});if(!st.isDirectory()||st.isSymbolicLink()||!owner(st)||await realpath(path)!==path||!current())return;
   dirs.push({file:path,revision:st});
  }
  const identity=JSON.stringify([file,String(revision.dev),String(revision.ino),...dirs.flatMap(d=>[d.file,String(d.revision.dev),String(d.revision.ino)])]);
  const base={file,revision,identity,dirs};observed(base);if(!current()||revision.size===0n||revision.size>4n*1024n*1024n)return;
  const tail=await readRange(opened.fd,Number(revision.size)-1,1);if(tail.length!==1||tail[0]!==10||!current())return;
  const descriptors:AntigravityDescriptorProof[]=[];
  const result=await readAntigravityDescriptorProofs(parent,roots,value=>descriptors.push(value));if(!result||!current())return;
  const facts:AgyTerminalFact[]=[];
  for(const row of descriptors){
   if(!owner(row.revision))return;
   if(row.state!=="SUBAGENT_STATE_KILLED")continue;
   const child=await openExtra("agy",row.id,roots).catch(()=>null);let hasTranscript=false;
   try{hasTranscript=!!child&&(!process.geteuid||child.st.uid===process.geteuid());}finally{await child?.fd.close();}
   if(!current())return;
   const key=createHash("sha256").update(JSON.stringify([row.id,row.spawnStepIndex,row.startedAt,stamp(row.revision)])).digest("hex");facts.push({...row,key,hasTranscript});
  }
  const snapshot={...base,descriptors,facts};
  if(!sameAgyRevision(revision,await opened.fd.stat({bigint:true}))||!await verifyAgyTerminalSnapshot(parent,roots,snapshot,current)||!current())return;
  return snapshot;
 }catch{return;}finally{await opened.fd.close().catch(()=>undefined);}
}
/** Parent namespace/EOF seal and exact descriptor metadata, no body reparse when unchanged. */
export async function verifyAgyTerminalSnapshot(parent:string,roots:ExtraRoots,snapshot:AgyTerminalSnapshot,current:()=>boolean,fact?:AgyTerminalFact):Promise<boolean>{
 if(!current()||await locateExtra("agy",parent,roots)!==snapshot.file||!current())return false;
 const opened=await openExtra("agy",parent,roots);if(!opened)return false;let accepted=false;
 const dirs=async()=>{
  for(const value of snapshot.dirs){const actual=await lstat(value.file,{bigint:true}).catch(()=>undefined);if(!actual||!actual.isDirectory()||actual.isSymbolicLink()||!sameAgyRevision(value.revision,actual)||await realpath(value.file)!==value.file||!current())return false;}return true;
 };
 const parentSame=async()=>{
  const fd=await opened.fd.stat({bigint:true}),path=await lstat(snapshot.file,{bigint:true});
  return current()&&owner(fd)&&!path.isSymbolicLink()&&await realpath(snapshot.file)===snapshot.file&&sameAgyRevision(snapshot.revision,fd)&&sameAgyRevision(snapshot.revision,path);
 };
 try{
  if(!await parentSame()||!await dirs()||!current())return false;
  for(const value of fact?[fact]:snapshot.descriptors){
   if(!current()||await realpath(value.file)!==value.file)return false;
   const fd=await openVerified(value.file);if(!fd)return false;let valid=false;
   try{const after=await fd.fd.stat({bigint:true}),path=await lstat(value.file,{bigint:true});valid=current()&&owner(after)&&!path.isSymbolicLink()&&sameAgyRevision(value.revision,after)&&sameAgyRevision(value.revision,path);}
   finally{await fd.fd.close().catch(()=>undefined);}if(!valid||!current())return false;
  }
  if(!fact)for(const value of snapshot.facts){
   const child=await openExtra("agy",value.id,roots).catch(()=>null);let present=false;
   try{present=!!child&&(!process.geteuid||child.st.uid===process.geteuid());}finally{await child?.fd.close().catch(()=>undefined);}
   if(present!==value.hasTranscript||!current())return false;
  }
  accepted=await parentSame()&&await dirs()&&current();
 }catch{return false;}finally{await opened.fd.close().catch(()=>undefined);}
 return accepted&&current();
}
