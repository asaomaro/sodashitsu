<script setup lang="ts">
import type { DisplayInfo } from "@sodashitsu/protocol";
import { computed, inject, onBeforeUnmount, watch } from "vue";
import { displayLabel } from "../display/displayLabel.js";
import { createDockDrag, type DockZone } from "../display/dockDrag.js";
import { dismissWithFocus, headFocusTarget, menuPositionBelow, openDisplayMenu, trayFocusTarget, withDisplayChange } from "../display/displayOps.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayScriptMark from "./DisplayScriptMark.vue";

/**
 * 面の見出し 1 行（20261008-display-layout の design「部品」）。印「スクリプト」・固定のラベル・［操作する］・［操作を終える］・［⋮］（面のメニュー）・［たたむ］・［×］。
 * 置き場所に依らず同じ部品が描く（欠ける置き場所を作らない）。印とボタンは縮まず、ラベルだけが省略される。収まらなければ折る。
 * ［⋮］［たたむ］［×］とつかむ場所は、押してもフォーカスを取らない（`@mousedown.prevent`・`data-display-keepfocus`）。
 */
const props = defineProps<{ info: DisplayInfo; collapsible: boolean }>();
const store = useDisplayStore();
const view = useViewStore();
const controller = inject(DisplayControllerKey, null);
const host = inject(DisplayHostKey, undefined);

const label = computed(() => displayLabel(props.info));

/**
 * 見出しのつかむ場所（`[data-display-grip]`）の D&D。離した場所が今の置き場所と同じなら何もしない。置き場所を変える操作は `withDisplayChange` を通す（フォーカスを `body` に落とさない）。
 * 枠は動かさず、置き場所の鍵が替わって作り直す。`view.paneDrag`（pane の名前の D&D）は立てない。
 */
const dockDrag = createDockDrag({
  // 見出しは、タブを替えても同じ部品なので、面の id・pane は読むたびに取る。
  get id() {
    return props.info.id;
  },
  get paneId() {
    return props.info.paneId;
  },
  box: () => document.querySelector(`[data-pane-id="${CSS.escape(props.info.paneId)}"] .pane-frame-body-displays`)?.getBoundingClientRect() ?? null,
  float: () => false, // 浮いた窓は PR-C
  setState: (st) => store.setDockDrag(st),
  drop: (zone: DockZone) => {
    if (zone === "float" || zone === store.effectiveOf(props.info).dock) return;
    void withDisplayChange(
      props.info,
      () => store.setFaceDock(props.info, zone),
      () => headFocusTarget(props.info.id),
      host,
    );
  },
  modalOpen: () => view.modalOpen,
});
watch(
  () => view.modalOpen,
  (open) => {
    if (open) dockDrag.cancel();
  },
);
// つかんでいる面が閉じられて、同じ側の別の面の見出しになった（部品は使い回される）ら、その場で取り消す（別の面を動かさない。`createDockDrag` も、動かす・離すときに面の違いを見て取り消す）。
watch(
  () => props.info.id,
  () => dockDrag.cancel(),
);
onBeforeUnmount(() => dockDrag.cancel());

function onFold(): void {
  void withDisplayChange(
    props.info,
    () => store.setFaceCollapsed(props.info, true),
    () => trayFocusTarget(props.info.id),
    host,
  );
}
function onClose(): void {
  dismissWithFocus(props.info, () => controller?.dismiss({ id: props.info.id }), host);
}
function onMenu(ev: MouseEvent): void {
  openDisplayMenu((t, at) => view.openContextMenu(t, at), { kind: "display", id: props.info.id }, menuPositionBelow(ev.currentTarget as Element), host, props.info.paneId);
}
function onKeydown(ev: KeyboardEvent): void {
  // 押しっぱなし（繰り返し）で、たたむ・開くが往復しない。
  if (ev.repeat && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    return;
  }
  // 見出しのボタンの上の Esc: その pane の端末へ戻る（面は閉じない）。
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    host?.focusTerminal(props.info.paneId);
  }
}
</script>

<template>
  <div class="display-head pane-panel-head" data-display-chrome data-display-head @keydown="onKeydown">
    <div
      class="display-head-grip"
      data-display-grip
      data-display-keepfocus
      data-pane-panel-label
      @mousedown.prevent
      @pointerdown="dockDrag.onPointerDown"
      @pointermove="dockDrag.onPointerMove"
      @pointerup="dockDrag.onPointerUp"
      @pointercancel="dockDrag.onPointerCancel"
      @lostpointercapture="dockDrag.onPointerCancel"
    >
      <DisplayScriptMark :info="info" part="mark" /><span class="display-head-label">{{ label }}</span>
    </div>
    <div class="display-head-actions">
      <DisplayScriptMark :info="info" part="button" />
      <DisplayScriptMark :info="info" part="end" />
      <button
        type="button"
        class="display-head-btn"
        aria-label="この表示のメニュー"
        title="メニュー"
        aria-haspopup="menu"
        data-display-menu-button
        data-display-keepfocus
        @mousedown.prevent
        @click="onMenu"
      >
        ⋮
      </button>
      <button
        v-if="collapsible"
        type="button"
        class="display-head-btn"
        aria-label="パネルをたたむ"
        title="たたむ"
        data-pane-panel-fold
        data-display-keepfocus
        @mousedown.prevent
        @click="onFold"
      >
        ▸
      </button>
      <button type="button" class="display-head-btn" aria-label="この表示を閉じる" title="この表示を閉じる" data-pane-panel-close data-display-keepfocus @mousedown.prevent @click="onClose">×</button>
    </div>
  </div>
</template>

<style scoped>
.display-head {
  flex: none;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 2px 4px 2px 8px;
  background: var(--soda-menu-border, #44475a);
  font-size: 0.75em;
}
/* 印とラベルの入れ物（つかむ場所）。印は縮まず、ラベルだけが省略される。 */
.display-head-grip {
  flex: 1 1 0;
  min-width: 4em;
  display: flex;
  align-items: center;
  font-weight: bold;
  cursor: grab;
  touch-action: none;
}
.display-head-label {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.display-head-actions {
  /* 縮められる（親の幅に収まらなければ、ボタンの並びが折り返す）。縮まないと、操作中の［操作を終える］が加わったとき、パネルの箱の外へはみ出す。 */
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px;
  margin-left: auto;
}
.display-head-btn {
  font: inherit;
  min-width: 24px;
  min-height: 24px;
  padding: 0 6px;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--soda-shape-radius);
  cursor: pointer;
}
.display-head-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.display-head-btn:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
</style>
