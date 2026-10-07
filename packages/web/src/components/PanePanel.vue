<script setup lang="ts">
import { computed, inject, nextTick, ref } from "vue";
import { panelWidth } from "../display/displayLayout.js";
import { frameKey } from "../display/framePage.js";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import DisplayFrame from "./DisplayFrame.vue";

/**
 * pane の右に出すパネル（表示の面 `--kind panel`。20261007-soda-extensions の design「ブラウザ」）。
 * - 見出しの固定のラベルは**アプリが描く**（面の名前は `[A-Za-z0-9_-]` だけ。題は `textContent`）。題・中身からラベルの文言・位置・色は変えられない。
 * - 複数あればタブ（`role="tablist"`。矢印・`Home`・`End`）。たたむと幅 24px の見出しだけ。［×］で利用者が閉じる。
 * - 枠にフォーカスがある間は「操作中」を縁と文言で示す（備え (a)）。
 */
const props = defineProps<{ paneId: string; paneWidthPx: number; cellWidthPx: number }>();

const store = useDisplayStore();
const controller = inject(DisplayControllerKey, null);

const panels = computed(() => store.panelsOf(props.paneId));
const active = computed(() => store.activePanelOf(props.paneId));
const collapsedByUser = computed(() => store.collapsed.has(props.paneId));
const sized = computed(() => panelWidth(props.paneWidthPx, active.value?.size ?? 320, props.cellWidthPx));
/** たたむ（利用者がたたんだ・pane が狭くて出せない）。 */
const folded = computed(() => collapsedByUser.value || sized.value.autoCollapsed);
const engaged = computed(() => store.focusedDisplayId !== null && panels.value.some((p) => p.id === store.focusedDisplayId));
const content = computed(() => (active.value ? store.contents.get(active.value.id) : undefined));
const rootStyle = computed(() => {
  const w = folded.value ? 24 : sized.value.width;
  return { flex: `0 0 ${w}px`, width: `${w}px` };
});

function select(id: string): void {
  store.setActivePanel(props.paneId, id);
}
function dismiss(id: string): void {
  controller?.dismiss({ id });
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
    v-if="panels.length > 0 && active"
    class="pane-panel"
    :class="{ 'pane-panel-folded': folded, 'pane-panel-engaged': engaged }"
    :style="rootStyle"
    role="complementary"
    :aria-label="`pane のプログラムの表示（隔離）· ${active.name}`"
    data-pane-panel
    :data-display-engaged="engaged ? '1' : '0'"
  >
    <button
      v-if="folded"
      type="button"
      class="pane-panel-unfold"
      :aria-label="`表示パネルを広げる（${active.name}）`"
      :disabled="sized.autoCollapsed"
      :title="sized.autoCollapsed ? 'pane が狭いので、パネルを出せません' : 'パネルを広げる'"
      data-pane-panel-unfold
      @click="store.setCollapsed(paneId, false)"
    >
      表示 ({{ panels.length }})
    </button>
    <template v-else>
      <div class="pane-panel-head">
        <div class="pane-panel-label" data-pane-panel-label>pane のプログラムの表示（隔離）· {{ active.name }}</div>
        <div class="pane-panel-actions">
          <button type="button" class="pane-panel-btn" aria-label="パネルをたたむ" title="たたむ" data-pane-panel-fold @click="store.setCollapsed(paneId, true)">▸</button>
          <button type="button" class="pane-panel-btn" aria-label="この表示を閉じる" title="この表示を閉じる" data-pane-panel-close @click="dismiss(active.id)">×</button>
        </div>
      </div>
      <div v-if="panels.length > 1" class="pane-panel-tabs" role="tablist" aria-label="パネルの一覧" @keydown="onTabKey">
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
      <div v-if="engaged" class="pane-panel-engaged-note" aria-live="polite" data-pane-panel-engaged-note>入力はこの表示に届きます（Esc で端末へ）</div>
      <div class="pane-panel-body">
        <DisplayFrame :key="frameKey(active)" :info="active" :content="content" />
      </div>
    </template>
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
  border-left: 1px solid var(--soda-menu-border, #44475a);
}
.pane-panel-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  background: var(--soda-menu-border, #44475a);
  font-size: 0.75em;
}
.pane-panel-label {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pane-panel-actions {
  flex: none;
  display: flex;
  gap: 2px;
}
.pane-panel-btn {
  font: inherit;
  min-width: 24px;
  min-height: 24px;
  padding: 0 6px;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
}
.pane-panel-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.pane-panel-btn:focus-visible,
.pane-panel-tab:focus-visible,
.pane-panel-unfold:focus-visible {
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
}
.pane-panel-unfold {
  flex: 1 1 auto;
  width: 100%;
  padding: 8px 0;
  font: inherit;
  font-size: 0.75em;
  writing-mode: vertical-rl;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-menu-border, #44475a);
  border: 0;
  cursor: pointer;
}
.pane-panel-unfold:disabled {
  cursor: default;
  opacity: 0.6;
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
