import type{AgentUsage}from'@sodashitsu/protocol';
import{observedSetting}from'./executionSettings.js';
import type{UsageReport}from'./reportedUsage.js';
import type{UsageAdapter,UsageSourceInfo}from'./UsageService.js';
export interface CursorTurnFields{
 generationId:string;
 inputTokens?:number;outputTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;
 model?:string;reasoningEffort?:string;
}
export interface CursorTurnUsageReport extends UsageReport,CursorTurnFields{}
const keys=['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens']as const;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max)||undefined:undefined;
/** Numeric metadata only; no assistant text, task, output, transcript path or account data. */
export function cursorTurnFields(value:Record<string,unknown>):CursorTurnFields|undefined{
 if(typeof value.generationId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.generationId))return undefined;
 const present=keys.some(key=>value[key]!==undefined),complete=keys.every(key=>count(value[key]));
 if(present&&!complete)return undefined;
 if(complete&&(Number(value.cacheReadTokens)+Number(value.cacheWriteTokens)>Number(value.inputTokens)||!Number.isSafeInteger(Number(value.inputTokens)+Number(value.outputTokens))))return undefined;
 const model=clean(value.model,200),effort=observedSetting(value.reasoningEffort,'hook','hook');
 if(!complete&&!model&&!effort)return undefined;
 return{generationId:value.generationId,...(complete?{inputTokens:value.inputTokens as number,outputTokens:value.outputTokens as number,cacheReadTokens:value.cacheReadTokens as number,cacheWriteTokens:value.cacheWriteTokens as number}:{}),...(model?{model}:{}),...(effort?{reasoningEffort:effort.value}:{})};
}
type Counts={input:number;output:number;cacheRead:number;cacheWrite:number};
type State={proof:string;seen:Map<string,Counts|null>;totals:Counts;numeric:boolean;invalid:boolean;at:number;model:string|null;effort?:string};
const MAX_GENERATIONS=4096;
/** Reports observed since this server instance only, never full-account totals or current context. */
export class CursorHookUsageAdapter implements UsageAdapter{
 readonly kind='cursor';
 private closed=false;
 private states=new Map<string,State>();
 constructor(private readonly proof:(source:UsageSourceInfo)=>string|undefined,private readonly now:()=>number=Date.now){}
 forget(paneId:string){this.states.delete(paneId);}
 close(){this.closed=true;this.states.clear();}
 note(report:CursorTurnUsageReport){
  if(this.closed)return;
  const source={paneId:report.paneId,sessionId:report.sessionId,transcriptPath:undefined};
  const proof=this.proof(source),fields=cursorTurnFields(report as unknown as Record<string,unknown>);
  if(!proof||!fields)return;
  let state=this.states.get(source.paneId);
  if(!state||state.proof!==proof){state={proof,seen:new Map(),totals:{input:0,output:0,cacheRead:0,cacheWrite:0},numeric:false,invalid:false,at:0,model:null};this.states.set(source.paneId,state);}
  const counts=fields.inputTokens===undefined?null:{input:fields.inputTokens-fields.cacheReadTokens!-fields.cacheWriteTokens!,output:fields.outputTokens!,cacheRead:fields.cacheReadTokens!,cacheWrite:fields.cacheWriteTokens!};
  const before=state.seen.get(fields.generationId);
  if(before!==undefined){
   if(before&&counts&&keys.every(key=>{
    const k=({inputTokens:'input',outputTokens:'output',cacheReadTokens:'cacheRead',cacheWriteTokens:'cacheWrite'}as const)[key];return before[k]===counts[k];
   }))return;
   if(before&&counts){state.invalid=true;return;}
   if(!counts)return;
  }else if(state.seen.size>=MAX_GENERATIONS){state.invalid=true;return;}
  state.seen.set(fields.generationId,counts);
  if(counts){for(const key of ['input','output','cacheRead','cacheWrite']as const){const next=state.totals[key]+counts[key];if(!Number.isSafeInteger(next))state.invalid=true;else state.totals[key]=next;}state.numeric=true;}
  state.at=this.now();state.model=fields.model??null;
  if(fields.reasoningEffort!==undefined)state.effort=fields.reasoningEffort;else delete state.effort;
  if(this.proof(source)!==proof&&this.states.get(source.paneId)===state)this.states.delete(source.paneId);
 }
 async usageFor(source:UsageSourceInfo):Promise<Omit<AgentUsage,'paneId'|'kind'>|null>{
  if(this.closed)return null;
  const state=this.states.get(source.paneId);if(!state||this.proof(source)!==state.proof)return null;
  const totals=Object.values(state.totals).reduce((a,b)=>a+b,0),numeric=state.numeric&&!state.invalid&&Number.isSafeInteger(totals);
  return{model:state.model,tokens:{basis:'transcript',...(numeric?{...state.totals,total:totals}:{})},source:'hook',updatedAt:state.at,partial:true,
   ...(state.effort!==undefined?{reasoningEffort:state.effort,executionSettings:{reasoningEffort:{value:state.effort,source:'hook',basis:'hook'}}}:{})};
 }
}
