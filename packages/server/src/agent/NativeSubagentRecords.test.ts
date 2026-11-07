import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { NativeSubagentRecords } from "./NativeSubagentRecords.js";

const fixture = async (kind: string) => (await readFile(new URL(`./fixtures/native-subagents/${kind}.jsonl`, import.meta.url), "utf8")).trim().split("\n").map(line => JSON.parse(line));
describe("native subagent lifecycle records", () => {
  it("folds real Codex start/completion, ignores duplicate historical start, and never claims Claude transcript support", async () => {
    const rows = await fixture("codex"), id = rows[0].payload.thread_id;
    const fold = new NativeSubagentRecords("codex", id);
    expect(fold.snapshot()).toBeUndefined();
    fold.consume(rows[0]); fold.consume(rows[0]);
    expect(fold.snapshot()).toMatchObject({ count: 1, items: [{ id: rows[0].payload.item.agent_thread_id, description: "probe_child", type: "gpt-6-luna" }] });
    expect(fold.snapshot()?.items[0]).not.toHaveProperty("hasTranscript");
    rows.slice(1).forEach(row => fold.consume(row));
    fold.consume(rows[0]);
    expect(fold.snapshot()).toEqual({ count: 0, items: [] });
    rows.forEach(row => fold.consume(row));
    expect(fold.snapshot()).toEqual({ count: 0, items: [] });
  });
  it("does not attribute another Codex thread or arbitrary tool text", async () => {
    const rows = await fixture("codex"), fold = new NativeSubagentRecords("codex", "other-session");
    rows.forEach(row => fold.consume(row));
    fold.consume({ type: "response_item", payload: { type: "function_call", name: "spawn_agent", arguments: "{\"agent_id\":\"unverified\"}" } });
    expect(fold.snapshot()).toBeUndefined();
  });
  it("keeps active on delivery, but retires terminal knowledge on an interacted/future event until a known lifecycle arrives", async () => {
    const rows = await fixture("codex"), source = rows[0], fold = new NativeSubagentRecords("codex", source.payload.thread_id);
    const event = (kind: string, id: string) => ({ ...source, payload: { ...source.payload, item: { ...source.payload.item, kind, id } } });
    fold.consume(source); fold.consume(event("interacted", "delivery-live"));
    expect(fold.snapshot()?.count).toBe(1);
    fold.consume(rows[1]); fold.consume(event("interacted", "delivery-after-terminal"));
    expect(fold.snapshot()).toMatchObject({ count: 1, countBasis: "alive", items: [{ state: "unknown" }] });
    fold.consume(event("started", "followup-started"));
    expect(fold.snapshot()?.count).toBe(1);
    fold.consume(event("future-unknown-status", "future-update"));
    expect(fold.snapshot()).toBeUndefined();
    fold.consume(event("completed", "followup-completed"));
    expect(fold.snapshot()?.count).toBe(0);
  });
  it("exposes three formally owned completed children referenced again as membership with unknown tasks", async () => {
    const rows = await fixture("codex-referenced-members"), fold = new NativeSubagentRecords("codex", rows[0].payload.thread_id);
    rows.forEach(row => fold.consume(row));
    expect(fold.snapshot()).toMatchObject({ count: 3, countBasis: "alive", items: [{ state: "unknown" }, { state: "unknown" }, { state: "unknown" }] });
    expect(fold.snapshot()?.items.map(i => i.startedAt)).toEqual(rows.filter(r => r.payload.item.kind === "started").map(r => Date.parse(r.timestamp)));
    rows.forEach(row => fold.consume(row)); expect(fold.snapshot()?.count).toBe(3);
    const active = structuredClone(rows[0]); active.payload.item.id = "fourth-start"; active.payload.item.agent_thread_id = "fourth-child";
    fold.consume(active); expect(fold.snapshot()).toMatchObject({ count: 4, countBasis: "alive" });
    expect(fold.snapshot()?.items.filter(i => i.state === "working")).toHaveLength(1);
    for (const row of rows.filter(r => r.payload.item.kind === "completed")) fold.consume({ ...row, payload: { ...row.payload, item: { ...row.payload.item, id: row.payload.item.id + "-new" } } });
    expect(fold.snapshot()).toMatchObject({ count: 1 }); expect(fold.snapshot()).not.toHaveProperty("countBasis");
  });
  it("does not revive completed-only children, unowned references, interruption or unknown-state ownership", async () => {
    const rows = await fixture("codex-referenced-members"), parent = rows[0].payload.thread_id;
    const completed = new NativeSubagentRecords("codex", parent);
    rows.filter(r => r.payload.item.kind !== "interacted").forEach(r => completed.consume(r));
    expect(completed.snapshot()).toEqual({ count: 0, items: [] });
    const event = (kind: string, id: string) => ({ ...rows[0], payload: { ...rows[0].payload, item: { ...rows[0].payload.item, kind, id } } });
    const unknown = new NativeSubagentRecords("codex", parent); unknown.consume(event("interacted", "unowned")); expect(unknown.snapshot()).toBeUndefined();
    for (const kind of ["interrupted", "future-state"]) {
      const fold = new NativeSubagentRecords("codex", parent); fold.consume(rows[0]); fold.consume(event(kind, "terminal-or-unknown")); fold.consume(event("interacted", "later-reference"));
      expect(fold.snapshot()).toBeUndefined(); fold.consume(event("started", "new-formal-start")); expect(fold.snapshot()?.count).toBe(1);
      fold.consume(event("completed", "new-completion")); fold.consume(event("interacted", "new-reference")); expect(fold.snapshot()).toMatchObject({ count: 1, countBasis: "alive", items: [{ state: "unknown" }] });
    }
    const foreign = new NativeSubagentRecords("codex", "other-parent"); rows.forEach(r => foreign.consume(r)); expect(foreign.snapshot()).toBeUndefined();
  });
  it("keeps malformed important events unknown and bounds retained Codex ownership proofs", async () => {
    const rows = await fixture("codex-referenced-members"), parent = rows[0].payload.thread_id;
    for (const field of ["id", "agent_thread_id", "kind"]) {
      const fold = new NativeSubagentRecords("codex", parent); rows.forEach(r => fold.consume(r));
      const row = structuredClone(rows[0]); row.payload.item.id = "malformed-" + field; delete row.payload.item[field]; fold.consume(row); expect(fold.snapshot()).toBeUndefined();
    }
    const fold = new NativeSubagentRecords("codex", parent);
    for (let n = 0; n < 257; n++) for (const kind of ["started", "completed"]) fold.consume({ ...rows[0], payload: { ...rows[0].payload, item: { ...rows[0].payload.item, kind, id: kind + n, agent_thread_id: "child-" + n } } });
    expect(fold.snapshot()).toBeUndefined();
  });
  it("folds the real Muse parent stream, using explicit start and result_ready rather than a tool prompt", async () => {
    const rows = await fixture("muse"), id = rows[0].stream.id, fold = new NativeSubagentRecords("muse", id);
    for (const row of rows) {
      if (row.payload_type === "subagent.control.result_ready") break;
      fold.consume(row);
    }
    expect(fold.snapshot()).toMatchObject({ count: 1, items: [{ type: "workflow-agent", description: "Reply PROBE_CHILD_OK only. Do not use any tools.", depth: 1 }] });
    rows.forEach(row => fold.consume(row));
    expect(fold.snapshot()).toEqual({ count: 0, items: [] });
    const foreign = new NativeSubagentRecords("muse", "another-parent");
    rows.forEach(row => foreign.consume(row));
    expect(foreign.snapshot()).toBeUndefined();
  });
  it("marks unknown Muse state unknown and removes active instead of guessing zero", async () => {
    const rows = await fixture("muse"), fold = new NativeSubagentRecords("muse", rows[0].stream.id);
    rows.forEach(row => fold.consume(row));
    const status = rows.find(row => row.payload_type === "subagent.control.status_updated");
    fold.consume({ ...status, id: "unknown-status-record", payload: { ...status.payload, record: { ...status.payload.record, control_status: "new-provider-status" } } });
    expect(fold.snapshot()).toBeUndefined();
  });
  it("uses installed Copilot SDK lifecycle schema (generated fixture, not real model verification)", () => {
    const fold = new NativeSubagentRecords("copilot", "owned-parent");
    const row = (type: string, id: string, toolCallId = "call-1") => ({ id, type, timestamp: "2026-11-07T00:00:00Z", data: { toolCallId, agentName: "explore", agentDescription: "Fixture child" } });
    fold.consume(row("custom_agent.started", "record-1"));fold.consume(row("custom_agent.started", "record-1"));
    expect(fold.snapshot()).toMatchObject({ count: 1, items: [{ id: "call-1", type: "explore", description: "Fixture child" }] });
    fold.consume(row("custom_agent.completed", "record-2"));fold.consume(row("custom_agent.started", "record-1"));
    expect(fold.snapshot()?.count).toBe(0);
    fold.consume(row("custom_agent.started", "record-3", "call-2"));
    fold.consume(row("custom_agent.failed", "record-4", "call-2"));
    expect(fold.snapshot()?.count).toBe(0);
  });
  it.each(["custom_agent", "subagent"])("folds explicit %s lifecycle, deduplicates events, and never treats selection as child work", family => {
    const fold = new NativeSubagentRecords("copilot", "owned-parent");
    const row = (phase: string, id: string, toolCallId = "child-call") => ({ id, type: `${family}.${phase}`, timestamp: "2026-11-07T00:00:00Z", data: { toolCallId, agentName: "explore" } });
    fold.consume({ type: "subagent.selected", data: { agentName: "explore" } });
    expect(fold.snapshot()).toBeUndefined();
    fold.consume(row("started", "event-start"));
    fold.consume(row("started", "event-start"));
    expect(fold.snapshot()).toMatchObject({ count: 1, items: [{ id: "child-call", type: "explore" }] });
    fold.consume({ type: "subagent.deselected", data: { toolCallId: "child-call" } });
    expect(fold.snapshot()?.count).toBe(1);
    fold.consume(row("completed", "event-complete"));
    fold.consume(row("started", "event-start"));
    expect(fold.snapshot()).toEqual({ count: 0, items: [] });
    fold.consume(row("started", "event-second", "second-call"));
    fold.consume(row("failed", "event-failed", "second-call"));
    expect(fold.snapshot()).toEqual({ count: 0, items: [] });
  });
  it.each(["custom_agent", "subagent"])("fails closed for malformed and unknown %s lifecycle", family => {
    const valid = { id: "event-start", type: `${family}.started`, timestamp: "2026-11-07T00:00:00Z", data: { toolCallId: "child-call" } };
    for (const bad of [{ data: {} }, { id: "" }, { timestamp: "bad" }, { ephemeral: true }, { type: `${family}.future_state` }]) {
      const fold = new NativeSubagentRecords("copilot", "owned-parent");
      fold.consume({ ...valid, type: `${family}.completed` });
      expect(fold.snapshot()?.count).toBe(0);
      fold.consume({ ...valid, ...bad, id: "event-next", ...(bad.id !== undefined ? { id: bad.id } : {}) });
      expect(fold.snapshot()).toBeUndefined();
    }
  });

});
