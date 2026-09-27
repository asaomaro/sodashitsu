<script setup lang="ts">
import { useViewStore } from "../store/view.js";

/** PREFIX の帯（T25。design「prefix の表示」：「prefix を待っている間は、画面下部に『PREFIX』の帯を出す」AC-I1）。 */
const view = useViewStore();
</script>

<template>
  <div v-if="view.isPrefixWaiting" class="prefix-indicator" role="status">PREFIX</div>
</template>

<style scoped>
.prefix-indicator {
  position: fixed;
  left: 50%;
  bottom: 1em;
  transform: translateX(-50%);
  padding: 0.3em 1em;
  background: var(--soda-menu-active-bg, #44475a);
  color: var(--soda-fg, #f8f8f2);
  border-radius: 4px;
  font-family: monospace;
  letter-spacing: 0.1em;
  z-index: 950;
  pointer-events: none;
}
</style>
