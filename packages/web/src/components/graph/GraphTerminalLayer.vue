<script setup lang="ts">
/**
 * グラフの面の上の層（20261008-graph-first の X3。PR2a）。**`GraphCanvas` の兄弟**（`GraphScreen.vue` の中）に置く——`GraphCanvas` の根の `keydown`（capture）が `Esc` と prefix を食うので、
 * 窓を中に置くと、窓の pane に届かない。面の拡大縮小・移動の外にあり、面を動かしても窓は画面に対して動かない。窓は、この層の箱の中に収まる。
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { Area } from "../../display/floatGeometry.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import GraphTerminalWindow from "./GraphTerminalWindow.vue";

const store = useGraphTerminalsStore();
const layerEl = ref<HTMLElement | null>(null);
const area = ref<Area>({ w: 0, h: 0 });

let observer: ResizeObserver | null = null;
function measure(): void {
  const el = layerEl.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w !== area.value.w || h !== area.value.h) area.value = { w, h };
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && layerEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(layerEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());

const shown = computed(() => store.paneId !== null);
</script>

<template>
  <div ref="layerEl" class="gtl" data-graph-terminal-layer>
    <GraphTerminalWindow v-if="shown" :area="area" />
  </div>
</template>

<style scoped>
.gtl {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none; /* 窓のないところは、グラフが受ける */
}
</style>
