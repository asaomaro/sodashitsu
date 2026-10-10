<script setup lang="ts">
/** 掴んでいる対象を、ドロップ判定を遮らずカーソルの横に出す。 */
defineProps<{ x: number; y: number; label: string; kind: string; count?: number }>();
</script>

<template>
  <Teleport to="body">
    <div class="drag-preview" data-drag-preview aria-hidden="true" :style="{ '--drag-x': `${x}px`, '--drag-y': `${y}px` }">
      <svg class="drag-preview-grip" viewBox="0 0 12 18" width="12" height="18" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" /><circle cx="3" cy="9" r="1.2" /><circle cx="9" cy="9" r="1.2" /><circle cx="3" cy="15" r="1.2" /><circle cx="9" cy="15" r="1.2" /></g></svg>
      <div class="drag-preview-text">
        <div class="drag-preview-kind">{{ kind }}<span v-if="count && count > 1"> · {{ count }} 件</span></div>
        <div class="drag-preview-label">{{ label }}</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drag-preview {
  position: fixed;
  left: clamp(8px, calc(var(--drag-x) + 16px), max(8px, calc(100vw - 256px)));
  top: clamp(8px, calc(var(--drag-y) + 16px), max(8px, calc(100vh - 80px)));
  width: min(240px, calc(100vw - 16px));
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--soda-accent, #8be9fd);
  border-radius: var(--soda-shape-radius, 4px);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-fg, #f8f8f2);
  box-shadow: var(--soda-shape-shadow, 0 4px 12px #0004);
  z-index: 900; /* メニュー・トースト・ダイアログの下。 */
  pointer-events: none;
  user-select: none;
}
.drag-preview-grip { flex: none; color: var(--soda-accent, #8be9fd); }
.drag-preview-text { min-width: 0; }
.drag-preview-kind { font-size: 0.75em; opacity: 0.75; }
.drag-preview-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
