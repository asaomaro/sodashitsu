import { ASSISTANT_EFFORTS, type SubagentInfo } from "@sodashitsu/protocol";

export interface GrokChildModelObservation {
  /** A latest model event replaces the whole model/effort pair, including missing fields. */
  found: boolean;
  settings: Pick<SubagentInfo, "model" | "modelBasis" | "reasoningEffort" | "reasoningEffortBasis">;
}
const empty = (found = false): GrokChildModelObservation => ({ found, settings: {} });
/** Child-session ModelChanged is a selected session setting, not a completed turn.
 * Only the formal update channel for this exact child is accepted. No parent
 * settings, launch flags, tool prose or model suffixes are observations. */
export function grokChildModelChange(bytes: Buffer, childId: string, startedAt: number, partialHead = false): GrokChildModelObservation {
  const lines = bytes.toString("utf8").split("\n");
  if (partialHead) lines.shift();
  const partial = lines.pop();
  // A newly writing model switch must not expose the old effort alongside it.
  if (partial?.includes('"model_changed"')) return empty(true);
  for (let n = lines.length - 1; n >= 0; n--) {
    const line = lines[n]!;
    if (!line.includes('"model_changed"')) continue;
    let row: any; try { row = JSON.parse(line); } catch { return empty(true); }
    const p = row?.params, u = p?.update;
    if (row?.method !== "_x.ai/session/update" || u?.sessionUpdate !== "model_changed") continue;
    const at = p?._meta?.agentTimestampMs;
    if (p?.sessionId !== childId || !Number.isSafeInteger(at) || at < startedAt) return empty(true);
    const model = typeof u.model_id === "string" && /^[^\x00-\x1f\x7f-\x9f]{1,128}$/.test(u.model_id) ? u.model_id : undefined;
    const effort = typeof u.reasoning_effort === "string" && (ASSISTANT_EFFORTS.grok as readonly string[]).includes(u.reasoning_effort) ? u.reasoning_effort : undefined;
    return { found: true, settings: { ...(model ? { model, modelBasis: "session" } : {}), ...(effort ? { reasoningEffort: effort, reasoningEffortBasis: "session" } : {}) } };
  }
  return empty();
}
