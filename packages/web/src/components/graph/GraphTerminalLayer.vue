<script setup lang="ts">
/**
 * グラフの面の上の層（20261008-graph-first の X3。PR2a）。**`GraphCanvas` の兄弟**（`GraphScreen.vue` の中）に置く——`GraphCanvas` の根の `keydown`（capture）が `Esc` と prefix を食うので、
 * 窓を中に置くと、窓の pane に届かない。面の拡大縮小・移動の外にあり、面を動かしても窓は画面に対して動かない。
 * 層の箱は、**ツールバーと空間の見出しの下**（`.graph-body`）。窓はこの中に収まる（ツールバーを覆わない）。窓を最初に開いたとき、押したノードから窓へ短い線を引く（窓を動かすと消える）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Area } from "../../display/floatGeometry.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import GraphTerminalWindow from "./GraphTerminalWindow.vue";

const store = useGraphTerminalsStore();
const layerEl = ref<HTMLElement | null>(null);
const area = ref<Area>({ w: 0, h: 0 });
/** 層の左上の、親（グラフの画面）の中の位置と大きさ。`.graph-body` に合わせる（無ければ親の全体）。 */
const box = ref<{ left: number; top: number; width: number; height: number } | null>(null);
/** 層の左上の、画面の座標（ノードの画面の座標を層の座標へ直すのに使う）。 */
const origin = ref({ x: 0, y: 0 });

let observer: ResizeObserver | null = null;
let observed: Element[] = [];
function measure(): void {
  const el = layerEl.value;
  const parent = el?.parentElement;
  if (!el || !parent) return;
  const pr = parent.getBoundingClientRect();
  const body = parent.querySelector<HTMLElement>(".graph-body");
  const br = body?.getBoundingClientRect() ?? pr;
  const next = { left: Math.round(br.left - pr.left), top: Math.round(br.top - pr.top), width: Math.round(br.width), height: Math.round(br.height) };
  const cur = box.value;
  if (!cur || cur.left !== next.left || cur.top !== next.top || cur.width !== next.width || cur.height !== next.height) box.value = next;
  origin.value = { x: br.left, y: br.top };
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w !== area.value.w || h !== area.value.h) area.value = { w, h };
  // `.graph-body` は画面が開いてから現れる。見つかったら観測に加える。
  if (observer && body && !observed.includes(body)) {
    observer.observe(body);
    observed.push(body);
  }
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && layerEl.value?.parentElement) {
    observer = new ResizeObserver(measure);
    observer.observe(layerEl.value.parentElement);
    observed = [layerEl.value.parentElement];
    measure();
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => store.paneId,
  () => void Promise.resolve().then(measure),
);

const shown = computed(() => store.paneId !== null);

/**
 * 線の端を、ノードの今の位置に追従させる（面の移動・拡大縮小・ノードのドラッグ・空間の切り替え）。窓が出ていて、まだ動かしていない間だけ、毎フレーム、ノードの箱を読む。
 * ノードが無い（別の空間・外された）・層の外に出たときは、線を出さない（`anchor` を null にする）。窓の位置そのものは、開いたときに決めたまま動かさない。
 */
let raf: number | null = null;
function follow(): void {
  raf = null;
  const id = store.paneId;
  if (id === null || store.rect !== null || !store.anchor) return;
  const el = document.querySelector<HTMLElement>(`[data-graph-view] [data-node-key$=":${id}"]`);
  const lay = layerEl.value?.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  const inside = r && lay && r.right > lay.left && r.left < lay.right && r.bottom > lay.top && r.top < lay.bottom;
  const next = inside && r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  const a = store.anchor;
  if (!next) {
    store.setAnchor(null);
    return;
  }
  if (next.x !== a.x || next.y !== a.y || next.w !== a.w || next.h !== a.h) store.setAnchor(next);
  raf = requestAnimationFrame(follow);
}
watch(
  () => [store.paneId, store.rect === null, store.anchor === null] as const,
  ([id, unmoved, noAnchor]) => {
    if (id !== null && unmoved && !noAnchor && raf === null) raf = requestAnimationFrame(follow);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (raf !== null) cancelAnimationFrame(raf);
});
const style = computed(() => (box.value ? { left: `${box.value.left}px`, top: `${box.value.top}px`, width: `${box.value.width}px`, height: `${box.value.height}px`, right: "auto", bottom: "auto" } : {}));

/** ノードから窓への線（窓を最初の位置のまま置いている間だけ）。ノードの中心から、窓の矩形のいちばん近い点まで。層の座標。 */
const link = computed(() => {
  const a = store.anchor;
  const r = store.shownRect;
  if (!a || !r || store.rect !== null || store.paneId === null) return null;
  const cx = a.x + a.w / 2 - origin.value.x;
  const cy = a.y + a.h / 2 - origin.value.y;
  const tx = Math.min(Math.max(cx, r.x), r.x + r.w);
  const ty = Math.min(Math.max(cy, r.y), r.y + r.h);
  if (cx === tx && cy === ty) return null; // ノードが窓の下にある
  return { x1: cx, y1: cy, x2: tx, y2: ty };
});
</script>


<template>
  <div ref="layerEl" class="gtl" data-graph-terminal-layer :style="style">
    <svg v-if="link" class="gtl-link" data-graph-terminal-link aria-hidden="true">
      <line :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" />
    </svg>
    <GraphTerminalWindow v-if="shown" :area="area" :origin="origin" />
  </div>
</template>

<style scoped>
.gtl {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none; /* 窓のないところは、グラフが受ける */
}
.gtl-link {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.gtl-link line {
  stroke: var(--soda-accent, #6070a1);
  stroke-width: 2;
  stroke-dasharray: 4 3;
}
</style>
