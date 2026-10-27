<script setup lang="ts">
import {ref} from "vue";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import {readMonitorWindow} from "../desktop/monitorWindow.js";
let launch;
try { launch = readMonitorWindow(location.hash); } catch { /* Invalid URLs never start capture. */ }
const closed=ref(false);
</script>
<template>
  <main class="monitor-page">
    <RemoteDesktopWindow v-if="launch&&!closed" :machine-id="launch.machineId" :label="launch.label" :monitor-window="launch" embedded @close="closed=true" />
    <p v-else role="status">{{closed?'共有を終了しました。この窓を閉じてください。':'モニター窓のURLが無効です。共有元の窓から開き直してください。'}}</p>
  </main>
</template>
<style scoped>.monitor-page{position:fixed;inset:0;overflow:hidden;}</style>
