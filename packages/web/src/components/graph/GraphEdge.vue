<script setup lang="ts">
/**
 * 線（20260927-agent-graph の design「線の種類の見た目」）。背面の SVG 1 枚の中の `<g>`。色だけに頼らない（WCAG 1.4.1）:
 * トリガ＝実線（受け渡しありは太線）＋▶、監督＝破線（監督役→配下の向き）＋◆、承認の代理＝点線＋●。無効は灰色（チップに ⚠）。
 * 一時停止は薄く。`graph.fired` で 1.5 秒光る（`prefers-reduced-motion` では動かさず太さと色だけ）。
 * 当たりは同じ経路の透明で太い線（`pointer-events: stroke`）。ラベル・回数・一時停止の印は中点のチップ（HTML の `<button>`。`GraphView` が置く——
 * SVG の中の要素のフォーカス・読み上げはブラウザで揃わないため）。
 */
import { computed } from "vue";
import type { GraphLink, LinkRunResult } from "@sodashitsu/protocol";
import { edgeHead, type EdgeHeadShape, type GraphPoint } from "@sodashitsu/client-core";

const props = defineProps<{
  link: GraphLink;
  /** 描く向きの始点・終点（監督は監督役→配下に入れ替え済み）。 */
  start: GraphPoint;
  end: GraphPoint;
  invalid: boolean;
  selected: boolean;
  /** 動いたばかり（光る）。 */
  firing: LinkRunResult | null;
  /** 全体か線が一時停止中。 */
  paused: boolean;
}>();

const emit = defineEmits<{ select: [ev: PointerEvent] }>();

const SHAPE: Record<GraphLink["kind"], EdgeHeadShape> = {
  trigger: "triangle",
  supervise: "diamond",
  approval: "circle",
};

const head = computed(() => edgeHead(props.start, props.end, SHAPE[props.link.kind]));
const d = computed(
  () => `M ${props.start.x} ${props.start.y} L ${head.value.lineEnd.x} ${head.value.lineEnd.y}`,
);
const heavy = computed(() => props.link.kind === "trigger" && props.link.trigger?.output != null);
</script>

<template>
  <g
    class="graph-edge"
    :class="[
      `graph-edge-${link.kind}`,
      {
        'graph-edge-heavy': heavy,
        'graph-edge-invalid': invalid,
        'graph-edge-selected': selected,
        'graph-edge-paused': paused,
        'graph-edge-fired': firing !== null,
      },
    ]"
    :data-link-id="link.id"
  >
    <path class="graph-edge-hit" :d="d" @pointerdown.stop="emit('select', $event)" />
    <path class="graph-edge-line" :d="d" />
    <path class="graph-edge-head" :d="head.d" />
  </g>
</template>

<style scoped>
.graph-edge {
  --edge-color: var(--soda-fg, #f8f8f2);
}
.graph-edge-supervise {
  --edge-color: var(--soda-state-done, #50fa7b);
}
.graph-edge-approval {
  --edge-color: var(--soda-warn-fg, #ffb86c);
}
.graph-edge-invalid {
  --edge-color: var(--soda-menu-border, #6272a4);
}
.graph-edge-selected {
  --edge-color: var(--soda-accent, #6070a1);
}
.graph-edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 18px;
  pointer-events: stroke;
  cursor: pointer;
}
.graph-edge-line {
  fill: none;
  stroke: var(--edge-color);
  stroke-width: 2px;
  pointer-events: none;
}
.graph-edge-heavy .graph-edge-line {
  stroke-width: 4px;
}
.graph-edge-supervise .graph-edge-line {
  stroke-dasharray: 8 5;
}
.graph-edge-approval .graph-edge-line {
  stroke-dasharray: 2 4;
  stroke-linecap: round;
}
.graph-edge-selected .graph-edge-line {
  stroke-width: 3px;
}
.graph-edge-head {
  fill: var(--edge-color);
  stroke: var(--edge-color);
  stroke-width: 1px;
  pointer-events: none;
}
.graph-edge-paused {
  opacity: 0.45;
}
.graph-edge-fired .graph-edge-line {
  stroke: var(--soda-state-working, #f1fa8c);
  stroke-width: 4px;
  stroke-dasharray: 10 6;
  animation: graph-edge-flow 0.5s linear 3;
}
.graph-edge-fired .graph-edge-head {
  fill: var(--soda-state-working, #f1fa8c);
  stroke: var(--soda-state-working, #f1fa8c);
}
@keyframes graph-edge-flow {
  from {
    stroke-dashoffset: 16;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .graph-edge-fired .graph-edge-line {
    animation: none;
    stroke-dasharray: none;
    stroke-width: 5px;
  }
}
</style>
