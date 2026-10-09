<script setup lang="ts">
/**
 * 探す（20261008-graph-first の PR1d T12b。ツールバーの入力）。候補は `findCandidates`（空間をまたぐ。20 件まで）。上下のキーで選び、Enter で決める。`Esc` で閉じて、面へフォーカスを戻す（`leave`）。
 * **入力にフォーカスがある間、グラフのキーは働かない**（文字として入る）: keydown を、ここで止める。IME の変換中の Enter・矢印では決めない・動かない。
 */
import { computed, nextTick, ref, watch } from "vue";
import { findCandidates, type FindItem } from "./findCandidates.js";

const props = defineProps<{ items: readonly FindItem[] }>();
const emit = defineEmits<{ choose: [item: FindItem]; leave: [] }>();

const query = ref("");
const active = ref(0);
const open = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const results = computed(() => findCandidates(props.items, query.value));
watch(results, () => {
  active.value = 0;
});
// ↑ ↓ で選んだ行が、一覧の見える範囲の外へ出たら、スクロールして見せる（PR1d レビュー S2）。
watch(active, () => {
  void nextTick(() => document.getElementById(`graph-find-opt-${active.value}`)?.scrollIntoView?.({ block: "nearest" }));
});

function focus(): void {
  inputEl.value?.focus();
  inputEl.value?.select();
}
defineExpose({ focus });

function choose(item: FindItem | undefined): void {
  if (!item) return;
  open.value = false;
  query.value = "";
  emit("choose", item);
}
function onKeydown(ev: KeyboardEvent): void {
  // 渡さない（要る。消さない）: 根の Esc の処理（`escape()`）が、ここの Esc（面へ戻る）のあとに二重に走って、選んでいるノードを外してしまうのを防ぐ。文字はグラフのキーにならず入力に入る
  // （根の `isTextField` の守りもあるが、Esc はその手前で処理されるので、ここで止める）。`main.ts` の window のキー処理へも渡さない。
  ev.stopPropagation();
  if (ev.isComposing || ev.keyCode === 229) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    open.value = false;
    query.value = "";
    emit("leave");
  } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    if (results.value.length === 0) return;
    open.value = true;
    const n = results.value.length;
    active.value = (active.value + (ev.key === "ArrowDown" ? 1 : n - 1)) % n;
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    choose(results.value[active.value]);
  }
}
</script>

<template>
  <div class="graph-find" data-graph-find>
    <input
      ref="inputEl"
      v-model="query"
      type="text"
      class="graph-find-input"
      role="combobox"
      aria-label="探す（pane・エージェント・workspace・tab の名前）"
      aria-autocomplete="list"
      :aria-controls="open && results.length > 0 ? 'graph-find-list' : undefined"
      :aria-expanded="open && results.length > 0"
      :aria-activedescendant="open && results.length > 0 ? `graph-find-opt-${active}` : undefined"
      placeholder="探す（/）"
      autocomplete="off"
      spellcheck="false"
      @focus="open = true"
      @input="open = true"
      @blur="open = false"
      @keydown="onKeydown"
      @keyup.stop
    />
    <ul v-if="open && results.length > 0" id="graph-find-list" class="graph-find-list" role="listbox" aria-label="探す候補" @pointerdown.prevent>
      <li
        v-for="(r, i) in results"
        :id="`graph-find-opt-${i}`"
        :key="`${r.kind}:${r.target}`"
        class="graph-find-item"
        :class="{ 'graph-find-item-active': i === active }"
        role="option"
        :aria-selected="i === active"
        :data-find-kind="r.kind"
        @click="choose(r)"
        @mousemove="active = i"
      >
        <span class="graph-find-kind">{{ r.kind === "pane" ? "pane" : "workspace" }}</span>
        <span class="graph-find-label">{{ r.label }}</span>
        <span class="graph-find-sub">{{ r.sub }}</span>
      </li>
    </ul>
    <p v-else-if="open && query.trim() !== ''" class="graph-find-none">見つかりません</p>
    <span class="graph-find-status" role="status" aria-live="polite">{{ open && query.trim() !== "" ? (results.length === 0 ? "見つかりません" : `${results.length} 件`) : "" }}</span>
  </div>
</template>

<style scoped>
.graph-find {
  position: relative;
}
.graph-find-input {
  box-sizing: border-box;
  width: 14em;
  min-height: var(--soda-shape-control-h, 22px);
  padding: 0 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font: inherit;
  font-size: 12px;
}
.graph-find-input:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 0;
}
.graph-find-list,
.graph-find-none {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 5;
  min-width: 24em;
  max-height: 22em;
  margin: 2px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l, 6px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
}
.graph-find-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.graph-find-none {
  padding: 6px 10px;
  opacity: 0.8;
}
.graph-find-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.graph-find-item-active {
  background: var(--soda-menu-active-bg, #44475a);
}
.graph-find-kind {
  flex: none;
  min-width: 5.5em;
  font-size: 10px;
  opacity: 0.75;
}
.graph-find-label {
  flex: none;
  font-weight: bold;
}
.graph-find-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  opacity: 0.75;
}
</style>
