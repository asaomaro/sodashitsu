import type {AgentSubagentHistoryParams,AgentSubagentHistoryResult,AgentSubagentHistoryTranscriptParams,AgentSubagentHistoryTranscriptResult,AgentSubagentHistoryUsageParams,AgentSubagentHistoryUsageResult,Pane} from "@sodashitsu/protocol";
import {SubagentTerminalHistory,type SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
import {SubagentUsageService} from "../usage/SubagentUsageService.js";
import {readTranscriptHandle} from "./SubagentTranscript.js";
interface Session {getPane(id:string):Pane|undefined;hasVerifiedAgentSession(pane:string,instance:string,parent:string):boolean}
const unavailableHistory=():AgentSubagentHistoryResult=>({status:"unavailable",items:[],offset:0,reset:true,more:false,omittedBefore:false,incomplete:true});
const unreadable=():AgentSubagentHistoryTranscriptResult=>({status:"unreadable",reason:"選択した終了履歴の正式な対応を確認できません",entries:[],offset:0,reset:true,omittedBefore:false,running:false,state:"unknown"});
/** Separate history-only readers. An expired selector never falls back to a current child. */
export class SubagentHistoryService {
 private readonly history:SubagentTerminalHistory<SubagentTerminalBinding>;
 private readonly usage:SubagentUsageService;
 private active=0;private closed=false;
 constructor(private readonly deps:{session:Session;collect(source:SubagentHistorySource,allowed:()=>boolean):Promise<SubagentTerminalCollection>|SubagentTerminalCollection}){
  this.history=new SubagentTerminalHistory(deps.session);
  this.usage=new SubagentUsageService({resolve:async(pane,entryId)=>{
   const grant=await this.history.grantEntry(pane,entryId,()=>!this.closed),target=grant?.proof?.target;
   const startedAt=target?.usageStartedAt??grant?.item.startedAt;
   if(!grant||!target||typeof startedAt!=="number"||!Number.isFinite(startedAt)||startedAt<0)return;
   const current=()=>!this.closed&&grant.current()&&target.current();
   return{key:JSON.stringify([entryId,target.key]),kind:target.kind,recordId:target.recordId,startedAt,current,
    openRecord:async()=>current()?target.openRecord("usage",current):undefined};
  }});
 }
 close():void{this.closed=true;this.history.close();this.usage.close();}
 forget(pane:string):void{this.history.forget(pane);}
 private async bounded<T>(fallback:()=>T,allowed:()=>boolean,work:(current:()=>boolean)=>Promise<T>):Promise<T>{
  if(this.closed||this.active>=4||!allowed())return fallback();this.active++;
  let active=true,timer:ReturnType<typeof setTimeout>|undefined;const current=()=>active&&!this.closed&&allowed();
  const running=work(current).catch(fallback).finally(()=>{this.active--;});
  try{const value=await Promise.race([running,new Promise<T>(resolve=>{timer=setTimeout(()=>{active=false;resolve(fallback());},2000);})]);return current()?value:fallback();}
  finally{active=false;if(timer)clearTimeout(timer);}
 }
 private async sync(pane:string,current:()=>boolean):Promise<void>{
  const source=this.history.source(pane);if(!source||!current())return;
  const result=await this.deps.collect(source,()=>current()&&this.history.current(source));
  if(!current()||!this.history.current(source)||result.status==="unavailable")return;
  this.history.mark(source,result.status,result.incomplete);
  for(const target of result.bindings.slice(0,256)){
   if(!current()||!this.history.current(source))return;
   if(target.source.paneId!==source.paneId||target.source.kind!==source.kind||target.source.instanceId!==source.instanceId||target.source.sessionId!==source.sessionId||!target.current())continue;
   this.history.note(source,target.item,target.eventId,check=>target.verify(check),{target,current:target.current});
  }
 }
 read(params:AgentSubagentHistoryParams,allowed:()=>boolean=()=>true):Promise<AgentSubagentHistoryResult>{
  return this.bounded(unavailableHistory,allowed,async current=>{await this.sync(params.paneId,current);return this.history.read(params,current);});
 }
 transcript(params:AgentSubagentHistoryTranscriptParams,allowed:()=>boolean=()=>true):Promise<AgentSubagentHistoryTranscriptResult>{
  return this.bounded(unreadable,allowed,async current=>{
   const grant=await this.history.grant(params.paneId,params.agentId,current,params.entryId),target=grant?.proof?.target;if(!grant||!target)return unreadable();
   const owned=()=>current()&&grant.current()&&target.current();const opened=await target.openRecord("transcript",owned);if(!opened)return target.transcriptUnavailableReason&&owned()?{...unreadable(),reason:target.transcriptUnavailableReason}:unreadable();
   try{
    if(!owned()||process.geteuid&&opened.st.uid!==process.geteuid())return unreadable();
    const page=await readTranscriptHandle(opened,params.offset,target.entries);
    if(!owned()||!await opened.unchanged()||!owned())return unreadable();
    return{...page,running:false,state:"unknown",terminalStatus:grant.item.terminalStatus};
   }finally{await opened.fd.close().catch(()=>undefined);}
  });
 }
 usageRead(params:AgentSubagentHistoryUsageParams,allowed:()=>boolean=()=>true):Promise<AgentSubagentHistoryUsageResult>{
  const unavailable=():AgentSubagentHistoryUsageResult=>({status:"unavailable",reason:"選択した終了履歴の利用状況を確認できません"});
  return this.bounded(unavailable,allowed,async current=>{
   const grant=await this.history.grant(params.paneId,params.agentId,current,params.entryId);if(!grant)return unavailable();
   const value=await this.usage.read(params.paneId,params.entryId);return current()&&grant.current()?value:unavailable();
  });
 }
}
