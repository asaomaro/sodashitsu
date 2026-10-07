<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PaneLayout from "../components/PaneLayout.vue";
import TerminalPane from "../components/TerminalPane.vue";
import { ConnectionKey, TerminalRegistryKey, ViewSyncKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import NotificationBell from "../components/NotificationBell.vue";
import PaneBands from "../components/PaneBands.vue";
import { useDisplayStore } from "../store/display.js";
import MobileDisplaySheet from "./MobileDisplaySheet.vue";
import ExtraKeys from "./ExtraKeys.vue";
import PanePicker from "./PanePicker.vue";
import { TouchScroll } from "./TouchScroll.js";
import { useFitToScreen } from "./useFitToScreen.js";
import { usePaneArea } from "./usePaneArea.js";
import { useVisualViewportHeight } from "./useVisualViewport.js";

/**
 * 1 列のレイアウト本体（04-mobile T5。design「1 列のレイアウト」）。上部バー（workspace/tab の表示・
 * ピッカーを開くボタン・キーボード（`ExtraKeys`）の開閉ボタン）、中央に現在の tab の**フォーカス中の
 * pane を 1 つだけ**表示（design「表示する pane は 1 つ」）、開いていれば下部に `ExtraKeys`。
 *
 * pane の表示は `PaneLayout`（03-web-desktop T19）を**単一 pane のレイアウト木**（`{type:'pane',
 * paneId}`）で再利用する——`ViewSync.commit`（`client.view` の送出）の配線を重複させないための判断。
 * デスクトップの分割があっても、モバイルはフォーカス中の 1 つだけを見せる（分割そのものは無視する）。
 *
 * **`client.view` の大きさは表示領域（`.mobile-shell-pane`）で測る**（04-mobile T9・D108）。葉は縮小の枠の中にあり、その大きさは
 * サーバの PTY の大きさで決まる（下の `naturalSize`）ので、`PaneLayout` に `measureSinglePane` を渡して葉の代わりに表示領域を測らせ
 * （単一 pane の木しか描かないので、表示領域 ＝ その pane の置き場）、
 * 表示領域の変化（回転・窓の幅・ソフトキーボード・追加キーの列）で `commitView` し直す（`usePaneArea`）。`followResize`
 * （葉を見る。デスクトップ用）は付けない（D107）。
 */
const session = useSessionStore();
const view = useViewStore();
const registry = inject(TerminalRegistryKey);
const conn = inject(ConnectionKey);
const viewSync = inject(ViewSyncKey);

// 表示の面（20261007-soda-extensions）。帯はバーと pane の間に出し、パネルはバーのボタンから重ね表示（端末の横には出さない）。
const displays = useDisplayStore();
const showDisplaySheet = ref(false);
// `prefix+i`（focus_display）は、モバイルでは重ね表示を開く（パネルの枠が端末の横に無いため）。
onMounted(() => {
  displays.sheetAvailable = true;
});
onBeforeUnmount(() => {
  displays.sheetAvailable = false;
});
watch(
  () => displays.sheetRequest,
  () => {
    if (currentPaneId.value && displays.panelsOf(currentPaneId.value).length > 0) showDisplaySheet.value = true;
  },
);
const panelCount = computed(() => (currentPaneId.value ? displays.panelsOf(currentPaneId.value).length : 0));
const bandCount = computed(() => (currentPaneId.value ? displays.bandsOf(currentPaneId.value).length : 0));

const showPicker = ref(false);
const showKeyboard = ref(false);
const paneContainer = ref<HTMLElement | null>(null);
/** 表示中の pane を描く `PaneLayout`（表示領域が変わったら `commitView` で `client.view` を送り直す。D108）。 */
const paneLayout = ref<{ commitView: () => void } | null>(null);
let touchScroll: TouchScroll | null = null;

const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));
const currentPaneId = computed(() => view.focusedPaneId);
const currentPaneLayout = computed(() => (currentPaneId.value ? ({ type: "pane" as const, paneId: currentPaneId.value }) : null));
const workspaceLabel = computed(() => (view.workspaceId ? (session.workspaces.get(view.workspaceId)?.label ?? "") : ""));
const tabLabel = computed(() => currentTab.value?.label ?? "");

// T6：既定は画面幅に縮小、「この端末に合わせる」で等倍（`client.fit`）。`conn`/`registry`/`viewSync` が無い
// （provide されていない）呼び出しはこのコンポーネントの前提が壊れているので、ここで気づけるようにする
// （`viewSync` が無いと、再接続の後に `client.fit` を送り直せない。D108）。
if (!conn) throw new Error("MobileShell: ConnectionKey が provide されていません");
if (!registry) throw new Error("MobileShell: TerminalRegistryKey が provide されていません");
if (!viewSync) throw new Error("MobileShell: ViewSyncKey が provide されていません");
const { scale, fitEnabled, naturalSize, toggleFit } = useFitToScreen({ conn, registry, viewSync, paneId: currentPaneId, container: paneContainer });

// T9：`client.view` の大きさを縮小の枠の中の葉ではなく表示領域で測り、表示領域の変化に追従させる（D108）。
const { measureSinglePane } = usePaneArea({ container: paneContainer, commit: () => paneLayout.value?.commitView() });

// T7：ソフトキーボードが開くとブラウザは visual viewport だけを縮める（レイアウトの viewport はそのまま
// なので CSS の `height:100%`/`100vh` だけでは追従しない）。実際の高さをここで JS から当てる。
const viewportHeight = useVisualViewportHeight();

function rebindTouchScroll(): void {
  touchScroll?.dispose();
  touchScroll = null;
  const paneId = currentPaneId.value;
  const el = paneContainer.value;
  const term = paneId && registry ? registry.get(paneId)?.term : undefined;
  if (el && term) touchScroll = new TouchScroll({ element: el, term });
}

// `flush: "post"` ＝ DOM 更新後（`TerminalPane` が新しい pane を acquire し終えた後）に取り付け直す。
watch([currentPaneId, paneContainer], rebindTouchScroll, { flush: "post" });
onBeforeUnmount(() => touchScroll?.dispose());
</script>

<template>
  <div class="mobile-shell" :style="{ height: `${viewportHeight}px` }">
    <header class="mobile-shell-bar">
      <button type="button" class="mobile-shell-title" @click="showPicker = true">{{ workspaceLabel }} / {{ tabLabel }}</button>
      <button type="button" class="mobile-shell-fit-btn" :aria-pressed="fitEnabled" @click="toggleFit">この端末に合わせる</button>
      <button type="button" class="mobile-shell-keyboard-btn" :aria-pressed="showKeyboard" aria-label="キーボード" @click="showKeyboard = !showKeyboard">⌨</button>
      <!-- 設定（20260921-herdr-settings-gaps の AC13）。モバイルはサイドバーも prefix キーも無いので、
           ここが唯一の入口になる。**文字のボタンにする**——以前の 🔔 は絵文字で環境により見た目が変わり、
           設定全体を開くのに通知の絵を出すと中身と食い違う（⚙ も絵文字の属性を持つので避ける）。 -->
      <!-- 連携のグラフ（20260927-agent-graph の AC20。モバイルは閲覧と一時停止・再開だけ）。文字のボタン（設定と同じ理由）。 -->
      <!-- 通知のベル（20261005-notify-bell）。応答せずに閉じた知らせの件数。モバイルにはサイドバーが無いので、ここが入口。 -->
      <NotificationBell variant="mobile" />
      <button v-if="panelCount > 0" type="button" class="mobile-shell-display-btn" data-mobile-display-btn @click="showDisplaySheet = true">表示{{ panelCount }}</button>
      <button type="button" class="mobile-shell-graph-btn" @click="view.openGraph()">連携</button>
      <button type="button" class="mobile-shell-settings-btn" @click="view.openDialogWithContext({ kind: 'settings' })">設定</button>
    </header>
    <PaneBands v-if="currentPaneId && bandCount > 0" :pane-id="currentPaneId" :pane-height-px="viewportHeight" />
    <main ref="paneContainer" class="mobile-shell-pane">
      <div
        class="mobile-shell-pane-scale"
        :style="naturalSize ? { width: `${naturalSize.width}px`, height: `${naturalSize.height}px`, transform: `scale(${scale})` } : {}"
      >
        <PaneLayout
          v-if="currentPaneLayout && view.workspaceId && view.tabId"
          ref="paneLayout"
          :workspace-id="view.workspaceId"
          :tab-id="view.tabId"
          :layout="currentPaneLayout"
          :measure-single-pane="measureSinglePane"
        >
          <template #pane="{ paneId }">
            <TerminalPane :pane-id="paneId" />
          </template>
        </PaneLayout>
      </div>
    </main>
    <ExtraKeys v-if="showKeyboard" />
    <PanePicker v-if="showPicker" @close="showPicker = false" />
    <MobileDisplaySheet v-if="showDisplaySheet && currentPaneId" :pane-id="currentPaneId" @close="showDisplaySheet = false" />
  </div>
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%; /* :style の明示的な px の高さ（visual viewport）が優先される。フォールバック */
}
.mobile-shell-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em;
  background: var(--soda-menu-bg, #282a36);
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.mobile-shell-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
}
/* 設定のボタンも文字なので、同じく文字の［この端末に合わせる］と同じ見た目にそろえる。設定はモバイルで唯一の入口なので、
   押せる高さ（⌨ と同じ程度）を持たせる（review ラウンド1 の指摘）。 */
.mobile-shell-fit-btn,
.mobile-shell-display-btn,
.mobile-shell-graph-btn,
.mobile-shell-settings-btn {
  flex: none;
  min-height: 2rem;
  font-size: 0.85em;
  padding: 0.3em 0.6em;
  color: inherit;
  background: none;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
}
/* 上部のバーは狭い画面でいっぱいなので、表示のボタンだけ余白を詰める（パネルがあるときだけ出る）。 */
.mobile-shell-display-btn {
  padding: 0.3em 0.35em;
}
.mobile-shell-fit-btn[aria-pressed="true"] {
  color: var(--soda-accent-fg, #f8f8f2);
  background: var(--soda-accent, #6070a1);
}
.mobile-shell-keyboard-btn {
  flex: none;
  font-size: 1.2em;
  padding: 0.2em 0.6em;
  color: inherit;
  background: none;
  border: none;
}
.mobile-shell-keyboard-btn[aria-pressed="true"] {
  background: var(--soda-menu-active-bg, #44475a);
  border-radius: 4px;
}
/*
 * `client.view` の大きさはこの要素で測る（D108）。大きさが中身（縮小の枠＝サーバの PTY の大きさ）に左右されないこと
 * （`flex: 1`・`min-height: 0`・`overflow: hidden`）が、申告と PTY の大きさの循環を起こさない前提。
 */
.mobile-shell-pane {
  flex: 1;
  min-height: 0;
  touch-action: pan-x; /* 縦方向のネイティブジェスチャを避け、TouchScroll に譲る（design「スクロールと入力」） */
  overflow: hidden;
}
.mobile-shell-pane-scale {
  transform-origin: top left;
}
</style>
