<script setup lang="ts">
import type { MachineState } from "@sodashitsu/protocol";
import { computed, inject, nextTick, ref, watch } from "vue";
import DesktopCdpView from "./DesktopCdpView.vue";
import { MachineSwitcherKey } from "../injection.js";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { useMachinesStore } from "../store/machines.js";
import { useViewStore } from "../store/view.js";

/**
 * サイドバーのマシンのまとまりの見出し（20260927-multi-host-machines の design「サイドバー」）。WAI-ARIA の Disclosure の形（research F18）:
 * 折りたたみのボタン（`aria-expanded`。押してもフォーカスはボタンに残り、選んでいるマシンは変えない）と、名前と状態のボタン
 * （押すとそのマシンへ切り替える＝herdr と同じ。切れていれば `disabled`）。Enter/Space はネイティブの click に任せ、`main.ts` の keydown へ二重に渡さない。
 */
const props = defineProps<{ machineId: string; label: string; compact: boolean }>();
const machines = useMachinesStore();
const view = useViewStore();
const vscodeOpen = ref(false), vscodeDialog = ref<HTMLDialogElement>();
async function openVscode(): Promise<void> {
  if (state.value !== "online") return;
  vscodeOpen.value = true;
  await nextTick();
  if (state.value === "online") vscodeDialog.value?.showModal();
  else vscodeOpen.value = false;
}
const switcher = inject(MachineSwitcherKey, undefined);

const selected = computed(() => machines.selectedId === props.machineId);
const collapsed = computed(() => machines.collapsed[props.machineId] === true);
const selectable = computed(() => machines.isSelectable(props.machineId));

/** 見出しに出す状態。ローカルは画面の接続（選んでいるとき）か軽い接続の繋がり、ほかは手元の `soda serve` から見た状態。 */
const state = computed<MachineState>(() => {
  if (props.machineId === LOCAL_MACHINE_ID) {
    const s = machines.summaries[LOCAL_MACHINE_ID];
    const connected = selected.value ? view.connectionState === "open" : s?.connected === true;
    if (connected) return "online";
    return selected.value || s?.everConnected ? "reconnecting" : "connecting";
  }
  return machines.statusOf(props.machineId)?.state ?? "connecting";
});
const STATE_LABEL: Record<MachineState, string> = {
  connecting: "接続中",
  online: "接続済み",
  reconnecting: "再接続中",
  attention: "要対応",
};
const stateText = computed(() => STATE_LABEL[state.value]);
watch(state, value => { if (value !== "online") vscodeOpen.value = false; });
const message = computed(() =>
  props.machineId === LOCAL_MACHINE_ID
    ? null
    : (machines.statusOf(props.machineId)?.message ?? null),
);
const shortLabel = computed(() => [...props.label][0] ?? "?");

/** 選べない理由（読み上げにも出す。`disabled` にせず `aria-disabled` にして Tab で辿れるようにする＝AC-I3）。 */
const unavailable = computed(() => !selected.value && !selectable.value);
const accessibleName = computed(() => {
  const parts = [`マシン ${props.label}`, stateText.value];
  if (selected.value) parts.push("表示中");
  if (message.value) parts.push(message.value);
  if (unavailable.value) parts.push("今は切り替えられません");
  return parts.join("・");
});

function onSelect(): void {
  if (selected.value || !selectable.value) return;
  void switcher?.switchTo(props.machineId);
}

/** Enter/Space を `main.ts` の window keydown（prefix・直接のキー）へ二重に渡さない（`Sidebar.vue` の `onButtonKeydown` と同じ）。 */
function onButtonKeydown(ev: KeyboardEvent): void {
  if ((ev.key === "Enter" || ev.key === " ") && !ev.ctrlKey && !ev.altKey && !ev.metaKey)
    ev.stopPropagation();
}
</script>

<template>
  <div
    class="machine-header"
    :class="{ 'machine-header-dim': state !== 'online', 'machine-header-compact': compact }"
    :data-machine-id="machineId"
  >
    <button
      type="button"
      class="machine-toggle"
      :aria-expanded="!collapsed"
      :aria-controls="selected ? undefined : `machine-rows-${machineId}`"
      :aria-label="`${label} の workspace`"
      @click.stop="machines.toggleCollapsed(machineId)"
      @keydown="onButtonKeydown"
    >
      {{ collapsed ? "▸" : "▾" }}
    </button>
    <button
      type="button"
      class="machine-select"
      :aria-disabled="unavailable ? 'true' : undefined"
      :aria-current="selected ? 'true' : undefined"
      :aria-label="accessibleName"
      :title="message ? `${label}: ${stateText} — ${message}` : `${label}: ${stateText}`"
      @click="onSelect"
      @keydown="onButtonKeydown"
    >
      <span class="machine-label">{{ compact ? shortLabel : label }}</span>
      <span v-if="!compact" class="machine-state" :data-state="state">{{ stateText }}</span>
    </button>
    <button type="button" class="machine-vscode" data-vscode-open
      :disabled="state !== 'online'" :aria-label="`${label} のVSCodeを開く`"
      @click.stop="openVscode" @keydown.stop>VSCode</button>
    <dialog v-if="vscodeOpen" ref="vscodeDialog" class="machine-vscode-dialog" data-vscode-dialog
      :aria-label="`${label} のVSCode`" @close="vscodeOpen = false" @cancel.prevent @keydown.stop>
      <div class="machine-vscode-head"><strong>{{ label }} のVSCode</strong>
        <button type="button" @click="vscodeOpen = false">閉じる</button></div>
      <DesktopCdpView :key="machineId" :machine-id="machineId" :machine-label="label" :enabled="true" />
    </dialog>
  </div>
</template>

<style scoped>
.machine-header {
  display: flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.3em 0.8em 0.1em;
  padding-right: calc(0.8em + 6px);
  font-size: 0.9em;
}
.machine-header-dim .machine-label {
  opacity: 0.7; /* MUTED_TEXT_ALPHA（theme/uiTokens.ts） */
}
.machine-toggle,
.machine-select {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.machine-toggle {
  flex: none;
  width: 1em;
}
.machine-select {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.5em;
  text-align: left;
  font-weight: 600;
}
.machine-select[aria-current="true"] {
  color: var(--soda-accent-fg, #f8f8f2);
}
.machine-select[aria-disabled="true"] {
  cursor: default;
}
/* 畳んだサイドバー（3em）では余白を詰め、名前の先頭 1 文字が切れないようにする（`.sidebar-collapsed .sidebar-session` と同じ）。 */
.machine-header-compact {
  padding-inline: 0.2em;
  gap: 0.1em;
}
.machine-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.machine-state {
  flex: none;
  margin-left: auto;
  font-size: 0.8em;
  font-weight: normal;
  opacity: 0.75;
}
.machine-state[data-state="attention"] {
  color: var(--soda-warn-fg, #ffb86c);
  opacity: 1;
}
</style>

<style scoped>
.machine-vscode { flex:none; font:inherit; cursor:pointer; }
.machine-vscode-dialog { width:min(1400px,94vw); height:90dvh; max-width:94vw; max-height:94dvh; padding:0; border:1px solid var(--soda-menu-border); color:var(--soda-fg); background:var(--soda-bg); }
.machine-vscode-dialog[open] { display:flex; flex-direction:column; }
.machine-vscode-dialog::backdrop { background:#0008; }
.machine-vscode-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px; }
.machine-vscode-dialog :deep(.desktop-cdp) { flex:1; min-height:0; }
</style>
