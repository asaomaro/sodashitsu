<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref } from "vue";
import DisplayFrame from "../components/DisplayFrame.vue";
import DisplayScriptMark from "../components/DisplayScriptMark.vue";
import { displayLabel, displayLabelPrefix, engagedNote, DISPLAY_LABEL_PREFIX } from "../display/displayLabel.js";
import { placedFrameKey } from "../display/framePage.js";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";

/**
 * モバイルの表示のパネルの重ね表示（20261007-soda-extensions の design「ブラウザ」）。モバイルには端末の横に置く場所が無いので、バーのボタンから `<dialog>` で開く。
 * 上に固定のラベル・タブ・［閉じる］（シートだけ閉じる。面は残る）・［この表示を消す］（`dismiss`）、下に枠。幅のつまみは出さない。
 */
const props = defineProps<{ paneId: string }>();
const emit = defineEmits<{ close: [] }>();

const store = useDisplayStore();
const controller = inject(DisplayControllerKey, null);
const dlg = ref<HTMLDialogElement | null>(null);

const panels = computed(() => store.panelsOf(props.paneId));
const active = computed(() => store.activePanelOf(props.paneId));
const content = computed(() => (active.value ? store.contents.get(active.value.id) : undefined));
const engaged = computed(() => store.focusedDisplayId !== null && panels.value.some((p) => p.id === store.focusedDisplayId));

onMounted(() => {
  const el = dlg.value;
  if (!el) return;
  if (typeof el.showModal === "function") el.showModal();
  else el.setAttribute("open", "");
});

function onTabKey(ev: KeyboardEvent): void {
  const list = panels.value;
  const n = list.length;
  const cur = Math.max(0, list.findIndex((p) => p.id === active.value?.id));
  const to = ev.key === "ArrowRight" ? (cur + 1) % n : ev.key === "ArrowLeft" ? (cur + n - 1) % n : ev.key === "Home" ? 0 : ev.key === "End" ? n - 1 : -1;
  if (to < 0) return;
  ev.preventDefault();
  const next = list[to];
  if (!next) return;
  store.setActivePanel(props.paneId, next.id);
  void nextTick(() => (document.getElementById(`mobile-display-tab-${next.id}`) as HTMLElement | null)?.focus());
}
function dismissActive(): void {
  if (!active.value) return;
  controller?.dismiss({ id: active.value.id });
  if (panels.value.length <= 1) emit("close");
}
</script>

<template>
  <dialog ref="dlg" class="mobile-display-sheet" :aria-label="active ? displayLabelPrefix(active) : DISPLAY_LABEL_PREFIX" data-mobile-display-sheet @close="emit('close')" @cancel.prevent="emit('close')">
    <div v-if="active" class="mobile-display-box" :class="{ 'mobile-display-engaged': engaged }">
      <div class="mobile-display-head">
        <div class="mobile-display-label" data-mobile-display-label><DisplayScriptMark :info="active" part="mark" />{{ displayLabel(active) }}</div>
        <DisplayScriptMark :info="active" part="button" />
        <DisplayScriptMark :info="active" part="end" />
        <button type="button" class="mobile-display-btn" data-mobile-display-dismiss @click="dismissActive">この表示を消す</button>
        <button type="button" class="mobile-display-btn" data-mobile-display-close @click="emit('close')">閉じる</button>
      </div>
      <div v-if="panels.length > 1" class="mobile-display-tabs" role="tablist" aria-label="パネルの一覧" @keydown="onTabKey">
        <button
          v-for="p in panels"
          :id="`mobile-display-tab-${p.id}`"
          :key="p.id"
          type="button"
          role="tab"
          class="mobile-display-tab"
          :aria-selected="p.id === active.id ? 'true' : 'false'"
          :tabindex="p.id === active.id ? 0 : -1"
          @click="store.setActivePanel(paneId, p.id)"
        >
          {{ p.title }}
        </button>
      </div>
      <div v-else class="mobile-display-title">{{ active.title }}</div>
      <div v-if="engaged" class="mobile-display-engaged-note" aria-live="polite">{{ engagedNote(active) }}</div>
      <div class="mobile-display-body">
        <DisplayFrame :key="placedFrameKey(active, 'sheet')" :info="active" :content="content" />
      </div>
    </div>
    <p v-else class="mobile-display-empty">表示はありません。<button type="button" class="mobile-display-btn" @click="emit('close')">閉じる</button></p>
  </dialog>
</template>

<style scoped>
.mobile-display-sheet {
  box-sizing: border-box;
  width: 100vw;
  max-width: 100vw;
  height: 85vh;
  max-height: 85vh;
  margin: auto 0 0;
  padding: 0;
  color: var(--soda-fg, #f8f8f2);
  background: var(--soda-bg, #1e1f29);
  border: 1px solid var(--soda-menu-border, #44475a);
}
.mobile-display-sheet::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.mobile-display-box {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  border: 2px solid transparent;
}
.mobile-display-engaged {
  border-color: var(--soda-accent, #6070a1);
}
.mobile-display-head {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 6px;
  background: var(--soda-menu-border, #44475a);
  font-size: 0.8em;
}
/* 固定のラベルは切らずに全部見せる（狭い画面では 1 行を占めて、ボタンは次の行）。 */
.mobile-display-label {
  flex: 1 1 100%;
  min-width: 0;
  font-weight: bold;
  overflow-wrap: anywhere;
}
.mobile-display-btn {
  flex: none;
  min-height: 2rem;
  font: inherit;
  padding: 0.2em 0.7em;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
}
.mobile-display-tabs {
  flex: none;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding: 3px 6px 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.mobile-display-tab {
  font: inherit;
  font-size: 0.85em;
  padding: 0.3em 0.8em;
  color: inherit;
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  white-space: nowrap;
}
.mobile-display-tab[aria-selected="true"] {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.mobile-display-title {
  flex: none;
  padding: 3px 8px;
  font-size: 0.85em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.mobile-display-engaged-note {
  flex: none;
  padding: 2px 8px;
  font-size: 0.75em;
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.mobile-display-body {
  flex: 1 1 auto;
  min-height: 0;
}
.mobile-display-empty {
  padding: 1em;
}
</style>
