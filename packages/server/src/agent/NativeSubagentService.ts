import type {SubagentTerminalCollection} from "./SubagentTerminalBinding.js";
import type { ClaudeChildSource } from "./ClaudeChildObservations.js";
import type { Pane } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import { NativeSubagentReader, type NativeSubagentSource } from "./NativeSubagentReader.js";
import type { Subagents } from "./SubagentTracker.js";

type Source=NativeSubagentSource|ClaudeChildSource;
interface Deps {
  observeClaude?: (source:ClaudeChildSource)=>Promise<Subagents|undefined>;
  session: { snapshot(): { panes: Pane[] }; getPane(id: string): Pane | undefined; setAgentSubagents(id: string, value: Subagents | undefined): boolean; hasVerifiedAgentSession(paneId: string, instanceId: string, sessionId: string): boolean };
  bus: Pick<EventBus, "subscribe">;
  reader?: Pick<NativeSubagentReader, "read" | "forget" | "close"> & Partial<Pick<NativeSubagentReader,"progress"|"museChildSession"|"museChildInput"|"grokTerminals">>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}
const sourceOf = (pane: Pane | undefined): Source | undefined => {
  const agent = pane?.agent, ref = pane?.agentSession;
  if (!pane || !agent || !ref || ref.kind !== agent.kind || !["codex", "muse", "copilot", "agy", "claude", "grok"].includes(agent.kind)) return undefined;
  return { paneId: pane.id, instanceId: agent.instanceId, kind: agent.kind as Source["kind"], sessionId: ref.sessionId };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Polls the current verified session; stale asynchronous reads never cross an instance/session change. */
export class NativeSubagentService {
  private readonly reader;
  private readonly sub;
  private readonly known = new Map<string, Source>();
  private timer: unknown;
  private readonly pending = new Map<string,Source>();
  private catchup = false;
  private lastFull: number | undefined;
  private burstStart: number | undefined;
  private fastTicks = 0;
  private cooldownUntil = 0;
  private running = false;
  private closed = false;
  constructor(private readonly deps: Deps) {
    this.reader = deps.reader ?? new NativeSubagentReader();
    this.sub = deps.bus.subscribe(event => {
      if (event.event === "pane.closed") { this.reader.forget(event.data.paneId); this.known.delete(event.data.paneId); this.pending.delete(event.data.paneId); }
    });
  }
  start(): void { if (!this.closed && this.timer === undefined) this.schedule(); }
  private now():number {return (this.deps.now??(()=>performance.now()))();}
  private budget(now:number):boolean {return this.burstStart!==undefined&&now-this.burstStart<10000&&this.fastTicks<32&&now>=this.cooldownUntil;}
  private schedule(): void {
    const fast=this.catchup, delay=fast?250:this.lastFull===undefined?2000:Math.max(0,2000-(this.now()-this.lastFull));
    this.timer = (this.deps.setTimer ?? ((fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }))(() => {
      this.timer = undefined;
      void this.refresh(fast).finally(() => { if (!this.closed) this.schedule(); });
    }, delay);
  }
  async refresh(fast=false): Promise<void> {
    if (this.closed || this.running) return;
    this.running = true;
    try {
      const sources = this.deps.session.snapshot().panes.map(sourceOf).filter((s): s is Source => s !== undefined && (s.kind!=="claude"||!!this.deps.observeClaude) && this.verified(s));
      const ids = new Set(sources.map(s => s.paneId));
      for(const [id,source] of this.pending)if(!sources.some(s=>s.paneId===id&&same(s,source)))this.pending.delete(id);
      const now=this.now(),full=!fast||this.lastFull===undefined||now-this.lastFull>=2000;
      if(!fast){this.burstStart=undefined;this.fastTicks=0;}
      const eligible=!fast||this.budget(now);
      // Catch-up reads only a rotating batch of four pending sources. Every two seconds
      // all sources still receive their normal poll, even during a large initial scan.
      const selected=full?sources:eligible?[...this.pending.values()].slice(0,4):[];
      this.catchup=false;
      if(fast&&eligible)this.fastTicks++;
      if(fast&&!eligible)this.cooldownUntil=now+2000;
      for (const [id, owner] of this.known) if (!ids.has(id)) {
        this.reader.forget(id); this.known.delete(id); this.pending.delete(id);
        const pane = this.deps.session.getPane(id);
        if (pane?.agent?.instanceId === owner.instanceId && pane.agent.kind === owner.kind && pane.agent.subagents !== undefined) this.deps.session.setAgentSubagents(id, undefined);
      }
      // Four bounded readers at once, independently of how many panes are open.
      for (let at = 0; at < selected.length && !this.closed; at += 4) await Promise.all(selected.slice(at, at + 4).map(async source => {
        const previous = this.known.get(source.paneId), before = this.deps.session.getPane(source.paneId);
        if (previous && !same(previous, source) && before?.agent?.instanceId === previous.instanceId && before.agent.kind === previous.kind && before.agent.subagents !== undefined) this.deps.session.setAgentSubagents(source.paneId, undefined);
        this.known.set(source.paneId, source);
        this.pending.delete(source.paneId);
        if(!same(source,sourceOf(before))||!this.verified(source))return;
        const position=source.kind==="claude"?undefined:this.reader.progress?.(source);
        let readRejected=false;
        const current=()=>!this.closed&&same(source,sourceOf(this.deps.session.getPane(source.paneId)))&&this.verified(source);
        const value = await (source.kind==="claude"?this.deps.observeClaude!(source):this.reader.read(source,current)).catch(() => {readRejected=true;return undefined;});
        const pane = this.deps.session.getPane(source.paneId);
        if (this.closed || !same(source, sourceOf(pane))) return;
        const verified=this.verified(source);
        // A stale/failed metadata supplement must not erase a newer Claude hook snapshot.
        if(source.kind==="claude"&&verified&&value===undefined)return;
        const accepted = verified ? value : undefined;
        const progress=source.kind==="claude"?undefined:this.reader.progress?.(source);
        if(verified&&!readRejected&&progress?.pending&&progress.offset>(position?.offset??0)&&(!position||progress.generation===position.generation))this.pending.set(source.paneId,source);
        if (!same(accepted, pane?.agent?.subagents)) this.deps.session.setAgentSubagents(source.paneId, accepted);
      }));
      const ended=this.now();
      if(full)this.lastFull=ended;
      if(!fast&&ended>=this.cooldownUntil&&this.pending.size)this.burstStart=ended;
      if(fast&&!this.budget(ended))this.cooldownUntil=Math.max(this.cooldownUntil,ended+2000);
      this.catchup=!this.closed&&this.pending.size>0&&this.budget(ended);
    } finally { this.running = false; }
  }
  private verified(source: Source): boolean {
    return this.deps.session.hasVerifiedAgentSession(source.paneId, source.instanceId, source.sessionId);
  }
  grokTerminals(paneId:string):SubagentTerminalCollection {
    const source=sourceOf(this.deps.session.getPane(paneId));
    const unavailable=():SubagentTerminalCollection=>({status:"unavailable",bindings:[],incomplete:true});
    if(this.closed||source?.kind!=="grok"||!same(source,this.known.get(paneId))||!this.verified(source))return unavailable();
    // This closure is parent ownership, never a completed API request's lease.
    const current=()=>!this.closed&&same(source,sourceOf(this.deps.session.getPane(paneId)))&&same(source,this.known.get(paneId))&&this.verified(source);
    return this.reader.grokTerminals?.(source,current)??unavailable();
  }
  museChildSession(paneId:string,child:string):string|undefined {
    const source=sourceOf(this.deps.session.getPane(paneId));
    if(!source||source.kind!=="muse"||!same(source,this.known.get(paneId))||!this.verified(source))return undefined;
    return this.reader.museChildSession?.(source,child);
  }
  museChildInput(paneId:string,child:string):{text:string;truncated:boolean}|undefined {
    const source=sourceOf(this.deps.session.getPane(paneId));
    if(!source||source.kind!=="muse"||!same(source,this.known.get(paneId))||!this.verified(source))return undefined;
    return this.reader.museChildInput?.(source,child);
  }
  close(): void {
    this.closed = true;
    this.sub.dispose();
    if (this.timer !== undefined) (this.deps.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = undefined; this.known.clear(); this.pending.clear(); this.reader.close();
  }
}
