import { ASSISTANT_EFFORTS, type SubagentInfo } from "@sodashitsu/protocol";
import { readRange } from "./safeFile.js";
import { openCodexChildRecord } from "./CodexChildRecord.js";
import { safeModel } from "../usage/claudeScan.js";
const TAIL=256*1024;
type Observation=Pick<SubagentInfo,"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis"|"hasTranscript">;
/** Latest complete recorded turn, never an inherited/default/creation guess. Fields replace as a pair. */
export function codexChildTurn(bytes:Buffer,startedAt:number,partialHead=false):Observation {
  const lines=bytes.toString("utf8").split("\n");
  if(partialHead)lines.shift();
  const partial=lines.pop();
  if(partial?.includes('"turn_context"'))return {};
  for(let n=lines.length-1;n>=0;n--){
    const line=lines[n]!;
    if(!line.includes('"turn_context"'))continue;
    let row:any;try{row=JSON.parse(line);}catch{return {};}
    if(row?.type!=="turn_context")continue;
    const at=Date.parse(row.timestamp),p=row.payload;
    if(!Number.isFinite(at)||at<startedAt||!p||typeof p!=="object"||Array.isArray(p))return {};
    const model=safeModel(p.model),effort=typeof p.effort==="string"&&(ASSISTANT_EFFORTS.codex as readonly string[]).includes(p.effort)?p.effort:undefined;
    return {...(model?{model,modelBasis:"turn" as const}:{}),...(effort?{reasoningEffort:effort,reasoningEffortBasis:"turn" as const}:{})};
  }
  return {};
}
/** Fixed total deadline/read size and concurrency. No daemon/model launch or parent/usage mutation. */
export async function readCodexChildObservations(home:string,parent:string,items:readonly SubagentInfo[],current:()=>boolean):Promise<Map<string,Observation>> {
  if(items.length>64)return new Map();
  const result=new Map<string,Observation>();let next=0,active=true,timer:ReturnType<typeof setTimeout>|undefined;
  const check=()=>active&&current();
  const work=async()=>{
    while(check()){
      const item=items[next++];if(!item)return;
      const opened=await openCodexChildRecord(home,parent,item.id).catch(()=>undefined);
      if(!opened)continue;
      try{
        if(!check())return;
        const start=Math.max(0,opened.st.size-TAIL),bytes=await readRange(opened.fd,start,opened.st.size-start);
        const observation=codexChildTurn(bytes,item.startedAt,start>0);
        if(!await opened.unchanged()||!check())continue;
        result.set(item.id,{...observation,hasTranscript:true});
      }catch{/* A metadata failure never erases proven membership. */}
      finally{await opened.fd.close().catch(()=>undefined);}
    }
  };
  try{await Promise.race([Promise.all(Array.from({length:4},()=>work())),new Promise<void>(resolve=>{timer=setTimeout(()=>{active=false;resolve();},2000);})]);}
  finally{active=false;if(timer)clearTimeout(timer);}
  return current()?result:new Map();
}
