<script setup lang="ts">
/**
 * pane の利用状況の入れ物 ― 1 列（モバイル）の画面（20261010-agent-usage PR4 の AC2）。`view.dialogContext.kind === "paneInfo"` の間だけ、全面に重ねるネイティブの
 * `<dialog>`（`showModal()`。背面は inert）。`DashboardDialog` と同じ作り。デスクトップは `PaneInfoPopover`。中身は同じ `PaneInfoView`。
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import PaneInfoView from "../dashboard/PaneInfoView.vue";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
const dialogEl = ref<HTMLDialogElement | null>(null);
const paneId = computed(() => (view.dialogContext?.kind === "paneInfo" ? view.dialogContext.paneId : null));
const open = computed(() => paneId.value !== null);

function sync(isOpen: boolean): void {
  const el = dialogEl.value;
  if (!el) return;
  if (isOpen && !el.open) el.showModal();
  else if (!isOpen && el.open) el.close();
}
watch(open, (o) => sync(o), { flush: "post" });
onMounted(() => void nextTick(() => sync(open.value)));

function onCancel(ev: Event): void {
  ev.preventDefault();
  view.closePaneInfo();
}
</script>

<template>
  <dialog ref="dialogEl" class="pane-info-dialog" aria-label="pane の利用状況" @cancel="onCancel">
    <div class="pane-info-dialog-bar">
      <button type="button" class="pane-info-dialog-close" data-pane-info-close @click="view.closePaneInfo()">閉じる</button>
    </div>
    <div class="pane-info-dialog-body">
      <PaneInfoView v-if="paneId !== null" :pane-id="paneId" kind="dialog" :active="open" @close="view.closePaneInfo()" />
    </div>
  </dialog>
</template>

<style scoped>
.pane-info-dialog {
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
.pane-info-dialog[open] {
  display: flex;
  flex-direction: column;
}
.pane-info-dialog-bar {
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: 0.3em 0.5em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.pane-info-dialog-close {
  min-height: 44px;
  min-width: 44px;
  padding: 0 1em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  font: inherit;
}
.pane-info-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0.6em;
}
</style>
