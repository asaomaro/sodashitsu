<script setup lang="ts">
/**
 * グラフの小さなサブエージェントのノード（20261008-graph-first の PR6b・AC-U1〜U3）。**描くだけの層**——置き場所の計算（`graphLayout`）・保存・
 * `graph.update`・ノードの上限には触れない。親のノードの位置（世界の座標）から毎回導くので、面の移動・拡大縮小・親のドラッグにそのまま付いて動く。
 *
 * - 親（Claude Code のエージェントが動いている pane のノード）の右下から、縦に並べる。入れ子は字下げと、子へ伸びる枝。1 つの親につき 6 個まで、残りは「ほか n 件」の 1 枚（押すと一覧のパネル）。
 * - 現れて 2 秒たつまでは出さない。終わったものは 1 秒かけて消える（`prefers-reduced-motion` では動かさず、すぐ消える）。出入りの台帳は `subagentTree.ts`。
 * - 見るだけ: 動かせない・線を結べない・保存されない。押す・`Enter` は一覧のパネルを開く（PR6c で、記録を読む窓に替わる）。
 * - キーボード: 親のノードで `d` → 最初の小さなノードへ（`focusFirst`）。↑ ↓ で移り、`Esc`・← で親のノードへ戻る。Tab の順には入れない（tabindex=-1）。
 * - 表示は文字だけ（説明はエージェントが書いた文。HTML として出さない）。色は `--soda-*`、角は様式のトークン。
 * 読み取りだけのモバイルの画面には置かない（件数だけ。呼び出し側が出さない）。
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { formatSubagentElapsed, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@sodashitsu/client-core";
import type { SubagentInfo } from "@sodashitsu/protocol";
import type { GraphNodeInfo } from "../../store/graph.js";
import {
  flattenTree,
  ledgerKey,
  ledgerVisible,
  reconcileLedger,
  SUBAGENT_ROWS_MAX,
  type LedgerEntry,
} from "./subagentTree.js";

const props = defineProps<{
  /** 表示中のノード（鍵と世界の座標）。 */
  nodes: readonly { key: string; x: number; y: number }[];
  infos: ReadonlyMap<string, GraphNodeInfo>;
}>();
const emit = defineEmits<{
  /** 小さなノード・「ほか n 件」が押された（親のノードの鍵）。 */
  open: [parentKey: string];
  /** `Esc`・← で、親のノードへ戻る。 */
  leave: [parentKey: string];
}>();

const ROW_H = 26;
const ROW_GAP = 6;
const ROW_W = 156;
const INDENT = 14;
/** 親のノードの右端からの間隔と、列の上端（親の下の縁から上へ）。 */
const COLUMN_GAP = 20;
const COLUMN_UP = 14;

const root = ref<HTMLElement | null>(null);

/** 繋がっているエージェントのサブエージェントだけ（切れたマシンの最後の要約・エージェントの居ない pane は出さない）。 */
const live = computed(() => {
  const out = new Map<string, { parentKey: string; item: SubagentInfo }>();
  for (const n of props.nodes) {
    const info = props.infos.get(n.key);
    if (!info || info.exists !== true) continue;
    for (const item of info.agent?.subagents?.items ?? []) out.set(ledgerKey(n.key, item.id), { parentKey: n.key, item });
  }
  return out;
});

const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const now = ref(Date.now());
const ledger = shallowRef<Map<string, LedgerEntry<SubagentInfo>>>(new Map());
let timer: ReturnType<typeof setInterval> | undefined;

function sync(): void {
  now.value = Date.now();
  ledger.value = reconcileLedger(ledger.value, live.value, now.value, reducedMotion());
  // 時間がたてば変わるもの（まだ出していない・消える途中・経過時間）がある間だけ、時計を進める。
  if (ledger.value.size > 0 && timer === undefined) timer = setInterval(sync, 500);
  else if (ledger.value.size === 0 && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}
watch(live, sync, { immediate: true });
onBeforeUnmount(() => {
  if (timer !== undefined) clearInterval(timer);
});

interface RowView {
  id: string;
  parentKey: string;
  left: number;
  top: number;
  width: number;
  label: string;
  desc: string;
  elapsed: string;
  background: boolean;
  leaving: boolean;
  z: number;
  aria: string;
  /** 枝の始点（親のノードの右端、または親の行の左の下）と終点（この行の左の中央）。 */
  branch: { fromX: number; fromY: number; trunkX: number; toX: number; toY: number };
}
interface MoreView {
  parentKey: string;
  left: number;
  top: number;
  n: number;
}
interface Column {
  parentKey: string;
  parentName: string;
  rows: RowView[];
  more: MoreView | null;
}

const columns = computed<Column[]>(() => {
  const t = now.value;
  const byParent = new Map<string, LedgerEntry<SubagentInfo>[]>();
  for (const e of ledger.value.values()) {
    if (!ledgerVisible(e, t)) continue;
    const list = byParent.get(e.parentKey);
    if (list) list.push(e);
    else byParent.set(e.parentKey, [e]);
  }
  const out: Column[] = [];
  for (const n of props.nodes) {
    const entries = byParent.get(n.key);
    if (!entries) continue;
    const info = props.infos.get(n.key);
    entries.sort((a, b) => a.item.startedAt - b.item.startedAt);
    const goneIds = new Set(entries.filter((e) => e.goneAt !== null).map((e) => e.item.id));
    const flat = flattenTree(entries.map((e) => e.item));
    const shown = flat.slice(0, SUBAGENT_ROWS_MAX);
    const hiddenBeyond = Math.max(
      0,
      (info?.agent?.subagents?.count ?? 0) - (info?.agent?.subagents?.items.length ?? 0),
    );
    const moreN = flat.slice(SUBAGENT_ROWS_MAX).filter((r) => !goneIds.has(r.item.id)).length + hiddenBeyond;
    const colX = n.x + GRAPH_NODE_WIDTH + COLUMN_GAP;
    const colY = n.y + GRAPH_NODE_HEIGHT - COLUMN_UP;
    const rows: RowView[] = shown.map((r, i) => {
      const left = colX + r.indent * INDENT;
      const top = colY + i * (ROW_H + ROW_GAP);
      const parentRow = r.parentRow !== null && r.parentRow < shown.length ? shown[r.parentRow] : undefined;
      const parentIdx = r.parentRow;
      const parentLeft = colX + (parentRow?.indent ?? 0) * INDENT;
      const parentTop = colY + (parentIdx ?? 0) * (ROW_H + ROW_GAP);
      const branch =
        parentRow !== undefined && parentIdx !== null
          ? { fromX: parentLeft + 8, fromY: parentTop + ROW_H, trunkX: parentLeft + 8, toX: left, toY: top + ROW_H / 2 }
          : {
              fromX: n.x + GRAPH_NODE_WIDTH,
              fromY: n.y + GRAPH_NODE_HEIGHT - 6,
              trunkX: colX - COLUMN_GAP / 2,
              toX: left,
              toY: top + ROW_H / 2,
            };
      const s = r.item;
      const label = s.type ?? "サブエージェント";
      const elapsed = formatSubagentElapsed(s.startedAt, t);
      return {
        id: s.id,
        parentKey: n.key,
        left,
        top,
        width: ROW_W - r.indent * INDENT,
        label,
        desc: s.description ?? "",
        elapsed,
        background: s.background === true,
        leaving: goneIds.has(s.id),
        z: 50 - r.indent, // 親に近い側を前に出す
        aria: [
          `サブエージェント ${label}`,
          s.description,
          `経過 ${elapsed}`,
          s.background ? "バックグラウンド" : null,
          s.parentId !== undefined ? "入れ子" : null,
        ]
          .filter((x): x is string => !!x)
          .join("・"),
        branch,
      };
    });
    out.push({
      parentKey: n.key,
      parentName: info?.name ?? "",
      rows,
      more:
        moreN > 0
          ? { parentKey: n.key, left: colX, top: colY + rows.length * (ROW_H + ROW_GAP), n: moreN }
          : null,
    });
  }
  return out;
});

/** 枝（保存しない、見るだけの細い線）。親のノードの右端／親の行の下から、行の左へ。 */
const branches = computed(() =>
  columns.value.flatMap((c) =>
    c.rows.map((r) => ({
      key: `${r.parentKey}\n${r.id}`,
      leaving: r.leaving,
      d: `M ${r.branch.fromX} ${r.branch.fromY} H ${r.branch.trunkX} V ${r.branch.toY} H ${r.branch.toX}`,
    })),
  ),
);

/** 親のノードの、最初の小さなノードへフォーカスを移す。移せたら true。 */
function focusFirst(parentKey: string): boolean {
  const el = buttonsOf(parentKey)[0];
  if (!el) return false;
  el.focus({ preventScroll: true });
  return true;
}
function buttonsOf(parentKey: string): HTMLButtonElement[] {
  const all = root.value?.querySelectorAll<HTMLButtonElement>("button[data-subagent-parent]") ?? [];
  return [...all].filter((b) => b.dataset["subagentParent"] === parentKey);
}
/** その親に、いま出ている小さなノードがあるか。 */
function hasRows(parentKey: string): boolean {
  return columns.value.some((c) => c.parentKey === parentKey && c.rows.some((r) => !r.leaving));
}
defineExpose({ focusFirst, hasRows });

function onKeydown(ev: KeyboardEvent, parentKey: string): void {
  if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === "Escape" || ev.key === "ArrowLeft") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("leave", parentKey);
  } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    ev.stopPropagation();
    const list = buttonsOf(parentKey);
    const i = list.indexOf(ev.currentTarget as HTMLButtonElement);
    const next = list[i + (ev.key === "ArrowDown" ? 1 : -1)];
    next?.focus({ preventScroll: true });
  } else if (ev.key === "Enter" || ev.key === " ") {
    ev.stopPropagation(); // ボタンの押下として働く（グラフ画面の Enter〔端末の窓〕に渡さない）
  }
}
</script>

<template>
  <div v-if="columns.length > 0" ref="root" class="graph-subagents" data-graph-subagents>
    <svg class="graph-subagent-branches" width="1" height="1" aria-hidden="true">
      <path
        v-for="b in branches"
        :key="b.key"
        class="graph-subagent-branch"
        :class="{ 'graph-subagent-leaving': b.leaving }"
        :d="b.d"
      />
    </svg>
    <template v-for="c in columns" :key="c.parentKey">
      <div class="graph-subagent-group" role="group" :aria-label="`${c.parentName} のサブエージェント`">
        <button
          v-for="r in c.rows"
          :key="r.id"
          type="button"
          class="graph-subagent"
          :class="{ 'graph-subagent-leaving': r.leaving }"
          tabindex="-1"
          :data-subagent-parent="c.parentKey"
          :data-subagent-id="r.id"
          :aria-label="r.aria"
          :style="{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${ROW_H}px`, zIndex: r.z }"
          @pointerdown.stop
          @keydown="onKeydown($event, c.parentKey)"
          @click.stop="emit('open', c.parentKey)"
        >
          <span class="graph-subagent-type">{{ r.label }}</span>
          <span v-if="r.desc" class="graph-subagent-desc">{{ r.desc }}</span>
          <span v-if="r.background" class="graph-subagent-bg" title="バックグラウンド" aria-hidden="true">bg</span>
          <span class="graph-subagent-time" aria-hidden="true">{{ r.elapsed }}</span>
        </button>
        <button
          v-if="c.more"
          type="button"
          class="graph-subagent graph-subagent-more"
          tabindex="-1"
          :data-subagent-parent="c.parentKey"
          data-subagent-more
          :aria-label="`ほか ${c.more.n} 件。押すと一覧`"
          :style="{ left: `${c.more.left}px`, top: `${c.more.top}px`, width: `${ROW_W}px`, height: `${ROW_H}px` }"
          @pointerdown.stop
          @keydown="onKeydown($event, c.parentKey)"
          @click.stop="emit('open', c.parentKey)"
        >
          ほか {{ c.more.n }} 件
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.graph-subagents {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.graph-subagent-branches {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
}
.graph-subagent-branch {
  fill: none;
  stroke: var(--soda-menu-border, #44475a);
  stroke-width: 1;
  opacity: 1;
  transition: opacity 1s linear;
}
.graph-subagent {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font: inherit;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  opacity: 1;
  transition: opacity 1s linear;
}
.graph-subagent:hover {
  background: var(--soda-subtle-bg, #343746);
}
.graph-subagent:focus-visible {
  outline: none;
  border-color: var(--soda-accent, #6070a1);
  box-shadow: 0 0 0 2px var(--soda-accent, #6070a1);
}
.graph-subagent-leaving {
  opacity: 0;
  pointer-events: none;
}
.graph-subagent-type {
  flex: none;
  max-width: 7em;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
}
.graph-subagent-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--soda-menu-fg, #f8f8f2) 78%, transparent);
}
.graph-subagent-bg {
  flex: none;
  padding: 1px 4px;
  border-radius: var(--soda-shape-radius);
  background: var(--soda-subtle-bg, #343746);
  font-size: 10px;
}
.graph-subagent-time {
  flex: none;
  margin-left: auto;
  color: color-mix(in srgb, var(--soda-menu-fg, #f8f8f2) 70%, transparent);
}
.graph-subagent-more {
  justify-content: center;
  border-style: dashed;
  color: color-mix(in srgb, var(--soda-menu-fg, #f8f8f2) 78%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .graph-subagent,
  .graph-subagent-branch {
    transition: none;
  }
}
</style>
