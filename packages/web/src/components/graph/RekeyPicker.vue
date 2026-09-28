<script setup lang="ts">
/**
 * 無効なノードを別の pane に選び直す（20260927-agent-graph の design「`session.json` が読めなかった起動で手元のノードを stale にする…利用者がノードを
 * 選び直すか除去するまで」・g03 点検）。`rekey_node` で送るので、ノードに繋がる線はそのまま付け替わる。
 * 候補はグラフに載っていない同じマシンの pane と、同じ番号の今の pane（id を振り直した後に同じ番号で開いた pane。選べば「無効」の印だけが外れる）。
 * 別のマシンのノード（その pane が閉じた）も同じマシンの pane から選び直せる（04）。
 * `Esc`・取り消し・外側のクリックは何も変えずに閉じる。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import type { NodeKey } from "@sodashitsu/protocol";
import {
  LOCAL_MACHINE_ID,
  nodeKey,
  paneNameOf,
  parseNodeKey,
  sameNodeMachine,
} from "@sodashitsu/client-core";
import { useGraphStore } from "../../store/graph.js";
import { summaryPaneName, useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";

const props = defineProps<{ nodeKey: NodeKey }>();
const emit = defineEmits<{ pick: [newKey: NodeKey]; close: [] }>();

const graph = useGraphStore();
const session = useSessionStore();
const machines = useMachinesStore();
const rootEl = ref<HTMLElement | null>(null);
const chosen = ref<NodeKey | null>(null);

interface Row {
  key: NodeKey;
  name: string;
  note: string | null;
  /** 選べない（マシンが繋がっていない。最後の要約の pane は今あるとは限らない。g04 点検）。 */
  disabled: boolean;
}

const rows = computed<Row[]>(() => {
  const onGraph = new Set<string>(graph.nodes.map((n) => n.key));
  const out: Row[] = [];
  const push = (key: NodeKey, name: string, agent: string | null): void => {
    if (onGraph.has(key) && key !== props.nodeKey) return;
    // 同じマシンの pane だけ（規則はサーバ・sodactl と同じ client-core の 1 つ。統合レビュー R1）
    if (!sameNodeMachine(props.nodeKey, key)) return;
    const note = key === props.nodeKey ? "同じ番号の今の pane" : agent;
    out.push({
      key,
      name,
      note: connected ? note : `未接続${note ? `・${note}` : ""}`,
      disabled: !connected,
    });
  };
  // 候補はノードと同じマシンの pane（別のマシンのノードを手元の pane に付け替えない。04 で別のマシンのノードにも広げた）。
  const machine = parseNodeKey(props.nodeKey)?.machine ?? LOCAL_MACHINE_ID;
  const connected = graph.machineConnected(machine);
  if (machines.selectedId === machine) {
    for (const pane of session.panes.values())
      push(nodeKey(machine, pane.id), paneNameOf(pane), pane.agent?.label ?? null);
  } else {
    const summary = machines.summaries[machine];
    for (const [paneId, p] of Object.entries(summary?.panes ?? {}))
      push(nodeKey(machine, paneId), summaryPaneName(paneId, p), p.agent?.label ?? null);
  }
  return out;
});

const title = computed(() => `無効なノード（${graph.nodeInfo(props.nodeKey).name}）を選び直す`);

function apply(): void {
  if (chosen.value && rows.value.some((r) => r.key === chosen.value && !r.disabled))
    emit("pick", chosen.value);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("close");
    return;
  }
  if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    ev.stopPropagation();
    apply();
    return;
  }
  ev.stopPropagation();
}

onMounted(() => {
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>("input, button")?.focus());
});
</script>

<template>
  <section
    ref="rootEl"
    class="rekey-picker"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <h3 class="rekey-picker-heading">{{ title }}</h3>
    <p class="rekey-picker-hint">
      選んだ pane にノードを付け替えます。繋がる線はそのまま残ります。
    </p>
    <p v-if="rows.some((r) => r.disabled)" class="rekey-picker-empty">
      このマシンに繋がっていないので選べません（繋がってから選び直してください）。
    </p>
    <p v-if="rows.length === 0" class="rekey-picker-empty">
      選べる pane がありません（グラフに載っていない pane がありません）。
    </p>
    <label v-for="r in rows" :key="r.key" class="rekey-picker-row">
      <input
        v-model="chosen"
        type="radio"
        name="rekey"
        :value="r.key"
        :data-rekey-key="r.key"
        :disabled="r.disabled"
      />
      <span>{{ r.name }}</span>
      <span v-if="r.note" class="rekey-picker-note">{{ r.note }}</span>
    </label>
    <div class="rekey-picker-actions">
      <button type="button" class="rekey-picker-cancel" @click="emit('close')">取り消し</button>
      <button type="button" class="rekey-picker-apply" :disabled="!chosen" @click="apply">
        選び直す
      </button>
    </div>
  </section>
</template>

<style scoped>
.rekey-picker {
  position: absolute;
  top: 44px;
  right: 12px;
  z-index: 10;
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 60px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 13px;
}
.rekey-picker-heading {
  margin: 0;
  font-size: 14px;
}
.rekey-picker-hint,
.rekey-picker-empty {
  margin: 0;
  font-size: 12px;
  opacity: 0.8;
}
.rekey-picker-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rekey-picker-note {
  opacity: 0.7;
  font-size: 11px;
}
.rekey-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.rekey-picker-actions button {
  padding: 3px 10px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
</style>
