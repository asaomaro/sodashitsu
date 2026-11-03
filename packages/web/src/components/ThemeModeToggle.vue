<script setup lang="ts">
import {computed} from "vue";
import {THEME_MODE_LABELS,themeModeOf} from "@sodashitsu/client-core";
import {useSettingsStore} from "../store/settings.js";
defineProps<{variant?:"sidebar"|"mobile"}>();
const settings=useSettingsStore();
const mode=computed(()=>themeModeOf({theme:settings.theme,themeAuto:settings.themeAuto}));
const next=computed(()=>mode.value==="light"?"dark":mode.value==="dark"?"system":"light");
const label=computed(()=>`表示モード：${THEME_MODE_LABELS[mode.value]}。クリックで${THEME_MODE_LABELS[next.value]}`);
</script>
<template>
 <button type="button" data-assistant-feature data-theme-mode-toggle :data-theme-mode="mode" class="theme-mode-toggle" :class="variant==='mobile'?'theme-mode-mobile':undefined" :aria-label="label" :title="label" @click="settings.cycleThemeMode()">
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
   <template v-if="mode==='light'"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></template>
   <path v-else-if="mode==='dark'" d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z"/>
   <template v-else><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/></template>
  </svg>
 </button>
</template>
<style scoped>
.theme-mode-toggle{display:inline-flex;align-items:center;justify-content:center;flex:none;font:inherit;color:inherit;background:none;border:none;border-radius:var(--soda-shape-radius,8px);padding:.2em .5em;cursor:pointer}
.theme-mode-toggle:hover{background:var(--soda-menu-hover-bg,#343746)}
.theme-mode-mobile{min-height:2rem;min-width:2rem;border:1px solid var(--soda-menu-border,#44475a);padding:.3em .6em}
</style>
