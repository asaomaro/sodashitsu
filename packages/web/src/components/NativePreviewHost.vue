<script setup lang="ts">
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { computed, ref } from "vue";
import { useSessionStore } from "../store/session.js";
import { useNativePreviewsStore } from "../store/nativePreviews.js";
import { useMachinesStore } from "../store/machines.js";
import { useViewStore } from "../store/view.js";
import WebPreview from "./WebPreview.vue";
const session = useSessionStore(), previews = useNativePreviewsStore(), machines = useMachinesStore(), view = useViewStore();
const viewers = useViewerTabsStore();
const parking = ref<HTMLElement>();
const tabs = computed(() => [
  ...[...session.tabs.values()].filter(tab => tab.nativeView === "web-preview").map(t => ({ id:t.id, workspaceId:t.workspaceId, paneId:t.focusedPaneId, local:false })),
  ...viewers.tabs.filter(t => t.kind === "web-preview" && t.machineId === machines.selectedId).map(t => ({ id:t.id, workspaceId:t.workspaceId, paneId:"", local:true })),
]);
</script>
<template>
  <!-- Keep permission/helper leases through tab/workspace/layout changes. Closing the tab disposes them. -->
  <div ref="parking" hidden aria-hidden="true" />
  <template v-if="parking">
    <Teleport v-for="tab in tabs" :key="machines.selectedId + ':' + tab.id" :to="previews.targets.get(tab.id) ?? parking">
      <WebPreview :tab-id="tab.id" :workspace-id="tab.workspaceId" :fallback-pane-id="tab.paneId" :active="(tab.local ? viewers.active?.id === tab.id : !viewers.active && view.tabId === tab.id) && view.screen === 'base'" />
    </Teleport>
  </template>
</template>
