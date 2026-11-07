import { observedSetting, reportedSettings } from "./executionSettings.js";
import { CopilotUsageAdapter } from "./copilotAdapter.js";
import { ExtraUsageAdapter } from "./museAdapter.js";
import type { ExtraRoots } from "../conversation/ExtraAgentRecords.js";
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
  readonly kind: "agy" | "copilot";
  private readonly panes = new Map<string, { report: AntigravityUsageReport; at: number }>();
  private readonly accountReports = new Map<
    string,
    { report: AntigravityUsageReport; at: number }
  >();
  private closed = false;
  private readonly transcript: UsageAdapter;
  constructor(
    private readonly now: () => number = Date.now,
    roots: ExtraRoots = {},
    kind: "agy" | "copilot" = "agy",
  ) {
    this.kind = kind;
    this.transcript =
      kind === "agy" ? new ExtraUsageAdapter("agy", roots) : new CopilotUsageAdapter();
  }

  note(report: AntigravityUsageReport): void {
    if (this.closed) return;
    const entry = { report, at: this.now() };
    this.panes.delete(report.paneId);
    this.panes.set(report.paneId, entry);
    while (this.panes.size > 256) this.panes.delete(this.panes.keys().next().value!);
    if (report.quota?.length || report.balances?.length || report.plan) {
      const key = accountKeyOf(this.kind, report.configKey);
      this.accountReports.delete(key);
      this.accountReports.set(key, entry);
      while (this.accountReports.size > 16)
        this.accountReports.delete(this.accountReports.keys().next().value!);
    }
  }

  async usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null> {
    const transcript = await this.transcript.usageFor(source);
    const entry = this.panes.get(source.paneId);
    if (!entry || entry.report.sessionId !== source.sessionId) return transcript;
    const { report: r, at } = entry;
    const effort = observedSetting(r.reasoningEffort, "statusline", "statusline");
    const executionSettings = reportedSettings(r.executionSettings) ?? (effort ? { reasoningEffort: effort } : undefined);
    // current_usage describes the current context, not billed or lifetime totals.
    const tokens: AgentUsage["tokens"] = { basis: "context" };
    if (r.inputTokens !== undefined) tokens.input = r.inputTokens;
    if (r.outputTokens !== undefined) tokens.output = r.outputTokens;
    if (r.cacheReadTokens !== undefined) tokens.cacheRead = r.cacheReadTokens;
    if (r.cacheWriteTokens !== undefined) tokens.cacheWrite = r.cacheWriteTokens;
    return {
      ...transcript,
      model: r.model ?? r.modelName ?? transcript?.model ?? null,
      tokens: r.cumulativeTokens
        ? { basis: "cumulative", ...r.cumulativeTokens }
        : (transcript?.tokens ?? tokens),
      source: r.cumulativeTokens ? "statusline" : (transcript?.source ?? "statusline"),
      updatedAt: Math.max(transcript?.updatedAt ?? 0, at),
      ...(r.reasoningEffort !== undefined ? { reasoningEffort: r.reasoningEffort } : {}),
      ...(executionSettings ? { executionSettings } : {}),
      ...(r.contextRemainingTokens !== undefined
        ? { contextRemainingTokens: r.contextRemainingTokens }
        : {}),
      ...(r.costUsd !== undefined ? { costUsd: r.costUsd, costBasis: "reported" as const } : {}),
      ...(r.costEstimated !== undefined ? { costEstimated: r.costEstimated } : {}),
      ...(r.costPartial !== undefined ? { costPartial: r.costPartial } : {}),
      ...(r.creditsAic !== undefined
        ? { credits: { amount: r.creditsAic, unit: "aic" as const } }
        : transcript?.credits
          ? { credits: transcript.credits }
          : {}),
      ...(r.premiumRequests !== undefined
        ? { premiumRequests: r.premiumRequests }
        : transcript?.premiumRequests !== undefined
          ? { premiumRequests: transcript.premiumRequests }
          : {}),
      ...(transcript?.partial ? { partial: true } : {}),
      ...(transcript?.scanning ? { scanning: true } : {}),
      ...(r.contextTokens !== undefined ? { contextTokens: r.contextTokens } : {}),
      ...(r.contextWindowSize !== undefined ? { contextWindowTokens: r.contextWindowSize } : {}),
      ...(r.contextUsedPct !== undefined ? { contextUsedPct: r.contextUsedPct } : {}),
    };
  }

  async accounts(): Promise<AccountUsage[]> {
    const now = this.now();
    return [...this.accountReports].map(([accountKey, { report: r, at }]) => ({
      kind: this.kind,
      accountKey,
      label: this.kind === "agy" ? "Antigravity CLI" : "GitHub Copilot CLI",
      source: "statusline",
      asOf: at,
      ...(r.plan ? { plan: r.plan } : {}),
      ...(r.balances
        ? {
            balances: r.balances.map((w) => ({
              ...w,
              ...(w.resetsAt !== undefined
                ? { resetsAt: w.resetsAt * 1000, stale: w.resetsAt * 1000 <= now }
                : {}),
            })),
          }
        : {}),
      windows: (r.quota ?? []).map((w) => ({
        label: w.label,
        usedPct: w.usedPct,
        ...(w.resetsAt !== undefined
          ? { resetsAt: w.resetsAt * 1000, ...(w.resetsAt * 1000 <= now ? { stale: true } : {}) }
          : {}),
      })),
    }));
  }

  forget(paneId: string): void {
    this.panes.delete(paneId);
    this.transcript.forget?.(paneId);
  }
  close(): void {
    this.closed = true;
    this.transcript.close?.();
    this.panes.clear();
    this.accountReports.clear();
  }
}
