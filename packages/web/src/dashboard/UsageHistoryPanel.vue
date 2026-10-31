<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import type { HistoryGroup, HistoryTokens, UsageHistory } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { kindLabel } from "./dashboardModel.js";
const emit = defineEmits<{ loaded: [range: { from: string; to: string } | null] }>();
const conn = inject(ConnectionKey, null);
const date = (at: number) => new Date(at).toISOString().slice(0, 10);
const to = ref(date(Date.now())),
  from = ref(date(Date.now() - 29 * 86400000));
const result = ref<UsageHistory | null>(null),
  busy = ref(false),
  error = ref("");
const bucket = ref<"day" | "week" | "month">("day");
let disposed = false,
  version = 0;
onBeforeUnmount(() => {
  disposed = true;
  version++;
});
async function load() {
  if (!conn || busy.value) return;
  const id = ++version;
  busy.value = true;
  error.value = "";

  try {
    const response = await conn.request("agent.usage_history", { from: from.value, to: to.value });
    if (!disposed && id === version) {
      result.value = response;
      emit("loaded", { from: response.from, to: response.to });
    }
  } catch {
    if (!disposed && id === version)
      error.value =
        "履歴を取得できませんでした。有効な日付を最大366日間で指定し、接続を確認してください。";
  } finally {
    if (!disposed && id === version) busy.value = false;
  }
}
function preset(days: number) {
  to.value = date(Date.now());
  from.value = date(Date.now() - (days - 1) * 86400000);
  void load();
}
onMounted(load);
const number = (n: number) => n.toLocaleString();
const pct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "—");
const periods = computed(() => {
  if (!result.value) return [];
  const map = new Map<string, { label: string; total: number; observed: boolean }>();
  for (
    let at = Date.parse(result.value.from + "T00:00:00Z");
    at <= Date.parse(result.value.to + "T00:00:00Z");
    at += 86400000
  ) {
    const day = date(at),
      row = result.value.byDay.find((r) => r.label === day);
    let label = day;
    if (bucket.value === "month") label = label.slice(0, 7);
    if (bucket.value === "week") {
      const at = new Date(day + "T00:00:00Z");
      at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
      label = date(at.getTime()) + "週";
    }
    const old = map.get(label) ?? { label, total: 0, observed: false };
    old.total += row?.total ?? 0;
    old.observed ||= row !== undefined;
    map.set(label, old);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
});
const periodMax = computed(() => Math.max(0, ...periods.value.map((p) => p.total)));
const peak = computed(
  () => periods.value.filter((p) => p.observed).sort((a, b) => b.total - a.total)[0],
);
const width = (n: number, total: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
const series = computed(() => {
  if (!result.value) return [];
  return [
    {
      title: "種類別の期間トークン",
      rows: result.value.byKind.map((r) => ({ ...r, label: kindLabel(r.label) })),
    },
    { title: "モデル別の期間トークン", rows: result.value.byModel },
    { title: "利用の多いセッション（上位20件）", rows: result.value.bySession },
  ];
});
const components: { key: keyof Omit<HistoryTokens, "total">; label: string }[] = [
  { key: "input", label: "入力（キャッシュを除く）" },
  { key: "output", label: "出力（推論を含む）" },
  { key: "cacheRead", label: "キャッシュ読取" },
  { key: "cacheWrite", label: "キャッシュ作成" },
];
const hours = computed(() =>
  Array.from(
    { length: 24 },
    (_, h) =>
      result.value?.byHour.find((r) => Number(r.label) === h) ?? {
        label: String(h).padStart(2, "0"),
        total: 0,
      },
  ),
);
const hourMax = computed(() => Math.max(1, ...hours.value.map((h) => h.total)));
</script>
<template>
  <section class="history" data-usage-history aria-label="期間別の利用履歴">
    <header>
      <h3>期間別の利用履歴</h3>
      <span>UTC · 実記録のトークン</span>
    </header>
    <div class="controls">
      <label>開始日 <input v-model="from" type="date" :disabled="busy" data-history-from /></label>
      <label>終了日 <input v-model="to" type="date" :disabled="busy" data-history-to /></label>
      <button :disabled="busy" data-load-usage-history @click="load">
        {{ busy ? "集計中…" : "期間を集計" }}
      </button>
      <button v-for="days in [7, 30, 90]" :key="days" :disabled="busy" @click="preset(days)">
        {{ days }}日
      </button>
    </div>
    <p>
      Claude
      Codeの主会話の応答使用量、Codexの累計差分を、記録にある応答・計数イベントの時刻で集計します。Bob
      Shell・Copilot
      CLI・Antigravity・サブエージェントの別ファイルは対象外です。金額の期間消費は推定しません。
    </p>
    <p v-if="busy" role="status">上限のある読み取りで履歴を集計しています…</p>
    <p v-if="error" role="alert">
      {{ error
      }}<span v-if="result">
        以下は前回取得した {{ result.from }}〜{{ result.to }} UTC の結果です。</span
      >
    </p>
    <template v-if="result">
      <div class="metrics">
        <div>
          <strong>{{ number(result.totals.total) }}</strong
          >記録トークン
        </div>
        <div>
          <strong>{{ result.calls }}</strong
          >応答・計数イベント
        </div>
        <div>
          <strong>{{ result.sessions }}</strong
          >セッション
        </div>
        <div>
          <strong>{{ result.files }}</strong
          >読取ファイル
        </div>
      </div>
      <p>
        {{ result.from }} 〜 {{ result.to }}（両端を含む・UTC）· 取得
        {{ new Date(result.asOf).toLocaleString() }} · 日付/ID/差分を確認できず除外
        {{ result.excluded }} 件
      </p>
      <p v-if="result.partial" class="warning" role="status">
        一部の履歴です。読取上限・読めない記録・累計のリセット等があります。空白の日は未取得の場合もあり、利用ゼロとは断定できません。
      </p>
      <p v-if="!result.calls">
        この期間に集計できる履歴がありません。記録のない利用量は0と断定できません。
      </p>
      <div v-else class="grid">
        <section class="card wide">
          <h4>利用推移</h4>
          <label
            >まとめ方
            <select v-model="bucket">
              <option value="day">日別</option>
              <option value="week">週別（月曜始まり）</option>
              <option value="month">月別</option>
            </select></label
          >
          <p>期間端の週・月は選択期間内だけを集計します。棒のない日付は未取得の場合があります。</p>
          <div class="periods">
            <div v-for="row in periods" :key="row.label" class="period">
              <span>{{ row.observed ? number(row.total) : "未取得" }}</span>
              <div
                class="column"
                :class="{ missing: !row.observed }"
                :title="
                  row.observed
                    ? `${row.label}: ${number(row.total)} トークン`
                    : `${row.label}: 未取得`
                "
              >
                <i v-if="row.observed" :style="{ height: width(row.total, periodMax) }" />
              </div>
              <span>{{ row.label }}</span>
            </div>
          </div>
          <p>最大取得 {{ peak?.label ?? "—" }} · {{ number(periodMax) }} トークン</p>
        </section>
        <section v-for="group in series" :key="group.title" class="card">
          <h4>{{ group.title }}</h4>
          <div v-for="row in group.rows" :key="row.label" class="row">
            <div>
              <strong>{{ row.label }}</strong
              ><span>{{ number(row.total) }} · {{ pct(row.total, result.totals.total) }}</span>
            </div>
            <div class="track">
              <i :style="{ width: width(row.total, result.totals.total) }" />
            </div>
            <small>{{ row.calls }} 応答・計数イベント</small>
          </div>
        </section>
        <section class="card">
          <h4>入力・出力・キャッシュの構成</h4>
          <div class="stack" aria-hidden="true">
            <i
              v-for="(item, index) in components"
              :key="item.key"
              :class="`token-color-${index}`"
              :style="{ width: width(result.totals[item.key], result.totals.total) }"
            />
          </div>
          <div v-for="item in components" :key="item.key" class="row">
            <div>
              <strong>{{ item.label }}</strong
              ><span
                >{{ number(result.totals[item.key]) }} ·
                {{ pct(result.totals[item.key], result.totals.total) }}</span
              >
            </div>
            <div class="track">
              <i :style="{ width: width(result.totals[item.key], result.totals.total) }" />
            </div>
          </div>
          <small
            >Claudeの入力・キャッシュは別項目です。Codexの入力にはキャッシュが含まれるため、読取を引いた入力と読取に分けます。推論は出力に含まれ、再加算しません。Codexのキャッシュ作成はこの履歴から取得していません。</small
          >
        </section>
        <section class="card wide">
          <h4>時刻帯ごとの利用（UTC）</h4>
          <div class="hours">
            <div
              v-for="hour in hours"
              :key="hour.label"
              class="hour-cell"
              :style="{
                background: `color-mix(in srgb, var(--soda-accent, #80aaff) ${10 + (hour.total / hourMax) * 55}%, transparent)`,
              }"
            >
              <span>{{ hour.label }}時</span><strong>{{ number(hour.total) }}</strong>
            </div>
          </div>
          <p>各日の同じ時刻帯を合計。応答・計数イベントの時刻で、作業時間ではありません。</p>
        </section>
      </div>
      <details>
        <summary>集計元と限界</summary>
        <ul>
          <li v-for="source in result.sources" :key="source">{{ source }}</li>
        </ul>
        <p>
          最大366日・512ファイル・64MiB・1ファイル末尾2MiB・約4秒の範囲で読み、最大30秒キャッシュします。記録の日時がない応答は除外し、ファイル更新時刻で代用しません。Codexの末尾のみ読めた場合、最初の累計は基準が不明なため除外します。モデルはその応答または直前のturn_contextで確かめたものだけです。ログの削除・保持期間・読取上限の影響で実際の総量より少ない場合があります。
        </p>
      </details>
    </template>
  </section>
</template>
<style scoped>
.history {
  margin: 1rem 0;
  padding: 1rem;
  background: var(--soda-menu-bg, #282a36);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 8px;
}
header,
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
}
h3,
h4 {
  margin: 0 0 0.7rem;
}
label {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
}
input,
select,
button {
  font: inherit;
  background: var(--soda-bg, #1e1f29);
  color: inherit;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.4rem;
  max-width: 100%;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}
.metrics strong {
  display: block;
  font-size: 1.6rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr));
  gap: 1rem;
}
.card {
  min-width: 0;
  padding: 1rem;
  background: var(--soda-bg, #1e1f29);
  border-radius: 6px;
}
.wide {
  grid-column: 1/-1;
}
.row {
  margin: 1rem 0;
}
.row > div:first-child {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.4rem;
  overflow-wrap: anywhere;
}
.track {
  height: 0.7rem;
  background: color-mix(in srgb, currentColor 12%, transparent);
  margin: 0.4rem 0;
}
.track i,
.column i {
  display: block;
  background: var(--soda-accent, #80aaff);
  height: 100%;
}
.periods {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  align-items: end;
}
.period {
  flex: 1 0 5.2rem;
  text-align: center;
  font-size: 0.8rem;
}
.column {
  height: 9rem;
  display: flex;
  align-items: end;
  background: color-mix(in srgb, currentColor 5%, transparent);
}
.column i {
  width: 100%;
}
.hours {
  display: grid;
  grid-template-columns: repeat(24, minmax(1rem, 1fr));
  gap: 3px;
  overflow-x: auto;
}
.hours small {
  font-size: 0.7rem;
}
small {
  opacity: 0.8;
}
.warning {
  color: var(--soda-warn-fg, #ffb86c);
}
</style>

<style scoped>
.column.missing {
  border: 1px dashed var(--soda-menu-border, #777);
  background: transparent;
}
.stack {
  display: flex;
  height: 1.4rem;
  margin: 1rem 0;
  overflow: hidden;
  border-radius: 4px;
}
.stack i {
  height: 100%;
}
.token-color-0 {
  background: #80aaff;
}
.token-color-1 {
  background: #50cba0;
}
.token-color-2 {
  background: #e8ad60;
}
.token-color-3 {
  background: #b99aee;
}
.legend {
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  margin-right: 0.4rem;
}
.hours {
  grid-template-columns: repeat(auto-fit, minmax(4rem, 1fr));
  gap: 0.4rem;
}
.hour-cell {
  padding: 0.5rem;
  text-align: center;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
}
.hour-cell strong {
  display: block;
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
</style>
