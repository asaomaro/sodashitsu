<script setup lang="ts">
import { computed } from "vue";
import type { ViewerTab } from "@sodashitsu/protocol";
import { useMachinesStore } from "../store/machines.js";
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { useNativePreviewsStore } from "../store/nativePreviews.js";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import DesktopCdpView from "./DesktopCdpView.vue";
const props = defineProps<{ tab: ViewerTab }>();
const machines = useMachinesStore(),
  tabs = useViewerTabsStore(),
  previews = useNativePreviewsStore();
const label = computed(
  () => machines.sections.find((m) => m.id === props.tab.machineId)?.label ?? props.tab.machineId,
);
</script>
<template>
  <div
    class="viewer-tab-view"
    :data-viewer-tab="tab.id"
    :data-native-tab="tab.kind"
    tabindex="-1"
    @keydown.stop
    @keyup.stop
  >
    <div
      v-if="tab.kind === 'web-preview'"
      :ref="(el) => previews.target(tab.id, el as HTMLElement | null)"
      class="preview-target"
    />
    <RemoteDesktopWindow
      v-else-if="tab.kind === 'desktop' && tab.machineId !== 'local'"
      embedded
      :machine-id="tab.machineId"
      :label="label"
      @close="tabs.remove(tab.id)"
    />
    <p v-else-if="tab.kind === 'desktop'" role="status">
      外部マシンを選択してデスクトップを開いてください。
    </p>
    <DesktopCdpView v-else :machine-id="tab.machineId" :machine-label="label" :enabled="true" />
  </div>
</template>
<style scoped>
.viewer-tab-view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.viewer-tab-view > * {
  flex: 1;
  min-height: 0;
}
</style>
