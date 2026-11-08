import {createHash} from "node:crypto";
import {openMuseChildRecord,museChildEntries} from "./MuseChildRecord.js";
import type {ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import type {MuseTerminalFact} from "./NativeSubagentRecords.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
interface Proof {
 source:SubagentHistorySource;
 roots:ExtraRoots;
 namespace:string;
 facts:readonly MuseTerminalFact[];
 current(fact:MuseTerminalFact):boolean;
 verify(fact:MuseTerminalFact,allowed:()=>boolean):Promise<boolean>;
}
/** Last formally owned terminal only. A followup invalidates it rather than reading the current run. */
export function museTerminalBindings(proof:Proof):SubagentTerminalCollection {
 const bindings:SubagentTerminalBinding[]=proof.facts.map(fact=>{
  const current=()=>proof.current(fact),verify=(allowed:()=>boolean)=>proof.verify(fact,allowed);
  const key=createHash("sha256").update(JSON.stringify([proof.source,proof.namespace,fact.id,fact.childSession,fact.startedAt,fact.endedAt,fact.eventId])).digest("hex");
  return {source:{...proof.source},item:{id:fact.id,startedAt:Math.floor(fact.startedAt),endedAt:Math.floor(fact.endedAt),terminalStatus:"completed",hasTranscript:true,...(fact.description?{description:fact.description}:{}),...(fact.type?{type:fact.type}:{})},eventId:key,key,kind:"muse",recordId:fact.childSession,usageStartedAt:fact.startedAt,current,verify,
   openRecord:async(_purpose,allowed)=>{
    if(!allowed()||!current()||!await verify(allowed)||!allowed()||!current())return;
    const opened=await openMuseChildRecord(proof.source.sessionId,fact.childSession,proof.roots);if(!opened)return;
    try{
     const unchanged=async()=>allowed()&&current()&&await opened.unchanged()&&await verify(allowed)&&allowed()&&current();
     if(!await unchanged())throw Error("child proof changed");
     return {...opened,unchanged};
    }catch{await opened.fd.close().catch(()=>undefined);return;}
   },entries:row=>museChildEntries(row,fact.childSession),
  };
 });
 return {status:"ok",bindings,incomplete:true};
}
