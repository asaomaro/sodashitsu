import { homedir } from "node:os";
import { join } from "node:path";
import { RpcError, type AgentSubagentTranscriptResult, type Pane } from "@sodashitsu/protocol";
import { openCodexChildRecord, codexChildEntries } from "./CodexChildRecord.js";
import { readTranscriptHandle, TRANSCRIPT_TIMEOUT_MS } from "./SubagentTranscript.js";
import type { SubagentInfo } from "@sodashitsu/protocol";
interface Source { instance: string; parent: string; item: SubagentInfo; }
interface Deps {
  session: {getPane(id:string):Pane|undefined;hasVerifiedAgentSession(pane:string,instance:string,session:string):boolean};
  home?: string;
  now?:()=>number;
}
/** Only an already reported owned child may grant this read-only, same-parent/instance capability. */
export class NativeSubagentTranscriptReader {
  private readonly grants = new Map<string,{source:Source;at:number}>();
  constructor(private readonly deps:Deps) {}
  private source(pane:string,child:string):Source|undefined {
    const p=this.deps.session.getPane(pane), a=p?.agent, ref=p?.agentSession;
    if(a?.kind!=="codex"||!a.instanceId||ref?.kind!=="codex"||!this.deps.session.hasVerifiedAgentSession(pane,a.instanceId,ref.sessionId))return undefined;
    const item=a.subagents?.items?.find(i=>i.id===child);
    return item?{instance:a.instanceId,parent:ref.sessionId,item}:undefined;
  }
  private current(pane:string,source:Source):boolean {
    const p=this.deps.session.getPane(pane);
    return p?.agent?.kind==="codex"&&p.agent.instanceId===source.instance&&p.agentSession?.kind==="codex"&&p.agentSession.sessionId===source.parent&&this.deps.session.hasVerifiedAgentSession(pane,source.instance,source.parent);
  }
  async read(pane:string,child:string,offset:number|undefined):Promise<AgentSubagentTranscriptResult|undefined> {
    if(this.deps.session.getPane(pane)?.agent?.kind!=="codex")return undefined;
    const key=JSON.stringify([pane,child]), now=(this.deps.now??Date.now)(), live=this.source(pane,child), old=this.grants.get(key);
    const source=live??(old&&now-old.at<=30*60000&&this.current(pane,old.source)?old.source:undefined);
    if(!source){this.grants.delete(key);throw new RpcError("not_found","subagent not found");}
    const failure=():AgentSubagentTranscriptResult=>({status:"unreadable",reason:"子の正式な会話記録を確認できません",entries:[],offset:offset??0,reset:false,omittedBefore:false,running:false});
    let active=true,timer:ReturnType<typeof setTimeout>|undefined;
    const work=async():Promise<AgentSubagentTranscriptResult>=>{
      const opened=await openCodexChildRecord(this.deps.home??process.env.CODEX_HOME??join(homedir(),".codex"),source.parent,child);
      if(!opened)return failure();
      try{
        if(!active||!this.current(pane,source))return failure();
        const page=await readTranscriptHandle(opened,offset,codexChildEntries);
        if(!active||!await opened.unchanged()||!active||!this.current(pane,source))return failure();
        this.grants.delete(key);this.grants.set(key,{source,at:now});
        while(this.grants.size>64)this.grants.delete(this.grants.keys().next().value!);
        return {...page,running:live?.item.state==="working"};
      }finally{await opened.fd.close();}
    };
    try{return await Promise.race([work().catch(failure),new Promise<AgentSubagentTranscriptResult>(resolve=>{timer=setTimeout(()=>{active=false;resolve(failure());},TRANSCRIPT_TIMEOUT_MS);})]);}
    finally{active=false;if(timer)clearTimeout(timer);}
  }
}
