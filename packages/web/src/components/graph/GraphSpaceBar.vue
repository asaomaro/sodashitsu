<script setup lang="ts">
/**
 * 空間の見出しの並び（20261008-graph-first の PR1c T11b。ツールバーの下）。グループごとの空間（と「グループなし」）の名前と、含む囲いの数。表示中の空間が分かる。
 * 押すと切り替わる（全体が収まる位置・倍率にするのは親）。空間が多いときは横にスクロールする。グループが 1 つも無いときは親が出さない。
 * 読み取りだけの画面（モバイル）でも、見る空間を替えるために押せる（グラフを変える操作ではない）。
 */
import type { GraphSpaceView } from "@sodashitsu/client-core";

defineProps<{
  spaces: readonly GraphSpaceView[];
  currentId: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<template>
  <nav class="graph-spaces" aria-label="空間">
    <button
      v-for="s in spaces"
      :key="s.id"
      type="button"
      class="graph-space"
      :class="{ 'graph-space-current': s.id === currentId }"
      :aria-current="s.id === currentId ? 'true' : undefined"
      :data-space-id="s.id"
      :title="`${s.label}・${s.count} 件`"
      @click="emit('select', s.id)"
    >
      <span class="graph-space-label">{{ s.label }}</span>
      <span class="graph-space-count">{{ s.count }}</span>
    </button>
  </nav>
</template>

<style scoped>
.graph-spaces {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: none;
  border-bottom: 1px solid var(--soda-menu-border, #44475a);
  scrollbar-width: thin;
}
.graph-space {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 16em;
  padding: 2px 10px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 12px;
  background: none;
  color: var(--soda-fg, #f8f8f2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.graph-space:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.graph-space-current {
  background: var(--soda-menu-active-bg, #44475a);
  border-color: var(--soda-accent, #6070a1);
  font-weight: bold;
}
.graph-space-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-space-count {
  opacity: 0.7;
  font-weight: normal;
}
</style>
