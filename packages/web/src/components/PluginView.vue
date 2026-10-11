<script setup lang="ts">
import {pluginMobileDisplay} from "../display/pluginDisplay.js";
import { computed } from "vue";
import type { PluginTab } from "@sodashitsu/protocol";
import { useDisplayStore } from "../store/display.js";
import { useExtensionsStore } from "../store/extensions.js";
import { displayLabel } from "../display/displayLabel.js";
import DisplayFrame from "./DisplayFrame.vue";
import DisplayScriptMark from "./DisplayScriptMark.vue";

const props = defineProps<{ paneId: string; plugin: PluginTab; mobile?:boolean }>();
const displays = useDisplayStore();
const extensions = useExtensionsStore();
const extension = computed(() => extensions.list?.extensions.find(e => e.key === props.plugin.extensionKey));
const mobileDisplay=computed(()=>pluginMobileDisplay(props.plugin,extensions.list?.extensions));
const displayName=computed(()=>props.mobile&&mobileDisplay.value?mobileDisplay.value:props.plugin.display);
const info = computed(() => displays.panelsOf(props.paneId).find(d => d.name === displayName.value && d.source?.id === props.plugin.extensionKey.split(":").at(-1) && d.source?.scope === props.plugin.extensionKey.split(":")[0]));
const content = computed(() => info.value ? displays.contents.get(info.value.id) : undefined);
</script>

<template>
  <section class="plugin-view" data-plugin-view :data-mobile-view="mobile || undefined" :data-plugin="plugin.extensionKey" :data-display-root="info?.id">
    <header v-if="info" class="plugin-view-head" data-display-chrome>
      <span>{{ displayLabel(info) }}</span>
      <DisplayScriptMark :info="info" part="mark" />
      <DisplayScriptMark :info="info" part="button" />
      <DisplayScriptMark :info="info" part="end" />
    </header>
    <DisplayFrame v-if="info" :key="info.id" :info="info" :content="content" />
    <div v-else class="plugin-view-empty" role="status">
      {{ extension?.state === 'running' ? 'プラグインの画面を準備しています…' : 'プラグインが停止しています。設定の拡張一覧で有効にしてください。' }}
    </div>
  </section>
</template>

<style scoped>
.plugin-view { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; background:var(--soda-bg); }
.plugin-view-head { display:flex; gap:8px; align-items:center; padding:4px 10px; flex:none; border-bottom:1px solid var(--soda-menu-border); font-size:12px; }
.plugin-view-head span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.plugin-view :deep(.display-frame-wrap) { flex:1; min-height:0; }
.plugin-view-empty { padding:24px; }
</style>
