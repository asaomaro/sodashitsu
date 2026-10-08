<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { withDisplayChange, menuPositionBelow, openDisplayMenu } from "../display/displayOps.js";
import type { TrayButton } from "../display/paneDisplayLayout.js";
import { DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import DisplayScriptMark from "./DisplayScriptMark.vue";

/**
 * トレイ（帯の行の、アプリが描くボタンの並び。20261008-display-layout の design「部品」）。たたんだパネル・たたんだ帯・自動でたたんだ面（押せない）・浮いた窓の面のボタン。
 * 帯の枠（iframe）の外のアプリの DOM なので、帯の中身は覆えない。幅は行の 4 割まで。自分の箱を測って、収まらない分を「ほか N」にまとめる（押すと面の一覧のメニュー）。
 * 押してもフォーカスを取らない（`@mousedown.prevent`・`data-display-keepfocus`）。
 */
const props = defineProps<{ paneId: string; buttons: TrayButton[] }>();
const store = useDisplayStore();
const view = useViewStore();
const host = inject(DisplayHostKey, undefined);

const NAME_MAX_CHARS = 12;
const el = ref<HTMLElement | null>(null);
/** 描く先頭からの個数（測る前は全部描く）。 */
const visibleCount = ref<number>(Number.POSITIVE_INFINITY);

interface Item {
  b: TrayButton;
  name: string;
  short: string;
  glyph: string;
  pressed: boolean | undefined;
}
const items = computed<Item[]>(() =>
  props.buttons.flatMap((b) => {
    const info = store.infos.get(b.id);
    if (!info) return [];
    const chars = [...info.name];
    return [
      {
        b,
        name: info.name,
        short: chars.length > NAME_MAX_CHARS ? `${chars.slice(0, NAME_MAX_CHARS).join("")}…` : info.name,
        glyph: b.kind === "band" ? "▭" : b.kind === "float" ? "❐" : "▣",
        pressed: b.kind === "float" ? b.open : undefined,
      },
    ];
  }),
);
const shown = computed(() => items.value.slice(0, Number.isFinite(visibleCount.value) ? visibleCount.value : items.value.length));
const hiddenCount = computed(() => items.value.length - shown.value.length);

/** 全部描いた状態で、収まる個数を測る。収まらない分があるなら、「ほか N」の分（おおよそ 3.5em ぶん）を空けて数え直す。 */
function measure(): void {
  const box = el.value;
  if (!box) return;
  const width = box.clientWidth;
  if (width <= 0) return; // 測れない（まだ表示されていない・テスト）: 全部描く
  const kids = [...box.querySelectorAll<HTMLElement>("[data-display-tray-button]")];
  const fits = (limit: number): number => {
    let n = 0;
    for (const k of kids) {
      if (k.offsetLeft + k.offsetWidth - (kids[0]?.offsetLeft ?? 0) > limit) break;
      n++;
    }
    return n;
  };
  let n = fits(width);
  if (n < kids.length) n = fits(Math.max(0, width - 64));
  visibleCount.value = n < kids.length ? n : Number.POSITIVE_INFINITY;
}
function remeasure(): void {
  visibleCount.value = Number.POSITIVE_INFINITY;
  void nextTick(measure);
}
watch(() => props.buttons.map((b) => `${b.id}:${b.kind}:${b.open}:${b.disabled}`).join(","), remeasure, { flush: "post" });
let ro: ResizeObserver | null = null;
onMounted(() => {
  void nextTick(measure);
  if (typeof ResizeObserver === "undefined" || !el.value) return;
  let last = el.value.clientWidth;
  ro = new ResizeObserver(() => {
    const w = el.value?.clientWidth ?? 0;
    if (w !== last) {
      last = w;
      remeasure();
    }
  });
  ro.observe(el.value);
});
onBeforeUnmount(() => ro?.disconnect());

function onPress(b: TrayButton): void {
  const info = store.infos.get(b.id);
  if (!info || b.disabled) return;
  const toggleOpen = b.kind === "float" && b.open;
  void withDisplayChange(
    info,
    () => store.setFaceCollapsed(info, toggleOpen),
    () => (toggleOpen ? null : document.querySelector<HTMLElement>(`[data-display-root="${info.id}"] [data-pane-panel-fold], [data-display-root="${info.id}"] [data-display-menu-button]`)),
    host,
    { keepTrayFocus: b.kind === "float" },
  );
}
function onMore(ev: MouseEvent): void {
  openDisplayMenu((t, at) => view.openContextMenu(t, at), { kind: "displays", paneId: props.paneId }, menuPositionBelow(ev.currentTarget as Element), host, props.paneId);
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.repeat && (ev.key === "Enter" || ev.key === " ")) ev.preventDefault();
}
</script>

<template>
  <span ref="el" class="display-tray" role="group" aria-label="表示のボタン" data-display-chrome data-display-tray @keydown="onKeydown">
    <button
      v-for="it in shown"
      :key="it.b.id"
      type="button"
      class="display-tray-btn"
      :class="{ 'display-tray-btn-open': it.pressed === true }"
      :disabled="it.b.disabled"
      :aria-disabled="it.b.disabled ? 'true' : undefined"
      :aria-pressed="it.pressed === undefined ? undefined : it.pressed ? 'true' : 'false'"
      :aria-label="it.pressed ? `表示を閉じる（${it.name}）` : `表示を開く（${it.name}）`"
      :title="it.b.disabled ? 'pane が狭いので、この表示を出せません' : it.name"
      data-display-tray-button
      data-display-keepfocus
      :data-display-id="it.b.id"
      :data-display-name="it.name"
      @mousedown.prevent
      @click="onPress(it.b)"
    >
      <span class="display-tray-glyph" aria-hidden="true">{{ it.glyph }}</span>
      <span class="display-tray-name">{{ it.short }}</span>
      <DisplayScriptMark v-if="store.infos.get(it.b.id)" :info="store.infos.get(it.b.id)!" part="mark" />
    </button>
    <button
      v-if="hiddenCount > 0"
      type="button"
      class="display-tray-btn display-tray-more"
      :aria-label="`ほか ${hiddenCount} 件の表示`"
      data-display-tray-more
      data-display-keepfocus
      @mousedown.prevent
      @click="onMore"
    >
      ほか {{ hiddenCount }}
    </button>
  </span>
</template>

<style scoped>
.display-tray {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 40%;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  overflow: hidden;
  white-space: nowrap;
}
.display-tray-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  font: inherit;
  font-size: 0.7em;
  padding: 0 6px;
  color: var(--soda-fg, #f8f8f2);
  background: transparent;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  cursor: pointer;
}
.display-tray-btn:hover:not(:disabled) {
  background: var(--soda-menu-hover-bg, #343746);
}
.display-tray-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.display-tray-btn-open {
  background: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.display-tray-btn:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
.display-tray-name {
  white-space: nowrap;
}
</style>
