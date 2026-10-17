<script setup lang="ts">
import { computed, inject } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import type { Tab } from "@sodashitsu/protocol";
import { useMachinesStore } from "../store/machines.js";
import { useNativePreviewsStore } from "../store/nativePreviews.js";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import DesktopCdpView from "./DesktopCdpView.vue";
defineProps<{ tab: Tab }>();
const machines = useMachinesStore();
const previews = useNativePreviewsStore();
const machineLabel = computed(() => machines.sections.find(m => m.id === machines.selectedId)?.label ?? machines.selectedId);
const actions = inject(ActionDispatcherKey, undefined);
</script>
<template>
  <div class="native-tab-view" :data-native-tab="tab.nativeView" @keydown.stop @keyup.stop>
    <div v-if="tab.nativeView === 'web-preview'" :ref="el => previews.target(tab.id, el as HTMLElement | null)" class="preview-target" />
    <RemoteDesktopWindow v-else-if="tab.nativeView === 'desktop' && machines.selectedId !== 'local'" embedded :machine-id="machines.selectedId" :label="machineLabel" @close="actions?.closeTabById(tab.id)" />
    <p v-else-if="tab.nativeView === 'desktop'" role="status">デスクトップは操作側のSodashitsuで外部マシンを選択して利用してください。</p>
    <DesktopCdpView v-else-if="tab.nativeView === 'vscode'" :machine-id="machines.selectedId" :machine-label="machineLabel" :enabled="true" />
  </div>
</template>
<style scoped>
.native-tab-view { display:flex; flex-direction:column; overflow:hidden; width:100%; height:100%; min-width:0; min-height:0; }
.native-tab-view > * { flex:1; min-height:0; }
</style>
