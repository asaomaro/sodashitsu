<script setup lang="ts">
/**
 * 基本画面（tab バーと pane の領域）。`App.vue` から移した（20261008-graph-first）。**ほかの画面が出ている間も、描かれたまま・大きさを保つ**（`App.vue` が `visibility: hidden` と
 * `inert` で見えなくするだけ。`display: none`・`v-show`・`v-if` で隠すと、pane の箱が 0×0 になり、`client.view` が 1×1 を申告して全部の PTY が縮む。D11）。
 */
import { computed } from "vue";
import NativeTabView from "../components/NativeTabView.vue";
import TabBar from "../components/TabBar.vue";
import TabWorkspace from "../components/TabWorkspace.vue";
import TabViews from "../components/TabViews.vue";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

const session = useSessionStore();
const view = useViewStore();
const settings = useSettingsStore();

const previewTabs = computed(() => [...session.tabs.values()].filter(tab => tab.nativeView === "web-preview"));
const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));
</script>

<template>
  <div class="base-screen">
    <TabBar view-actions />
    <TabViews v-if="currentTab" :tab="currentTab" />
    <div class="app-panes" :class="{ 'app-panes-outer-borders': settings.paneOuterBorders }">
      <!-- 窓の大きさ・サイドバーの幅や折りたたみの変化に client.view を追従させる（D107）。pane ごとに枠を描く（右クリックで
           常にメニューを開く縁。D110）。どちらもモバイルの MobileShell には付けない -->
      <TabWorkspace
        v-if="currentTab && view.workspaceId"
        :tab="currentTab"
        follow-resize
        pane-frames
      />
      <NativeTabView v-for="tab in previewTabs" :key="tab.id" :tab="tab" class="native-preview-layer"
        :style="{ visibility: currentTab?.id === tab.id ? 'visible' : 'hidden' }" :inert="currentTab?.id !== tab.id" />
    </div>
  </div>
</template>

<style scoped>
.app-panes { position:relative; }
.native-preview-layer { position:absolute; inset:0; }
.base-screen {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
}
</style>
