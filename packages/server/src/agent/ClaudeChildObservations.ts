import {lstat} from "node:fs/promises";
import type {Pane,SubagentInfo} from "@sodashitsu/protocol";
import type {Subagents} from "./SubagentTracker.js";
import {resolveTranscriptFile,defaultTranscriptRoots} from "./SubagentTranscript.js";
import {openVerified,readRange} from "./safeFile.js";
import {safeModel} from "../usage/claudeScan.js";
export interface ClaudeChildSource {paneId:string;instanceId:string;kind:"claude";sessionId:string;}
interface Deps{
 tracker:{current(pane:string):Subagents|undefined;transcriptSource(pane:string,child:string):{sessionId:string;parentTranscriptPath:string}|undefined};
 session:{getPane(pane:string):Pane|undefined;hasVerifiedAgentSession(pane:string,instance:string,session:string):boolean};
 roots?:()=>string[];
}
/** Reuses the hook's exact child path proof and the existing poll. No extra timer or CLI is started. */
export class ClaudeChildObservations{
 constructor(private readonly deps:Deps){}
 private current(source:ClaudeChildSource):boolean{
  const pane=this.deps.session.getPane(source.paneId);
  return pane?.agent?.kind==="claude"&&pane.agent.instanceId===source.instanceId&&pane.agentSession?.kind==="claude"&&pane.agentSession.sessionId===source.sessionId&&this.deps.session.hasVerifiedAgentSession(source.paneId,source.instanceId,source.sessionId);
 }
 async read(source:ClaudeChildSource):Promise<Subagents|undefined>{
  const original=this.deps.tracker.current(source.paneId);if(!original||!this.current(source)||original.items.length>64)return undefined;
  const items=original.items.map(item=>{const {model:_model,modelBasis:_modelBasis,reasoningEffort:_effort,reasoningEffortBasis:_basis,...base}=item;return base as SubagentInfo;});
  let next=0,active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const current=()=>active&&this.current(source);
  const worker=async()=>{while(current()){
   const index=next++,item=items[index];if(!item)return;
   const proof=this.deps.tracker.transcriptSource(source.paneId,item.id);if(!proof||proof.sessionId!==source.sessionId)continue;
   const resolved=await resolveTranscriptFile(proof.parentTranscriptPath,proof.sessionId,item.id,(this.deps.roots??defaultTranscriptRoots)());if(!resolved.ok)continue;
   const opened=await openVerified(resolved.file).catch(()=>null);if(!opened)continue;
   try{
    if(process.geteuid&&opened.st.uid!==process.geteuid())continue;
    const revision=await opened.fd.stat({bigint:true}),start=Math.max(0,opened.st.size-256*1024),bytes=await readRange(opened.fd,start,opened.st.size-start);
    const model=claudeChildModel(bytes,item.startedAt,start>0),after=await opened.fd.stat({bigint:true}),path=await lstat(resolved.file,{bigint:true}).catch(()=>undefined),resolvedAfter=await resolveTranscriptFile(proof.parentTranscriptPath,proof.sessionId,item.id,(this.deps.roots??defaultTranscriptRoots)()),latest=this.deps.tracker.transcriptSource(source.paneId,item.id);
    if(!resolvedAfter.ok||resolvedAfter.file!==resolved.file||!current()||!path||path.isSymbolicLink()||JSON.stringify(latest)!==JSON.stringify(proof)||!([after,path].every(st=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===revision[k]))))continue;
    if(model){item.model=model;item.modelBasis="turn";}
   }catch{/* Unknown metadata leaves existing membership intact. */}
   finally{await opened.fd.close().catch(()=>undefined);}
  }};
  try{await Promise.race([Promise.all(Array.from({length:4},()=>worker())),new Promise<void>(resolve=>{timer=setTimeout(()=>{active=false;resolve();},2000);})]);}
  finally{active=false;if(timer)clearTimeout(timer);}
  return this.current(source)&&JSON.stringify(this.deps.tracker.current(source.paneId))===JSON.stringify(original)?{...original,items}:undefined;
 }
}
export function claudeChildModel(bytes:Buffer,startedAt:number,partialHead=false):string|undefined{
 const lines=bytes.toString("utf8").split("\n");if(partialHead)lines.shift();const partial=lines.pop();if(partial?.includes('"model"'))return undefined;
 for(let i=lines.length-1;i>=0;i--){let row:any;try{row=JSON.parse(lines[i]!);}catch{continue;}
  if(row?.type!=="assistant"||row.message?.model==="<synthetic>")continue;
  if(!Number.isFinite(Date.parse(row.timestamp))||Date.parse(row.timestamp)<startedAt)return undefined;
  return safeModel(row.message?.model)??undefined;
 }return undefined;
}
