import {copilotPublicMessage} from "./CopilotPublicEntries.js";
import type {TerminalRecord} from "./SubagentTerminalBinding.js";
import {createHash} from "node:crypto";
import type {CopilotTerminalFact} from "./NativeSubagentRecords.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
interface Proof {source:SubagentHistorySource;namespace:string;facts:readonly CopilotTerminalFact[];current(fact:CopilotTerminalFact):boolean;verify(fact:CopilotTerminalFact,allowed:()=>boolean):Promise<boolean>;open?(fact:CopilotTerminalFact,allowed:()=>boolean):Promise<TerminalRecord|undefined>}
/** toolCallId is not a child-session UUID. Project only a private, formally captured public-message set from its verified parent; never parent usage. */
export function copilotTerminalBindings(proof:Proof):SubagentTerminalCollection {
 return {status:"ok",incomplete:true,bindings:proof.facts.map<SubagentTerminalBinding>(fact=>{
  const key=createHash("sha256").update(JSON.stringify([proof.source,proof.namespace,fact.id,fact.startedAt,fact.endedAt,fact.eventId])).digest("hex");
  const messages=new Set(fact.publicMessages??[]);
  return {source:{...proof.source},key,eventId:key,kind:"copilot",recordId:fact.id,
   item:{id:fact.id,startedAt:fact.startedAt,endedAt:fact.endedAt,terminalStatus:fact.terminalStatus,...(fact.type?{type:fact.type}:{}),...(fact.description?{description:fact.description}:{}),...(messages.size?{hasTranscript:true}:{})},
   current:()=>proof.current(fact),verify:(allowed)=>proof.verify(fact,allowed),
   transcriptUnavailableReason:"Copilotの終了通知に対応する子自身の本文記録はまだ接続されていません",
   ...(fact.publicOmitted?{transcriptOmittedBefore:true}:{}),
   openRecord:async(purpose,allowed)=>purpose==="transcript"&&messages.size&&allowed()&&proof.current(fact)?proof.open?.(fact,allowed):undefined,
   entries:row=>{const message=copilotPublicMessage(row);return message&&message.child===fact.id&&messages.has(message.fingerprint)?[message.entry]:[];},
  };
 })};
}
