<script setup lang="ts">
import { computed } from "vue";
import type { DockZone } from "../display/dockDrag.js";

/**
 * 面（パネル）の D&D の間、落とせる場所を描く（20261008-display-layout の design「D&D」）。その pane だけ。`pointer-events: none`（ポインタを奪わない）。
 * 5 つの場所（上・下・左・右・中央）と文言を出し、ポインタのある場所だけ強調（実線と色）、ほかは点線。いまの置き場所は「ここにあります」。
 * 中央（浮いた窓）は `float` が真のときだけ落とせる（PR-B では「ここには置けません」）。pane の D&D の表示（`.pane-frame-zone`。縁 30%・中央が赤）とは文言と色が別。
 */
const props = defineProps<{ zone: DockZone | null; current: DockZone | null; float: boolean; /** 浮いた窓を動かしている最中（縁へ寄せて離すと、その側へ置かれる）。 */ release?: boolean }>();
const SIDE_NAME: Record<string, string> = { top: "上", bottom: "下", left: "左", right: "右" };

const LABEL: Record<DockZone, string> = { top: "上に置く", bottom: "下に置く", left: "左に置く", right: "右に置く", float: "浮いた窓にする" };
const ZONES: DockZone[] = ["top", "left", "float", "right", "bottom"];

const text = (z: DockZone): string => {
  if (props.release && props.zone === z && z !== "float") return `離すと、ここ（${SIDE_NAME[z]}）に置く`;
  if (z === "float" && !props.float) return "ここには置けません";
  if (props.current === z) return `${LABEL[z]}（ここにあります）`;
  return LABEL[z];
};
const here = computed(() => props.zone);
</script>

<template>
  <div class="display-drop-zones" aria-hidden="true" data-display-drop-zones>
    <div
      v-for="z in ZONES"
      :key="z"
      class="display-drop-zone"
      :class="[`display-drop-zone-${z}`, { 'display-drop-zone-active': here === z, 'display-drop-zone-disabled': z === 'float' && !float, 'display-drop-zone-current': current === z }]"
      :data-display-drop-zone="z"
      :data-active="here === z ? '1' : '0'"
    >
      <span class="display-drop-zone-label">{{ text(z) }}</span>
    </div>
  </div>
</template>

<style scoped>
.display-drop-zones {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  display: grid;
  grid-template-columns: 22% 1fr 22%;
  grid-template-rows: 22% 1fr 22%;
  gap: 0;
}
.display-drop-zone {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.3em;
  font-size: 0.85em;
  color: var(--soda-fg, #f8f8f2);
  background: color-mix(in srgb, var(--soda-bg, #1e1f29) 55%, transparent);
  border: 2px dashed color-mix(in srgb, var(--soda-accent, #8be9fd) 60%, transparent);
}
.display-drop-zone-top {
  grid-column: 1 / 4;
  grid-row: 1;
}
.display-drop-zone-bottom {
  grid-column: 1 / 4;
  grid-row: 3;
}
.display-drop-zone-left {
  grid-column: 1;
  grid-row: 2;
}
.display-drop-zone-right {
  grid-column: 3;
  grid-row: 2;
}
.display-drop-zone-float {
  grid-column: 2;
  grid-row: 2;
}
.display-drop-zone-disabled {
  opacity: 0.85;
  border-color: color-mix(in srgb, var(--soda-menu-border, #44475a) 80%, transparent);
}
/* いまポインタのある場所だけ、実線と強調の色。 */
.display-drop-zone-active {
  border-style: solid;
  border-color: var(--soda-accent, #8be9fd);
  background: color-mix(in srgb, var(--soda-accent, #8be9fd) 35%, transparent);
  font-weight: bold;
}
.display-drop-zone-active.display-drop-zone-disabled {
  background: color-mix(in srgb, var(--soda-menu-border, #44475a) 70%, transparent);
  border-color: var(--soda-menu-border, #44475a);
}
</style>
