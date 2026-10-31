import { expect, it } from "vitest";
import type { AgentUsage } from "./usage.js";
import { UsageReportParams, usageAnalytics } from "./usageAnalytics.js";
const usage = (kind: string, tokens: AgentUsage["tokens"], extra = {}): AgentUsage => ({
  paneId: kind,
  kind,
  model: "last-model",
  source: "rollout",
  updatedAt: 1,
  tokens,
  ...extra,
});
it("keeps incompatible token bases separate, missing counts unknown, and reasoning unduplicated", () => {
  const rows = usageAnalytics([
    usage("codex", { basis: "cumulative", total: 100, output: 20, reasoning: 10 }),
    usage("codex", { basis: "cumulative", input: 10, output: 20, reasoning: 5 }, { partial: true }),
    usage("claude", { basis: "transcript", input: 20, cacheRead: 30 }),
    usage("claude", { basis: "context", input: 5 }),
    usage("bob", { basis: "cumulative" }),
  ]);
  expect(rows.find((r) => r.kind === "codex")).toEqual({
    kind: "codex",
    basis: "cumulative",
    tokens: 130,
    sessions: 2,
    tokenSessions: 2,
    partialSessions: 1,
  });
  expect(rows.find((r) => r.kind === "bob")?.tokens).toBeUndefined();
  expect(
    rows
      .filter((r) => r.kind === "claude")
      .map((r) => r.tokens)
      .sort((a, b) => a! - b!),
  ).toEqual([5, 50]);
  expect(rows.every((r) => !("model" in r))).toBe(true);
});
it("report parameters accept only supported models and bounded account keys", () => {
  expect(
    UsageReportParams.safeParse({ settings: { kind: "codex", model: "--bad model" } }).success,
  ).toBe(false);
  expect(UsageReportParams.safeParse({ settings: { kind: "bob", model: "" } }).success).toBe(false);
  expect(
    UsageReportParams.safeParse({
      settings: { kind: "claude", model: "sonnet" },
      accountKey: "a".repeat(129),
    }).success,
  ).toBe(false);
});
