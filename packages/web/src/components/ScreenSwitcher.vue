<script setup lang="ts">
/**
 * 画面の切り替えの部品（20261008-graph-first の AC-S3・AC-S6）。サイドバーの上に置く。**ボタンは画面の一覧（`screens/screens.ts`）から作る**——3 つ目以降の画面が一覧に
 * 足されれば、ここに自然に増える。押すと `view.setScreen`。選んでいる workspace・tab・pane は変わらない（同じ実体の見せ方）。
 */
import { computed,ref,inject,onMounted,onBeforeUnmount } from "vue";
import { LocalClientFactoryKey } from "../injection.js";
import { analyticsSelected } from "../dashboard/navigation.js";
import { SCREENS, type ScreenDef } from "../screens/screens.js";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
const primary=SCREENS.filter(d=>["base","graph","dashboard"].includes(d.id));
const extra=SCREENS.filter(d=>!["base","graph","dashboard"].includes(d.id));
const current=computed(()=>extra.find(d=>d.id===view.screen));
const menuOpen=ref(false),button=ref<HTMLButtonElement|null>(null),menu=ref<HTMLElement|null>(null),left=ref(0),top=ref(0),pending=ref(0);
const factory=inject(LocalClientFactoryKey,null),local=factory?.(()=>void count());
let timer:ReturnType<typeof setInterval>|undefined;
async function count(){try{if(local)pending.value=(await local.request("machine.pairing_requests",{})).requests.length;}catch{pending.value=0;}}
function toggle(){const rect=button.value?.getBoundingClientRect();if(rect){left.value=Math.max(0,Math.min(rect.left,window.innerWidth-220));top.value=rect.bottom;}menuOpen.value=!menuOpen.value;}
function outside(e:PointerEvent){if(!menu.value?.contains(e.target as Node)&&!button.value?.contains(e.target as Node))menuOpen.value=false;}
onMounted(()=>{local?.start();timer=setInterval(()=>void count(),5000);document.addEventListener("pointerdown",outside);});
onBeforeUnmount(()=>{local?.stop();if(timer)clearInterval(timer);document.removeEventListener("pointerdown",outside);});

/** 正式な名前（`title` が無ければ `label`）。短い名前のボタンに、正式な名前を添える。 */
function fullName(def: ScreenDef): string {
  return def.title ?? def.label;
}
</script>

<template>
  <div
    class="screen-switcher"
    :class="{ 'screen-switcher-collapsed': view.sidebarCollapsed }"
    role="group"
    aria-label="画面の切り替え"
  >
    <button
      v-for="def in primary"
      :key="def.id"
      type="button"
      class="screen-switcher-btn"
      :class="{ 'screen-switcher-btn-active': view.screen === def.id }"
      :data-screen-id="def.id"
      :aria-pressed="view.screen === def.id"
      :aria-label="(def as ScreenDef).title ?? (view.sidebarCollapsed ? def.label : undefined)"
      :title="fullName(def)"
      @click="analyticsSelected = false; view.setScreen(def.id)"
    >
      <span class="screen-switcher-label">{{
        view.sidebarCollapsed ? def.shortLabel : def.label
      }}</span>
    </button>
    <button ref="button" class="screen-switcher-btn" :class="{'screen-switcher-btn-active':current}" data-screen-more aria-haspopup="true" :aria-expanded="menuOpen" :title="current?.label??'その他の画面'" @click="toggle" @keydown.esc="menuOpen=false">
      <span class="screen-switcher-label">{{view.sidebarCollapsed?(current?.shortLabel??'他'):(current?.label??'その他')}} ▾<span v-if="pending" class="screen-pending"> {{pending}}</span></span>
    </button>
    <Teleport to="body"><nav v-if="menuOpen" ref="menu" class="screen-extra-menu" :style="{left:left+'px',top:top+'px'}" aria-label="その他の画面" @keydown.esc="menuOpen=false;button?.focus()"><button data-usage-analytics @click="analyticsSelected=true;view.openDashboard();menuOpen=false;button?.focus()">エージェント利用分析</button><button v-for="def in extra" :key="def.id" :data-screen-id="def.id" :aria-current="view.screen===def.id?'page':undefined" @click="view.setScreen(def.id);menuOpen=false;button?.focus()">{{def.label}}<span v-if="def.id==='connections'&&pending">（{{pending}}）</span></button></nav></Teleport>
  </div>
</template>

<style scoped>
/*
 * 見た目（20261008-ui-style PR6 の AC25・AC26）。**クラシックは、tab バー（`TabBar.vue`）の tab と同じ言葉**にそろえる: 文字は継承（1em）・左右 1em の余白・地なし・
 * 右に区切りの線・選んでいるものは `--soda-menu-active-bg`・帯の地は `--soda-menu-bg`・角なし・押さえた時の地の変化なし。**モダンは逆に、tab のほうがこのボタンの形**
 * （区切られた丸いボタンの並び）で、数値は `uiStyle.css` の `--soda-shape-seg-*` を、このボタンと tab が共有する（下の `:root[data-ui-style="modern"]` の規則）。
 *
 * クラシックは tab と同じ 1em の文字・上下 0.5em の余白で高さを決める。
 * 幅に合わせてラベルを縮めても高さが変わらないよう、幅0の ::before が基準の箱を持つ。
 */
.screen-switcher {
  display: flex;
  container-type: inline-size;
  background: var(--soda-menu-bg, #282a36);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.screen-switcher::before {
  content: "\200b";
  flex: none;
  width: 0;
  visibility: hidden;
  font: inherit;
  padding: 0.5em 0;
}
.screen-switcher-collapsed {
  flex-direction: column;
  padding: 0.3em 0.2em;
}
.screen-switcher-collapsed::before {
  display: none;
}
.screen-switcher-btn {
  /* 全画面のボタンで利用可能な幅を均等に分け、サイドバーの幅変更に追従する。 */
  flex: 1 1 0;
  justify-content: center;
  display: flex;
  align-items: center;
  align-self: stretch;
  min-width: 0;
  /* 最長3文字の名前と区切り線を先に確保し、余った幅だけ左右余白に使う。 */
  padding: 0 min(0.6em, max(2px, calc(12.5cqw - 1.5em - 0.5px)));
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
/* 名前が入りきらないときは、省略記号で切る（ボタンは flex なので、名前を包んで効かせる）。 */
.screen-switcher-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 最小幅では文字も縮め、グラフ（3文字）まで4つの名前を同じ行に収める。 */
:root[data-ui-style="classic"]
  .screen-switcher:not(.screen-switcher-collapsed)
  .screen-switcher-label {
  font-size: min(1em, calc((25cqw - 6px) / 3));
}
.screen-switcher-collapsed .screen-switcher-btn {
  flex: none;
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
  padding: var(--soda-shape-seg-pad-y) var(--soda-shape-seg-pad-x);
  border: var(--soda-shape-seg-border) solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-seg-radius);
}
:root[data-ui-style="modern"]
  .screen-switcher-collapsed
  .screen-switcher-btn
  + .screen-switcher-btn {
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
.screen-extra-menu{position:fixed;z-index:10000;display:grid;min-width:180px;max-width:calc(100vw - 8px);padding:4px;background:var(--soda-menu-bg,#282a36);border:1px solid var(--soda-menu-border,#44475a);border-radius:4px;box-shadow:0 4px 12px #0005}
.screen-extra-menu button{font:inherit;padding:8px 12px;text-align:left;border:0;color:var(--soda-fg,#f8f8f2);background:transparent;cursor:pointer}.screen-extra-menu button:hover,.screen-extra-menu button:focus-visible{background:var(--soda-menu-active-bg,#44475a)}.screen-pending{color:var(--soda-warn-fg,#ffb86c)}
</style>
