<script setup lang="ts">
import ResourceMonitorView from "../resources/ResourceMonitorView.vue";
import { useViewStore } from "../store/view.js";
import { useMachinesStore } from "../store/machines.js";
const view=useViewStore(),machines=useMachinesStore();
</script>
<template><ResourceMonitorView v-if="view.screen==='resources'" :key="machines.selectedId" /></template>
