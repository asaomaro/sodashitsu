<script setup lang="ts">
/**
 * モバイルのグラフの下からのシート（20260927-agent-graph の design「モバイル」・AC20）。編集はしない——線・ノードを押すと、その状態と
 * 一時停止・再開のボタンだけを出す（ノードならそのノードに繋がる線ごと）。全体の一時停止・再開はツールバーのボタン。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import type { GraphLink, NodeKey } from "@sodashitsu/protocol";
import { useGraphStore } from "../../store/graph.js";
import { LINK_KIND_NAME, linkShortLabel, linkStateText } from "./linkText.js";

const props = defineProps<{
  target: { kind: "node"; key: string } | { kind: "link"; id: string };
}>();
const emit = defineEmits<{ close: [] }>();

const graph = useGraphStore();
const rootEl = ref<HTMLElement | null>(null);

const links = computed<GraphLink[]>(() => {
  const t = props.target;
  if (t.kind === "link") return graph.links.filter((l) => l.id === t.id);
  return graph.links.filter((l) => l.from === t.key || l.to === t.key);
});

const title = computed(() => {
  const t = props.target;
  if (t.kind === "node") {
    const info = graph.nodeInfo(t.key as NodeKey);
    return `${info.name}（${info.machineLabel}）`;
  }
  const l = links.value[0];
  return l ? `${LINK_KIND_NAME[l.kind]}: ${graph.linkTitle(l)}` : "線はほかで削除されました";
});

function invalid(l: GraphLink): boolean {
  const bad = (k: NodeKey) => {
    const i = graph.nodeInfo(k);
    return i.exists === false;
  };
  return bad(l.from) || bad(l.to);
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("close");
  }
}

onMounted(() => {
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>("button")?.focus());
});
</script>

<template>
  <div class="graph-sheet-backdrop" @pointerdown.self.stop="emit('close')">
    <section
      ref="rootEl"
      class="graph-sheet"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown="onKeydown"
      @pointerdown.stop
    >
      <div class="graph-sheet-head">
        <h3 class="graph-sheet-title">{{ title }}</h3>
        <button type="button" class="graph-sheet-close" aria-label="閉じる" @click="emit('close')">
          ×
        </button>
      </div>
      <p v-if="target.kind === 'node' && links.length === 0" class="graph-sheet-empty">
        繋がる線はありません。
      </p>
      <ul class="graph-sheet-links">
        <li v-for="l in links" :key="l.id" class="graph-sheet-link" :data-sheet-link="l.id">
          <div class="graph-sheet-link-text">
            <span v-if="target.kind === 'node'"
              >{{ LINK_KIND_NAME[l.kind] }}: {{ graph.linkTitle(l) }}</span
            >
            <span
              >{{ linkShortLabel(l) }} 実行 {{ l.count }}/{{ l.limit }}・{{
                linkStateText(l, { invalid: invalid(l), graphPaused: graph.graph?.paused === true })
              }}</span
            >
          </div>
          <button
            v-if="l.paused"
            type="button"
            class="graph-sheet-resume"
            @click="graph.setPaused(false, l.id)"
          >
            再開（回数を 0 に戻す）
          </button>
          <button
            v-else
            type="button"
            class="graph-sheet-pause"
            @click="graph.setPaused(true, l.id)"
          >
            一時停止
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.graph-sheet-backdrop {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  align-items: flex-end;
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.graph-sheet {
  box-sizing: border-box;
  width: 100%;
  max-height: 60%;
  overflow-y: auto;
  padding: 12px 16px;
  border-top: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 10px 10px 0 0;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
}
.graph-sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.graph-sheet-title {
  flex: 1;
  margin: 0;
  font-size: 15px;
}
.graph-sheet-close {
  min-width: 2rem;
  min-height: 2rem;
  border: none;
  background: none;
  color: inherit;
  font-size: 18px;
}
.graph-sheet-empty {
  margin: 8px 0 0;
  opacity: 0.8;
}
.graph-sheet-links {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.graph-sheet-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.graph-sheet-link-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}
.graph-sheet-link button {
  min-height: 2rem;
  padding: 0.3em 0.8em;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
}
</style>
