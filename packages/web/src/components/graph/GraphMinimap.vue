<script setup lang="ts">
/**
 * 小さな地図（20261008-graph-first の PR1d T12a。面の右下）。表示中の空間の囲いの四角と、いま見えている範囲の枠。選んでいる workspace の囲いは見分けられる。
 * 押す・ドラッグすると、その位置が面の中央に来る（`center`）。囲いが無い・空間が画面に収まっているときも出す（押しても動かないだけ）。たたむボタン（たたんだ状態は親が覚える）。
 * 面の操作（ノードのドラッグ・線を結ぶ・拡大縮小・パン）へは、ポインタを渡さない。読み上げは「地図。表示中の範囲」と囲いの数だけ（中の四角は操作の対象にしない）。
 */
import { computed, ref } from "vue";
import type { GraphRect } from "@sodashitsu/client-core";

const props = defineProps<{
  /** 囲いの四角（世界の座標）。選んでいる workspace の囲いは `selectedId`。 */
  frames: readonly { id: string; rect: GraphRect }[];
  /** 囲いが無い空間のとき、ノードの四角（地図の範囲の足し）。 */
  nodes: readonly GraphRect[];
  /** いま見えている範囲（世界の座標）。 */
  view: GraphRect;
  selectedId: string | null;
  collapsed: boolean;
}>();
const emit = defineEmits<{
  /** 世界の座標の点を、面の中央へ。 */
  center: [point: { x: number; y: number }];
  toggle: [];
}>();

const W = 176;
const H = 112;
const PAD = 6;

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** 地図に収める範囲（囲い・ノード・いま見えている範囲の外接）。 */
const rawBounds = computed<Bounds>(() => {
  const rs = [...props.frames.map((f) => f.rect), ...props.nodes, props.view];
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
});
/**
 * **ドラッグの間は、範囲を押した時点の値に固定する**。固定しないと、押した点を中央に動かすたびに「見えている範囲」が外へ出て範囲が広がり、同じ画面の位置がさらに外の世界の点に
 * 写って、動かすたびに枠が際限なく飛んでいく（PR1d レビュー M1）。
 */
const latched = ref<Bounds | null>(null);
const bounds = computed<Bounds>(() => latched.value ?? rawBounds.value);
const scale = computed(() => Math.min((W - PAD * 2) / bounds.value.w, (H - PAD * 2) / bounds.value.h));
const offset = computed(() => ({
  x: (W - bounds.value.w * scale.value) / 2,
  y: (H - bounds.value.h * scale.value) / 2,
}));
const box = (r: GraphRect) => ({
  x: (r.x - bounds.value.x) * scale.value + offset.value.x,
  y: (r.y - bounds.value.y) * scale.value + offset.value.y,
  w: Math.max(1, r.w * scale.value),
  h: Math.max(1, r.h * scale.value),
});
const frameBoxes = computed(() => props.frames.map((f) => ({ id: f.id, ...box(f.rect) })));
const nodeBoxes = computed(() => props.nodes.map((n) => box(n)));
const viewBox = computed(() => box(props.view));

const svgEl = ref<SVGSVGElement | null>(null);
let dragging = false;
function pointFor(ev: PointerEvent): { x: number; y: number } {
  const r = svgEl.value!.getBoundingClientRect();
  const sx = ((ev.clientX - r.left) / r.width) * W;
  const sy = ((ev.clientY - r.top) / r.height) * H;
  const b = bounds.value;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  // 押した点は、地図の範囲の中に収める（地図の外へはみ出して押しても、範囲の外へは動かない）
  return {
    x: clamp((sx - offset.value.x) / scale.value + b.x, b.x, b.x + b.w),
    y: clamp((sy - offset.value.y) / scale.value + b.y, b.y, b.y + b.h),
  };
}
function onDown(ev: PointerEvent): void {
  if (ev.button !== 0) return;
  ev.stopPropagation();
  ev.preventDefault();
  latched.value = rawBounds.value;
  dragging = true;
  svgEl.value?.setPointerCapture?.(ev.pointerId);
  emit("center", pointFor(ev));
}
function end(): void {
  dragging = false;
  latched.value = null;
}
function onMove(ev: PointerEvent): void {
  if (!dragging) return;
  if ((ev.buttons & 1) === 0) {
    // 離したのを取りこぼした（ウィンドウの外で離した等）: ボタンを押していない動きでは動かさない
    end();
    return;
  }
  ev.stopPropagation();
  emit("center", pointFor(ev));
}
function onUp(ev: PointerEvent): void {
  if (!dragging) return;
  end();
  ev.stopPropagation();
  svgEl.value?.releasePointerCapture?.(ev.pointerId);
}
</script>

<template>
  <div class="graph-minimap" :class="{ 'graph-minimap-collapsed': collapsed }" data-graph-minimap @pointerdown.stop @wheel.stop>
    <button
      type="button"
      class="graph-minimap-toggle"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? '地図を開く' : '地図をたたむ'"
      :title="collapsed ? '地図を開く（n）' : '地図をたたむ（n）'"
      @click="emit('toggle')"
    >
      {{ collapsed ? "▣" : "▾" }}
    </button>
    <svg
      v-if="!collapsed"
      ref="svgEl"
      class="graph-minimap-svg"
      role="img"
      :aria-label="`地図。表示中の範囲。囲い ${frames.length} 個`"
      :viewBox="`0 0 ${W} ${H}`"
      :width="W"
      :height="H"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="end"
    >
      <rect
        v-for="f in frameBoxes"
        :key="f.id"
        class="graph-minimap-frame"
        :data-minimap-frame="f.id"
        :class="{ 'graph-minimap-frame-selected': f.id === selectedId }"
        :x="f.x"
        :y="f.y"
        :width="f.w"
        :height="f.h"
      />
      <rect v-for="(n, i) in nodeBoxes" :key="`n${i}`" class="graph-minimap-node" :x="n.x" :y="n.y" :width="n.w" :height="n.h" />
      <rect class="graph-minimap-view" data-minimap-view :x="viewBox.x" :y="viewBox.y" :width="viewBox.w" :height="viewBox.h" />
    </svg>
  </div>
</template>

<style scoped>
.graph-minimap {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  z-index: 2;
}
.graph-minimap-toggle {
  min-height: var(--soda-shape-control-h, 20px);
  min-width: var(--soda-shape-control-h, 20px);
  padding: 0 6px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 11px;
  cursor: pointer;
}
.graph-minimap-svg {
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l, 6px);
  background: var(--soda-menu-bg, #282a36);
  cursor: crosshair;
  touch-action: none;
}
.graph-minimap-frame {
  fill: var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
  stroke: var(--soda-menu-border, #44475a);
  stroke-width: 1;
}
.graph-minimap-frame-selected {
  stroke: var(--soda-accent, #6070a1);
  stroke-width: 1.5;
}
.graph-minimap-node {
  fill: var(--soda-menu-border, #44475a);
}
.graph-minimap-view {
  fill: none;
  stroke: var(--soda-state-working, #f1fa8c);
  stroke-width: 1.5;
}
</style>
