import type { UsageInsights } from "@sodashitsu/protocol";

export const USAGE_OVERVIEW_ASSESSMENT_TITLE = "ツール結果の機械評価（記録分）";
export const USAGE_OVERVIEW_ASSESSMENT_RULE = "点数 = ⌊(既知結果 − 失敗) ÷ 既知結果 × 100⌋。既知結果10件以上で評価。A ≥95・B ≥90・C ≥80・D ≥60・E <60。";
export const USAGE_OVERVIEW_ASSESSMENT_LIMIT = "選択期間内に開始されたツールの、取得時点までに判明した正式な結果だけの評価です。未取得・推定・入れ子の内訳は成功に含めません。成果品質・生産性・目的達成の評価ではなく、作業記録を読むAI評価とは別です。";
type Scope = Pick<UsageInsights, "totals" | "partial" | "collecting">;

/** Uses the full filtered aggregate, not the truncated tool-name list. Missing is never zero. */
export function usageOverviewAssessment(data: Scope) {
  const { tools, knownResults, errors } = data.totals;
  const valid = [tools, knownResults, errors].every(n => Number.isSafeInteger(n) && n >= 0)
    && errors <= knownResults && knownResults <= tools;
  const known = valid ? knownResults : null;
  const failed = valid ? errors : null;
  const success = valid ? knownResults - errors : null;
  const unknown = valid ? tools - knownResults : null;
  const score = valid && knownResults >= 10 ? Number(BigInt(knownResults - errors) * 100n / BigInt(knownResults)) : null;
  const grade = score === null ? null : score >= 95 ? "A" : score >= 90 ? "B" : score >= 80 ? "C" : score >= 60 ? "D" : "E";
  return {
    score, grade, known, failed, success, unknown,
    tools: valid ? tools : null,
    coveragePct: valid && tools > 0 ? knownResults / tools * 100 : null,
    provisional: data.partial || data.collecting,
    reason: !valid ? "集計値の整合性を確認できないため評価できません。"
      : knownResults < 10 ? "既知のツール結果が10件未満のため評価できません。" : "",
  };
}
