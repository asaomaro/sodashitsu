<script setup lang="ts">
/**
 * グラフ画面の中の確認（線の削除・ノードを外す・変更を捨てる。20260927-agent-graph の AC-I2）。ダイアログの 1 枠（`view.openDialog`）を使わない——
 * 使うとグラフ画面の文脈（開いているパネル・選択）と戻り先が上書きされる（research-web §1.5-1）。グラフの `<dialog>` の中に重ねる。
 * 既定のフォーカスは「取り消す」（design「削除」）。Esc・外側のクリックは取り消し。Tab は 2 つのボタンの間で回る。
 */
import { nextTick, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    message: string;
    detail?: string | undefined;
    confirmLabel: string;
    cancelLabel?: string;
    /** 既定のフォーカスを確定の側にする（「変更を捨てますか」の「編集に戻る」は取り消しの側なので既定のまま）。 */
    focusConfirm?: boolean;
  }>(),
  { cancelLabel: "取り消す", focusConfirm: false },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const cancelBtn = ref<HTMLButtonElement | null>(null);
const confirmBtn = ref<HTMLButtonElement | null>(null);

onMounted(() => {
  void nextTick(() => (props.focusConfirm ? confirmBtn.value : cancelBtn.value)?.focus());
});

function onKeydown(ev: KeyboardEvent): void {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("cancel");
    return;
  }
  if (ev.key === "Tab") {
    ev.preventDefault();
    const next = document.activeElement === cancelBtn.value ? confirmBtn.value : cancelBtn.value;
    next?.focus();
  }
  // ほかのキー（グラフの操作のキー）を外へ渡さない。
  ev.stopPropagation();
}
</script>

<template>
  <div class="graph-confirm-backdrop" @pointerdown.self.stop="emit('cancel')">
    <div
      class="graph-confirm"
      role="alertdialog"
      aria-modal="true"
      :aria-label="message"
      @keydown="onKeydown"
      @pointerdown.stop
    >
      <p class="graph-confirm-message">{{ message }}</p>
      <p v-if="detail" class="graph-confirm-detail">{{ detail }}</p>
      <div class="graph-confirm-actions">
        <button ref="cancelBtn" type="button" class="graph-confirm-cancel" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button ref="confirmBtn" type="button" class="graph-confirm-ok" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-confirm-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.graph-confirm {
  max-width: min(420px, calc(100% - 32px));
  padding: 16px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
}
.graph-confirm-message {
  margin: 0 0 8px;
}
.graph-confirm-detail {
  margin: 0 0 8px;
  font-size: 12px;
  opacity: 0.85;
}
.graph-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.graph-confirm-actions button {
  padding: 4px 12px;
  min-height: var(--soda-shape-control-h, 0);
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-subtle-bg, #343746);
  color: inherit;
  cursor: pointer;
}
.graph-confirm-ok {
  border-color: var(--soda-error-fg, #ff5555) !important;
}
</style>
