import { z } from "zod";
import type { AgentUsage, UsageTokenBasis } from "./usage.js";
import { SummarySettingsSchema } from "./conversation.js";

const HistoryRange = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const UsageHistoryParams = HistoryRange.refine((v) => {
  const from = Date.parse(v.from + "T00:00:00Z"),
    to = Date.parse(v.to + "T00:00:00Z");
  return (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    new Date(from).toISOString().slice(0, 10) === v.from &&
    new Date(to).toISOString().slice(0, 10) === v.to &&
    to >= from &&
    to - from <= 365 * 86400000
  );
}, "有効な日付を最大366日間で指定してください");
export type UsageHistoryParams = z.infer<typeof UsageHistoryParams>;

export const UsageReportParams = z.object({
  settings: SummarySettingsSchema.pick({ kind: true, model: true }),
  accountKey: z.string().min(1).max(128).optional(),
  history: UsageHistoryParams.optional(),
});
export interface UsageReport {
  text: string;
  kind: string;
  model: string;
  updatedAt: number;
}
export interface UsageAnalyticsGroup {
  kind: string;
  basis: UsageTokenBasis;
  sessions: number;
  tokenSessions: number;
  tokens?: number;
  partialSessions: number;
}
/** Never attribute a session's cumulative tokens to its last observed model. */
export function usageAnalytics(values: readonly AgentUsage[]): UsageAnalyticsGroup[] {
  const groups = new Map<string, UsageAnalyticsGroup>();
  for (const value of values) {
    const key = `${value.kind}:${value.tokens.basis}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        kind: value.kind,
        basis: value.tokens.basis,
        sessions: 0,
        tokenSessions: 0,
        partialSessions: 0,
      };
      groups.set(key, group);
    }
    group.sessions++;
    if (value.partial || value.scanning || value.updatesStopped) group.partialSessions++;
    const t = value.tokens;
    // Reasoning is included in output by some agents; never add it to the total again.
    const components = [t.input, t.output, t.cacheRead, t.cacheWrite];
    const total =
      t.total ??
      (components.some((n) => n !== undefined)
        ? components.reduce<number>((a, b) => a + (b ?? 0), 0)
        : undefined);
    if (total !== undefined && Number.isFinite(total) && total >= 0) {
      group.tokens = (group.tokens ?? 0) + total;
      group.tokenSessions++;
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.basis.localeCompare(b.basis) || a.kind.localeCompare(b.kind),
  );
}

export interface HistoryTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}
export interface HistoryGroup extends HistoryTokens {
  label: string;
  calls: number;
}
export interface UsageHistory {
  from: string;
  to: string;
  timezone: "UTC";
  asOf: number;
  partial: boolean;
  files: number;
  excluded: number;
  calls: number;
  sessions: number;
  byDay: HistoryGroup[];
  byKind: HistoryGroup[];
  byModel: HistoryGroup[];
  byHour: HistoryGroup[];
  bySession: HistoryGroup[];
  totals: HistoryTokens;
  sources: string[];
}
