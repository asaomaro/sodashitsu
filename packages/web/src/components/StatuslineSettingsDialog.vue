<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  STATUSLINE_FIELDS,
  STATUSLINE_GRAPHS,
  STATUSLINE_GRAPH_PATTERNS,
  loadStatuslineSettings,
  statuslineGauge,
} from "@sodashitsu/protocol";
import { useViewStore } from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
const view = useViewStore(),
  settings = useSettingsStore();
const dialog = ref<HTMLDialogElement | null>(null);
const current = computed(() => settings.statuslineSettings);
watch(
  () => view.dialogContext?.kind === "statuslineSettings",
  async (open) => {
    await nextTick();
    if (open && !dialog.value?.open) dialog.value?.showModal();
    else if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);
function field(id: (typeof STATUSLINE_FIELDS)[number]["id"], event: Event) {
  const next = loadStatuslineSettings(current.value);
  next.fields[id] = (event.target as HTMLInputElement).checked;
  settings.setStatuslineSettings(next);
}
function graph(id: (typeof STATUSLINE_GRAPHS)[number]["id"], event: Event, pattern = false) {
  const next = loadStatuslineSettings(current.value);
  if (pattern)
    next.graphs[id].pattern = (event.target as HTMLSelectElement)
      .value as (typeof next.graphs)[typeof id]["pattern"];
  else next.graphs[id].visible = (event.target as HTMLInputElement).checked;
  settings.setStatuslineSettings(next);
}
</script>
<template>
  <dialog
    ref="dialog"
    class="statusline-settings"
    aria-label="Statuslineの設定"
    @cancel.prevent="view.closeDialog()"
  >
    <header>
      <strong>Statuslineの設定</strong
      ><button type="button" aria-label="閉じる" @click="view.closeDialog()">×</button>
    </header>
    <p>変更はすべてのstatuslineへ反映され、Web版・端末版で共有されます。</p>
    <fieldset>
      <legend>表示する情報</legend>
      <label v-for="item in STATUSLINE_FIELDS" :key="item.id"
        ><input
          type="checkbox"
          :checked="current.fields[item.id]"
          @change="field(item.id, $event)"
        />{{ item.label }}</label
      >
    </fieldset>
    <fieldset>
      <legend>利用状況グラフ</legend>
      <div v-for="item in STATUSLINE_GRAPHS" :key="item.id" class="graph-row">
        <label
          ><input
            type="checkbox"
            :checked="current.graphs[item.id].visible"
            @change="graph(item.id, $event)"
          />{{ item.label }}のグラフ</label
        >
        <select
          :aria-label="`${item.label}のグラフパターン`"
          :value="current.graphs[item.id].pattern"
          @change="graph(item.id, $event, true)"
        >
          <option
            v-for="pattern in STATUSLINE_GRAPH_PATTERNS"
            :key="pattern.id"
            :value="pattern.id"
          >
            {{ pattern.label }}
          </option>
        </select>
        <output>{{ statuslineGauge(65, current.graphs[item.id]) }}</output>
      </div>
    </fieldset>
    <p>グラフを非表示にしても、表示項目が有効なら数値は表示します。</p>
    <footer><button type="button" @click="view.closeDialog()">閉じる</button></footer>
  </dialog>
</template>
<style scoped>
.statusline-settings {
  box-sizing: border-box;
  width: min(34rem, calc(100vw - 16px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 8px;
  padding: 12px;
  font: inherit;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
p {
  font-size: 0.85em;
}
fieldset {
  border: 1px solid var(--soda-menu-border);
  margin: 12px 0;
}
label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
}
fieldset:first-of-type {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.graph-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  margin: 8px 0;
}
output {
  grid-column: 1 / -1;
  color: var(--soda-state-done);
  font-family: monospace;
}
button,
select {
  font: inherit;
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
  border: 1px solid var(--soda-menu-border);
  border-radius: 4px;
  padding: 4px 8px;
}
option {
  background: var(--soda-menu-bg);
  color: var(--soda-fg);
}
footer {
  display: flex;
  justify-content: flex-end;
}
::backdrop {
  background: #0006;
}
@media (max-width: 480px) {
  fieldset:first-of-type {
    grid-template-columns: 1fr;
  }
  .graph-row {
    grid-template-columns: 1fr;
  }
  output {
    grid-column: auto;
  }
}
</style>
