<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, watch } from "vue";
import { edgeScrollDelta, reorderSteps, slotAt, TAB_DRAG_THRESHOLD_PX } from "../layout/tabReorder.js";
import { ActionDispatcherKey, ConnectionKey, TerminalRegistryKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { formatDatetime, type TabBarRightEntry } from "@sodashitsu/client-core";

/**
 * tab の一覧（design「サイドバー」隣接の tab バー。D56 の訂正 9・10）。状態の印は出さない、拡大中は「Z」だけ。
 * tab バー上のホイールで前後の tab に切り替える（D56 の訂正 11。研究 F3 に無いが herdr にある操作）。
 *
 * **tab が1個のときは自動で隠す**（20260922-appearance-settings-rest。design「US2」・AC4〜AC6）。
 * 切り替える先が無いので、常に表示し続ける意味が無い——空いた縦の領域を端末に使う。
 * **上/下の位置・右端に複数エントリ（拡大の状態・ホスト名・日時・固定文字列）を出せる**
 * （20260922-tabbar-pane-appearance。PR #12 から取り込み。design 元は herdr の `ui.tab_bar_position`・
 * `ui.tab_bar_right` 相当）。既定は今までどおり位置「上」・右端は空（何も出ない）——20260922-
 * appearance-settings-rest の「常時 HH:mm」は、このより一般的な「日時エントリを足す」形に統合された
 * （利用者が設定で日時エントリを足せば同じ見た目になる。既定を維持するために `loadTabBarRightEntries`
 * 側の「空なら空」という素直な読み込みは変えない）。
 */
const session = useSessionStore();
const view = useViewStore();
const settings = useSettingsStore();
const actions = inject(ActionDispatcherKey);
const conn = inject(ConnectionKey);
const registry = inject(TerminalRegistryKey, undefined);

const tabs = computed(() => {
  const ws = view.workspaceId ? session.workspaces.get(view.workspaceId) : undefined;
  if (!ws) return [];
  return ws.tabIds.map((id) => session.tabs.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
});

const root = ref<HTMLElement | null>(null);
const tabsEl = ref<HTMLElement | null>(null);
/** tab バーが見えているか（`v-if` と同じ条件をここにも持つ）。 */
const visible = computed(() => tabs.value.length !== 1);

/**
 * tab バーの中にフォーカスがあるまま非表示になるとき（自動非表示。AC-I6）、選ばれている pane の
 * 端末へフォーカスを戻す。**`onBeforeUnmount` ではなく `watch`**——`v-if` はこのコンポーネント
 * 自身のテンプレートの根に付いており、親（`App.vue`）は `<TabBar/>` を常に描いたままなので、
 * コンポーネント自体の mount/unmount は起きない（`PaneFrame.vue` の `onBeforeUnmount` は、親
 * `PaneLayout.vue` が `:key` で**コンポーネントごと**入れ替える〔D86〕から効く——構造が違う）。
 * `watch` の既定のタイミング（DOM の更新より前）を使い、消える直前（DOM がまだ古いまま）の
 * `document.activeElement` を見る。
 */
watch(visible, (isVisible) => {
  if (isVisible) return;
  if (!root.value?.contains(document.activeElement)) return;
  void nextTick(() => {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
  });
});

/** いま表示中の tab（右端の zoom エントリに使う。20260922-tabbar-pane-appearance）。 */
const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));

/**
 * 右端の日時（`tabBarRight` に `datetime` 種別が1つでもあるときだけ動かす）。15秒ごとに更新——分の
 * 変わり目を最大15秒の遅延で拾えば足りる（design「US3」の元の粒度を踏襲。herdr は秒単位だが、この
 * 粒度で困った報告は無い）。**表示されている間だけ動かす**——`v-if` はこのコンポーネント自身の内側に
 * あり、隠れていてもコンポーネント自体は生き続けるので、素朴に `onMounted`/`onUnmounted` だけに
 * 任せると隠れている間・日時エントリが無い間も無駄に動き続ける。
 */
const hasDatetimeEntry = computed(() => settings.tabBarRight.some((e) => e.kind === "datetime"));
const clockActive = computed(() => visible.value && hasDatetimeEntry.value);
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | undefined;
watch(
  clockActive,
  (isActive) => {
    clearInterval(clockTimer);
    clockTimer = undefined;
    if (!isActive) return;
    now.value = new Date(); // 止まっていた間に古くなった値を、動き出した瞬間に最新へ
    clockTimer = setInterval(() => (now.value = new Date()), 15_000);
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(clockTimer));

function entryText(entry: TabBarRightEntry): string {
  switch (entry.kind) {
    case "zoom":
      return currentTab.value?.zoomedPaneId ? "Z" : "";
    case "hostname":
      return session.host?.hostname ?? "";
    case "datetime":
      return formatDatetime(entry.format, now.value);
    case "text":
      return entry.text;
  }
}

/** 右端の帯の文字列（既定は空＝何も出ない。設定でエントリを足すと出る）。 */
const rightText = computed(() => settings.tabBarRight.map(entryText).join(settings.tabBarRightSeparator));

function selectTab(tabId: string): void {
  const tab = session.tabs.get(tabId);
  if (!tab || !view.workspaceId) return;
  view.setView(view.workspaceId, tabId);
  view.focusPane(tab.focusedPaneId);
  void conn?.request("tab.focus", { tabId }).catch(() => undefined);
}

// ---- tab のドラッグでの並べ替え（20261008-web-tab-dnd。design 第 1 部）----
// 状態はこのコンポーネントの中だけで持つ（`view.paneDrag` は読み書きしない。pane の名前のドラッグと別の入れ物）。
// 送るのは既存の `tab.move`（隣へ 1 つ）を動かす数だけ。先に画面の順を書き換えない（`workspace.updated` で変わる）。

/** 押している（ドラッグ前を含む）。 */
let press: { tabId: string; x: number; y: number; pointerId: number } | null = null;
/** 閾値を超えた後。slot は入る位置の線（無ければ null）。 */
const tabDrag = ref<{ tabId: string; slot: number | null } | null>(null);
/** ドラッグの後の click を 1 回捨てる旗。 */
let suppressClick = false;
let suppressTimer: ReturnType<typeof setTimeout> | undefined;
/** 自動スクロールが使う最後の座標。 */
let lastPoint = { x: 0, y: 0 };
let rafId: number | undefined;

function tabButtons(): HTMLElement[] {
  return Array.from(tabsEl.value?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []);
}

/** 線の位置。根の外・順が変わらない位置は null。 */
function currentSlot(x: number, y: number, tabId: string): number | null {
  const rootEl = root.value;
  const rowEl = tabsEl.value;
  if (!rootEl || !rowEl) return null;
  const r = rootEl.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  const row = rowEl.getBoundingClientRect();
  // あふれて右へ隠れた tab の矩形は「＋」の下まで伸びる。見えている範囲に丸めてから計算する。
  const cx = Math.min(Math.max(x, row.left), row.right);
  const rects = tabButtons().map((el) => {
    const b = el.getBoundingClientRect();
    return { id: el.dataset.tabId ?? "", left: b.left, right: b.right };
  });
  const slot = slotAt(rects, cx);
  return reorderSteps(
    tabs.value.map((t) => t.id),
    tabId,
    slot,
  )
    ? slot
    : null;
}

function refreshSlot(): void {
  const d = tabDrag.value;
  if (!d) return;
  d.slot = currentSlot(lastPoint.x, lastPoint.y, d.tabId);
}

function onTabKeydown(ev: KeyboardEvent): void {
  ev.preventDefault();
  ev.stopPropagation();
  if (ev.key === "Escape") cancelTabDrag();
}

function stopAutoScroll(): void {
  if (rafId !== undefined) cancelAnimationFrame(rafId);
  rafId = undefined;
}

function autoScrollTick(): void {
  rafId = requestAnimationFrame(autoScrollTick);
  const rootEl = root.value;
  const rowEl = tabsEl.value;
  if (!tabDrag.value || !rootEl || !rowEl) return;
  const r = rootEl.getBoundingClientRect();
  if (lastPoint.x < r.left || lastPoint.x > r.right || lastPoint.y < r.top || lastPoint.y > r.bottom) return;
  if (rowEl.scrollWidth <= rowEl.clientWidth) return;
  const delta = edgeScrollDelta(rowEl.getBoundingClientRect(), lastPoint.x);
  if (delta === 0) return;
  const before = rowEl.scrollLeft;
  rowEl.scrollLeft = before + delta;
  if (rowEl.scrollLeft !== before) refreshSlot();
}

/** 片付け（press・状態・keydown・自動スクロール）。ポインタの捕捉は外さない（離せば自然に外れる）。 */
function endTabDrag(): void {
  press = null;
  tabDrag.value = null;
  window.removeEventListener("keydown", onTabKeydown, true);
  stopAutoScroll();
}

function restoreTerminalFocus(): void {
  if (view.focusedPaneId && root.value?.contains(document.activeElement)) registry?.focus(view.focusedPaneId);
}

function cancelTabDrag(restoreFocus = true): void {
  if (!press && !tabDrag.value) return;
  endTabDrag();
  if (restoreFocus) restoreTerminalFocus();
}

function onTabPointerDown(ev: PointerEvent, tabId: string): void {
  suppressClick = false;
  clearTimeout(suppressTimer);
  if (ev.button !== 0 || ev.pointerType === "touch") return;
  press = { tabId, x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
  (ev.currentTarget as HTMLElement | null)?.setPointerCapture?.(ev.pointerId);
}

function onTabPointerMove(ev: PointerEvent): void {
  if (!press || press.pointerId !== ev.pointerId) return;
  if (!tabDrag.value) {
    if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < TAB_DRAG_THRESHOLD_PX) return;
    if (!session.tabs.has(press.tabId)) {
      press = null;
      return;
    }
    tabDrag.value = { tabId: press.tabId, slot: null };
    suppressClick = true;
    window.addEventListener("keydown", onTabKeydown, true);
    rafId = requestAnimationFrame(autoScrollTick);
  }
  lastPoint = { x: ev.clientX, y: ev.clientY };
  refreshSlot();
}

function onTabPointerUp(ev: PointerEvent): void {
  // 直後の click を捨てた後、または来なかったときに旗を下ろす。
  if (suppressClick) {
    clearTimeout(suppressTimer);
    suppressTimer = setTimeout(() => (suppressClick = false), 0);
  }
  if (!press || press.pointerId !== ev.pointerId) return;
  const drag = tabDrag.value;
  const tabId = press.tabId;
  if (!drag) {
    press = null;
    return;
  }
  // 離した座標で計算し直す（線を出した時点の値を使わない）。
  const slot = currentSlot(ev.clientX, ev.clientY, tabId);
  const steps = slot === null ? null : reorderSteps(tabs.value.map((t) => t.id), tabId, slot);
  endTabDrag();
  if (!steps) {
    restoreTerminalFocus();
    return;
  }
  for (let i = 0; i < steps.count; i++) {
    void conn?.request("tab.move", { tabId, direction: steps.direction }).catch(() => undefined);
  }
  selectTab(tabId);
  void nextTick(() => {
    if (view.focusedPaneId) registry?.focus(view.focusedPaneId);
  });
}

function onTabPointerCancel(ev: PointerEvent): void {
  if (press && press.pointerId === ev.pointerId) cancelTabDrag();
}

function onTabLostCapture(ev: PointerEvent): void {
  if (press && press.pointerId === ev.pointerId) cancelTabDrag();
}

/** ドラッグの後の click（離した先が tab・「＋」でも）を捨てる。キーボードの click（detail 0）は通す。 */
function onBarClickCapture(ev: MouseEvent): void {
  if (suppressClick && ev.detail > 0) {
    ev.stopPropagation();
    ev.preventDefault();
    suppressClick = false;
  }
}

watch(
  () => tabs.value.map((t) => t.id),
  (ids) => {
    const d = tabDrag.value;
    if (!d) return;
    if (!ids.includes(d.tabId) || ids.length < 2) cancelTabDrag();
  },
);
watch(
  () => view.workspaceId,
  () => cancelTabDrag(),
);
watch(
  () => view.modalOpen,
  (open) => {
    if (open) cancelTabDrag(false);
  },
);
onUnmounted(() => {
  endTabDrag();
  clearTimeout(suppressTimer);
});

function onContextMenu(ev: MouseEvent, tabId: string): void {
  ev.preventDefault();
  actions?.openContextMenu({ kind: "tab", tabId }, { x: ev.clientX, y: ev.clientY });
}

/**
 * 新しいタブ。`view.workspaceId` は `string | null` で `newTabInWorkspace` は `string` を要るので、
 * **テンプレートではなくここで null を外す**（`:disabled` を付けてもテンプレート式の型は狭まらない）。
 * タブが 0 個でも押せる——タブが無い workspace こそ導線が要る（右クリックの対象が消えるため）。
 */
function onNewTab(): void {
  const id = view.workspaceId;
  if (id) actions?.newTabInWorkspace(id);
}

/**
 * ボタンの Enter/Space を `main.ts` の window keydown（prefix・直接のキーの経路）へ二重に
 * 渡さない（20260925-focus-trapped-keybindings。design「設計方針」）。`preventDefault()`
 * はしない——ネイティブな活性化（`click`）は妨げない。他のキー（修飾付き・矢印・Tab 等）は
 * 何もせず bubble させ、`main.ts` へ届かせる。
 */
function onButtonKeydown(ev: KeyboardEvent): void {
  if ((ev.key === "Enter" || ev.key === " ") && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
    ev.stopPropagation();
  }
}

function onWheel(ev: WheelEvent): void {
  ev.preventDefault();
  actions?.run({ type: "tabDelta", delta: ev.deltaY > 0 ? 1 : -1 });
}
</script>

<template>
  <div
    v-if="tabs.length !== 1"
    ref="root"
    class="tab-bar"
    :class="[`tab-bar-${settings.tabBarPosition}`, { 'tab-bar-dragging': tabDrag }]"
    :style="{ order: settings.tabBarPosition === 'bottom' ? 1 : 0 }"
    @wheel="onWheel"
    @click.capture="onBarClickCapture"
  >
    <!-- `role="tablist"` が持てるのは `tab` だけなので、＋ と右端の帯はこの入れ子の外に置く。 -->
    <div ref="tabsEl" class="tab-bar-tabs" role="tablist">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="tab-bar-item"
        :class="{
          'tab-bar-item-active': tab.id === view.tabId,
          'tab-bar-item-drop-target': view.paneDrag?.overTabId === tab.id,
          'tab-bar-item-dragging': tabDrag?.tabId === tab.id,
          'tab-bar-item-insert-before': tabDrag?.slot === index,
          'tab-bar-item-insert-after': tabDrag?.slot === tabs.length && index === tabs.length - 1,
        }"
        :data-tab-id="tab.id"
        :aria-selected="tab.id === view.tabId"
        @pointerdown="onTabPointerDown($event, tab.id)"
        @pointermove="onTabPointerMove"
        @pointerup="onTabPointerUp"
        @pointercancel="onTabPointerCancel"
        @lostpointercapture="onTabLostCapture"
        @click="selectTab(tab.id)"
        @contextmenu="onContextMenu($event, tab.id)"
      >
        <span class="tab-bar-label">{{ tab.label }}</span>
        <span v-if="tab.zoomedPaneId" class="tab-bar-zoomed">Z</span>
      </button>
    </div>
    <button type="button" class="tab-bar-new" :disabled="!view.workspaceId" aria-label="新しいタブ" @click="onNewTab" @keydown="onButtonKeydown">＋</button>
    <span v-if="rightText" class="tab-bar-right" aria-hidden="true">{{ rightText }}</span>
  </div>
</template>

<style scoped>
/* 05-e2e-docs T3 の E2E で発見：この component にも `<style>` が一度も存在しなかった（PaneLayout.vue・
 * Splitter.vue と同様。D92）。`.app-main`（App.vue）が `flex-direction:column` なので、ここは
 * 横並びの帯として `flex:none` で高さだけ確保する。 */
.tab-bar {
  flex: none;
  display: flex;
  align-items: center;
  background: var(--soda-menu-bg, #282a36);
}
/* 区切り線は帯が接する側に置く（20260922-tabbar-pane-appearance）。上：pane 領域との境が下側。
 * 下：pane 領域との境が上側。 */
.tab-bar-top {
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.tab-bar-bottom {
  border-top: 1px solid var(--soda-menu-border, #44475a);
}
/* 横スクロールはタブの列だけ。＋ は右端に残す（スクロールの向こうへ消えない）。 */
.tab-bar-tabs {
  display: flex;
  min-width: 0;
  overflow-x: auto;
}
/* 高さをタブと揃える。`font: inherit` を落とすと既定のボタンフォントで行の高さが変わり、
 * 帯が高くなって PTY の行が減る（AC14）。 */
.tab-bar-new {
  flex: none;
  padding: 0.5em 0.8em;
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
  background: none;
  /* 最後のタブが既に `border-right` を持つので、ここで左にも引くと境目だけ 2px になる（border は重ならない）。 */
  border: none;
  cursor: pointer;
}
.tab-bar-new:hover:not(:disabled) {
  background: var(--soda-menu-hover-bg, #343746);
}
.tab-bar-new:disabled {
  opacity: 0.4;
  cursor: default;
}
.tab-bar-item {
  flex: none;
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.5em 1em;
  font: inherit;
  color: var(--soda-fg, #f8f8f2);
  background: none;
  border: none;
  border-right: 1px solid var(--soda-menu-border, #44475a);
  cursor: pointer;
  white-space: nowrap;
}
.tab-bar-item-active {
  background: var(--soda-menu-active-bg, #44475a);
}
/* D&D でのドロップ候補（20260924-pane-move-cross-tab。design「クライアント側: ドロップ先の拡張」）。
 * `PaneFrame.vue` の `.pane-frame-edge-drop-target` と同じ強調色。 */
.tab-bar-item-drop-target {
  outline: 2px dashed var(--soda-accent, #8be9fd);
  outline-offset: -2px;
}
/* tab のドラッグ（20261008-web-tab-dnd）。線は box-shadow なので tab の幅は変わらない。動き（transition）は足さない。 */
.tab-bar-dragging,
.tab-bar-dragging .tab-bar-item {
  cursor: grabbing;
}
.tab-bar-item-dragging {
  opacity: 0.7; /* MUTED_TEXT_ALPHA。0.7 未満は uiTokens.test.ts の検査が許さない（decisions D16） */
}
.tab-bar-item-insert-before {
  box-shadow: inset 3px 0 0 var(--soda-resize-line, #f8f8f2);
}
.tab-bar-item-insert-after {
  box-shadow: inset -3px 0 0 var(--soda-resize-line, #f8f8f2);
}
.tab-bar-zoomed {
  opacity: 0.7;
  font-size: 0.85em;
}
/* 右端の帯（20260922-tabbar-pane-appearance。PR #12 から取り込み）。タブの列・＋ の後、右端に寄せる。 */
.tab-bar-right {
  flex: 1 1 auto;
  padding: 0 0.8em;
  overflow: hidden;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
  color: var(--soda-fg, #f8f8f2);
  opacity: 0.75;
  font-size: 0.9em;
}
</style>
