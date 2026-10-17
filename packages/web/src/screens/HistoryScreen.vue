<script setup lang="ts">
import PastSessions from "../dashboard/PastSessions.vue";
import { useMachinesStore } from "../store/machines.js";
const machines = useMachinesStore();
</script>
<template>
  <section class="history-screen" aria-label="セッション履歴">
    <h1>セッション履歴</h1>
    <PastSessions :key="machines.selectedId" />
  </section>
</template>
<style scoped>
.history-screen {
  height: 100%;
  overflow: auto;
  padding: 16px;
  box-sizing: border-box;
  min-width: 0;
  color: var(--soda-fg);
  background: var(--soda-bg);
}
h1 {
  margin: 0 0 12px;
}
</style>
