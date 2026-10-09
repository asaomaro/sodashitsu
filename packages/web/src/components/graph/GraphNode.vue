<script setup lang="ts">
/**
 * グラフのノード（20260927-agent-graph の design「web」の表）。pane の呼び名・マシン・エージェントの名前と種類・状態の印（`StateIcon`）・
 * 線を作るハンドル・「pane へ」。`role="group"`＋`aria-roledescription="ノード"`。位置と大きさは世界の座標（`GRAPH_NODE_WIDTH`×`GRAPH_NODE_HEIGHT`
 * に固定——線の経路の計算〔client-core の geometry〕と見た目を合わせる）。
 * ドラッグ・接続の判断は親（`GraphView`）が持つ。ここは押されたことを伝えるだけ。
 */
import { computed } from "vue";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, stateLabel } from "@sodashitsu/client-core";
import type { GraphNodeInfo } from "../../store/graph.js";
import StateIcon from "../StateIcon.vue";

const props = defineProps<{
  info: GraphNodeInfo;
  x: number;
  y: number;
  selected: boolean;
  /** Tab の入口（tabindex=0）か。ほかのノードは -1（ノードの間の Tab は親が読み順で動かす）。 */
  tabbable: boolean;
  /** 無効なノードの「選び直す…」を出すか（条件は親の `canRekey` 1 か所）。 */
  rekeyable?: boolean;
  /** 読み取りだけ（モバイル）。ハンドル・「pane へ」を出さない。 */
  readOnly?: boolean;
  /** 接続モード・線のドラッグの元。 */
  connectSource?: boolean;
  /** 接続モードで先に選べる／ドラッグで離せば結ばれる。 */
  dropTarget?: boolean;
  outCount: number;
  inCount: number;
}>();

const emit = defineEmits<{
  bodyPointerdown: [ev: PointerEvent];
  handlePointerdown: [ev: PointerEvent];
  handleClick: [];
  goto: [];
  rekey: [];
  /** サブエージェントの一覧を開く（件数のボタン。20261004-subagent-display）。 */
  subagents: [];
}>();

const invalid = computed(() => props.info.exists === false);

const agentLine = computed(() => {
  const a = props.info.agent;
  if (!a) return "エージェントなし";
  const name = a.name && a.name !== a.label ? `${a.name}（${a.label}）` : a.label || a.kind;
  return name;
});

/** エージェントが動かしているサブエージェントの件数（報告を受けていない・0 件は 0。ボタンは 1 件以上のときだけ出す）。 */
// 切れたマシンの最後の要約の件数は出さない（状態の印と同じ。`exists` が true のときだけ＝繋がっている）。
const subagentCount = computed(() =>
  props.info.exists === true ? (props.info.agent?.subagents?.count ?? 0) : 0,
);

const ariaLabel = computed(() => {
  const parts = [props.info.name, props.info.machineLabel];
  if (invalid.value) parts.push("無効（pane がありません）");
  else if (props.info.exists === null) parts.push("マシンに未接続");
  parts.push(agentLine.value);
  const s = stateLabel(props.info.state);
  if (s) parts.push(s);
  if (subagentCount.value > 0) parts.push(`サブエージェント ${subagentCount.value} 件`);
  parts.push(`出る線 ${props.outCount} 本・入る線 ${props.inCount} 本`);
  return parts.join("・");
});
</script>

<template>
  <div
    class="graph-node"
    :class="{
      'graph-node-selected': selected,
      'graph-node-invalid': invalid,
      'graph-node-source': connectSource,
      'graph-node-drop': dropTarget,
    }"
    role="group"
    aria-roledescription="ノード"
    :aria-label="ariaLabel"
    :tabindex="tabbable ? 0 : -1"
    :data-node-key="info.key"
    :style="{
      left: `${x}px`,
      top: `${y}px`,
      width: `${GRAPH_NODE_WIDTH}px`,
      height: `${GRAPH_NODE_HEIGHT}px`,
    }"
    @pointerdown="emit('bodyPointerdown', $event)"
  >
    <div class="graph-node-head">
      <span class="graph-node-name">{{ info.name }}</span>
      <span class="graph-node-machine">{{ info.machineLabel }}</span>
    </div>
    <div class="graph-node-agent">
      <StateIcon class="graph-node-state" :state="info.state" />
      <span class="graph-node-agent-name">{{ agentLine }}</span>
      <!-- サブエージェントの件数（20261004-subagent-display）。エージェントの行の右。ノードの大きさは変えない。読み取りだけ（モバイル）では数だけで押せない。 -->
      <template v-if="subagentCount > 0">
        <span
          v-if="readOnly"
          class="graph-node-subagents graph-node-subagents-static"
          :aria-label="`サブエージェント ${subagentCount} 件`"
        >
          <svg class="graph-node-subagents-icon" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 1v6a2 2 0 0 0 2 2h5M7 6l3 3-3 3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
          </svg>
          <span aria-hidden="true">{{ subagentCount }}</span>
        </span>
        <button
          v-else
          type="button"
          class="graph-node-subagents"
          tabindex="-1"
          :aria-label="`${info.name} のサブエージェント ${subagentCount} 件を表示`"
          data-subagents-button
          @pointerdown.stop
          @click.stop="emit('subagents')"
        >
          <svg class="graph-node-subagents-icon" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 1v6a2 2 0 0 0 2 2h5M7 6l3 3-3 3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
          </svg>
          <span aria-hidden="true">{{ subagentCount }}</span>
        </button>
      </template>
    </div>
    <div v-if="invalid" class="graph-node-warn">
      ⚠ 無効（pane がありません）
      <!-- 選び直す（rekey_node で線を保つ。design「選び直すか除去するまで」）。キーは r。 -->
      <button
        v-if="rekeyable"
        type="button"
        class="graph-node-rekey"
        tabindex="-1"
        :aria-label="`${info.name} のノードを別の pane に選び直す`"
        @pointerdown.stop
        @click.stop="emit('rekey')"
      >
        選び直す…
      </button>
    </div>
    <div v-else-if="info.exists === null" class="graph-node-warn">未接続</div>
    <button
      v-if="!readOnly && !invalid"
      type="button"
      class="graph-node-goto"
      tabindex="-1"
      :aria-label="`${info.name} の pane へ移動`"
      @pointerdown.stop
      @click.stop="emit('goto')"
    >
      pane へ
    </button>
    <button
      v-if="!readOnly"
      type="button"
      class="graph-node-handle"
      tabindex="-1"
      :aria-label="`${info.name} から線を結ぶ`"
      title="ドラッグして別のノードへ線を結ぶ（押すと接続モード）"
      @pointerdown.stop="emit('handlePointerdown', $event)"
      @click.stop="emit('handleClick')"
    ></button>
  </div>
</template>

<style scoped>
.graph-node {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
  cursor: grab;
  user-select: none;
  touch-action: none;
  outline: none;
}
.graph-node:focus-visible,
.graph-node-selected {
  border-color: var(--soda-accent, #6070a1);
  box-shadow: 0 0 0 2px var(--soda-accent, #6070a1);
}
.graph-node-source {
  box-shadow: 0 0 0 2px var(--soda-state-working, #f1fa8c);
}
.graph-node-drop {
  border-style: dashed;
  border-color: var(--soda-state-working, #f1fa8c);
}
.graph-node-invalid {
  opacity: 0.7;
  border-style: dashed;
}
.graph-node-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.graph-node-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: bold;
}
.graph-node-machine {
  flex: none;
  opacity: 0.7;
  font-size: 11px;
}
.graph-node-agent {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.graph-node-agent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-node-subagents {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  margin-left: auto;
  padding: 0 5px;
  height: 14px;
  line-height: 1;
  font-size: 11px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 7px;
  background: transparent;
  color: inherit;
}
button.graph-node-subagents {
  cursor: pointer;
}
button.graph-node-subagents:hover {
  background: var(--soda-subtle-bg, #343746);
}
.graph-node-subagents-icon {
  width: 10px;
  height: 10px;
}
.graph-node-warn {
  color: var(--soda-warn-fg, #ffb86c);
  font-size: 11px;
}
.graph-node-rekey {
  margin-left: 4px;
  padding: 0 6px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-subtle-bg, #343746);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 11px;
  cursor: pointer;
}
.graph-node-goto {
  position: absolute;
  right: 18px;
  bottom: 4px;
  padding: 0 6px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}
.graph-node-handle {
  position: absolute;
  top: 50%;
  right: -7px;
  width: 14px;
  height: 14px;
  margin-top: -7px;
  padding: 0;
  border: 2px solid var(--soda-accent, #6070a1);
  border-radius: 50%;
  background: var(--soda-bg, #282a36);
  cursor: crosshair;
}
.graph-node-handle::before {
  /* 当たりを見た目より広く（24px）。 */
  content: "";
  position: absolute;
  inset: -6px;
}
</style>
