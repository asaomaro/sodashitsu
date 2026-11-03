<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import type { AccountCostResult, UsageReport, UsageInsightsParams } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useUsageStore } from "../store/usage.js";
import UsageInsightsPanel from "./UsageInsightsPanel.vue";
import UsageAccountCost from "./UsageAccountCost.vue";
import AgentUsageReport from "./AgentUsageReport.vue";
const screen = ref("overview"),
  insightSelection = ref<UsageInsightsParams | null>(null),
  historyRange = ref<{ from: string; to: string } | null>(null);
const usage = useUsageStore(),
  conn = inject(ConnectionKey, null);
const selectedAccountLabel = computed(
  () => usage.accounts.find((a) => a.accountKey === accountKey.value)?.label ?? "選択なし",
);
const accountKey = ref(""),
  cost = ref<AccountCostResult | null>(null),
  costBusy = ref(false),
  error = ref("");
let version = 0,
  disposed = false;
onBeforeUnmount(() => {
  disposed = true;
  version++;
});
watch(
  () => usage.accounts,
  (accounts) => {
    if (accountKey.value && !accounts.some((a) => a.accountKey === accountKey.value)) {
      accountKey.value = "";
      cost.value = null;
    }
  },
);
async function loadCost() {
  const requestVersion = ++version;
  cost.value = null;
  error.value = "";
  if (!accountKey.value || !conn) {
    costBusy.value = false;
    return;
  }
  costBusy.value = true;
  try {
    const result = await conn.request("agent.account_cost", { accountKey: accountKey.value });
    if (!disposed && requestVersion === version) cost.value = result;
  } catch {
    if (!disposed && requestVersion === version)
      error.value = "アカウントの記録を取得できませんでした。";
  } finally {
    if (!disposed && requestVersion === version) costBusy.value = false;
  }
}
watch(accountKey, loadCost);
const reportKind = ref<"claude" | "codex" | "muse" | "agy" | "copilot">("codex"),
  model = ref(""),
  report = ref<UsageReport | null>(null),
  reportBusy = ref(false),
  reportError = ref("");
const reportScope = ref("");
async function generate() {
  if (!conn || reportBusy.value) return;
  reportBusy.value = true;
  reportError.value = "";
  const key = accountKey.value;
  const scope =
    "現在のpane" +
    (key
      ? ` + 選択アカウント ${usage.accounts.find((a) => a.accountKey === key)?.label ?? "選択アカウント"}`
      : "");
  const range = historyRange.value;
  const reportDescription = scope + (range ? ` · 履歴 ${range.from}〜${range.to} UTC` : "");
  try {
    const result = await conn.request("agent.usage_report", {
      settings: { kind: reportKind.value, model: model.value },
      ...(key ? { accountKey: key } : {}),
      ...(historyRange.value ? { history: historyRange.value } : {}),
      ...(insightSelection.value ? { insights: insightSelection.value } : {}),
    });
    if (!disposed) {
      report.value = result;
      reportScope.value = reportDescription;
    }
  } catch {
    if (!disposed)
      reportError.value =
        "レポートを生成できませんでした。選択したエージェントのログインとモデル設定、接続を確認してください。対象の作業が切り替わった場合は再生成してください。";
  } finally {
    if (!disposed) reportBusy.value = false;
  }
}
</script>
<template>
  <section class="analytics" aria-label="エージェント利用分析" data-usage-analytics-panel>
    <nav class="analysis-navigation" aria-label="利用分析の画面">
      <button
        v-for="tab in [
          ['overview', '概要'],
          ['compare', '比較'],
          ['agents', '親子・ツール'],
          ['report', 'エージェント分析'],
        ]"
        :key="tab[0]"
        :aria-pressed="screen === tab[0]"
        @click="screen = tab[0]!"
      >
        {{ tab[1] }}
      </button>
    </nav>
    <UsageInsightsPanel
      v-show="screen !== 'report'"
      :layout="screen"
      :active="screen !== 'report'"
      @loaded="historyRange = $event"
      @insights="insightSelection = $event"
    />
    <UsageAccountCost
      v-show="screen === 'compare'"
      :accounts="usage.accounts"
      :selected="accountKey"
      :cost="cost"
      :busy="costBusy"
      :error="error"
      @select="accountKey = $event"
      @refresh="loadCost"
    />
    <section v-show="screen === 'report'" class="agent-analysis" data-agent-analysis>
      <header class="analysis-heading">
        <span class="eyebrow">AGENT ANALYSIS</span>
        <h2>作業と利用の傾向を、次の改善につなげる</h2>
        <p>現在の取り組み、使われ方、改善案をまとめたレポートを作成します。</p>
      </header>
      <section class="report-settings" aria-label="レポート生成設定">
        <div class="report-controls">
          <label
            >分析エージェント<select v-model="reportKind" :disabled="reportBusy">
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option><option value="muse">Muse Code</option><option value="agy">Antigravity CLI</option><option value="copilot">GitHub Copilot CLI</option>
            </select></label
          ><label
            >モデル<input
              v-model="model"
              :disabled="reportBusy"
              maxlength="100"
              placeholder="空欄は既定モデル" /></label
          ><label
            >コストの対象<select
              v-model="accountKey"
              :disabled="reportBusy || costBusy"
              data-report-account
            >
              <option value="">追加しない</option>
              <option v-for="a in usage.accounts" :key="a.accountKey" :value="a.accountKey">
                {{ a.label }}
              </option>
            </select></label
          ><button data-assistant-action
            class="generate-report"
            data-generate-usage-report
            :disabled="reportBusy"
            @click="generate"
          >
            {{ reportBusy ? "分析中…" : "レポートを生成" }}
          </button>
        </div>
        <p class="scope-caption">
          対象は現在接続PC ·
          {{ historyRange ? `${historyRange.from}〜${historyRange.to} UTC` : "現在のペイン" }} ·
          コスト {{ selectedAccountLabel }}
        </p>
        <p class="scope-caption">現在の作業の抜粋を生成先へ渡します。モデルの利用が発生します。</p>
        <details>
          <summary>分析対象と送信する情報</summary>
          <p>
            概要で取得した期間・条件と現在の作業を、選択したログイン済みエージェントで分析します。現在のエージェントの直近会話の限定抜粋、作業項目、保存済み要約を生成先へ渡します。モデルの利用が発生します。別PCの比較結果は含めません。画面を開くだけではモデルを呼びません。
          </p>
        </details>
      </section>
      <p v-if="reportBusy" class="analysis-status" role="status">
        現在の取り組みと利用データを分析しています…
      </p>
      <p v-if="reportError" role="alert">{{ reportError }}</p>
      <AgentUsageReport v-if="report" :report="report" :scope="reportScope" />
      <section v-else-if="!reportBusy" class="report-empty">
        <div class="empty-symbol" aria-hidden="true">◈</div>
        <h3>取り組みと、次の一手を見渡す</h3>
        <p>レポートを生成すると、根拠のある作業状況と利用傾向を、読みやすいカードで表示します。</p>
        <div class="report-preview-labels">
          <span>01 現在の取り組み</span><span>02 使われ方</span><span>03 改善案</span
          ><span>04 取得範囲と限界</span>
        </div>
      </section>
    </section>
  </section>
</template>
<style scoped>
.analytics {
  max-width: 100rem;
  margin: auto;
  line-height: 1.7;
  min-width: 0;
}
.analysis-navigation {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 8px 0 20px;
}
button,
select,
input {
  font: inherit;
  color: inherit;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 9px;
  padding: 9px 14px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
button {
  cursor: pointer;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--soda-accent);
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
.analysis-navigation button[aria-pressed="true"] {
  border-color: var(--soda-accent);
  background: color-mix(in srgb, var(--soda-accent) 16%, var(--soda-menu-bg));
}
.analysis-heading {
  margin: 28px 0;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 2px;
  color: var(--soda-accent);
}
.analysis-heading h2 {
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1.4;
  margin: 8px 0;
}
.analysis-heading p,
.scope-caption,
details,
.report-empty p {
  color: color-mix(in srgb, var(--soda-fg) 76%, transparent);
}
.report-settings {
  padding: 22px;
  border: 1px solid var(--soda-menu-border);
  border-radius: 16px;
  background: var(--soda-menu-bg);
}
.report-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: end;
}
.report-controls label {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  font-size: 12px;
  flex: 1;
  min-width: 130px;
  max-width: 260px;
}
.report-controls input,
.report-controls select {
  width: 100%;
  background: var(--soda-bg);
}
.generate-report {
  border-color: var(--soda-accent);
  background: color-mix(in srgb, var(--soda-accent) 18%, var(--soda-bg));
  font-weight: 600;
}
.scope-caption,
details {
  font-size: 12px;
}
.scope-caption {
  margin: 14px 0 8px;
}
summary {
  cursor: pointer;
}
.analysis-status {
  padding: 18px;
  border-left: 3px solid var(--soda-accent);
  background: color-mix(in srgb, var(--soda-accent) 7%, transparent);
}
.report-empty {
  text-align: center;
  padding: 42px 24px;
  border: 1px dashed var(--soda-menu-border);
  border-radius: 18px;
  margin-top: 22px;
  background: color-mix(in srgb, var(--soda-accent) 3%, var(--soda-menu-bg));
}
.empty-symbol {
  font-size: 46px;
  color: var(--soda-accent);
}
.report-preview-labels {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 26px;
}
.report-preview-labels span {
  border: 1px solid var(--soda-menu-border);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 12px;
}
@media (max-width: 680px) {
  .report-settings {
    padding: 16px;
  }
  .report-controls {
    gap: 10px;
  }
  .report-controls label {
    min-width: 120px;
    max-width: 100%;
  }
  .generate-report {
    width: 100%;
  }
  .report-empty {
    padding: 26px 16px;
  }
  .report-preview-labels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
