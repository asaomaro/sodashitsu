<script setup lang="ts">
import { computed } from "vue";
import type { UsageReport } from "@sodashitsu/protocol";
import { totalLabel } from "./insightsModel.js";
import { resolvedReport, reportHtml, priorityLabel } from "./reportHtml.js";
const props = defineProps<{ report: UsageReport; scope: string }>();
const document = computed(() => resolvedReport(props.report));
const metricRows = computed(() => {
  const m = props.report.metrics ?? {};
  return [
    {
      label: "取得トークン",
      value: m.tokens,
      display: m.tokens === undefined ? undefined : totalLabel(m.tokens),
    },
    {
      label: "ツール呼び出し",
      value: m.toolCalls,
      display: m.toolCalls === undefined ? undefined : totalLabel(m.toolCalls),
    },
    { label: "サブエージェント比率", value: m.subRatio, display: m.subRatio?.toFixed(1) + "%" },
    { label: "キャッシュ読取率", value: m.cacheRatio, display: m.cacheRatio?.toFixed(1) + "%" },
    {
      label: "記録USD（アカウント累計・期間指定なし）",
      value: m.costUsd,
      display: "$" + m.costUsd?.toLocaleString("en-US", { maximumFractionDigits: 4 }),
    },
  ].filter((r) => typeof r.value === "number" && Number.isFinite(r.value));
});
function saveHtml() {
  const url = URL.createObjectURL(
    new Blob([reportHtml(props.report, props.scope)], { type: "text/html;charset=utf-8" }),
  );
  const link = globalThis.document.createElement("a");
  link.href = url;
  link.download = `soda-agent-analysis-${new Date(props.report.updatedAt).toISOString().slice(0, 10)}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <article class="report-sheet" data-usage-report aria-label="分析レポート">
    <header class="report-hero">
      <div class="report-heading">
        <div>
          <span class="eyebrow">SODASHITSU / AGENT ANALYSIS</span>
          <h2>エージェント利用分析レポート</h2>
        </div>
        <button data-save-report-html @click="saveHtml">HTMLを保存</button>
      </div>
      <p class="report-meta">
        {{ report.kind }} · {{ report.model || "既定モデル" }} ·
        {{ new Date(report.updatedAt).toLocaleString() }}
      </p>
      <p class="report-meta">{{ scope }}</p>
      <p class="report-summary">
        {{ document.summary || "現在の取り組み、利用傾向、改善案をまとめた生成時点の分析です。" }}
      </p>
    </header>
    <div v-if="metricRows.length" class="report-metrics">
      <div v-for="m in metricRows" :key="m.label">
        <span>{{ m.label }}</span
        ><strong>{{ m.display }}</strong>
      </div>
    </div>
    <div class="report-grid">
      <section class="report-card work">
        <div class="section-title">
          <span class="section-number">01</span>
          <h3>現在の取り組み</h3>
        </div>
        <div class="work-grid">
          <article v-for="(w, i) in document.work" :key="i" class="work-item">
            <span v-if="w.status" class="report-badge">{{ w.status }}</span>
            <h4>{{ w.agent }}</h4>
            <p v-if="w.workspace" class="workspace">{{ w.workspace }}</p>
            <p class="copy">{{ w.description }}</p>
            <p v-if="w.evidence" class="evidence copy">{{ w.evidence }}</p>
          </article>
          <p v-if="!document.work.length" class="muted">作業内容の説明は未取得です。</p>
        </div>
      </section>
      <section class="report-card">
        <div class="section-title">
          <span class="section-number">02</span>
          <h3>使われ方</h3>
        </div>
        <article v-for="(p, i) in document.patterns" :key="i" class="report-item">
          <h4>{{ p.title }}</h4>
          <p class="copy">{{ p.detail }}</p>
        </article>
        <p v-if="!document.patterns.length" class="muted">利用傾向の説明は未取得です。</p>
      </section>
      <section class="report-card">
        <div class="section-title">
          <span class="section-number">03</span>
          <h3>改善案</h3>
        </div>
        <article v-for="(r, i) in document.recommendations" :key="i" class="report-item">
          <span class="report-badge" :data-priority="r.priority">{{
            priorityLabel(r.priority)
          }}</span>
          <h4>{{ r.title }}</h4>
          <p class="copy">{{ r.detail }}</p>
        </article>
        <p v-if="!document.recommendations.length" class="muted">改善案は未取得です。</p>
      </section>
      <section class="report-card limits">
        <div class="section-title">
          <span class="section-number">04</span>
          <h3>取得範囲と限界</h3>
        </div>
        <ul v-if="document.limitations.length">
          <li v-for="(text, i) in document.limitations" :key="i" class="copy">{{ text }}</li>
        </ul>
        <p v-else class="muted">取得範囲の説明は未取得です。</p>
      </section>
    </div>
    <details class="report-source">
      <summary>テキスト版を表示</summary>
      <pre>{{ report.text }}</pre>
    </details>
    <footer>
      生成時点の分析です。改善案はエージェントによる提案で、現在の集計が変わっても自動更新されません。
    </footer>
  </article>
</template>
<style scoped>
.report-sheet {
  --report-accent: var(--soda-accent, #62d8bd);
  line-height: 1.8;
  margin-top: 24px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.report-hero {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--report-accent) 12%, var(--soda-menu-bg)),
    var(--soda-menu-bg)
  );
  border: 1px solid var(--soda-menu-border);
  border-top: 4px solid var(--report-accent);
  border-radius: 20px;
  padding: 28px;
}
.report-heading {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--report-accent);
}
h2 {
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1.4;
  margin: 6px 0;
}
h3 {
  font-size: 18px;
  margin: 0;
}
h4 {
  font-size: 16px;
  margin: 10px 0;
}
.report-meta,
.muted,
footer,
.workspace {
  color: color-mix(in srgb, var(--soda-fg) 76%, transparent);
  font-size: 12px;
}
.report-summary {
  font-size: 17px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.report-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin: 20px 0;
}
.report-metrics > div {
  padding: 18px 20px;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 14px;
}
.report-metrics span {
  font-size: 12px;
}
.report-metrics strong {
  display: block;
  font-size: 27px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}
.report-card {
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 16px;
  padding: 24px;
  min-width: 0;
}
.work,
.limits {
  grid-column: 1/-1;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.section-number {
  font-size: 23px;
  color: var(--report-accent);
  font-weight: 600;
}
.work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  gap: 18px;
}
.work-item {
  padding: 18px;
  border: 1px solid var(--soda-menu-border);
  border-radius: 12px;
  min-width: 0;
}
.report-heading > div {
  min-width: 0;
  flex: 1;
}
.report-source {
  margin-top: 18px;
}
.report-source summary {
  cursor: pointer;
}
.report-source pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 18px;
  border: 1px solid var(--soda-menu-border);
  border-radius: 12px;
  font: inherit;
}
.report-badge {
  display: inline-block;
  max-width: 100%;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  color: var(--report-accent);
  background: color-mix(in srgb, var(--report-accent) 13%, transparent);
}
.report-badge[data-priority="high"] {
  color: var(--soda-warn-fg);
  background: color-mix(in srgb, var(--soda-warn-fg) 12%, transparent);
}
.copy {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.evidence {
  padding: 12px;
  font-size: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--report-accent) 7%, transparent);
}
.report-item + .report-item {
  border-top: 1px solid var(--soda-menu-border);
  padding-top: 18px;
  margin-top: 18px;
}
button {
  font: inherit;
  color: inherit;
  padding: 9px 14px;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 8px;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--report-accent);
  outline-offset: 3px;
}
footer {
  margin-top: 18px;
}
li + li {
  margin-top: 10px;
}
@media (max-width: 680px) {
  .report-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .report-hero,
  .report-card {
    padding: 18px;
  }
  .report-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
