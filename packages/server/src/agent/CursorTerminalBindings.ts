import type {CursorChildObservations} from "./CursorChildObservations.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
import {extraRecord} from "../conversation/ExtraAgentRecords.js";
import {entriesOfLine} from "./SubagentTranscript.js";
/** Formal Stop + exact database lineage + final child marker. No current-count inference. */
export function cursorTerminalBindings(observer:Pick<CursorChildObservations,"terminals">,source:SubagentHistorySource):SubagentTerminalCollection {
 if(source.kind!=="cursor")return{status:"unavailable",bindings:[],incomplete:true};
 const value=observer.terminals(source.paneId);if(value.status!=="ok")return{status:"unavailable",bindings:[],incomplete:true};
 const bindings:SubagentTerminalBinding[]=[];
 for(const binding of value.items){
  if(!binding.terminal||binding.source.paneId!==source.paneId||binding.source.instanceId!==source.instanceId||binding.source.kind!==source.kind||binding.source.sessionId!==source.sessionId||!binding.current())continue;
  const current=()=>binding.current();
  bindings.push({source:{...source},item:{id:binding.childId,type:binding.lineage.type,startedAt:binding.lineage.createdAt,terminalStatus:binding.terminal,hasTranscript:true,...binding.settings},eventId:binding.key,key:binding.key,kind:"cursor",recordId:binding.childId,current,
   verify:async allowed=>{if(!allowed()||!current())return false;const opened=await binding.openRecord(()=>allowed()&&current());if(!opened)return false;try{return allowed()&&current()&&await opened.unchanged()&&allowed()&&current();}finally{await opened.fd.close().catch(()=>undefined);}},
   openRecord:async(purpose,allowed)=>purpose==="transcript"&&allowed()&&current()?binding.openRecord(()=>allowed()&&current()):undefined,
   entries:row=>{if(!row||typeof row!=="object"||Array.isArray(row))return[];const value=extraRecord(row,"cursor");return value?entriesOfLine({type:value.role,timestamp:value.at,message:{content:value.text}}):[];},
  });
 }
 return{status:"ok",bindings,incomplete:true};
}
