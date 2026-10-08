<script setup lang="ts">
import type { DisplayInfo } from "@sodashitsu/protocol";
import { computed, nextTick, ref, watch } from "vue";
import { useResizeDrag } from "../composables/useResizeDrag.js";
import { displayLabel, engagedNote } from "../display/displayLabel.js";
import { placedFrameKey } from "../display/framePage.js";
import type { DockGroup, Side } from "../display/paneDisplayLayout.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayFrame from "./DisplayFrame.vue";
import DisplayPanelHead from "./DisplayPanelHead.vue";

/**
 * pane の側（PR-A は右）に出すパネルの群れ（表示の面 `--kind panel`。20261007-soda-extensions の design「ブラウザ」・20261008-display-layout の design「部品」）。
 * - 見出しの固定のラベルは**アプリが描く**（`DisplayPanelHead`）。題・中身からラベルの文言・位置・色は変えられない。
 * - 複数あればタブ（`role="tablist"`。矢印・`Home`・`End`）。たたむとこの群れから外れて、帯の行のボタン（トレイ）になる。［×］で利用者が閉じる。
 * - 枠にフォーカスがある間は「操作中」を縁と文言で示す（備え (a)）。
 * - 大きさは割り付けの結果 `dock`（範囲に丸めた値）。つまみのドラッグの間は大きさを変えず、案内の線だけを動かす（端末の大きさを送り続けない）。
 */
const props = defineProps<{ paneId: string; side: Side; dock: DockGroup }>();
/** ドラッグ中の案内の線（側と、いま指している大きさ px。`null` で消す）。 */
const emit = defineEmits<{ guide: [g: { side: Side; px: number } | null] }>();

const store = useDisplayStore();
const view = useViewStore();

const panels = computed(() => props.dock.ids.flatMap((id) => store.infos.get(id) ?? []) as DisplayInfo[]);
const active = computed(() => panels.value.find((p) => p.id === props.dock.activeId) ?? panels.value[0] ?? null);
const engaged = computed(() => store.focusedDisplayId !== null && panels.value.some((p) => p.id === store.focusedDisplayId));
const content = computed(() => (active.value ? store.contents.get(active.value.id) : undefined));
/** 左右の側は幅・上下の側は高さ（つまみの向き）。 */
const horizontal = computed(() => props.side === "left" || props.side === "right");
/** ドラッグ中に案内の線が指している大きさ（無ければ null）。 */
const dragSize = ref<number | null>(null);
const shownSize = computed(() => dragSize.value ?? props.dock.size);
const rootStyle = computed(() =>
  horizontal.value ? { flex: `0 0 ${props.dock.size}px`, width: `${props.dock.size}px` } : { flex: `0 0 ${props.dock.size}px`, height: `${props.dock.size}px` },
);
const handleLabel = computed(() => (horizontal.value ? "パネルの幅" : "パネルの高さ"));

const clampToRange = (w: number): number => Math.min(props.dock.max, Math.max(props.dock.min, Math.round(w)));
/** ポインタの動き（端末から遠ざかる向きが広がる）から、大きさを決める。右は左へ・下は上へ動かすと広がる。 */
function sizeFromDelta(startSize: number, dx: number, dy: number): number {
  if (props.side === "right") return startSize - dx;
  if (props.side === "left") return startSize + dx;
  if (props.side === "bottom") return startSize - dy;
  return startSize + dy;
}
const drag = useResizeDrag<{ size: number; x: number; y: number }>({
  axis: horizontal.value ? "x" : "y",
  enabled: () => true,
  begin: (ev) => ({ size: props.dock.size, x: ev.clientX, y: ev.clientY }),
  // 大きさは変えない。案内の線だけを動かす（葉の箱が変わらないので、ドラッグの間は端末の大きさ〔client.view〕が送られない）。
  move: (ev, start) => {
    dragSize.value = clampToRange(sizeFromDelta(start.size, ev.clientX - start.x, ev.clientY - start.y));
    emit("guide", { side: props.side, px: dragSize.value });
  },
  // 離したとき、1 回だけ確定する（ここで葉の箱が 1 回変わる）。
  commit: () => {
    const w = dragSize.value;
    dragSize.value = null;
    emit("guide", null);
    if (w !== null) store.setSideSize(props.paneId, props.side, w);
  },
  cancel: () => {
    dragSize.value = null;
    emit("guide", null);
  },
  // ダブルクリック: プログラムの指定の大きさへ戻る。
  reset: () => store.clearSideSize(props.paneId, props.side),
});
// ダイアログ（設定・グラフなど。modal）が開いたら、ドラッグを確定して終える（`Sidebar`・`Splitter` と同じ）。
watch(
  () => view.modalOpen,
  (open) => {
    if (open) drag.finish();
  },
);
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;
/** 端末の側へ向く矢印（右は ←・左は →・上は ↓・下は ↑）で広く、逆で狭く。 */
const WIDEN_KEY: Record<Side, string> = { right: "ArrowLeft", left: "ArrowRight", top: "ArrowDown", bottom: "ArrowUp" };
const NARROW_KEY: Record<Side, string> = { right: "ArrowRight", left: "ArrowLeft", top: "ArrowUp", bottom: "ArrowDown" };
/** つまみのキー（Shift で 64px。Home＝最小・End＝最大・Enter＝指定の大きさへ）。 */
function onHandleKey(ev: KeyboardEvent): void {
  const step = ev.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
  const cur = props.dock.size;
  let next: number | null = null;
  if (ev.key === WIDEN_KEY[props.side]) next = cur + step;
  else if (ev.key === NARROW_KEY[props.side]) next = cur - step;
  else if (ev.key === "Home") next = props.dock.min;
  else if (ev.key === "End") next = props.dock.max;
  else if (ev.key === "Enter") {
    ev.preventDefault();
    ev.stopPropagation();
    store.clearSideSize(props.paneId, props.side);
    return;
  }
  if (next === null) return;
  ev.preventDefault();
  ev.stopPropagation(); // 端末へ流さない
  store.setSideSize(props.paneId, props.side, clampToRange(next));
}

function select(id: string): void {
  store.setActiveBySide(props.paneId, props.side, id);
}

/** タブの矢印キー（← →・Home・End）。移って切り替える。 */
function onTabKey(ev: KeyboardEvent): void {
  const list = panels.value;
  const n = list.length;
  const cur = Math.max(0, list.findIndex((p) => p.id === active.value?.id));
  const to =
    ev.key === "ArrowRight" ? (cur + 1) % n : ev.key === "ArrowLeft" ? (cur + n - 1) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
  if (to < 0) return;
  ev.preventDefault();
  const next = list[to];
  if (!next) return;
  select(next.id);
  void nextTick(() => (document.getElementById(`pane-panel-tab-${props.paneId}-${next.id}`) as HTMLElement | null)?.focus());
}
</script>

<template>
  <aside
    v-if="active"
    class="pane-panel"
    :class="[`pane-panel-${side}`, { 'pane-panel-engaged': engaged }]"
    :style="rootStyle"
    role="complementary"
    :aria-label="displayLabel(active)"
    data-pane-panel
    :data-display-dock="side"
    :data-display-root="active.id"
    :data-display-engaged="engaged ? '1' : '0'"
  >
    <div
      class="pane-panel-resize resize-handle"
      :class="[horizontal ? 'resize-handle-x' : 'resize-handle-y', { 'resize-handle-active': drag.dragging.value }]"
      role="separator"
      :aria-orientation="horizontal ? 'vertical' : 'horizontal'"
      :aria-label="handleLabel"
      :aria-valuenow="shownSize"
      :aria-valuemin="dock.min"
      :aria-valuemax="dock.max"
      tabindex="0"
      data-pane-panel-resize
      data-display-keepfocus
      @pointerdown="drag.onPointerDown"
      @pointermove="drag.onPointerMove"
      @pointerup="drag.onPointerEnd"
      @pointercancel="drag.onPointerEnd"
      @lostpointercapture="drag.onPointerEnd"
      @keydown="onHandleKey"
    ></div>
    <DisplayPanelHead :info="active" collapsible />
    <div v-if="panels.length > 1" class="pane-panel-tabs" role="tablist" aria-label="パネルの一覧" data-display-chrome @keydown="onTabKey">
      <button
        v-for="p in panels"
        :id="`pane-panel-tab-${paneId}-${p.id}`"
        :key="p.id"
        type="button"
        role="tab"
        class="pane-panel-tab"
        :aria-selected="p.id === active.id ? 'true' : 'false'"
        :tabindex="p.id === active.id ? 0 : -1"
        data-pane-panel-tab
        @click="select(p.id)"
      >
        {{ p.title }}
      </button>
    </div>
    <div v-else class="pane-panel-title" data-pane-panel-title>{{ active.title }}</div>
    <div v-if="engaged" class="pane-panel-engaged-note" aria-live="polite" data-display-chrome data-pane-panel-engaged-note>{{ engagedNote(active) }}</div>
    <div class="pane-panel-body">
      <DisplayFrame :key="placedFrameKey(active, `dock:${side}`)" :info="active" :content="content" />
    </div>
    <div class="pane-panel-ring" aria-hidden="true" data-pane-panel-ring></div>
  </aside>
</template>

<style scoped>
.pane-panel {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
}
/* 端末に面した縁に、境の線とつまみ。 */
.pane-panel-right {
  border-left: 1px solid var(--soda-menu-border, #44475a);
}
.pane-panel-left {
  border-right: 1px solid var(--soda-menu-border, #44475a);
}
.pane-panel-top {
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.pane-panel-bottom {
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
/* つまみ（細い線。当たり判定と強調の線は `resize-handle` が作る）。端末に面した縁。 */
.pane-panel-resize {
  position: absolute;
  z-index: 22;
}
.pane-panel-right > .pane-panel-resize,
.pane-panel-left > .pane-panel-resize {
  top: 0;
  bottom: 0;
  width: 2px;
  cursor: col-resize;
}
.pane-panel-right > .pane-panel-resize {
  left: -1px;
}
.pane-panel-left > .pane-panel-resize {
  right: -1px;
}
.pane-panel-top > .pane-panel-resize,
.pane-panel-bottom > .pane-panel-resize {
  left: 0;
  right: 0;
  height: 2px;
  cursor: row-resize;
}
.pane-panel-top > .pane-panel-resize {
  bottom: -1px;
}
.pane-panel-bottom > .pane-panel-resize {
  top: -1px;
}
.pane-panel-tab:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.pane-panel-tabs {
  flex: none;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 3px 4px 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.pane-panel-tab {
  font: inherit;
  font-size: 0.8em;
  padding: 0.2em 0.7em;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  white-space: nowrap;
}
.pane-panel-tab[aria-selected="true"] {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.pane-panel-title {
  flex: none;
  padding: 2px 8px;
  font-size: 0.8em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pane-panel-engaged-note {
  flex: none;
  padding: 2px 8px;
  font-size: 0.75em;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.pane-panel-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
/* 操作中の縁。枠を覆う細い輪（レイアウトを動かさず、iframe の上に描く）。 */
.pane-panel-ring {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 2px solid transparent;
  pointer-events: none;
}
.pane-panel-engaged .pane-panel-ring {
  border-color: var(--soda-accent, #6070a1);
}
</style>
