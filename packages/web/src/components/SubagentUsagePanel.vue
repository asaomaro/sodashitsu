<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  SubagentUsageReader,
  subagentUsageView,
  type SubagentUsageState,
} from "@sodashitsu/client-core";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useChildConversationStore } from "../store/childConversation.js";
const props = withDefaults(
  defineProps<{
    paneId: string;
    agentId: string;
    active?: boolean;
    initialOpen?: boolean;
    open?: boolean | null;
  }>(),
  { active: true, initialOpen: false, open: null },
);
const conn = inject(ConnectionKey, null),
  session = useSessionStore(),
  parents = useChildConversationStore();
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const localExpanded = ref(props.initialOpen);
const expanded = computed({
    get: () => props.open ?? localExpanded.value,
    set: (open: boolean) => {
      localExpanded.value = open;
      emit("update:open", open);
    },
  }),
  state = ref<SubagentUsageState>({ result: null, loading: false, failed: false });
const initialBirth = session.panes
  .get(props.paneId)
  ?.agent?.subagents?.items.find((c) => c.id === props.agentId)?.startedAt;
const identity = computed(() => {
  const parent = parents.scope(props.paneId);
  if (parent === null) return null;
  const child = session.panes
    .get(props.paneId)
    ?.agent?.subagents?.items.find((c) => c.id === props.agentId);
  return JSON.stringify([parent, props.agentId, child?.startedAt ?? initialBirth ?? null]);
});
const view = computed(() => subagentUsageView(state.value));
let reader: SubagentUsageReader | null = null,
  generation = 0;
watch(
  [identity, expanded, () => props.active],
  ([scope, open, active], old) => {
    const g = ++generation;
    reader?.dispose();
    reader = null;
    state.value = { result: null, loading: false, failed: false };
    if (old && scope !== old[0]) {
      expanded.value = false;
      return;
    }
    if (!open || !active || scope === null || !conn) return;
    reader = new SubagentUsageReader(
      conn,
      { paneId: props.paneId, agentId: props.agentId },
      () => identity.value,
      (value) => {
        if (g === generation) state.value = value;
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
</script>
<template>
  <section class="child-usage" aria-label="子の利用状況">
    <button
      type="button"
      data-assistant-feature
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? "▾" : "▸" }} 利用状況
    </button>
    <div v-if="expanded" class="child-usage-body" data-child-usage>
      <dl>
        <template v-for="row in view.rows" :key="row.label"
          ><dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd></template
        >
      </dl>
      <div
        v-if="view.contextPct !== undefined"
        class="child-usage-meter"
        role="meter"
        aria-label="子のコンテキスト使用率"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="view.contextPct"
      >
        <span :style="{ width: `${view.contextPct}%` }" />
      </div>
      <p v-for="note in view.notes" :key="note" role="status">{{ note }}</p>
    </div>
  </section>
</template>
<style scoped>
.child-usage {
  font-size: inherit;
  margin: 0.35em 0;
}
button {
  font: inherit;
  color: inherit;
  background: var(--soda-menu-bg);
  border: 1px solid var(--soda-menu-border);
  border-radius: var(--soda-shape-radius-s);
  cursor: pointer;
}
.child-usage-body {
  padding: 0.35em;
  overflow-wrap: anywhere;
}
dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.2em 0.8em;
  margin: 0;
}
dt {
  opacity: 0.8;
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
p {
  margin: 0.3em 0;
  opacity: 0.85;
}
.child-usage-meter {
  height: 0.6em;
  border-radius: 0.3em;
  overflow: hidden;
  background: color-mix(in srgb, var(--soda-fg, #f8f8f2) 18%, transparent);
  margin: 0.4em 0;
}
.child-usage-meter span {
  display: block;
  height: 100%;
  background: var(--soda-accent);
}
</style>
