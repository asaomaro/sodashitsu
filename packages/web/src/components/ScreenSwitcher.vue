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
/*
 * 見た目（20261008-ui-style PR6 の AC25・AC26）。**クラシックは、tab バー（`TabBar.vue`）の tab と同じ見た目**にそろえる: 文字は継承・上下 0.5em／左右 1em の余白・
 * 地なし・右に区切りの線・選んでいるものは `--soda-menu-active-bg`・帯の地は `--soda-menu-bg`。**モダンは逆に、tab のほうがこのボタンの形**（区切られた丸いボタンの並び）で、
 * 数値は `uiStyle.css` の `--soda-shape-seg-*` を、このボタンと tab が共有する（下の `:root[data-ui-style="modern"]` の規則）。
 */
.screen-switcher {
  display: flex;
  background: var(--soda-menu-bg, #282a36);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.screen-switcher-collapsed {
  flex-direction: column;
}
.screen-switcher-btn {
  flex: none;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0.5em 1em;
  min-height: var(--soda-shape-control-h, auto);
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
  background: none;
  border: none;
  border-right: 1px solid var(--soda-menu-border, #44475a);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.screen-switcher-collapsed .screen-switcher-btn {
  /* たたんだ幅（縦並び）。短い名前を、幅いっぱいの中央に。区切りは下の線。 */
  justify-content: center;
  padding: 0.5em 0.2em;
  border-right: none;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.screen-switcher-collapsed .screen-switcher-btn:last-child {
  border-bottom: none;
}
.screen-switcher-btn-active {
  background: var(--soda-menu-active-bg, #44475a);
}
/* モダン: 区切られた丸いボタンの並び。形の数値は tab と共有（`--soda-shape-seg-*`）。 */
:root[data-ui-style="modern"] .screen-switcher {
  gap: var(--soda-shape-seg-gap);
  padding: var(--soda-shape-seg-bar-pad-y) var(--soda-shape-seg-bar-pad-x);
}
:root[data-ui-style="modern"] .screen-switcher-collapsed {
  padding: var(--soda-shape-seg-bar-pad-y) 0.2em;
}
:root[data-ui-style="modern"] .screen-switcher-btn {
  flex: 1 1 0;
  justify-content: center;
  font-size: var(--soda-shape-seg-font);
  padding: var(--soda-shape-seg-pad-y) var(--soda-shape-seg-pad-x);
  border: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-seg-radius);
}
:root[data-ui-style="modern"] .screen-switcher-collapsed .screen-switcher-btn {
  /* 縦並びでは `flex: 1 1 0` の基準が高さ 0 になり、ボタンが枠だけの細い線になる */
  flex: none;
  border: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
}
:root[data-ui-style="modern"] .screen-switcher-collapsed .screen-switcher-btn:last-child {
  border-bottom: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
}
:root[data-ui-style="modern"] .screen-switcher-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
:root[data-ui-style="modern"] .screen-switcher-btn-active {
  background: var(--soda-menu-active-bg, #44475a);
}
</style>
