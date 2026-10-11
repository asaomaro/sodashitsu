<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useExtensionsStore } from "../store/extensions.js";
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
const NAME_KINDS = new Set(["projectFolder", "newTab", "renamePane", "renameTab", "renameWorkspace", "createGroup", "renameGroup"]);

const session = useSessionStore();
const view = useViewStore();
const actions = inject(ActionDispatcherKey);
if (!actions) throw new Error("NameDialog: ActionDispatcherKey が provide されていません");

const dialogEl = ref<HTMLDialogElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const value = ref("");
const pluginKey = ref("");
const extensions = useExtensionsStore();
const plugins = computed(() => {
  const ctx = view.dialogContext;
  if (ctx?.kind !== "newTab") return [];
  const ws = session.workspaces.get(ctx.workspaceId);
  return (extensions.list?.extensions ?? []).filter(e => e.tabView && e.state === "running" && (e.scope === "user" || (e.workspaceIds ? e.workspaceIds.includes(ctx.workspaceId) : e.root === (ws?.projectDir ?? ws?.cwd))));
});
const projectDir = computed(() => { const ctx = view.dialogContext; return ctx?.kind === "newTab" ? session.workspaces.get(ctx.workspaceId)?.projectDir : undefined; });
/** 開いたときのプリフィル値（newTab の「変更なし」判定用。D75）。 */
let openedWithValue = "";

function initialValue(): string {
  const ctx = view.dialogContext;
  if (!ctx) return "";
  if (ctx.kind === "projectFolder") return ctx.currentPath;
  if (ctx.kind === "newTab") {
    const ws = session.workspaces.get(ctx.workspaceId);
    return ws ? String(ws.tabIds.length + 1) : "";
  }
  if (ctx.kind === "renamePane" || ctx.kind === "renameTab" || ctx.kind === "renameWorkspace" || ctx.kind === "renameGroup") return ctx.currentLabel;
  return ""; // createGroup は空から始める（新規作成なので今の名前が無い）
}

function title(): string {
  switch (view.dialogContext?.kind) {
    case "projectFolder":
      return "PJフォルダを設定";
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
      pluginKey.value = "";
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
    const ext = plugins.value.find(e => e.key === pluginKey.value);
    if (pluginKey.value && (!ext || (ext.tabView?.requiresProject !== false && !projectDir.value))) return;
    const plugin = ext?.tabView ? { extensionKey: ext.key, display: ext.tabView.display } : undefined;
    const label = trimmed === openedWithValue.trim() ? (ext?.tabView?.title ?? "") : value.value;
    if (plugin) actions.confirmNewTab(label, plugin); else actions.confirmNewTab(label);
  } else if (ctx.kind === "projectFolder") actions.confirmProjectFolder(value.value);
  else if (ctx.kind === "renamePane") actions.confirmRenamePane(value.value);
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
      <label v-if="view.dialogContext?.kind === 'newTab'" class="name-dialog-label">
        <span>タブの種類</span>
        <select v-model="pluginKey" aria-label="タブの種類">
          <option value="">ターミナル</option>
          <option v-for="ext in plugins" :key="ext.key" :value="ext.key" :disabled="!projectDir && ext.tabView?.requiresProject !== false">{{ ext.tabView?.title }}（{{ ext.scope === 'user' ? 'ユーザー' : 'PJ' }}）</option>
        </select>
      </label>
      <p v-if="view.dialogContext?.kind === 'newTab'" class="name-dialog-hint name-dialog-project">
        <template v-if="projectDir"><span>PJフォルダ</span><span class="name-dialog-path">{{ projectDir }}</span></template>
        <template v-else>プラグインを使うには、spaces のメニューでPJフォルダを設定してください。</template>
      </p>
      <p v-if="view.dialogContext?.kind === 'projectFolder'" class="name-dialog-hint">サーバ側の絶対パスを指定してください。新しいターミナルとプラグインはこのフォルダを使います。空欄で設定を解除します。</p>
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
  box-sizing: border-box;
  box-shadow: var(--soda-shape-shadow, none);
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  min-width: min(20em, calc(100% - 16px));
  /* workspace の名前変更の手掛かり（1 行の文）がダイアログを横に広げすぎないよう、上限を置いて折り返させる（20260921-workspace-auto-label）。 */
  max-width: min(30em, calc(100% - 16px));
  padding: var(--soda-shape-pad, 1em);
}
.name-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.name-dialog form {
  display: flex;
  flex-direction: column;
  gap: 0.9em;
}
.name-dialog-label {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.name-dialog-input,
.name-dialog select {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
  padding: 0.3em 0.5em;
}
.name-dialog-hint {
  margin: 0;
  font-size: 0.85em;
  line-height: 1.5;
  opacity: 0.8;
}
.name-dialog-project {
  display: flex;
  flex-direction: column;
  gap: 0.15em;
}
.name-dialog-path {
  overflow-wrap: anywhere;
}
.name-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
  margin-top: 0.25em;
}
/* 押せる部品の高さ（20261008-ui-style。クラシックでは変数が無く、何もしない） */
.name-dialog button,
.name-dialog select,
.name-dialog input:not([type="checkbox"]):not([type="radio"]) {
  min-height: var(--soda-shape-control-h, auto);
}
</style>
