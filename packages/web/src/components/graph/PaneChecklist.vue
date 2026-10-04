<script setup lang="ts">
/**
 * pane をグラフに載せる/外すチェックリスト（20260927-agent-graph の design「ノードを載せる」・F2〔すべての pane を自動で載せない〕）。
 * ツールバーの「pane を載せる」から開くポップオーバー。チェックを変えて「適用」で確定し、`Esc`・取り消し・外側のクリックは何も変えずに閉じる（AC-I1）。
 * 外すときの確認（消える線の本数）は親（`GraphView`）が出す。
 *
 * 手元と登録したマシンの pane を workspace ごとに選べる（別のマシンの節は 04）。上の一覧に無いノード（無効・閉じた pane・繋がっていない
 * マシンのノード）は「そのほか」に出し、外せる。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import type { NodeKey } from "@sodashitsu/protocol";
import { LOCAL_MACHINE_ID, nodeKey, paneNameOf } from "@sodashitsu/client-core";
import { useGraphStore } from "../../store/graph.js";
import { summaryPaneName, useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";

const emit = defineEmits<{ apply: [change: { add: NodeKey[]; remove: NodeKey[] }]; close: [] }>();

const graph = useGraphStore();
const session = useSessionStore();
const machines = useMachinesStore();
const rootEl = ref<HTMLElement | null>(null);

interface Row {
  key: NodeKey;
  name: string;
  note: string | null;
  /** 載せられない（マシンが繋がっていない。最後の要約の pane は今あるとは限らない。載っているものは外せる。04 レビュー R1）。 */
  disabled?: boolean;
}
interface Section {
  id: string;
  label: string;
  rows: Row[];
}

/**
 * 1 台のマシンの pane の節（workspace ごと。その中は tab・pane の順）。画面の接続が向いているマシンは session の全体から、ほかのマシン
 * （別のマシンを見ている間の手元を含む）は軽い接続の要約から。手元の節の見出しは workspace の名前だけ、別のマシンは「マシン / workspace」（04）。
 */
function sectionsOf(machine: string, machineLabel: string | null): Section[] {
  const out: Section[] = [];
  const legend = (ws: string, connected = true): string =>
    (machineLabel === null ? ws : `${machineLabel} / ${ws}`) + (connected ? "" : "（未接続）");
  if (machine === machines.selectedId) {
    const connected = graph.machineConnected(machine);
    for (const ws of session.workspaces.values()) {
      const rows: Row[] = [];
      for (const tabId of ws.tabIds) {
        for (const pane of session.panes.values()) {
          if (pane.tabId !== tabId) continue;
          const key = nodeKey(machine, pane.id);
          rows.push({
            key,
            name: paneNameOf(pane),
            note: pane.agent?.label ?? null,
            disabled: !connected && !initialOnGraph.has(key),
          });
        }
      }
      if (rows.length > 0)
        out.push({ id: `${machine}/${ws.id}`, label: legend(ws.label, connected), rows });
    }
    return out;
  }
  const summary = machines.summaries[machine];
  if (!summary) return out;
  for (const ws of summary.workspaces) {
    const rows: Row[] = [];
    for (const [paneId, p] of Object.entries(summary.panes)) {
      if (summary.tabWorkspace[p.tabId] !== ws.id) continue;
      const key = nodeKey(machine, paneId);
      rows.push({
        key,
        name: summaryPaneName(paneId, p),
        note: p.agent?.label ?? null,
        disabled: !summary.connected && !initialOnGraph.has(key),
      });
    }
    if (rows.length > 0)
      out.push({ id: `${machine}/${ws.id}`, label: legend(ws.label, summary.connected), rows });
  }
  return out;
}

const machineSections = computed<Section[]>(() => [
  ...sectionsOf(LOCAL_MACHINE_ID, null),
  ...machines.machines.flatMap((m) => sectionsOf(m.id, m.label)),
]);

/**
 * pane を出せないマシン（一度も繋がっていない。画面の接続が向いているマシンは session が空で繋がっていない＝切り替えの途中・切れた）。
 * 手元も含める（手元の軽い接続がまだ繋がっていないと、手元の節が黙って消える。g04 点検）。
 */
const unreachable = computed(() =>
  [{ id: LOCAL_MACHINE_ID, label: "ローカル" }, ...machines.machines]
    .filter((m) =>
      m.id === machines.selectedId
        ? session.workspaces.size === 0 && !graph.machineConnected(m.id)
        : machines.summaries[m.id]?.everConnected !== true,
    )
    .map((m) => m.label),
);

/** グラフに載っているが上の一覧に無いノード（別のマシン・無効・閉じた pane）。 */
const otherRows = computed<Row[]>(() => {
  const listed = new Set(machineSections.value.flatMap((s) => s.rows.map((r) => r.key)));
  return graph.nodes
    .filter((n) => !listed.has(n.key))
    .map((n) => {
      const info = graph.nodeInfo(n.key);
      const note =
        info.exists === false
          ? "無効（pane がありません）"
          : info.exists === null
            ? `${info.machineLabel}（未接続）`
            : info.local
              ? null
              : info.machineLabel;
      return { key: n.key, name: info.name, note };
    });
});

/**
 * 開いた時点で載っていたノード（写し）。差分（足す/外す）はこれと比べて作る——今の載り方と比べると、開いている間に他の画面・sodactl で
 * 足された・外されたノードを適用で巻き戻してしまう（レビュー R6）。
 */
const initialOnGraph: ReadonlySet<string> = new Set(graph.nodes.map((n) => n.key));
const checked = ref(new Set<string>(initialOnGraph));
const filter = ref("");

function visible(rows: Row[]): Row[] {
  const q = filter.value.trim().toLowerCase();
  return q === ""
    ? rows
    : rows.filter((r) => r.name.toLowerCase().includes(q) || r.key.includes(q));
}

function toggle(key: string, on: boolean): void {
  const next = new Set(checked.value);
  if (on) next.add(key);
  else next.delete(key);
  checked.value = next;
}

const change = computed(() => {
  const add = [...checked.value].filter((k) => !initialOnGraph.has(k)) as NodeKey[];
  const remove = [...initialOnGraph].filter((k) => !checked.value.has(k)) as NodeKey[];
  return { add, remove };
});
const changed = computed(() => change.value.add.length + change.value.remove.length > 0);

function apply(): void {
  if (!changed.value) {
    emit("close");
    return;
  }
  emit("apply", change.value);
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
  // グラフの操作のキー（1・+・Delete 等）へ渡さない。
  ev.stopPropagation();
}

onMounted(() => {
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>("input")?.focus());
});
</script>

<template>
  <section
    ref="rootEl"
    class="pane-checklist"
    role="dialog"
    aria-modal="true"
    aria-label="pane を載せる"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <h3 class="pane-checklist-heading">グラフに載せる pane</h3>
    <input
      v-model="filter"
      type="search"
      class="pane-checklist-filter"
      placeholder="絞り込み"
      aria-label="pane を絞り込む"
    />
    <div class="pane-checklist-list">
      <p v-if="machineSections.length === 0 && otherRows.length === 0" class="pane-checklist-empty">
        pane がありません。
      </p>
      <fieldset v-for="sec in machineSections" :key="sec.id" class="pane-checklist-section">
        <legend>{{ sec.label }}</legend>
        <label v-for="r in visible(sec.rows)" :key="r.key" class="pane-checklist-row">
          <input
            type="checkbox"
            :checked="checked.has(r.key)"
            :disabled="r.disabled"
            :data-pane-key="r.key"
            @change="toggle(r.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ r.name }}</span>
          <span v-if="r.note" class="pane-checklist-note">{{ r.note }}</span>
        </label>
      </fieldset>
      <p v-for="label in unreachable" :key="label" class="pane-checklist-empty">
        {{ label }}: 繋がっていないので pane を出せません。
      </p>
      <fieldset v-if="otherRows.length > 0" class="pane-checklist-section">
        <legend>そのほか（載っているノード）</legend>
        <label v-for="r in visible(otherRows)" :key="r.key" class="pane-checklist-row">
          <input
            type="checkbox"
            :checked="checked.has(r.key)"
            :data-pane-key="r.key"
            @change="toggle(r.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ r.name }}</span>
          <span v-if="r.note" class="pane-checklist-note">{{ r.note }}</span>
        </label>
      </fieldset>
    </div>
    <div class="pane-checklist-actions">
      <button type="button" class="pane-checklist-cancel" @click="emit('close')">取り消し</button>
      <button type="button" class="pane-checklist-apply" @click="apply">適用</button>
    </div>
  </section>
</template>

<style scoped>
.pane-checklist {
  position: absolute;
  top: 44px;
  right: 12px;
  z-index: 10;
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 60px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 6px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 13px;
}
.pane-checklist-heading {
  margin: 0;
  font-size: 14px;
}
.pane-checklist-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.pane-checklist-section {
  margin: 0 0 8px;
  padding: 4px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
}
.pane-checklist-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.pane-checklist-note {
  opacity: 0.7;
  font-size: 11px;
}
.pane-checklist-empty {
  margin: 0;
  opacity: 0.8;
}
.pane-checklist-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.pane-checklist-actions button {
  padding: 3px 10px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
.pane-checklist-apply {
  border-color: var(--soda-accent, #6070a1) !important;
}
</style>
