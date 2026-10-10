<script setup lang="ts">
/**
 * ダッシュボードの入れ物 ― 1 列（モバイル）の画面（20261010-agent-usage PR3 の AC4）。`view.dialogContext.kind === "dashboard"` の間だけ、全画面に重ねる
 * ネイティブの `<dialog>`（`showModal()`。背面は inert になり、キー・ポインタが背面の端末へ届かない）。グラフの `GraphDialog` と同じ作り。
 * デスクトップは `DashboardScreen`（主な領域の画面）で、この部品は使わない。中身は同じ `DashboardView`。
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import DashboardView from "../dashboard/DashboardView.vue";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
const dialogEl = ref<HTMLDialogElement | null>(null);
const open = computed(() => view.dialogContext?.kind === "dashboard");

function sync(isOpen: boolean): void {
  const el = dialogEl.value;
  if (!el) return;
  if (isOpen && !el.open) el.showModal();
  else if (!isOpen && el.open) el.close();
}
watch(open, (o) => sync(o), { flush: "post" });
onMounted(() => void nextTick(() => sync(open.value)));

/** ブラウザの Esc（`cancel`）。既定の閉じ方は止めて、`view` の状態から閉じる。 */
function onCancel(ev: Event): void {
  ev.preventDefault();
  view.closeDashboard();
}
</script>

<template>
  <dialog ref="dialogEl" class="dashboard-dialog" aria-label="ダッシュボード" @cancel="onCancel">
    <div class="dashboard-dialog-bar">
      <button type="button" class="dashboard-dialog-close" data-dash-close @click="view.closeDashboard()">閉じる</button>
    </div>
    <div class="dashboard-dialog-body">
      <DashboardView v-if="open" kind="dialog" :active="open" />
    </div>
  </dialog>
</template>

<style scoped>
.dashboard-dialog {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
  overflow: hidden;
}
.dashboard-dialog[open] {
  display: flex;
  flex-direction: column;
}
.dashboard-dialog-bar {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 0.3em 0.5em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.dashboard-dialog-close {
  min-height: 44px;
  min-width: 44px;
  padding: 0 1em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  font: inherit;
}
.dashboard-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
