<script setup lang="ts">
/**
 * グラフの画面（20261008-graph-first の D5・D12）。主な領域に出る。**`<dialog>` を使わない**ので、サイドバーが残り、操作できる。キーは、グラフの面にフォーカスがある間だけ働く
 * （面は `tabindex` を持ち、画面を切り替えたときにフォーカスを受ける）。見えている間（`view.screen === "graph"`）だけ中身を出す。
 * 中身は `GraphCanvas`（1 列の `GraphDialog` と同じ）。その上に、端末の窓の層（`GraphTerminalLayer`。`GraphCanvas` の兄弟。X3）。
 */
import GraphCanvas from "../components/graph/GraphCanvas.vue";
import GraphTerminalLayer from "../components/graph/GraphTerminalLayer.vue";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
</script>

<template>
  <div class="graph-screen">
    <GraphCanvas kind="screen" :active="view.screen === 'graph'" />
    <GraphTerminalLayer />
  </div>
</template>

<style scoped>
.graph-screen {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
