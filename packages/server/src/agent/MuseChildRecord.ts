import {lstat,realpath} from "node:fs/promises";
import {dirname,join} from "node:path";
import {locateExtra,type ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import {openVerified,readRange,type OpenedFile} from "./safeFile.js";
import {entriesOfLine} from "./SubagentTranscript.js";
import type {SubagentTranscriptEntry} from "@sodashitsu/protocol";
/** childSession comes exclusively from the verified parent child_session_bound fact, never a caller path. */
export async function openMuseChildRecord(parent:string,childSession:string,roots:ExtraRoots){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(childSession)||childSession===parent)return undefined;
 const parentPath=await locateExtra("muse",parent,roots);if(!parentPath)return undefined;
 const file=join(dirname(parentPath),"subagent",childSession,"session.jsonl");
 if(await realpath(file).catch(()=>null)!==file)return undefined;
 const leaf=await lstat(file).catch(()=>undefined);if(!leaf?.isFile()||leaf.isSymbolicLink()||leaf.nlink!==1)return undefined;
 const opened=await openVerified(file);if(!opened)return undefined;
 try{
  if(opened.st.dev!==leaf.dev||opened.st.ino!==leaf.ino||(process.geteuid&&opened.st.uid!==process.geteuid()))throw Error("child identity mismatch");
  const revision=await opened.fd.stat({bigint:true});
  if(!await museChildStreamPresent(opened,childSession))throw Error("child stream unavailable");
  const unchanged=async()=>{
   const after=await opened.fd.stat({bigint:true}).catch(()=>undefined),path=await lstat(file,{bigint:true}).catch(()=>undefined);
   return !!path&&!path.isSymbolicLink()&&await realpath(file).catch(()=>null)===file&&await locateExtra("muse",parent,roots)===parentPath&&[after,path].every(st=>st!==undefined&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===revision[k]));
  };
  if(!await unchanged())throw Error("child changed");return {...opened,unchanged};
 }catch{await opened.fd.close();return undefined;}
}
export function museChildEntries(row:unknown,childSession:string):SubagentTranscriptEntry[]{
 if(!row||typeof row!=="object"||Array.isArray(row))return [];
 const r=row as Record<string,any>;if(r.schema_version!==1||r.stream?.kind!=="session"||r.stream.id!==childSession||r.payload_schema_version!==1)return [];
 const event=r.payload?.kind==="run"?r.payload.event:undefined;
 const at=typeof r.recorded_at==="number"&&Number.isFinite(r.recorded_at)&&Math.abs(r.recorded_at/1000)<=8.64e15?new Date(r.recorded_at/1000).toISOString():undefined;
 if(event?.kind==="workflow_child_result_submitted"&&event.child_session_stream?.kind==="session"&&event.child_session_stream.id===childSession&&typeof event.payload?.text==="string")return entriesOfLine({type:"assistant",timestamp:at,message:{content:event.payload.text}});
 return [];
}

export async function museChildStreamPresent(opened:OpenedFile,childSession:string):Promise<boolean>{
 const head=await readRange(opened.fd,0,Math.min(opened.st.size,256*1024)),rows=head.toString("utf8").split("\n");rows.pop();
 return rows.some(line=>{try{const row=JSON.parse(line);return row.schema_version===1&&row.stream?.kind==="session"&&row.stream.id===childSession;}catch{return false;}});
}
