<script setup lang="ts">
import {ref} from "vue";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import {readDesktopWindow,parseMonitorWindow,type MonitorWindowLaunch,type DesktopWindowLaunch} from "../desktop/monitorWindow.js";
let launch:MonitorWindowLaunch|DesktopWindowLaunch|undefined,monitor:MonitorWindowLaunch|undefined;
try { launch = readDesktopWindow(location.hash);if(Object.hasOwn(launch,"monitor"))monitor=parseMonitorWindow(launch); } catch { /* Invalid URLs never start capture. */ }
const closed=ref(false);
</script>
<template>
  <main class="monitor-page">
    <RemoteDesktopWindow v-if="launch&&!closed" :machine-id="launch.machineId" :label="launch.label" v-bind="monitor ? {monitorWindow:monitor} : {}" embedded @close="closed=true" />
    <p v-else role="status">{{closed?'共有を終了しました。この窓を閉じてください。':'デスクトップ窓のURLが無効です。共有元の窓から開き直してください。'}}</p>
  </main>
</template>
<style scoped>.monitor-page{position:fixed;inset:0;overflow:hidden;}</style>
