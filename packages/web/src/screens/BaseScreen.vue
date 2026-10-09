<script setup lang="ts">
/**
 * 基本画面（tab バーと pane の領域）。`App.vue` から移した（20261008-graph-first）。**ほかの画面が出ている間も、描かれたまま・大きさを保つ**（`App.vue` が `visibility: hidden` と
 * `inert` で見えなくするだけ。`display: none`・`v-show`・`v-if` で隠すと、pane の箱が 0×0 になり、`client.view` が 1×1 を申告して全部の PTY が縮む。D11）。
 */
import { computed } from "vue";
import PaneLayout from "../components/PaneLayout.vue";
import TabBar from "../components/TabBar.vue";
import TerminalPane from "../components/TerminalPane.vue";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

const session = useSessionStore();
const view = useViewStore();
const settings = useSettingsStore();

const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));
</script>

<template>
  <div class="base-screen">
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

<style scoped>
.base-screen {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
}
</style>
