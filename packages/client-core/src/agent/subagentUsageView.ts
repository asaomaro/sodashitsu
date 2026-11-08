import { formatUsageCredits, type UsageSource } from "@sodashitsu/protocol";
import type { SubagentUsageState } from "./SubagentUsageReader.js";
export interface ChildUsageView {
  rows: Array<{ label: string; value: string }>;
  notes: string[];
  contextPct?: number;
}
const sources: Record<UsageSource, string> = {
  statusline: "ステータスライン",
  hook: "フック",
  transcript: "会話記録",
  "cost-state": "会計記録",
  rollout: "Codex記録",
  "bob-db": "Bob記録",
  "copilot-events": "Copilot記録",
  "muse-events": "Muse記録",
  "agy-transcript": "AGY記録",
  "grok-usage": "Grok利用記録",
};
const number = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const amount = (v: number) => v.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
const time = (v: number) => new Date(v).toLocaleString("ja-JP");
/** Never derives totals, copies a parent, converts credits or estimates a price. */
export function subagentUsageView(state: SubagentUsageState): ChildUsageView {
  const view: ChildUsageView = { rows: [], notes: [] },
    r = state.result,
    u = r?.status === "ok" ? r.usage : undefined;
  if (state.loading) view.notes.push("利用状況を取得中…");
  if (state.failed) view.notes.push("子の利用状況を取得できません。利用ゼロを意味しません。");
  if (r?.reason) view.notes.push(r.reason.slice(0, 1000));
  if (!u) {
    if (!state.loading && !state.failed && !r?.reason)
      view.notes.push("子の利用状況は未取得です。");
    return view;
  }
  view.rows.push({
    label: "消費の範囲",
    value:
      u.consumptionScope === "self"
        ? "この子のみ"
        : u.consumptionScope === "subtree"
          ? "この子と配下（報告範囲）"
          : "未取得",
  });
  const add = (label: string, v: unknown) => {
    if (number(v)) view.rows.push({ label, value: amount(v) });
  };
  const tokens = u.tokens;
  if (tokens) {
    add("入力", tokens.input);
    add("出力", tokens.output);
    add("キャッシュ読取", tokens.cacheRead);
    add("キャッシュ書込", tokens.cacheWrite);
    add("推論", tokens.reasoning);
    add("合計", tokens.total);
    const basis = {
      cumulative: "報告された累計",
      transcript: "記録に残る分",
      context: "文脈内（消費累計ではありません）",
    }[tokens.basis];
    if (basis) view.notes.push(`トークン: ${basis}`);
  }
  add("コンテキスト", u.contextTokens);
  add("コンテキスト上限", u.contextWindowTokens);
  if (number(u.contextUsedPct) && u.contextUsedPct <= 100) {
    view.contextPct = u.contextUsedPct;
    view.rows.push({ label: "コンテキスト使用率", value: `${amount(u.contextUsedPct)}%` });
  }
  if (number(u.costUsd))
    view.rows.push({
      label: "コスト (USD)",
      value: u.costUsd > 0 && u.costUsd < 0.0001 ? "<$0.0001" : `$${amount(u.costUsd)}`,
    });
  if (
    u.credits &&
    number(u.credits.amount) &&
    (u.credits.unit === "bobcoin" || u.credits.unit === "aic")
  )
    view.rows.push({ label: "クレジット", value: formatUsageCredits(u.credits) });
  if (number(u.observedAt)) view.rows.push({ label: "実観測時刻", value: time(u.observedAt) });
  if (number(u.costAsOf)) view.rows.push({ label: "コスト時点", value: time(u.costAsOf) });
  const source = sources[u.source];
  if (source) view.rows.push({ label: "取得元", value: source });
  if (u.costBasis === "reported") view.notes.push("コスト: 製品が報告したUSD");
  else if (u.costBasis === "cost-state") view.notes.push("コスト: 会計記録");
  if (u.partial || u.costPartial) view.notes.push("一部取得（全量とは限りません）");
  if (u.scanning) view.notes.push("走査中");
  return view;
}
