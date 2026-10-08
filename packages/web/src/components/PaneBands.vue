<script setup lang="ts">
import { computed, inject } from "vue";
import { visibleBands, BANDS_MORE_ROW_PX } from "../display/displayLayout.js";
import { displayBandLabel, engagedNote } from "../display/displayLabel.js";
import { frameKey } from "../display/framePage.js";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayFrame from "./DisplayFrame.vue";
import DisplayScriptMark from "./DisplayScriptMark.vue";

/**
 * pane の上に出す帯（表示の面 `--kind band`。20261007-soda-extensions の design「ブラウザ」）。1 本ごとに左端に固定の印「▍表示」（アプリが描く）・枠・［×］。
 * 高さの合計が pane の高さの 3 分の 1 を超える分は、「ほか N 件」の 1 行にまとめる。
 */
const props = defineProps<{ paneId: string; paneHeightPx: number }>();

const store = useDisplayStore();
const view = useViewStore();
const controller = inject(DisplayControllerKey, null);

const bands = computed(() => store.bandsOf(props.paneId));
const split = computed(() => visibleBands(bands.value.map((b) => b.size), props.paneHeightPx));
const shown = computed(() => bands.value.slice(0, split.value.shown));
const hidden = computed(() => bands.value.slice(split.value.shown));
const engaged = computed(() => store.focusedDisplayId !== null && bands.value.some((b) => b.id === store.focusedDisplayId));

const markLabel = displayBandLabel;
function showHidden(): void {
  view.toast(`ほかの帯 ${hidden.value.length} 件: ${hidden.value.map((b) => b.name).join("、")}`);
}
</script>

<template>
  <div v-if="bands.length > 0" class="pane-bands" :class="{ 'pane-bands-engaged': engaged }" data-pane-bands>
    <div
      v-for="b in shown"
      :key="b.id"
      class="pane-band"
      :class="{ 'pane-band-engaged': store.focusedDisplayId === b.id }"
      :style="{ height: `${b.size}px` }"
      data-pane-band
      :data-display-name="b.name"
    >
      <span class="pane-band-mark" :title="markLabel(b)" :aria-label="markLabel(b)" role="img" data-pane-band-mark>▍表示</span>
      <DisplayScriptMark :info="b" part="mark" class="pane-band-script-mark" />
      <span v-if="store.focusedDisplayId === b.id" class="pane-band-engaged-note" aria-live="polite" :title="engagedNote(b)" data-pane-band-engaged-note>
        {{ engagedNote(b) }}
      </span>
      <div class="pane-band-frame">
        <DisplayFrame :key="frameKey(b)" :info="b" :content="store.contents.get(b.id)" />
      </div>
      <DisplayScriptMark :info="b" part="button" />
      <DisplayScriptMark :info="b" part="end" />
      <button type="button" class="pane-band-close" aria-label="この表示を閉じる" title="この表示を閉じる" data-pane-band-close @click="controller?.dismiss({ id: b.id })">×</button>
      <div class="pane-band-ring" aria-hidden="true"></div>
    </div>
    <button v-if="hidden.length > 0" type="button" class="pane-bands-more" :style="{ height: `${BANDS_MORE_ROW_PX}px` }" data-pane-bands-more @click="showHidden">
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
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: 0.7em;
  font-weight: bold;
  white-space: nowrap;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-border, #44475a);
}
.pane-band-engaged-note {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.pane-band-frame {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.pane-band-close {
  flex: none;
  min-width: 24px;
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
