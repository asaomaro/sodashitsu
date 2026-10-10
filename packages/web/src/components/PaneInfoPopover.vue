<script setup lang="ts">
/**
 * pane の利用状況の窓（デスクトップ。20261010-agent-usage PR4 の AC3）。pane の近くに出る小さな**非モーダル**の窓。
 * - 位置: 基本画面が見えていて、窓がその pane の箱の中に収まるなら、箱の右上（端末の文字をできるだけ隠さない）。収まらない（pane が小さい）・基本画面が見えない
 *   （グラフのノードのメニューから開いた）ときは、画面の中央。
 * - 閉じる: `Esc`・外を押す・［情報］をもう一度（`view.togglePaneInfo`）。閉じたら端末へ戻す（基本画面が見えているとき）。外を押したときは、押した先へ。
 * - 開いている間だけ、利用状況の配信を受ける（`view.usageWatchWanted`。ダッシュボードと同じ数え方）。
 * - 1 列の画面は `PaneInfoDialog`（全面のダイアログ）。ここは出ない。
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { TerminalRegistryKey } from "../injection.js";
import PaneInfoView from "../dashboard/PaneInfoView.vue";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";

const view = useViewStore();
const session = useSessionStore();
const registry = inject(TerminalRegistryKey, undefined);

const paneId = computed(() => view.paneInfoPaneId);
const el = ref<HTMLElement | null>(null);
const pos = ref<{ left: number; top: number; anchored: boolean } | null>(null);
let observer: ResizeObserver | undefined;

/** pane の箱（基本画面が見えているときだけ）。 */
function paneRect(id: string): DOMRect | null {
  if (view.screen !== "base") return null;
  const pane = document.querySelector<HTMLElement>(`[data-pane-id="${CSS.escape(id)}"]`);
  const r = pane?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? r : null;
}

function layout(): void {
  const node = el.value;
  const id = paneId.value;
  if (!node || id === null) return;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = paneRect(id);
  const MARGIN = 8;
  const NAME_ROW = 32; // 名前の行・操作ボタンの下から
  if (r && w + MARGIN * 2 <= r.width && h + NAME_ROW + MARGIN <= r.height) {
    pos.value = { left: Math.round(r.right - w - MARGIN), top: Math.round(r.top + NAME_ROW), anchored: true };
    return;
  }
  pos.value = { left: Math.max(MARGIN, Math.round((vw - w) / 2)), top: Math.max(MARGIN, Math.round((vh - h) / 2)), anchored: false };
}

/** 閉じるとき、端末へフォーカスを戻す（基本画面が見えていて、その pane がまだ在るとき）。 */
function restoreFocus(id: string): void {
  if (view.screen === "base" && session.panes.has(id)) registry?.focus(id);
}
function closeAndRestore(): void {
  const id = paneId.value;
  view.closePaneInfo();
  if (id !== null) void nextTick(() => restoreFocus(id));
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  ev.preventDefault();
  ev.stopPropagation(); // `main.ts` の window の keydown へ渡さない
  closeAndRestore();
}

function onOutside(ev: Event): void {
  const node = el.value;
  if (!node || paneId.value === null) return;
  const t = ev.target;
  if (t instanceof Node && node.contains(t)) return;
  // 押したのが［情報］のボタンなら、そのボタンの処理（toggle）に任せる（ここで閉じると、同じ押下で開き直してしまう）。
  if (t instanceof Element && t.closest("[data-pane-action='info']") !== null) return;
  // フォーカスは、押した先へ移る（戻さない）。
  view.closePaneInfo();
}

watch(
  paneId,
  (id, old) => {
    pos.value = null;
    if (id === null) {
      // どの道で閉じても（キーのもう一度・［情報］・メニュー・Esc）、フォーカスが窓と一緒に消えて `body` に落ちたら、端末へ戻す。
      // 外を押して閉じたとき（押した先がフォーカスを持つ）は、動かさない。
      if (old !== null && old !== undefined) {
        void nextTick(() => {
          const a = document.activeElement;
          if (a === null || a === document.body || !a.isConnected) restoreFocus(old);
        });
      }
      return;
    }
    // 位置を決めて（`visibility: hidden` が外れて）から、フォーカスを入れる（隠れている要素にはフォーカスできない）。
    void nextTick(() => {
      layout();
      void nextTick(() => el.value?.focus({ preventScroll: true }));
    });
  },
  { flush: "post" },
);

// pane が閉じたら窓も閉じる。
watch(
  () => (paneId.value !== null ? session.panes.has(paneId.value) : true),
  (exists) => {
    if (!exists) view.closePaneInfo();
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("resize", layout);
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => layout());
  }
});
watch(el, (node, old) => {
  if (old) observer?.unobserve(old);
  if (node) observer?.observe(node);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onOutside, true);
  window.removeEventListener("resize", layout);
  observer?.disconnect();
});
</script>

<template>
  <div
    v-if="paneId !== null && !view.dialogContext"
    ref="el"
    class="pane-info-popover"
    :class="{ 'pane-info-popover-anchored': pos?.anchored }"
    role="dialog"
    aria-label="pane の利用状況"
    tabindex="-1"
    data-pane-info-window
    :style="pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden', left: '0px', top: '0px' }"
    @keydown="onKeydown"
  >
    <PaneInfoView :pane-id="paneId" kind="popover" :active="true" @close="view.closePaneInfo()" />
  </div>
</template>

<style scoped>
.pane-info-popover {
  position: fixed;
  z-index: 900;
  box-sizing: border-box;
  width: 24em;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 0.6em 0.8em;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius, 4px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
  outline: none;
}
.pane-info-popover:focus-visible {
  outline: 2px solid var(--soda-accent, #6070a1);
  outline-offset: -2px;
}
</style>
