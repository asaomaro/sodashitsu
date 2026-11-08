import {createHash} from "node:crypto";
import {openCodexChildRecord,codexChildEntries} from "./CodexChildRecord.js";
import type {CodexTerminalFact} from "./NativeSubagentRecords.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
interface Proof {
 source:SubagentHistorySource;
 home:string;
 namespace:string;
 facts:readonly CodexTerminalFact[];
 current(fact:CodexTerminalFact):boolean;
 verify(fact:CodexTerminalFact,allowed:()=>boolean):Promise<boolean>;
}
/** Last formally owned terminal only. A followup invalidates it rather than reading the current run. */
export function codexTerminalBindings(proof:Proof):SubagentTerminalCollection {
 const bindings:SubagentTerminalBinding[]=proof.facts.map(fact=>{
  const current=()=>proof.current(fact),verify=(allowed:()=>boolean)=>proof.verify(fact,allowed);
  const key=createHash("sha256").update(JSON.stringify([proof.source,proof.namespace,fact.id,fact.startedAt,fact.endedAt,fact.eventId])).digest("hex");
  return {source:{...proof.source},item:{id:fact.id,startedAt:fact.startedAt,endedAt:fact.endedAt,terminalStatus:fact.terminalStatus,hasTranscript:true,...(fact.description?{description:fact.description}:{}),...(fact.type?{type:fact.type}:{})},eventId:key,key,kind:"codex",recordId:fact.id,current,verify,
   openRecord:async(_purpose,allowed)=>{
    if(!allowed()||!current()||!await verify(allowed)||!allowed()||!current())return;
    const opened=await openCodexChildRecord(proof.home,proof.source.sessionId,fact.id);if(!opened)return;
    try{
     const unchanged=async()=>allowed()&&current()&&await opened.unchanged()&&await verify(allowed)&&allowed()&&current();
     if(!await unchanged())throw Error("child proof changed");
     return {...opened,unchanged};
    }catch{await opened.fd.close().catch(()=>undefined);return;}
   },entries:codexChildEntries,
  };
 });
 return {status:"ok",bindings,incomplete:true};
}
