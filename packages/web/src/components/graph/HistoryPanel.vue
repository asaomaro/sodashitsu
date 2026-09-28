<script setup lang="ts">
/**
 * 実行の履歴（20260927-agent-graph の design「web」の表・AC10）。時刻・線・結果・理由・送った文面の先頭。新しい順。
 * 開いたときに `graph.history` を読み、以後は `graph.fired` が先頭へ足す（`store/graph`）。履歴はサーバのメモリだけ（再起動で消える）。
 * 線を指定して開けばその線だけ（「すべての線」で外せる）。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import { useGraphStore } from "../../store/graph.js";
import { RUN_REASON_TEXT, RUN_RESULT_TEXT } from "./linkText.js";

const props = defineProps<{ linkId: string | null }>();
const emit = defineEmits<{ close: []; clearFilter: [] }>();

const graph = useGraphStore();
const rootEl = ref<HTMLElement | null>(null);

onMounted(() => {
  void graph.loadHistory();
  void nextTick(() => rootEl.value?.querySelector<HTMLElement>("button")?.focus());
});

const rows = computed(() =>
  graph.runs.filter((r) => props.linkId === null || r.linkId === props.linkId),
);

function linkName(id: string): string {
  const link = graph.links.find((l) => l.id === id);
  return link ? graph.linkTitle(link) : `削除した線（${id}）`;
}

function timeText(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("close");
    return;
  }
  ev.stopPropagation();
}
</script>

<template>
  <section
    ref="rootEl"
    class="history-panel"
    role="region"
    aria-label="実行の履歴"
    @keydown="onKeydown"
    @pointerdown.stop
  >
    <div class="history-panel-head">
      <h3 class="history-panel-heading">
        実行の履歴<template v-if="linkId">（{{ linkName(linkId) }}）</template>
      </h3>
      <button v-if="linkId" type="button" class="history-panel-all" @click="emit('clearFilter')">
        すべての線
      </button>
      <button
        type="button"
        class="history-panel-close"
        aria-label="履歴を閉じる"
        @click="emit('close')"
      >
        ×
      </button>
    </div>
    <p class="history-panel-hint">
      サーバのメモリだけに残ります（線ごとに直近 50 件。再起動で消えます）。
    </p>
    <p v-if="!graph.runsLoaded" class="history-panel-empty">読み込んでいます…</p>
    <p v-else-if="rows.length === 0" class="history-panel-empty">まだ動いていません。</p>
    <ol v-else class="history-panel-list">
      <li
        v-for="(r, i) in rows"
        :key="`${r.linkId}-${r.at}-${i}`"
        class="history-row"
        :data-result="r.result"
      >
        <div class="history-row-head">
          <time class="history-row-time" :datetime="new Date(r.at).toISOString()">{{
            timeText(r.at)
          }}</time>
          <span v-if="!linkId" class="history-row-link">{{ linkName(r.linkId) }}</span>
        </div>
        <div class="history-row-result">
          {{ RUN_RESULT_TEXT[r.result]
          }}<template v-if="r.reason">（{{ RUN_REASON_TEXT[r.reason] }}）</template>
        </div>
        <pre v-if="r.text" class="history-row-text">{{ r.text }}</pre>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.history-panel {
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
.history-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-panel-heading {
  flex: 1;
  margin: 0;
  font-size: 14px;
}
.history-panel-hint,
.history-panel-empty {
  margin: 0;
  opacity: 0.8;
}
.history-panel-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.history-row {
  padding: 6px 0;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
}
.history-row-head {
  display: flex;
  gap: 8px;
}
.history-row-time {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.history-row[data-result="failed"] .history-row-result {
  color: var(--soda-error-fg, #ff5555);
}
.history-row[data-result="skipped"] .history-row-result {
  color: var(--soda-warn-fg, #ffb86c);
}
.history-row-text {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
  opacity: 0.85;
}
.history-panel button {
  padding: 2px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 4px;
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
</style>
