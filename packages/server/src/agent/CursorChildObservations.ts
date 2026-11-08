import { createHash } from "node:crypto";
import type { Pane, SubagentInfo } from "@sodashitsu/protocol";
import { CursorChildRecords, type CursorChildRecord } from "./CursorChildRecord.js";
import { cursorChildStopMatches, type CursorChildLineage } from "./CursorChildMetadata.js";
import { cursorChildReport, type CursorChildReport } from "./CursorChildReports.js";

type Settings=Pick<SubagentInfo,"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis">;
interface Session {
 getPane(id:string):Pane|undefined;
 hasVerifiedAgentSession(pane:string,instance:string,parent:string):boolean;
 usageReportVerdict(pane:string,kind:string,pid:number|undefined,parent:string):{verdict:"accept"|"hold"|"reject"};
}
interface Source {key:string;paneId:string;instanceId:string;parentId:string;current():boolean}
interface Binding {source:Source;lineage:CursorChildLineage;settings:Settings;fileRevision:string;terminal?:"completed"|"aborted"|"error"}
interface Slot {binding?:Binding;conflict:boolean}
interface State {source:Source;slots:Map<string,Slot>;events:Map<string,{hash:string;conflict:boolean}>;incomplete:boolean;exhausted:boolean}
interface Job {source:Source;state:State;slot:Slot;report:CursorChildReport;expires:number}
export interface CursorChildBinding {
 source:{paneId:string;instanceId:string;kind:"cursor";sessionId:string};
 childId:string;lineage:CursorChildLineage;settings:Settings;terminal?:"completed"|"aborted"|"error";incomplete:boolean;
 /** Private metadata only: a consumer MUST additionally open/revalidate before publishing or reading. */
 current():boolean;
 openRecord(allowed?:()=>boolean):Promise<CursorChildRecord|undefined>;
}
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function revision(record:CursorChildRecord):Promise<string>{
 const st=await record.fd.stat({bigint:true});return digest([st.dev,st.ino,st.size,st.mtimeNs,st.ctimeNs].map(String));
}

/** Child-self settings are observations, NOT current membership or work state.
 * Only exact Stop+lineage+last complete child marker creates a terminal binding.
 * Nothing here changes AgentInfo.subagents, parent usage, permissions or sessions. */
export class CursorChildObservations {
 private readonly states=new Map<string,State>();
 private readonly queue:Job[]=[];
 private readonly records;
 private readonly runningKeys=new Set<string>();
 private active=0;private closed=false;
 constructor(private readonly deps:{session:Session;records?:Pick<CursorChildRecords,"open"|"close">;now?:()=>number}){this.records=deps.records??new CursorChildRecords();}
 private now(){return(this.deps.now??(()=>performance.now()))();}
 private source(paneId:string,pid:number|undefined):Source|undefined {
  const p=this.deps.session.getPane(paneId),a=p?.agent,ref=p?.agentSession;
  if(this.closed||a?.kind!=="cursor"||!a.instanceId||ref?.kind!=="cursor"||!this.deps.session.hasVerifiedAgentSession(paneId,a.instanceId,ref.sessionId)||this.deps.session.usageReportVerdict(paneId,"cursor",pid,ref.sessionId).verdict!=="accept")return;
  const instanceId=a.instanceId,parentId=ref.sessionId,key=JSON.stringify([paneId,instanceId,parentId]);
  return {key,paneId,instanceId,parentId,current:()=>{
   if(this.closed)return false;const now=this.deps.session.getPane(paneId);
   return now?.agent?.kind==="cursor"&&now.agent.instanceId===instanceId&&now.agentSession?.kind==="cursor"&&now.agentSession.sessionId===parentId&&this.deps.session.hasVerifiedAgentSession(paneId,instanceId,parentId)&&this.deps.session.usageReportVerdict(paneId,"cursor",pid,parentId).verdict==="accept";
  }};
 }
 /** Synchronous, bounded receipt. A report ACK never waits for SQLite/private-copy work. */
 offer(value:unknown):void {
  const report=cursorChildReport(value);if(!report)return;
  const source=this.source(report.paneId,report.agentPid);
  if(!source){const previous=this.states.get(report.paneId);if(previous&&!previous.source.current())this.forget(report.paneId);return;}
  if(report.childId===source.parentId||report.parentId!==undefined&&report.parentId!==source.parentId)return;
  let state=this.states.get(source.paneId);
  if(!state||state.source.key!==source.key){
   this.forget(source.paneId);
   state={source,slots:new Map(),events:new Map(),incomplete:false,exhausted:false};this.states.delete(source.paneId);this.states.set(source.paneId,state);
   while(this.states.size>64)this.forget(this.states.keys().next().value!);
  }
  let slot=state.slots.get(report.childId);
  if(!slot){if(state.slots.size>=64){state.incomplete=true;return;}slot={conflict:false};state.slots.set(report.childId,slot);}
  if(this.queue.length>=64){state.incomplete=true;return;}
  this.queue.push({source,state,slot,report,expires:this.now()+5000});this.pump();
 }
 private current(job:Job):boolean{return !this.closed&&this.now()<job.expires&&job.source.current()&&this.states.get(job.source.paneId)===job.state&&job.state.slots.get(job.report.childId)===job.slot;}
 private pump():void {
  while(!this.closed&&this.active<2&&this.queue.length){
   for(let i=this.queue.length-1;i>=0;i--)if(!this.current(this.queue[i]!))this.queue.splice(i,1);
   const key=(j:Job)=>JSON.stringify([j.source.key,j.report.childId]);
   const at=this.queue.findIndex(j=>!this.runningKeys.has(key(j)));if(at<0)return;
   const job=this.queue.splice(at,1)[0]!,owned=key(job);this.active++;this.runningKeys.add(owned);
   // Same-child AAR and Stop follow receipt order. Other children still use two bounded workers.
   void this.process(job).catch(()=>{if(this.current(job))job.state.incomplete=true;}).finally(()=>{this.runningKeys.delete(owned);this.active--;this.pump();});
  }
 }
 private async process(job:Job):Promise<void>{
  for(let attempt=0;attempt<4&&this.current(job);attempt++){
   if(!await this.read(job))return;
   await new Promise<void>(resolve=>setTimeout(resolve,100));
  }
 }
 private async read(job:Job):Promise<true|undefined>{
  const current=()=>this.current(job);
  const opened=await this.records.open(job.source.parentId,job.report.childId,current);if(!opened)return;
  try{
   if(!current()||!await opened.unchanged()||!current())return;
   const fileRevision=await revision(opened);if(!current()||!await opened.unchanged()||!current())return;
   const {report,state,slot}=job,old=slot.binding;
   if(old&&digest(old.lineage)!==digest(opened.lineage)){delete slot.binding;slot.conflict=true;state.incomplete=true;return;}
   if(slot.conflict)return;
   if(report.phase==="observation"){
    if(old?.terminal||state.exhausted)return;
   }else{
    if(!cursorChildStopMatches({parentId:report.parentId,childId:report.childId,logicalId:report.logicalId,type:report.childType,status:report.status,settings:{}},opened.lineage,opened.terminal)){
     // A just-received formal Stop may precede its final transcript flush.
     // Retry only missing terminal data, at most four read-only opens within this job's lease.
     if(opened.terminal===undefined&&opened.lineage.type===report.childType)return true;
     return;
    }
   }
   const eventKey=JSON.stringify([report.phase,report.childId,report.generationId??fileRevision]);
   const hash=digest([report.phase,report.settingsObserved,report.model,report.reasoningEffort,report.phase==="stop"?[report.logicalId,report.childType,report.status]:null]);
   const seen=state.events.get(eventKey);
   if(seen){
    if(seen.hash!==hash||seen.conflict){seen.conflict=true;slot.conflict=true;state.incomplete=true;delete slot.binding;}
    return;
   }
   if(state.events.size>=4096){
    state.exhausted=true;state.incomplete=true;
    for(const child of state.slots.values())if(child.binding)child.binding={...child.binding,settings:{}};
    if(report.phase==="observation")return;
   }else state.events.set(eventKey,{hash,conflict:false});
   const settings:Settings=state.exhausted?{}:report.settingsObserved?{
    ...(report.model?{model:report.model,modelBasis:"session" as const}:{}),
    ...(report.reasoningEffort?{reasoningEffort:report.reasoningEffort,reasoningEffortBasis:"session" as const}:{}),
   }:old?.settings??{};
   slot.binding={source:job.source,lineage:{...opened.lineage},settings:{...settings},fileRevision,...(report.phase==="stop"?{terminal:report.status}:{})};
  }finally{await opened.fd.close();}
 }
 /** No active-list inference: these are private observations for later verified history consumers. */
 binding(paneId:string,childId:string):CursorChildBinding|undefined {
  const state=this.states.get(paneId),slot=state?.slots.get(childId),binding=slot?.binding;
  if(!state||!slot||!binding||slot.conflict)return;
  if(!binding.source.current()){this.forget(paneId);return;}
  const current=()=>!this.closed&&binding.source.current()&&this.states.get(paneId)===state&&state.slots.get(childId)===slot&&slot.binding===binding&&!slot.conflict;
  return {source:{paneId,instanceId:binding.source.instanceId,kind:"cursor",sessionId:binding.source.parentId},childId,lineage:{...binding.lineage},settings:{...binding.settings},incomplete:state.incomplete,...(binding.terminal?{terminal:binding.terminal}:{}),current,
   openRecord:async(allowed=()=>true)=>{
    const readable=()=>current()&&allowed();if(!readable())return;
    const opened=await this.records.open(binding.source.parentId,childId,readable);if(!opened)return;
    try{
     if(!readable()||digest(opened.lineage)!==digest(binding.lineage)||await revision(opened)!==binding.fileRevision||binding.terminal!==undefined&&opened.terminal!==binding.terminal||!await opened.unchanged()||!readable()){await opened.fd.close();return;}
     return {...opened,unchanged:async()=>readable()&&await opened.unchanged()&&readable()};
    }catch{await opened.fd.close();return;}
   }};
 }
 terminals(paneId:string):{status:"unavailable"|"ok";items:CursorChildBinding[];incomplete:true}{
  const state=this.states.get(paneId);if(!state)return{status:"unavailable",items:[],incomplete:true};
  if(!state.source.current()){this.forget(paneId);return{status:"unavailable",items:[],incomplete:true};}
  return {status:"ok",items:[...state.slots.keys()].map(id=>this.binding(paneId,id)).filter((b):b is CursorChildBinding=>b?.terminal!==undefined),incomplete:true};
 }
 forget(paneId:string):void{const state=this.states.get(paneId);state?.events.clear();state?.slots.clear();this.states.delete(paneId);for(let i=this.queue.length-1;i>=0;i--)if(this.queue[i]!.source.paneId===paneId)this.queue.splice(i,1);}
 close():void{if(this.closed)return;this.closed=true;for(const id of this.states.keys())this.forget(id);this.queue.length=0;this.records.close();}
}
