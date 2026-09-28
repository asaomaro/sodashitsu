<script setup lang="ts">
/**
 * 連携のグラフ画面（20260927-agent-graph の design D-6）。`view.graphOpen` の間だけ全画面に重ねる（下の pane は mount されたまま。research-web §1.2）。
 * 01-graph-core では開閉だけの枠——ノード・線・パネルは 03-web-graph で足す。Esc・閉じるボタンで閉じ、開く前の pane へ焦点を戻す（AC-I4）。
 */
import { inject, nextTick, ref, watch } from "vue";
import { TerminalRegistryKey } from "../../injection.js";
import { useViewStore } from "../../store/view.js";

const view = useViewStore();
const registry = inject(TerminalRegistryKey, null);
const root = ref<HTMLElement | null>(null);

watch(
  () => view.graphOpen,
  (open) => {
    void nextTick(() => {
      if (open) {
        root.value?.focus();
        return;
      }
      // `closeGraph` は焦点の pane を同じ値に戻すだけで、`TerminalPane` の watch が動かない——端末へ明示的に戻す（`CommandPopup` と同じ）。
      const back = view.focusedPaneId;
      if (back && !view.modalOpen) registry?.focus(back);
    });
  },
);

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  ev.preventDefault();
  view.closeGraph();
}
</script>

<template>
  <div
    v-if="view.graphOpen"
    ref="root"
    class="graph-view"
    role="dialog"
    aria-modal="true"
    aria-label="連携（グラフ）"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <header class="graph-toolbar">
      <h2 class="graph-title">連携（グラフ）</h2>
      <button type="button" class="graph-close" aria-label="閉じる" @click="view.closeGraph()">
        ×
      </button>
    </header>
  </div>
</template>

<style scoped>
.graph-view {
  position: fixed;
  inset: 0;
  z-index: 800;
  display: flex;
  flex-direction: column;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
}
.graph-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.graph-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: normal;
}
.graph-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
}
</style>
