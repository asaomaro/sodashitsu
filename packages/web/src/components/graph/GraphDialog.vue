<script setup lang="ts">
/**
 * 連携のグラフの入れ物 ― 1 列（モバイル）の画面（20261008-graph-first の D13。20260927-agent-graph の design D-6）。`view.graphDialogOpen` の間だけ全画面に重ねる
 * （下の pane は mount されたまま。research-web §1.2）。ネイティブの `<dialog>` を `showModal()` で開く——背面が inert になり、Tab・ポインタ・ホイールが背面の端末へ届かない（AC-I5）。
 * `Toast`・`ReconnectOverlay` は、開いている間この `<dialog>`（`#soda-graph-dialog`）の中へ Teleport される（`App.vue`。top layer の下に隠れるため。20260927-agent-graph の D4）。
 * デスクトップは `GraphScreen`（主な領域の画面）で、この部品は使わない。
 */
import { nextTick, onMounted, ref, watch } from "vue";
import { useViewStore } from "../../store/view.js";
import GraphCanvas from "./GraphCanvas.vue";

const view = useViewStore();
const dialogEl = ref<HTMLDialogElement | null>(null);

function sync(open: boolean): void {
  const el = dialogEl.value;
  if (!el) return;
  if (open && !el.open) el.showModal();
  else if (!open && el.open) el.close();
}
// 中身（`GraphCanvas`）の「開いたらフォーカスを置く」は次の描画の後なので、`showModal()` は先にここで済ませる（post: 同じ描画の後・`nextTick` の前）。
watch(() => view.graphDialogOpen, (open) => sync(open), { flush: "post" });
// 開いたまま本体が作り直された（ログインし直し・切り離しからの復帰）ときも開き直す。
onMounted(() => void nextTick(() => sync(view.graphDialogOpen)));

/** ブラウザの Esc（`cancel`）。既定の閉じ方は止めて、`view` の状態から閉じる（HelpDialog と同じ）。 */
function onCancel(ev: Event): void {
  ev.preventDefault();
  view.closeGraph();
}
</script>

<template>
  <dialog id="soda-graph-dialog" ref="dialogEl" class="graph-dialog" aria-label="連携（グラフ）" @cancel="onCancel">
    <GraphCanvas kind="dialog" :active="view.graphDialogOpen" />
  </dialog>
</template>

<style scoped>
.graph-dialog {
  /* 全画面（`<dialog>` の既定の大きさ・余白・枠を外す）。`100vh` でなく `100%`（iOS Safari。SettingsDialog と同じ）。 */
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
.graph-dialog[open] {
  display: flex;
  flex-direction: column;
}
</style>
