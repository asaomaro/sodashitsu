<script setup lang="ts">
import { computed } from "vue";
import { badgeText } from "@sodashitsu/client-core";
import { useNotificationsStore } from "../store/notifications.js";
import { useViewStore } from "../store/view.js";

/**
 * 通知のベル（20261005-notify-bell の AC9）。応答せずに閉じた知らせ（履歴）の件数をバッヂで出し、押すと一覧のポップアップ（`NotificationHistoryDialog`）を開く。
 * 件数は**履歴だけ**を数える（待ち行列・いま出ているトーストは数えない）。バッヂは見た目だけで（`aria-hidden`）、件数はボタンの `aria-label` に入れる。
 * アイコンは SVG（絵文字は環境で見た目が変わるので使わない。`MobileShell` の注記と同じ方針）。置き場所はデスクトップがサイドバーの下端、モバイルが上部バー。
 */
defineProps<{ variant?: "sidebar" | "mobile" }>();

const store = useNotificationsStore();
const view = useViewStore();

const count = computed(() => store.historyCount);
const badge = computed(() => badgeText(count.value));
const label = computed(() => (count.value > 0 ? `通知の一覧（${count.value} 件）` : "通知の一覧"));

function open(): void {
  view.openDialogWithContext({ kind: "notificationHistory", opener: "bell" });
}
</script>

<template>
  <button type="button" class="notify-bell" :class="variant ? `notify-bell-${variant}` : undefined" data-notification-bell :aria-label="label" :title="label" aria-haspopup="dialog" @click="open">
    <svg class="notify-bell-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M8 1.5a4 4 0 0 0-4 4v2.2c0 .5-.2 1-.5 1.4L2.3 10.5a.6.6 0 0 0 .5 1h10.4a.6.6 0 0 0 .5-1l-1.2-1.4a2.2 2.2 0 0 1-.5-1.4V5.5a4 4 0 0 0-4-4Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
      <path d="M6.3 13a1.8 1.8 0 0 0 3.4 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
    <span v-if="badge !== ''" class="notify-bell-badge" aria-hidden="true">{{ badge }}</span>
  </button>
</template>

<style scoped>
.notify-bell {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  border-radius: 2px;
  padding: 0.2em 0.5em;
  cursor: pointer;
}
.notify-bell:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* モバイルは押せる高さ（⌨・［設定］と同じ 2rem 以上）。上部バーの他のボタンと同じ枠に揃える。 */
.notify-bell-mobile {
  min-height: 2rem;
  min-width: 2rem;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  padding: 0.3em 0.6em;
}
.notify-bell-badge {
  position: absolute;
  top: -0.2em;
  right: -0.2em;
  min-width: 1.3em;
  padding: 0 0.3em;
  box-sizing: border-box;
  font-size: 0.7em;
  line-height: 1.5;
  text-align: center;
  color: var(--soda-accent-fg, #f8f8f2);
  background: var(--soda-state-blocked, #ff6e6e);
  border-radius: 999px;
  pointer-events: none;
}
</style>
