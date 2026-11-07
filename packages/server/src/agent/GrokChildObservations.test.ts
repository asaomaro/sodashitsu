import { expect, it } from "vitest";
import { grokChildModelChange } from "./GrokChildObservations.js";
const child = "12345678-1234-4234-8234-123456789013";
function change(model: unknown = "child-selected", effort?: unknown, sessionId = child, at = 2000) { if(arguments.length<2)effort="high"; return JSON.stringify({ method: "_x.ai/session/update", params: { sessionId, _meta: { agentTimestampMs: at }, update: { sessionUpdate: "model_changed", model_id: model, reasoning_effort: effort } } }) + "\n"; }
it("reads source-schema ModelChanged only for the exact child with session basis (not an installed emitted fixture)", () => {
  expect(grokChildModelChange(Buffer.from(change()), child, 1000)).toEqual({ found: true, settings: { model: "child-selected", modelBasis: "session", reasoningEffort: "high", reasoningEffortBasis: "session" } });
});
it("replaces the complete pair when the last event omits or invalidates effort/model", () => {
  expect(grokChildModelChange(Buffer.from(change() + change("next", undefined)), child, 1000).settings).toEqual({ model: "next", modelBasis: "session" });
  expect(grokChildModelChange(Buffer.from(change() + change(null, "unknown-effort")), child, 1000)).toEqual({ found: true, settings: {} });
});
it("does not mix old settings after wrong scope, pre-spawn, malformed or partial latest event", () => {
  for (const last of [change("other", "low", "foreign"), change("old", "low", child, 999), '{"model_changed":', change().trimEnd()]) {
    expect(grokChildModelChange(Buffer.from(change() + last), child, 1000)).toEqual({ found: true, settings: {} });
  }
});
it("does not infer settings from parent/model requests, prose or unrelated records", () => {
  for (const line of ['{"type":"assistant","content":"model_changed child high"}\n', '{"params":{"update":{"model_id":"parent"}}}\n', '']) {
    expect(grokChildModelChange(Buffer.from(line), child, 0)).toEqual({ found: false, settings: {} });
  }
});
