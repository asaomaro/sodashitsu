<script setup lang="ts">
/**
 * グラフの「fork」の線（20261009-agent-fork PR2・AC4）。**描くだけの層**——fork 元（`GraphNode.forkedFrom`）から fork したノードへ、破線と小さな札「fork」を引く。
 * 見るだけ: 押せない・設定を持たない・保存しない・`graph.update` を送らない・線の上限に数えない（連携の線〔`links`〕とは別のもの）。ノード・囲いの下の層に描き、
 * ポインタは通す（ノードの操作・窓のドラッグ・移す操作を邪魔しない）。
 * fork 元が別の空間にある・画面の外にある・無くなったときは、線を引かず、fork したノードの左上に小さな印（「⑂ fork」）と `title`（「fork 元: <名前>（別の空間にあります／無くなりました）」）を出す。
 * 色は既存の `--soda-*`、角は様式のトークン。
 */
import { computed } from "vue";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@sodashitsu/client-core";

const props = defineProps<{
  /** 表示中のノード（鍵・世界の座標・fork 元）。 */
  nodes: readonly { key: string; x: number; y: number; forkedFrom?: string | undefined }[];
  /** グラフにあるノードの鍵の全部（別の空間にあるか、無くなったかの見分け）。 */
  known: ReadonlySet<string>;
  /** 鍵 → 見せる名前。 */
  nameOf: (key: string) => string;
}>();

interface Line {
  id: string;
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  label: string;
}
interface Mark {
  key: string;
  x: number;
  y: number;
  title: string;
}

/** 矩形 `r` の中心から、向き `(dx, dy)` へ伸ばした半直線が、矩形の縁と交わる点。 */
function edgePoint(c: { x: number; y: number }, dx: number, dy: number): { x: number; y: number } {
  const hw = GRAPH_NODE_WIDTH / 2;
  const hh = GRAPH_NODE_HEIGHT / 2;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const derived = computed(() => {
  const byKey = new Map(props.nodes.map((n) => [n.key, n]));
  const lines: Line[] = [];
  const marks: Mark[] = [];
  for (const n of props.nodes) {
    const f = n.forkedFrom;
    if (f === undefined || f === n.key) continue;
    const src = byKey.get(f);
    const name = props.nameOf(f);
    if (src === undefined) {
      const why = props.known.has(f) ? "別の空間にあります" : "無くなりました";
      marks.push({ key: n.key, x: n.x, y: n.y, title: `fork 元: ${name}（${why}）` });
      continue;
    }
    const a = { x: src.x + GRAPH_NODE_WIDTH / 2, y: src.y + GRAPH_NODE_HEIGHT / 2 };
    const b = { x: n.x + GRAPH_NODE_WIDTH / 2, y: n.y + GRAPH_NODE_HEIGHT / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const p1 = edgePoint(a, dx, dy);
    const p2 = edgePoint(b, -dx, -dy);
    lines.push({ id: `${f}>${n.key}`, from: f, to: n.key, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2, label: `fork 元: ${name}` });
  }
  return { lines, marks };
});
</script>

<template>
  <div class="graph-forks" data-graph-forks>
    <svg v-if="derived.lines.length > 0" class="graph-fork-svg" width="1" height="1" aria-hidden="true">
      <defs>
        <marker id="graph-fork-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" class="graph-fork-arrow" />
        </marker>
      </defs>
      <g v-for="l in derived.lines" :key="l.id" class="graph-fork-line" :data-fork-from="l.from" :data-fork-to="l.to">
        <title>{{ l.label }}</title>
        <line :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" class="graph-fork-stroke" marker-end="url(#graph-fork-arrow)" />
        <rect :x="l.mx - 16" :y="l.my - 9" width="32" height="18" rx="4" class="graph-fork-pill" />
        <text :x="l.mx" :y="l.my + 4" text-anchor="middle" class="graph-fork-text">fork</text>
      </g>
    </svg>
    <span
      v-for="m in derived.marks"
      :key="m.key"
      class="graph-fork-mark"
      role="note"
      :aria-label="m.title"
      :title="m.title"
      :data-fork-mark="m.key"
      :style="{ left: `${m.x}px`, top: `${m.y - 20}px` }"
      >⑂ fork</span
    >
  </div>
</template>

<style scoped>
.graph-forks {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.graph-fork-svg {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
.graph-fork-stroke {
  stroke: var(--soda-state-idle, #6272a4);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  fill: none;
}
.graph-fork-arrow {
  fill: var(--soda-state-idle, #6272a4);
}
.graph-fork-pill {
  fill: var(--soda-menu-bg, #282a36);
  stroke: var(--soda-state-idle, #6272a4);
  stroke-width: 1;
}
.graph-fork-text {
  fill: var(--soda-menu-fg, #f8f8f2);
  font-size: 10px;
}
.graph-fork-mark {
  position: absolute;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  font-size: 11px;
  border: 1px solid var(--soda-state-idle, #6272a4);
  border-radius: var(--soda-shape-radius-s, 4px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  pointer-events: none;
}
</style>
