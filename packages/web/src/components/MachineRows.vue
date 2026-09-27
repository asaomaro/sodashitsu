<script setup lang="ts">
import type { DisplayState } from "@sodashitsu/protocol";
import { computed, inject } from "vue";
import { MachineSwitcherKey } from "../injection.js";
import { useMachinesStore } from "../store/machines.js";
import { aggregate, displayStateFor, useSeenStore } from "../store/seen.js";
import { stateLabel } from "../store/stateIndicator.js";
import StateIcon from "./StateIcon.vue";

/**
 * 選んでいないマシンの workspace の行（20260927-multi-host-machines の design「サイドバー」）。軽い接続の要約から作る平らな一覧（decisions D8）。
 * 行は `button`（Tab で辿れ、Enter/Space で選べる）で、押すとそのマシンへ切り替えてその workspace を表示する。切れていれば最後の状態を薄く出し
 * `disabled`。今までの workspace の行の D&D・右クリックのメニューには繋がない（別の要素）。
 */
const props = defineProps<{ machineId: string; compact: boolean }>();
const machines = useMachinesStore();
const seen = useSeenStore();
const switcher = inject(MachineSwitcherKey, undefined);

const summary = computed(() => machines.summaries[props.machineId]);
const selectable = computed(() => machines.isSelectable(props.machineId));
const rows = computed(() =>
  (summary.value?.workspaces ?? []).map((ws) => {
    const states = machines
      .agentsInWorkspace(props.machineId, ws.id)
      .map((a) =>
        displayStateFor(a, seen.getSeenSeqIn(props.machineId, a.instanceId, a.serverSeenSeq)),
      );
    return { ws, state: aggregate(states) as DisplayState | null };
  }),
);

/** 行の読み上げの名前（中身の状態の印の名前を上書きするので、状態をここに含める）。 */
function rowName(label: string, state: DisplayState | null): string {
  const s = stateLabel(state);
  return [label, s, "別のマシン", selectable.value ? "押すと切り替え" : "切断中"]
    .filter((x) => x !== null)
    .join("・");
}

function onSelect(workspaceId: string, tabId: string): void {
  if (!selectable.value) return;
  void switcher?.switchTo(props.machineId, { workspaceId, tabId });
}

function onButtonKeydown(ev: KeyboardEvent): void {
  if ((ev.key === "Enter" || ev.key === " ") && !ev.ctrlKey && !ev.altKey && !ev.metaKey)
    ev.stopPropagation();
}
</script>

<template>
  <div
    :id="`machine-rows-${machineId}`"
    class="machine-rows"
    :class="{ 'machine-rows-dim': !selectable, 'machine-rows-compact': compact }"
    :data-machine-rows="machineId"
  >
    <div v-if="!summary?.everConnected" class="machine-rows-empty">
      {{ compact ? "…" : "未接続" }}
    </div>
    <button
      v-for="{ ws, state } in rows"
      :key="ws.id"
      type="button"
      class="machine-row"
      :aria-disabled="selectable ? undefined : 'true'"
      :data-machine-workspace="ws.id"
      :aria-label="rowName(ws.label, state)"
      @click="onSelect(ws.id, ws.activeTabId)"
      @keydown="onButtonKeydown"
    >
      <StateIcon class="sidebar-state-icon" :state="state" />
      <span v-if="!compact" class="machine-row-label">{{ ws.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.machine-rows-empty {
  padding: 0.3em 0.8em 0.3em 2.1em;
  font-size: 0.85em;
  opacity: 0.7; /* MUTED_TEXT_ALPHA（theme/uiTokens.ts）。薄い文字もこれより薄くしない */
}
.machine-row {
  display: flex;
  align-items: center;
  gap: 0.5em;
  width: 100%;
  padding: 0.4em 0.8em;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
}
.machine-row:hover:not([aria-disabled="true"]) {
  background: var(--soda-menu-hover-bg, #343746);
}
/* 切れているマシンの行は無効な部品（`aria-disabled`）として薄く描く（最後の状態を「古い情報」と分かる形で。WCAG の対比の対象外）。 */
.machine-row[aria-disabled="true"] {
  cursor: default;
  opacity: 0.5;
}
.machine-rows-compact .machine-rows-empty,
.machine-rows-compact .machine-row {
  padding-inline: 0.2em;
}
.machine-row-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
