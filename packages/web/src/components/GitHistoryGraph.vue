<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ history: string }>();
const emit = defineEmits<{ select: [line: string] }>();
const rows = computed(() =>
  props.history
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = /^([*|\\/ _.-]*)([a-f0-9]{40,64})\s+(.*)$/.exec(line);
      return { line, graph: m?.[1] ?? line, hash: m?.[2] ?? "", label: m?.[3] ?? "" };
    }),
);
const width = computed(() => Math.max(24, ...rows.value.map((r) => r.graph.length * 10 + 12)));
const palette = ["#79a7ff", "#85d8a5", "#e7b875", "#cb96ed", "#79cfd8"];
</script>
<template>
  <div class="git-history-graph">
    <svg
      :width="width"
      :height="rows.length * 28"
      role="img"
      aria-label="Gitのコミットとブランチの接続図"
    >
      <g v-for="(row, y) in rows" :key="y">
        <g
          v-for="(ch, x) in [...row.graph]"
          :key="x"
          :stroke="palette[Math.floor(x / 2) % palette.length]"
          stroke-width="2"
          fill="none"
        >
          <path v-if="ch === '|' || ch === '*'" :d="`M${x * 10 + 8},${y * 28}v28`" />
          <path v-else-if="ch === '/'" :d="`M${x * 10 + 18},${y * 28}l-20,28`" />
          <path v-else-if="ch === '\\'" :d="`M${x * 10 - 2},${y * 28}l20,28`" />
          <path v-else-if="ch === '_' || ch === '-'" :d="`M${x * 10 - 2},${y * 28 + 14}h20`" />
          <circle
            v-if="ch === '*'"
            :cx="x * 10 + 8"
            :cy="y * 28 + 14"
            r="5"
            :fill="palette[Math.floor(x / 2) % palette.length]"
          />
        </g>
      </g>
    </svg>
    <div class="git-history-rows">
      <div v-for="(row, i) in rows" :key="i" class="git-history-row">
        <button v-if="row.hash" @click="emit('select', row.line)" :title="row.hash">
          <code>{{ row.hash.slice(0, 8) }}</code> {{ row.label }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.git-history-graph {
  display: flex;
  min-width: max-content;
  align-items: flex-start;
}
.git-history-graph svg {
  flex: none;
}
.git-history-row {
  height: 28px;
  display: flex;
  align-items: center;
}
.git-history-row button {
  border: 0;
  background: transparent;
  color: var(--soda-fg);
  font: inherit;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
  height: 28px;
  white-space: nowrap;
}
.git-history-row button:hover {
  background: var(--soda-menu-hover-bg);
}
code {
  color: var(--soda-accent);
  margin-right: 10px;
}
</style>
