<script setup lang="ts">
import { computed, ref } from "vue";
import { useSessionStore } from "../store/session.js";
import { useNativePreviewsStore } from "../store/nativePreviews.js";
import { useMachinesStore } from "../store/machines.js";
import { useViewStore } from "../store/view.js";
import WebPreview from "./WebPreview.vue";
const session = useSessionStore(), previews = useNativePreviewsStore(), machines = useMachinesStore(), view = useViewStore();
const parking = ref<HTMLElement>();
const tabs = computed(() => [...session.tabs.values()].filter(tab => tab.nativeView === "web-preview"));
</script>
<template>
  <!-- Keep permission/helper leases through tab/workspace/layout changes. Closing the tab disposes them. -->
  <div ref="parking" hidden aria-hidden="true" />
  <template v-if="parking">
    <Teleport v-for="tab in tabs" :key="machines.selectedId + ':' + tab.id" :to="previews.targets.get(tab.id) ?? parking">
      <WebPreview :tab-id="tab.id" :workspace-id="tab.workspaceId" :fallback-pane-id="tab.focusedPaneId" :active="view.tabId === tab.id && view.screen === 'base'" />
    </Teleport>
  </template>
</template>
