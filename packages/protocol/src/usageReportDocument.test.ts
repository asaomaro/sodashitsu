import { expect, it } from "vitest";
import { reportDocument, UsageReportDocument } from "./usageReportDocument.js";
it("accepts a bounded structured report with a fenced JSON response", () => {
  const value = {
    summary: "要点",
    work: [{ agent: "Codex", description: "ダッシュボード整備" }],
    patterns: [],
    recommendations: [{ priority: "high", title: "取得範囲を確認", detail: "欠損を先に点検する" }],
    limitations: ["一部の記録"],
  };
  const d = reportDocument("```json\n" + JSON.stringify(value) + "\n```");
  expect(d.work[0]).toMatchObject({ agent: "Codex", workspace: "", status: "", evidence: "" });
  expect(d.recommendations[0]?.priority).toBe("high");
  expect(
    UsageReportDocument.safeParse({
      ...value,
      recommendations: [{ priority: "run-script", title: "x", detail: "x" }],
    }).success,
  ).toBe(false);
});
it("adapts older text reports into the new four-section view", () => {
  const r = reportDocument(
    "概要の説明\n## 現在の取り組み\n- UIを改修\n## 使われ方\nシェル利用が多い\n## 改善案\n取得範囲を確認\n## 取得範囲と限界\n部分取得",
  );
  expect(r.summary).toBe("概要の説明");
  expect(r.work[0]?.description).toContain("UIを改修");
  expect(r.patterns[0]?.detail).toContain("シェル利用");
  expect(r.recommendations[0]?.detail).toContain("取得範囲");
  expect(r.limitations).toEqual(["部分取得"]);
  expect(reportDocument("改善提案").summary).toBe("改善提案");
});
