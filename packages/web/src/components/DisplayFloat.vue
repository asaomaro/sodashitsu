<script setup lang="ts">
import type { DisplayInfo } from "@sodashitsu/protocol";
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, watch } from "vue";
import { useResizeDrag } from "../composables/useResizeDrag.js";
import { displayLabel, engagedNote } from "../display/displayLabel.js";
import { floatEdgeZoneAt } from "../display/dockDrag.js";
import { headFocusTarget, withDisplayChange } from "../display/displayOps.js";
import { placedFrameKey } from "../display/framePage.js";
import {
  FLOAT_AREA_INSET_PX,
  FLOAT_HANDLES,
  keyAdjustFloatRect,
  moveFloatRect,
  resizeFloatRect,
  type Area,
  type FloatHandle,
  type Rect,
} from "../display/floatGeometry.js";
import { DisplayHostKey, FloatGripKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayFrame from "./DisplayFrame.vue";
import DisplayPanelHead from "./DisplayPanelHead.vue";

/**
 * 浮いた窓 1 つ（表示の面 `--kind panel` の置き場所 `float`。20261008-display-layout の design「浮いた窓」）。端末の領域の箱の中の層（`.pane-frame-floats`）に出る。
 * - 位置・大きさ・重なりは、**アプリの DOM の上のポインタ・キーだけ**が変える（枠の中の面からは変えられない）。枠（iframe）は動かさず、スタイルだけを変える。
 * - 見出しは `DisplayPanelHead`（ドックのパネルと同じ部品）。つかむ場所は窓をその場で動かし、本体の箱の縁から 16px 以内で離すとその側のドックへ置く。
 * - 縁と角の 8 つのつかむ場所で大きさを変える。ドラッグの間は葉（端末）の箱を変えないので、`client.view` は送られない。
 * - 窓を押すと前へ出る（`z-index` だけ。DOM の並びは変えない）。出現・前へ出す操作で、枠へフォーカスを移さない（アプリは `iframe.focus()` を呼ばない）。
 * - 枠以外の部分（題・操作中の文言・縁・つかむ場所）は、押してもフォーカスを取らない（`@mousedown.prevent`・`data-display-keepfocus`）。
 */
const props = defineProps<{ info: DisplayInfo; rect: Rect; area: Area; z: number }>();

const store = useDisplayStore();
const view = useViewStore();
const host = inject(DisplayHostKey, undefined);
const rootEl = ref<HTMLElement | null>(null);

const content = computed(() => store.contents.get(props.info.id));
const engaged = computed(() => store.focusedDisplayId === props.info.id);
/** ドラッグ・キーの途中の矩形（領域の左上から）。無ければ割り付けの結果。 */
const live = ref<Rect | null>(null);
const shown = computed<Rect>(() => live.value ?? props.rect);
const style = computed(() => ({
  left: `${shown.value.x + FLOAT_AREA_INSET_PX}px`,
  top: `${shown.value.y + FLOAT_AREA_INSET_PX}px`,
  width: `${shown.value.w}px`,
  height: `${shown.value.h}px`,
  zIndex: String(props.z),
}));
/** 低い窓では、操作中の説明文を見せない（`title` と読み上げには残す）。固定の部品を押し出さないため。 */
const compactNote = computed(() => shown.value.h < 170);

/** この窓がいまも「開いている浮いた窓」か（ドラッグ・キーの確定を、消えた・移された窓に当てない）。 */
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});
const stillFloating = (): boolean => {
  if (!alive) return false;
  const info = store.infos.get(props.info.id);
  if (!info) return false;
  const f = store.effectiveOf(info);
  return f.dock === "float" && !f.collapsed;
};
const bodyBox = (): DOMRect | null => rootEl.value?.closest(".pane-frame-body-displays")?.getBoundingClientRect() ?? null;

// --- 押した窓を前へ（`z-index` だけ） -----------------------------------------------------------------------------------------------
function onRaise(): void {
  store.raiseFloat(props.info.paneId, props.info.id);
}

// --- 見出しのつかむ場所: 窓をその場で動かす。縁へ寄せて離すと、その側のドックへ -----------------------------------------------------------------
interface MoveStart {
  rect: Rect;
  x: number;
  y: number;
}
const moveDrag = useResizeDrag<MoveStart>({
  axis: "move",
  enabled: () => stillFloating(),
  begin: (ev) => ({ rect: shown.value, x: ev.clientX, y: ev.clientY }),
  move: (ev, start) => {
    if (!stillFloating()) return;
    live.value = moveFloatRect(start.rect, ev.clientX - start.x, ev.clientY - start.y, props.area);
    store.bumpLayoutRev();
    const box = bodyBox();
    const zone = box ? floatEdgeZoneAt({ left: box.left, top: box.top, width: box.width, height: box.height }, ev.clientX, ev.clientY) : null;
    store.setDockDrag({ id: props.info.id, paneId: props.info.paneId, zone, floatMove: true });
  },
  commit: () => {
    const zone = store.dockDrag?.id === props.info.id ? store.dockDrag.zone : null;
    const rect = live.value;
    store.setDockDrag(null);
    if (!stillFloating()) {
      live.value = null;
      return;
    }
    const info = store.infos.get(props.info.id)!;
    if (zone !== null && zone !== "float") {
      live.value = null;
      void withDisplayChange(info, () => store.setFaceDock(info, zone), () => headFocusTarget(info.id), host);
      return;
    }
    if (rect) store.setFaceRect(info, rect);
    live.value = null;
  },
  cancel: () => {
    store.setDockDrag(null);
    live.value = null;
    store.bumpLayoutRev();
  },
  reset: () => undefined,
});
provide(FloatGripKey, moveDrag);

// --- 縁と角の 8 つのつかむ場所: 大きさを変える -------------------------------------------------------------------------------------------
let handle: FloatHandle = "se";
interface ResizeStart {
  rect: Rect;
  x: number;
  y: number;
  handle: FloatHandle;
}
const axisOf = (h: FloatHandle): "x" | "y" | "nwse" | "nesw" => (h === "e" || h === "w" ? "x" : h === "n" || h === "s" ? "y" : h === "nw" || h === "se" ? "nwse" : "nesw");
const resizeDrag = useResizeDrag<ResizeStart>({
  axis: () => axisOf(handle),
  enabled: () => stillFloating(),
  begin: (ev) => {
    const h = (ev.currentTarget as HTMLElement | null)?.dataset["displayFloatHandle"];
    handle = (FLOAT_HANDLES as readonly string[]).includes(h ?? "") ? (h as FloatHandle) : "se";
    return { rect: shown.value, x: ev.clientX, y: ev.clientY, handle };
  },
  move: (ev, start) => {
    if (!stillFloating()) return;
    live.value = resizeFloatRect(start.rect, start.handle, ev.clientX - start.x, ev.clientY - start.y, props.area);
    store.bumpLayoutRev();
  },
  commit: () => {
    const rect = live.value;
    if (stillFloating() && rect) store.setFaceRect(store.infos.get(props.info.id)!, rect);
    live.value = null;
  },
  cancel: () => {
    live.value = null;
    store.bumpLayoutRev();
  },
  reset: () => undefined,
});
// ダイアログ（設定・グラフなど。modal）が開いたら、そこで確定する（`useResizeDrag` と同じ決まり）。
watch(
  () => view.modalOpen,
  (open) => {
    if (open) {
      moveDrag.finish();
      resizeDrag.finish();
    }
  },
);

// --- キーで動かす・大きさを変える（`floatKeyMode`） ---------------------------------------------------------------------------------
const keyMode = computed(() => (store.floatKeyMode?.id === props.info.id ? store.floatKeyMode.mode : null));
let returnFocusTo: HTMLElement | null = null;
let finishing = false;
let keyStart: Rect | null = null;
watch(
  keyMode,
  (mode, old) => {
    if (mode && !old) {
      const a = document.activeElement;
      returnFocusTo = a instanceof HTMLElement && a !== document.body ? a : null; // 始める前の場所（端末か、見出しの［⋮］）
      keyStart = shown.value;
      finishing = false;
      // `tabindex="-1"` が付いてから、窓の根へフォーカスを移す（このモードの間だけ）。
      void nextTick(() => rootEl.value?.focus({ preventScroll: true }));
    }
  },
  { immediate: true },
);
const keyNote = computed(() =>
  keyMode.value === "resize" ? "矢印キーで大きさを変えます（Enter で確定・Esc で戻す）" : "矢印キーで動かします（Enter で確定・Esc で戻す）",
);
/**
 * キーのモードを終える。**先にフォーカスを移してから、`tabindex` を外す**（フォーカスのある要素から `tabindex` を外すと、フォーカスが `body` に落ちる）。
 * 戻し先は始める前の場所。無ければ端末。`moveFocus` が偽（フォーカスが自分で窓の外へ出た）なら、移さない。
 */
function endKeys(commit: boolean, moveFocus: boolean): void {
  if (finishing || keyMode.value === null) return;
  finishing = true;
  const rect = live.value;
  if (commit && rect && stillFloating()) store.setFaceRect(store.infos.get(props.info.id)!, rect);
  live.value = null;
  if (moveFocus) {
    const to = returnFocusTo;
    if (to?.isConnected) to.focus({ preventScroll: true });
    else host?.focusTerminal(props.info.paneId);
  }
  returnFocusTo = null;
  keyStart = null;
  store.endFloatKeys(props.info.id);
  store.bumpLayoutRev();
}
function onRootKey(ev: KeyboardEvent): void {
  const mode = keyMode.value;
  if (mode === null) return;
  if (ev.key === "Tab") {
    // フォーカスが窓から出る＝確定（フォーカスは Tab の行き先に任せる）。
    endKeys(true, false);
    return;
  }
  ev.preventDefault();
  ev.stopPropagation(); // 端末へ流さない
  if (ev.key === "Enter") {
    endKeys(true, true);
    return;
  }
  if (ev.key === "Escape") {
    endKeys(false, true);
    return;
  }
  const next = keyAdjustFloatRect(live.value ?? keyStart ?? shown.value, mode, ev.key, ev.shiftKey, props.area);
  if (next) {
    live.value = next;
    store.bumpLayoutRev();
  }
}
function onFocusOut(ev: FocusEvent): void {
  if (keyMode.value === null || finishing) return;
  const to = ev.relatedTarget;
  if (to instanceof Node && rootEl.value?.contains(to)) return;
  const outside = (): boolean => keyMode.value !== null && !finishing && !rootEl.value?.contains(document.activeElement) && document.hasFocus();
  // 窓の外の部品（端末など）へ利用者がフォーカスを移した: 確定する。フォーカスは動かさない。
  if (to instanceof Element && !to.matches("iframe[data-display-frame]")) {
    void nextTick(() => {
      if (outside()) endKeys(true, false);
    });
    return;
  }
  // 表示の枠（iframe）がフォーカスを取った・どこにも移らなかった（body に落ちた）: 利用者が外へ出したのではない。PR3 の見回りが元の場所へ戻す（窓の根は覚えた元の場所）ので、
  // 少し置いて、戻っていなければ（利用者が余白を押した等）確定する。
  setTimeout(() => {
    if (outside() && !document.activeElement?.matches?.("iframe[data-display-frame]")) endKeys(true, false);
  }, 200);
}
onBeforeUnmount(() => {
  // 窓が消えるとき、キーのモードの途中なら（フォーカスは窓の根にある。窓の外へ出ていれば、もう確定している）、端末へ移す（`body` に落とさない）。
  if (keyMode.value !== null) host?.focusTerminal(props.info.paneId);
  store.endFloatKeys(props.info.id);
  if (store.dockDrag?.id === props.info.id) store.setDockDrag(null);
});
</script>

<template>
  <section
    ref="rootEl"
    class="display-float"
    :class="{ 'display-float-engaged': engaged, 'display-float-keymode': keyMode !== null }"
    role="dialog"
    :aria-label="displayLabel(info)"
    :tabindex="keyMode !== null ? -1 : undefined"
    :style="style"
    data-display-float
    :data-display-root="info.id"
    :data-display-engaged="engaged ? '1' : '0'"
    @pointerdown.capture="onRaise"
    @keydown="onRootKey"
    @focusout="onFocusOut"
  >
    <div class="display-float-head"><DisplayPanelHead :info="info" collapsible /></div>
    <div class="display-float-title" data-display-float-title data-display-keepfocus @mousedown.prevent>{{ info.title }}</div>
    <div
      v-if="engaged"
      class="display-float-note"
      :class="{ 'display-float-note-compact': compactNote }"
      :title="engagedNote(info)"
      aria-live="polite"
      data-display-chrome
      data-display-float-note
      data-display-keepfocus
      @mousedown.prevent
    >
      {{ engagedNote(info) }}
    </div>
    <div
      v-if="keyMode !== null"
      class="display-float-keynote"
      role="status"
      aria-live="polite"
      data-display-chrome
      data-display-keymode-note
      data-display-keepfocus
      @mousedown.prevent
    >
      {{ keyNote }}
    </div>
    <div class="display-float-body">
      <DisplayFrame :key="placedFrameKey(info, 'float')" :info="info" :content="content" />
    </div>
    <div class="display-float-ring" aria-hidden="true" data-display-float-ring></div>
    <div
      v-for="h in FLOAT_HANDLES"
      :key="h"
      class="display-float-handle"
      :class="`display-float-handle-${h}`"
      :data-display-float-handle="h"
      data-display-keepfocus
      aria-hidden="true"
      @mousedown.prevent
      @pointerdown="resizeDrag.onPointerDown"
      @pointermove="resizeDrag.onPointerMove"
      @pointerup="resizeDrag.onPointerEnd"
      @pointercancel="resizeDrag.onPointerEnd"
      @lostpointercapture="resizeDrag.onPointerEnd"
    ></div>
  </section>
</template>

<style scoped>
.display-float {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  pointer-events: auto; /* 層は pointer-events: none（窓のないところは端末へ通す） */
  background: var(--soda-bg, #1e1f29); /* 不透明（後ろの端末が透けない） */
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  box-shadow: 0 4px 16px rgb(0 0 0 / 45%);
}
.display-float:focus {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 0;
}
.display-float-head {
  /* 見出しは、縁と角のつかむ場所より上（見出しのボタンが、角のつかむ場所に覆われない）。 */
  position: relative;
  z-index: 2;
  flex: none;
}
.display-float-title {
  flex: none;
  padding: 2px 8px;
  font-size: 0.8em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.display-float-note,
.display-float-keynote {
  flex: none;
  min-width: 0;
  overflow-wrap: anywhere;
  padding: 2px 8px;
  font-size: 0.75em;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.display-float-note-compact {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.display-float-body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto; /* 最小の大きさで、枠の中の固定の文言と［再開］が、スクロールして届く */
}
/* 操作中の縁。枠を覆う細い輪（レイアウトを動かさず、iframe の上に描く）。 */
.display-float-ring {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 2px solid transparent;
  border-radius: var(--soda-shape-radius);
  pointer-events: none;
  z-index: 1;
}
.display-float-engaged .display-float-ring {
  border-color: var(--soda-accent, #6070a1);
}
/* 縁と角のつかむ場所。縁（幅 6px）・角（12px）は窓の外へ 3px はみ出す（窓の中の見出しのボタンに重ならない）。 */
.display-float-handle {
  position: absolute;
  z-index: 1;
  touch-action: none;
}
.display-float-handle-n,
.display-float-handle-s {
  left: 12px;
  right: 12px;
  height: 6px;
  cursor: ns-resize;
}
.display-float-handle-n {
  top: -3px;
}
.display-float-handle-s {
  bottom: -3px;
}
.display-float-handle-e,
.display-float-handle-w {
  top: 12px;
  bottom: 12px;
  width: 6px;
  cursor: ew-resize;
}
.display-float-handle-e {
  right: -3px;
}
.display-float-handle-w {
  left: -3px;
}
.display-float-handle-ne,
.display-float-handle-nw,
.display-float-handle-se,
.display-float-handle-sw {
  width: 12px;
  height: 12px;
}
.display-float-handle-ne {
  top: -3px;
  right: -3px;
  cursor: nesw-resize;
}
.display-float-handle-sw {
  bottom: -3px;
  left: -3px;
  cursor: nesw-resize;
}
.display-float-handle-nw {
  top: -3px;
  left: -3px;
  cursor: nwse-resize;
}
.display-float-handle-se {
  bottom: -3px;
  right: -3px;
  cursor: nwse-resize;
}
</style>
