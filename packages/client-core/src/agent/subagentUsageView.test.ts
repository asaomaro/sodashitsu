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
it.each([7, {}, []])("ignores a malformed peer reason instead of throwing %#", (reason) => {
  const v = subagentUsageView({
    result: { status: "unavailable", reason } as never,
    loading: false,
    failed: false,
  });
  expect(v.rows).toEqual([]);
  expect(v.notes).toEqual(["子の利用状況は未取得です。"]);
});
it.each(["__proto__", "constructor", ["rollout"]])(
  "does not coerce a malformed source or basis into a known label %#",
  (value) => {
    const v = view({
      source: value,
      consumptionScope: "self",
      tokens: { basis: value, input: 3 },
    } as unknown as SubagentUsage);
    expect(v.rows.some((r) => r.label === "取得元")).toBe(false);
    expect(v.notes.some((n) => n.startsWith("トークン:"))).toBe(false);
  },
);
it("shows Cursor child DB context without inventing consumption or time",()=>{
 const r=view({source:'cursor-db',consumptionScope:'self',contextTokens:25,contextWindowTokens:100,contextUsedPct:25,partial:true});expect(r.rows).toContainEqual({label:'取得元',value:'Cursor子DB'});expect(r.contextPct).toBe(25);expect(r.rows.some(r=>['入力','合計','コスト (USD)','実観測時刻'].includes(r.label))).toBe(false);
});
it("fails closed on an unknown source instead of showing unattributed numbers",()=>{
 const r=view({source:'future-provider' as never,consumptionScope:'self',contextTokens:999,tokens:{basis:'transcript',total:999}});expect(r.rows).toHaveLength(0);expect(r.contextPct).toBeUndefined();expect(r.notes.join(' ')).toContain('取得元を確認できない');
});

it("does not drop raw Cursor usage above its window when the provider clamps the graph",()=>{const r=view({source:'cursor-db',consumptionScope:'self',contextTokens:100,contextWindowTokens:50,contextUsedPct:100,partial:true});expect(r.rows).toContainEqual({label:'コンテキスト',value:'100'});expect(r.rows).toContainEqual({label:'コンテキスト上限',value:'50'});expect(r.contextPct).toBe(100);});
