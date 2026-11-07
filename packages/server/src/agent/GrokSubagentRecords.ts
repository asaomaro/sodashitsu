import type { SubagentInfo } from "@sodashitsu/protocol";
import type { Subagents } from "./SubagentTracker.js";
import { createHash } from "node:crypto";

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const obj = (v: unknown): Record<string, any> | undefined => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : undefined;
const text = (v: unknown, max = 200): string | undefined => typeof v === "string" && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f-\x9f]/.test(v) ? v : undefined;
interface Child { item: SubagentInfo; attempt: string; active: boolean; attempts: Set<string> }

/** The installed CLI's durable parent update envelope, never tool-result prose.
 * Spawn proves membership before prompt dispatch; only running progress proves work.
 * Terminal children remain private bindings for bounded history/settings lookups. */
export class GrokSubagentRecords {
  private readonly children = new Map<string, Child>();
  private readonly events = new Map<string, string>();
  private seen = false;
  private invalid = false;
  constructor(readonly parentId: string) { if (!UUID.test(parentId)) this.invalid = true; }

  consume(value: unknown): void {
    if (this.invalid) return;
    const row = obj(value), params = obj(row?.params), update = obj(params?.update);
    if (row?.method !== "_x.ai/session/update" || typeof update?.sessionUpdate !== "string" || !update.sessionUpdate.startsWith("subagent_")) return;
    const kind = update.sessionUpdate, id = update.child_session_id, subId = update.subagent_id;
    const meta = obj(params?._meta), eventId = text(meta?.eventId, 256);
    const at = meta?.agentTimestampMs;
    const attempt = update.attempt_id === undefined ? "" : text(update.attempt_id, 128);
    if (params?.sessionId !== this.parentId || !eventId || !Number.isSafeInteger(at) || at < 0 ||
      typeof id !== "string" || !UUID.test(id) || id === this.parentId || subId !== id || attempt === undefined ||
      !["subagent_spawned", "subagent_progress", "subagent_finished"].includes(kind)) { this.invalid = true; return; }
    // Keep only a fixed digest of fields meaningful to this lifecycle kind.
    // Progress/finished prose or arbitrary extra objects never live in the map.
    const fields = kind === "subagent_spawned" ? [update.parent_session_id, update.model, update.subagent_type, update.description]
      : kind === "subagent_progress" ? [update.parent_session_id] : [update.status];
    const proof = createHash("sha256").update(JSON.stringify([kind, id, attempt, at, ...fields])).digest("hex");
    const previous = this.events.get(eventId);
    if (previous !== undefined) { if (previous !== proof) this.invalid = true; return; }
    if (this.events.size >= 20000) { this.invalid = true; return; }
    this.events.set(eventId, proof);
    this.seen = true;
    let child = this.children.get(id);
    if (kind === "subagent_spawned") {
      if (update.parent_session_id !== this.parentId || (update.model !== undefined && !text(update.model, 128)) ||
        (update.subagent_type !== undefined && !text(update.subagent_type)) || (update.description !== undefined && !text(update.description, 2000))) { this.invalid = true; return; }
      if (!child && this.children.size >= 256) { this.invalid = true; return; }
      // A delayed duplicate of an older attempt must not revive a completed child.
      if (child?.attempts.has(attempt)) return;
      if (child && at <= child.item.startedAt) { this.invalid = true; return; }
      const attempts = child?.attempts ?? new Set<string>();
      if (attempts.size >= 256) { this.invalid = true; return; }
      attempts.add(attempt);
      const model = text(update.model, 128), type = text(update.subagent_type), description = text(update.description, 2000);
      child = { attempt, attempts, active: true, item: { id, startedAt: at, depth: 1, state: "unknown",
        ...(model ? { model, modelBasis: "creation" } : {}), ...(type ? { type } : {}), ...(description ? { description } : {}) } };
      this.children.set(id, child);
      return;
    }
    if (!child || !child.attempts.has(attempt)) { this.invalid = true; return; }
    if (child.attempt !== attempt) return; // A prior attempt's late completion cannot stop the new one.
    if (at < child.item.startedAt) { this.invalid = true; return; }
    if (kind === "subagent_progress") {
      if (update.parent_session_id !== this.parentId || !child.active) { this.invalid = true; return; }
      child.item.state = "working";
    } else {
      if (!["completed", "failed", "cancelled"].includes(update.status)) { this.invalid = true; return; }
      child.active = false;
    }
  }

  snapshot(): Subagents | undefined {
    if (!this.seen || this.invalid) return undefined;
    const items = [...this.children.values()].filter(c => c.active).map(c => ({ ...c.item })).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    return { count: items.length, countBasis: "alive", items: items.slice(0, 64) };
  }

  bindings(): ReadonlyArray<{ id: string; attempt: string; active: boolean; startedAt: number }> | undefined {
    return !this.seen || this.invalid ? undefined : [...this.children.values()].map(c => ({ id: c.item.id, attempt: c.attempt, active: c.active, startedAt: c.item.startedAt }));
  }
}
