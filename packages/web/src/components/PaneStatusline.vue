<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from "vue";
import { loadStatuslineSettings, statuslineSegments } from "@sodashitsu/protocol";
import { TerminalRegistryKey } from "../injection.js";
import { getCellSize } from "../term/measure.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
const props = defineProps<{ paneId: string }>();
const session = useSessionStore(),
  settings = useSettingsStore(),
  usage = useUsageStore(),
  view = useViewStore();
const registry = inject(TerminalRegistryKey, undefined);
const host = ref<HTMLElement | null>(null),
  text = ref<HTMLElement | null>(null);
const available = ref(0),
  natural = ref(0),
  preview = ref<number | null>(null);
const current = computed(() => loadStatuslineSettings(settings.statuslineSettings));
const pane = computed(() => session.panes.get(props.paneId));
const segments = computed(() =>
  pane.value
    ? statuslineSegments(pane.value, usage.panes[props.paneId], usage.accounts, current.value)
    : [],
);
const cellWidth = () =>
  registry?.get(props.paneId)?.term ? getCellSize(registry.get(props.paneId)!.term).width : 8;
const width = computed(() =>
  Math.min(
    available.value,
    natural.value + 36,
    (preview.value ?? current.value.columns ?? 4096) * cellWidth(),
  ),
);
function measure() {
  available.value = host.value?.clientWidth ?? 0;
  natural.value = text.value?.scrollWidth ?? 0;
}
let observer: ResizeObserver | undefined;
let cancelDrag: (() => void) | undefined;
function resize(event: PointerEvent) {
  if (event.button !== 0 || !host.value) return;
  event.preventDefault();
  cancelDrag?.();
  const origin = event.clientX,
    initial = width.value,
    cell = cellWidth();
  const max = Math.max(8, Math.ceil(Math.min(available.value, natural.value + 36) / cell));
  const move = (ev: PointerEvent) => {
    preview.value = Math.min(max, Math.max(8, Math.round((initial + ev.clientX - origin) / cell)));
  };
  const end = () => {
    const value = preview.value;
    cancelDrag?.();
    if (value !== null)
      settings.setStatuslineSettings({
        ...loadStatuslineSettings(settings.statuslineSettings),
        columns: value,
      });
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") cancelDrag?.();
  };
  cancelDrag = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key);
    preview.value = null;
    cancelDrag = undefined;
  };
  const cancel = () => cancelDrag?.();
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key);
}
onMounted(() => {
  observer = new ResizeObserver(measure);
  if (host.value) observer.observe(host.value);
  if (text.value) observer.observe(text.value);
  measure();
});
onBeforeUnmount(() => {
  cancelDrag?.();
  observer?.disconnect();
});
</script>
<template>
  <div
    v-show="segments.length"
    ref="host"
    class="pane-statusline"
    data-pane-statusline
    :data-pane-id="paneId"
  >
    <div class="statusline-width" :style="{ width: width ? `${width}px` : '100%' }">
      <button
        aria-label="Statuslineの設定"
        title="Statuslineの設定"
        @click="view.openDialogWithContext({ kind: 'statuslineSettings' })"
      >
        ⋮
      </button>
      <div class="statusline-scroll">
        <span ref="text" class="statusline-text"
          ><template v-for="(segment, i) in segments" :key="`${segment.field}-${i}`"
            ><span v-if="i" class="separator"> · </span
            ><span :class="`color-${segment.color}`">{{ segment.text }}</span></template
          ></span
        >
      </div>
      <div
        role="separator"
        aria-label="Statuslineの表示桁数"
        aria-orientation="vertical"
        tabindex="0"
        class="statusline-resize"
        @pointerdown="resize"
        @dblclick="settings.setStatuslineSettings({ ...current, columns: null })"
        @keydown.left.prevent="
          settings.setStatuslineSettings({
            ...current,
            columns: Math.max(8, Math.floor(width / cellWidth()) - 1),
          })
        "
        @keydown.right.prevent="
          settings.setStatuslineSettings({
            ...current,
            columns: Math.min(
              Math.ceil((natural + 36) / cellWidth()),
              Math.floor(width / cellWidth()) + 1,
            ),
          })
        "
      >
        │
      </div>
    </div>
  </div>
</template>
<style scoped>
.pane-statusline {
  flex: 0 0 auto;
  min-width: 0;
  overflow: hidden;
  background: var(--soda-bg);
  color: var(--soda-fg);
  font: 12px/22px var(--soda-terminal-font-family, monospace);
}
.statusline-width {
  display: flex;
  align-items: center;
  max-width: 100%;
  height: 24px;
  box-sizing: border-box;
}
button {
  flex: 0 0 24px;
  height: 22px;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.statusline-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.statusline-text {
  display: inline-block;
  white-space: pre;
}
.statusline-resize {
  flex: 0 0 12px;
  text-align: center;
  cursor: ew-resize;
  touch-action: none;
}
.separator,
.color-muted {
  color: var(--soda-fg);
}
.color-name {
  color: var(--soda-state-working);
}
.color-active {
  color: var(--soda-state-working);
}
.color-model {
  color: var(--soda-state-idle);
}
.color-good {
  color: var(--soda-state-done);
}
.color-warning {
  color: var(--soda-state-working);
}
.color-danger {
  color: var(--soda-state-blocked);
}
</style>
