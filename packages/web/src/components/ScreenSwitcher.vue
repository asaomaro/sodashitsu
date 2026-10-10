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
      <span class="screen-switcher-label">{{ view.sidebarCollapsed ? def.shortLabel : def.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/*
 * 見た目（20261008-ui-style PR6 の AC25・AC26）。**クラシックは、tab バー（`TabBar.vue`）の tab と同じ言葉**にそろえる: 文字は継承（1em）・左右 1em の余白・地なし・
 * 右に区切りの線・選んでいるものは `--soda-menu-active-bg`・帯の地は `--soda-menu-bg`・角なし・押さえた時の地の変化なし。**モダンは逆に、tab のほうがこのボタンの形**
 * （区切られた丸いボタンの並び）で、数値は `uiStyle.css` の `--soda-shape-seg-*` を、このボタンと tab が共有する（下の `:root[data-ui-style="modern"]` の規則）。
 *
 * **クラシックで変えてよいのは、このボタンの矩形の中だけ**。そこで、帯の外形の高さは、これまでの形（上下 0.3em の余白＋ 0.8em の文字のボタン＋線）と**同じ**に保つ:
 * `::before` に、これまでと同じ箱（見えない。幅 0）を 1 つ置き、帯の高さをそれが決める。ボタンはその高さいっぱいに伸びる（tab が帯の高さいっぱいに伸びるのと同じ）。
 */
.screen-switcher {
  display: flex;
  background: var(--soda-menu-bg, #282a36);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.screen-switcher::before {
  content: "\200b";
  flex: none;
  width: 0;
  visibility: hidden;
  font-size: 0.8em;
  /* これまでの帯: 上下 0.3em（親の文字の大きさ）の余白の中に、0.8em の文字・上下 0.2em の余白・線 1px のボタン。この箱は 0.8em の文字なので、余白は 0.3/0.8 em。 */
  margin: 0.375em 0;
  padding: 0.2em 0;
  border: 1px solid transparent;
}
.screen-switcher-collapsed {
  flex-direction: column;
  padding: 0.3em 0.2em;
}
.screen-switcher-collapsed::before {
  display: none;
}
.screen-switcher-btn {
  /* 3 つ目の画面（ダッシュボード）が増えても、狭いサイドバー（既定 240px）で、はみ出して端末の領域に隠れないよう、縮められる（はみ出す分は省略記号）。 */
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  align-self: stretch;
  min-width: 0;
  padding: 0 1em;
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
/* 名前が入りきらないとき（狭いサイドバーの「ダッシュボード」）は、省略記号で切る（ボタンは flex なので、名前を包んで効かせる）。 */
.screen-switcher-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.screen-switcher-collapsed .screen-switcher-btn {
  /* たたんだ幅（縦並び）は、これまでの箱の大きさを保つ（0.8em の文字・上下 0.2em・線 1px）。塗りだけを tab の言葉に（平ら・区切りは下の線）。 */
  align-self: auto;
  justify-content: center;
  font-size: 0.8em;
  padding: 0.2em 0.3em;
  border: 1px solid transparent;
  border-bottom-color: var(--soda-menu-border, #44475a);
  min-height: var(--soda-shape-control-h, auto);
}
.screen-switcher-collapsed .screen-switcher-btn + .screen-switcher-btn {
  margin-top: 2px;
}
.screen-switcher-btn-active {
  background: var(--soda-menu-active-bg, #44475a);
}
/* モダン: 区切られた丸いボタンの並び。形の数値は tab と共有（`--soda-shape-seg-*`）。 */
:root[data-ui-style="modern"] .screen-switcher {
  gap: var(--soda-shape-seg-gap);
  padding: var(--soda-shape-seg-bar-pad-y) var(--soda-shape-seg-bar-pad-x);
}
:root[data-ui-style="modern"] .screen-switcher::before {
  display: none;
}
:root[data-ui-style="modern"] .screen-switcher-collapsed {
  padding: var(--soda-shape-seg-bar-pad-y) 0.2em;
}
:root[data-ui-style="modern"] .screen-switcher-btn {
  flex: 1 1 0;
  align-self: auto;
  min-height: var(--soda-shape-control-h, auto);
  justify-content: center;
  font-size: var(--soda-shape-seg-font);
  padding: var(--soda-shape-seg-pad-y) min(var(--soda-shape-seg-pad-x), 0.25em);
  border: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-seg-radius);
}
:root[data-ui-style="modern"] .screen-switcher-collapsed .screen-switcher-btn + .screen-switcher-btn {
  margin-top: 0; /* すき間は、帯の gap が持つ */
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
