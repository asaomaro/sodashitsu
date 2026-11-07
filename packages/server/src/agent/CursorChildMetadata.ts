import type { SubagentInfo } from "@sodashitsu/protocol";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const text=(v:unknown,max=128):string|undefined=>typeof v==="string"&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(v)?v:undefined;
export interface CursorChildLineage {id:string;parentId:string;rootParentId:string;toolCallId:string;type:string;createdAt:number}
/** Exact installed metadata serializer: meta[0] is hex-encoded UTF8 JSON.
 * Return only lineage fields. Authentication/encryption and conversation blobs
 * are deliberately not part of the result or a settings fallback. */
export function cursorChildLineage(value:unknown,parent:string,child:string):CursorChildLineage|undefined {
 if(!UUID.test(parent)||!UUID.test(child)||parent===child||typeof value!=="string"||value.length>262144||!(/^(?:[a-f0-9]{2})+$/i).test(value))return;
 let meta:Record<string,unknown>|undefined;
 try{meta=object(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.from(value,"hex"))));}catch{return;}
 const info=object(meta?.subagentInfo),type=text(info?.typeName,200),toolCallId=text(info?.toolCallId);
 if(meta?.agentId!==child||info?.parentAgentId!==parent||info?.rootParentAgentId!==parent||!type||!toolCallId||typeof meta.createdAt!=="number"||!Number.isSafeInteger(meta.createdAt)||meta.createdAt<0)return;
 return{id:child,parentId:parent,rootParentId:parent,toolCallId,type,createdAt:meta.createdAt};
}
export interface CursorChildStop {
 parentId:string;childId:string;logicalId:string;type:string;status:"completed"|"aborted"|"error";
 generationId?:string;
 settings:Pick<SubagentInfo,"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis">;
}
/** Stop identifies a finished child, never an active-count/working event.
 * Common hook settings are child observations only in exact child-self context. */
export function cursorChildStop(value:unknown):CursorChildStop|undefined {
 const p=object(value);if(!p||p.hook_event_name!=="subagentStop")return;
 const parent=p.parent_conversation_id,child=p.child_conversation_id,logicalId=text(p.subagent_id),type=text(p.subagent_type,200);
 if(typeof parent!=="string"||!UUID.test(parent)||typeof child!=="string"||!UUID.test(child)||parent===child||!logicalId||!type||typeof p.status!=="string"||!["completed","aborted","error"].includes(p.status))return;
 const settings:CursorChildStop["settings"]={};
 if(p.conversation_id===child&&(p.session_id===undefined||p.session_id===child)&&(p.sessionId===undefined||p.sessionId===child)){
  const model=text(p.model_id,200)??text(p.model,200);if(model){settings.model=model;settings.modelBasis="session";}
  const params=Array.isArray(p.model_params)&&p.model_params.length<=32?p.model_params.map(object).filter(q=>q?.id==="effort"):[];
  const effort=params.length===1?text(params[0]?.value,64):undefined;
  if(effort&&/^[a-zA-Z0-9_.-]+$/.test(effort)){settings.reasoningEffort=effort;settings.reasoningEffortBasis="session";}
 }
 const generation=text(p.generation_id);
 return{parentId:parent,childId:child,logicalId,type,status:p.status as CursorChildStop["status"],...(generation?{generationId:generation}:{}),settings};
}

/** Only an actual last, complete child JSONL turn marker proves terminal state.
 * A later prompt/message or a writing tail invalidates the old terminal marker. */
export function cursorChildTerminal(bytes:Buffer):"completed"|"aborted"|"error"|undefined {
 if(!bytes.length||bytes.at(-1)!==10)return;
 const lines=bytes.toString("utf8").trimEnd().split("\n");
 let row:Record<string,unknown>|undefined;try{row=object(JSON.parse(lines.at(-1)??""));}catch{return;}
 if(row?.type!=="turn_ended")return;
 return row.status==="success"?"completed":row.status==="aborted"?"aborted":row.status==="error"?"error":undefined;
}

/** The completion report alone is not a capability. A safe opened direct-child
 * record must independently agree on ownership, role and the last terminal state. */
export function cursorChildStopMatches(stop:CursorChildStop,lineage:CursorChildLineage,terminal:CursorChildStop["status"]|undefined):boolean {
 return stop.parentId===lineage.parentId&&lineage.rootParentId===stop.parentId&&stop.childId===lineage.id&&stop.type===lineage.type&&stop.status===terminal;
}
