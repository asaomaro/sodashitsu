import {lstat,realpath} from "node:fs/promises";
import {dirname,join} from "node:path";
import {locateExtra,type ExtraRoots} from "../conversation/ExtraAgentRecords.js";
import {openVerified,readRange} from "./safeFile.js";
import {museSession} from "./museSession.js";
import {safeModel} from "../usage/claudeScan.js";
import {ASSISTANT_EFFORTS,type SubagentInfo} from "@sodashitsu/protocol";
type Observation=Pick<SubagentInfo,"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis">;
/** Per-parent/subagent/session cache; model source is durable run config, effort source is a default-state view. */
export class MuseChildObservations {
 private active=false;
 private readonly cache=new Map<string,{at:number;value:Observation}>();
 constructor(private readonly roots:ExtraRoots={},private readonly query:typeof museSession=museSession,private readonly now=Date.now){}
 forget():void{this.cache.clear();}
 async readMany(parent:string,items:readonly SubagentInfo[],binding:(id:string)=>string|undefined,current:()=>boolean):Promise<Map<string,Observation>>{
  const result=new Map<string,Observation>(),proofs=new Map<string,()=>Promise<boolean>>();if(items.length>64)return result;
  let next=0,active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const check=()=>active&&current();
  const worker=async()=>{while(check()){const item=items[next++];if(!item)return;const child=binding(item.id);if(!child)continue;const value=await this.read(parent,item,child,check,(model,proof)=>{if(check()){result.set(item.id,model);proofs.set(item.id,proof);}}).catch(()=>({}));if(check())result.set(item.id,value);}};
  try{await Promise.race([Promise.all(Array.from({length:4},()=>worker())),new Promise<void>(resolve=>{timer=setTimeout(()=>{active=false;resolve();},2000);})]);}
  finally{active=false;if(timer)clearTimeout(timer);}
  await Promise.all([...proofs].map(async([id,proof])=>{if(!await proof().catch(()=>false))result.delete(id);}));
  return current()?result:new Map();
 }
 async read(parent:string,item:SubagentInfo,child:string,current:()=>boolean,onDurable?:(model:Observation,proof:()=>Promise<boolean>)=>void):Promise<Observation>{
  if(!current())return {};
  const parentPath=await locateExtra("muse",parent,this.roots);if(!parentPath)return {};
  const path=join(dirname(parentPath),"subagent",child,"session.jsonl");
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(child)||child===parent||await realpath(path).catch(()=>null)!==path)return {};
  const leaf=await lstat(path).catch(()=>undefined);if(!leaf?.isFile()||leaf.isSymbolicLink()||leaf.nlink!==1)return {};
  const key=JSON.stringify([parent,item.id,child,leaf.dev,leaf.ino]),cached=this.cache.get(key);
  const opened=await openVerified(path);if(!opened)return {};
  try{
   if(opened.st.dev!==leaf.dev||opened.st.ino!==leaf.ino||(process.geteuid&&opened.st.uid!==process.geteuid()))return {};
   const rev=await opened.fd.stat({bigint:true}),start=Math.max(0,opened.st.size-256*1024),bytes=await readRange(opened.fd,start,opened.st.size-start);
   const model=museChildModel(bytes,child,item.startedAt,start>0);
   const unchanged=async()=>{
    const pathAfter=await lstat(path,{bigint:true}).catch(()=>undefined);
    return !!pathAfter&&!pathAfter.isSymbolicLink()&&await realpath(path).catch(()=>null)===path&&await locateExtra("muse",parent,this.roots)===parentPath&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>pathAfter[k]===rev[k]);
   };
   if(!current()||!await unchanged()||!current())return {};
   onDurable?.(model,unchanged);
   let defaults:Observation={},store=false;
   if(cached&&this.now()-cached.at<30000)defaults=cached.value;
   else if(!this.active){
    this.active=true;
    let deadline:ReturnType<typeof setTimeout>|undefined;
    // Keep the physical slot until the query closes, even if a broken provider ignores its timeout.
    const query=this.query("view/page",child,{roots:this.roots,timeoutMs:1000}).catch(()=>undefined).finally(()=>{this.active=false;});
    let page:any;
    try{page=await Promise.race([query,new Promise<undefined>(resolve=>{deadline=setTimeout(()=>resolve(undefined),1000);})]);}
    finally{if(deadline)clearTimeout(deadline);}
    defaults=museChildDefaultEffort(page,child);
    store=true;
   }
   const after=await opened.fd.stat({bigint:true}),pathAfter=await lstat(path,{bigint:true}).catch(()=>undefined);
   if(!pathAfter||!current()||await realpath(path).catch(()=>null)!==path||await locateExtra("muse",parent,this.roots)!==parentPath||![after,pathAfter].every(st=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===rev[k])))return {};
   if(store&&current()){this.cache.delete(key);this.cache.set(key,{at:this.now(),value:defaults});while(this.cache.size>64)this.cache.delete(this.cache.keys().next().value!);}
   return current()?{...model,...defaults}:{};
  }catch{return {};}
  finally{await opened.fd.close();}
 }
}
export function museChildModel(bytes:Buffer,child:string,startedAt:number,partialHead=false):Observation{
 const lines=bytes.toString("utf8").split("\n");if(partialHead)lines.shift();const partial=lines.pop();if(partial?.includes('"run.model.configured"'))return {};
 for(let i=lines.length-1;i>=0;i--){let r:any;try{r=JSON.parse(lines[i]!);}catch{continue;}
  if(r?.schema_version!==1||r.stream?.kind!=="session"||r.stream.id!==child||r.payload_type!=="run.model.configured")continue;
  if(r.payload_schema_version!==1||r.payload?.kind!=="run_model"||typeof r.recorded_at!=="number"||!Number.isFinite(r.recorded_at)||r.recorded_at/1000<startedAt)return {};
  const model=safeModel(r.payload.record?.model_id);return model?{model,modelBasis:"turn"}:{};
 }return {};
}
export function museChildDefaultEffort(page:any,child:string):Observation{
 let value:Observation={};
 if(!Array.isArray(page?.events))return value;
 for(const event of page.events){const p=event?.params;if(p?.sessionId!==child||event.method!=="session/reasoningEffortChanged")continue;
  const effort=p.reasoningEffort;
  value=typeof effort==="string"&&(ASSISTANT_EFFORTS.muse as readonly string[]).includes(effort)?{reasoningEffort:effort,reasoningEffortBasis:"session"}:{};
 }return value;
}
