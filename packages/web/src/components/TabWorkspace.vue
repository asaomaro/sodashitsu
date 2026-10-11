<script setup lang="ts">
import { computed } from "vue";
import type { Tab } from "@sodashitsu/protocol";
import PaneFrame from "./PaneFrame.vue";
import PaneLayout from "./PaneLayout.vue";
import PluginView from "./PluginView.vue";
import TerminalPane from "./TerminalPane.vue";

const props = defineProps<{ tab: Tab; paneFrames?: boolean; followResize?: boolean }>();
const app = computed(() => !!props.tab.plugin && props.tab.perspective !== "terminal");
</script>

<template>
  <PaneFrame :pane-id="tab.displayPaneId ?? ''" enabled presentation-only>
    <div class="tab-workspace">
      <!-- visibility/inert preserve the terminal DOM and measurable size. -->
      <div class="tab-workspace-layer" :class="{ 'tab-workspace-hidden': app }" :inert="app || undefined" :aria-hidden="app || undefined" data-work-panes>
        <PaneLayout :workspace-id="tab.workspaceId" :tab-id="tab.id" :layout="tab.layout" :zoomed-pane-id="tab.zoomedPaneId" :follow-resize="followResize" :pane-frames="paneFrames">
          <template #pane="{ paneId }"><TerminalPane :pane-id="paneId" /></template>
        </PaneLayout>
      </div>
      <div v-if="app && tab.plugin && tab.displayPaneId" class="tab-workspace-layer">
        <PluginView :pane-id="tab.displayPaneId" :plugin="tab.plugin" />
      </div>
    </div>
  </PaneFrame>
</template>

<style scoped>
.tab-workspace { position:relative; width:100%; height:100%; min-width:0; min-height:0; }
.tab-workspace-layer { position:absolute; inset:0; }
.tab-workspace-hidden { visibility:hidden; pointer-events:none; }
</style>
