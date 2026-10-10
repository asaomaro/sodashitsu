<script setup lang="ts">
/**
 * ダッシュボードの中身（20261010-agent-usage PR3）。デスクトップの画面（`DashboardScreen`）と、1 列の重ねるダイアログ（`DashboardDialog`）が同じものを使う。
 * 上部にアカウントの枠（制限の使用率・リセットまでの時間）、下に、エージェントが居る pane 1 つが 1 行の一覧。行を押す（Enter）と、その pane へ移る。
 * **見るだけ**（サーバへ送るのは、移る操作の `pane.focus` と、見ている間の `agent.usage_watch`〔`UsageController`〕だけ）。数字・モデル名・時刻・ラベルだけを出す。
 * 値が無いものは「—」（0 と書かない）。古い値は薄く、時刻つきで。形（表／カード）は画面の様式のトークンで替わる。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { paneNameOf } from "@sodashitsu/client-core";
import StateIcon from "../components/StateIcon.vue";
import { ConnectionKey } from "../injection.js";
import { displayStateFor, useSeenStore } from "../store/seen.js";
import { useSessionStore } from "../store/session.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
import {
  accountsByKind,
  basisDescription,
  basisLabel,
  buildRows,
  contextDisplay,
  filterRows,
  formatAgo,
  formatCost,
  formatTokens,
  isStale,
  kindLabel,
  kindsOf,
  NONE,
  SORT_KEYS,
  sortRows,
  totalTokens,
  windowDisplay,
  type DashboardRow,
  type SortKey,
} from "./dashboardModel.js";

const props = defineProps<{
  /** `screen`＝主な領域の画面、`dialog`＝1 列の画面の重ねるダイアログ。 */
  kind: "screen" | "dialog";
  /** 見えている間だけ true（時計を進める）。 */
  active: boolean;
}>();

const view = useViewStore();
const session = useSessionStore();
const seen = useSeenStore();
const usage = useUsageStore();
const conn = inject(ConnectionKey, null);

// --- 時計（「N 分前」・リセットまでの時間）。見えている間だけ 10 秒ごと ------------------------------------------------
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
function startClock(): void {
  now.value = Date.now();
  if (clock === undefined) clock = setInterval(() => (now.value = Date.now()), 10_000);
}
function stopClock(): void {
  if (clock !== undefined) clearInterval(clock);
  clock = undefined;
}
watch(
  () => props.active,
  (a) => (a ? startClock() : stopClock()),
  { immediate: true },
);
onBeforeUnmount(stopClock);

// --- 並べ替え・絞り込み（見ている人の便宜。ブラウザに覚えておく） -------------------------------------------------------
const SORT_STORE = "soda.dashboard.sort.v1";
function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORE);
    if (v !== null && SORT_KEYS.some((s) => s.key === v)) return v as SortKey;
  } catch {
    // 読めなくても、既定で動く
  }
  return "state";
}
const sortKey = ref<SortKey>(loadSort());
watch(sortKey, (v) => {
  try {
    localStorage.setItem(SORT_STORE, v);
  } catch {
    // 保存できなくても、表示は変わる
  }
});
/** 種類の絞り込み（`""`＝すべて）。 */
const kindFilter = ref("");

// --- 行 -------------------------------------------------------------------------------------------------------------
const allRows = computed(() =>
  buildRows({
    panes: session.panes.values(),
    tabs: session.tabs,
    workspaces: session.workspaces,
    usage: usage.panes,
    stateOf: (p) => displayStateFor(p.agent, seen.getSeenSeq(p.agent?.instanceId ?? "", p.agent?.serverSeenSeq ?? 0)) ?? "unknown",
    nameOf: (p) => paneNameOf(p),
  }),
);
const kinds = computed(() => kindsOf(allRows.value));
// 絞り込みの種類が居なくなったら、すべてに戻す。
watch(kinds, (k) => {
  if (kindFilter.value !== "" && !k.includes(kindFilter.value)) kindFilter.value = "";
});
const rows = computed(() => sortRows(filterRows(allRows.value, kindFilter.value === "" ? null : kindFilter.value), sortKey.value));

const accountGroups = computed(() => accountsByKind(usage.accounts));

// --- 移る -----------------------------------------------------------------------------------------------------------
function go(row: DashboardRow): void {
  if (!session.panes.has(row.paneId)) return;
  view.closeDashboard();
  view.setView(row.workspaceId, row.tabId);
  view.focusPane(row.paneId);
  void conn?.request("pane.focus", { paneId: row.paneId }).catch(() => undefined);
}

// --- キーボード（行の移動・Enter） ------------------------------------------------------------------------------------
const rootEl = ref<HTMLElement | null>(null);
const activePane = ref<string | null>(null);
/** 移動の入口（tabindex=0）の行: 選んでいる行、無ければ先頭。 */
const entryPane = computed(() => {
  const id = activePane.value;
  if (id !== null && rows.value.some((r) => r.paneId === id)) return id;
  return rows.value[0]?.paneId ?? null;
});
function focusRow(paneId: string | null): void {
  if (paneId === null) return;
  activePane.value = paneId;
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>(`[data-dash-row="${CSS.escape(paneId)}"]`)?.focus());
}
function onRowKeydown(ev: KeyboardEvent, row: DashboardRow): void {
  const list = rows.value;
  const i = list.findIndex((r) => r.paneId === row.paneId);
  let target: string | null = null;
  switch (ev.key) {
    case "ArrowDown":
      target = list[Math.min(list.length - 1, i + 1)]?.paneId ?? null;
      break;
    case "ArrowUp":
      target = list[Math.max(0, i - 1)]?.paneId ?? null;
      break;
    case "Home":
      target = list[0]?.paneId ?? null;
      break;
    case "End":
      target = list[list.length - 1]?.paneId ?? null;
      break;
    case "Enter":
    case " ":
      ev.preventDefault();
      go(row);
      return;
    default:
      return;
  }
  ev.preventDefault();
  focusRow(target);
}
function onRootKeydown(ev: KeyboardEvent): void {
  // 画面のとき、Esc で基本画面へ戻る（ダイアログは `<dialog>` の cancel が閉じる）。選択の部品（select）が開いているときの Esc は、その部品に任せる。
  if (props.kind === "screen" && ev.key === "Escape" && !(ev.target instanceof HTMLSelectElement)) {
    ev.preventDefault();
    view.closeDashboard();
  }
}

// 画面が前に出たときに、フォーカスを入れる（端末の入力がここへ来ないように。最初の行、無ければ見出し）。
watch(
  () => props.active,
  (a) => {
    if (!a) return;
    void nextTick(() => {
      if (rootEl.value?.contains(document.activeElement)) return;
      if (entryPane.value !== null) focusRow(entryPane.value);
      else rootEl.value?.focus();
    });
  },
  { immediate: true },
);

// 幅が狭いとき（重ねるダイアログ・狭い窓）は、行をカードの縦並びにする。
const compact = ref(props.kind === "dialog");
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (props.kind === "dialog") return;
  if (typeof ResizeObserver === "undefined" || rootEl.value === null) return;
  observer = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width ?? 0;
    if (w > 0) compact.value = w < 820;
  });
  observer.observe(rootEl.value);
});
onBeforeUnmount(() => observer?.disconnect());

// --- 表示の部品 -------------------------------------------------------------------------------------------------------
function kindText(kind: string): string {
  return kindLabel(kind);
}
function placeText(r: DashboardRow): string {
  const ws = r.workspaceLabel === "" ? NONE : r.workspaceLabel;
  return r.tabLabel === "" ? ws : `${ws} / ${r.tabLabel}`;
}
function tokensText(r: DashboardRow): string {
  return r.usage === null ? NONE : formatTokens(totalTokens(r.usage));
}
function costText(r: DashboardRow): string {
  return formatCost(r.usage?.costUsd);
}
/** コストの時点・見積りの添え書き。 */
function costNote(r: DashboardRow): string | null {
  const u = r.usage;
  if (u === null || u.costUsd === undefined) return null;
  if (u.costBasis === "cost-state" && u.costAsOf !== undefined) return `${formatAgo(u.costAsOf, now.value)}の時点`;
  if (u.costBasis === "reported") return "見積り";
  return null;
}
function usageNotes(r: DashboardRow): string[] {
  const u = r.usage;
  if (u === null) return [];
  const notes: string[] = [];
  if (u.scanning === true) notes.push("読み込み中");
  if (u.partial === true) notes.push("一部");
  if (u.updatesStopped === true) notes.push("更新停止");
  return notes;
}
function stale(r: DashboardRow): boolean {
  return r.usage !== null && (r.usage.updatesStopped === true || isStale(r.usage.updatedAt, now.value));
}
function subagentsText(r: DashboardRow): string {
  return r.subagents === null ? NONE : String(r.subagents);
}
function rowLabel(r: DashboardRow): string {
  const u = r.usage;
  const parts = [r.name, kindText(r.kind), placeText(r), `トークン ${tokensText(r)}`, `コスト ${costText(r)}`];
  if (u !== null) parts.push(`コンテキスト ${contextDisplay(u).text}`);
  parts.push("Enter で開く");
  return parts.join("、");
}
const loading = computed(() => !usage.loaded && !usage.unsupported && !usage.failed);
</script>

<template>
  <section
    ref="rootEl"
    class="dash"
    :class="[`dash-${kind}`, { 'dash-compact': compact }]"
    data-dashboard
    :data-dashboard-kind="kind"
    aria-label="ダッシュボード"
    tabindex="-1"
    @keydown="onRootKeydown"
  >
    <header class="dash-head">
      <h2 class="dash-title">ダッシュボード</h2>
      <div class="dash-tools">
        <label class="dash-tool">
          <span>並べ替え</span>
          <select v-model="sortKey" class="dash-select" data-dash-sort>
            <option v-for="s in SORT_KEYS" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </label>
        <label class="dash-tool">
          <span>種類</span>
          <select v-model="kindFilter" class="dash-select" data-dash-kind>
            <option value="">すべて</option>
            <option v-for="k in kinds" :key="k" :value="k">{{ kindText(k) }}</option>
          </select>
        </label>
      </div>
    </header>

    <p v-if="usage.unsupported" class="dash-note dash-note-warn" role="status" data-dash-unsupported>このマシンのサーバは、利用状況に対応していません（サーバを更新すると出ます）。</p>
    <p v-else-if="usage.failed" class="dash-note dash-note-warn" role="status" data-dash-failed>利用状況を取れませんでした。画面を開き直すと、取り直します。</p>
    <p v-else-if="loading" class="dash-note" role="status" data-dash-loading>読み込んでいます…</p>

    <!-- アカウントの枠 -->
    <section class="dash-accounts" aria-label="アカウントの利用枠" data-dash-accounts>
      <h3 class="dash-sub">アカウントの利用枠</h3>
      <p v-if="accountGroups.length === 0" class="dash-muted" data-dash-no-accounts>まだ値がありません</p>
      <div v-for="g in accountGroups" :key="g.kind" class="dash-account-group" :data-dash-account-kind="g.kind">
        <div v-for="a in g.accounts" :key="a.accountKey" class="dash-account" :class="{ 'dash-stale': isStale(a.asOf, now) }" :data-dash-account="a.accountKey">
          <div class="dash-account-head">
            <span class="dash-account-name">{{ a.label }}</span>
            <span v-if="a.plan" class="dash-chip">{{ a.plan }}</span>
            <span class="dash-muted dash-account-ago" :title="new Date(a.asOf).toLocaleString()">{{ formatAgo(a.asOf, now) }}</span>
          </div>
          <p v-if="a.windows.length === 0" class="dash-muted">枠の値がありません</p>
          <ul v-else class="dash-windows">
            <li v-for="w in a.windows" :key="w.label + String(w.windowMinutes ?? '')" class="dash-window" :class="{ 'dash-stale': windowDisplay(w, now).past }" data-dash-window>
              <span class="dash-window-label">{{ w.label }}</span>
              <span
                class="dash-bar"
                role="progressbar"
                :aria-label="`${a.label} ${w.label}の使用率`"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="windowDisplay(w, now).pct ?? undefined"
                :aria-valuetext="windowDisplay(w, now).text"
              >
                <span class="dash-bar-fill" :style="{ width: `${windowDisplay(w, now).pct ?? 0}%` }" />
              </span>
              <span class="dash-window-pct">{{ windowDisplay(w, now).text }}</span>
              <span v-if="windowDisplay(w, now).spend" class="dash-muted dash-window-spend" data-dash-spend>{{ windowDisplay(w, now).spend }}</span>
              <span v-if="windowDisplay(w, now).reset" class="dash-muted dash-window-reset">{{ windowDisplay(w, now).reset }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 一覧 -->
    <section class="dash-list" aria-label="エージェント" data-dash-list>
      <h3 class="dash-sub">エージェント<span class="dash-count" data-dash-count>{{ rows.length }}</span></h3>
      <p v-if="allRows.length === 0" class="dash-muted dash-empty" data-dash-empty>起動しているエージェントがありません。pane でエージェントを起動すると、ここに並びます。</p>
      <p v-else-if="rows.length === 0" class="dash-muted dash-empty" data-dash-empty-filter>この種類のエージェントは居ません。</p>
      <div v-else class="dash-table" role="table" aria-label="エージェントの利用状況">
        <div class="dash-row dash-row-head" role="row">
          <span class="dash-c dash-c-state" role="columnheader">状態</span>
          <span class="dash-c dash-c-kind" role="columnheader">種類</span>
          <span class="dash-c dash-c-name" role="columnheader">名前</span>
          <span class="dash-c dash-c-model" role="columnheader">モデル</span>
          <span class="dash-c dash-c-place" role="columnheader">場所</span>
          <span class="dash-c dash-c-sub" role="columnheader">サブ</span>
          <span class="dash-c dash-c-tokens" role="columnheader">トークン</span>
          <span class="dash-c dash-c-cost" role="columnheader">コスト</span>
          <span class="dash-c dash-c-ctx" role="columnheader">コンテキスト</span>
          <span class="dash-c dash-c-ago" role="columnheader">最後の動き</span>
        </div>
        <div
          v-for="r in rows"
          :key="r.paneId"
          class="dash-row dash-row-body"
          :class="{ 'dash-stale': stale(r), 'dash-row-selected': r.paneId === view.focusedPaneId }"
          role="row"
          :tabindex="r.paneId === entryPane ? 0 : -1"
          :aria-label="rowLabel(r)"
          :data-dash-row="r.paneId"
          :data-dash-state="r.state"
          @click="go(r)"
          @keydown="onRowKeydown($event, r)"
          @focus="activePane = r.paneId"
        >
          <span class="dash-c dash-c-state" role="cell"><StateIcon :state="r.state" /></span>
          <span class="dash-c dash-c-kind" role="cell"><span class="dash-cell-label" aria-hidden="true">種類</span>{{ kindText(r.kind) }}</span>
          <span class="dash-c dash-c-name" role="cell" :title="r.name">{{ r.name }}</span>
          <span class="dash-c dash-c-model" role="cell"><span class="dash-cell-label" aria-hidden="true">モデル</span>{{ r.usage?.model ?? NONE }}</span>
          <span class="dash-c dash-c-place" role="cell" :title="r.cwd">
            <span class="dash-place-ws">{{ placeText(r) }}</span>
            <span v-if="r.branch" class="dash-place-branch">（{{ r.branch }}）</span>
            <span class="dash-muted dash-place-cwd">{{ r.cwd }}</span>
          </span>
          <span class="dash-c dash-c-sub" role="cell"><span class="dash-cell-label" aria-hidden="true">サブ</span>{{ subagentsText(r) }}</span>
          <span class="dash-c dash-c-tokens" role="cell" data-dash-tokens>
            <span class="dash-cell-label" aria-hidden="true">トークン</span>
            <span class="dash-num">{{ tokensText(r) }}</span>
            <span v-if="r.usage" class="dash-muted dash-basis" :title="basisDescription(r.usage.tokens.basis)">{{ basisLabel(r.usage.tokens.basis) }}</span>
            <span v-for="n in usageNotes(r)" :key="n" class="dash-chip">{{ n }}</span>
            <span v-if="stale(r) && r.usage" class="dash-muted dash-updated" :title="new Date(r.usage.updatedAt).toLocaleString()">{{ formatAgo(r.usage.updatedAt, now) }}</span>
          </span>
          <span class="dash-c dash-c-cost" role="cell" data-dash-cost>
            <span class="dash-cell-label" aria-hidden="true">コスト</span>
            <span class="dash-num">{{ costText(r) }}</span>
            <span v-if="costNote(r)" class="dash-muted dash-cost-note">{{ costNote(r) }}</span>
          </span>
          <span class="dash-c dash-c-ctx" role="cell" data-dash-context>
            <span class="dash-cell-label" aria-hidden="true">コンテキスト</span>
            <span
              v-if="contextDisplay(r.usage).pct !== null"
              class="dash-bar dash-bar-small"
              role="progressbar"
              aria-label="コンテキストの使用率"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuenow="contextDisplay(r.usage).pct ?? undefined"
            >
              <span class="dash-bar-fill" :style="{ width: `${contextDisplay(r.usage).pct}%` }" />
            </span>
            <span class="dash-num">{{ contextDisplay(r.usage).text }}</span>
          </span>
          <span class="dash-c dash-c-ago" role="cell" :title="new Date(r.since).toLocaleString()"><span class="dash-cell-label" aria-hidden="true">最後の動き</span>{{ formatAgo(r.since, now) }}</span>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.dash {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  padding: var(--soda-shape-pad, 0.8em);
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
  container-type: inline-size;
}
.dash-dialog {
  padding: 0.6em;
}
.dash-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6em 1.2em;
  margin-bottom: 0.6em;
}
.dash-title {
  margin: 0;
  font-size: 1.05em;
  flex: 1 1 auto;
}
.dash-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6em 1em;
}
.dash-tool {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.dash-select {
  min-height: var(--soda-shape-control-h, 0);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s, 3px);
  font: inherit;
  padding: 0.15em 0.4em;
}
.dash-sub {
  margin: 0.8em 0 0.4em;
  font-size: 0.9em;
  font-weight: 600;
  opacity: 0.85;
}
.dash-count {
  margin-left: 0.5em;
  font-weight: normal;
  opacity: 0.7;
}
.dash-muted {
  opacity: 0.65;
  font-size: 0.9em;
}
.dash-note {
  margin: 0.4em 0;
  font-size: 0.9em;
  opacity: 0.8;
}
.dash-note-warn {
  color: var(--soda-warn-fg, #ffb86c);
  opacity: 1;
}
.dash-chip {
  display: inline-block;
  padding: 0 0.4em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s, 3px);
  font-size: 0.8em;
  line-height: 1.4;
}
/* 古い値（更新が 1 分より前・リセットを過ぎた枠・更新停止）は薄く（時刻は文字でも出す） */
.dash-stale {
  opacity: 0.6;
}

/* アカウントの枠 */
.dash-accounts {
  margin-bottom: 0.8em;
}
.dash-account-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6em 1.2em;
}
.dash-account {
  min-width: 18em;
  flex: 1 1 18em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  padding: 0.4em 0.7em 0.5em;
}
.dash-account-head {
  display: flex;
  align-items: baseline;
  gap: 0.6em;
  margin-bottom: 0.3em;
}
.dash-account-name {
  font-weight: 600;
}
.dash-account-ago {
  margin-left: auto;
}
.dash-windows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3em;
}
.dash-window {
  display: grid;
  grid-template-columns: 4.5em minmax(6em, 1fr) 6.5em;
  align-items: center;
  gap: 0.2em 0.6em;
}
.dash-window-reset,
.dash-window-spend {
  grid-column: 2 / 4;
}
.dash-window-pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.dash-bar {
  position: relative;
  display: block;
  height: 0.6em;
  border-radius: 0.3em;
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) 18%, transparent);
  overflow: hidden;
}
.dash-bar-small {
  display: inline-block;
  width: 4.5em;
  vertical-align: middle;
  margin-right: 0.4em;
}
.dash-bar-fill {
  display: block;
  height: 100%;
  background: var(--soda-accent, #6070a1);
}

/* 一覧（クラシック: 端末らしい表） */
.dash-table {
  display: grid;
  min-width: 0;
}
.dash-row {
  display: grid;
  grid-template-columns: 1.6em 6.5em minmax(7em, 1.2fr) minmax(8em, 1fr) minmax(10em, 1.6fr) 3em minmax(9em, 1fr) minmax(8em, 0.9fr) minmax(8em, 0.9fr) 9em;
  align-items: center;
  gap: 0 0.6em;
  padding: 0.25em 0.4em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  min-width: 0;
}
.dash-row-head {
  font-size: 0.85em;
  opacity: 0.7;
}
.dash-row-body {
  cursor: pointer;
}
.dash-row-body:hover {
  background: var(--soda-menu-hover-bg, #44475a);
}
.dash-row-body:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.dash-row-selected {
  background: var(--soda-menu-active-bg, #44475a);
}
.dash-c {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-c-name {
  font-weight: 600;
}
.dash-num {
  font-variant-numeric: tabular-nums;
}
/* 印・時点の添え書きが付くセルは、切らずに折り返す（コストの時点・基準・一部・読み込み中） */
.dash-c-tokens,
.dash-c-cost {
  white-space: normal;
}
.dash-basis,
.dash-cost-note,
.dash-updated {
  margin-left: 0.4em;
}
.dash-place-cwd {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dash-cell-label {
  display: none;
}

/* 狭いとき（重ねるダイアログ・狭い窓）: 1 行をカードの縦並びに */
.dash-compact .dash-row-head {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  padding: 0;
  border: 0;
}
.dash-compact .dash-row-body {
  grid-template-columns: 1.6em minmax(0, 1fr) auto;
  grid-template-areas:
    "state name kind"
    ". place place"
    ". model model"
    ". tokens tokens"
    ". cost cost"
    ". ctx ctx"
    ". sub ago";
  gap: 0.15em 0.6em;
  padding: 0.5em 0.5em;
  min-height: 44px;
}
.dash-compact .dash-c-state {
  grid-area: state;
}
.dash-compact .dash-c-name {
  grid-area: name;
}
.dash-compact .dash-c-kind {
  grid-area: kind;
}
.dash-compact .dash-c-place {
  grid-area: place;
  white-space: normal;
}
.dash-compact .dash-c-model {
  grid-area: model;
}
.dash-compact .dash-c-tokens {
  grid-area: tokens;
  white-space: normal;
}
.dash-compact .dash-c-cost {
  grid-area: cost;
}
.dash-compact .dash-c-ctx {
  grid-area: ctx;
}
.dash-compact .dash-c-sub {
  grid-area: sub;
}
.dash-compact .dash-c-ago {
  grid-area: ago;
  text-align: right;
}
.dash-compact .dash-cell-label {
  display: inline-block;
  min-width: 6.5em;
  margin-right: 0.4em;
  opacity: 0.6;
  font-size: 0.85em;
}
.dash-compact .dash-c-kind .dash-cell-label,
.dash-compact .dash-c-ago .dash-cell-label,
.dash-compact .dash-c-sub .dash-cell-label {
  min-width: 0;
}
.dash-compact .dash-c-place .dash-place-cwd {
  display: block;
}

/* モダン: 行はカード（角の丸い面・薄い地と縁・面の間のすき間）。クラシックでは、これらのトークンは定義されない */
:root[data-ui-style="modern"] .dash-table {
  gap: var(--soda-shape-card-gap, 8px);
}
:root[data-ui-style="modern"] .dash-row-body {
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-card-radius, 12px);
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) var(--soda-shape-card-tint, 5%), transparent);
  padding: 0.5em 0.8em;
  min-height: var(--soda-shape-row-h, 36px);
}
:root[data-ui-style="modern"] .dash-row-body:hover {
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) 10%, transparent);
}
:root[data-ui-style="modern"] .dash-row-selected {
  border-color: var(--soda-accent, #6070a1);
}
:root[data-ui-style="modern"] .dash-row-head {
  border-bottom: none;
}
:root[data-ui-style="modern"] .dash-account {
  border-radius: var(--soda-shape-card-radius, 12px);
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) var(--soda-shape-card-tint, 5%), transparent);
}
:root[data-ui-style="modern"] .dash-select {
  border-radius: var(--soda-shape-radius-s, 6px);
}
</style>
