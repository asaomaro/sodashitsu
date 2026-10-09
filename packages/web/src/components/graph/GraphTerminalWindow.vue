<script setup lang="ts">
/**
 * グラフの上の端末の窓（20261008-graph-first の PR2a・PR2b。**3 つまで**。W1〜W11・追補 03 の X1〜X12）。ノードを押すと、その pane の端末が、動かせる窓として開く。基本画面へは移らない。
 * - 見出し: 状態の印・名前・workspace・表示の面の印（W9）・［留める］・［基本画面で開く］・［×］。見出しをつかんで動かす（フォーカスがあるとき、矢印キーでも。`Alt`+矢印で大きさ。`Shift` で大きい量）。
 * - 本体: 端末の要素の入れ物（`terminalHost` が要素を移してくる）。別のクライアントが直結しているとき（W2）は、端末の代わりに［引き取って開く］・［閉じる］。
 * - 縁と角の 8 つのつかむ場所で大きさを変える（最小 40 桁 × 10 行。X12。表示の面の浮いた窓と同じ決まり）。位置と大きさは pane ごとにブラウザに覚える（W6）。
 * - 下の行: 「キーは、この pane に届く」・グラフへ戻るキー（X1）・桁 × 行。
 * 色は既存の `--soda-*` だけ。角・影・高さは画面の様式のトークン（`var(--x, 今の値)`）。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useResizeDrag } from "../../composables/useResizeDrag.js";
import {
  clampFloatRect,
  FLOAT_CASCADE_PX,
  FLOAT_HANDLES,
  FLOAT_KEY_STEP_LARGE_PX,
  FLOAT_KEY_STEP_PX,
  moveFloatRect,
  resizeFloatRect,
  type Area,
  type FloatHandle,
  type Rect,
} from "../../display/floatGeometry.js";
import { GRAPH_TERMINAL_MIN_COLS, GRAPH_TERMINAL_MIN_ROWS } from "../../graphTerminal/GraphTerminalController.js";
import { fractionOf, placeFromMemory } from "../../graphTerminal/windowMemory.js";
import { FileTransferKey, GraphTerminalControllerKey, TerminalRegistryKey } from "../../injection.js";
import { useDisplayStore } from "../../store/display.js";
import { useGraphStore } from "../../store/graph.js";
import { useGraphTerminalsStore, type GraphTerminalWindow } from "../../store/graphTerminals.js";
import { useSessionStore } from "../../store/session.js";
import { useSettingsStore } from "../../store/settings.js";
import { useViewStore } from "../../store/view.js";
import { getCellSize } from "../../term/measure.js";
import { useTerminalSurface } from "../../term/useTerminalSurface.js";
import StateIcon from "../StateIcon.vue";

const props = defineProps<{ win: GraphTerminalWindow; area: Area; origin?: { x: number; y: number } }>();

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

const paneId = computed(() => props.win.paneId);
const info = computed(() => graph.nodeInfo(`local:${paneId.value}`));
const workspaceLabel = computed(() => {
  const loc = info.value.location;
  return loc ? (session.workspaces.get(loc.workspaceId)?.label ?? "") : "";
});
const displayCount = computed(() => displays.all.filter((d) => d.paneId === paneId.value).length);
const graphKey = computed(() => settings.keymap.hintFor("open_graph" as never));
const label = computed(() => `端末の窓：${info.value.name}`);
const zIndex = computed(() => 10 + store.zOf(props.win.key));

// --- 位置と大きさ（層の左上から）-----------------------------------------------------------------------------------------------
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
const sizeOf = (cols: number, rows: number): { w: number; h: number } => ({ w: Math.ceil(cols * cell.value.width) + chrome.value.w, h: Math.ceil(rows * cell.value.height) + chrome.value.h });
/** 最小の大きさ（40 桁 × 10 行の端末が入る窓）。X12。 */
const minSize = computed<Area>(() => sizeOf(GRAPH_TERMINAL_MIN_COLS, GRAPH_TERMINAL_MIN_ROWS));
const mem = computed(() => store.memory.geometry[paneId.value]);

/**
 * 覚えた位置があれば、そこ（桁と行も覚えた値）。無ければ:
 * - **最初の大きさ**は、面の領域の幅の 70%・高さの 80%（最小は 80 桁 × 24 行ぶん。最大は領域から余白 24px ずつを引いた大きさ。領域が狭ければ収まる大きさ）。
 * - **位置**は、押したノードの隣（領域に収まる側。右 → 左 → 下 → 上の順）。大きくなって、どの側にも収まらないときは、**領域の中央**（ノードが隠れてもよい。点線は出ない）。
 *   ノードが分からないときも中央（開いている窓の数ぶん、ずらす）。
 */
const GAP = 16;
/** 領域の端から窓までの余白の下限（最大の大きさを決める）。 */
const MARGIN = 24;
const WIDTH_RATIO = 0.7;
const HEIGHT_RATIO = 0.8;
function defaultRect(): Rect {
  const m = mem.value;
  if (m) {
    const sz = sizeOf(m.cols, m.rows);
    const w = Math.min(sz.w, props.area.w);
    const h = Math.min(sz.h, props.area.h);
    return { ...placeFromMemory(m, props.area, { w, h }), w, h };
  }
  const base = sizeOf(80, 24);
  const maxW = Math.max(1, props.area.w - MARGIN * 2);
  const maxH = Math.max(1, props.area.h - MARGIN * 2);
  const ww = Math.min(Math.max(base.w, Math.round(props.area.w * WIDTH_RATIO)), maxW);
  const hh = Math.min(Math.max(base.h, Math.round(props.area.h * HEIGHT_RATIO)), maxH);
  const a = props.win.anchor;
  const o = props.origin;
  if (a && o) {
    const nx = a.x - o.x;
    const ny = a.y - o.y;
    const clampY = (y: number): number => Math.min(Math.max(y, 0), props.area.h - hh);
    const clampX = (x: number): number => Math.min(Math.max(x, 0), props.area.w - ww);
    const sides: { fits: boolean; at: { x: number; y: number } }[] = [
      { fits: props.area.w - (nx + a.w + GAP) >= ww, at: { x: nx + a.w + GAP, y: clampY(ny) } },
      { fits: nx - GAP >= ww, at: { x: nx - GAP - ww, y: clampY(ny) } },
      { fits: props.area.h - (ny + a.h + GAP) >= hh, at: { x: clampX(nx), y: ny + a.h + GAP } },
      { fits: ny - GAP >= hh, at: { x: clampX(nx), y: ny - GAP - hh } },
    ];
    const side = sides.find((sd) => sd.fits);
    if (side) return { ...side.at, w: ww, h: hh };
  }
  const i = Math.max(0, store.windows.findIndex((x) => x.key === props.win.key));
  return { x: Math.round((props.area.w - ww) / 2) + i * FLOAT_CASCADE_PX, y: Math.round((props.area.h - hh) / 2) + i * FLOAT_CASCADE_PX, w: ww, h: hh };
}
const live = ref<Rect | null>(null);
const rect = computed<Rect>(() => live.value ?? clampFloatRect(props.win.rect ?? defaultRect(), props.area, minSize.value));
watch(rect, (r) => store.setShownRect(props.win.key, r), { immediate: true });
const style = computed(() => ({
  left: `${rect.value.x}px`,
  top: `${rect.value.y}px`,
  width: `${rect.value.w}px`,
  height: `${rect.value.h}px`,
  zIndex: String(zIndex.value),
}));

/** 動かした・大きさを変えた位置を確定する（この窓の矩形として持ち、pane ごとの記憶にも書く）。 */
function commitRect(r: Rect): void {
  const clamped = clampFloatRect(r, props.area, minSize.value);
  store.setRect(paneId.value, clamped);
  const cols = Math.max(GRAPH_TERMINAL_MIN_COLS, Math.floor((clamped.w - chrome.value.w) / cell.value.width));
  const rows = Math.max(GRAPH_TERMINAL_MIN_ROWS, Math.floor((clamped.h - chrome.value.h) / cell.value.height));
  store.remember(paneId.value, { ...fractionOf({ x: clamped.x, y: clamped.y }, props.area, { w: clamped.w, h: clamped.h }), cols, rows });
}

interface DragStart {
  rect: Rect;
  x: number;
  y: number;
  handle: FloatHandle;
}
const moveDrag = useResizeDrag<DragStart>({
  axis: "move",
  begin: (ev) => ({ rect: rect.value, x: ev.clientX, y: ev.clientY, handle: "se" }),
  move: (ev, start) => {
    live.value = moveFloatRect(start.rect, ev.clientX - start.x, ev.clientY - start.y, props.area);
  },
  commit: () => {
    if (live.value) commitRect(live.value);
    live.value = null;
  },
  cancel: () => {
    live.value = null;
  },
  reset: () => undefined,
});
let handle: FloatHandle = "se";
const axisOf = (h: FloatHandle): "x" | "y" | "nwse" | "nesw" => (h === "e" || h === "w" ? "x" : h === "n" || h === "s" ? "y" : h === "nw" || h === "se" ? "nwse" : "nesw");
const resizeDrag = useResizeDrag<DragStart>({
  axis: () => axisOf(handle),
  begin: (ev) => {
    const h = (ev.currentTarget as HTMLElement | null)?.dataset["graphTerminalHandle"];
    handle = (FLOAT_HANDLES as readonly string[]).includes(h ?? "") ? (h as FloatHandle) : "se";
    return { rect: rect.value, x: ev.clientX, y: ev.clientY, handle };
  },
  move: (ev, start) => {
    live.value = resizeFloatRect(start.rect, start.handle, ev.clientX - start.x, ev.clientY - start.y, props.area, minSize.value);
  },
  commit: () => {
    if (live.value) commitRect(live.value);
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

/**
 * キーボードで動かす・大きさを変える。**見出しのつかむ場所にフォーカスがあるときだけ**（端末にフォーカスがある間、矢印は pane に届く）。矢印で動かす・`Alt`+矢印で右下の縁を動かして大きさを変える・
 * `Shift` で大きい量。1 回ごとに確定する。
 */
function onGripKey(ev: KeyboardEvent): void {
  const step = ev.shiftKey ? FLOAT_KEY_STEP_LARGE_PX : FLOAT_KEY_STEP_PX;
  const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
  const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
  if (dx === 0 && dy === 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  const start = live.value ?? rect.value;
  commitRect(ev.altKey ? resizeFloatRect(start, "se", dx, dy, props.area, minSize.value) : moveFloatRect(start, dx, dy, props.area));
}

// --- 本体の大きさ → 桁と行（`pane.attach_resize`）-------------------------------------------------------------------------------
let observer: ResizeObserver | null = null;
onMounted(() => {
  store.setContainer(props.win.key, mountEl.value);
  measureChrome();
  if (typeof ResizeObserver !== "undefined" && bodyEl.value) {
    observer = new ResizeObserver(() => {
      measureChrome();
      controller?.noteBodyResized(paneId.value);
    });
    observer.observe(bodyEl.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  store.setContainer(props.win.key, null);
});

// --- 本体の振る舞い（基本画面の `TerminalPane` と共通。X9）------------------------------------------------------------------------
const surface = useTerminalSurface(
  () => paneId.value,
  () => fileTransfer,
  () => props.win.status !== "attached",
);
const { dragDepth, onMouseDownCapture, onDragEnter, onDragOver, onDragLeave, onDrop } = surface;

// --- 操作 -------------------------------------------------------------------------------------------------------------------
const onClose = (): void => controller?.close(paneId.value, "node");
const onOpenBase = (): void => controller?.openInBase(paneId.value);
const onTakeover = (): void => void controller?.takeover(paneId.value);
const onPin = (): void => controller?.pin(paneId.value, !props.win.pinned);
/** 押した・フォーカスした窓を前へ。フォーカスが入ったら、その窓の pane を選んでいる pane にする（窓で打った操作は、その窓の pane に効く）。 */
function onFocusIn(ev: FocusEvent): void {
  controller?.raise(paneId.value);
  // 選び直す（`view.focusPane`）と、`TerminalPane` の watch が端末へフォーカスを移す。見出しのボタンなどにフォーカスを入れたときは、選び直さない（そこへフォーカスを置けなくなる）。
  if ((ev.target as Element | null)?.classList.contains("xterm-helper-textarea")) controller?.ensureSelected(paneId.value);
}
const sizeText = computed(() => (props.win.cols > 0 ? `${props.win.cols} × ${props.win.rows}` : ""));
</script>

<template>
  <section
    ref="rootEl"
    class="gtw"
    :class="{ 'gtw-drop-target': dragDepth > 0, 'gtw-pinned': win.pinned }"
    role="dialog"
    :aria-label="label"
    tabindex="-1"
    data-graph-terminal-window
    :data-pane-id="paneId"
    :data-status="win.status"
    :data-pinned="win.pinned ? '1' : '0'"
    :style="style"
    @pointerdown.capture="controller?.raise(paneId)"
    @focusin="onFocusIn"
  >
    <header class="gtw-head">
      <div
        class="gtw-grip"
        data-graph-terminal-grip
        tabindex="0"
        role="button"
        :aria-label="`${info.name} の窓を動かす（矢印キーで動かす。Alt+矢印で大きさ。Shift で大きい量）`"
        title="つかんで動かす（矢印キーでも。Alt+矢印で大きさ）"
        @keydown="onGripKey"
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
      <button
        type="button"
        class="gtw-btn gtw-pin"
        data-graph-terminal-pin
        :aria-pressed="win.pinned"
        :title="win.pinned ? '留めています（別のノードを押しても、この窓の中身は替わりません）。押すと外す' : '留める（別のノードを押しても、この窓の中身が替わらなくなります）'"
        @click="onPin"
      >
        {{ win.pinned ? "留め中" : "留める" }}
      </button>
      <button type="button" class="gtw-btn gtw-open-base" data-graph-terminal-open-base @click="onOpenBase">基本画面で開く</button>
      <button type="button" class="gtw-btn gtw-close" aria-label="窓を閉じる" data-graph-terminal-close @click="onClose">×</button>
    </header>
    <div
      ref="bodyEl"
      class="gtw-body"
      @mousedown.capture="onMouseDownCapture"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div v-show="win.status === 'opening' || win.status === 'attached'" ref="mountEl" class="gtw-mount" data-graph-terminal-mount></div>
      <div v-if="win.status === 'taken'" class="gtw-notice" role="alert" data-graph-terminal-taken>
        <p>別のクライアントが、この pane に直結しています。</p>
        <p class="gtw-notice-sub">引き取ると、そのクライアントの直結は終わります。</p>
        <div class="gtw-notice-actions">
          <button type="button" class="gtw-btn gtw-takeover" data-graph-terminal-takeover @click="onTakeover">引き取って開く</button>
          <button type="button" class="gtw-btn" @click="onClose">閉じる</button>
        </div>
      </div>
      <div v-else-if="win.status === 'failed'" class="gtw-notice" role="alert" data-graph-terminal-failed>
        <p>{{ win.failure ?? "開けませんでした" }}</p>
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
      v-for="h in FLOAT_HANDLES"
      :key="h"
      class="gtw-handle"
      :class="`gtw-handle-${h}`"
      :data-graph-terminal-handle="h"
      :data-graph-terminal-corner="h === 'se' ? '' : undefined"
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
.gtw-head {
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}
.gtw-foot {
  border-bottom-left-radius: inherit;
  border-bottom-right-radius: inherit;
}
.gtw-grip:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.gtw-pin[aria-pressed="true"] {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.gtw-pinned {
  border-color: var(--soda-accent, #6070a1);
}
/* 縁と角のつかむ場所（表示の面の浮いた窓と同じ。縁 6px・角 12px。窓の外へ 3px はみ出す）。 */
.gtw-handle {
  position: absolute;
  z-index: 2;
  touch-action: none;
}
.gtw-handle-n,
.gtw-handle-s {
  left: 12px;
  right: 12px;
  height: 6px;
  cursor: ns-resize;
}
.gtw-handle-n {
  top: -3px;
}
.gtw-handle-s {
  bottom: -3px;
}
.gtw-handle-e,
.gtw-handle-w {
  top: 12px;
  bottom: 12px;
  width: 6px;
  cursor: ew-resize;
}
.gtw-handle-e {
  right: -3px;
}
.gtw-handle-w {
  left: -3px;
}
.gtw-handle-ne,
.gtw-handle-nw,
.gtw-handle-se,
.gtw-handle-sw {
  width: 12px;
  height: 12px;
}
.gtw-handle-ne {
  top: -3px;
  right: -3px;
  cursor: nesw-resize;
}
.gtw-handle-sw {
  bottom: -3px;
  left: -3px;
  cursor: nesw-resize;
}
.gtw-handle-nw {
  top: -3px;
  left: -3px;
  cursor: nwse-resize;
}
.gtw-handle-se {
  bottom: -3px;
  right: -3px;
  cursor: nwse-resize;
}
</style>
