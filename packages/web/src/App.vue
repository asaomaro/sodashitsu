<script setup lang="ts">
import { computed } from "vue";
import CommandPopup from "./components/CommandPopup.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
import ContextMenu from "./components/ContextMenu.vue";
import DetachedView from "./components/DetachedView.vue";
import GotoPicker from "./components/GotoPicker.vue";
import GroupPickerDialog from "./components/GroupPickerDialog.vue";
import HelpDialog from "./components/HelpDialog.vue";
import LoginView from "./components/LoginView.vue";
import NameDialog from "./components/NameDialog.vue";
import OnboardingDialog from "./components/OnboardingDialog.vue";
import SessionSwitchDialog from "./components/SessionSwitchDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import PaneLayout from "./components/PaneLayout.vue";
import PrefixIndicator from "./components/PrefixIndicator.vue";
import ReconnectOverlay from "./components/ReconnectOverlay.vue";
import Sidebar from "./components/Sidebar.vue";
import TabBar from "./components/TabBar.vue";
import TerminalPane from "./components/TerminalPane.vue";
import Toast from "./components/Toast.vue";
import WorktreeCreateDialog from "./components/WorktreeCreateDialog.vue";
import WorktreeOpenDialog from "./components/WorktreeOpenDialog.vue";
import { isMobileViewport } from "./mobile/detect.js";
import MobileShell from "./mobile/MobileShell.vue";
import { useSessionStore } from "./store/session.js";
import { PANE_FRAME_THICKNESS_PX, useSettingsStore } from "./store/settings.js";
import { useViewStore } from "./store/view.js";

/**
 * 接続の状態で LoginView / DetachedView / 本体を切り替える（T26。design「接続・ログイン・初回表示」
 * 「client.detach」）。本体はさらに、画面幅で 1 列（`MobileShell`）/ デスクトップの本体を切り替える
 * （04-mobile T8。`isMobileViewport()` は `client.hello` の `kind`——`isCoarsePointer()`、`main.ts`——とは
 * 別軸：ウィンドウを狭くしたデスクトップでも 1 列になってよい）。
 * 部品の配線（circular port の bind を含む）は `main.ts`（composition root）の責務——ここはテンプレートの
 * 切り替えと、現在の tab のレイアウト木を `PaneLayout` へ渡すだけ。
 */
const session = useSessionStore();
const view = useViewStore();
const settings = useSettingsStore();

const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));
const isMobile = isMobileViewport();

/**
 * pane の枠・隙間の太さ（20260922-appearance-settings-rest。design「US4」）。`PaneFrame.vue`・
 * `Splitter.vue` はどちらも生の `4px` の代わりに `var(--soda-pane-gap, 4px)` を読む——値そのもの
 * （px 数）はここ（`PANE_FRAME_THICKNESS_PX`）に1箇所だけ持ち、`.app-shell` の CSS 変数として
 * 配る（テーマの CSS 変数〔`ThemeController`〕と同じ「1箇所で決めて子孫へ配る」考え方。ただし
 * こちらは初回描画のちらつき防止が不要なので、`documentElement.style` への命令的な設定ではなく
 * Vue の `:style` 束縛で足りる）。
 */
const paneGapPx = computed(() => `${PANE_FRAME_THICKNESS_PX[settings.paneFrameThickness]}px`);
</script>

<template>
  <LoginView v-if="view.authRequired" />
  <DetachedView v-else-if="view.connectionState === 'detached'" />
  <div v-else class="app-shell" :style="{ '--soda-pane-gap': paneGapPx }">
    <MobileShell v-if="isMobile" />
    <template v-else>
      <Sidebar />
      <div class="app-main">
        <TabBar />
        <div class="app-panes" :class="{ 'app-panes-outer-borders': settings.paneOuterBorders }">
          <!-- 窓の大きさ・サイドバーの幅や折りたたみの変化に client.view を追従させる（D107）。pane ごとに枠を描く（右クリックで
               常にメニューを開く縁。D110）。どちらもモバイルの MobileShell には付けない -->
          <PaneLayout
            v-if="currentTab && view.workspaceId"
            :workspace-id="view.workspaceId"
            :tab-id="currentTab.id"
            :layout="currentTab.layout"
            :zoomed-pane-id="currentTab.zoomedPaneId"
            follow-resize
            pane-frames
          >
            <template #pane="{ paneId }">
              <TerminalPane :pane-id="paneId" />
            </template>
          </PaneLayout>
        </div>
      </div>
    </template>
    <ContextMenu />
    <NameDialog />
    <WorktreeCreateDialog />
    <WorktreeOpenDialog />
    <GroupPickerDialog />
    <SessionSwitchDialog />
    <ConfirmDialog />
    <SettingsDialog />
    <HelpDialog />
    <OnboardingDialog />
    <GotoPicker />
    <CommandPopup />
    <PrefixIndicator />
    <Toast />
    <ReconnectOverlay />
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
  display: flex;
  flex-direction: column;
  min-width: 0;
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
