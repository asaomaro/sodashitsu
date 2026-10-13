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
const maxRows = computed(() => Math.min(natural.value || 1, available.value));
const rows = computed(() => Math.min(maxRows.value, preview.value ?? current.value.rows));
function setRows(value: number) {
  settings.setStatuslineSettings({
    ...loadStatuslineSettings(settings.statuslineSettings),
    rows: Math.max(1, Math.min(maxRows.value, value)),
  });
}
function measure() {
  const terminal = host.value?.parentElement?.querySelector<HTMLElement>(
    ".pane-frame-main, .mobile-shell-pane",
  );
  const term = registry?.get(props.paneId)?.term;
  const minimum = term ? getCellSize(term).height : 18;
  available.value = Math.max(
    0,
    Math.floor(
      ((terminal?.clientHeight ?? 22) + (host.value?.clientHeight ?? 0) - minimum - 2) / 22,
    ),
  );
  natural.value = Math.max(1, Math.ceil((text.value?.scrollHeight ?? 22) / 22));
}
let observer: ResizeObserver | undefined;
let cancelDrag: (() => void) | undefined;
function resize(event: PointerEvent) {
  if (event.button !== 0 || !host.value) return;
  event.preventDefault();
  cancelDrag?.();
  const origin = event.clientY,
    initial = rows.value;
  const move = (ev: PointerEvent) => {
    preview.value = Math.max(
      1,
      Math.min(maxRows.value, Math.round(initial + (origin - ev.clientY) / 22)),
    );
  };
  const end = () => {
    const value = preview.value;
    cancelDrag?.();
    if (value !== null)
      settings.setStatuslineSettings({
        ...loadStatuslineSettings(settings.statuslineSettings),
        rows: Math.min(maxRows.value, value),
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
  if (host.value) {
    observer.observe(host.value);
    if (host.value.parentElement) observer.observe(host.value.parentElement);
  }
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
    v-show="segments.length && maxRows > 0"
    ref="host"
    class="pane-statusline"
    data-pane-statusline
    :data-pane-id="paneId"
  >
    <div class="statusline-width" :style="{ height: `${rows * 22 + 2}px` }">
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
        aria-label="Statuslineの表示行数"
        aria-orientation="horizontal"
        :aria-valuenow="rows"
        :aria-valuemin="1"
        :aria-valuemax="maxRows"
        tabindex="0"
        class="statusline-resize"
        @pointerdown="resize"
        @dblclick="setRows(1)"
        @keydown.up.prevent="setRows(rows + 1)"
        @keydown.down.prevent="setRows(rows - 1)"
      ></div>
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
  align-items: flex-start;
  position: relative;
  width: 100%;
  padding-top: 2px;
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
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.statusline-text {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-all;
}
.statusline-resize {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: ns-resize;
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
