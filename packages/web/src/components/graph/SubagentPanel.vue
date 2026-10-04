<script setup lang="ts">
/**
 * グラフの中のサブエージェントの一覧（20261004-subagent-display）。`HistoryPanel` と同じ、グラフの `<dialog>` の中に重ねる横のパネル。
 * 中身は `SubagentList`（サイドバーからの一覧のダイアログと共有）。見るだけ。開く入口はノードの件数のボタンのクリックとキー `s`（`GraphView`）。
 * 開いたときに一覧の領域へフォーカスを移す（上下キーですぐ読める）。`Esc`・［×］で閉じる（`GraphView` が閉じるとそのノードへフォーカスを戻す）。
 * 対象のエージェントが居なくなった・入れ替わった（`instanceId` が変わった）・ノードが外れたら、自分で閉じる。別のノードの一覧へ切り替えるときは親が `key` で作り直す。キー・ホイールは外（グラフ画面）へ渡さない。
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { NodeKey } from "@sodashitsu/protocol";
import { useGraphStore } from "../../store/graph.js";
import SubagentList from "../SubagentList.vue";

const props = defineProps<{ nodeKey: string }>();
const emit = defineEmits<{ close: [] }>();

const graph = useGraphStore();
const listRef = ref<InstanceType<typeof SubagentList> | null>(null);

const info = computed(() => graph.nodeInfo(props.nodeKey as NodeKey));
/** ノードがグラフに載っているか（外されたら、pane とエージェントが残っていても閉じる）。 */
const onGraph = computed(() => graph.nodes.some((n) => n.key === props.nodeKey));
/** 繋がっているマシンのノードだけ（切れたら閉じる。ボタンと同じ規則）。 */
const agent = computed(() =>
  onGraph.value && info.value.exists === true ? (info.value.agent ?? undefined) : undefined,
);
/** 開いた時点のエージェントの `instanceId`。入れ替わりの判定に使う。 */
let openedInstanceId: string | null = null;

onMounted(() => {
  openedInstanceId = agent.value?.instanceId ?? null;
  if (!agent.value) {
    emit("close"); // 開く時点で対象が居なければ、開かない
    return;
  }
  void nextTick(() => listRef.value?.focus());
});

watch(agent, (a) => {
  if (!a || (openedInstanceId !== null && a.instanceId !== openedInstanceId)) emit("close");
});

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("close");
    return;
  }
  ev.stopPropagation(); // 一覧の上下キーなどを、グラフ画面のキー（ズーム・ノードの操作）へ渡さない
}
</script>

<template>
  <section
    class="subagent-panel"
    role="region"
    aria-label="サブエージェントの一覧"
    @keydown="onKeydown"
    @pointerdown.stop
    @wheel.stop
  >
    <div class="subagent-panel-head">
      <h3 class="subagent-panel-heading">サブエージェント — {{ info.name }}</h3>
      <button
        type="button"
        class="subagent-panel-close"
        aria-label="サブエージェントの一覧を閉じる"
        @click="emit('close')"
      >
        ×
      </button>
    </div>
    <SubagentList ref="listRef" :subagents="agent?.subagents" />
  </section>
</template>

<style scoped>
.subagent-panel {
  box-sizing: border-box;
  width: 360px;
  max-width: 100%;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  overflow-y: auto;
  border-left: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 12px;
}
.subagent-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.subagent-panel-heading {
  flex: 1;
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.subagent-panel button {
  padding: 2px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
</style>
