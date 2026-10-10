<script setup lang="ts">
/**
 * アカウントの利用枠 1 つ（20261010-agent-usage。PR3 のダッシュボードから切り出した。PR4 の pane の利用状況の窓も同じ部品を使う）。
 * 数字の整形・古い値の扱いは `dashboardModel.ts` のもの。**この部品の CSS は、ダッシュボードの一覧の行も使う棒・印・薄く出す規則を含む（`dash-` の名前だけ。窓の外へは掛からない）。**
 */
import type { AccountUsage } from "@sodashitsu/protocol";
import { formatAgo, isStale, windowDisplay } from "./dashboardModel.js";

defineProps<{ account: AccountUsage; now: number }>();
</script>

<template>
  <div class="dash-account" :class="{ 'dash-stale': isStale(account.asOf, now) }" :data-dash-account="account.accountKey">
    <div class="dash-account-head">
      <span class="dash-account-name">{{ account.label }}</span>
      <span v-if="account.plan" class="dash-chip">{{ account.plan }}</span>
      <span class="dash-muted dash-account-ago" :title="new Date(account.asOf).toLocaleString()">{{ formatAgo(account.asOf, now) }}</span>
    </div>
    <p v-if="account.windows.length === 0" class="dash-muted">枠の値がありません</p>
    <ul v-else class="dash-windows">
      <li v-for="w in account.windows" :key="w.label + String(w.windowMinutes ?? '')" class="dash-window" :class="{ 'dash-stale': windowDisplay(w, now).past }" data-dash-window>
        <span class="dash-window-label">{{ w.label }}</span>
        <span
          class="dash-bar"
          role="progressbar"
          :aria-label="`${account.label} ${w.label}の使用率`"
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

</template>

<style>
.dash-muted {
  opacity: 0.65;
  font-size: 0.9em;
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

:root[data-ui-style="modern"] .dash-account {
  border-radius: var(--soda-shape-card-radius, 12px);
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) var(--soda-shape-card-tint, 5%), transparent);
}
</style>
