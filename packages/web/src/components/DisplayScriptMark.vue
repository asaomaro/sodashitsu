<script lang="ts">
/** 固定の印「スクリプト」の説明（`title`）。 */
export const DISPLAY_SCRIPT_MARK_TITLE = "この表示は、pane のプログラムのスクリプトを動かしています";
export const DISPLAY_ENGAGE_LABEL = "操作する";
export const DISPLAY_ENGAGE_TITLE = "この表示を操作する（prefix+i）。押すまで、キー入力は端末に届きます";
</script>

<script setup lang="ts">
import type { DisplayInfo } from "@sodashitsu/protocol";
import { computed } from "vue";
import { isScriptFormat } from "../display/framePage.js";
import { engageFrame } from "../display/frameRegistry.js";
import { useDisplayStore } from "../store/display.js";

/**
 * スクリプトが動く面の、枠の外の固定の部品（アプリが描く）: 固定の印「スクリプト」と［操作する］ボタン。
 * どちらも `info.format` から決める（枠の実際の形式と食い違わない）。題・中身には依らない。静的な形式の面には、どちらも出さない。
 * ［操作する］は、操作中でないときだけ出す。押すと `engageEntry` の決まりで、枠が操作を始める（枠・覆いを押しても始まらない）。
 */
const props = defineProps<{ info: DisplayInfo; part: "mark" | "button" }>();
const store = useDisplayStore();

const script = computed(() => isScriptFormat(props.info.format) && store.scriptCapable);
const engaged = computed(() => store.focusedDisplayId === props.info.id);
const hinted = computed(() => store.engageHint === props.info.id);

function onClick(ev: MouseEvent): void {
  engageFrame(props.info.id, ev);
}
</script>

<template>
  <span v-if="script && part === 'mark'" class="display-script-mark" :title="DISPLAY_SCRIPT_MARK_TITLE" data-display-script-mark>スクリプト</span>
  <button
    v-else-if="script && part === 'button' && !engaged"
    type="button"
    class="display-engage"
    :class="{ 'display-engage-hint': hinted }"
    :title="DISPLAY_ENGAGE_TITLE"
    :aria-label="`${DISPLAY_ENGAGE_LABEL}（${info.name}）`"
    data-display-engage
    @click="onClick"
  >
    {{ DISPLAY_ENGAGE_LABEL }}
  </button>
</template>

<style scoped>
.display-script-mark {
  flex: none;
  display: inline-block;
  padding: 0 6px;
  margin-right: 6px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--soda-warn-fg, #ffb86c);
  border: 1px solid var(--soda-warn-fg, #ffb86c);
  border-radius: 4px;
  white-space: nowrap;
}
.display-engage {
  flex: none;
  font: inherit;
  font-size: 0.9em;
  min-height: 24px;
  padding: 0 8px;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 1px solid var(--soda-accent, #6070a1);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.display-engage:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.display-engage:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: 1px;
}
/* 覆いや枠を押したときに、1 秒だけ強調して場所を教える。 */
.display-engage-hint {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
  box-shadow: 0 0 0 2px var(--soda-warn-fg, #ffb86c);
}
</style>
