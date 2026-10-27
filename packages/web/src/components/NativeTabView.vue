<script setup lang="ts">
import { useViewerTabsStore } from "../store/viewerTabs.js";
import { useViewStore } from "../store/view.js";
import { computed, inject } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import type { Tab } from "@sodashitsu/protocol";
import { useMachinesStore } from "../store/machines.js";
import { useNativePreviewsStore } from "../store/nativePreviews.js";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import DesktopCdpView from "./DesktopCdpView.vue";
const props = defineProps<{ tab: Tab }>();
const machines = useMachinesStore();
const previews = useNativePreviewsStore();
const machineLabel = computed(() => machines.sections.find(m => m.id === machines.selectedId)?.label ?? machines.selectedId);
const actions = inject(ActionDispatcherKey, undefined);
async function migrate() {
  if (!props.tab.nativeView) return;
  try {
    await useViewerTabsStore().create({ kind: props.tab.nativeView, label: props.tab.label,
      workspaceId: props.tab.workspaceId, machineId: machines.selectedId });
    actions?.closeTabById(props.tab.id);
  } catch { useViewStore().toast("閲覧タブに移せませんでした。操作元の接続を確認してください。"); }
}
</script>
<template>
  <div class="native-tab-view" :data-native-tab="tab.nativeView" @keydown.stop @keyup.stop>
    <div class="legacy-view-notice"><span>以前の形式の共有タブです。</span><button type="button" @click="migrate">操作元の閲覧タブに移す</button></div>
    <div v-if="tab.nativeView === 'web-preview'" :ref="el => previews.target(tab.id, el as HTMLElement | null)" class="preview-target" />
    <RemoteDesktopWindow :key="machines.selectedId" v-else-if="tab.nativeView === 'desktop' && machines.selectedId !== 'local'" embedded :machine-id="machines.selectedId" :label="machineLabel" @close="actions?.closeTabById(tab.id)" />
    <p v-else-if="tab.nativeView === 'desktop'" role="status">デスクトップは操作側のSodashitsuで外部マシンを選択して利用してください。</p>
    <DesktopCdpView v-else-if="tab.nativeView === 'vscode'" :machine-id="machines.selectedId" :machine-label="machineLabel" :enabled="true" />
  </div>
</template>
<style scoped>
.native-tab-view { display:flex; flex-direction:column; overflow:hidden; width:100%; height:100%; min-width:0; min-height:0; }
.native-tab-view > * { flex:1; min-height:0; }
.legacy-view-notice { flex:0 0 auto; display:flex; gap:8px; padding:4px 8px; font-size:.85em; }
</style>
