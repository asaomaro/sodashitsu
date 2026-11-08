import type {AgentSubagentUsageResult,SubagentUsage} from "@sodashitsu/protocol";
import {readRange} from "../agent/safeFile.js";
import {grokSessionUsage} from "./grokUsage.js";
import {SubagentUsageRecordReader,type ChildUsageRecord} from "./SubagentUsageRecordReader.js";
export interface SubagentUsageTarget {
 key:string;
 kind:"codex"|"claude"|"muse"|"agy"|"grok"|"copilot"|"cursor";
 recordId:string;
 startedAt:number;
 current():boolean;
 openRecord():Promise<ChildUsageRecord|undefined>;
}
interface Deps {resolve(pane:string,child:string):SubagentUsageTarget|undefined|Promise<SubagentUsageTarget|undefined>;}
const unavailable=(reason="子自身の利用状況をまだ確認できません"):AgentSubagentUsageResult=>({status:"unavailable",reason});
/** Explicit authenticated read-only query. No timer, model/CLI launch, parent/account lookup or implicit transcript access. */
export class SubagentUsageService {
 private readonly reader=new SubagentUsageRecordReader();
 private readonly inflight=new Map<string,object>();
 private active=0;
 private closed=false;
 constructor(private readonly deps:Deps){}
 close():void{this.closed=true;this.reader.close();}
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
    const target=await this.deps.resolve(pane,child);targetAtRead=target;if(!target||!alive()||!target.current()||!Number.isFinite(target.startedAt)||target.startedAt<0)return unavailable();
    if(target.kind==="copilot"||target.kind==="cursor")return unavailable("この種類の子自身の数値記録はまだ接続されていません");
    record=await target.openRecord();const current=()=>alive()&&target.current();if(!record||!current()||(process.geteuid&&record.st.uid!==process.geteuid()))return unavailable();
    let usage:SubagentUsage|undefined;
    if(target.kind==="grok"){
     const before=await record.fd.stat({bigint:true});if(!current()||!before.isFile()||before.nlink!==1n||before.size<1n||before.size>2n*1024n*1024n)return unavailable();
     const bytes=await readRange(record.fd,0,Number(before.size));if(!current())return unavailable();
     const after=await record.fd.stat({bigint:true});if(!current()||!(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>before[k]===after[k])||!await record.unchanged()||!current())return unavailable();
     const value=grokSessionUsage(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)),target.recordId);
     if(value&&value.updatedAt>=target.startedAt)usage={source:"grok-usage",consumptionScope:"subtree",observedAt:value.updatedAt,tokens:value.tokens,...(value.partial?{partial:true}:{}),...(value.costUsd!==undefined?{costUsd:value.costUsd,costBasis:"reported",...(value.costAsOf!==undefined?{costAsOf:value.costAsOf}:{})}:{}),...(value.costPartial?{costPartial:true}:{})};
    }else usage=await this.reader.read({key:target.key,kind:target.kind,recordId:target.recordId,startedAt:target.startedAt},record,current);
    return usage&&current()?{status:"ok",usage}:unavailable();
   }catch{return unavailable();}
   finally{await record?.fd.close().catch(()=>undefined);if(this.inflight.get(key)===token)this.inflight.delete(key);this.active--;}
  };
  try{const result=await Promise.race([work(),new Promise<AgentSubagentUsageResult>(resolve=>{timer=setTimeout(()=>{enabled=false;resolve(unavailable("子の利用状況の取得期限を超えました"));},2000);})]);return result.status!=="ok"||enabled&&!this.closed&&targetAtRead?.current()?result:unavailable();}
  finally{enabled=false;if(timer)clearTimeout(timer);}
 }
}
