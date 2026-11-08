import {randomUUID,createHash} from "node:crypto";
import type {ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import type {SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {SubagentTerminalBinding,SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
import {openAntigravityChildRecord,antigravityChildEntries} from "./AntigravityChildRecord.js";
import {readAgyTerminalSnapshot,verifyAgyTerminalSnapshot,sameAgyRevision,type AgyTerminalSnapshot,type AgyParentStamp,type AgyTerminalFact} from "./AntigravityTerminalSnapshot.js";
interface State {key:string;namespace:string;observed?:AgyParentStamp;snapshot?:AgyTerminalSnapshot;reading?:Promise<AgyTerminalSnapshot|undefined>}
const unavailable=():SubagentTerminalCollection=>({status:"unavailable",bindings:[],incomplete:true});
/** Dedicated history cache. Current/alive snapshots are never changed by this collector. */
export class AntigravityTerminalHistory {
 private readonly states=new Map<string,State>();private active=0;private closed=false;
 constructor(private readonly roots:ExtraRoots={}){}
 forget(pane:string):void{this.states.delete(pane);}
 close():void{this.closed=true;this.states.clear();}
 async read(source:SubagentHistorySource,owned:()=>boolean,allowed:()=>boolean=()=>true):Promise<SubagentTerminalCollection>{
  if(this.closed||source.kind!=="agy"||!owned()||!allowed())return unavailable();
  const key=JSON.stringify(source);let state=this.states.get(source.paneId);
  if(!state||state.key!==key){state={key,namespace:randomUUID()};this.states.delete(source.paneId);this.states.set(source.paneId,state);while(this.states.size>64)this.states.delete(this.states.keys().next().value!);}
  const entry=state,current=()=>!this.closed&&this.states.get(source.paneId)===entry&&entry.key===key&&owned();
  if(!entry.reading){
   if(this.active>=4)return{status:"pending",bindings:[],incomplete:true};this.active++;
   const valid=()=>current()&&allowed();
   entry.reading=(async()=>{
    try{
     if(entry.snapshot&&await verifyAgyTerminalSnapshot(source.sessionId,this.roots,entry.snapshot,valid)&&valid())return entry.snapshot;
     if(!valid())return;
     const snapshot=await readAgyTerminalSnapshot(source.sessionId,this.roots,valid,stamp=>{
      if(!valid())return;const previous=entry.observed;
      if(previous&&(previous.identity!==stamp.identity||stamp.revision.size<previous.revision.size||stamp.revision.size===previous.revision.size&&!sameAgyRevision(previous.revision,stamp.revision)))entry.namespace=randomUUID();
      entry.observed=stamp;
     });
     if(!valid())return;
     if(snapshot)entry.snapshot=snapshot;else delete entry.snapshot;
     return snapshot;
    }catch{if(valid())delete entry.snapshot;return;}
    finally{this.active--;}
   })().finally(()=>{delete entry.reading;});
  }
  const snapshot=await entry.reading;if(!current()||!allowed()||!snapshot||entry.snapshot!==snapshot)return unavailable();
  const namespace=entry.namespace;
  const isCurrent=(fact:AgyTerminalFact)=>fact.state==="SUBAGENT_STATE_KILLED"&&current()&&entry.namespace===namespace&&entry.snapshot?.facts.some(value=>value.key===fact.key)===true;
  const verify=async(fact:AgyTerminalFact,permit:()=>boolean)=>{
   if(!isCurrent(fact)||!permit()||this.active>=4)return false;const base=entry.snapshot!;this.active++;
   try{return await verifyAgyTerminalSnapshot(source.sessionId,this.roots,base,()=>permit()&&isCurrent(fact)&&entry.snapshot===base,fact)&&permit()&&isCurrent(fact)&&entry.snapshot===base;}
   finally{this.active--;}
  };
  return {status:"ok",incomplete:true,bindings:snapshot.facts.map<SubagentTerminalBinding>(fact=>{
   const current=()=>isCurrent(fact),check=(permit:()=>boolean)=>verify(fact,permit);
   const eventId=createHash("sha256").update(JSON.stringify([source,namespace,fact.key])).digest("hex");
   return {source:{...source},key:eventId,eventId,kind:"agy",recordId:fact.id,
    item:{id:fact.id,startedAt:fact.startedAt,terminalStatus:"aborted",...(fact.hasTranscript?{hasTranscript:true}:{}),...(fact.description?{description:fact.description}:{}),...(fact.type?{type:fact.type}:{})},current,verify:check,
    openRecord:async(_purpose,permit)=>{
     const live=()=>permit()&&current();if(!live()||!await check(live)||!live())return;
     const opened=await openAntigravityChildRecord(source.sessionId,fact.id,this.roots,()=>check(live));if(!opened)return;
     try{const unchanged=async()=>live()&&await opened.unchanged()&&await check(live)&&live();if(!await unchanged())throw Error("stopped child changed");return{...opened,unchanged};}
     catch{await opened.fd.close().catch(()=>undefined);return;}
    },entries:row=>antigravityChildEntries(row,source.sessionId),
   };
  })};
 }
}
