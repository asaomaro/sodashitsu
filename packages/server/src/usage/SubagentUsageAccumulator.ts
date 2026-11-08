import type {SubagentUsage,UsageTokenCounts} from "@sodashitsu/protocol";
import {createHash} from "node:crypto";
import {extraUsage} from "./extraEvents.js";
export type ChildUsageKind="codex"|"claude"|"muse"|"agy";
const object=(v:unknown):Record<string,any>|undefined=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,any>:undefined;
const count=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
const id=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=256&&!/[\x00-\x1f\x7f]/.test(v);
/** Numbers only: no prompt, response, tool body, account quota or parent total survives consume(). */
export class SubagentUsageAccumulator {
 private readonly seen=new Map<string,string>();
 private totals:UsageTokenCounts={};
 private records=0;
 private observedAt:number|undefined;
 private context:{tokens:number;window?:number;at:number}|undefined;
 partial=false;
 constructor(readonly kind:ChildUsageKind,readonly recordId:string,readonly startedAt:number){}
 private add(key:string,value:UsageTokenCounts,at:number):void{
  key=createHash("sha256").update(key).digest("hex");
  const digest=createHash("sha256").update(JSON.stringify(value)).digest("hex"),old=this.seen.get(key);
  if(old!==undefined){if(old!==digest)this.partial=true;return;}
  if(this.seen.size>=20000){this.partial=true;return;}
  const next={...this.totals};
  for(const field of ["input","output","cacheRead","cacheWrite","reasoning","total"] as const){const n=value[field];if(n!==undefined){const sum=(next[field]??0)+n;if(!count(sum)){this.partial=true;return;}next[field]=sum;}}
  this.seen.set(key,digest);this.totals=next;this.records++;this.observedAt=Math.max(this.observedAt??0,at);
 }
 consume(value:unknown):void{
  const row=object(value);if(!row||!id(this.recordId)||!Number.isFinite(this.startedAt)||this.startedAt<0)return;
  if(this.kind==="codex"){
   const at=typeof row.timestamp==="string"?Date.parse(row.timestamp):NaN,p=object(row.payload);
   if(!Number.isFinite(at)||at<this.startedAt||!p)return;
   if(row.type==="token_usage_record"){
    // A completed response belonging to this child, never thread_token_usage or a fork's inherited cumulative counter.
    if(p.thread_id!==this.recordId||!id(p.response_id))return;
    const u=object(p.usage);if(!u||!["input_tokens","output_tokens","total_tokens","cached_input_tokens","reasoning_output_tokens"].every(k=>count(u[k]))||!count(u.cache_write_input_tokens??0)||u.cached_input_tokens+(u.cache_write_input_tokens??0)>u.input_tokens){this.partial=true;return;}
    this.add(p.response_id,{input:u.input_tokens-u.cached_input_tokens-(u.cache_write_input_tokens??0),cacheRead:u.cached_input_tokens,cacheWrite:u.cache_write_input_tokens??0,output:u.output_tokens,reasoning:u.reasoning_output_tokens,total:u.total_tokens},at);
   }else if(row.type==="event_msg"&&p.type==="token_count"){
    const info=object(p.info),last=object(info?.last_token_usage),window=info?.model_context_window;
    if(last&&count(last.total_tokens)&&(!this.context||at>=this.context.at))this.context={tokens:last.total_tokens,...(count(window)&&window>0?{window}:{}),at};
   }
  }else if(this.kind==="claude"){
   if(row.type!=="assistant"||row.message?.model==="<synthetic>"||row.agentId!==undefined&&row.agentId!==this.recordId)return;
   const at=typeof row.timestamp==="string"?Date.parse(row.timestamp):NaN,m=object(row.message),u=object(m?.usage);
   if(!Number.isFinite(at)||at<this.startedAt||!id(m?.id)||!u)return;
   if(!count(u.input_tokens)||!count(u.output_tokens)||!count(u.cache_read_input_tokens??0)||!count(u.cache_creation_input_tokens??0)){this.partial=true;return;}
   this.add(m.id,{input:u.input_tokens,output:u.output_tokens,cacheRead:u.cache_read_input_tokens??0,cacheWrite:u.cache_creation_input_tokens??0},at);
   const tokens=u.input_tokens+(u.cache_read_input_tokens??0)+(u.cache_creation_input_tokens??0);
   if(count(tokens)&&(!this.context||at>=this.context.at))this.context={tokens,at};
  }else{
   const usage=extraUsage(row,this.kind,this.recordId);
   if(!usage||usage.at<this.startedAt)return;
   this.add(usage.id,{input:usage.input,output:usage.output,cacheRead:usage.cacheRead,cacheWrite:usage.cacheWrite},usage.at);
  }
 }
 snapshot(scanning=false):SubagentUsage|undefined{
  if(!this.records&&!this.context&&!scanning)return undefined;
  const at=Math.max(this.observedAt??0,this.context?.at??0);
  return {source:this.kind==="codex"?"rollout":this.kind==="claude"?"transcript":this.kind==="muse"?"muse-events":"agy-transcript",consumptionScope:"self",...(at?{observedAt:at}:{}),...(this.records?{tokens:{basis:"transcript",...this.totals}}:{}),...(this.context?{contextTokens:this.context.tokens,...(this.context.window?{contextWindowTokens:this.context.window,contextUsedPct:Math.min(100,Math.round(this.context.tokens/this.context.window*1000)/10)}:{})}:{}),...(this.partial?{partial:true}:{}),...(scanning?{scanning:true,partial:true}:{})};
 }
}
