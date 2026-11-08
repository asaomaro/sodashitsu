const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const text=(v:unknown,max:number):string|undefined=>typeof v==="string"&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(v)?v:undefined;
const generation=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
interface Common {
 type:"cursor_child";kind:"cursor";paneId:string;sessionId:string;childId:string;
 contextSessionId?:string;parentId?:string;agentPid?:number;
 /** True only for explicit child-self context. Parent-common fields are not observations. */
 settingsObserved:boolean;model?:string;reasoningEffort?:string;
}
export type CursorChildReport=Common&(
 {phase:"observation";generationId:string}
 |{phase:"stop";parentId:string;logicalId:string;childType:string;status:"completed"|"aborted"|"error";generationId?:string}
);

/** A private IPC whitelist. Never retain prompt/output/model_params objects or trust a caller's settingsObserved flag. */
export function cursorChildReport(value:unknown):CursorChildReport|undefined {
 const o=object(value);
 if(!o||o.type!=="cursor_child"||o.kind!=="cursor"||typeof o.paneId!=="string"||!text(o.paneId,64)||typeof o.sessionId!=="string"||!UUID.test(o.sessionId)||typeof o.childId!=="string"||!UUID.test(o.childId))return;
 const parentId=typeof o.parentId==="string"&&UUID.test(o.parentId)&&o.parentId!==o.childId?o.parentId:undefined;
 if(o.parentId!==undefined&&!parentId)return;
 const contextSessionId=typeof o.contextSessionId==="string"&&UUID.test(o.contextSessionId)?o.contextSessionId:undefined;
 if(o.contextSessionId!==undefined&&!contextSessionId)return;
 const agentPid=typeof o.agentPid==="number"&&Number.isSafeInteger(o.agentPid)&&o.agentPid>0&&o.agentPid<=0x7fffffff?o.agentPid:undefined;
 if(o.agentPid!==undefined&&agentPid===undefined)return;
 const settingsObserved=contextSessionId===o.childId;
 const model=settingsObserved?text(o.model,200):undefined;
 const effort=settingsObserved&&typeof o.reasoningEffort==="string"&&/^[A-Za-z0-9_.-]{1,64}$/.test(o.reasoningEffort)?o.reasoningEffort:undefined;
 const common:Common={type:"cursor_child",kind:"cursor",paneId:o.paneId,sessionId:o.sessionId,childId:o.childId,settingsObserved,
 ...(parentId?{parentId}:{}),...(contextSessionId?{contextSessionId}:{}),...(agentPid!==undefined?{agentPid}:{}),...(model?{model}:{}),...(effort?{reasoningEffort:effort}:{})};
 if(o.phase==="observation"){
  if(o.sessionId!==o.childId||contextSessionId!==o.childId||!generation(o.generationId))return;
  return {...common,phase:"observation",generationId:o.generationId};
 }
 if(o.phase!=="stop"||!parentId||o.sessionId!==parentId||!text(o.logicalId,128)||!text(o.childType,200)||typeof o.status!=="string"||!["completed","aborted","error"].includes(o.status)||o.generationId!==undefined&&!generation(o.generationId))return;
 return {...common,phase:"stop",parentId,logicalId:o.logicalId as string,childType:o.childType as string,status:o.status as "completed"|"aborted"|"error",...(generation(o.generationId)?{generationId:o.generationId}:{})};
}
