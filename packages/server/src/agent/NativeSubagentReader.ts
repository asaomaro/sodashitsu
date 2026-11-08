import type {BigIntStats} from "node:fs";
import {randomUUID} from "node:crypto";
import {copilotTerminalBindings} from "./CopilotTerminalBindings.js";
import {museTerminalBindings} from "./MuseTerminalBindings.js";
import {codexTerminalBindings} from "./CodexTerminalBindings.js";
import type {CodexTerminalFact,MuseTerminalFact,CopilotTerminalFact} from "./NativeSubagentRecords.js";
import type {SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
import { readCodexControlStatus, type CodexControlTarget, type CodexObservedState } from "./CodexControlStatus.js";
import { MuseChildObservations } from "./MuseChildObservations.js";
import { CodexChildObservationCache } from "./CodexChildObservationCache.js";
import { GrokSubagentReader } from "./GrokSubagentReader.js";
import { CodexSubagentStream } from "./CodexSubagentStream.js";
import { readAntigravitySubagents } from "./AntigravitySubagentReader.js";
import { realpath, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { findCodexRecordFile } from "./codexSession.js";
import { openVerified, readRange, type OpenedFile } from "./safeFile.js";
import { openExtra, type ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { NativeSubagentRecords, type NativeSubagentKind } from "./NativeSubagentRecords.js";
import type { Subagents } from "./SubagentTracker.js";

export interface NativeSubagentSource {
  paneId: string;
  instanceId: string;
  kind: NativeSubagentKind | "agy" | "grok";
  sessionId: string;
}
interface State {
  namespace:string;
  inputRevision?:BigIntStats;
  codexEOF?:BigIntStats;
  museEOF?:BigIntStats;
  copilotEOF?:BigIntStats;
  key: string;
  fold: NativeSubagentRecords;
  offset: number;
  dev: number;
  ino: number;
  invalid: boolean;
  generation: number;
  observationEpoch: number;
  abort: AbortController;
  pending?: boolean;
  codex?: CodexSubagentStream;
  reading?: Promise<Subagents | undefined>;
}
const CHUNK = 4 * 1024 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_LINE = 256 * 1024;
const exactRevision=(a:BigIntStats,b:BigIntStats)=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>a[k]===b[k]);

/** Exact owned-session files only. No CLI/model launch, directory-wide transcript scan, or latest-session fallback. */
export class NativeSubagentReader {
  private readonly states = new Map<string, State>();
  private closed = false;
  private readonly codexObservations=new CodexChildObservationCache();
  private readonly grokReader:GrokSubagentReader;
  private observationEpoch=0;
  private terminalChecks=0;
  private readonly museObservations: Pick<MuseChildObservations,"readMany"|"forget">;
  private readonly agyStates = new Map<string, { key: string; reading?: Promise<Subagents | undefined> }>();
  constructor(private readonly roots: ExtraRoots & { codexHome?: string } = {}, private readonly codexStatus: (target: CodexControlTarget) => Promise<Map<string, CodexObservedState>> = readCodexControlStatus, museObservations?: Pick<MuseChildObservations,"readMany"|"forget">) { this.museObservations = museObservations ?? new MuseChildObservations(roots); this.grokReader=new GrokSubagentReader(roots); }

  forget(paneId: string): void { this.grokReader.forget(paneId); this.codexObservations.forget(paneId); this.museObservations.forget(); this.states.get(paneId)?.abort.abort(); this.states.delete(paneId); this.agyStates.delete(paneId); }
  close(): void { this.closed = true; for (const state of this.states.values()) state.abort.abort(); this.states.clear(); this.agyStates.clear(); this.museObservations.forget(); this.codexObservations.close(); this.grokReader.close(); }

  grokTerminals(source:NativeSubagentSource,current:()=>boolean):SubagentTerminalCollection {
    if(this.closed||source.kind!=="grok"||!current())return{status:"unavailable",bindings:[],incomplete:true};
    return this.grokReader.terminals(source,current);
  }

  codexTerminals(source:NativeSubagentSource,verified:()=>boolean,cwd:string):SubagentTerminalCollection {
    const unknown=():SubagentTerminalCollection=>({status:"pending",bindings:[],incomplete:true});
    const state=this.states.get(source.paneId),key=JSON.stringify([source.instanceId,source.kind,source.sessionId]);
    if(this.closed||source.kind!=="codex"||!verified()||!state||state.key!==key)return{status:"unavailable",bindings:[],incomplete:true};
    const facts=state.fold.codexTerminals();
    if(!facts||state.fold.codexParentCwd()!==cwd)return{status:state.pending?"pending":"unavailable",bindings:[],incomplete:true};
    if(!state.codexEOF)return unknown();
    const namespace=state.namespace;
    const current=(fact:CodexTerminalFact)=>!this.closed&&verified()&&this.states.get(source.paneId)===state&&state.key===key&&state.namespace===namespace&&!state.abort.signal.aborted&&!state.invalid&&!state.pending&&state.codexEOF!==undefined&&state.offset===Number(state.codexEOF.size)&&!state.codex?.partial&&state.fold.codexTerminals()?.some(now=>now.id===fact.id&&now.eventId===fact.eventId&&now.startedAt===fact.startedAt&&now.endedAt===fact.endedAt)===true;
    const verify=async(fact:CodexTerminalFact,allowed:()=>boolean)=>{
      if(!allowed()||!current(fact)||this.terminalChecks>=4)return false;this.terminalChecks++;
      let opened:OpenedFile|null=null,accepted=false;const revision=state.codexEOF!;
      try{opened=await this.open(source);if(!opened)return false;
        const fd=await opened.fd.stat({bigint:true});
        if(!allowed()||!current(fact)||!exactRevision(revision,fd)||state.codexEOF===undefined||!exactRevision(revision,state.codexEOF)||!await this.sameRecordPath(source,revision)||!allowed()||!current(fact))return false;
        const after=await opened.fd.stat({bigint:true});accepted=allowed()&&current(fact)&&exactRevision(revision,after)&&state.codexEOF!==undefined&&exactRevision(revision,state.codexEOF);
      }catch{return false;}finally{await opened?.fd.close().catch(()=>undefined);this.terminalChecks--;}
      return accepted&&allowed()&&current(fact)&&state.codexEOF!==undefined&&exactRevision(revision,state.codexEOF);
    };
    return codexTerminalBindings({source:{...source,kind:"codex"},home:this.roots.codexHome??process.env.CODEX_HOME??join(homedir(),".codex"),namespace,facts,current,verify});
  }

  museTerminals(source:NativeSubagentSource,verified:()=>boolean):SubagentTerminalCollection {
    const state=this.states.get(source.paneId),key=JSON.stringify([source.instanceId,source.kind,source.sessionId]);
    const unavailable=():SubagentTerminalCollection=>({status:"unavailable",bindings:[],incomplete:true});
    if(this.closed||source.kind!=="muse"||!verified()||!state||state.key!==key)return unavailable();
    const facts=state.fold.museTerminals();if(!facts||!state.museEOF)return{status:state.pending?"pending":"unavailable",bindings:[],incomplete:true};
    const namespace=state.namespace;
    const current=(fact:MuseTerminalFact)=>!this.closed&&verified()&&this.states.get(source.paneId)===state&&state.key===key&&state.namespace===namespace&&!state.abort.signal.aborted&&!state.invalid&&!state.pending&&state.museEOF!==undefined&&state.offset===Number(state.museEOF.size)&&state.fold.museTerminals()?.some(now=>now.id===fact.id&&now.childSession===fact.childSession&&now.eventId===fact.eventId&&now.startedAt===fact.startedAt&&now.endedAt===fact.endedAt)===true;
    const verify=async(fact:MuseTerminalFact,allowed:()=>boolean)=>{
      if(!allowed()||!current(fact)||this.terminalChecks>=4)return false;this.terminalChecks++;
      let opened:OpenedFile|null=null,accepted=false;const revision=state.museEOF!;
      try{opened=await this.open(source);if(!opened)return false;
        const before=await opened.fd.stat({bigint:true});
        if(!allowed()||!current(fact)||!exactRevision(revision,before)||state.museEOF===undefined||!exactRevision(revision,state.museEOF)||!await this.sameRecordPath(source,revision)||!allowed()||!current(fact))return false;
        const after=await opened.fd.stat({bigint:true});accepted=allowed()&&current(fact)&&exactRevision(revision,after)&&state.museEOF!==undefined&&exactRevision(revision,state.museEOF);
      }catch{return false;}finally{await opened?.fd.close().catch(()=>undefined);this.terminalChecks--;}
      return accepted&&allowed()&&current(fact)&&state.museEOF!==undefined&&exactRevision(revision,state.museEOF);
    };
    return museTerminalBindings({source:{...source,kind:"muse"},roots:this.roots,namespace,facts,current,verify});
  }

  copilotTerminals(source:NativeSubagentSource,verified:()=>boolean):SubagentTerminalCollection {
    const state=this.states.get(source.paneId),key=JSON.stringify([source.instanceId,source.kind,source.sessionId]);
    const unavailable=():SubagentTerminalCollection=>({status:"unavailable",bindings:[],incomplete:true});
    if(this.closed||source.kind!=="copilot"||!verified()||!state||state.key!==key)return unavailable();
    const facts=state.fold.copilotTerminals();if(!facts||!state.copilotEOF)return{status:state.pending?"pending":"unavailable",bindings:[],incomplete:true};
    const namespace=state.namespace;
    const current=(fact:CopilotTerminalFact)=>!this.closed&&verified()&&this.states.get(source.paneId)===state&&state.key===key&&state.namespace===namespace&&!state.abort.signal.aborted&&!state.invalid&&!state.pending&&state.copilotEOF!==undefined&&state.offset===Number(state.copilotEOF.size)&&state.fold.copilotTerminals()?.some(now=>now.id===fact.id&&now.eventId===fact.eventId&&now.startedAt===fact.startedAt&&now.endedAt===fact.endedAt)===true;
    const verify=async(fact:CopilotTerminalFact,allowed:()=>boolean)=>{
      if(!allowed()||!current(fact)||this.terminalChecks>=4)return false;this.terminalChecks++;
      let opened:OpenedFile|null=null,accepted=false;const revision=state.copilotEOF!;
      try{opened=await this.open(source);if(!opened)return false;
        const before=await opened.fd.stat({bigint:true});
        if(process.geteuid&&before.uid!==BigInt(process.geteuid())||!allowed()||!current(fact)||!exactRevision(revision,before)||state.copilotEOF===undefined||!exactRevision(revision,state.copilotEOF)||!await this.sameRecordPath(source,revision)||!allowed()||!current(fact))return false;
        const after=await opened.fd.stat({bigint:true});accepted=allowed()&&current(fact)&&exactRevision(revision,after)&&state.copilotEOF!==undefined&&exactRevision(revision,state.copilotEOF);
      }catch{return false;}finally{await opened?.fd.close().catch(()=>undefined);this.terminalChecks--;}
      return accepted&&allowed()&&current(fact)&&state.copilotEOF!==undefined&&exactRevision(revision,state.copilotEOF);
    };
    return copilotTerminalBindings({source:{...source,kind:"copilot"},namespace,facts,current,verify});
  }

  private async sameRecordPath(source:NativeSubagentSource,revision:BigIntStats):Promise<boolean>{
    const opened=await this.open(source);if(!opened)return false;
    try{return exactRevision(revision,await opened.fd.stat({bigint:true}));}finally{await opened.fd.close().catch(()=>undefined);}
  }

  /** Internal provider-owned relation, never a client path or a guessed child UUID. */
  museChildSession(source:NativeSubagentSource,child:string):string|undefined {
    const state=this.states.get(source.paneId);
    if(this.closed||source.kind!=="muse"||!state||state.invalid||state.pending||state.reading||state.key!==JSON.stringify([source.instanceId,source.kind,source.sessionId])||!state.fold.snapshot()?.items.some(item=>item.id===child))return undefined;
    return state.fold.museChildSession(child);
  }

  museChildInput(source:NativeSubagentSource,child:string):{text:string;truncated:boolean}|undefined {
    if(!this.museChildSession(source,child))return undefined;
    return this.states.get(source.paneId)?.fold.museChildInput(child);
  }

  /** Internal scheduling hint only; never a partial activity snapshot or public protocol value. */
  progress(source: NativeSubagentSource): { offset: number; pending: boolean; generation: number } | undefined {
    if(source.kind==="grok")return this.closed?undefined:this.grokReader.progress(source);
    const state=this.states.get(source.paneId);
    if(this.closed||source.kind==="agy"||!state||state.invalid||state.key!==JSON.stringify([source.instanceId,source.kind,source.sessionId]))return undefined;
    return {offset:state.offset,pending:state.pending===true,generation:state.generation};
  }

  async read(source: NativeSubagentSource,verified:()=>boolean=()=>true): Promise<Subagents | undefined> {
    if (this.closed||!verified()) return undefined;
    if(source.kind!=="codex")this.codexObservations.forget(source.paneId);
    if(source.kind!=="grok")this.grokReader.forget(source.paneId);
    if(source.kind==="grok"){
      this.states.get(source.paneId)?.abort.abort();this.states.delete(source.paneId);this.agyStates.delete(source.paneId);
      return this.grokReader.read(source,()=>!this.closed&&verified());
    }
    if (source.kind === "agy") return this.readAgy(source);
    this.agyStates.delete(source.paneId);
    const key = JSON.stringify([source.instanceId, source.kind, source.sessionId]);
    let state = this.states.get(source.paneId);
    if (!state || state.key !== key) {
      state?.abort.abort(); this.museObservations.forget();
      state = { namespace:randomUUID(), abort: new AbortController(), key, fold: new NativeSubagentRecords(source.kind, source.sessionId), offset: 0, dev: -1, ino: -1, invalid: false, generation: 0, observationEpoch: ++this.observationEpoch };
      this.states.set(source.paneId, state);
    }
    const current = state;
    current.reading ??= this.refresh(source, current).catch(() => { current.pending=false; return undefined; }).finally(() => { delete current.reading; });
    const value = await current.reading;
    return !this.closed && this.states.get(source.paneId) === current ? value : undefined;
  }

  private async readAgy(source: NativeSubagentSource): Promise<Subagents | undefined> {
    const key = JSON.stringify([source.instanceId, source.kind, source.sessionId]);
    // A kind change invalidates both reader families, including in-flight results.
    this.states.get(source.paneId)?.abort.abort();
    this.states.delete(source.paneId);
    let state = this.agyStates.get(source.paneId);
    if (!state || state.key !== key) { state = { key }; this.agyStates.set(source.paneId, state); }
    const current = state;
    current.reading ??= readAntigravitySubagents(source.sessionId, this.roots).catch(() => undefined).finally(() => { delete current.reading; });
    const value = await current.reading;
    return !this.closed && this.agyStates.get(source.paneId) === current ? value : undefined;
  }

  private async open(source: NativeSubagentSource): Promise<OpenedFile | null> {
    if (source.kind !== "codex") return openExtra(source.kind, source.sessionId, this.roots);
    const home = await realpath(this.roots.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex")).catch(() => null);
    if (!home) return null;
    const file = await findCodexRecordFile(home, source.sessionId);
    if (!file || !file.startsWith(join(home, "sessions") + sep) || await realpath(file).catch(() => null) !== file) return null;
    const opened = await openVerified(file);
    if (!opened) return null;
    try {
      const after = await lstat(file);
      if (after.dev !== opened.st.dev || after.ino !== opened.st.ino || await realpath(file) !== file) throw Error("record changed");
      return opened;
    } catch { await opened.fd.close(); return null; }
  }

  private async refresh(source: NativeSubagentSource, state: State): Promise<Subagents | undefined> {
    state.pending=false;
    const opened = await this.open(source);
    if (!opened) return undefined;
    try {
      const { fd, st } = opened;
      const live=()=>!this.closed&&this.states.get(source.paneId)===state&&!state.abort.signal.aborted;
      if(!live())return undefined;
      const scanRevision=await fd.stat({bigint:true});
      if(!live()||scanRevision&&scanRevision.size!==BigInt(st.size))return undefined;
      const rewritten=scanRevision&&state.inputRevision&&scanRevision.size===state.inputRevision.size&&!exactRevision(scanRevision,state.inputRevision);
      if (state.dev !== st.dev || state.ino !== st.ino || st.size < state.offset || rewritten) {
        state.namespace=randomUUID();delete state.codexEOF;delete state.museEOF;delete state.copilotEOF;delete state.inputRevision;
        state.generation++; this.museObservations.forget();
        state.offset = 0; state.fold = new NativeSubagentRecords(source.kind as NativeSubagentKind, source.sessionId); state.invalid = false;
        delete state.codex;
      }
      state.dev = st.dev; state.ino = st.ino;
      if (state.invalid || st.size > MAX_BYTES) return undefined;
      const bytes = await readRange(fd, state.offset, Math.min(CHUNK, st.size - state.offset));
      if(scanRevision){if(bytes.length){delete state.codexEOF;delete state.museEOF;delete state.copilotEOF;}state.inputRevision=scanRevision;}
      if (source.kind === "codex") {
        state.codex ??= new CodexSubagentStream();
        state.codex.consume(bytes, state.fold);
        state.offset += bytes.length;
        if (state.codex.invalid) state.invalid = true;
        state.pending=!state.invalid&&bytes.length>0&&state.offset<st.size;
        // A current snapshot requires all available bytes and a complete final line.
        if (state.invalid || state.offset < st.size || state.codex.partial) return undefined;
        const revision = await fd.stat({ bigint: true });
        if(!live())return undefined;
        if (!exactRevision(scanRevision!,revision)||!await this.sameRecordPath(source,revision)||!live()) { state.pending = live(); return undefined; }
        const sealAfter=await fd.stat({bigint:true});if(!live()||!exactRevision(revision,sealAfter)){state.pending=live();return undefined;}
        state.codexEOF=revision;
        const members = state.fold.snapshot();
        if (!members || !members.items?.length) return members;
        const current = live;
        const home = await realpath(this.roots.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"));
        const statuses = await this.codexStatus({ home, parentId: source.sessionId, childIds: members.items.map(item => item.id), signal: state.abort.signal, current }).catch(() => new Map<string, CodexObservedState>());
        if (!current()) return undefined;
        const observations = await this.codexObservations.read(home, source.sessionId, members.items, current, {paneId:source.paneId,instanceId:source.instanceId,generation:state.generation,epoch:state.observationEpoch});
        if (!current()) return undefined;
        // A new completion/interaction, replacement or truncation invalidates the old membership proof.
        const after = await fd.stat({ bigint: true }), reopened = await this.open(source);
        try {
          const afterPath = await reopened?.fd.stat({ bigint: true });
          const sameRevision = (value: typeof revision | undefined) => value !== undefined && (["dev", "ino", "size", "mtimeNs", "ctimeNs"] as const).every(key => value[key] === revision[key]);
          if (!sameRevision(after) || !sameRevision(afterPath)) {
            state.pending = current() && !state.invalid;
            return undefined;
          }
        } finally { await reopened?.fd.close(); }
        if (!current()) return undefined;
        return { ...members, countBasis: "alive", items: members.items.map(item => {
          // Creation metadata is never presented as current/last-turn observations.
          const {reasoningEffort: _effort, reasoningEffortBasis: _basis, model: _model, modelBasis: _modelBasis, hasTranscript: _transcript, ...base} = item;
          return {...base,...observations.get(item.id),state:statuses.get(item.id)??"unknown"};
        }) };
      }
      const scanning = state.offset + bytes.length < st.size;
      const end = bytes.lastIndexOf(10);
      if (end < 0) {
        if (bytes.length > MAX_LINE) state.invalid = true;
        // Muse child settings can change while its parent record stays at EOF.
        // Reuse the existing revision/current checks below for an empty EOF read.
        if (state.invalid || (source.kind !== "muse"&&source.kind!=="copilot") || bytes.length !== 0 || state.offset !== st.size) return state.invalid ? undefined : state.fold.snapshot();
      }
      let start = 0;
      while (start <= end) {
        const next = bytes.indexOf(10, start);
        if (next < 0 || next > end) break;
        if (next - start > MAX_LINE) state.invalid = true;
        else if (next > start) {
          try { state.fold.consume(JSON.parse(bytes.subarray(start, next).toString("utf8"))); }
          catch { state.invalid = true; }
        }
        start = next + 1;
      }
      state.offset += end + 1;
      state.pending=!state.invalid&&scanning&&end>=0;
      // Do not show a historical prefix as current activity until the full available record was folded.
      if (state.invalid || scanning) return undefined;
      const members=state.fold.snapshot();
      if((source.kind==="muse"||source.kind==="copilot")&&state.offset===st.size){
        const seal=await fd.stat({bigint:true});
        if(source.kind==="copilot"&&process.geteuid&&seal.uid!==BigInt(process.geteuid())){delete state.copilotEOF;return members;}
        if(!live()||!exactRevision(scanRevision!,seal)||!await this.sameRecordPath(source,seal)||!live())return undefined;
        const afterSeal=await fd.stat({bigint:true});if(!live()||!exactRevision(seal,afterSeal))return undefined;
        state[source.kind==="muse"?"museEOF":"copilotEOF"]=seal;
      }
      if(source.kind!=="muse"||!members?.items.length)return members;
      const revision=await fd.stat({bigint:true});
      if(revision.size!==BigInt(st.size))return undefined;
      const current=()=>!this.closed&&this.states.get(source.paneId)===state&&!state.abort.signal.aborted;
      const observations=await this.museObservations.readMany(source.sessionId,members.items,id=>state.fold.museChildSession(id),current);
      const after=await fd.stat({bigint:true}),reopened=await this.open(source);
      try{
        const path=await reopened?.fd.stat({bigint:true});
        if(!current()||!path||![path,after].every(value=>(["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k=>value[k]===revision[k])))return undefined;
      }finally{await reopened?.fd.close();}
      return {...members,items:members.items.map(item=>({...item,...observations.get(item.id)}))};
    } finally { await opened.fd.close(); }
  }
}
