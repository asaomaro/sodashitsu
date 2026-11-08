import {lstat,realpath} from "node:fs/promises";
import {homedir} from "node:os";
import {join} from "node:path";
import {resolveVerifiedSubagentTarget,type SubagentTargetSession} from "../agent/VerifiedSubagentTarget.js";
import {openCodexChildRecord} from "../agent/CodexChildRecord.js";
import {openMuseChildRecord} from "../agent/MuseChildRecord.js";
import {openAntigravityChildRecord} from "../agent/AntigravityChildRecord.js";
import {defaultTranscriptRoots,resolveTranscriptFile} from "../agent/SubagentTranscript.js";
import {openVerified} from "../agent/safeFile.js";
import {locateGrokSession,openGrokSessionRecord} from "../agent/grokSession.js";
import type {ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import type {SubagentUsageTarget} from "./SubagentUsageService.js";
interface Deps {
 session:SubagentTargetSession;
 tracker:{transcriptSource(pane:string,child:string):{sessionId:string;parentTranscriptPath:string}|undefined};
 museChildSession(pane:string,child:string):string|undefined;
 roots?:ExtraRoots&{codexHome?:string};
 claudeRoots?:()=>string[];
}
/** Current verified membership proves the target; each provider opener separately proves its fixed record relation. */
export function createSubagentUsageResolver(deps:Deps):(pane:string,child:string)=>SubagentUsageTarget|undefined {
 return (pane,child)=>{
  const resolved=resolveVerifiedSubagentTarget(deps.session,pane,child);if(!resolved)return undefined;
  const {key,kind,instanceId,parentId,recordId:logicalRecordId,startedAt,current:liveCurrent}=resolved;
  const target={key,kind,instanceId,parentId,recordId:logicalRecordId,startedAt,current:liveCurrent};
  const roots=deps.roots??{},museSession=target.kind==="muse"?deps.museChildSession(pane,child):undefined;
  if(target.kind==="muse"&&!museSession)return undefined;
  const proof=target.kind==="claude"?deps.tracker.transcriptSource(pane,child):undefined;
  if(target.kind==="claude"&&(!proof||proof.sessionId!==target.parentId))return undefined;
  const recordId=museSession??target.recordId;
  const current=()=>target.current()&&(target.kind!=="muse"||deps.museChildSession(pane,child)===museSession)&&(target.kind!=="claude"||JSON.stringify(deps.tracker.transcriptSource(pane,child))===JSON.stringify(proof));
  const historyCurrent=()=>{
   const paneNow=deps.session.getPane(pane),agent=paneNow?.agent,ref=paneNow?.agentSession;
   if(agent?.kind!==target.kind||agent.instanceId!==target.instanceId||ref?.kind!==target.kind||ref.sessionId!==target.parentId||!deps.session.hasVerifiedAgentSession(pane,target.instanceId,target.parentId))return false;
   const matches=agent.subagents?.items?.filter(item=>item.id===child)??[];
   if(matches.length>1||matches.some(item=>item.startedAt!==target.startedAt))return false;
   if(target.kind==="muse"){const binding=deps.museChildSession(pane,child);if(binding!==undefined&&binding!==museSession||matches.length>0&&binding===undefined)return false;}
   if(target.kind==="claude"){const next=deps.tracker.transcriptSource(pane,child);if(next&&JSON.stringify(next)!==JSON.stringify(proof)||matches.length>0&&!next)return false;}
   return true;
  };
  return {key:JSON.stringify([target.key,recordId]),kind:target.kind,recordId,startedAt:target.startedAt,current,historyCurrent,openRecord:async(historical=false)=>{
   const recordCurrent=historical?historyCurrent:current;
   if(!recordCurrent())return undefined;
   if(target.kind==="codex")return openCodexChildRecord(roots.codexHome??process.env.CODEX_HOME??join(homedir(),".codex"),target.parentId,recordId);
   if(target.kind==="muse")return openMuseChildRecord(target.parentId,recordId,roots);
   if(target.kind==="agy")return openAntigravityChildRecord(target.parentId,recordId,roots);
   if(target.kind==="grok"){
    const location=await locateGrokSession(recordId,roots);if(!location||!recordCurrent())return undefined;
    const opened=await openGrokSessionRecord(recordId,"usage.json",roots);if(!opened)return undefined;
    try{
     const file=join(location.dir,"usage.json"),before=await opened.fd.stat({bigint:true});
     const unchanged=async()=>{const [path,fd,found]=await Promise.all([lstat(file,{bigint:true}).catch(()=>undefined),opened.fd.stat({bigint:true}).catch(()=>undefined),locateGrokSession(recordId,roots)]);return recordCurrent()&&found?.dir===location.dir&&await realpath(file).catch(()=>null)===file&&[path,fd].every(st=>!!st&&!st.isSymbolicLink()&&st.isFile()&&st.nlink===1n&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===before[k]));};
     if(!await unchanged())throw Error("record changed");return {...opened,unchanged};
    }catch{await opened.fd.close();return undefined;}
   }
   if(target.kind!=="claude"||!proof)return undefined;
   const allowed=(deps.claudeRoots??defaultTranscriptRoots)(),resolved=await resolveTranscriptFile(proof.parentTranscriptPath,proof.sessionId,child,allowed);if(!resolved.ok||!recordCurrent())return undefined;
   const opened=await openVerified(resolved.file).catch(()=>null);if(!opened)return undefined;
   try{
    const before=await opened.fd.stat({bigint:true});
    const unchanged=async()=>{const [path,fd,after]=await Promise.all([lstat(resolved.file,{bigint:true}).catch(()=>undefined),opened.fd.stat({bigint:true}).catch(()=>undefined),resolveTranscriptFile(proof.parentTranscriptPath,proof.sessionId,child,allowed)]);return recordCurrent()&&after.ok&&after.file===resolved.file&&[path,fd].every(st=>!!st&&!st.isSymbolicLink()&&st.isFile()&&st.nlink===1n&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===before[k]));};
    if(!await unchanged())throw Error("record changed");return {...opened,unchanged};
   }catch{await opened.fd.close();return undefined;}
  }};
 };
}
