<script setup lang="ts">
import { computed, watch } from "vue";
import { useDisplayStore } from "../store/display.js";
import { useSettingsStore } from "../store/settings.js";
import { PREFIX_HELP_HINT_KEY, useViewStore } from "../store/view.js";

/**
 * トースト表示（T25）。`view.toasts` を並べ、クリックまたは一定時間で消す（design「短く表示する」）。
 * 「pane にフォーカスが入ったら一度だけ `ctrl+b ?` でキー一覧」の案内（design「フォーカスの抜け道
 * （WCAG 2.1.2）」）を、最初に pane へフォーカスが入ったときに一度だけ出す
 * （`localStorage` で「表示済み」を覚える。ブラウザをまたいでも二度と出さない）。
 * **キーは現在の割り当て（`settings.keymap.hintFor("help")`）から作る**（20260921-keybinding-customization の AC11）。キー一覧を開く割り当てが無ければ**出さず、表示済みにもしない**
 * （案内するキーが無いのに使い切らない。設定の節「キー」で割り当てたあと、次に別の pane へフォーカスが移ったとき〔または再読み込みのあと〕に出る）。
 */
const AUTO_DISMISS_MS = 4000;

const view = useViewStore();
const settings = useSettingsStore();
/**
 * 表示の面（パネル・帯）が 1 つでも出ているとき、知らせは**右下**へ寄せる。右上に置くと、面の見出し（固定のラベル・印「スクリプト」・［操作する］・［操作を終える］・［×］）に重なる。
 * スクリプトが動く面では、印が見えることが守りの一部なので、知らせが見出しを覆ってはならない（消えない知らせでも同じ）。
 */
const displays = useDisplayStore();
const low = computed(() => displays.all.length > 0);

function hasShownHint(): boolean {
  try {
    return localStorage.getItem(PREFIX_HELP_HINT_KEY) === "1";
  } catch {
    return true; // 読めない環境では、二度と邪魔しない側に倒す
  }
}
function markHintShown(): void {
  try {
    localStorage.setItem(PREFIX_HELP_HINT_KEY, "1");
  } catch {
    // 保存できなくても致命的ではない（次回また出るだけ）
  }
}

watch(
  () => view.focusedPaneId,
  (id) => {
    if (!id || hasShownHint()) return;
    const hint = settings.keymap.hintFor("help");
    if (hint === null) return;
    markHintShown();
    view.toast(`${hint} でキー一覧`);
  },
  { immediate: true },
);

// 新しく増えた toast だけに自動消去のタイマーを掛ける（同じ id に何度も掛けない）。
// **`sticky` には掛けない**（20260920-agent-notifications）——席を外している間に出た知らせが
// 4 秒で消えては意味が無い。消すのは利用者の操作か、`prefix+o` で対象へ移ったとき。
watch(
  () => view.toasts.map((t) => t.id),
  (ids, oldIds) => {
    const before = new Set(oldIds ?? []);
    for (const id of ids) {
      if (before.has(id)) continue;
      if (view.toasts.find((t) => t.id === id)?.kind === "sticky") continue;
      setTimeout(() => view.dismissToast(id), AUTO_DISMISS_MS);
    }
  },
);

function dismiss(id: number): void {
  view.dismissToast(id);
}
</script>

<template>
  <div class="toast-list" :class="{ 'toast-list-low': low }" role="status" aria-live="polite">
    <div v-for="t in view.toasts" :key="t.id" class="toast" :class="{ 'toast-sticky': t.kind === 'sticky', 'toast-wrap': t.wrap }" @click="dismiss(t.id)">
      <span class="toast-message" :title="t.kind === 'sticky' ? t.message : undefined">{{ t.message }}</span>
      <!-- 行動ボタンと閉じるボタンは `<button>`。既存のトーストは `<div>` で Tab の順に入らず、
           4 秒で消えるので実害が無かったが、**消えないトーストはキーボードで片付けられる必要がある**。
           本体のクリックは「消す」なので、ボタン側は `.stop` で食い止める。 -->
      <button v-for="a in t.actions" :key="a.label" type="button" class="toast-action" @click.stop="a.run()">{{ a.label }}</button>
      <button v-if="t.kind === 'sticky'" type="button" class="toast-close" aria-label="閉じる" @click.stop="dismiss(t.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
/*
 * 置き場所は**画面の右上**（20261005-notify-bell。以前は下・中央で、端末の入力欄に被さっていた）。古いものが上・新しいものが下に積む——
 * 新しいものを上に差し込むと、押そうとしている［移動］・［×］が下へずれる。下に足せば、既にある行は動かない。
 * 上の安全領域（ノッチ）・右の安全領域を避ける。`z-index` は今までどおり（ダイアログ・グラフ・質問のフォームは `App.vue` の Teleport で、開いている間はその中へ出る）。
 */
.toast-list {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 0.5em);
  right: calc(env(safe-area-inset-right, 0px) + 0.5em);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4em;
  z-index: 950;
  /* 消えない知らせは最大 8 枚まで溜まる（待ち行列の上限）。**畳まないと画面を覆う**ので、
     高さを切って中で送れるようにする。 */
  max-height: 60vh;
  overflow-y: auto;
  /* **幅も縛る**。縛らないと下の `text-overflow: ellipsis` が効かない——flex の子は
     min-content（`nowrap` の全文幅）より縮まないので、長い呼び名でトーストが横へ伸び、
     後ろに並ぶ［移動］と［×］が視界の外へ出る。**知らせから移る手段が届かなくなる**。 */
  width: min(26em, calc(100vw - 1em));
  /* 中身が無いときは場所を取らない（クリックも通す）。 */
  pointer-events: none;
}
.toast-list > * {
  pointer-events: auto;
}
/* 4 秒で消える短い知らせは操作の対象ではないので、クリックを通す——右上に出るぶん、端末の上端（モバイルでは入力位置の近く）を押そうとして知らせに阻まれない。
   消えない知らせ（［移動］・［×］を持つ）は今までどおり押せる。 */
.toast-list > .toast:not(.toast-sticky) {
  pointer-events: none;
}
/* モバイル（1 列のレイアウト。`mobile/detect.ts` の 768px 未満と同じ幅）は上部バー（`MobileShell`）の**下**に出す——バーの右端の［設定］［連携］を隠さない。 */
@media (max-width: 767px) {
  .toast-list {
    top: calc(env(safe-area-inset-top, 0px) + 3.6rem);
  }
  .toast-list.toast-list-low {
    top: auto;
  }
}
/* 表示の面が出ているときは右下（見出しを覆わない）。モバイルの上部バー用の下げ幅の指定も打ち消す。 */
.toast-list.toast-list-low {
  top: auto;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 0.5em);
}
/* 出る動き。「動きを減らす」の設定では付けない（20261005-notify-bell の AC4）。 */
@media (prefers-reduced-motion: no-preference) {
  .toast {
    animation: toast-in 0.15s ease-out;
  }
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(1em);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.toast {
  display: flex;
  align-items: center;
  gap: 0.6em;
  padding: 0.4em 1em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  cursor: pointer;
}
/* 消えない知らせは、左の細い帯で 4 秒で消える短い知らせと見分ける（20261005-notify-bell）。 */
.toast-sticky {
  border-left: 3px solid var(--soda-state-blocked, #ff6e6e);
}
/* 消えないトーストは 1 行に畳む（8 枚 × 2em では画面を覆うため）。
   **`min-width: 0` が要る**——flex の子は既定で min-content より縮まないので、
   これが無いと `text-overflow: ellipsis` が空振りして横へ伸びる。 */
.toast-sticky .toast-message {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 案内だけの例外：問いかけ＋ボタン 2 つを畳むと、狭い画面で本文が読めなくなる。 */
.toast-wrap {
  flex-wrap: wrap;
}
.toast-wrap .toast-message {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}
.toast-action,
.toast-close {
  flex: none;
  font: inherit;
  color: inherit;
  background: var(--soda-menu-hover-bg, #343746);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.1em 0.6em;
  cursor: pointer;
}
.toast-close {
  padding: 0.1em 0.4em;
}
</style>
