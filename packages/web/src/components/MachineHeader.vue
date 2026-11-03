<script setup lang="ts">
import type { MachineState } from "@sodashitsu/protocol";
import { computed, inject } from "vue";
import { MachineSwitcherKey } from "../injection.js";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";
import { useMachinesStore } from "../store/machines.js";
import {desktopWindowUrl} from "../desktop/monitorWindow.js";
import { useViewStore } from "../store/view.js";

/**
 * サイドバーのマシンのまとまりの見出し（20260927-multi-host-machines の design「サイドバー」）。WAI-ARIA の Disclosure の形（research F18）:
 * 折りたたみのボタン（`aria-expanded`。押してもフォーカスはボタンに残り、選んでいるマシンは変えない）と、名前と状態のボタン
 * （押すとそのマシンへ切り替える＝herdr と同じ。切れていれば `disabled`）。Enter/Space はネイティブの click に任せ、`main.ts` の keydown へ二重に渡さない。
 */
const props = defineProps<{ machineId: string; label: string; compact: boolean }>();
const machines = useMachinesStore();
const view = useViewStore();
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

function openDesktop():void{if(props.machineId===LOCAL_MACHINE_ID||state.value!=="online")return;window.open(desktopWindowUrl({machineId:props.machineId,label:props.label},location.origin).href,"_blank","noopener");}

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
    <button data-assistant-feature
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
    </button>
    <component :is="machineId === LOCAL_MACHINE_ID ? 'span' : 'button'"
      :type="machineId === LOCAL_MACHINE_ID ? undefined : 'button'"
      class="machine-desktop soda-button-plain" :data-state="state"
      :role="machineId === LOCAL_MACHINE_ID ? 'img' : undefined"
      :disabled="machineId !== LOCAL_MACHINE_ID && state !== 'online' ? true : undefined"
      :aria-label="machineId === LOCAL_MACHINE_ID ? `${label}: ${stateText}` : `${label} のデスクトップを別窓で開く・${stateText}`"
      :title="machineId === LOCAL_MACHINE_ID ? `${label}: ${stateText}` : `${label}: ${stateText} — デスクトップを別窓で開く`"
      @click="openDesktop" @keydown="onButtonKeydown">
      <svg class="machine-pc-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="13" rx="2" />
        <path d="M12 16v5m-4 0h8" />
      </svg>
    </component>

  </div>
</template>

<style scoped>
.machine-desktop{flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0.15em 0.3em;border:0;background:none;font:inherit;cursor:pointer;}
span.machine-desktop,.machine-desktop:disabled{cursor:default;opacity:1;}
.machine-pc-icon{display:block;color:var(--soda-state-idle,#8b93a5);}
.machine-desktop[data-state="online"] .machine-pc-icon{color:var(--soda-state-done,#50a55b);}
.machine-desktop[data-state="connecting"] .machine-pc-icon,
.machine-desktop[data-state="reconnecting"] .machine-pc-icon{color:var(--soda-warn-fg,#ffb86c);}
.machine-desktop[data-state="attention"] .machine-pc-icon{color:var(--soda-error-fg,#ff5555);}
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
</style>
