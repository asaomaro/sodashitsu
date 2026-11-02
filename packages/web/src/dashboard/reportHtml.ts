import { reportDocument, UsageReportDocument, type UsageReport } from "@sodashitsu/protocol";
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export const priorityLabel = (p: string) =>
  ({ high: "優先度 高", medium: "優先度 中", low: "優先度 低" })[p] ?? "提案";
export function resolvedReport(report: UsageReport): UsageReportDocument {
  const result = UsageReportDocument.safeParse(report.document);
  return result.success ? result.data : reportDocument(report.text);
}
export function reportHtml(report: UsageReport, scope: string): string {
  const d = resolvedReport(report),
    e = escapeHtml;
  const card = (title: string, content: string, cls = "") =>
    `<section class="card ${cls}"><h2>${e(title)}</h2>${content}</section>`;
  const metrics = Object.entries(report.metrics ?? {}).filter(
    ([, n]) => typeof n === "number" && Number.isFinite(n),
  );
  const labels: Record<string, string> = {
    tokens: "取得トークン",
    toolCalls: "ツール呼び出し",
    subRatio: "サブエージェント比率",
    cacheRatio: "キャッシュ読取率",
    costUsd: "記録USD（アカウント累計・期間指定なし）",
  };
  const metric = (key: string, n: number) =>
    key.endsWith("Ratio")
      ? `${n.toFixed(1)}%`
      : key === "costUsd"
        ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
        : Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>エージェント利用分析レポート</title><style>
:root{color-scheme:light dark;--bg:#f1f5fa;--panel:#fff;--fg:#19283c;--muted:#53657d;--line:#d3dfeb;--accent:#167d75;--soft:#e2f3ef}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.8 system-ui,sans-serif;overflow-wrap:anywhere}main{max-width:1120px;margin:auto;padding:36px 24px}header{padding:30px;border-radius:22px;background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--accent)}h1{font-size:30px;line-height:1.3;margin:8px 0 14px}h2{font-size:20px;margin-top:0}h3{font-size:16px}.meta,small{color:var(--muted)}.eyebrow{letter-spacing:2px;color:var(--accent);font-size:12px}.metrics,.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px;margin:22px 0}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric,.card{padding:24px;border:1px solid var(--line);border-radius:17px;background:var(--panel);min-width:0}.metric strong{display:block;font-size:28px}.wide{grid-column:1/-1}.item{border-top:1px solid var(--line);padding:16px 0}.item:first-of-type{border-top:0}.badge{display:inline-block;max-width:100%;background:var(--soft);color:var(--accent);padding:3px 10px;border-radius:20px;font-size:12px}.copy{white-space:pre-wrap;overflow-wrap:anywhere}.evidence{padding:12px;background:var(--soft);border-radius:10px;color:var(--muted)}footer{font-size:12px;color:var(--muted);margin-top:24px}@media(prefers-color-scheme:dark){:root{--bg:#101827;--panel:#1b283d;--fg:#e8eef8;--muted:#b2c1d5;--line:#3b4e65;--accent:#8bdfce;--soft:#243e44}}@media(max-width:600px){.grid{grid-template-columns:minmax(0,1fr)}main{padding:16px}header,.card{padding:19px}h1{font-size:25px}}@media print{body{background:white;color:black}.card,header{break-inside:avoid}}
</style></head><body><main><header><span class="eyebrow">SODASHITSU / AGENT ANALYSIS</span><h1>エージェント利用分析レポート</h1><p class="meta">${e(report.kind)} · ${e(report.model || "既定モデル")} · ${e(new Date(report.updatedAt).toLocaleString("ja-JP"))}</p><p class="meta">${e(scope)}</p><p class="copy">${e(d.summary || "現在の取り組み、利用傾向、改善案をまとめた生成時点の分析です。")}</p></header>${metrics.length ? `<div class="metrics">${metrics.map(([key, n]) => `<div class="metric"><small>${e(labels[key] ?? key)}</small><strong>${e(metric(key, n!))}</strong></div>`).join("")}</div>` : ""}<div class="grid">${card("現在の取り組み", d.work.length ? d.work.map((w) => `<article class="item"><span class="badge">${e(w.status || "取得した作業説明")}</span><h3>${e(w.agent)}${w.workspace ? " / " + e(w.workspace) : ""}</h3><p class="copy">${e(w.description)}</p>${w.evidence ? `<p class="evidence copy">${e(w.evidence)}</p>` : ""}</article>`).join("") : "<p>作業内容の説明は未取得です。</p>", "wide")}${card("使われ方", d.patterns.length ? d.patterns.map((p) => `<article class="item"><h3>${e(p.title)}</h3><p class="copy">${e(p.detail)}</p></article>`).join("") : "<p>利用傾向の説明は未取得です。</p>")}${card("改善案", d.recommendations.length ? d.recommendations.map((r) => `<article class="item"><span class="badge">${e(priorityLabel(r.priority))}</span><h3>${e(r.title)}</h3><p class="copy">${e(r.detail)}</p></article>`).join("") : "<p>改善案は未取得です。</p>")}${card("取得範囲と限界", d.limitations.length ? `<ul>${d.limitations.map((x) => `<li class="copy">${e(x)}</li>`).join("")}</ul>` : "<p>取得範囲の説明は未取得です。</p>", "wide")}</div><details><summary>テキスト版を表示</summary><pre class="copy">${e(report.text)}</pre></details><footer>生成時点の分析です。改善案はエージェントによる提案であり、現在の集計が変わっても自動更新されません。取得USDは請求額ではありません。</footer></main></body></html>`;
}
