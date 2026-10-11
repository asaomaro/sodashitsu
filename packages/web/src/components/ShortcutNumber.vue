<script setup lang="ts">
import { useViewStore } from "../store/view.js";
defineProps<{number:number | undefined;target:"tab"|"pane"|"workspace"|"agent"}>();
const view=useViewStore();
</script>
<template>
  <span v-if="view.isPrefixWaiting && number && number <= 9" class="shortcut-number" :class="{'shortcut-number-active':view.numberTarget===target}" :data-number-target="target" :data-shortcut-number="number" aria-hidden="true">{{ number }}</span>
</template>
<style scoped>
.shortcut-number { position:absolute; top:2px; left:2px; z-index:6; min-width:1.2em; height:1.2em; padding:1px 2px; font-size:0.75em; font-weight:bold; line-height:1.2; text-align:center; border-radius:3px; background:var(--soda-menu-bg); color:var(--soda-fg); border:1px solid var(--soda-accent); pointer-events:none; }
.shortcut-number-active { background:var(--soda-accent); color:var(--soda-accent-fg); }
</style>
