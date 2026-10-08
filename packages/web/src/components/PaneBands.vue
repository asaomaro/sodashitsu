<script setup lang="ts">
import { computed, inject } from "vue";
import { visibleBands, BANDS_MORE_ROW_PX } from "../display/displayLayout.js";
import { displayBandLabel, engagedNote } from "../display/displayLabel.js";
import { dismissWithFocus, menuPositionBelow, openDisplayMenu } from "../display/displayOps.js";
import { placedFrameKey } from "../display/framePage.js";
import type { LayoutResult } from "../display/paneDisplayLayout.js";
import { TRAY_ROW_PX } from "../display/paneDisplayLayout.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayFrame from "./DisplayFrame.vue";
import DisplayScriptMark from "./DisplayScriptMark.vue";
import DisplayTray from "./DisplayTray.vue";

/**
 * pane の上・下に出す帯（表示の面 `--kind band`。20261007-soda-extensions の design「ブラウザ」）。1 本ごとに左端に固定の印「▍表示」（アプリが描く）・枠・［×］。
 *
 * - **`edge` を渡さないとき**は今までの動き（その pane の帯を全部・トレイなし・メニューなし。モバイルの `MobileShell` が使う）。高さの合計が pane の高さの 3 分の 1 を超える分は
 *   「ほか N 件」の 1 行（押すと知らせ）にまとめる。
 * - **`edge` を渡すとき**（20261008-display-layout）は、その側に出す帯だけを描く（割り付けの結果 `layout`）。`layout.tray.edge === edge` なら、トレイ（帯の行の中か、専用の行）と
 *   「ほか N 件」（押すと面の一覧のメニュー）も描く。帯ごとに［⋮］（面のメニュー）。上の帯と下の帯は別の入れ物（別の `PaneBands`）＝枠は動かさない。
 */
const props = defineProps<{ paneId: string; paneHeightPx?: number; edge?: "top" | "bottom"; layout?: LayoutResult }>();

const store = useDisplayStore();
const view = useViewStore();
const controller = inject(DisplayControllerKey, null);
const host = inject(DisplayHostKey, undefined);

const edged = computed(() => props.edge !== undefined && props.layout !== undefined);
const plainBands = computed(() => store.bandsOf(props.paneId));
const split = computed(() => visibleBands(plainBands.value.map((b) => b.size), props.paneHeightPx ?? 0));
/** 描く帯。edge なしは今までの先頭から収まる分。edge ありは割り付けの結果。 */
const shown = computed(() => {
  if (!edged.value) return plainBands.value.slice(0, split.value.shown);
  const ids = props.edge === "top" ? props.layout!.bands.top : props.layout!.bands.bottom;
  return ids.flatMap((id) => {
    const b = store.infos.get(id);
    return b ? [b] : [];
  });
});
const hidden = computed(() => {
  if (!edged.value) return plainBands.value.slice(split.value.shown);
  if (props.layout!.tray.edge !== props.edge) return [];
  return props.layout!.bands.more.flatMap((id) => {
    const b = store.infos.get(id);
    return b ? [b] : [];
  });
});
const tray = computed(() => (edged.value && props.layout!.tray.edge === props.edge ? props.layout!.tray : null));
const ownTray = computed(() => tray.value !== null && tray.value.row === "own");
const engaged = computed(() => store.focusedDisplayId !== null && shown.value.some((b) => b.id === store.focusedDisplayId));
const present = computed(() => (edged.value ? shown.value.length > 0 || ownTray.value || hidden.value.length > 0 : plainBands.value.length > 0));

const markLabel = displayBandLabel;
const slot = computed(() => (edged.value ? `band:${props.edge}` : "band:plain"));
function showHidden(ev: MouseEvent): void {
  if (!edged.value) {
    view.toast(`ほかの帯 ${hidden.value.length} 件: ${hidden.value.map((b) => b.name).join("、")}`);
    return;
  }
  openDisplayMenu((t, at) => view.openContextMenu(t, at), { kind: "displays", paneId: props.paneId }, menuPositionBelow(ev.currentTarget as Element), host, props.paneId);
}
function onMenu(id: string, ev: MouseEvent): void {
  openDisplayMenu((t, at) => view.openContextMenu(t, at), { kind: "display", id }, menuPositionBelow(ev.currentTarget as Element), host, props.paneId);
}
function onClose(b: { id: string; paneId: string }): void {
  dismissWithFocus(b, () => controller?.dismiss({ id: b.id }), host);
}
function onRowKey(ev: KeyboardEvent, paneId: string): void {
  if (ev.repeat && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    return;
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    host?.focusTerminal(paneId);
  }
}
</script>

<template>
  <div v-if="present" class="pane-bands" :class="{ 'pane-bands-engaged': engaged }" data-pane-bands :data-pane-bands-edge="edged ? edge : undefined">
    <!-- 帯が無い側のトレイの行（高さ 24px。ボタンだけ）。 -->
    <div v-if="ownTray" class="pane-tray-row" :style="{ height: `${TRAY_ROW_PX}px` }" data-display-chrome data-display-tray-row>
      <span class="pane-band-mark" :title="'表示'" role="img" aria-label="表示" data-pane-tray-mark>▍表示</span>
      <DisplayTray :pane-id="paneId" :buttons="tray!.buttons" />
    </div>
    <div
      v-for="b in shown"
      :key="b.id"
      class="pane-band"
      :class="{ 'pane-band-engaged': store.focusedDisplayId === b.id }"
      :style="{ height: `${b.size}px` }"
      data-pane-band
      :data-display-name="b.name"
      :data-display-root="edged ? b.id : undefined"
    >
      <span class="pane-band-mark" :title="markLabel(b)" :aria-label="markLabel(b)" role="img" :data-display-chrome="edged ? '' : undefined" data-pane-band-mark>▍表示</span>
      <DisplayTray v-if="tray && tray.row === 'band' && tray.hostBandId === b.id" :pane-id="paneId" :buttons="tray.buttons" />
      <DisplayScriptMark v-if="!edged" :info="b" part="mark" class="pane-band-script-mark" />
      <span v-if="store.focusedDisplayId === b.id" class="pane-band-engaged-note" aria-live="polite" :title="engagedNote(b)" data-pane-band-engaged-note>
        {{ engagedNote(b) }}
      </span>
      <div class="pane-band-frame">
        <DisplayFrame :key="placedFrameKey(b, slot)" :info="b" :content="store.contents.get(b.id)" />
      </div>
      <span class="pane-band-actions" :data-display-chrome="edged ? '' : undefined" :data-display-head="edged ? '' : undefined" @keydown="edged ? onRowKey($event, b.paneId) : undefined">
        <DisplayScriptMark v-if="edged" :info="b" part="mark" class="pane-band-script-mark" />
        <DisplayScriptMark :info="b" part="button" />
        <DisplayScriptMark :info="b" part="end" />
        <button
          v-if="edged"
          type="button"
          class="pane-band-close"
          aria-label="この表示のメニュー"
          title="メニュー"
          aria-haspopup="menu"
          data-display-menu-button
          data-display-keepfocus
          @mousedown.prevent
          @click="onMenu(b.id, $event)"
        >
          ⋮
        </button>
        <button
          type="button"
          class="pane-band-close"
          aria-label="この表示を閉じる"
          title="この表示を閉じる"
          data-pane-band-close
          :data-display-keepfocus="edged ? '' : undefined"
          @mousedown="edged ? $event.preventDefault() : undefined"
          @click="edged ? onClose(b) : controller?.dismiss({ id: b.id })"
        >
          ×
        </button>
      </span>
      <div class="pane-band-ring" aria-hidden="true"></div>
    </div>
    <button
      v-if="hidden.length > 0"
      type="button"
      class="pane-bands-more"
      :style="{ height: `${BANDS_MORE_ROW_PX}px` }"
      data-pane-bands-more
      :data-display-chrome="edged ? '' : undefined"
      :data-display-keepfocus="edged ? '' : undefined"
      @mousedown="edged ? $event.preventDefault() : undefined"
      @click="showHidden"
    >
      ほか {{ hidden.length }} 件
    </button>
  </div>
</template>

<style scoped>
.pane-bands {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pane-tray-row {
  flex: none;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: var(--soda-bg, #1e1f29);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
/* 帯の枠は、トレイと右端のボタンの残りを使い、いちばん先に縮む（枠 → トレイ）。 */
.pane-band {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  min-width: 0;
  background: var(--soda-bg, #1e1f29);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.pane-band-mark {
  flex: none;
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: 0.7em;
  font-weight: bold;
  white-space: nowrap;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-border, #44475a);
}
.pane-band-actions {
  flex: none;
  display: flex;
  align-items: center;
}
.pane-band-engaged-note {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.pane-band-frame {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.pane-band-close {
  flex: none;
  align-self: stretch;
  box-sizing: border-box;
  min-width: 24px;
  padding-top: 0;
  padding-bottom: 0;
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.pane-band-close:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.pane-band-close:focus-visible,
.pane-bands-more:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.pane-band-ring {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border: 2px solid transparent;
  pointer-events: none;
}
.pane-band-engaged .pane-band-ring {
  border-color: var(--soda-accent, #6070a1);
}
.pane-bands-more {
  flex: none;
  font: inherit;
  font-size: 0.7em;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-border, #44475a);
  border: 0;
  cursor: pointer;
}
</style>
