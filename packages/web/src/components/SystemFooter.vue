<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import {
  systemFooterSegments,
  systemFooterPlaceholder,
  type SystemResources,
} from "@sodashitsu/protocol";
import { SystemResourcePoller } from "@sodashitsu/client-core";
import { ConnectionKey } from "../injection.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
const settings = useSettingsStore(),
  view = useViewStore(),
  conn = inject(ConnectionKey);
const data = ref<SystemResources>(),
  failed = ref(false),
  hidden = ref(document.hidden);
const visible = computed(() => settings.systemFooterSettings.enabled);
const segments = computed(() =>
  systemFooterSegments(
    data.value,
    settings.systemFooterSettings.fields,
    settings.systemFooterSettings.graphs,
  ),
);
const poller = new SystemResourcePoller(
  () => (conn ? conn.request("server.resources", {}) : Promise.reject(new Error("disconnected"))),
  (next, error) => {
    data.value = next;
    failed.value = error;
  },
);
const visibility = () => {
  hidden.value = document.hidden;
};
document.addEventListener("visibilitychange", visibility);
watch(
  () => visible.value && view.connectionState === "open" && !hidden.value,
  (active) => poller.setActive(active),
  { immediate: true },
);
onBeforeUnmount(() => {
  poller.setActive(false);
  document.removeEventListener("visibilitychange", visibility);
});
</script>
<template>
  <footer
    v-if="visible"
    class="system-footer"
    data-system-footer
    aria-label="サーバーの使用状況"
    title="Sodashitsuサーバーが動く環境の情報（WSLではLinux環境）"
  >
    <button
      type="button"
      aria-label="フッターの設定"
      title="フッターの設定"
      @click="view.openDialogWithContext({ kind: 'systemFooterSettings' })"
    >
      ⋮
    </button>
    <div class="footer-content">
      <span v-for="segment in segments" :key="segment">{{ segment }}</span>
      <span v-if="!segments.length && settings.systemFooterSettings.fields.length">{{
        systemFooterPlaceholder(data, failed)
      }}</span>
    </div>
  </footer>
</template>
<style scoped>
.system-footer {
  display: flex;
  gap: 1em;
  flex: 0 0 auto;
  min-width: 0;
  height: 24px;
  box-sizing: border-box;
  align-items: center;
  padding: 0 8px;
  font:
    12px/22px system-ui,
    sans-serif;
  color: var(--soda-fg);
  background: var(--soda-bg);
  border-top: 1px solid var(--soda-menu-border);
  overflow: hidden;
  scrollbar-width: none;
  white-space: nowrap;
}
.system-footer::-webkit-scrollbar {
  display: none;
}

button {
  flex: 0 0 24px;
  height: 22px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.footer-content {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 1em;
  overflow-x: auto;
  scrollbar-width: none;
}
.footer-content::-webkit-scrollbar {
  display: none;
}
</style>
