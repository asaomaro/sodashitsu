<script setup lang="ts">
/**
 * 連携のグラフ画面（20260927-agent-graph の design D-6）。`view.graphOpen` の間だけ全画面に重ねる（下の pane は mount されたまま。research-web §1.2）。
 * ネイティブの `<dialog>` を `showModal()` で開く——背面が inert になり、Tab・ポインタ・ホイールが背面の端末へ届かない（research-web §1.5-4）。
 * 01-graph-core では開閉だけの枠——ノード・線・パネル・「開いたのと同じキーで閉じる」は 03-web-graph で足す。Esc・閉じるボタンで閉じ、開く前の pane へ焦点を戻す（AC-I4）。
 */
import { inject, nextTick, ref, watch } from "vue";
import { TerminalRegistryKey } from "../../injection.js";
import { useViewStore } from "../../store/view.js";

const view = useViewStore();
const registry = inject(TerminalRegistryKey, null);
const dialogEl = ref<HTMLDialogElement | null>(null);

watch(
  () => view.graphOpen,
  (open) => {
    void nextTick(() => {
      const el = dialogEl.value;
      if (open) {
        if (el && !el.open) el.showModal();
        el?.focus();
        return;
      }
      if (el?.open) el.close();
      // `closeGraph` は焦点の pane を同じ値に戻すだけで、`TerminalPane` の watch が動かない——端末へ明示的に戻す（`CommandPopup` と同じ）。
      const back = view.focusedPaneId;
      if (back && !view.modalOpen) registry?.focus(back);
    });
  },
);

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  ev.preventDefault(); // keydown で止めるので cancel は起きない（起きても下で同じく閉じる）
  view.closeGraph();
}

/** ブラウザの Esc（`cancel`）。既定の閉じ方は止めて、store 経由で閉じる（HelpDialog と同じ）。 */
function onCancel(ev: Event): void {
  ev.preventDefault();
  view.closeGraph();
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="graph-view"
    aria-label="連携（グラフ）"
    tabindex="-1"
    @keydown="onKeydown"
    @cancel="onCancel"
  >
    <template v-if="view.graphOpen">
      <header class="graph-toolbar">
        <h2 class="graph-title">連携（グラフ）</h2>
        <button type="button" class="graph-close" aria-label="閉じる" @click="view.closeGraph()">
          ×
        </button>
      </header>
    </template>
  </dialog>
</template>

<style scoped>
.graph-view {
  /* 全画面（`<dialog>` の既定の大きさ・余白・枠を外す）。`100vh` でなく `100%`（iOS Safari。SettingsDialog と同じ）。 */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  flex-direction: column;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
}
.graph-view[open] {
  display: flex;
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
