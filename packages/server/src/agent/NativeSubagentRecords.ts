import { ASSISTANT_EFFORTS } from "@sodashitsu/protocol";
import type { SubagentInfo } from "@sodashitsu/protocol";
import type { Subagents } from "./SubagentTracker.js";

export type NativeSubagentKind = "codex" | "muse" | "copilot";
const ID = /^[A-Za-z0-9_:.-]{1,128}$/;
const MAX = 256;
const label = (v: unknown, max: number): string | undefined =>
  typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max) || undefined : undefined;
const object = (v: unknown): Record<string, any> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : undefined;

/** Folds only provider-owned lifecycle facts, never tool prompt text or inferred process counts. */
export class NativeSubagentRecords {
  private readonly museBindings = new Map<string, string>();
  museChildSession(id: string): string | undefined { return this.museBindings.get(id); }
  private readonly items = new Map<string, SubagentInfo>();
  private readonly metadata = new Map<string, Partial<SubagentInfo>>();
  private readonly uncertain = new Set<string>();
  private readonly records = new Set<string>();
  // Bounded, exact-parent start proofs survive task completion, not interruption/unknown kinds.
  private readonly codexRelations = new Map<string, { item: SubagentInfo; completed: boolean }>();
  private readonly codexReferences = new Map<string, SubagentInfo>();
  private codexMalformed = false;
  private copilotMalformed = false;
  private seen = false;
  private limited = false;
  constructor(readonly kind: NativeSubagentKind, readonly sessionId: string) {}

  consume(value: unknown): void {
    const row = object(value);
    if (!row) return;
    if (this.kind === "codex") this.codex(row);
    else if (this.kind === "muse") this.muse(row);
    else this.copilot(row);
  }

  snapshot(): Subagents | undefined {
    if (!this.seen || this.limited || this.codexMalformed || this.copilotMalformed) return undefined;
    if (this.uncertain.size) {
      if (this.kind !== "codex" || [...this.uncertain].some(id => !this.codexReferences.has(id))) return undefined;
      const members = [
        ...[...this.items.values()].map(item => ({ ...item, state: "working" as const })),
        ...[...this.uncertain].map(id => ({ ...this.codexReferences.get(id)! })),
      ].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
      return { count: members.length, countBasis: "alive", items: members.slice(0, 64) };
    }
    const all = [...this.items.values()].sort((a, b) => a.startedAt - b.startedAt);
    return { count: all.length, items: all.slice(0, 64).map(item => ({ ...item })) };
  }

  private admit(key: string): boolean {
    if (this.records.has(key)) return false;
    if (this.records.size >= 20000) { this.limited = true; return false; }
    this.records.add(key); return true;
  }

  private apply(id: unknown, status: "active" | "terminal" | "unknown", at: number, meta: Partial<SubagentInfo> = {}): void {
    if (typeof id !== "string" || !ID.test(id)) return;
    this.seen = true;
    if (status === "terminal") {
      this.items.delete(id); this.metadata.delete(id); this.uncertain.delete(id); this.museBindings.delete(id); return;
    }
    if (!this.metadata.has(id) && this.metadata.size >= MAX) { this.limited = true; return; }
    this.metadata.set(id, { ...this.metadata.get(id), ...meta });
    if (status === "unknown") {
      this.items.delete(id);
      this.uncertain.add(id);
      return;
    }
    this.uncertain.delete(id);
    this.items.set(id, { id, startedAt: this.items.get(id)?.startedAt ?? at, depth: 1, ...this.metadata.get(id) });
  }

  private codex(row: Record<string, any>): void {
    const event = object(row.payload), item = object(event?.item);
    if (row.type !== "event_msg" || event?.type !== "item_completed" || event.thread_id !== this.sessionId || item?.type !== "SubAgentActivity") return;
    const at = Date.parse(row.timestamp);
    const id = item.agent_thread_id;
    if (!Number.isFinite(at) || typeof item.id !== "string" || !ID.test(item.id) || typeof id !== "string" || !ID.test(id) || id === this.sessionId || typeof item.kind !== "string") { this.codexMalformed = true; return; }
    if (!this.admit(`c:${item.id}:${label(item.kind, 64)}`)) return;
    const name = label(item.agent_path, 200)?.split("/").at(-1);
    const model = label(item.model, 64);
    // SDK uses reasoningEffort; the persisted SubAgentActivity uses reasoning_effort.
    // Its schema calls this resolved-at-creation, not the requested launch effort.
    const effort = item.kind === "started" && typeof item.reasoning_effort === "string" && (ASSISTANT_EFFORTS.codex as readonly string[]).includes(item.reasoning_effort) ? item.reasoning_effort : undefined;
    const meta: Partial<SubagentInfo> = { ...(effort ? { reasoningEffort: effort, reasoningEffortBasis: "creation" } : {}), ...(name ? { description: name } : {}), ...(model ? { type: model } : {}) };
    // A fresh successful reference to an owned, completed child proves membership, not work.
    if (item.kind === "interacted") {
      if (!this.items.has(id)) {
        const relation = this.codexRelations.get(id);
        if (relation?.completed) this.codexReferences.set(id, { ...relation.item, ...meta, state: "unknown" });
        this.apply(id, "unknown", at, meta);
      }
      return;
    }
    this.codexReferences.delete(id);
    if (item.kind === "started") {
      if (!this.codexRelations.has(id) && this.codexRelations.size >= MAX) { this.limited = true; return; }
      const previous = this.metadata.get(id);
      if (previous) { delete previous.reasoningEffort; delete previous.reasoningEffortBasis; }
      const created: SubagentInfo = { ...this.codexRelations.get(id)?.item, id, startedAt: at, depth: 1, ...meta };
      if (!effort) { delete created.reasoningEffort; delete created.reasoningEffortBasis; }
      this.codexRelations.set(id, { item: created, completed: false });
    } else if (item.kind === "completed") {
      const relation = this.codexRelations.get(id);
      if (relation) relation.completed = true;
    } else {
      // No inferred revival after interruption or an unknown lifecycle state.
      this.codexRelations.delete(id);
    }
    this.apply(id, item.kind === "started" ? "active" : ["completed", "interrupted"].includes(item.kind) ? "terminal" : "unknown", at, meta);
  }

  private muse(row: Record<string, any>): void {
    const stream = object(row.stream), payload = object(row.payload), record = object(payload?.record);
    if (row.schema_version !== 1 || stream?.kind !== "session" || stream.id !== this.sessionId || payload?.kind !== "subagent_control" || !record) return;
    if (record.parent_session_id !== undefined && record.parent_session_id !== this.sessionId) return;
    const type = row.payload_type, id = record.subagent_id;
    if (typeof type !== "string" || !type.startsWith("subagent.control.") || typeof id !== "string" || !ID.test(id)) return;
    if (typeof row.id !== "string" || !ID.test(row.id) || !this.admit(`m:${row.id}`)) return;
    const at = Number(row.recorded_at) / 1000;
    if (!Number.isFinite(at) || at < 0) return;
    if (type === "subagent.control.child_session_bound") {
      const child=record.child_session_id;
      if(record.kind==="child_session_bound"&&record.schema_version===1&&record.storage_layout==="nested_session_v1"&&typeof child==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(child)&&child!==this.sessionId&&(this.museBindings.has(id)||this.museBindings.size<MAX))this.museBindings.set(id,child);
      else this.museBindings.delete(id);
      return;
    }
    if (["subagent.control.spawn_accepted", "subagent.control.resume_context_recorded"].includes(type)) {
      if (!this.metadata.has(id) && this.metadata.size >= MAX) { this.limited = true; return; }
      if(type==="subagent.control.spawn_accepted")this.museBindings.delete(id);
      const role = label(record.role, 64), description = label(record.objective, 200);
      this.metadata.set(id, { ...this.metadata.get(id), ...(role ? { type: role } : {}), ...(description ? { description } : {}), ...(Number.isInteger(record.depth) && record.depth >= 1 && record.depth <= 16 ? { depth: record.depth } : {}) });
      return;
    }
    if (type === "subagent.control.start_attested") this.apply(id, "active", at);
    else if (type === "subagent.control.status_updated") this.apply(id, ["running", "starting"].includes(record.control_status) ? "active" : ["result_ready", "resultReady", "closing", "closed"].includes(record.control_status) ? "terminal" : "unknown", at);
    else if (type === "subagent.control.result_ready") this.apply(id, "terminal", at);
    else if (!["subagent.control.attempt_admitted", "subagent.control.child_session_bound", "subagent.control.runtime_observed"].includes(type)) this.apply(id, "unknown", at);
  }

  private copilot(row: Record<string, any>): void {
    if (typeof row.type !== "string" || !/^(?:custom_agent|subagent)\./.test(row.type)) return;
    // Selecting the main custom agent is not a child execution lifecycle.
    if (["subagent.selected", "subagent.deselected"].includes(row.type)) return;
    const data = object(row.data), at = Date.parse(row.timestamp);
    if (!data || !Number.isFinite(at) || typeof row.id !== "string" || !ID.test(row.id)
      || typeof data.toolCallId !== "string" || !ID.test(data.toolCallId) || row.ephemeral === true) {
      this.copilotMalformed = true; return;
    }
    if (!this.admit(`p:${row.id}`)) return;
    const type = label(data.agentName, 64), description = label(data.agentDescription, 200);
    const phase = row.type.slice(row.type.indexOf(".") + 1);
    this.apply(data.toolCallId, phase === "started" ? "active" : ["completed", "failed"].includes(phase) ? "terminal" : "unknown", at, { ...(type ? { type } : {}), ...(description ? { description } : {}) });
  }
}
