import type { AccountUsage, AgentUsage } from "@sodashitsu/protocol";
import type { UsageFields } from "../agent/AgentReportSocket.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";
import { accountKeyOf } from "./reportedUsage.js";

/** Accepted only after the server verifies the current pane process and session. */
export interface AntigravityUsageReport extends UsageFields {
  paneId: string;
  sessionId: string;
  agentPid?: number;
}

/** Public statusline metadata only. No transcript, credentials or speculative pricing. */
export class AntigravityUsageAdapter implements UsageAdapter {
  readonly kind = "agy";
  private readonly panes = new Map<string, { report: AntigravityUsageReport; at: number }>();
  private readonly accountReports = new Map<string, { report: AntigravityUsageReport; at: number }>();
  private closed = false;
  constructor(private readonly now: () => number = Date.now) {}

  note(report: AntigravityUsageReport): void {
    if (this.closed) return;
    const entry = { report, at: this.now() };
    this.panes.delete(report.paneId);
    this.panes.set(report.paneId, entry);
    while (this.panes.size > 256) this.panes.delete(this.panes.keys().next().value!);
    if (report.quota?.length) {
      const key = accountKeyOf(this.kind, report.configKey);
      this.accountReports.delete(key);
      this.accountReports.set(key, entry);
      while (this.accountReports.size > 16) this.accountReports.delete(this.accountReports.keys().next().value!);
    }
  }

  async usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null> {
    const entry = this.panes.get(source.paneId);
    if (!entry || entry.report.sessionId !== source.sessionId) return null;
    const { report: r, at } = entry;
    // current_usage describes the current context, not billed or lifetime totals.
    const tokens: AgentUsage["tokens"] = { basis: "context" };
    if (r.inputTokens !== undefined) tokens.input = r.inputTokens;
    if (r.outputTokens !== undefined) tokens.output = r.outputTokens;
    if (r.cacheReadTokens !== undefined) tokens.cacheRead = r.cacheReadTokens;
    if (r.cacheWriteTokens !== undefined) tokens.cacheWrite = r.cacheWriteTokens;
    return {
      model: r.model ?? r.modelName ?? null, tokens, source: "statusline", updatedAt: at,
      ...(r.contextTokens !== undefined ? { contextTokens: r.contextTokens } : {}),
      ...(r.contextWindowSize !== undefined ? { contextWindowTokens: r.contextWindowSize } : {}),
      ...(r.contextUsedPct !== undefined ? { contextUsedPct: r.contextUsedPct } : {}),
    };
  }

  async accounts(): Promise<AccountUsage[]> {
    const now = this.now();
    return [...this.accountReports].map(([accountKey, { report: r, at }]) => ({
      kind: this.kind, accountKey, label: "Antigravity CLI", source: "statusline", asOf: at,
      windows: (r.quota ?? []).map(w => ({
        label: w.label, usedPct: w.usedPct,
        ...(w.resetsAt !== undefined ? { resetsAt: w.resetsAt * 1000, ...(w.resetsAt * 1000 <= now ? { stale: true } : {}) } : {}),
      })),
    }));
  }

  forget(paneId: string): void { this.panes.delete(paneId); }
  close(): void { this.closed = true; this.panes.clear(); this.accountReports.clear(); }
}
