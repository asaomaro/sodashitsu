import type { Pane } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import { NativeSubagentReader, type NativeSubagentSource } from "./NativeSubagentReader.js";
import type { Subagents } from "./SubagentTracker.js";

interface Deps {
  session: { snapshot(): { panes: Pane[] }; getPane(id: string): Pane | undefined; setAgentSubagents(id: string, value: Subagents | undefined): boolean; hasVerifiedAgentSession(paneId: string, instanceId: string, sessionId: string): boolean };
  bus: Pick<EventBus, "subscribe">;
  reader?: Pick<NativeSubagentReader, "read" | "forget" | "close">;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}
const sourceOf = (pane: Pane | undefined): NativeSubagentSource | undefined => {
  const agent = pane?.agent, ref = pane?.agentSession;
  if (!pane || !agent || !ref || ref.kind !== agent.kind || !["codex", "muse", "copilot", "agy"].includes(agent.kind)) return undefined;
  return { paneId: pane.id, instanceId: agent.instanceId, kind: agent.kind as NativeSubagentSource["kind"], sessionId: ref.sessionId };
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Polls the current verified session; stale asynchronous reads never cross an instance/session change. */
export class NativeSubagentService {
  private readonly reader;
  private readonly sub;
  private readonly known = new Map<string, NativeSubagentSource>();
  private timer: unknown;
  private running = false;
  private closed = false;
  constructor(private readonly deps: Deps) {
    this.reader = deps.reader ?? new NativeSubagentReader();
    this.sub = deps.bus.subscribe(event => {
      if (event.event === "pane.closed") { this.reader.forget(event.data.paneId); this.known.delete(event.data.paneId); }
    });
  }
  start(): void { if (!this.closed && this.timer === undefined) this.schedule(); }
  private schedule(): void {
    this.timer = (this.deps.setTimer ?? ((fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }))(() => {
      this.timer = undefined;
      void this.refresh().finally(() => { if (!this.closed) this.schedule(); });
    }, 2000);
  }
  async refresh(): Promise<void> {
    if (this.closed || this.running) return;
    this.running = true;
    try {
      const sources = this.deps.session.snapshot().panes.map(sourceOf).filter((s): s is NativeSubagentSource => s !== undefined && this.verified(s));
      const ids = new Set(sources.map(s => s.paneId));
      for (const [id, owner] of this.known) if (!ids.has(id)) {
        this.reader.forget(id); this.known.delete(id);
        const pane = this.deps.session.getPane(id);
        if (pane?.agent?.instanceId === owner.instanceId && pane.agent.kind === owner.kind && pane.agent.subagents !== undefined) this.deps.session.setAgentSubagents(id, undefined);
      }
      // Four bounded readers at once, independently of how many panes are open.
      for (let at = 0; at < sources.length && !this.closed; at += 4) await Promise.all(sources.slice(at, at + 4).map(async source => {
        const previous = this.known.get(source.paneId), before = this.deps.session.getPane(source.paneId);
        if (previous && !same(previous, source) && before?.agent?.instanceId === previous.instanceId && before.agent.kind === previous.kind && before.agent.subagents !== undefined) this.deps.session.setAgentSubagents(source.paneId, undefined);
        this.known.set(source.paneId, source);
        const value = await this.reader.read(source).catch(() => undefined);
        const pane = this.deps.session.getPane(source.paneId);
        if (this.closed || !same(source, sourceOf(pane))) return;
        const accepted = this.verified(source) ? value : undefined;
        if (!same(accepted, pane?.agent?.subagents)) this.deps.session.setAgentSubagents(source.paneId, accepted);
      }));
    } finally { this.running = false; }
  }
  private verified(source: NativeSubagentSource): boolean {
    return this.deps.session.hasVerifiedAgentSession(source.paneId, source.instanceId, source.sessionId);
  }
  close(): void {
    this.closed = true;
    this.sub.dispose();
    if (this.timer !== undefined) (this.deps.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = undefined; this.known.clear(); this.reader.close();
  }
}
