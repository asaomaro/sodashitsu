<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { usageAnalytics, type AccountCostResult, type UsageReport } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useUsageStore } from "../store/usage.js";
import { kindLabel } from "./dashboardModel.js";
import UsageHistoryPanel from "./UsageHistoryPanel.vue";
const historyRange = ref<{ from: string; to: string } | null>(null);
const usage = useUsageStore(),
  conn = inject(ConnectionKey, null);
const values = computed(() => Object.values(usage.panes));
const groups = computed(() => usageAnalytics(values.value));
const basisNames = {
  cumulative: "セッション累計",
  transcript: "記録に残る分",
  context: "現在のコンテキスト",
};
const sections = computed(() =>
  Object.entries(basisNames)
    .map(([basis, title]) => {
      const rows = groups.value.filter((g) => g.basis === basis);
      const total = rows.reduce((n, g) => n + (g.tokens ?? 0), 0);
      return { basis, title, total, rows };
    })
    .filter((s) => s.rows.length),
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
const money = (n: number | undefined) =>
  n === undefined ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
const number = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
const percent = (n: number | undefined, total: number) =>
  n === undefined || !total ? "—" : `${((n / total) * 100).toFixed(1)}%`;
// Bounded, in-memory observations only. These are cumulative snapshots, never per-period spend.
interface Observation {
  at: number;
  total: number;
  roster: string;
}
const observations = ref<Observation[]>([]);
watch(
  () => usage.panes,
  () => {
    const cumulative = values.value.filter((u) => u.tokens.basis === "cumulative");
    const rows = usageAnalytics(cumulative);
    if (!rows.some((g) => g.tokens !== undefined)) return;
    const next = {
      at: Date.now(),
      total: rows.reduce((n, g) => n + (g.tokens ?? 0), 0),
      roster: cumulative
        .map((u) => `${u.paneId}:${u.kind}`)
        .sort()
        .join("|"),
    };
    let last = observations.value.at(-1);
    if (last && (last.roster !== next.roster || next.total < last.total)) {
      observations.value = [];
      last = undefined;
    }
    if (!last || last.total !== next.total || next.at - last.at > 10_000)
      observations.value = [...observations.value, next].slice(-60);
  },
  { immediate: true },
);
const trendPoints = computed(() => {
  const points = observations.value,
    max = Math.max(1, ...points.map((p) => p.total));
  return points
    .map(
      (p, i) => `${10 + (i / Math.max(1, points.length - 1)) * 580},${145 - (p.total / max) * 130}`,
    )
    .join(" ");
});
const reportKind = ref<"claude" | "codex">("codex"),
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
    });
    if (!disposed) {
      report.value = result;
      reportScope.value = reportDescription;
    }
  } catch {
    if (!disposed)
      reportError.value =
        "レポートを生成できませんでした。選択したエージェントのログインとモデル設定、接続を確認してください。";
  } finally {
    if (!disposed) reportBusy.value = false;
  }
}
</script>

<template>
  <section class="analytics" aria-label="エージェント利用分析" data-usage-analytics-panel>
    <p>
      このマシンで取得できる利用状況です。期間別の履歴と、現在のpaneの状況をそれぞれ表示します。現在paneの種類別トークンは同じ数え方の中で比較する累計・記録値で、期間消費量や請求額ではありません。同じ会話を複数paneで開いている場合は重複を含みます。
    </p>
    <p v-if="!values.length" role="status">
      分析できる利用状況がありません。記録を取得できるエージェントを起動すると表示します。
    </p>
    <UsageHistoryPanel @loaded="historyRange = $event" />
    <div class="charts">
      <section
        v-for="section in sections"
        :key="section.basis"
        class="chart"
        :aria-label="section.title"
      >
        <h3>{{ section.title }} · 種類別トークン</h3>
        <p>
          取得分合計
          {{ number(section.rows.some((r) => r.tokenSessions > 0) ? section.total : undefined) }} ·
          同じ数え方の取得済みトークンに対する割合
        </p>
        <div v-for="row in section.rows" :key="row.kind" class="bar-row">
          <div class="bar-label">
            <strong>{{ kindLabel(row.kind) }}</strong
            ><span>{{ number(row.tokens) }} · {{ percent(row.tokens, section.total) }}</span>
          </div>
          <div class="track" aria-hidden="true">
            <div
              :style="{
                width: `${section.total ? ((row.tokens ?? 0) / section.total) * 100 : 0}%`,
              }"
            />
          </div>
          <small
            >{{ row.sessions }} pane · トークン取得 {{ row.tokenSessions }} · 一部/読取中/更新停止
            {{ row.partialSessions }}</small
          >
        </div>
      </section>
      <section class="chart" aria-label="累計の観測推移">
        <h3>表示中の観測推移 · セッション累計トークン</h3>
        <template v-if="observations.length > 1">
          <svg
            viewBox="0 0 600 160"
            role="img"
            :aria-label="`累計トークン ${number(observations[0]?.total)} から ${number(observations.at(-1)?.total)}`"
          >
            <polyline :points="trendPoints" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
          <p>
            {{ new Date(observations[0]!.at).toLocaleTimeString() }} —
            {{ new Date(observations.at(-1)!.at).toLocaleTimeString() }} ·
            {{ number(observations[0]!.total) }} → {{ number(observations.at(-1)!.total) }}
          </p>
        </template>
        <p v-else>
          表示中に累計値を2回以上取得すると描画します。この推移は現在paneの観測です。保存済みの期間履歴は上の「期間別の利用履歴」で確認できます。
        </p>
        <small
          >この画面を開いている間の最大60観測。paneの構成変更・値の減少でリセットします。記録の追加読取でも増えるため、この期間に消費した量とは限りません。閉じると消えます。</small
        >
      </section>
    </div>
    <section class="chart">
      <h3>モデル別コスト · 保存済みセッション</h3>
      <label
        >アカウント
        <select v-model="accountKey" data-analytics-account>
          <option value="">選択してください</option>
          <option
            v-for="account in usage.accounts"
            :key="account.accountKey"
            :value="account.accountKey"
          >
            {{ account.label }}
          </option>
        </select></label
      >
      <button :disabled="!accountKey || costBusy" @click="loadCost">記録を更新</button>
      <p>
        選択時だけ記録を読みます。期間指定なしの記録USDです。最後のモデルからトークン・コストを割り振りません。Bobcoin・AICはUSDと合算しません。paneごとの値は「状況一覧」で確認できます。
      </p>
      <p v-if="costBusy" role="status">記録を読み込み中…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="cost">
        <p>
          取得額 {{ money(cost.totalUsd) }} · {{ cost.sessions }} セッション · コスト未取得
          {{ cost.unpricedSessions }} · {{ new Date(cost.asOf).toLocaleString() }}
        </p>
        <p v-if="cost.partial" role="status">読取上限または読めない記録があり、一部の集計です。</p>
        <p v-if="!cost.byModel.length">モデル別に取得できるUSDの記録がありません。</p>
        <div v-for="row in cost.byModel" :key="row.label" class="bar-row" data-analytics-model>
          <div class="bar-label">
            <strong>{{ row.label }}</strong
            ><span
              >{{ money(row.usd) }} · {{ percent(row.usd, cost.totalUsd ?? 0) }} ·
              {{ row.sessions }} セッション</span
            >
          </div>
          <div class="track" aria-hidden="true">
            <div :style="{ width: `${cost.totalUsd ? (row.usd / cost.totalUsd) * 100 : 0}%` }" />
          </div>
        </div>
        <small
          >会計記録に明示されたモデルだけに分類し、残りは「不明」です。契約料金ではありません。</small
        >
      </template>
    </section>
    <section class="chart" aria-label="利用状況レポート">
      <h3>エージェントによる利用状況レポート</h3>
      <p>
        「レポートを生成」を押すと、このマシンでログイン済みのエージェントが数値・モデル名・時点から説明と改善提案を作ります。会話本文は送りません。モデルの利用が発生します。
      </p>
      <label
        >エージェント
        <select v-model="reportKind" :disabled="reportBusy">
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select></label
      >
      <label
        >モデル
        <input
          v-model="model"
          :disabled="reportBusy"
          maxlength="100"
          placeholder="空欄は既定モデル"
      /></label>
      <button
        data-generate-usage-report
        :disabled="reportBusy || (!values.length && !cost && !historyRange)"
        @click="generate"
      >
        {{ reportBusy ? "生成中…" : "レポートを生成" }}
      </button>
      <p v-if="reportBusy" role="status">エージェントがレポートを生成しています…</p>
      <p v-if="reportError" role="alert">{{ reportError }}</p>
      <template v-if="report">
        <p>
          {{ report.kind }} · {{ report.model || "既定モデル" }} ·
          {{ new Date(report.updatedAt).toLocaleString() }} · {{ reportScope }}（生成時のデータ）
        </p>
        <p class="report" data-usage-report>{{ report.text }}</p>
        <small
          >エージェントの提案です。現在のグラフが更新されても、このレポートは自動更新されません。</small
        >
      </template>
    </section>
  </section>
</template>

<style scoped>
.analytics {
  max-width: 100rem;
  margin: auto;
  line-height: 1.6;
}
.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr));
  gap: 1rem;
}
.chart {
  min-width: 0;
  margin: 1rem 0;
  padding: 1rem;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-card-radius, 8px);
  background: var(--soda-menu-bg, #282a36);
}
h3 {
  margin: 0 0 0.8rem;
  font-size: 1rem;
}
p {
  margin: 0.8rem 0;
}
small {
  opacity: 0.8;
}
.bar-row {
  margin: 1rem 0;
}
.bar-label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  overflow-wrap: anywhere;
}
.track {
  height: 0.7rem;
  background: color-mix(in srgb, currentColor 12%, transparent);
  border-radius: 5px;
  margin: 0.4rem 0;
  overflow: hidden;
}
.track > div {
  height: 100%;
  background: var(--soda-accent, #80aaff);
}
svg {
  width: 100%;
  color: var(--soda-accent, #80aaff);
}
label {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.3rem 0.8rem 0.3rem 0;
}
select,
input,
button {
  color: inherit;
  background: var(--soda-bg, #1e1f29);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.5rem;
  font: inherit;
  max-width: 100%;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.report {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
