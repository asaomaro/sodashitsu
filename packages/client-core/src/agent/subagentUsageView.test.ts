import { expect, it } from "vitest";
import type { SubagentUsage } from "@sodashitsu/protocol";
import { subagentUsageView } from "./subagentUsageView.js";
const view = (usage: SubagentUsage, reason?: string) =>
  subagentUsageView({
    result: { status: "ok", usage, ...(reason ? { reason } : {}) },
    loading: false,
    failed: false,
  });
it("only displays reported child fields, including real zero, and does not sum partial counters", () => {
  const v = view({
    source: "muse-events",
    consumptionScope: "self",
    tokens: { basis: "transcript", input: 10, output: 0, cacheRead: 5 },
  });
  expect(v.rows).toContainEqual({ label: "出力", value: "0" });
  expect(v.rows.map((r) => r.label)).not.toContain("合計");
  expect(v.rows.map((r) => r.label)).not.toContain("コスト (USD)");
  expect(v.rows.map((r) => r.label)).not.toContain("実観測時刻");
  expect(v.notes).toContain("トークン: 記録に残る分");
});
it("keeps subtree scope, provider USD, independent credit units and actual observation metadata", () => {
  const v = view(
    {
      source: "grok-usage",
      consumptionScope: "subtree",
      costUsd: 0.0031,
      costBasis: "reported",
      credits: { amount: 0.5, unit: "aic" },
      observedAt: 10000,
      costAsOf: 20000,
      partial: true,
      scanning: true,
    },
    "確認済み履歴です",
  );
  expect(v.rows).toContainEqual({ label: "消費の範囲", value: "この子と配下（報告範囲）" });
  expect(v.rows).toContainEqual({ label: "コスト (USD)", value: "$0.0031" });
  expect(v.rows.find((r) => r.label === "クレジット")?.value).toContain("AIC");
  expect(v.rows.map((r) => r.label)).toEqual(
    expect.arrayContaining(["実観測時刻", "コスト時点", "取得元"]),
  );
  expect(v.notes).toEqual(
    expect.arrayContaining(["確認済み履歴です", "一部取得（全量とは限りません）", "走査中"]),
  );
});
it("does not derive a percentage from counters or let invalid numeric fields render as usage", () => {
  const v = view({
    source: "rollout",
    consumptionScope: "self",
    contextTokens: 0,
    contextWindowTokens: 1000,
    costUsd: NaN,
    tokens: { basis: "context", input: -1, output: Infinity },
  });
  expect(v.rows).toContainEqual({ label: "コンテキスト", value: "0" });
  expect(v.contextPct).toBeUndefined();
  expect(v.rows.some((r) => ["入力", "出力", "コスト (USD)"].includes(r.label))).toBe(false);
  expect(view({ source: "rollout", consumptionScope: "self", contextUsedPct: 0 }).contextPct).toBe(
    0,
  );
});
it("keeps unavailable/history reason visible without inventing numeric zero", () => {
  const v = subagentUsageView({
    result: { status: "unavailable", reason: "履歴の対応を再確認できません" },
    failed: false,
    loading: false,
  });
  expect(v.rows).toEqual([]);
  expect(v.notes).toEqual(["履歴の対応を再確認できません"]);
});
it("keeps a tiny positive reported cost distinct from actual zero", () => {
  expect(
    view({ source: "grok-usage", consumptionScope: "subtree", costUsd: 0.000001 }).rows,
  ).toContainEqual({ label: "コスト (USD)", value: "<$0.0001" });
  expect(
    view({ source: "grok-usage", consumptionScope: "subtree", costUsd: 0 }).rows,
  ).toContainEqual({ label: "コスト (USD)", value: "$0" });
});
