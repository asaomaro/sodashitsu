import type { AgentExecutionSettings, AgentSettingObservation, UsageSource } from "@sodashitsu/protocol";
/** Public metadata tokens only; never retain policy objects, paths, commands, or launch arguments. */
export function observedSetting(value: unknown, source: UsageSource | "hook", basis: AgentSettingObservation["basis"], observedAt?: number): AgentSettingObservation | undefined {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(value)) return undefined;
  return { value, source, basis, ...(observedAt !== undefined && Number.isFinite(observedAt) && observedAt >= 0 ? { observedAt } : {}) };
}
/** A complete turn_context observation replaces the previous turn settings, including absent fields. */
export function codexTurnSettings(row: Record<string, unknown>): AgentExecutionSettings | undefined {
  if (row.type !== "turn_context" || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return undefined;
  const p = row.payload as Record<string, unknown>, at = typeof row.timestamp === "string" ? Date.parse(row.timestamp) : undefined;
  const out: AgentExecutionSettings = {};
  const effort = observedSetting(p.effort, "rollout", "turn", at);
  const approval = observedSetting(p.approval_policy, "rollout", "turn", at);
  const sandbox = p.sandbox_policy && typeof p.sandbox_policy === "object" && !Array.isArray(p.sandbox_policy) ? observedSetting((p.sandbox_policy as Record<string, unknown>).type, "rollout", "turn", at) : undefined;
  if (effort) out.reasoningEffort = effort;
  if (approval) out.approvalPolicy = approval;
  if (sandbox) out.sandboxMode = sandbox;
  return out;
}

/** Only native hook/statusline report observations cross the report socket. */
export function reportedSettings(value: unknown): AgentExecutionSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: AgentExecutionSettings = {};
  for (const key of ["reasoningEffort", "approvalPolicy", "approvalMode", "permissionMode", "sandboxMode"] as const) {
    const v = (value as Record<string, any>)[key];
    if (!v || typeof v !== "object" || !((v.source === "hook" && v.basis === "hook") || (v.source === "statusline" && v.basis === "statusline"))) continue;
    const observation = observedSetting(v.value, v.source, v.basis, v.observedAt);
    if (observation) out[key] = observation;
  }
  return Object.keys(out).length ? out : undefined;
}
