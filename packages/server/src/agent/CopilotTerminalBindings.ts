import {createHash} from "node:crypto";
import type {CopilotTerminalFact} from "./NativeSubagentRecords.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
interface Proof {source:SubagentHistorySource;namespace:string;facts:readonly CopilotTerminalFact[];current(fact:CopilotTerminalFact):boolean;verify(fact:CopilotTerminalFact,allowed:()=>boolean):Promise<boolean>}
/** toolCallId is not a child-session UUID. Never open the parent's record as child content or usage. */
export function copilotTerminalBindings(proof:Proof):SubagentTerminalCollection {
 return {status:"ok",incomplete:true,bindings:proof.facts.map<SubagentTerminalBinding>(fact=>{
  const key=createHash("sha256").update(JSON.stringify([proof.source,proof.namespace,fact.id,fact.startedAt,fact.endedAt,fact.eventId])).digest("hex");
  return {source:{...proof.source},key,eventId:key,kind:"copilot",recordId:fact.id,
   item:{id:fact.id,startedAt:fact.startedAt,endedAt:fact.endedAt,terminalStatus:fact.terminalStatus,...(fact.type?{type:fact.type}:{}),...(fact.description?{description:fact.description}:{})},
   current:()=>proof.current(fact),verify:(allowed)=>proof.verify(fact,allowed),
   transcriptUnavailableReason:"Copilotの終了通知に対応する子自身の本文記録はまだ接続されていません",
   openRecord:async()=>undefined,entries:()=>[],
  };
 })};
}
