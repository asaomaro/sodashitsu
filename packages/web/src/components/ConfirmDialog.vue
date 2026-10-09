<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { type DialogContext, useViewStore } from "../store/view.js";
import { repoMembers } from "@sodashitsu/client-core";

/**
 * 閉じる確認ダイアログ（T23。design「ダイアログ」）。`view.dialogContext.kind === "confirmClose"` を扱う。
 * `role=alertdialog`・最初のフォーカスは「キャンセル」・`y`/`n` でも確定/取り消しできる。
 * 「束ねた worktree も一緒に閉じる」チェックボックス（20260923-workspace-grouping。herdr の
 * `close_group` 相当）は、対象が worktree グループの本体（親）1件のときだけ出す。
 *
 * `kind === "confirmReplacePane"`（20260924-pane-dnd-split-move。review 指摘 must）も同じ
 * ダイアログで扱う——D&D での分割解除（`pane.replace`）のドロップ先が busy なときの確認。
 * `pane.close` と同じ D23 の安全策を踏襲する（既存の busy pane 確認と見た目・操作感を揃える）。
 *
 * `kind === "confirmWorktreeRemove"`/`"confirmWorktreeRemoveForce"`（20260924-worktree-remove）
 * も同じダイアログで扱う——worktree の削除（と、dirty 時の `--force` 再実行）の確認。
 *
 * `kind === "confirmStopServer"`（`stop_server`。20260927-cli-mode）も同じダイアログで扱う——サーバの停止の確認。
 */
const session = useSessionStore();
const view = useViewStore();
const actions = inject(ActionDispatcherKey);
if (!actions) throw new Error("ConfirmDialog: ActionDispatcherKey が provide されていません");

const dialogEl = ref<HTMLDialogElement | null>(null);
const cancelBtn = ref<HTMLButtonElement | null>(null);
/** 「束ねた worktree も一緒に閉じる」チェックボックスの状態。既定オフ（design「振る舞いの詳細（一括クローズ）」）。 */
const closeLinkedWorktrees = ref(false);

const TARGET_LABEL: Record<"pane" | "tab" | "workspace", string> = {
  pane: "pane",
  tab: "tab",
  workspace: "workspace",
};

const message = computed(() => {
  const ctx = view.dialogContext;
  if (ctx?.kind === "confirmClose") {
    const labels = ctx.targets.map((t) => TARGET_LABEL[t.type]);
    return `閉じますか？（${labels.join("・")}）`;
  }
  if (ctx?.kind === "confirmReplacePane") {
    return "ドロップ先の pane はまだ動作中です。閉じてドラッグした pane に置き換えますか？";
  }
  if (ctx?.kind === "confirmWorktreeRemove") {
    return ctx.openWorkspaceId
      ? "この worktree は現在 workspace として開いています。workspace を閉じて worktree を削除しますか？"
      : "この worktree を削除しますか？";
  }
  if (ctx?.kind === "confirmStopServer") {
    const which = ctx.remote ? `保存したマシン「${ctx.target}」` : `このマシン（${ctx.target}）`;
    return `${which}の soda serve を止めますか？ そのサーバのすべての pane のプロセスが終わり、繋いでいる画面はすべて切れます。`;
  }
  if (ctx?.kind === "confirmWorktreeRemoveForce") {
    // 20260925-worktree-remove-locked。reason で理由に応じた文言を出し分ける（AC5）。
    return ctx.reason === "locked"
      ? "この worktree はロックされています。ロックを解除せずに強制的に削除しますか？"
      : "この worktree には未コミットの変更が残っています。変更を破棄して削除しますか？";
  }
  return "";
});

/** 確定ボタンの文言。worktree の削除系だけ「削除」——「閉じる」のままだと破壊的な操作に見えない。 */
const confirmLabel = computed(() => {
  const kind = view.dialogContext?.kind;
  if (kind === "confirmStopServer") return "止める";
  return kind === "confirmWorktreeRemove" || kind === "confirmWorktreeRemoveForce" ? "削除" : "閉じる";
});

/** 対象が worktree グループの本体（親）1件のときだけ、束ねられた linked worktree を返す（無ければ空）。 */
const linkedWorktrees = computed(() => {
  const ctx = view.dialogContext;
  if (ctx?.kind !== "confirmClose" || ctx.targets.length !== 1) return [];
  const target = ctx.targets[0]!;
  if (target.type !== "workspace") return [];
  // 一括クローズの対象は、リポジトリの本体（`repoMembers` の先頭）のときの残り全部（サーバの `repoCloseTargets` と同じ。
  // グループへ入っているかは見ない）。
  const repoKey = session.workspaces.get(target.id)?.git?.repoKey;
  if (!repoKey) return [];
  const members = repoMembers([...session.workspaces.values()], repoKey);
  return members.length > 1 && members[0]!.id === target.id ? members.slice(1) : [];
});

const CONFIRM_DIALOG_KINDS: DialogContext["kind"][] = ["confirmClose", "confirmReplacePane", "confirmWorktreeRemove", "confirmWorktreeRemoveForce", "confirmStopServer"];

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx && CONFIRM_DIALOG_KINDS.includes(ctx.kind)) {
      closeLinkedWorktrees.value = false; // 開くたびに既定オフへ戻す（confirmClose 以外では未使用）
      void nextTick(() => {
        dialogEl.value?.showModal();
        cancelBtn.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

// `actions` を参照するので arrow function にする（`function` 宣言だと const 絞り込みが効かない）。
const confirm = (): void => {
  const ctx = view.dialogContext;
  if (ctx?.kind === "confirmReplacePane") actions.confirmReplacePane();
  else if (ctx?.kind === "confirmWorktreeRemove") actions.confirmWorktreeRemove();
  else if (ctx?.kind === "confirmWorktreeRemoveForce") actions.confirmWorktreeRemoveForce();
  else if (ctx?.kind === "confirmStopServer") actions.confirmStopServer();
  else actions.confirmClose(closeLinkedWorktrees.value);
};

/**
 * worktree の削除系は、取り消すと一覧ダイアログへ「戻る」（`openWorktree` を呼び直す）——
 * `view.dialogContext` は単一の値で、一覧の上に確認を重ねてはいないため（design「設計方針」）。
 * それ以外（`confirmClose`/`confirmReplacePane`）は単に閉じるだけで、元々「上に開く」対象が無い。
 */
const cancel = (): void => {
  const ctx = view.dialogContext;
  if ((ctx?.kind === "confirmWorktreeRemove" || ctx?.kind === "confirmWorktreeRemoveForce") && ctx.closeOnCancel !== true) {
    actions.openWorktree(ctx.sourceWorkspaceId);
    return;
  }
  view.closeDialog();
};

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "y" || ev.key === "Y") {
    ev.preventDefault();
    confirm();
  } else if (ev.key === "n" || ev.key === "N") {
    ev.preventDefault();
    cancel();
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    role="alertdialog"
    aria-modal="true"
    class="confirm-dialog"
    @cancel="onNativeCancel"
    @click.self="cancel"
    @keydown="onKeydown"
  >
    <p class="confirm-dialog-message">{{ message }}</p>
    <label v-if="linkedWorktrees.length > 0" class="confirm-dialog-linked-worktrees">
      <input v-model="closeLinkedWorktrees" type="checkbox" />
      束ねた worktree も一緒に閉じる（{{ linkedWorktrees.length }} 件）
    </label>
    <div class="confirm-dialog-actions">
      <button ref="cancelBtn" type="button" @click="cancel">キャンセル</button>
      <button type="button" @click="confirm">{{ confirmLabel }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  min-width: 18em;
  padding: 1em;
}
.confirm-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.confirm-dialog-message {
  margin: 0 0 1em;
}
.confirm-dialog-linked-worktrees {
  display: flex;
  align-items: center;
  gap: 0.4em;
  margin: 0 0 1em;
  font-size: 0.9em;
}
.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
}
</style>
