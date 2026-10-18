<script setup lang="ts">
/**
 * 基本画面（tab バーと pane の領域）。`App.vue` から移した（20261008-graph-first）。**ほかの画面が出ている間も、描かれたまま・大きさを保つ**（`App.vue` が `visibility: hidden` と
 * `inert` で見えなくするだけ。`display: none`・`v-show`・`v-if` で隠すと、pane の箱が 0×0 になり、`client.view` が 1×1 を申告して全部の PTY が縮む。D11）。
 */
import ViewerTabView from "../components/ViewerTabView.vue";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { computed } from "vue";
import NativeTabView from "../components/NativeTabView.vue";
import TabBar from "../components/TabBar.vue";
import TabWorkspace from "../components/TabWorkspace.vue";
import TabViews from "../components/TabViews.vue";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

const session = useSessionStore();
const viewers = useViewerTabsStore();
const machines = useMachinesStore();
const view = useViewStore();
const settings = useSettingsStore();

const previewTabs = computed(() => [...session.tabs.values()].filter(tab => tab.nativeView === "web-preview"));
const currentTab = computed(() => (view.tabId ? session.tabs.get(view.tabId) : undefined));
</script>

<template>
  <div class="base-screen">
    <TabBar view-actions />
    <TabViews v-if="currentTab && !viewers.active" :tab="currentTab" />
    <div class="app-panes" :class="{ 'app-panes-outer-borders': settings.paneOuterBorders }">
      <!-- 窓の大きさ・サイドバーの幅や折りたたみの変化に client.view を追従させる（D107）。pane ごとに枠を描く（右クリックで
           常にメニューを開く縁。D110）。どちらもモバイルの MobileShell には付けない -->
      <TabWorkspace
        v-if="currentTab && view.workspaceId"
        :tab="currentTab"
        :active="!viewers.active"
        :style="viewers.active ? { visibility: 'hidden' } : undefined"
        :inert="!!viewers.active"
        follow-resize
        pane-frames
      />
      <NativeTabView v-for="tab in previewTabs" :key="tab.id" :tab="tab" class="native-preview-layer"
        :style="{ visibility: currentTab?.id === tab.id && !viewers.active ? 'visible' : 'hidden' }" :inert="currentTab?.id !== tab.id || !!viewers.active" />
      <ViewerTabView v-for="tab in viewers.tabs.filter(t => t.machineId === machines.selectedId && (t.kind === 'web-preview' || t.id === viewers.active?.id))" :key="tab.id" :tab="tab" class="native-preview-layer"
        :style="{ visibility: viewers.active?.id === tab.id ? 'visible' : 'hidden' }" :inert="viewers.active?.id !== tab.id" />
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
