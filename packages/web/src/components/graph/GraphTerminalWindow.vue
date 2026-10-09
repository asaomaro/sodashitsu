<script setup lang="ts">
/**
 * グラフの上の端末の窓（20261008-graph-first の PR2a。窓は 1 つ。W1〜W11・追補 03 の X1〜X12）。ノードを押すと、その pane の端末が、動かせる窓として開く。基本画面へは移らない。
 * - 見出し: 状態の印・名前・workspace・表示の面の印（W9）・［基本画面で開く］・［×］。見出しをつかんで動かす。
 * - 本体: 端末の要素の入れ物（`terminalHost` が要素を移してくる）。別のクライアントが直結しているとき（W2）は、端末の代わりに［引き取って開く］・［閉じる］。
 * - 下の行: 「キーは、この pane に届く」・グラフへ戻るキー（X1）・桁 × 行。右下の角をつかんで大きさを変える（最小 40 桁 × 10 行。X12）。
 * 色は既存の `--soda-*` だけ。角・影・高さは画面の様式のトークン（`var(--x, 今の値)`）。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useResizeDrag } from "../../composables/useResizeDrag.js";
import { clampFloatRect, moveFloatRect, resizeFloatRect, type Area, type Rect } from "../../display/floatGeometry.js";
import { GRAPH_TERMINAL_MIN_COLS, GRAPH_TERMINAL_MIN_ROWS } from "../../graphTerminal/GraphTerminalController.js";
import { FileTransferKey, GraphTerminalControllerKey, TerminalRegistryKey } from "../../injection.js";
import { useDisplayStore } from "../../store/display.js";
import { useGraphStore } from "../../store/graph.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import { useSessionStore } from "../../store/session.js";
import { useSettingsStore } from "../../store/settings.js";
import { useViewStore } from "../../store/view.js";
import { getCellSize } from "../../term/measure.js";
import { useTerminalSurface } from "../../term/useTerminalSurface.js";
import StateIcon from "../StateIcon.vue";

const props = defineProps<{ area: Area; origin?: { x: number; y: number } }>();

const store = useGraphTerminalsStore();
const session = useSessionStore();
const view = useViewStore();
const settings = useSettingsStore();
const graph = useGraphStore();
const displays = useDisplayStore();
const controller = inject(GraphTerminalControllerKey, undefined);
const registry = inject(TerminalRegistryKey, undefined);
const fileTransfer = inject(FileTransferKey, undefined);

const rootEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
const mountEl = ref<HTMLElement | null>(null);

const paneId = computed(() => store.paneId ?? "");
const info = computed(() => graph.nodeInfo(`local:${paneId.value}`));
const workspaceLabel = computed(() => {
  const loc = info.value.location;
  return loc ? (session.workspaces.get(loc.workspaceId)?.label ?? "") : "";
});
const displayCount = computed(() => displays.all.filter((d) => d.paneId === paneId.value).length);
const graphKey = computed(() => settings.keymap.hintFor("open_graph" as never));
const label = computed(() => `端末の窓：${info.value.name}`);

// --- 位置と大きさ（層の左上から。ブラウザを開いている間だけ覚える。X11）---------------------------------------------------------
/** 窓の見出し・下の行・縁など、本体以外の高さと幅（実測。本体の箱から窓全体を引く）。 */
const chrome = ref({ w: 2, h: 56 });
function measureChrome(): void {
  const root = rootEl.value;
  const body = bodyEl.value;
  if (!root || !body) return;
  const w = root.offsetWidth - body.clientWidth;
  const h = root.offsetHeight - body.clientHeight;
  if (w >= 0 && h >= 0 && (w !== chrome.value.w || h !== chrome.value.h)) chrome.value = { w, h };
}
const cell = computed(() => {
  const entry = registry?.get(paneId.value);
  return entry ? getCellSize(entry.term) : { width: 9, height: 18 };
});
/** 最小の大きさ（40 桁 × 10 行の端末が入る窓）。X12。 */
const minSize = computed<Area>(() => ({
  w: Math.ceil(GRAPH_TERMINAL_MIN_COLS * cell.value.width) + chrome.value.w,
  h: Math.ceil(GRAPH_TERMINAL_MIN_ROWS * cell.value.height) + chrome.value.h,
}));
/**
 * 初めの大きさ: 80 桁 × 24 行ぶん（領域に収まる範囲で）。位置は、押したノードの隣（領域に収まる側。右 → 左 → 下 → 上の順）。ノードが分からない・どこにも収まらないときは右上。
 */
const GAP = 16;
function defaultRect(): Rect {
  const w = Math.ceil(80 * cell.value.width) + chrome.value.w;
  const h = Math.ceil(24 * cell.value.height) + chrome.value.h;
  const ww = Math.min(w, Math.max(minSize.value.w, props.area.w - 16));
  const hh = Math.min(h, Math.max(minSize.value.h, props.area.h - 16));
  const a = store.anchor;
  const o = props.origin;
  if (a && o) {
    const nx = a.x - o.x;
    const ny = a.y - o.y;
    const fitsX = (x: number): boolean => x >= 0 && x + ww <= props.area.w;
    const fitsY = (y: number): boolean => y >= 0 && y + hh <= props.area.h;
    const candidates: { x: number; y: number }[] = [
      { x: nx + a.w + GAP, y: ny }, // 右
      { x: nx - ww - GAP, y: ny }, // 左
      { x: nx, y: ny + a.h + GAP }, // 下
      { x: nx, y: ny - hh - GAP }, // 上
    ];
    for (const c of candidates) {
      // ノードの縦（横）の位置は、収まるように寄せる。
      const y = Math.min(Math.max(c.y, 0), props.area.h - hh);
      const x = Math.min(Math.max(c.x, 0), props.area.w - ww);
      const horizontal = c === candidates[0] || c === candidates[1];
      if (horizontal ? fitsX(c.x) : fitsY(c.y)) return clampFloatRect({ x: horizontal ? c.x : x, y: horizontal ? y : c.y, w: ww, h: hh }, props.area, minSize.value);
    }
  }
  return clampFloatRect({ x: props.area.w - ww - 8, y: 8, w: ww, h: hh }, props.area, minSize.value);
}
const live = ref<Rect | null>(null);
const rect = computed<Rect>(() => live.value ?? clampFloatRect(store.rect ?? defaultRect(), props.area, minSize.value));
watch(rect, (r) => store.setShownRect(r), { immediate: true });
const style = computed(() => ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.w}px`,
  height: `${rect.value.h}px`,
}));

interface MoveStart {
  rect: Rect;
  x: number;
  y: number;
}
const moveDrag = useResizeDrag<MoveStart>({
  axis: "move",
  begin: (ev) => ({ rect: rect.value, x: ev.clientX, y: ev.clientY }),
  move: (ev, start) => {
    live.value = moveFloatRect(start.rect, ev.clientX - start.x, ev.clientY - start.y, props.area);
  },
  commit: () => {
    if (live.value) store.setRect(live.value);
    live.value = null;
  },
  cancel: () => {
    live.value = null;
  },
  reset: () => undefined,
});
const resizeDrag = useResizeDrag<MoveStart>({
  axis: "nwse",
  begin: (ev) => ({ rect: rect.value, x: ev.clientX, y: ev.clientY }),
  move: (ev, start) => {
    live.value = resizeFloatRect(start.rect, "se", ev.clientX - start.x, ev.clientY - start.y, props.area, minSize.value);
  },
  commit: () => {
    if (live.value) store.setRect(live.value);
    live.value = null;
  },
  cancel: () => {
    live.value = null;
  },
  reset: () => undefined,
});
// ダイアログ（modal）が開いたら、そこで確定する。
watch(
  () => view.modalOpen,
  (open) => {
    if (open) {
      moveDrag.finish();
      resizeDrag.finish();
    }
  },
);

// --- 本体の大きさ → 桁と行（`pane.attach_resize`）-------------------------------------------------------------------------------
let observer: ResizeObserver | null = null;
onMounted(() => {
  store.setContainer(mountEl.value);
  measureChrome();
  if (typeof ResizeObserver !== "undefined" && bodyEl.value) {
    observer = new ResizeObserver(() => {
      measureChrome();
      controller?.noteBodyResized();
    });
    observer.observe(bodyEl.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  store.setContainer(null);
});

// --- 本体の振る舞い（基本画面の `TerminalPane` と共通。X9）------------------------------------------------------------------------
const surface = useTerminalSurface(
  () => paneId.value,
  () => fileTransfer,
  () => store.status !== "attached",
);
const { dragDepth, onMouseDownCapture, onDragEnter, onDragOver, onDragLeave, onDrop } = surface;

// --- 操作 -------------------------------------------------------------------------------------------------------------------
function onClose(): void {
  controller?.close("node");
}
function onOpenBase(): void {
  controller?.openInBase();
}
function onTakeover(): void {
  void controller?.takeover();
}
const sizeText = computed(() => (store.cols > 0 ? `${store.cols} × ${store.rows}` : ""));
</script>

<template>
  <section
    ref="rootEl"
    class="gtw"
    :class="{ 'gtw-drop-target': dragDepth > 0 }"
    role="dialog"
    :aria-label="label"
    tabindex="-1"
    data-graph-terminal-window
    :data-pane-id="paneId"
    :data-status="store.status"
    :style="style"
  >
    <header class="gtw-head">
      <div
        class="gtw-grip"
        data-graph-terminal-grip
        title="つかんで動かす"
        @pointerdown="moveDrag.onPointerDown"
        @pointermove="moveDrag.onPointerMove"
        @pointerup="moveDrag.onPointerEnd"
        @pointercancel="moveDrag.onPointerEnd"
        @lostpointercapture="moveDrag.onPointerEnd"
      >
        <StateIcon class="gtw-state" :state="info.state" />
        <span class="gtw-name">{{ info.name }}</span>
        <span v-if="workspaceLabel" class="gtw-ws">{{ workspaceLabel }}</span>
      </div>
      <button
        v-if="displayCount > 0"
        type="button"
        class="gtw-btn gtw-display-mark"
        :title="`この pane には表示の面が ${displayCount} 個あります。基本画面で開くと見られます`"
        @click="onOpenBase"
      >
        表示あり {{ displayCount }}
      </button>
      <button type="button" class="gtw-btn gtw-open-base" data-graph-terminal-open-base @click="onOpenBase">基本画面で開く</button>
      <button type="button" class="gtw-btn gtw-close" aria-label="窓を閉じる" data-graph-terminal-close @click="onClose">×</button>
    </header>
    <div
      ref="bodyEl"
      class="gtw-body"
      @mousedown.capture="onMouseDownCapture"
      @focusin="controller?.ensureSelected(paneId)"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div v-show="store.status === 'opening' || store.status === 'attached'" ref="mountEl" class="gtw-mount" data-graph-terminal-mount></div>
      <div v-if="store.status === 'taken'" class="gtw-notice" role="alert" data-graph-terminal-taken>
        <p>別のクライアントが、この pane に直結しています。</p>
        <p class="gtw-notice-sub">引き取ると、そのクライアントの直結は終わります。</p>
        <div class="gtw-notice-actions">
          <button type="button" class="gtw-btn gtw-takeover" data-graph-terminal-takeover @click="onTakeover">引き取って開く</button>
          <button type="button" class="gtw-btn" @click="onClose">閉じる</button>
        </div>
      </div>
      <div v-else-if="store.status === 'failed'" class="gtw-notice" role="alert" data-graph-terminal-failed>
        <p>{{ store.failure ?? "開けませんでした" }}</p>
        <div class="gtw-notice-actions">
          <button type="button" class="gtw-btn" @click="onClose">閉じる</button>
        </div>
      </div>
    </div>
    <footer class="gtw-foot">
      <span class="gtw-keys">キーは、この pane に届く<template v-if="graphKey"> · <kbd>{{ graphKey }}</kbd> でグラフへ</template></span>
      <span class="gtw-size" data-graph-terminal-size>{{ sizeText }}</span>
    </footer>
    <div
      class="gtw-corner"
      data-graph-terminal-corner
      aria-hidden="true"
      @pointerdown="resizeDrag.onPointerDown"
      @pointermove="resizeDrag.onPointerMove"
      @pointerup="resizeDrag.onPointerEnd"
      @pointercancel="resizeDrag.onPointerEnd"
      @lostpointercapture="resizeDrag.onPointerEnd"
    ></div>
  </section>
</template>

<style scoped>
.gtw {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  pointer-events: auto; /* 層は pointer-events: none（窓のないところはグラフへ通す） */
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  box-shadow: var(--soda-shape-shadow, 0 4px 16px rgb(0 0 0 / 45%));
  overflow: hidden;
}
.gtw:focus {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.gtw-drop-target {
  outline: 2px dashed var(--soda-accent, #bd93f9);
  outline-offset: -2px;
}
.gtw-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
  min-height: var(--soda-shape-control-h, 0px);
  padding: 2px var(--soda-shape-pad-x, 6px);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  font-size: 0.85em;
}
.gtw-grip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  align-self: stretch;
  cursor: move;
  touch-action: none;
  user-select: none;
}
.gtw-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.gtw-ws {
  color: var(--soda-state-idle, #8a9ad0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.gtw-btn {
  flex: none;
  min-height: var(--soda-shape-control-h, 0px);
  padding: 1px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s, 3px);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.gtw-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.gtw-close {
  padding: 1px 8px;
}
.gtw-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  overscroll-behavior: contain;
}
.gtw-mount {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.gtw-notice {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 1em;
  text-align: center;
  background: var(--soda-bg, #1e1f29);
}
.gtw-notice p {
  margin: 0;
}
.gtw-notice-sub {
  font-size: 0.85em;
  color: var(--soda-state-idle, #8a9ad0);
}
.gtw-notice-actions {
  display: flex;
  gap: 8px;
}
.gtw-takeover {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.gtw-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex: none;
  padding: 2px var(--soda-shape-pad-x, 6px);
  border-top: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  font-size: 0.75em;
  color: var(--soda-state-idle, #8a9ad0);
}
.gtw-keys {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gtw-keys kbd {
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
}
.gtw-size {
  flex: none;
  padding-right: 14px; /* 右下の角のつかむ場所の分 */
}
/* 右下の角: 大きさを変えるつかむ場所。 */
.gtw-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  touch-action: none;
  z-index: 2;
  background: linear-gradient(135deg, transparent 50%, var(--soda-menu-border, #44475a) 50%, var(--soda-menu-border, #44475a) 58%, transparent 58%, transparent 72%, var(--soda-menu-border, #44475a) 72%, var(--soda-menu-border, #44475a) 80%, transparent 80%);
}
</style>
