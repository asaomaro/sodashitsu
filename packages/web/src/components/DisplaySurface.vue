<script setup lang="ts">
import { computed } from "vue";
import {
  BUILTIN_WORKSPACE_KEY,
  BUILTIN_DEVELOPMENT_DISPLAY,
  type DisplayInfo,
  type DisplayContent,
  type BuiltinViewId,
} from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import DisplayFrame from "./DisplayFrame.vue";
import WorkspaceView from "./WorkspaceView.vue";
const props = defineProps<{ info: DisplayInfo; content?: DisplayContent | undefined }>();
const session = useSessionStore();
const builtin = computed(() => {
  if (props.info.source?.type !== "builtin") return null;
  const pane = session.panes.get(props.info.paneId),
    tab = pane ? session.tabs.get(pane.tabId) : undefined;
  if (!tab) return null;
  const view = tab.views?.find(
    (v) =>
      v.extensionKey === BUILTIN_WORKSPACE_KEY &&
      v.paneId === props.info.paneId &&
      v.display === props.info.name,
  );
  const kind =
    (view?.viewId === "statusline" ? null : view?.viewId) ??
    (tab.plugin?.extensionKey === BUILTIN_WORKSPACE_KEY &&
    props.info.name === BUILTIN_DEVELOPMENT_DISPLAY
      ? "development"
      : null);
  return kind
    ? {
        kind: kind as Exclude<BuiltinViewId,"statusline">,
        tab,
        targetPaneId: view?.target === "pane" ? view.paneId : undefined,
      }
    : null;
});
</script>
<template>
  <div v-if="builtin" class="display-frame-wrap builtin-surface">
    <WorkspaceView
      :workspace-id="builtin.tab.workspaceId"
      :tab-id="builtin.tab.id"
      :kind="builtin.kind"
      :target-pane-id="builtin.targetPaneId"
    />
  </div>
  <DisplayFrame v-else :info="info" :content="content" />
</template>
<style scoped>
.builtin-surface {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  flex: 1;
}
</style>
