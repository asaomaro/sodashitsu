<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { defaultCheckoutPath } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";

/**
 * 新しい worktree を作るダイアログ（20260920-git-worktree-actions の AC1・AC2）。
 *
 * 形は `NameDialog` に寄せる（ネイティブの `<dialog>` ＋ `<form method="dialog">`、
 * 入力済み・全選択で開く、Esc は `cancel` を抑止して自分で閉じる）。**別の component にしたのは**、
 * `NameDialog` が「1 行で名前を決める」4 種類のためのもので、**パスのプレビュー**を足すと責務が混ざるため。
 *
 * ブランチ名は**サーバが作った候補**（`worktree.list` の `suggestedBranch`）を入れて開く。
 * 作成先は `defaultCheckoutPath`（`@sodashitsu/protocol`）で組み立てる——**サーバと同じ関数**なので、
 * ここに出るパスと実際に作られる場所がずれない。
 */
const view = useViewStore();
const actions = inject(ActionDispatcherKey);

const dialogEl = ref<HTMLDialogElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const branch = ref("");

const ctx = computed(() => (view.dialogContext?.kind === "worktreeCreate" ? view.dialogContext : null));

/** 入力中のブランチ名から作成先を組み立てて見せる（確定前にどこへ作られるか分かるように）。 */
const previewPath = computed(() => {
  const info = ctx.value?.info;
  if (!info) return "";
  return defaultCheckoutPath(info.worktreeRoot, info.repoName, branch.value);
});

const canConfirm = computed(() => branch.value.trim() !== "");

watch(
  () => view.dialogContext,
  (next) => {
    if (next?.kind === "worktreeCreate") {
      branch.value = next.info.suggestedBranch;
      void nextTick(() => {
        dialogEl.value?.showModal();
        inputEl.value?.focus();
        inputEl.value?.select(); // 候補をそのまま確定もできるし、打ち始めれば置き換わる
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

const confirm = (): void => {
  if (!canConfirm.value) return;
  actions?.confirmWorktreeCreate(branch.value);
};

function cancel(): void {
  view.closeDialog();
}

/** ネイティブの Esc。既定の close は抑止し、後始末は `cancel()`（`NameDialog` と同じ形）。 */
function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}
</script>

<template>
  <dialog ref="dialogEl" class="worktree-dialog" @cancel="onNativeCancel" @click.self="cancel">
    <form method="dialog" @submit.prevent="confirm">
      <label class="worktree-dialog-label">
        <span>新しい worktree のブランチ名</span>
        <input ref="inputEl" v-model="branch" type="text" class="worktree-dialog-input" />
      </label>
      <p class="worktree-dialog-preview">
        <span class="worktree-dialog-preview-label">作成先</span>
        <span class="worktree-dialog-preview-path">{{ previewPath }}</span>
      </p>
      <div class="worktree-dialog-actions">
        <button type="button" @click="cancel">キャンセル</button>
        <button type="submit" :disabled="!canConfirm">作成して開く</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.worktree-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: 4px;
  min-width: 28em;
  padding: 1em;
}
.worktree-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.worktree-dialog-label {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.worktree-dialog-input {
  font: inherit;
  padding: 0.3em 0.5em;
}
.worktree-dialog-preview {
  display: flex;
  gap: 0.6em;
  margin: 0.8em 0 0;
  font-size: 0.85em;
  opacity: 0.75;
}
.worktree-dialog-preview-label {
  flex: none;
}
.worktree-dialog-preview-path {
  overflow-wrap: anywhere;
}
.worktree-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
  margin-top: 1em;
}
</style>
