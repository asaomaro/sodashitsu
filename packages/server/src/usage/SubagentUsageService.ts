import type {BigIntStats} from "node:fs";
import type {AgentSubagentUsageResult,SubagentUsage} from "@sodashitsu/protocol";
import {readRange} from "../agent/safeFile.js";
import {grokSessionUsage} from "./grokUsage.js";
import {SubagentUsageRecordReader,verifyAppendedRecord,type ChildUsageRecord} from "./SubagentUsageRecordReader.js";
export interface SubagentUsageTarget {
 key:string;
 kind:"codex"|"claude"|"muse"|"agy"|"grok"|"copilot"|"cursor";
 recordId:string;
 startedAt:number;
 current():boolean;
 /** Only used for a grant issued by a prior successful current-target read. */
 historyCurrent?():boolean;
 openRecord(historical?:boolean):Promise<ChildUsageRecord|undefined>;
}
interface Deps {resolve(pane:string,child:string):SubagentUsageTarget|undefined|Promise<SubagentUsageTarget|undefined>;now?:()=>number;}
interface Grant {target:SubagentUsageTarget;at:number;revision:BigIntStats;}
const unavailable=(reason="子自身の利用状況をまだ確認できません"):AgentSubagentUsageResult=>({status:"unavailable",reason});
/** Explicit authenticated read-only query. No timer, model/CLI launch, parent/account lookup or implicit transcript access. */
export class SubagentUsageService {
 private readonly reader=new SubagentUsageRecordReader();
 private readonly inflight=new Map<string,object>();
 private active=0;
 private readonly grants=new Map<string,Grant>();
 private closed=false;
 constructor(private readonly deps:Deps){}
 close():void{this.closed=true;this.grants.clear();this.reader.close();}
 async read(pane:string,child:string):Promise<AgentSubagentUsageResult>{
  if(this.closed||this.active>=4)return unavailable();
  const key=JSON.stringify([pane,child]);if(this.inflight.has(key))return unavailable("子の利用状況を取得中です");
  const token={};this.inflight.set(key,token);this.active++;
  let targetAtRead:SubagentUsageTarget|undefined;
  let enabled=true,timer:ReturnType<typeof setTimeout>|undefined;
  const alive=()=>enabled&&!this.closed&&this.inflight.get(key)===token;
  const work=async():Promise<AgentSubagentUsageResult>=>{
   let record:ChildUsageRecord|undefined;
   try{
    const live=await this.deps.resolve(pane,child),now=(this.deps.now??Date.now)(),old=this.grants.get(key);
    if(!alive())return unavailable();
    if(old&&(now<old.at||now-old.at>30*60000||!old.target.historyCurrent?.()||live&&live.key!==old.target.key))this.grants.delete(key);
    const grant=this.grants.get(key),historical=!live;
    const target=live??grant?.target;targetAtRead=target;
    const authorized=()=>historical?target?.historyCurrent?.()===true:target?.current()===true;
    if(!target||!authorized()||!Number.isFinite(target.startedAt)||target.startedAt<0)return unavailable();
    if(historical&&target.kind==="grok")return unavailable("Grok子の履歴attemptの再確認はまだ接続されていません");
    if(target.kind==="copilot"||target.kind==="cursor")return unavailable("この種類の子自身の数値記録はまだ接続されていません");
    record=await target.openRecord(historical);const current=()=>alive()&&authorized();if(!record||!current()||(process.geteuid&&record.st.uid!==process.geteuid()))return unavailable();
    const openedRevision=await record.fd.stat({bigint:true});if(!current())return unavailable();
    if(grant&&(grant.revision.dev!==openedRevision.dev||grant.revision.ino!==openedRevision.ino||openedRevision.size<grant.revision.size||openedRevision.size===grant.revision.size&&(["mtimeNs","ctimeNs"] as const).some(k=>openedRevision[k]!==grant.revision[k])))this.reader.forget(target.key);
    let usage:SubagentUsage|undefined;
    if(target.kind==="grok"){
     const before=await record.fd.stat({bigint:true});if(!current()||!before.isFile()||before.nlink!==1n||before.size<1n||before.size>2n*1024n*1024n)return unavailable();
     const bytes=await readRange(record.fd,0,Number(before.size));if(!current())return unavailable();
     const after=await record.fd.stat({bigint:true});if(!current()||!(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>before[k]===after[k])||!await record.unchanged()||!current())return unavailable();
     const value=grokSessionUsage(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),target.recordId);
     if(value&&value.updatedAt>=target.startedAt)usage={source:"grok-usage",consumptionScope:"subtree",observedAt:value.updatedAt,tokens:value.tokens,...(value.partial?{partial:true}:{}),...(value.costUsd!==undefined?{costUsd:value.costUsd,costBasis:"reported",...(value.costAsOf!==undefined?{costAsOf:value.costAsOf}:{})}:{}),...(value.costPartial?{costPartial:true}:{})};
    }else {record=verifyAppendedRecord(record,openedRevision,()=>target.openRecord(historical),current);usage=await this.reader.read({key:target.key,kind:target.kind,recordId:target.recordId,startedAt:target.startedAt},record,current);}
    if(!usage||!current())return unavailable();
    const revision=record.confirmedRevision?.()??await record.fd.stat({bigint:true});if(!current())return unavailable();
    if(!historical){this.grants.delete(key);this.grants.set(key,{target,at:now,revision});while(this.grants.size>64)this.grants.delete(this.grants.keys().next().value!);}
    else if(grant){grant.revision=revision;usage={...usage,partial:true};}
    return {status:"ok",usage,...(historical?{reason:"確認済みの親子対応による履歴です。現在の子runは再確認できません"}:{})};
   }catch{return unavailable();}
   finally{await record?.fd.close().catch(()=>undefined);if(this.inflight.get(key)===token)this.inflight.delete(key);this.active--;}
  };
  try{const result=await Promise.race([work(),new Promise<AgentSubagentUsageResult>(resolve=>{timer=setTimeout(()=>{enabled=false;resolve(unavailable("子の利用状況の取得期限を超えました"));},2000);})]);return result.status!=="ok"||enabled&&!this.closed&&(targetAtRead?.current()||this.grants.get(key)?.target===targetAtRead&&targetAtRead?.historyCurrent?.())?result:unavailable();}
  finally{enabled=false;if(timer)clearTimeout(timer);}
 }
}
