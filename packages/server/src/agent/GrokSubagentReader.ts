import {randomUUID,createHash} from "node:crypto";
import type {SubagentTerminalBinding,SubagentTerminalCollection,TerminalRecord} from "./SubagentTerminalBinding.js";
import {extraRecord} from "../conversation/ExtraAgentRecords.js";
import {entriesOfLine} from "./SubagentTranscript.js";
import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { GrokSubagentRecords } from "./GrokSubagentRecords.js";
import { grokChildModelChange } from "./GrokChildObservations.js";
import { locateGrokSession, openGrokSessionRecord, type GrokSessionRoots } from "./grokSession.js";
import { readRange, type OpenedFile } from "./safeFile.js";
import type { Subagents } from "./SubagentTracker.js";

export interface GrokSubagentSource { paneId: string; instanceId: string; sessionId: string }
interface State { namespace:string;key: string; generation: number; offset: number; fold: GrokSubagentRecords; dev: number; ino: number; invalid: boolean; pending: boolean; last?: {size:number;mtimeMs:number;ctimeMs:number}; reading?: Promise<Subagents | undefined> }
const CHUNK = 4 * 1024 * 1024, MAX_FILE = 512 * 1024 * 1024, MAX_LINE = 256 * 1024;
const identity = (a: {dev:number;ino:number}, b: {dev:number;ino:number}) => a.dev === b.dev && a.ino === b.ino;
const revision = (a: {size:number;mtimeMs:number;ctimeMs:number}, b: {size:number;mtimeMs:number;ctimeMs:number}) => a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

/** Exact verified parent record only, bounded incremental reads and four child
 * setting supplements. This never starts a provider, daemon or model. */
export class GrokSubagentReader {
  private readonly states = new Map<string, State>();
  private closed = false;
  private supplementSlots = 0;
  private proofSlots=0;
  constructor(private readonly roots: GrokSessionRoots = {}) {}
  private key(s: GrokSubagentSource): string { return JSON.stringify([s.instanceId, s.sessionId]); }
  forget(paneId: string): void { this.states.delete(paneId); }
  close(): void { this.closed = true; this.states.clear(); }
  progress(s: GrokSubagentSource): {offset:number;generation:number;pending:boolean}|undefined {
    const state = this.states.get(s.paneId);
    return state?.key === this.key(s) ? {offset:state.offset,generation:state.generation,pending:state.pending} : undefined;
  }
  read(source: GrokSubagentSource, verified: () => boolean): Promise<Subagents | undefined> {
    if (this.closed || !verified()) return Promise.resolve(undefined);
    const key = this.key(source);
    let state = this.states.get(source.paneId);
    if (!state || state.key !== key) {
      state = { namespace:randomUUID(),key, generation:(state?.generation ?? 0)+1, offset:0, fold:new GrokSubagentRecords(source.sessionId), dev:-1, ino:-1, invalid:false, pending:false };
      this.states.set(source.paneId, state);
    }
    if (state.reading) return state.reading;
    const own = state, current = () => !this.closed && this.states.get(source.paneId) === own && verified();
    const work = this.refresh(source, own, current).catch(() => {own.pending=false;return undefined;}).finally(() => { if (own.reading === work) delete own.reading; });
    own.reading = work;
    return work;
  }
  /** Private formal attempt proof. No scan, provider or model is started by this getter. */
  terminals(source:GrokSubagentSource,verified:()=>boolean):SubagentTerminalCollection {
    const unknown=(status:"unavailable"|"pending"="unavailable"):SubagentTerminalCollection=>({status,bindings:[],incomplete:true});
    const state=this.states.get(source.paneId),key=this.key(source);
    if(this.closed||!verified()||!state||state.key!==key)return unknown();
    if(state.invalid||state.pending||!state.last||state.offset!==state.last.size)return unknown("pending");
    const facts=state.fold.terminals();if(!facts)return unknown("pending");const namespace=state.namespace;
    const scope=()=>!this.closed&&verified()&&this.states.get(source.paneId)===state&&state.key===key&&state.namespace===namespace&&!state.invalid&&!state.pending&&state.last!==undefined&&state.offset===state.last.size;
    const bindings:SubagentTerminalBinding[]=facts.map(fact=>{
      const sameFact=()=>{const now=state.fold.terminal(fact.item.id);return now?.attempt===fact.attempt&&now.eventId===fact.eventId&&now.endedAt===fact.endedAt&&now.item.startedAt===fact.item.startedAt&&now.terminalStatus===fact.terminalStatus;};
      const current=()=>scope()&&sameFact();
      const verify=async(allowed:()=>boolean):Promise<boolean>=>{
        if(!allowed()||!current()||this.proofSlots>=4)return false;this.proofSlots++;
        let record:Awaited<ReturnType<GrokSubagentReader["open"]>>;
        try{
          const before={...state.last!};record=await this.open(source.sessionId);
          return !!record&&allowed()&&current()&&identity(state,record.opened.st)&&revision(before,record.opened.st)&&revision(before,state.last!)&&state.offset===record.opened.st.size&&await record.unchanged()&&allowed()&&current()&&revision(before,state.last!);
        }catch{return false;}finally{await record?.opened.fd.close().catch(()=>undefined);this.proofSlots--;}
      };
      const bindingKey=createHash("sha256").update(JSON.stringify([key,namespace,fact.item.id,fact.attempt,fact.eventId,fact.endedAt])).digest("hex");
      return{source:{...source,kind:"grok"},item:{...fact.item,terminalStatus:fact.terminalStatus,endedAt:fact.endedAt,hasTranscript:true},eventId:bindingKey,key:bindingKey,kind:"grok",recordId:fact.item.id,current,verify,
        openRecord:async(purpose,allowed):Promise<TerminalRecord|undefined>=>{
          if(!allowed()||!current()||!await verify(allowed))return;
          const location=await locateGrokSession(fact.item.id,this.roots);if(!location||!allowed()||!current())return;
          const name=purpose==="usage"?"usage.json":"chat_history.jsonl",opened=await openGrokSessionRecord(fact.item.id,name,this.roots);if(!opened)return;
          try{
            const file=join(location.dir,name),before=await opened.fd.stat({bigint:true});
            if(!before.isFile()||before.nlink!==1n||before.size>BigInt(MAX_FILE))throw Error("record limit");
            const unchanged=async()=>{
              if(!allowed()||!current())return false;
              const [leaf,fd,found]=await Promise.all([lstat(file,{bigint:true}).catch(()=>undefined),opened.fd.stat({bigint:true}).catch(()=>undefined),locateGrokSession(fact.item.id,this.roots)]);
              return allowed()&&current()&&found?.dir===location.dir&&await realpath(file).catch(()=>undefined)===file&&[leaf,fd].every(st=>!!st&&st.isFile()&&!st.isSymbolicLink()&&st.nlink===1n&&(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>st[k]===before[k]))&&await verify(allowed)&&allowed()&&current();
            };
            if(!await unchanged())throw Error("record changed");return{...opened,unchanged};
          }catch{await opened.fd.close().catch(()=>undefined);return;}
        },
        entries:row=>{if(!row||typeof row!=="object"||Array.isArray(row))return[];const value=extraRecord(row,"grok");return value?entriesOfLine({type:value.role,timestamp:value.at,message:{content:value.text}}):[];},
      };
    });
    return{status:"ok",bindings,incomplete:true};
  }
  private async open(id: string): Promise<{opened:OpenedFile;unchanged:()=>Promise<boolean>} | undefined> {
    const location = await locateGrokSession(id, this.roots);
    if (!location) return;
    const opened = await openGrokSessionRecord(id, "updates.jsonl", this.roots);
    if (!opened) return;
    const path = join(location.dir, "updates.jsonl");
    return { opened, unchanged: async () => {
      try {
        const [leaf, fd, found] = await Promise.all([lstat(path),opened.fd.stat(),locateGrokSession(id,this.roots)]);
        return found?.dir === location.dir && leaf.isFile() && !leaf.isSymbolicLink() && leaf.nlink === 1 &&
          await realpath(path) === path && identity(leaf,opened.st) && identity(fd,opened.st) && revision(leaf,opened.st) && revision(fd,opened.st);
      } catch {return false;}
    } };
  }
  private async refresh(source:GrokSubagentSource,state:State,current:()=>boolean):Promise<Subagents|undefined> {
    state.pending=false;
    if (!current()) return;
    const record=await this.open(source.sessionId);if(!record)return;
    const {opened}=record;
    try {
      if(!current())return;
      if(!identity(state,opened.st)||opened.st.size<state.offset||(state.last&&opened.st.size<=state.last.size&&!revision(state.last,opened.st))){state.dev=opened.st.dev;state.ino=opened.st.ino;state.offset=0;state.generation++;state.namespace=randomUUID();state.fold=new GrokSubagentRecords(source.sessionId);state.invalid=false;delete state.last;}
      // Remember rejected revisions too: an initially oversized/invalid line
      // leaves offset zero, but a subsequent in-place repair must reset the fold.
      state.last={size:opened.st.size,mtimeMs:opened.st.mtimeMs,ctimeMs:opened.st.ctimeMs};
      if(state.invalid||opened.st.size>MAX_FILE)return;
      const bytes=await readRange(opened.fd,state.offset,Math.min(CHUNK,opened.st.size-state.offset));
      if(!current())return;
      if(bytes.length){
        const end=bytes.lastIndexOf(10);
        if(end<0){if(bytes.length>MAX_LINE)state.invalid=true;return;}
        let start=0;
        while(start<=end){
          const lineEnd=bytes.indexOf(10,start);
          if(lineEnd<0||lineEnd-start>MAX_LINE){state.invalid=true;return;}
          if(lineEnd>start){try{state.fold.consume(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(start,lineEnd))));}catch{state.invalid=true;return;}}
          start=lineEnd+1;
        }
        state.offset+=end+1;
      }
      if(!await record.unchanged()){state.offset=0;state.generation++;state.namespace=randomUUID();state.fold=new GrokSubagentRecords(source.sessionId);return;}
      if(!current())return;
      if(state.offset<opened.st.size){state.pending=bytes.length===CHUNK;return;}
      const snapshot=state.fold.snapshot();if(!snapshot)return;
      // Parent fd and path revision remain pinned throughout asynchronous child reads.
      let next=0,active=true;const deadline=performance.now()+2000;
      const worker=async()=>{
        if(this.supplementSlots>=4)return;
        this.supplementSlots++;
        try{
        while(active&&current()&&performance.now()<deadline){
          const item=snapshot.items[next++];if(!item)return;
          const child=await this.open(item.id).catch(()=>undefined);if(!child)continue;
          try{
            if(!current()||child.opened.st.size>MAX_FILE)continue;
            const start=Math.max(0,child.opened.st.size-MAX_LINE),data=await readRange(child.opened.fd,start,child.opened.st.size-start);
            const observation=grokChildModelChange(data,item.id,item.startedAt,start>0);
            const unchanged=await child.unchanged();
            if(!unchanged||!active||!current())continue;
            if(observation.found){delete item.model;delete item.modelBasis;delete item.reasoningEffort;delete item.reasoningEffortBasis;Object.assign(item,observation.settings);}
          }catch{/* An optional child setting failure does not erase proven membership. */}finally{await child.opened.fd.close().catch(()=>undefined);}
        }
        }finally{this.supplementSlots--;}
      };
      let timer:ReturnType<typeof setTimeout>|undefined;
      // One supplement chain per parent leaves a slot for each of the service's
      // four concurrent sources, rather than letting the first parent monopolize all slots.
      try{await Promise.race([worker(),new Promise<void>(resolve=>{timer=setTimeout(()=>{active=false;resolve();},2000);})]);}
      finally{active=false;if(timer)clearTimeout(timer);}
      if(!current())return;
      if(!await record.unchanged()){state.offset=0;state.generation++;state.namespace=randomUUID();state.fold=new GrokSubagentRecords(source.sessionId);return;}
      return snapshot;
    } finally {await opened.fd.close().catch(()=>undefined);}
  }
}
