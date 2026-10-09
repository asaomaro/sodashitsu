<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ageLabel, type NotifyKind } from "@sodashitsu/client-core";
import { NotificationControllerKey, TerminalRegistryKey } from "../injection.js";
import { useNotificationsStore } from "../store/notifications.js";
import { useViewStore } from "../store/view.js";

/**
 * 応答せずに閉じた知らせの一覧（20261005-notify-bell。`view.dialogContext.kind === "notificationHistory"`）。ベルのボタン・`open_notification_history`（既定 `prefix+shift+o`）から開く。
 * 新しい順。各行は［種類・呼び名・時刻・移動］（押すとその pane へ移り、行は消える）と［×］（1 件削除）。［すべて削除］は同じ場所で 2 段階（誤操作を防ぐ。decisions D5）。
 * 中身は開いている間も通知のストアの履歴から引く——解消した行は自動で消える（AC13）。フォーカスの戻り先は `SubagentListDialog` と同じ規則（ベルから開いたならベル、そうでなければ端末）。
 */
const view = useViewStore();
const store = useNotificationsStore();
const notifications = inject(NotificationControllerKey, null);
const registry = inject(TerminalRegistryKey, null);

const dialogEl = ref<HTMLDialogElement | null>(null);
const confirming = ref(false);
/** 時刻の表示の基準（開いている間 30 秒ごとに進める）。 */
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const KIND_LABEL: Record<NotifyKind, string> = { blocked: "入力待ち", done: "完了" };

const isOpen = computed(() => view.dialogContext?.kind === "notificationHistory");
const openedByBell = computed(() => {
  const ctx = view.dialogContext;
  return ctx?.kind === "notificationHistory" && ctx.opener === "bell";
});
/** 新しい順（ストアは追加順＝古い→新しい）。 */
const rows = computed(() => [...store.history].reverse());

function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function focusFirst(): void {
  const first = dialogEl.value?.querySelector<HTMLElement>(".nh-go");
  (first ?? dialogEl.value?.querySelector<HTMLElement>(".nh-close"))?.focus();
}

watch(
  isOpen,
  (open) => {
    if (open) {
      confirming.value = false;
      now.value = Date.now();
      stopTimer();
      timer = setInterval(() => (now.value = Date.now()), 30_000);
      void nextTick(() => {
        if (!dialogEl.value?.open) dialogEl.value?.showModal();
        focusFirst(); // 最初の行（無ければ［閉じる］）。AC-I4
      });
    } else {
      stopTimer();
      dialogEl.value?.close();
    }
  },
  { immediate: true },
);
onBeforeUnmount(stopTimer);

// 確認の途中で 0 件になった（解消で消えた・ほかで消した）ら、確認を閉じる。
watch(
  () => rows.value.length,
  (n) => {
    if (n === 0 && confirming.value) confirming.value = false;
  },
);

/**
 * 閉じる。ベルから開いたならフォーカスをベルへ、そうでなければ今フォーカスのある pane の端末へ戻す
 * （`closeDialog` は `focusedPaneId` に同じ値を書くだけで `TerminalPane` の watch が動かず、フォーカスが宙に浮く。`SubagentListDialog.close` と同じ）。
 */
function close(): void {
  const wasBell = openedByBell.value;
  view.closeDialog();
  void nextTick(() => {
    if (wasBell) {
      const bell = document.querySelector<HTMLElement>("[data-notification-bell]");
      if (bell) {
        bell.focus();
        return;
      }
    }
    if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
  });
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  if (confirming.value) cancelClear(); // 確認の中の Esc は確認だけを取り消す（AC-I2）
  else close();
}

/** 行の［移動］。**先に閉じてから**移る（`GotoPicker.accept` と同じ順。閉じたあとに `focusPane` するので端末へフォーカスが移る）。 */
function go(key: string): void {
  view.closeDialog();
  notifications?.focusHistoryEntry(key);
}

/** 行の［×］。消えた行の次（無ければ前）の行へ、0 件なら［閉じる］へフォーカスを移す（AC12）。 */
function remove(key: string, index: number): void {
  notifications?.dismissHistoryEntry(key);
  void nextTick(() => {
    const goButtons = dialogEl.value?.querySelectorAll<HTMLElement>(".nh-go");
    const target = goButtons && goButtons.length > 0 ? goButtons[Math.min(index, goButtons.length - 1)] : dialogEl.value?.querySelector<HTMLElement>(".nh-close");
    target?.focus();
  });
}

/** ↑↓・Home/End で行の本体ボタン間を移る。Delete/Backspace は行の本体にフォーカスがあるとき 1 件削除。 */
function onListKeydown(ev: KeyboardEvent): void {
  const target = ev.target;
  if (!(target instanceof HTMLElement)) return;
  const row = target.closest<HTMLElement>(".nh-row");
  if (!row) return;
  const goButtons = [...(dialogEl.value?.querySelectorAll<HTMLElement>(".nh-go") ?? [])];
  const index = goButtons.indexOf(row.querySelector<HTMLElement>(".nh-go")!);
  if (index < 0) return;
  const to = (i: number): void => {
    ev.preventDefault();
    goButtons[Math.max(0, Math.min(goButtons.length - 1, i))]?.focus();
  };
  if (ev.key === "ArrowDown") to(index + 1);
  else if (ev.key === "ArrowUp") to(index - 1);
  else if (ev.key === "Home") to(0);
  else if (ev.key === "End") to(goButtons.length - 1);
  else if ((ev.key === "Delete" || ev.key === "Backspace") && target.classList.contains("nh-go")) {
    ev.preventDefault();
    const key = row.dataset["key"];
    if (key !== undefined) remove(key, index);
  }
}

function askClear(): void {
  if (rows.value.length === 0) return;
  confirming.value = true;
  void nextTick(() => dialogEl.value?.querySelector<HTMLElement>(".nh-cancel")?.focus()); // 誤爆を避けて［やめる］へ
}
function confirmClear(): void {
  notifications?.clearHistory();
  confirming.value = false;
  void nextTick(() => dialogEl.value?.querySelector<HTMLElement>(".nh-close")?.focus());
}
function cancelClear(): void {
  confirming.value = false;
  void nextTick(() => dialogEl.value?.querySelector<HTMLElement>(".nh-clear")?.focus());
}
</script>

<template>
  <dialog ref="dialogEl" class="nh-dialog" aria-labelledby="nh-title" @cancel="onNativeCancel" @click.self="close">
    <h2 id="nh-title" class="nh-title">判断を先送りした通知（{{ rows.length }} 件）</h2>
    <p v-if="rows.length === 0" class="nh-empty">判断を先送りした通知はありません</p>
    <ul v-else class="nh-list" @keydown="onListKeydown">
      <li v-for="(e, i) in rows" :key="e.key" class="nh-row" :data-key="e.key">
        <button type="button" class="nh-go" @click="go(e.key)">
          <span class="nh-kind" :class="`nh-kind-${e.kind}`">{{ KIND_LABEL[e.kind] }}</span>
          <span class="nh-label">{{ e.label }}</span>
          <span class="nh-age">{{ ageLabel(now, e.at) }}</span>
          <span class="nh-move" aria-hidden="true">移動</span>
        </button>
        <button type="button" class="nh-del" :aria-label="`削除: ${e.label}`" @click="remove(e.key, i)">×</button>
      </li>
    </ul>
    <div class="nh-actions">
      <button v-if="!confirming" type="button" class="nh-clear" :disabled="rows.length === 0" @click="askClear">すべて削除</button>
      <template v-else>
        <span class="nh-confirm-text" role="alert">{{ rows.length }} 件をすべて削除しますか？</span>
        <button type="button" class="nh-confirm" @click="confirmClear">削除する</button>
        <button type="button" class="nh-cancel" @click="cancelClear">やめる</button>
      </template>
      <button type="button" class="nh-close" @click="close">閉じる</button>
    </div>
  </dialog>
</template>

<style scoped>
.nh-dialog {
  box-shadow: var(--soda-shape-shadow, none);
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  width: min(36em, calc(100vw - 2em));
  max-height: 80vh;
  padding: var(--soda-shape-pad, 1em);
  box-sizing: border-box;
}
.nh-dialog[open] {
  display: flex;
  flex-direction: column;
}
.nh-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.nh-title {
  margin: 0 0 0.6em;
  font-size: 1em;
}
.nh-empty {
  margin: 0.6em 0;
  opacity: 0.8;
}
.nh-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
}
.nh-row {
  display: flex;
  align-items: stretch;
  gap: 0.3em;
  margin-bottom: 0.3em;
}
button {
  font: inherit;
  color: inherit;
  background: var(--soda-menu-hover-bg, #343746);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.nh-go {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.6em;
  text-align: left;
  padding: 0.4em 0.6em;
  min-height: var(--soda-shape-control-h, 2rem);
}
.nh-kind {
  flex: none;
  font-size: 0.8em;
  padding: 0.05em 0.5em;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.nh-kind-blocked {
  color: var(--soda-state-blocked, #ff6e6e);
}
.nh-kind-done {
  color: var(--soda-state-done, #50fa7b);
}
.nh-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nh-age {
  flex: none;
  font-size: 0.85em;
  opacity: 0.75;
}
.nh-move {
  flex: none;
  font-size: 0.85em;
  opacity: 0.75;
}
.nh-del {
  flex: none;
  min-width: 2rem;
  padding: 0 0.5em;
}
.nh-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 0.8em;
}
.nh-actions button {
  min-height: var(--soda-shape-control-h, 2rem);
  padding: 0.2em 0.8em;
}
.nh-confirm-text {
  flex: 1 1 auto;
}
.nh-close {
  margin-left: auto;
}
.nh-confirm {
  color: var(--soda-error-fg, #ff5555);
}
</style>
