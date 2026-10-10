<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { AgentForkPreviewResult } from "@sodashitsu/protocol";
import { clientErrorMessage, errorCodeOf } from "@sodashitsu/client-core";
import { ActionDispatcherKey } from "../injection.js";
import { useAgentForkStore } from "../store/agentFork.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { forkReasonText, noteStatusText, stageText } from "./agentFork.js";

/**
 * エージェントの fork のダイアログ（20261009-agent-fork PR2。AC1〜AC3）。形は `WorktreeCreateDialog` を踏襲する（ネイティブの `<dialog>`・Esc は自分で閉じる）。
 * 確定の前に `agent.fork_preview`（読み取りだけ）で、行き先・ブランチ名・作成先・注意（コミットしていない変更・引き継がれないもの）を見せる。
 * 確定の後は、進み具合（`agent.fork_progress`。`agentFork` ストア）と結果。**閉じても裏で続き**、完了・失敗はトーストで出る。
 * 会話の id・コマンドは、ここでは扱わない（サーバが pane の記録から引く）。
 */
const view = useViewStore();
const session = useSessionStore();
const actions = inject(ActionDispatcherKey);
const forkStore = useAgentForkStore();

const dialogEl = ref<HTMLDialogElement | null>(null);
const firstEl = ref<HTMLElement | null>(null);

const ctx = computed(() => (view.dialogContext?.kind === "agentFork" ? view.dialogContext : null));
const paneId = computed(() => ctx.value?.paneId ?? null);

const preview = ref<AgentForkPreviewResult | null>(null);
const previewError = ref<string | null>(null);
const targetKind = ref<"same" | "worktree">("same");
const branch = ref("");
const note = ref(true);
const submitting = ref(false);
const submitError = ref<string | null>(null);
/** 最後に確かめたブランチ名の結果（入力に追いつくまでの間は、確定を押せない）。 */
const checkedBranch = ref<string | null>(null);

const run = computed(() => (paneId.value ? forkStore.runs[paneId.value] : undefined));
/** 進み具合の画面を出すか（このダイアログから始めた、または進行中のもの）。 */
const showRun = computed(() => run.value !== undefined && (run.value.mine || !run.value.finished));

let seq = 0;
async function loadPreview(branchName?: string): Promise<void> {
  const id = paneId.value;
  if (!id || !actions) return;
  const my = ++seq;
  try {
    const r = await actions.forkPreview(id, branchName && branchName.trim() !== "" ? branchName.trim() : undefined);
    if (my !== seq) return;
    preview.value = r;
    previewError.value = null;
    checkedBranch.value = branchName?.trim() ?? null;
    if (branchName === undefined && r.suggestedBranch !== null && branch.value === "") branch.value = r.suggestedBranch;
  } catch (err) {
    if (my !== seq) return;
    const code = errorCodeOf(err);
    previewError.value = code ? clientErrorMessage(code) : "確かめられませんでした。";
  }
}

watch(
  () => view.dialogContext,
  (next) => {
    if (next?.kind === "agentFork") {
      preview.value = null;
      previewError.value = null;
      targetKind.value = "same";
      branch.value = "";
      note.value = true;
      submitting.value = false;
      submitError.value = null;
      checkedBranch.value = null;
      void loadPreview();
      void nextTick(() => {
        dialogEl.value?.showModal();
        firstEl.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

let debounce: ReturnType<typeof setTimeout> | undefined;
watch(branch, (b) => {
  if (targetKind.value !== "worktree") return;
  if (debounce !== undefined) clearTimeout(debounce);
  debounce = setTimeout(() => void loadPreview(b), 250);
});
watch(targetKind, (k) => {
  if (k === "worktree") void loadPreview(branch.value);
});
onBeforeUnmount(() => {
  if (debounce !== undefined) clearTimeout(debounce);
});

const unavailable = computed(() => (preview.value && !preview.value.available && preview.value.reason ? forkReasonText(preview.value.reason) : null));
const worktreeBlocked = computed(() => {
  const p = preview.value;
  if (!p || p.worktreeAvailable) return null;
  return p.worktreeReason === "not_a_git_repository" ? "git のリポジトリの中の pane ではないため、worktree へは fork できません。" : "worktree を用意できないため、fork できません。";
});
const branchExists = computed(() => targetKind.value === "worktree" && preview.value?.branchExists === true && checkedBranch.value === branch.value.trim());
const branchPending = computed(() => targetKind.value === "worktree" && checkedBranch.value !== branch.value.trim());
const canConfirm = computed(() => {
  if (!preview.value?.available || submitting.value) return false;
  if (targetKind.value === "worktree") {
    if (worktreeBlocked.value !== null) return false;
    if (branch.value.trim() === "" || branchExists.value || branchPending.value) return false;
  }
  return true;
});
const noteDisabledReason = computed(() => (preview.value?.noteUnsafe ? "パスに、送れない文字（制御文字・長すぎる）が含まれるため、最初の知らせは送れません。" : null));
const sourceName = computed(() => {
  const p = paneId.value ? session.panes.get(paneId.value) : undefined;
  return p?.agent?.name ?? p?.label ?? p?.title ?? (paneId.value ?? "").slice(0, 8);
});

async function confirm(): Promise<void> {
  const id = paneId.value;
  if (!id || !actions || !canConfirm.value) return;
  submitting.value = true;
  submitError.value = null;
  const target = targetKind.value === "worktree" ? ({ kind: "worktree", branch: branch.value.trim() } as const) : ({ kind: "same" } as const);
  const r = await actions.forkAgent(id, target, note.value && noteDisabledReason.value === null);
  submitting.value = false;
  if (!r.ok) {
    submitError.value = r.message;
    // ブランチ名が既にあったなら、次の確かめへ（確定を押せなくする）。
    if (r.code === "fork_branch_exists") void loadPreview(branch.value);
  }
}

function cancel(): void {
  view.closeDialog();
}
function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}
function dismissRun(): void {
  if (paneId.value) forkStore.forget(paneId.value);
  view.closeDialog();
}
</script>

<template>
  <dialog ref="dialogEl" class="fork-dialog" aria-labelledby="fork-dialog-title" @cancel="onNativeCancel" @click.self="cancel">
    <h2 id="fork-dialog-title" class="fork-dialog-title">会話を fork する<span class="fork-dialog-source">（{{ sourceName }}）</span></h2>

    <!-- 進み具合・結果 -->
    <div v-if="showRun && run" class="fork-run" data-fork-run>
      <p class="fork-run-stage" role="status" aria-live="polite" :data-fork-stage="run.stage">{{ stageText(run.stage) }}</p>
      <p v-if="run.name" class="fork-run-line">新しいエージェント: {{ run.name }}</p>
      <p v-if="run.worktreePath" class="fork-run-line">作成先: <span class="fork-path">{{ run.worktreePath }}</span></p>
      <p v-if="run.noteStatus" class="fork-run-note" data-fork-note :data-fork-note-status="run.noteStatus">{{ noteStatusText(run.noteStatus, run.noteReason) }}</p>
      <p v-if="run.stage === 'failed'" class="fork-error" role="alert" data-fork-failed>
        {{ run.message ?? "fork に失敗しました。" }}
        <template v-if="run.created?.worktreePath || run.created?.paneId">
          <br />残ったもの: <span v-if="run.created?.worktreePath" class="fork-path">{{ run.created.worktreePath }}</span
          ><span v-if="run.created?.paneId">（新しい pane は残してあります）</span>
        </template>
      </p>
      <p v-if="!run.finished" class="fork-hint">閉じても、裏で続きます。終わったらお知らせします。</p>
      <div class="fork-actions">
        <button type="button" class="fork-primary" @click="dismissRun">{{ run.finished ? "閉じる" : "閉じる（裏で続けます）" }}</button>
      </div>
    </div>

    <!-- 確定の前 -->
    <form v-else method="dialog" @submit.prevent="confirm">
      <p v-if="previewError" class="fork-error" role="alert">{{ previewError }}</p>
      <p v-else-if="preview === null" class="fork-hint" role="status">確かめています…</p>
      <p v-else-if="unavailable" class="fork-error" role="alert" data-fork-unavailable>{{ unavailable }}</p>
      <template v-else-if="preview">
        <p class="fork-hint">元のエージェントは止まりません。会話（とモデル）を引き継いだエージェントを、もう 1 つ起こします。<span v-if="preview.sessionHead">　会話: <code>{{ preview.sessionHead }}…</code></span></p>
        <fieldset class="fork-fieldset">
          <legend>行き先</legend>
          <label class="fork-radio"><input ref="firstEl" v-model="targetKind" type="radio" value="same" name="fork-target" data-fork-target="same" />同じフォルダの新しい pane</label>
          <label class="fork-radio" :class="{ 'fork-disabled': worktreeBlocked !== null }">
            <input v-model="targetKind" type="radio" value="worktree" name="fork-target" data-fork-target="worktree" :disabled="worktreeBlocked !== null" />新しい worktree（新しいブランチ）
          </label>
          <p v-if="worktreeBlocked" class="fork-hint" data-fork-worktree-blocked>{{ worktreeBlocked }}</p>
        </fieldset>

        <template v-if="targetKind === 'worktree'">
          <label class="fork-label">
            <span>ブランチ名</span>
            <input v-model="branch" type="text" class="fork-input" data-fork-branch :aria-invalid="branchExists" aria-describedby="fork-branch-msg" />
          </label>
          <p id="fork-branch-msg" class="fork-branch-msg" :class="{ 'fork-error': branchExists }" role="status" data-fork-branch-msg>
            <template v-if="branchExists">そのブランチ名は既にあります。別の名前にしてください。</template>
            <template v-else-if="branch.trim() === ''">ブランチ名を入れてください。</template>
          </p>
          <p class="fork-run-line"><span class="fork-label-text">作成先</span> <span class="fork-path" data-fork-target-path>{{ preview.targetPath ?? "（ブランチ名を入れると出ます）" }}</span></p>
          <p v-if="preview.sourceDir" class="fork-run-line"><span class="fork-label-text">元のフォルダ</span> <span class="fork-path">{{ preview.sourceDir }}</span></p>
          <p v-if="preview.dirtyCount !== null && preview.dirtyCount > 0" class="fork-warn" data-fork-dirty>
            元のフォルダに、コミットしていない変更が {{ preview.dirtyCount }} 件あります。新しい worktree には<strong>来ません</strong>（<code>.gitignore</code> されたファイルも同じです）。
          </p>
          <label class="fork-check" :class="{ 'fork-disabled': noteDisabledReason !== null }">
            <input v-model="note" type="checkbox" data-fork-note-check :disabled="noteDisabledReason !== null" />最初の知らせを送る（元のフォルダのファイルを変更しないよう伝えます）
          </label>
          <p v-if="noteDisabledReason" class="fork-hint">{{ noteDisabledReason }}</p>
        </template>

        <p class="fork-hint" data-fork-notinherited>引き継がれないもの: 権限のモード（新しい会話は既定）・追加したフォルダ（<code>--add-dir</code>）。長い会話の fork は、起動に時間と費用がかかります。</p>
        <p v-if="submitError" class="fork-error" role="alert" data-fork-submit-error>{{ submitError }}</p>
      </template>

      <div class="fork-actions">
        <button type="button" @click="cancel">取りやめ</button>
        <button type="submit" class="fork-primary" :disabled="!canConfirm" data-fork-submit>{{ submitting ? "起動しています…" : "fork する" }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.fork-dialog {
  box-shadow: var(--soda-shape-shadow, none);
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: var(--soda-shape-radius);
  min-width: 30em;
  max-width: min(44em, 92vw);
  padding: var(--soda-shape-pad, 1em);
}
.fork-dialog::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.fork-dialog-title {
  margin: 0 0 0.6em;
  font-size: 1.05em;
}
.fork-dialog-source {
  font-weight: normal;
  opacity: 0.75;
}
.fork-fieldset {
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  margin: 0.6em 0;
  padding: 0.4em 0.8em 0.6em;
}
.fork-radio,
.fork-check {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin: 0.3em 0;
}
.fork-label {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  margin-top: 0.6em;
}
.fork-input {
  font: inherit;
  padding: 0.3em 0.5em;
}
.fork-input[aria-invalid="true"] {
  border-color: var(--soda-error-fg, #ff5555);
}
.fork-run-line,
.fork-run-note {
  margin: 0.4em 0 0;
  font-size: 0.9em;
}
.fork-label-text {
  opacity: 0.75;
}
.fork-path {
  overflow-wrap: anywhere;
  font-family: var(--soda-mono, monospace);
  font-size: 0.9em;
}
.fork-hint {
  margin: 0.6em 0 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.fork-warn {
  margin: 0.6em 0 0;
  font-size: 0.9em;
  color: var(--soda-warn-fg, #ffb86c);
}
.fork-error {
  margin: 0.6em 0 0;
  color: var(--soda-error-fg, #ff5555);
}
.fork-branch-msg {
  margin: 0.3em 0 0;
  font-size: 0.85em;
  min-height: 1.2em;
}
.fork-disabled {
  opacity: 0.55;
}
.fork-run-stage {
  margin: 0.2em 0 0.4em;
  font-weight: bold;
}
.fork-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5em;
  margin-top: 1em;
}
/* 押せる部品の高さ（20261008-ui-style。クラシックでは変数が無く、何もしない） */
.fork-dialog button,
.fork-dialog input:not([type="checkbox"]):not([type="radio"]) {
  min-height: var(--soda-shape-control-h, auto);
}
</style>
