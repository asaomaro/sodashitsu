<script setup lang="ts">
import { computed } from "vue";
import CommandPopup from "./components/CommandPopup.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import ContextMenu from "./components/ContextMenu.vue";
import DetachedView from "./components/DetachedView.vue";
import GotoPicker from "./components/GotoPicker.vue";
import GraphDialog from "./components/graph/GraphDialog.vue";
import AgentForkDialog from "./components/AgentForkDialog.vue";
import GroupPickerDialog from "./components/GroupPickerDialog.vue";
import HelpDialog from "./components/HelpDialog.vue";
import LoginView from "./components/LoginView.vue";
import NameDialog from "./components/NameDialog.vue";
import NotificationHistoryDialog from "./components/NotificationHistoryDialog.vue";
import OnboardingDialog from "./components/OnboardingDialog.vue";
import SessionSwitchDialog from "./components/SessionSwitchDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import PrefixIndicator from "./components/PrefixIndicator.vue";
import ReconnectOverlay from "./components/ReconnectOverlay.vue";
import Sidebar from "./components/Sidebar.vue";
import SubagentListDialog from "./components/SubagentListDialog.vue";
import Toast from "./components/Toast.vue";
import AskDialog from "./components/AskDialog.vue";
import ExtensionApprovalDialog from "./components/ExtensionApprovalDialog.vue";
import WorktreeCreateDialog from "./components/WorktreeCreateDialog.vue";
import WorktreeOpenDialog from "./components/WorktreeOpenDialog.vue";
import { isMobileViewport } from "./mobile/detect.js";
import { SCREENS } from "./screens/screens.js";
import MobileShell from "./mobile/MobileShell.vue";
import { paneGapPxFor, useSettingsStore } from "./store/settings.js";
import { useViewStore } from "./store/view.js";

/**
 * 接続の状態で LoginView / DetachedView / 本体を切り替える（T26。design「接続・ログイン・初回表示」
 * 「client.detach」）。本体はさらに、画面幅で 1 列（`MobileShell`）/ デスクトップの本体を切り替える
 * （04-mobile T8。`isMobileViewport()` は `client.hello` の `kind`——`isCoarsePointer()`、`main.ts`——とは
 * 別軸：ウィンドウを狭くしたデスクトップでも 1 列になってよい）。
 * 部品の配線（circular port の bind を含む）は `main.ts`（composition root）の責務——ここはテンプレートの
 * 切り替えと、現在の tab のレイアウト木を `PaneLayout` へ渡すだけ。
 */
const view = useViewStore();
const settings = useSettingsStore();

const isMobile = isMobileViewport();

/**
 * pane の枠・隙間の太さ（20260922-appearance-settings-rest。design「US4」）。`PaneFrame.vue`・
 * `Splitter.vue` はどちらも生の `4px` の代わりに `var(--soda-pane-gap, 4px)` を読む——値そのもの
 * （px 数）はここ（`PANE_FRAME_THICKNESS_PX`）に1箇所だけ持ち、`.app-shell` の CSS 変数として
 * 配る（テーマの CSS 変数〔`ThemeController`〕と同じ「1箇所で決めて子孫へ配る」考え方。ただし
 * こちらは初回描画のちらつき防止が不要なので、`documentElement.style` への命令的な設定ではなく
 * Vue の `:style` 束縛で足りる）。
 */
const paneGapPx = computed(() => `${paneGapPxFor(settings.uiStyle, settings.paneFrameThickness)}px`);
</script>

<template>
  <LoginView v-if="view.authRequired" />
  <DetachedView v-else-if="view.connectionState === 'detached'" />
  <div v-else class="app-shell" :style="{ '--soda-pane-gap': paneGapPx }">
    <MobileShell v-if="isMobile" />
    <template v-else>
      <Sidebar />
      <!-- 主な領域。画面の一覧（`screens/screens.ts`）から作った画面を重ねて置き、見えているのは `view.screen` の 1 つだけ。見えない画面は、**大きさを保ったまま** `visibility: hidden` と
           `inert` で見えなくするだけ（`display: none`・`v-show`・`v-if` は使わない。基本画面の pane の箱が 0×0 になると、`client.view` が 1×1 を申告して全部の PTY が縮む。D11） -->
      <div class="app-main">
        <div
          v-for="def in SCREENS"
          :key="def.id"
          class="app-screen"
          :class="{ 'app-screen-hidden': view.screen !== def.id }"
          :data-screen="def.id"
          :inert="view.screen !== def.id"
        >
          <component :is="def.component" />
        </div>
      </div>
    </template>
    <ContextMenu />
    <NameDialog />
    <WorktreeCreateDialog />
    <WorktreeOpenDialog />
    <GroupPickerDialog />
    <AgentForkDialog />
    <SessionSwitchDialog />
    <ConfirmDialog />
    <SubagentListDialog />
    <NotificationHistoryDialog />
    <SettingsDialog />
    <HelpDialog />
    <OnboardingDialog />
    <GotoPicker />
    <GraphDialog v-if="isMobile" />
    <CommandPopup />
    <!-- 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）。ほかのダイアログとは別の枠で、後から開くので上に重なる。 -->
    <AskDialog />
    <!-- プロジェクトの拡張の承認（20261007-ext-host PR3）と、承認待ちの知らせ。別の枠（`showModal()`）。サーバのイベントでは開かず、利用者が［確認する］を押したときだけ開く。 -->
    <ExtensionApprovalDialog />
    <PrefixIndicator />
    <!-- 1 列の画面の重ねるグラフ（`showModal()` の top layer）を開いている間は、トーストと再接続の表示をその dialog の中へ出す——外に置くと top layer の下に隠れ、
         inert で押せない（20260927-agent-graph の decisions D4）。`defer` は同じ描画の中で後から mount される行き先を待つため。 -->
    <Teleport :key="isMobile ? 'mobile' : 'desktop'" :to="view.askOpen ? '#soda-ask-dialog' : '#soda-graph-dialog'" :disabled="!(view.graphDialogOpen || view.askOpen)" defer>
      <Toast />
      <ReconnectOverlay />
    </Teleport>
  </div>
</template>

<style>
/*
 * 画面の枠の色（CSS 変数）。**ここは dracula（既定のテーマ）の写し**——正は `theme/uiTokens.ts` の定数で、一致は `uiTokens.test.ts` が守る
 * （20260921-theme-settings）。選んだテーマは `ThemeController` が `documentElement.style` に当てて上書きする。ここの値が効くのは、
 * 最初の描画で起動用の控え（`public/theme-boot.js`）が無いときに、本体の `ThemeController.start()` が当てるまでの間だけ。
 */
:root {
  color-scheme: dark;
  --soda-bg: #1e1f29;
  --soda-fg: #f8f8f2;
  --soda-menu-bg: #282a36;
  --soda-menu-fg: #f8f8f2;
  --soda-menu-border: #44475a;
  --soda-menu-active-bg: #44475a;
  /* 一時的なホバーの面。--soda-menu-bg(#282a36) より明るく --soda-menu-active-bg(#44475a) より暗い色にして、
   * 表示中と取り違えないようにする。 */
  --soda-menu-hover-bg: #343746;
  --soda-accent: #6070a1;
  --soda-accent-fg: #f8f8f2;
  --soda-error-fg: #ff5555;
  --soda-warn-fg: #ffb86c;
  --soda-state-blocked: #ff6e6e;
  --soda-state-working: #f1fa8c;
  --soda-state-done: #50fa7b;
  --soda-state-idle: #8a9ad0;
  --soda-subtle-bg: rgba(255, 255, 255, 0.08);
  --soda-backdrop: rgba(0, 0, 0, 0.4);
  --soda-backdrop-strong: rgba(0, 0, 0, 0.5);
  --soda-pane-current: #44475a;
  --soda-resize-line: #f8f8f2;
}
html,
body,
#app {
  height: 100%;
  margin: 0;
}
body {
  background: var(--soda-bg);
  color: var(--soda-fg);
  font-family: system-ui, sans-serif;
}
.app-shell {
  display: flex;
  height: 100%;
}
.app-main {
  flex: 1;
  position: relative;
  min-width: 0;
}
/* 画面は重ねて置く（どれも主な領域いっぱい）。見えない画面は大きさを保つ（D11） */
.app-screen {
  position: absolute;
  inset: 0;
  min-width: 0;
}
.app-screen-hidden {
  visibility: hidden;
}
.app-panes {
  flex: 1;
  min-height: 0;
}
/* pane 領域の外周の枠（20260922-tabbar-pane-appearance。PR #12 から取り込み）。`outline` を使う——
 * `border` はボックスの外寸を増やして内側の大きさを削り、`PaneLayout.vue` が測る葉の大きさ・PTY の
 * cols/rows まで変えてしまう。`outline` はボックスモデルに参加しないため、その心配が無い。 */
.app-panes-outer-borders {
  outline: 1px solid var(--soda-menu-border, #44475a);
  outline-offset: -1px;
}
</style>
