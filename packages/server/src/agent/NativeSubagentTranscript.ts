import { openMuseChildRecord, museChildEntries } from "./MuseChildRecord.js";
import { openAntigravityChildRecord, antigravityChildEntries } from "./AntigravityChildRecord.js";
import type { ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { RpcError, type AgentSubagentTranscriptResult, type Pane } from "@sodashitsu/protocol";
import { openCodexChildRecord, codexChildEntries } from "./CodexChildRecord.js";
import { readTranscriptHandle, TRANSCRIPT_TIMEOUT_MS } from "./SubagentTranscript.js";
import type { SubagentInfo } from "@sodashitsu/protocol";
interface Source { kind:"codex"|"agy"|"muse"; childSession?:string; publicInput?:{text:string;truncated:boolean}; instance: string; parent: string; item: SubagentInfo; }
interface Deps {
  session: {getPane(id:string):Pane|undefined;hasVerifiedAgentSession(pane:string,instance:string,session:string):boolean};
  home?: string;
  roots?: ExtraRoots;
  museChildSession?:(pane:string,child:string)=>string|undefined;
  museChildInput?:(pane:string,child:string)=>{text:string;truncated:boolean}|undefined;
  now?:()=>number;
}
/** Only an already reported owned child may grant this read-only, same-parent/instance capability. */
export class NativeSubagentTranscriptReader {
  private readonly grants = new Map<string,{source:Source;at:number}>();
  constructor(private readonly deps:Deps) {}
  private source(pane:string,child:string):Source|undefined {
    const p=this.deps.session.getPane(pane), a=p?.agent, ref=p?.agentSession;
    if(!a||!["codex","agy","muse"].includes(a.kind)||!a.instanceId||ref?.kind!==a.kind||!this.deps.session.hasVerifiedAgentSession(pane,a.instanceId,ref.sessionId))return undefined;
    const item=a.subagents?.items?.find(i=>i.id===child);
    const childSession=a.kind==="muse"?this.deps.museChildSession?.(pane,child):undefined;
    if(a.kind==="muse"&&!childSession)return undefined;
    const publicInput=a.kind==="muse"?this.deps.museChildInput?.(pane,child):undefined;
    return item?{kind:a.kind as "codex"|"agy"|"muse",instance:a.instanceId,parent:ref.sessionId,item,...(childSession?{childSession}:{}),...(publicInput?{publicInput}:{})}:undefined;
  }
  private current(pane:string,source:Source):boolean {
    const p=this.deps.session.getPane(pane);
    const binding=source.kind==="muse"?this.deps.museChildSession?.(pane,source.item.id):undefined;
    if(binding&&binding!==source.childSession)return false;
    return p?.agent?.kind===source.kind&&p.agent.instanceId===source.instance&&p.agentSession?.kind===source.kind&&p.agentSession.sessionId===source.parent&&this.deps.session.hasVerifiedAgentSession(pane,source.instance,source.parent);
  }
  async read(pane:string,child:string,offset:number|undefined):Promise<AgentSubagentTranscriptResult|undefined> {
    if(!["codex","agy","muse"].includes(this.deps.session.getPane(pane)?.agent?.kind??""))return undefined;
    const key=JSON.stringify([pane,child]), now=(this.deps.now??Date.now)(), live=this.source(pane,child), old=this.grants.get(key);
    const source=live??(old&&now-old.at<=30*60000&&this.current(pane,old.source)?old.source:undefined);
    if(!source){this.grants.delete(key);throw new RpcError("not_found","subagent not found");}
    const failure=():AgentSubagentTranscriptResult=>({status:"unreadable",reason:"子の正式な会話記録を確認できません",entries:[],offset:offset??0,reset:false,omittedBefore:false,running:false,state:"unknown"});
    let active=true,timer:ReturnType<typeof setTimeout>|undefined;
    const work=async():Promise<AgentSubagentTranscriptResult>=>{
      const opened=source.kind==="codex"?await openCodexChildRecord(this.deps.home??process.env.CODEX_HOME??join(homedir(),".codex"),source.parent,child):source.kind==="agy"?await openAntigravityChildRecord(source.parent,child,this.deps.roots??{}):await openMuseChildRecord(source.parent,source.childSession!,this.deps.roots??{});
      if(!opened)return failure();
      try{
        if(!active||!this.current(pane,source))return failure();
        const page=await readTranscriptHandle(opened,offset,source.kind==="codex"?codexChildEntries:source.kind==="agy"?row=>antigravityChildEntries(row,source.parent):row=>museChildEntries(row,source.childSession!));
        if(!active||!await opened.unchanged()||!active||!this.current(pane,source))return failure();
        this.grants.delete(key);this.grants.set(key,{source,at:now});
        while(this.grants.size>64)this.grants.delete(this.grants.keys().next().value!);
        if(source.publicInput&&(offset===undefined||page.reset)){
          const entries=[{kind:"prompt" as const,text:source.publicInput.text,...(source.publicInput.truncated?{truncated:true}:{})},...page.entries.slice(-199)];
          return {...page,entries,omittedBefore:page.omittedBefore||page.entries.length>199,running:live?.item.state==="working",state:live?.item.state??"unknown"};
        }
        return {...page,running:live?.item.state==="working",state:live?.item.state??"unknown"};
      }finally{await opened.fd.close();}
    };
    try{return await Promise.race([work().catch(failure),new Promise<AgentSubagentTranscriptResult>(resolve=>{timer=setTimeout(()=>{active=false;resolve(failure());},TRANSCRIPT_TIMEOUT_MS);})]);}
    finally{active=false;if(timer)clearTimeout(timer);}
  }
}
