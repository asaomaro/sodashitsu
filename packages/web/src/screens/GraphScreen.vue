<script setup lang="ts">
/**
 * グラフの画面（20261008-graph-first の D5・D12）。主な領域に出る。**`<dialog>` を使わない**ので、サイドバーが残り、操作できる。キーは、グラフの面にフォーカスがある間だけ働く
 * （面は `tabindex` を持ち、画面を切り替えたときにフォーカスを受ける）。見えている間（`view.screen === "graph"`）だけ中身を出す。
 * 中身は `GraphCanvas`（1 列の `GraphDialog` と同じ）。
 */
import GraphCanvas from "../components/graph/GraphCanvas.vue";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
</script>

<template>
  <GraphCanvas kind="screen" :active="view.screen === 'graph'" />
</template>
