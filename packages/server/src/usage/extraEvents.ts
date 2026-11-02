import type { ExtraKind } from "../conversation/ExtraAgentRecords.js";
import { safeModel } from "./claudeScan.js";
export interface ExtraUsage {
  id: string;
  at: number;
  model: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
const num = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1e12;
export function extraEventTime(row: any, kind: ExtraKind): number {
  return kind === "muse" && typeof row.recorded_at === "number"
    ? Math.floor(row.recorded_at / 1000)
    : typeof (row.timestamp ?? row.created_at) === "string"
      ? Date.parse(row.timestamp ?? row.created_at)
      : NaN;
}
/** Confirmed per-call records only. Context samples and estimates are never consumption. */
export function extraUsage(row: any, kind: ExtraKind, sessionId?: string): ExtraUsage | null {
  if (!row || typeof row !== "object") return null;
  let u: any, id: unknown, model: unknown;
  if (kind === "muse") {
    if (
      row.schema_version !== 1 ||
      row.payload_schema_version !== 1 ||
      row.stream?.kind !== "session" ||
      (sessionId && row.stream.id !== sessionId) ||
      row.payload_type !== "runtime.session" ||
      row.payload?.kind !== "run"
    )
      return null;
    const e = row.payload.event;
    if (e?.kind !== "goal_usage_attribution") return null;
    const record = e.record;
    if (
      record?.schema_version !== 1 ||
      record.usage_family !== "provider" ||
      record.quantity?.reported !== true ||
      record.quantity.unit !== "tokens"
    )
      return null;
    u = record.quantity;
    id = record.usage_id;
    model = record.model;
    if (
      !num(u.input_tokens) ||
      !num(u.output_tokens) ||
      !num(u.cached_tokens ?? 0) ||
      u.cached_tokens > u.input_tokens
    )
      return null;
    u = {
      input: u.input_tokens - (u.cached_tokens ?? 0),
      output: u.output_tokens,
      cacheRead: u.cached_tokens ?? 0,
      cacheWrite: 0,
    };
  } else if (kind === "copilot") {
    if (row.type !== "session.usage_record") return null;
    u = row.data?.usage;
    id = row.id;
    model = u?.model;
    if (
      !u ||
      !num(u.inputTokens) ||
      !num(u.outputTokens) ||
      !num(u.cacheReadTokens ?? 0) ||
      !num(u.cacheWriteTokens ?? 0) ||
      (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0) > u.inputTokens
    )
      return null;
    u = {
      input: u.inputTokens - (u.cacheReadTokens ?? 0) - (u.cacheWriteTokens ?? 0),
      output: u.outputTokens,
      cacheRead: u.cacheReadTokens ?? 0,
      cacheWrite: u.cacheWriteTokens ?? 0,
    };
  } else {
    // Actual 1.4.12 transcript: completed planner steps have top-level counters.
    if (
      row.type !== "PLANNER_RESPONSE" ||
      row.status !== "DONE" ||
      !Number.isSafeInteger(row.step_index) ||
      row.step_index < 0 ||
      !num(row.input_tokens) ||
      !num(row.output_tokens) ||
      !num(row.cache_read_tokens ?? 0)
    )
      return null;
    id = `step:${row.step_index}:${row.created_at}`;
    model = row.model;
    u = {
      input: row.input_tokens,
      output: row.output_tokens,
      cacheRead: row.cache_read_tokens ?? 0,
      cacheWrite: 0,
    };
  }
  if (typeof id !== "string" || !id || id.length > 256) return null;
  const at = extraEventTime(row, kind);
  if (!Number.isFinite(at)) return null;
  return { id, at, model: safeModel(model), ...u };
}
export function extraTool(
  row: any,
  kind: ExtraKind,
): { id: string; name: string; input: unknown; status?: "success" | "failed" } | null {
  if (
    kind === "copilot" &&
    row?.type === "tool.execution_start" &&
    typeof row.data?.toolCallId === "string" &&
    typeof row.data?.toolName === "string"
  )
    return { id: row.data.toolCallId, name: row.data.toolName, input: row.data.arguments };
  return null;
}

export function extraTools(
  row: any,
  kind: ExtraKind,
): { id: string; name: string; input: unknown }[] {
  const single = extraTool(row, kind);
  if (single) return [single];
  if (
    kind === "muse" &&
    row?.type === "_muse_tool_view" &&
    typeof row.itemId === "string" &&
    typeof row.tool === "string"
  ) {
    let input;
    try {
      input = JSON.parse(row.args);
    } catch {}
    return [{ id: row.itemId, name: row.tool, input }];
  }
  if (
    kind === "agy" &&
    row?.type === "PLANNER_RESPONSE" &&
    row.status === "DONE" &&
    Number.isSafeInteger(row.step_index) &&
    Array.isArray(row.tool_calls)
  )
    return row.tool_calls
      .slice(0, 64)
      .flatMap((t: any, i: number) =>
        typeof t?.name === "string"
          ? [{ id: `step:${row.step_index}:${i}`, name: t.name, input: t.args }]
          : [],
      );
  return [];
}
