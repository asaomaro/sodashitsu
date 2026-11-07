import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { GrokSubagentRecords } from "./GrokSubagentRecords.js";
const parent = "12345678-1234-4234-8234-123456789012", child = "12345678-1234-4234-8234-123456789013";
function row(kind: string, index = 1, extra: Record<string, unknown> = {}) {
  return { timestamp: index, method: "_x.ai/session/update", params: { sessionId: parent,
    update: { sessionUpdate: kind, subagent_id: child, child_session_id: child, attempt_id: "at1.generated", ...extra },
    _meta: { eventId: `event-${index}`, agentTimestampMs: index * 1000 } } };
}
const spawn = (index = 1, extra: Record<string, unknown> = {}) => row("subagent_spawned", index, { parent_session_id: parent, model: "effective-child", subagent_type: "Explore", description: "Generated child", ...extra });
const finish = (index = 3, extra: Record<string, unknown> = {}) => row("subagent_finished", index, { status: "completed", ...extra });
it("folds installed CLI envelopes: creation proves membership, terminal removes only the exact child attempt", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../../../.aidev/works/20261107-grok-cursor-native-children/installed-grok-native-fixture.json", import.meta.url), "utf8"));
  expect(fixture.realAuth).toBe(false); expect(fixture.externalModelCalls).toBe(0); expect(fixture.nativeEnvelopes).toHaveLength(2);
  const records = new GrokSubagentRecords(fixture.nativeEnvelopes[0].recordSessionId);
  records.consume(fixture.nativeEnvelopes[0].row);
  expect(records.snapshot()).toMatchObject({ count: 1, countBasis: "alive", items: [{ model: "grok-4", modelBasis: "creation", state: "unknown" }] });
  records.consume(fixture.nativeEnvelopes[1].row);
  expect(records.snapshot()).toEqual({ count: 0, countBasis: "alive", items: [] });
  expect(records.bindings()).toMatchObject([{ active: false }]);
});
it("uses formal running progress only and never resurrects completed duplicate spawns", () => {
  const records = new GrokSubagentRecords(parent); records.consume(spawn()); records.consume(row("subagent_progress", 2, { parent_session_id: parent }));
  expect(records.snapshot()?.items[0]?.state).toBe("working");
  records.consume(finish()); records.consume(spawn(4)); expect(records.snapshot()?.count).toBe(0);
});
it("ignores a known old attempt's late terminal after a fresh resumed attempt", () => {
  const records = new GrokSubagentRecords(parent); records.consume(spawn()); records.consume(finish());
  records.consume(spawn(4, { attempt_id: "at1.second", model: "second-model" })); records.consume(finish(5));
  expect(records.snapshot()?.items[0]).toMatchObject({ model: "second-model", state: "unknown", startedAt: 4000 });
});
it.each([
  (r: ReturnType<typeof row>) => { r.params.sessionId = child; },
  (r: ReturnType<typeof row>) => { r.params.update.child_session_id = parent; },
  (r: ReturnType<typeof row>) => { r.params.update.subagent_id = parent; },
  (r: ReturnType<typeof row>) => { r.params._meta.agentTimestampMs = NaN; },
  (r: ReturnType<typeof row>) => { Object.assign(r.params.update, { parent_session_id: child }); },
  (r: ReturnType<typeof row>) => { Object.assign(r.params.update, { model: "bad\u001bmodel" }); },
])("rejects malformed or foreign binding instead of a false zero", mutate => {
  const records = new GrokSubagentRecords(parent), r = spawn(); mutate(r); records.consume(r); expect(records.snapshot()).toBeUndefined();
});
it("fails closed for unbound/unknown lifecycle, conflicting event IDs and unknown attempts", () => {
  for (const rows of [[finish()], [spawn(), row("subagent_unknown", 2)], [spawn(), spawn(1, { model: "conflict" })], [spawn(), finish(2, { attempt_id: "unknown" })]]) {
    const records = new GrokSubagentRecords(parent); for (const r of rows) records.consume(r); expect(records.snapshot()).toBeUndefined();
  }
});
it("does not infer membership from prose, tool results or arbitrary lookalike updates", () => {
  const records = new GrokSubagentRecords(parent); records.consume({ type: "tool_result", content: spawn() }); records.consume({ ...spawn(), method: "untrusted" }); expect(records.snapshot()).toBeUndefined();
});
it("bounds distinct child bindings and event IDs without silently evicting proof", () => {
  const records = new GrokSubagentRecords(parent);
  for (let i = 0; i < 257; i++) {
    const id = `abcdefab-1234-4234-8234-${i.toString().padStart(12, "0")}`;
    records.consume(spawn(i + 1, { child_session_id: id, subagent_id: id }));
  }
  expect(records.snapshot()).toBeUndefined();
});
