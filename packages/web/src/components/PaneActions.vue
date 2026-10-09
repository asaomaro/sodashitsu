<script setup lang="ts">
/**
 * pane の枠の操作ボタン（モダンの様式だけ。20261008-ui-style PR4 の AC19〜AC22）。［右へ分割］［下へ分割］［最大化／元に戻す］［閉じる］（閉じるは、いちばん右で、少し間を空ける）。
 * 押したときの処理は `PaneFrame` が持つ（今ある操作を呼ぶだけ）。ここは見た目と読み上げの名前だけ。
 *
 * - 置き場所は 2 通り（`variant`）: `row`＝pane の名前の行の右端（いつも見える）、`corner`＝端末の領域の右上の隅（ポインタが載っている間・pane が選ばれている間だけ見える）。
 * - ボタンは Tab の順に入れない（`tabindex="-1"`）。キーボードでは、いまのキー（分割・拡大表示・閉じる）と、pane の枠の Tab・Enter で開くメニューで足りる。
 * - 押下は、端末からフォーカスを奪わない（`mousedown` を止める）。印はインラインの SVG（絵文字は環境で見た目が変わる）。
 */
defineProps<{ variant: "row" | "corner"; showSplit: boolean; zoomed: boolean; selected: boolean; paneLabel: string }>();
defineEmits<{ split: [dir: "right" | "down"]; zoom: []; close: [] }>();

function keepFocus(ev: MouseEvent): void {
  ev.preventDefault();
}
</script>

<template>
  <div class="pane-actions" :class="[`pane-actions-${variant}`, { 'pane-actions-selected': selected }]" role="group" :aria-label="`${paneLabel}の操作`" data-pane-actions @mousedown="keepFocus">
    <template v-if="showSplit">
      <button type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="split-right" aria-label="右へ分割" title="右へ分割" @click="$emit('split', 'right')">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 3v10" stroke="currentColor" stroke-width="1.3" /></svg>
      </button>
      <button type="button" class="pane-actions-btn" tabindex="-1" data-pane-action="split-down" aria-label="下へ分割" title="下へ分割" @click="$emit('split', 'down')">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M2 8h12" stroke="currentColor" stroke-width="1.3" /></svg>
      </button>
    </template>
    <button
      type="button"
      class="pane-actions-btn"
      tabindex="-1"
      data-pane-action="zoom"
      :aria-label="zoomed ? '元に戻す' : '最大化'"
      :title="zoomed ? '元に戻す' : '最大化'"
      :aria-pressed="zoomed"
      @click="$emit('zoom')"
    >
      <svg v-if="!zoomed" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button type="button" class="pane-actions-btn pane-actions-close" tabindex="-1" data-pane-action="close" aria-label="閉じる" title="閉じる" @click="$emit('close')">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
    </button>
  </div>
</template>

<style scoped>
.pane-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  z-index: 19; /* 浮いた窓の層（20）より下: 窓が重なった所では、ボタンを窓の下に隠す（窓の操作を邪魔しない）。端末のスクロールバー（11）より上。 */
}
/* 名前の行の右端（確保した上の余白の中。端末にも表示の面にも重ならない）。 */
.pane-actions-row {
  position: absolute;
  top: 0;
  right: 6px;
  height: var(--soda-shape-name-h, 28px);
  pointer-events: auto;
}
/* 端末の領域の右上の隅。ふだんは見えず（押せもしない）、ポインタが載っている間・pane が選ばれている間・ボタンにフォーカスがある間だけ出す。 */
.pane-actions-corner {
  position: absolute;
  top: 4px;
  right: 6px;
  opacity: 0;
  /* 箱そのものは何も受けない。覆う範囲はボタンの大きさだけ（帯にしない。地もボタンの下だけ）。押せるのは、見えている間のボタンだけ（`--pane-actions-events`）。 */
  pointer-events: none;
}
.pane-actions-corner .pane-actions-btn {
  pointer-events: var(--pane-actions-events, none);
  background: var(--soda-menu-bg, #282a36);
  box-shadow: inset 0 0 0 1px var(--soda-menu-border, #44475a);
}
.pane-actions-corner .pane-actions-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* ポインタが載っている間（`.pane-frame-center:hover`）の規則は、親の `PaneFrame.vue` に置く（子の根の要素は、親の scoped の規則を受ける）。 */
.pane-actions-corner.pane-actions-selected,
.pane-actions-corner:focus-within {
  opacity: 1;
  --pane-actions-events: auto;
}
.pane-actions-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--soda-shape-radius-s);
  background: none;
  color: var(--soda-fg, #f8f8f2);
  cursor: pointer;
}
.pane-actions-btn:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* 閉じるは、ほかと少し間を空ける（押し間違えにくくする）。 */
.pane-actions-close {
  margin-left: 6px;
}
.pane-actions-close:hover {
  color: var(--soda-error-fg, #ff5555);
}
</style>
