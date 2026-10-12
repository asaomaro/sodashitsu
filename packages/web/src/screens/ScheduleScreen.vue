<script setup lang="ts">
import ScheduleView from "../schedule/ScheduleView.vue";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
const view = useViewStore(),
  machines = useMachinesStore();
</script>
<template><ScheduleView v-if="view.screen === 'schedule'" :key="machines.selectedId" /></template>
