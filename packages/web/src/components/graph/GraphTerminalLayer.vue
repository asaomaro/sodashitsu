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
  () => store.windows.length,
  () => void Promise.resolve().then(measure),
);

const windows = computed(() => store.windows);
const style = computed(() => (box.value ? { left: `${box.value.left}px`, top: `${box.value.top}px`, width: `${box.value.width}px`, height: `${box.value.height}px`, right: "auto", bottom: "auto" } : {}));

/**
 * 線の端を、ノードの今の位置に追従させる（面の移動・拡大縮小・ノードのドラッグ・空間の切り替え）。動かしていない窓（`rect` が null で、覚えた位置も無い）が 1 つでもある間、毎フレーム、
 * その窓のノードの箱を読む。ノードが無い（別の空間・外された）・層の外へ出たときは、その窓の線を出さない（`anchor` を null にする）。窓の位置そのものは、開いたときのまま。
 */
let raf: number | null = null;
const wantsLink = (w: (typeof store.windows)[number]): boolean => w.rect === null && store.memory.geometry[w.paneId] === undefined && w.anchor !== null;
function follow(): void {
  raf = null;
  const lay = layerEl.value?.getBoundingClientRect();
  let again = false;
  for (const w of store.windows) {
    if (!wantsLink(w)) continue;
    const el = document.querySelector<HTMLElement>(`[data-graph-view] [data-node-key$=":${w.paneId}"]`);
    const r = el?.getBoundingClientRect();
    const inside = r && lay && r.right > lay.left && r.left < lay.right && r.bottom > lay.top && r.top < lay.bottom;
    if (!inside || !r) {
      store.setAnchorOf(w.paneId, null);
      continue;
    }
    const a = w.anchor!;
    if (r.left !== a.x || r.top !== a.y || r.width !== a.w || r.height !== a.h) store.setAnchorOf(w.paneId, { x: r.left, y: r.top, w: r.width, h: r.height });
    again = true;
  }
  if (again) raf = requestAnimationFrame(follow);
}
watch(
  () => store.windows.map((w) => `${w.paneId}:${wantsLink(w) ? 1 : 0}`).join(","),
  () => {
    if (raf === null && store.windows.some(wantsLink)) raf = requestAnimationFrame(follow);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (raf !== null) cancelAnimationFrame(raf);
});

/** ノードから窓への線（窓を最初の位置のまま置いている間だけ）。ノードの中心から、窓の矩形のいちばん近い点まで。層の座標。 */
const links = computed(() => {
  const out: { key: number; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const w of store.windows) {
    const a = w.anchor;
    const r = w.shownRect;
    if (!a || !r || !wantsLink(w)) continue;
    const cx = a.x + a.w / 2 - origin.value.x;
    const cy = a.y + a.h / 2 - origin.value.y;
    const tx = Math.min(Math.max(cx, r.x), r.x + r.w);
    const ty = Math.min(Math.max(cy, r.y), r.y + r.h);
    if (cx === tx && cy === ty) continue; // ノードが窓の下にある
    out.push({ key: w.key, x1: cx, y1: cy, x2: tx, y2: ty });
  }
  return out;
});
</script>


<template>
  <div ref="layerEl" class="gtl" data-graph-terminal-layer :style="style">
    <svg v-if="links.length > 0" class="gtl-link" data-graph-terminal-link aria-hidden="true">
      <line v-for="l in links" :key="l.key" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
    </svg>
    <GraphTerminalWindow v-for="w in windows" :key="w.key" :win="w" :area="area" :origin="origin" />
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
