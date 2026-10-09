<script setup lang="ts">
/**
 * 画面の切り替えの部品（20261008-graph-first の AC-S3・AC-S6）。サイドバーの上に置く。**ボタンは画面の一覧（`screens/screens.ts`）から作る**——3 つ目以降の画面が一覧に
 * 足されれば、ここに自然に増える。押すと `view.setScreen`。選んでいる workspace・tab・pane は変わらない（同じ実体の見せ方）。
 */
import { SCREENS } from "../screens/screens.js";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
</script>

<template>
  <div class="screen-switcher" :class="{ 'screen-switcher-collapsed': view.sidebarCollapsed }" role="group" aria-label="画面の切り替え">
    <button
      v-for="def in SCREENS"
      :key="def.id"
      type="button"
      class="screen-switcher-btn"
      :class="{ 'screen-switcher-btn-active': view.screen === def.id }"
      :data-screen-id="def.id"
      :aria-pressed="view.screen === def.id"
      :aria-label="view.sidebarCollapsed ? def.label : undefined"
      :title="def.label"
      @click="view.setScreen(def.id)"
    >
      {{ view.sidebarCollapsed ? def.shortLabel : def.label }}
    </button>
  </div>
</template>

<style scoped>
.screen-switcher {
  display: flex;
  gap: 2px;
  padding: 0.3em 0.4em;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.screen-switcher-collapsed {
  flex-direction: column;
  padding: 0.3em 0.2em;
}
.screen-switcher-btn {
  flex: 1 1 0;
  min-width: 0;
  font: inherit;
  font-size: 0.8em;
  color: var(--soda-fg, #f8f8f2);
  background: none;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-s);
  padding: 0.2em 0.3em;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.screen-switcher-collapsed .screen-switcher-btn {
  /* 縦並びでは `flex: 1 1 0` の基準が高さ 0 になり、ボタンが枠だけの細い線になる */
  flex: none;
}
.screen-switcher-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.screen-switcher-btn-active {
  background: var(--soda-menu-active-bg, #44475a);
}
</style>
