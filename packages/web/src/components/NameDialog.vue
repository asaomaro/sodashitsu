<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";

/**
 * 名前の入力ダイアログ（T23。design「ダイアログ」）。`view.dialogContext` の
 * `newTab` / `renamePane` / `renameTab` / `renameWorkspace` を扱う。今の名前を入力済み・全選択で開く。
 * 新規 tab は tab の数＋1 を入力済みにする（D55 の 12）。空欄で確定した場合は `ActionDispatcher` 側で
 * 名前を送らない（`confirmNewTab`/`confirmRenameTab` が判定する）。**workspace は空なら自動の名前に戻す**（`label: null` を送る。
 * 自動の名前のまま変えずに確定したら送らない——`confirmRenameWorkspace`。20260921-workspace-auto-label）。
 * 新規 tab は「プリフィルした値から変更していない」場合も送らない（herdr の `overlay_input.rs`
 * `trimmed != default_name` と同じ。D75）——このコンポーネントがプリフィル値を空文字に読み替えて
 * `confirmNewTab` に渡す（`ActionDispatcher` 側の「空なら送らない」判定をそのまま使う）。
 */
// `createGroup`/`renameGroup`（20260923-workspace-grouping）もこのダイアログを再利用する——
// どちらも「1行で名前を決める」という点で `renameWorkspace` 等と同じ形だから。
const NAME_KINDS = new Set(["newTab", "renamePane", "renameTab", "renameWorkspace", "createGroup", "renameGroup"]);

const session = useSessionStore();
const view = useViewStore();
const actions = inject(ActionDispatcherKey);
if (!actions) throw new Error("NameDialog: ActionDispatcherKey が provide されていません");

const dialogEl = ref<HTMLDialogElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const value = ref("");
/** 開いたときのプリフィル値（newTab の「変更なし」判定用。D75）。 */
let openedWithValue = "";

function initialValue(): string {
  const ctx = view.dialogContext;
  if (!ctx) return "";
  if (ctx.kind === "newTab") {
    const ws = session.workspaces.get(ctx.workspaceId);
    return ws ? String(ws.tabIds.length + 1) : "";
  }
  if (ctx.kind === "renamePane" || ctx.kind === "renameTab" || ctx.kind === "renameWorkspace" || ctx.kind === "renameGroup") return ctx.currentLabel;
  return ""; // createGroup は空から始める（新規作成なので今の名前が無い）
}

function title(): string {
  switch (view.dialogContext?.kind) {
    case "newTab":
      return "新しい tab の名前";
    case "renamePane":
      return "pane の名前を変更";
    case "renameTab":
      return "tab の名前を変更";
    case "renameWorkspace":
      return "workspace の名前を変更";
    case "createGroup":
      return "新しいグループの名前";
    case "renameGroup":
      return "グループの名前を変更";
    default:
      return "";
  }
}

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx && NAME_KINDS.has(ctx.kind)) {
      value.value = initialValue();
      openedWithValue = value.value;
      void nextTick(() => {
        dialogEl.value?.showModal();
        inputEl.value?.focus();
        inputEl.value?.select();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

// `actions` を参照するので、TS の const 絞り込みが効く arrow function（`function` 宣言は不可。narrow が外れる）。
const confirm = (): void => {
  const ctx = view.dialogContext;
  if (!ctx) return;
  if (ctx.kind === "newTab") {
    const trimmed = value.value.trim();
    // プリフィルから変更していなければ、送信対象を空文字にして「送らない」判定へ合流させる（D75）。
    actions.confirmNewTab(trimmed === openedWithValue.trim() ? "" : value.value);
  } else if (ctx.kind === "renamePane") actions.confirmRenamePane(value.value);
  else if (ctx.kind === "renameTab") actions.confirmRenameTab(value.value);
  else if (ctx.kind === "renameWorkspace") actions.confirmRenameWorkspace(value.value);
  else if (ctx.kind === "createGroup") actions.confirmCreateGroup(value.value);
  else if (ctx.kind === "renameGroup") actions.confirmRenameGroup(value.value);
};

/** workspace の名前を変えるときの手掛かり。空で確定すると自動の名前に戻ることと、いま自動の名前かどうか。 */
const workspaceHint = computed(() => {
  const ctx = view.dialogContext;
  if (ctx?.kind !== "renameWorkspace") return "";
  const now = ctx.currentAutoLabel ? "いまは自動の名前です。" : "";
  return `${now}空にして確定すると、自動の名前（リポジトリ名かフォルダ名）に戻ります。`;
});

function cancel(): void {
  view.closeDialog();
}

/** ネイティブの Esc（`<dialog>` の `cancel` イベント）。既定の close は抑止し、状態の後始末は `cancel()` に任せる。 */
function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}
</script>

<template>
  <dialog ref="dialogEl" class="name-dialog" @cancel="onNativeCancel" @click.self="cancel">
    <form method="dialog" @submit.prevent="confirm">
      <label class="name-dialog-label">
        <span>{{ title() }}</span>
        <input
          ref="inputEl"
          v-model="value"
          type="text"
          class="name-dialog-input"
          :aria-describedby="workspaceHint ? 'name-dialog-hint' : undefined"
        />
      </label>
      <!-- workspace の名前を変えるときだけ（tab・pane の見た目は変えない。20260921-workspace-auto-label の design D8）。 -->
      <p v-if="workspaceHint" id="name-dialog-hint" class="name-dialog-hint">{{ workspaceHint }}</p>
      <div class="name-dialog-actions">
        <button type="button" @click="cancel">キャンセル</button>
        <button type="submit">OK</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.name-dialog {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: 4px;
  min-width: 20em;
  /* workspace の名前変更の手掛かり（1 行の文）がダイアログを横に広げすぎないよう、上限を置いて折り返させる（20260921-workspace-auto-label）。 */
  max-width: min(30em, calc(100% - 16px));
  padding: 1em;
}
.name-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.name-dialog-label {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.name-dialog-input {
  font: inherit;
  padding: 0.3em 0.5em;
}
.name-dialog-hint {
  margin: 0.4em 0 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.name-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
  margin-top: 1em;
}
</style>
