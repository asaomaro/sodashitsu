<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";

/**
 * 既にある手動グループを選んで workspace を追加するダイアログ（20260923-workspace-grouping。
 * design「振る舞いの詳細（グループの作成・追加・削除）」）。
 *
 * 形は `WorktreeOpenDialog.vue` をそのまま踏襲する（ネイティブの `<dialog>` ＋ `role="listbox"` ＋
 * 自前のキー処理。`GotoPicker` に寄せた同じ流儀）。**一覧は開いた時点の `session.groups` から
 * `dialogContext` に載せて渡す**（`worktreeOpen` の `entries` と同じ「開く時点で中身が確定している」
 * 形）ので、ここでは絞り込みや再取得をしない。
 */
const view = useViewStore();
const actions = inject(ActionDispatcherKey);

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const selected = ref(0);

const groups = computed(() => (view.dialogContext?.kind === "addToGroup" ? view.dialogContext.groups : []));
/** 「別のグループへ移す…」から開いたときは見出しを変える。 */
const title = computed(() => (view.dialogContext?.kind === "addToGroup" && view.dialogContext.moving ? "別のグループへ移す" : "グループへ追加"));

watch(
  () => view.dialogContext,
  (next) => {
    if (next?.kind === "addToGroup") {
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
  const n = groups.value.length;
  if (n === 0) return;
  selected.value = (selected.value + delta + n) % n;
}

const accept = (): void => {
  const group = groups.value[selected.value];
  if (group) actions?.confirmAddToGroup(group.id);
};

/** クリックで選んでそのまま確定する（`WorktreeOpenDialog.vue`/`GotoPicker.vue` と同じ流儀）。 */
function choose(index: number): void {
  selected.value = index;
  accept();
}

function cancel(): void {
  view.closeDialog();
}

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}

/** `WorktreeOpenDialog`/`GotoPicker` と同じ流儀：↑↓ と j/k で移動、Enter で確定、Esc で閉じる。 */
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
  }
}
</script>

<template>
  <!-- キー処理は `<ul>` ではなく `<dialog>` で受ける（`WorktreeOpenDialog`/`GotoPicker`/`HelpDialog` と同じ形）。 -->
  <dialog
    ref="dialogEl"
    class="group-picker-dialog"
    :aria-label="title"
    @cancel="onNativeCancel"
    @click.self="cancel"
    @keydown="onKeydown"
  >
    <p class="group-picker-dialog-title">{{ title }}</p>
    <ul ref="listEl" class="group-picker-dialog-list" role="listbox" tabindex="-1">
      <li
        v-for="(group, index) in groups"
        :key="group.id"
        class="group-picker-dialog-item"
        :class="{ 'group-picker-dialog-item-selected': index === selected }"
        role="option"
        :aria-selected="index === selected"
        @click="choose(index)"
      >
        {{ group.label }}
      </li>
    </ul>
  </dialog>
</template>

<style scoped>
.group-picker-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: 4px;
  min-width: 24em;
  padding: 1em;
}
.group-picker-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.group-picker-dialog-title {
  margin: 0 0 0.6em;
  font-size: 0.9em;
  opacity: 0.75;
}
.group-picker-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.group-picker-dialog-item {
  padding: 0.4em 0.6em;
  cursor: pointer;
}
.group-picker-dialog-item:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
/* `:hover` と詳細度をそろえ、後に置くことで選択中を勝たせる（`WorktreeOpenDialog.vue` と同じ理由）。 */
.group-picker-dialog-item.group-picker-dialog-item-selected {
  background: var(--soda-menu-active-bg, #44475a);
}
</style>
