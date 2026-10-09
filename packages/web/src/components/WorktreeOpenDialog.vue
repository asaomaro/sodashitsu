<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";

/**
 * 既にある worktree を選んで開くダイアログ（20260920-git-worktree-actions の AC4・AC5）。
 *
 * 形は `GotoPicker` に寄せる（ネイティブの `<dialog>` ＋ `role="listbox"` ＋ 自前のキー処理）。
 * **一覧はサーバから受け取った時点で確定している**（`worktree.list` の応答を `dialogContext` に載せて開く）ので、
 * ここでは絞り込みや再取得をしない——`GotoPicker` のような検索は、worktree の数では要らない。
 *
 * **bare と prunable はサーバで落としてある**（開けないものを見せない）。
 */
const view = useViewStore();
const actions = inject(ActionDispatcherKey);

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const selected = ref(0);

const entries = computed(() => (view.dialogContext?.kind === "worktreeOpen" ? view.dialogContext.entries : []));

watch(
  () => view.dialogContext,
  (next) => {
    if (next?.kind === "worktreeOpen") {
      selected.value = 0;
      void nextTick(() => {
        dialogEl.value?.showModal();
        listEl.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

function move(delta: number): void {
  const n = entries.value.length;
  if (n === 0) return;
  selected.value = (selected.value + delta + n) % n;
}

const accept = (): void => {
  const entry = entries.value[selected.value];
  if (entry) actions?.confirmWorktreeOpen(entry.path);
};

/** クリックで選んでそのまま確定する（`GotoPicker.vue` の `selectRow` と同じ流儀）。 */
function choose(index: number): void {
  selected.value = index;
  accept();
}

/**
 * 削除の確認へ進む（20260924-worktree-remove。design「クライアント側」）。この一覧ダイアログ
 * 自体は `ActionDispatcher.removeWorktree` が開く確認ダイアログに置き換わる——`view.dialogContext`
 * は単一の値なので、この一覧は一旦消え、確認の確定・取り消し・完了のいずれでも
 * `openWorktree` により開き直る（`ConfirmDialog.vue`/`ActionDispatcher.ts` が担う）。
 */
function remove(path: string): void {
  const ctx = view.dialogContext;
  if (ctx?.kind !== "worktreeOpen") return;
  actions?.removeWorktree(ctx.workspaceId, path);
}

function cancel(): void {
  view.closeDialog();
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}

/** `GotoPicker` と同じ流儀：↑↓ と j/k で移動、Enter で確定、Esc で閉じる。 */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    cancel();
    return;
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    accept();
    return;
  }
  if (ev.key === "ArrowDown" || ev.key === "j") {
    ev.preventDefault();
    move(1);
    return;
  }
  if (ev.key === "ArrowUp" || ev.key === "k") {
    ev.preventDefault();
    move(-1);
    return;
  }
  // 削除（20260924-worktree-remove。AC-I3）。既存のキーと衝突しない新しい割り当て。
  if (ev.key === "Delete" || ev.key === "Backspace") {
    ev.preventDefault();
    const entry = entries.value[selected.value];
    if (entry) remove(entry.path);
  }
}
</script>

<template>
  <!-- キー処理は `<ul>` ではなく `<dialog>` で受ける（`GotoPicker` / `HelpDialog` と同じ形。review ラウンド1）。
       `<ul>` に付けると、見出しなど focusable でない所をクリックしただけで焦点が外れ、以後 ↑↓/Enter が届かない。 -->
  <dialog
    ref="dialogEl"
    class="worktree-open-dialog"
    aria-label="worktree を開く"
    @cancel="onNativeCancel"
    @click.self="cancel"
    @keydown="onKeydown"
  >
    <p class="worktree-open-dialog-title">worktree を開く</p>
    <ul ref="listEl" class="worktree-open-dialog-list" role="listbox" tabindex="-1">
      <li
        v-for="(entry, index) in entries"
        :key="entry.path"
        class="worktree-open-dialog-item"
        :class="{ 'worktree-open-dialog-item-selected': index === selected }"
        role="option"
        :aria-selected="index === selected"
        @click="choose(index)"
      >
        <div class="worktree-open-dialog-info">
          <span class="worktree-open-dialog-branch">{{ entry.branch ?? "(detached)" }}</span>
          <span class="worktree-open-dialog-path">{{ entry.path }}</span>
        </div>
        <!-- タブ順には乗せない（tabindex="-1"）——キーボードでの削除は Delete/Backspace に一本化し、
             role="option" の中に2つ目のタブ停止点を作らない（design「クライアント側」）。 -->
        <button type="button" class="worktree-open-dialog-delete" tabindex="-1" @click.stop="remove(entry.path)">削除</button>
      </li>
    </ul>
  </dialog>
</template>

<style scoped>
.worktree-open-dialog {
  box-shadow: var(--soda-shape-shadow, none);
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  min-width: 32em;
  padding: var(--soda-shape-pad, 1em);
}
.worktree-open-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.worktree-open-dialog-title {
  margin: 0 0 0.6em;
  font-size: 0.9em;
  opacity: 0.75;
}
.worktree-open-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.worktree-open-dialog-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6em;
  padding: 0.4em 0.6em;
  cursor: pointer;
}
.worktree-open-dialog-info {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  min-width: 0; /* 長いパスを .worktree-open-dialog-path の overflow-wrap に委ねる */
}
.worktree-open-dialog-delete {
  flex: none;
  background: none;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  color: inherit;
  font-size: 0.85em;
  padding: 0.2em 0.6em;
  cursor: pointer;
}
.worktree-open-dialog-delete:hover {
  background: var(--soda-error-fg, #ff5555);
  border-color: var(--soda-error-fg, #ff5555);
  color: var(--soda-bg, #1e1f29);
}
.worktree-open-dialog-item:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* `:hover` と詳細度をそろえ、後に置くことで選択中を勝たせる（`Sidebar.vue` と同じ形。review ラウンド1）。
 * そろえないと `:hover`（0,2,0）が `-selected`（0,1,0）に勝ち、**選択中の行にポインタが乗ると
 * 選択色が消えて、↑↓ で選んで Enter という主操作でどれが確定されるか読めなくなる**。 */
.worktree-open-dialog-item.worktree-open-dialog-item-selected {
  background: var(--soda-menu-active-bg, #44475a);
}
.worktree-open-dialog-path {
  font-size: 0.85em;
  opacity: 0.75;
  overflow-wrap: anywhere;
}
/* 押せる部品の高さ（20261008-ui-style。クラシックでは変数が無く、何もしない） */
.worktree-open-dialog button,
.worktree-open-dialog input:not([type="checkbox"]):not([type="radio"]) {
  min-height: var(--soda-shape-control-h, auto);
}
</style>
