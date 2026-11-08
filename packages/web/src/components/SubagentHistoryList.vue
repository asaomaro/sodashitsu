<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  SubagentHistoryReader,
  subagentHistoryMessage,
  subagentTerminalLabel,
  subagentModelLabel,
  type SubagentHistoryState,
} from "@sodashitsu/client-core";
import type { SubagentHistoryItem } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useChildConversationStore } from "../store/childConversation.js";
import { useMachinesStore } from "../store/machines.js";
const props = withDefaults(
  defineProps<{ paneId: string; machineId?: string; active?: boolean }>(),
  { active: true },
);
const emit = defineEmits<{ select: [item: SubagentHistoryItem] }>();
const parents = useChildConversationStore(),
  machines = useMachinesStore(),
  conn = inject(ConnectionKey, null);
const empty = (): SubagentHistoryState => ({
  items: [],
  status: "idle",
  loading: false,
  offset: 0,
  more: false,
  omittedBefore: false,
  incomplete: false,
});
const state = ref<SubagentHistoryState>(empty()),
  message = computed(() => subagentHistoryMessage(state.value));
const scope = computed(() =>
  props.machineId !== undefined && props.machineId !== machines.selectedId
    ? null
    : parents.scope(props.paneId),
);
const openedScope = scope.value;
let reader: SubagentHistoryReader | null = null,
  generation = 0;
watch(
  [scope, () => props.active],
  ([s, active]) => {
    const g = ++generation;
    reader?.dispose();
    reader = null;
    state.value = empty();
    if (!active || s === null || s !== openedScope || !conn) {
      state.value = { ...empty(), status: "unavailable" };
      return;
    }
    reader = new SubagentHistoryReader(
      conn,
      props.paneId,
      () => scope.value,
      (next) => {
        if (g === generation) state.value = next;
      },
      () => props.active && document.visibilityState !== "hidden",
    );
    reader.start();
  },
  { immediate: true, flush: "sync" },
);
function visible(): void {
  if (document.visibilityState !== "hidden") void reader?.refresh();
}
onMounted(() => document.addEventListener("visibilitychange", visible));
onBeforeUnmount(() => {
  generation++;
  reader?.dispose();
  document.removeEventListener("visibilitychange", visible);
});
function date(value: number | undefined): string | undefined {
  return value === undefined ? undefined : new Date(value).toLocaleString("ja-JP");
}
</script>
<template>
  <section aria-label="終了した子の履歴" class="child-history-list">
    <header>
      <strong>終了した子</strong
      ><button
        type="button"
        data-assistant-feature
        :disabled="state.loading || !reader"
        @click="reader?.refresh(true)"
      >
        更新
      </button>
    </header>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="state.omittedBefore" role="status">古い履歴の一部を省いています。</p>
    <ul>
      <li v-for="item in state.items" :key="item.entryId">
        <button
          type="button"
          data-assistant-feature
          class="history-child"
          :data-history-entry="item.entryId"
          :aria-label="`${item.description || item.type || 'サブエージェント'}の会話を開く`"
          @click="emit('select', item)"
        >
          <span
            >{{ subagentTerminalLabel(item.terminalStatus) }} ·
            {{ item.description || item.type || "サブエージェント" }}</span
          ><span v-if="subagentModelLabel(item)" class="history-model">{{
            subagentModelLabel(item)
          }}</span
          ><span v-if="item.endedAt !== undefined" class="history-date"
            >終了 {{ date(item.endedAt) }}</span
          >
        </button>
      </li>
    </ul>
    <button
      v-if="state.more"
      type="button"
      data-assistant-feature
      :disabled="state.loading"
      @click="reader?.more()"
    >
      さらに表示
    </button>
  </section>
</template>
<style scoped>
.child-history-list {
  min-height: 0;
  overflow: auto;
  max-height: 50vh;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
}
button {
  font: inherit;
  color: inherit;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: var(--soda-shape-radius-s);
  cursor: pointer;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0.4em 0;
}
li {
  margin: 0.3em 0;
}
.history-child {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  width: 100%;
  text-align: left;
  padding: 0.35em;
  overflow-wrap: anywhere;
}
.history-model {
  font-size: inherit;
}
.history-date {
  opacity: 0.8;
  font-size: 0.9em;
}
p {
  margin: 0.35em 0;
}
</style>
