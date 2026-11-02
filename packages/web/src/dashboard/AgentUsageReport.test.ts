import { expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { UsageReport } from "@sodashitsu/protocol";
import AgentUsageReport from "./AgentUsageReport.vue";
import { reportHtml } from "./reportHtml.js";
const report: UsageReport = {
  text: "fallback",
  kind: "codex",
  model: "",
  updatedAt: Date.parse("2026-11-02T00:00:00Z"),
  metrics: { tokens: 0, toolCalls: 42, subRatio: 60 },
  document: {
    summary: "作業と利用の要点",
    work: [
      {
        agent: "実装担当",
        workspace: "操舵室",
        status: "進行中",
        description: "新しい分析画面を整備",
        evidence: "直近の作業指示",
      },
    ],
    patterns: [{ title: "ツール利用", detail: "MCPを利用" }],
    recommendations: [{ priority: "high", title: "取得範囲を確認", detail: "欠損を点検する" }],
    limitations: ["部分取得"],
  },
};
it("renders work, observed metrics and prioritized recommendations as semantic HTML", () => {
  const w = mount(AgentUsageReport, { props: { report, scope: "現在のPC" } });
  expect(w.findAll(".work-item")).toHaveLength(1);
  expect(w.get(".report-summary").text()).toContain("要点");
  expect(w.get('[data-priority="high"]').text()).toBe("優先度 高");
  expect(w.findAll(".report-metrics strong").map((x) => x.text())).toEqual(["0", "42", "60.0%"]);
  expect(w.findAll("h3").map((x) => x.text())).toEqual([
    "現在の取り組み",
    "使われ方",
    "改善案",
    "取得範囲と限界",
  ]);
  w.unmount();
});
it("keeps generated HTML and script-looking content inert in both the view and standalone export", () => {
  const poisoned = {
    ...report,
    document: {
      ...report.document!,
      summary: '<img src=x onerror="alert(1)">',
      work: [{ ...report.document!.work[0]!, agent: "</h3><script>alert(1)</script>" }],
    },
  };
  const w = mount(AgentUsageReport, { props: { report: poisoned, scope: "<private>" } });
  expect(w.find("img").exists()).toBe(false);
  expect(w.find("script").exists()).toBe(false);
  expect(w.text()).toContain("<img");
  const html = reportHtml(poisoned, "<private>");
  expect(html).toContain("&lt;img");
  expect(html).toContain("&lt;private&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("default-src 'none'");
  w.unmount();
});
it("renders legacy reports through the same rich layout", () => {
  const old = { ...report, text: "## 現在の取り組み\n監査を実施\n## 改善案\n結果を確認" };
  delete old.document;
  const w = mount(AgentUsageReport, { props: { report: old, scope: "現在のPC" } });
  expect(w.get(".work-item").text()).toContain("監査");
  expect(w.findAll(".report-card")).toHaveLength(4);
  expect(reportHtml(old, "scope")).toContain("監査");
  w.unmount();
});

it("keeps the full previous report available beyond the compact card excerpt", () => {
  const old: UsageReport = {
    kind: "claude",
    model: "",
    updatedAt: 1,
    text: "長い旧レポート".repeat(800) + "終端の重要な説明",
  };
  const w = mount(AgentUsageReport, { props: { report: old, scope: "scope" } });
  expect(w.get(".report-source pre").text()).toContain("終端の重要な説明");
  expect(reportHtml(old, "scope")).toContain("終端の重要な説明");
  w.unmount();
});
