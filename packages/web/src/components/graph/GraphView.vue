<script setup lang="ts">
/**
 * 連携のグラフ画面（20260927-agent-graph の design D-6・「web」・「振る舞いの詳細」）。`view.graphOpen` の間だけ全画面に重ねる（下の pane は mount されたまま。
 * research-web §1.2）。ネイティブの `<dialog>` を `showModal()` で開く——背面が inert になり、Tab・ポインタ・ホイールが背面の端末へ届かない（AC-I5）。
 *
 * 描画は DOM のノード＋背面の SVG 1 枚（外部ライブラリなし。D-6）。表示の変換（パン・ズーム）は世界の層 1 つの `transform` だけ。
 * 座標・線の経路・当たり判定は client-core/graph の純関数（geometry）。サーバとのやりとりは `store/graph`。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { GraphLink } from "@sodashitsu/protocol";
import {
  clampZoom,
  edgeGeometry,
  fitGraphView,
  graphNodeRect,
  parallelOffsets,
  revealGraphRect,
  snapToGrid,
  zoomGraphAt,
  type GraphRect,
  type GraphViewport,
} from "@sodashitsu/client-core";
import { TerminalRegistryKey } from "../../injection.js";
import { isMobileViewport } from "../../mobile/detect.js";
import { useGraphStore, type GraphNodeInfo } from "../../store/graph.js";
import { useMachinesStore } from "../../store/machines.js";
import { useViewStore } from "../../store/view.js";
import GraphEdge from "./GraphEdge.vue";
import GraphNode from "./GraphNode.vue";
import { usePointerDrag } from "./usePointerDrag.js";
import { linkChipText, linkDescription } from "./linkText.js";

const view = useViewStore();
const graph = useGraphStore();
const machines = useMachinesStore();
const registry = inject(TerminalRegistryKey, null);
const isMobile = isMobileViewport();
const dialogEl = ref<HTMLDialogElement | null>(null);
const canvasEl = ref<HTMLElement | null>(null);

// --- 表示（パン・ズーム）。このブラウザだけのもの（サーバへは保存しない。research-ui §2.4）-------------------------------

const VIEWPORT_KEY = "soda.graphView.v1";
function loadViewport(): GraphViewport | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GraphViewport>;
    if (typeof v.zoom !== "number" || typeof v.panX !== "number" || typeof v.panY !== "number")
      return null;
    if (![v.zoom, v.panX, v.panY].every(Number.isFinite)) return null;
    return { zoom: clampZoom(v.zoom), panX: v.panX, panY: v.panY };
  } catch {
    return null;
  }
}
const savedViewport = loadViewport();
const viewport = ref<GraphViewport>(savedViewport ?? { zoom: 1, panX: 0, panY: 0 });
/** 保存した表示が無ければ、最初に中身を描いたときに全体表示にする。 */
let needsFit = savedViewport === null;
watch(viewport, (v) => {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(v));
  } catch {
    // 保存できなくても動く
  }
});

function canvasSize(): { w: number; h: number } {
  const el = canvasEl.value;
  const w = el?.clientWidth ?? 0;
  const h = el?.clientHeight ?? 0;
  // レイアウトの無い環境（試験）・開いた直後の 0 は、ありがちな大きさで代える。
  return { w: w > 0 ? w : 800, h: h > 0 ? h : 600 };
}
function fitAll(): void {
  viewport.value = fitGraphView([...rects.value.values()], canvasSize());
}
function zoomBy(factor: number, anchor?: { x: number; y: number }): void {
  const size = canvasSize();
  viewport.value = zoomGraphAt(
    viewport.value,
    viewport.value.zoom * factor,
    anchor ?? { x: size.w / 2, y: size.h / 2 },
  );
}
function zoomReset(): void {
  const size = canvasSize();
  viewport.value = zoomGraphAt(viewport.value, 1, { x: size.w / 2, y: size.h / 2 });
}
const zoomPercent = computed(() => `${Math.round(viewport.value.zoom * 100)}%`);
const worldStyle = computed(() => ({
  transform: `translate(${viewport.value.panX}px, ${viewport.value.panY}px) scale(${viewport.value.zoom})`,
}));

// --- 描くもの ------------------------------------------------------------------------------------------------

/** Tab の順＝読み順（上から、同じ高さなら左から）。配置の変更に追従する（research-ui §2.12）。 */
const orderedNodes = computed(() => [...graph.nodes].sort((a, b) => a.y - b.y || a.x - b.x));
const rects = computed(
  () => new Map<string, GraphRect>(graph.nodes.map((n) => [n.key, graphNodeRect(n)])),
);
const infos = computed(
  () => new Map<string, GraphNodeInfo>(graph.nodes.map((n) => [n.key, graph.nodeInfo(n.key)])),
);
const nodeInvalid = (key: string): boolean => {
  const i = infos.value.get(key);
  return !i || i.exists === false || i.stale;
};

interface EdgeView {
  link: GraphLink;
  start: { x: number; y: number };
  end: { x: number; y: number };
  mid: { x: number; y: number };
  invalid: boolean;
  paused: boolean;
}
const edges = computed<EdgeView[]>(() => {
  const offsets = parallelOffsets(graph.links);
  const out: EdgeView[] = [];
  for (const link of graph.links) {
    const a = rects.value.get(link.from);
    const b = rects.value.get(link.to);
    if (!a || !b) continue;
    // 監督は監督役→配下の向きで描く（design「線の種類の見た目」）。
    const [src, dst] = link.kind === "supervise" ? [b, a] : [a, b];
    const geo = edgeGeometry(src, dst, offsets.get(link.id) ?? 0);
    out.push({
      link,
      ...geo,
      invalid: nodeInvalid(link.from) || nodeInvalid(link.to),
      paused: graph.graph?.paused === true || link.paused !== null,
    });
  }
  return out;
});
const degree = computed(() => {
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  for (const l of graph.links) {
    out.set(l.from, (out.get(l.from) ?? 0) + 1);
    inn.set(l.to, (inn.get(l.to) ?? 0) + 1);
  }
  return { out, inn };
});

// --- 選択（単一。フォーカスと一致させる。research-ui §2.6）--------------------------------------------------------

type Selection = { kind: "node"; key: string } | { kind: "link"; id: string } | null;
const selection = ref<Selection>(null);
const isNodeSelected = (key: string): boolean =>
  selection.value?.kind === "node" && selection.value.key === key;
const isLinkSelected = (id: string): boolean =>
  selection.value?.kind === "link" && selection.value.id === id;

function nodeEl(key: string): HTMLElement | null {
  return dialogEl.value?.querySelector<HTMLElement>(`[data-node-key="${CSS.escape(key)}"]`) ?? null;
}
function chipEl(id: string): HTMLElement | null {
  return dialogEl.value?.querySelector<HTMLElement>(`[data-link-chip="${CSS.escape(id)}"]`) ?? null;
}
function focusNode(key: string): void {
  selection.value = { kind: "node", key };
  reveal(rects.value.get(key));
  void nextTick(() => nodeEl(key)?.focus());
}
function focusLink(id: string): void {
  selection.value = { kind: "link", id };
  const e = edges.value.find((x) => x.link.id === id);
  if (e) reveal({ x: e.mid.x - 40, y: e.mid.y - 12, w: 80, h: 24 });
  void nextTick(() => chipEl(id)?.focus());
}
/** フォーカスしたものが画面の外なら入れる（research-ui §2.12）。 */
function reveal(rect: GraphRect | undefined): void {
  if (rect) viewport.value = revealGraphRect(viewport.value, rect, canvasSize());
}
function onNodeFocus(key: string): void {
  selection.value = { kind: "node", key };
  reveal(rects.value.get(key));
}
function onChipFocus(id: string): void {
  selection.value = { kind: "link", id };
}

// --- ドラッグ（ノードの移動・背景のパン）-------------------------------------------------------------------------

const drag = usePointerDrag();

function onNodePointerdown(ev: PointerEvent, key: string): void {
  if (isMobile.value || ev.button !== 0) return; // モバイルは閲覧だけ（背景のパンへ流す）
  ev.stopPropagation();
  const node = graph.nodes.find((n) => n.key === key);
  if (!node) return;
  const target = ev.currentTarget as HTMLElement;
  const x0 = node.x;
  const y0 = node.y;
  const posOf = (e: PointerEvent, dx: number, dy: number) => {
    const rawX = x0 + dx / viewport.value.zoom;
    const rawY = y0 + dy / viewport.value.zoom;
    // Alt で吸着を外す（design「移動」）。
    return e.altKey
      ? { x: Math.round(rawX), y: Math.round(rawY) }
      : { x: snapToGrid(rawX), y: snapToGrid(rawY) };
  };
  selection.value = { kind: "node", key };
  target.focus();
  drag.start(ev, target, {
    threshold: 4,
    onMove: (e, dx, dy) => graph.setDragPosition(key, posOf(e, dx, dy)),
    onEnd: (e, dx, dy) => {
      const p = posOf(e, dx, dy);
      if (p.x === x0 && p.y === y0) graph.setDragPosition(key, null);
      else void graph.moveNodes([{ key, ...p }]);
    },
    onCancel: () => graph.setDragPosition(key, null),
  });
}

function onCanvasPointerdown(ev: PointerEvent): void {
  if (ev.button !== 0 && ev.pointerType === "mouse") return;
  const target = ev.currentTarget as HTMLElement;
  const start = viewport.value;
  drag.start(ev, target, {
    threshold: 3,
    onMove: (_e, dx, dy) => {
      viewport.value = { zoom: start.zoom, panX: start.panX + dx, panY: start.panY + dy };
    },
    onClick: () => {
      // 何も無い所を押した＝選択の解除（research-ui §2.6）。
      selection.value = null;
    },
    onCancel: () => {
      viewport.value = start;
    },
  });
}

function onEdgeSelect(ev: PointerEvent, id: string): void {
  ev.stopPropagation();
  focusLink(id);
}

/** ホイール: 既定はパン、Ctrl/⌘（トラックパッドのピンチ）はポインタの位置を中心にズーム。ページはスクロールさせない（AC-I5）。 */
function onWheel(ev: WheelEvent): void {
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.ctrlKey || ev.metaKey) {
    const rect = canvasEl.value?.getBoundingClientRect();
    const anchor = { x: ev.clientX - (rect?.left ?? 0), y: ev.clientY - (rect?.top ?? 0) };
    zoomBy(Math.exp(-ev.deltaY * 0.01), anchor);
    return;
  }
  const v = viewport.value;
  viewport.value = { zoom: v.zoom, panX: v.panX - ev.deltaX, panY: v.panY - ev.deltaY };
}
onMounted(() => canvasEl.value?.addEventListener("wheel", onWheel, { passive: false }));
// `canvasEl` は開いている間だけある（v-if）。開くたびに付け直す。
watch(canvasEl, (el, old) => {
  old?.removeEventListener("wheel", onWheel);
  el?.addEventListener("wheel", onWheel, { passive: false });
});
onBeforeUnmount(() => canvasEl.value?.removeEventListener("wheel", onWheel));

// --- 開閉とフォーカス（AC-I4）------------------------------------------------------------------------------------

/** 開いたら直前の pane のノード（載っていなければ先頭のノード）へ。まだグラフが無ければ届いてから。 */
let focusOnLoad = false;
function focusInitial(): void {
  const pre = view.preGraphFocusPaneId;
  const key = pre ? `${machines.selectedId}:${pre}` : null;
  if (key && graph.nodes.some((n) => n.key === key)) {
    focusNode(key);
    return;
  }
  const first = orderedNodes.value[0];
  if (first) focusNode(first.key);
  else dialogEl.value?.focus();
}

watch(
  () => view.graphOpen,
  (open) => {
    void nextTick(() => {
      const el = dialogEl.value;
      if (open) {
        if (el && !el.open) el.showModal();
        selection.value = null;
        if (!graph.graph) {
          focusOnLoad = true;
          el?.focus();
          void graph.load();
        } else {
          if (needsFit && graph.nodes.length > 0) {
            fitAll();
            needsFit = false;
          }
          focusInitial();
        }
        return;
      }
      drag.cancel();
      if (el?.open) el.close();
      // `closeGraph` は焦点の pane を同じ値に戻すだけで、`TerminalPane` の watch が動かない——端末へ明示的に戻す（`CommandPopup` と同じ）。
      const back = view.focusedPaneId;
      if (back && !view.modalOpen) registry?.focus(back);
    });
  },
  // 開いたまま本体が作り直された（ログインし直し・切り離しからの復帰）ときも開き直す——`graphOpen` とキーの dialog モードが残ったまま
  // 画面が見えない状態にしない。
  { immediate: true },
);
watch(
  () => graph.graph,
  (g) => {
    if (!g || !view.graphOpen) return;
    if (needsFit && g.nodes.length > 0) {
      fitAll();
      needsFit = false;
    }
    if (focusOnLoad) {
      focusOnLoad = false;
      void nextTick(focusInitial);
    }
    // 選んでいたものが他で消えたら選択を外す。
    const s = selection.value;
    if (s?.kind === "node" && !g.nodes.some((n) => n.key === s.key)) selection.value = null;
    if (s?.kind === "link" && !g.links.some((l) => l.id === s.id)) selection.value = null;
  },
);

// --- キー -----------------------------------------------------------------------------------------------------

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault(); // keydown で止めるので cancel は起きない（起きても下で同じく閉じる）
    escape();
    return;
  }
  if (isTextField(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  switch (ev.key) {
    case "1":
      ev.preventDefault();
      fitAll();
      return;
    case "+":
    case "=":
      ev.preventDefault();
      zoomBy(1.2);
      return;
    case "-":
      ev.preventDefault();
      zoomBy(1 / 1.2);
      return;
    case "0":
      ev.preventDefault();
      zoomReset();
      return;
  }
}

/** Esc は 1 段ずつ（design「開く」: 接続中の取り消し → パネル → 選択 → 画面）。ドラッグ中の Esc は `usePointerDrag` が先に取る。 */
function escape(): void {
  if (selection.value) {
    selection.value = null;
    dialogEl.value?.focus();
    return;
  }
  view.closeGraph();
}

/** ブラウザの Esc（`cancel`）。既定の閉じ方は止めて、段階の Esc と同じに扱う（HelpDialog と同じ）。 */
function onCancel(ev: Event): void {
  ev.preventDefault();
  view.closeGraph();
}

function chipLabel(e: EdgeView): string {
  return linkChipText(e.link, {
    invalid: e.invalid,
    graphPaused: graph.graph?.paused === true,
    fired: graph.firing.get(e.link.id) ?? null,
  });
}
function chipAria(e: EdgeView): string {
  return linkDescription(e.link, graph.linkTitle(e.link), {
    invalid: e.invalid,
    graphPaused: graph.graph?.paused === true,
  });
}
</script>

<template>
  <!-- `id` は App.vue の Teleport の行き先（開いている間はトースト・再接続の表示をこの中へ出す。decisions D4）。 -->
  <dialog
    id="soda-graph-dialog"
    ref="dialogEl"
    class="graph-view"
    aria-label="連携（グラフ）"
    tabindex="-1"
    @keydown="onKeydown"
    @cancel="onCancel"
  >
    <template v-if="view.graphOpen">
      <header class="graph-toolbar">
        <h2 class="graph-title">連携（グラフ）</h2>
        <button type="button" class="graph-tool graph-fit" title="全体表示（1）" @click="fitAll">
          全体表示
        </button>
        <button
          type="button"
          class="graph-tool graph-zoom-out"
          aria-label="縮小"
          title="縮小（-）"
          @click="zoomBy(1 / 1.2)"
        >
          −
        </button>
        <span class="graph-zoom" aria-live="off">{{ zoomPercent }}</span>
        <button
          type="button"
          class="graph-tool graph-zoom-in"
          aria-label="拡大"
          title="拡大（+）"
          @click="zoomBy(1.2)"
        >
          ＋
        </button>
        <button type="button" class="graph-close" aria-label="閉じる" @click="view.closeGraph()">
          ×
        </button>
      </header>
      <div class="graph-body">
        <div ref="canvasEl" class="graph-canvas" @pointerdown="onCanvasPointerdown">
          <div class="graph-world" :style="worldStyle">
            <svg class="graph-edges" width="1" height="1" aria-hidden="true">
              <GraphEdge
                v-for="e in edges"
                :key="e.link.id"
                :link="e.link"
                :start="e.start"
                :end="e.end"
                :invalid="e.invalid"
                :selected="isLinkSelected(e.link.id)"
                :paused="e.paused"
                :firing="graph.firing.get(e.link.id) ?? null"
                @select="onEdgeSelect($event, e.link.id)"
              />
            </svg>
            <GraphNode
              v-for="n in orderedNodes"
              :key="n.key"
              :info="infos.get(n.key)!"
              :x="n.x"
              :y="n.y"
              :selected="isNodeSelected(n.key)"
              :read-only="isMobile"
              :out-count="degree.out.get(n.key) ?? 0"
              :in-count="degree.inn.get(n.key) ?? 0"
              @focus="onNodeFocus(n.key)"
              @body-pointerdown="onNodePointerdown($event, n.key)"
            />
            <button
              v-for="e in edges"
              :key="`chip-${e.link.id}`"
              type="button"
              class="graph-chip"
              :class="{
                'graph-chip-selected': isLinkSelected(e.link.id),
                'graph-chip-paused': e.paused,
                'graph-chip-invalid': e.invalid,
                'graph-chip-fired': graph.firing.has(e.link.id),
              }"
              aria-roledescription="線"
              :aria-label="chipAria(e)"
              :data-link-chip="e.link.id"
              :style="{ left: `${e.mid.x}px`, top: `${e.mid.y}px` }"
              @pointerdown.stop
              @focus="onChipFocus(e.link.id)"
              @click="focusLink(e.link.id)"
            >
              {{ chipLabel(e) }}
            </button>
          </div>
          <p v-if="graph.graph && graph.nodes.length === 0" class="graph-empty">
            まだ pane を載せていません。ツールバーの「pane を載せる」から選んでください。
          </p>
          <p v-else-if="!graph.graph" class="graph-empty">
            {{ graph.loadError ?? "読み込んでいます…" }}
          </p>
        </div>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.graph-view {
  /* 全画面（`<dialog>` の既定の大きさ・余白・枠を外す）。`100vh` でなく `100%`（iOS Safari。SettingsDialog と同じ）。 */
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  flex-direction: column;
  background: var(--soda-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  outline: none;
  overflow: hidden;
}
.graph-view[open] {
  display: flex;
}
.graph-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.graph-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: normal;
}
.graph-tool {
  padding: 2px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
  cursor: pointer;
}
.graph-tool[aria-pressed="true"] {
  background: var(--soda-menu-active-bg, #44475a);
}
.graph-zoom {
  min-width: 3.5em;
  text-align: center;
  font-size: 12px;
  opacity: 0.8;
}
.graph-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
}
.graph-body {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}
.graph-canvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
  cursor: default;
}
.graph-world {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}
.graph-edges {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
.graph-chip {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 6px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 10px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.graph-chip:focus-visible,
.graph-chip-selected {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 1px;
}
.graph-chip-paused {
  color: var(--soda-warn-fg, #ffb86c);
}
.graph-chip-invalid {
  opacity: 0.8;
  border-style: dashed;
}
.graph-chip-fired {
  border-color: var(--soda-state-working, #f1fa8c);
  background: var(--soda-subtle-bg, #343746);
}
.graph-empty {
  position: absolute;
  inset: 40% 16px auto;
  margin: 0;
  text-align: center;
  opacity: 0.8;
  pointer-events: none;
}
</style>
