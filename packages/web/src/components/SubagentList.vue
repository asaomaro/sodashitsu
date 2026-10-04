<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { AgentInfo } from "@sodashitsu/protocol";
import { formatSubagentElapsed, subagentsMoreLabel } from "@sodashitsu/client-core";

/**
 * サブエージェントの一覧の中身（20261004-subagent-display）。サイドバーからの一覧のダイアログ（`SubagentListDialog`）と、連携のグラフの中のパネル
 * （`graph/SubagentPanel`）が共有する。種類・短い説明・経過時間・バックグラウンドの印を、起動した順に出す。`tabindex` を持つ 1 つの領域で、
 * 上下キーでスクロールできる。経過時間は 10 秒ごとに進める（ここが持つ）。短い説明などはエージェントが書いた文なので、文字として出す（HTML として解釈しない）。
 * 親は `focus()` でこの領域へフォーカスを移せる。開いている間だけ描く（`v-if`）ので、タイマーも開いている間だけ動く。
 */
const props = defineProps<{ subagents: AgentInfo["subagents"] }>();

const listEl = ref<HTMLElement | null>(null);
const now = ref(Date.now());
const ticker = setInterval(() => (now.value = Date.now()), 10_000);
onBeforeUnmount(() => clearInterval(ticker));

const items = computed(() => props.subagents?.items ?? []);
const more = computed(() => (props.subagents ? subagentsMoreLabel(props.subagents) : null));

defineExpose({ focus: () => listEl.value?.focus() });
</script>

<template>
  <div ref="listEl" class="subagent-list" tabindex="0" role="list" aria-label="サブエージェントの一覧">
    <p v-if="items.length === 0" class="subagent-list-empty">実行中のサブエージェントはありません</p>
    <div v-for="item in items" :key="item.id" class="subagent-list-item" role="listitem">
      <div class="subagent-list-item-head">
        <span class="subagent-list-type">{{ item.type ?? "サブエージェント" }}</span>
        <span v-if="item.background" class="subagent-list-bg">バックグラウンド</span>
        <span class="subagent-list-elapsed">{{ formatSubagentElapsed(item.startedAt, now) }}</span>
      </div>
      <div v-if="item.description" class="subagent-list-desc">{{ item.description }}</div>
    </div>
    <p v-if="more" class="subagent-list-more">{{ more }}</p>
  </div>
</template>

<style scoped>
.subagent-list {
  max-height: 50vh;
  overflow-y: auto;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 3px;
  padding: 0.3em 0.5em;
}
.subagent-list:focus-visible {
  outline: 2px solid var(--soda-accent, #8be9fd);
}
.subagent-list-empty,
.subagent-list-more {
  margin: 0.4em 0;
  opacity: 0.8;
}
.subagent-list-item {
  padding: 0.35em 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.subagent-list-item:last-of-type {
  border-bottom: none;
}
.subagent-list-item-head {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
}
.subagent-list-type {
  font-weight: 600;
}
.subagent-list-bg {
  font-size: 0.85em;
  opacity: 0.8;
}
.subagent-list-elapsed {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.subagent-list-desc {
  margin-top: 0.15em;
  overflow-wrap: anywhere;
}
</style>
