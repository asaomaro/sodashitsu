<script setup lang="ts">
import type { ServerSessionEntry } from "@wtm/protocol";
import { computed, inject, nextTick, ref, watch } from "vue";
import { ActionDispatcherKey } from "../injection.js";
import { sessionTarget, type SessionTarget } from "../serverSession/sessionTarget.js";
import { useViewStore } from "../store/view.js";

/**
 * session の一覧（切り替え。20260926-named-session-ui。herdr の `session attach`）。同じ session の根の session を並べ、開ける session を
 * 選ぶと新しいブラウザのタブで開く（別の session は別のオリジン＝その session のログインを通る）。
 *
 * 形は `GroupPickerDialog.vue`・`WorktreeOpenDialog.vue` を踏襲する（ネイティブの `<dialog>` ＋ `role="listbox"` ＋ 自前のキー処理：
 * ↑↓・j/k で移動、Enter で確定、Esc で閉じる、背景のクリックで閉じる）。それに閉じるボタンを足し、閉じたら開く前にフォーカスのあった
 * 要素（サイドバーの session のボタン）へ戻す（WAI-ARIA APG の Dialog (Modal)。research F1・design「ダイアログ」）。
 * 開けない項目（いま開いている・止まっている・届かない・開く先が分からない）も並べて理由を出すが、選んでも何もしない。
 */
const view = useViewStore();
const actions = inject(ActionDispatcherKey);

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const closeEl = ref<HTMLButtonElement | null>(null);
const selected = ref(0);
let returnFocusTo: HTMLElement | null = null;
let isOpen = false;

interface Row {
  entry: ServerSessionEntry;
  target: SessionTarget;
}

const rows = computed<Row[]>(() => {
  if (view.dialogContext?.kind !== "sessionSwitch") return [];
  const here = window.location.hostname;
  return view.dialogContext.sessions.map((entry) => ({
    entry,
    target: sessionTarget(entry, here),
  }));
});

function statusText(t: SessionTarget, entry: ServerSessionEntry): string {
  switch (t.kind) {
    case "open":
      return `ポート ${entry.endpoint?.port ?? ""} を新しいタブで開く`;
    case "current":
      return "いま開いている session";
    case "stopped":
      return `止まっています（起動: ${t.command}）`;
    case "unreachable":
      return "このマシンのブラウザからだけ開けます（ループバックで待ち受け）";
    case "unknown":
      return "開く先が分かりません（待ち受けの記録が無い・別のマシンで動いている・token の作り直し中等）";
  }
}

watch(
  () => view.dialogContext,
  (next) => {
    if (next?.kind === "sessionSwitch") {
      if (!isOpen)
        returnFocusTo =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      isOpen = true;
      const first = rows.value.findIndex((r) => r.target.kind === "open");
      selected.value = first === -1 ? 0 : first;
      void nextTick(() => {
        if (dialogEl.value && !dialogEl.value.open) dialogEl.value.showModal();
        if (first === -1) closeEl.value?.focus();
        else listEl.value?.focus();
      });
    } else if (isOpen) {
      isOpen = false;
      dialogEl.value?.close();
      // 例外：開いている間に開く前の pane が閉じられた（`retargetPreDialogFocus`）ときは、`closeDialog()` が `focusedPaneId` を実際に
      // 変えるので、その pane の `TerminalPane` の watch が端末へフォーカスを移しうる（どちらが勝つかは watch の順。decisions D8）。
      const back = returnFocusTo;
      returnFocusTo = null;
      if (back?.isConnected) back.focus();
    }
  },
);

function move(delta: number): void {
  const n = rows.value.length;
  if (n === 0) return;
  selected.value = (selected.value + delta + n) % n;
}

function accept(): void {
  const row = rows.value[selected.value];
  if (row?.target.kind === "open") actions?.openServerSession(row.target.url);
}

/** クリックで選んでそのまま確定する（開けない項目は選ぶだけ）。 */
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

/** `GroupPickerDialog` と同じ流儀。閉じるボタンの上の Enter・Space はネイティブのボタンのクリックに任せる。 */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    ev.preventDefault();
    cancel();
    return;
  }
  if (ev.target === closeEl.value) return;
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
  <dialog
    ref="dialogEl"
    class="session-switch-dialog"
    aria-label="session の一覧"
    @cancel="onNativeCancel"
    @click.self="cancel"
    @keydown="onKeydown"
  >
    <div class="session-switch-dialog-head">
      <p class="session-switch-dialog-title">
        session の一覧（開ける session は新しいタブで開きます）
      </p>
      <button
        ref="closeEl"
        type="button"
        class="session-switch-dialog-close"
        aria-label="閉じる"
        @click="cancel"
      >
        ×
      </button>
    </div>
    <ul
      ref="listEl"
      class="session-switch-dialog-list"
      role="listbox"
      tabindex="0"
      aria-label="session"
      :aria-activedescendant="rows.length > 0 ? `session-switch-item-${selected}` : undefined"
    >
      <li
        v-for="(row, index) in rows"
        :id="`session-switch-item-${index}`"
        :key="row.entry.name"
        class="session-switch-dialog-item"
        :class="{
          'session-switch-dialog-item-selected': index === selected,
          'session-switch-dialog-item-disabled': row.target.kind !== 'open',
        }"
        role="option"
        :aria-selected="index === selected"
        :aria-disabled="row.target.kind !== 'open' ? 'true' : undefined"
        :data-session-name="row.entry.name"
        @click="choose(index)"
      >
        <span class="session-switch-dialog-name">{{ row.entry.name }}</span>
        <span class="session-switch-dialog-status">{{ statusText(row.target, row.entry) }}</span>
      </li>
    </ul>
  </dialog>
</template>

<style scoped>
.session-switch-dialog {
  border: 1px solid var(--wtm-menu-border, #44475a);
  background: var(--wtm-menu-bg, #282a36);
  color: var(--wtm-menu-fg, #f8f8f2);
  border-radius: 4px;
  min-width: 24em;
  max-width: min(40em, 90vw);
  padding: 1em;
}
.session-switch-dialog::backdrop {
  background: var(--wtm-backdrop, rgba(0, 0, 0, 0.4));
}
.session-switch-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 0.6em;
  margin: 0 0 0.6em;
}
.session-switch-dialog-title {
  flex: 1;
  margin: 0;
  font-size: 0.9em;
  opacity: 0.75;
}
.session-switch-dialog-close {
  background: none;
  border: 1px solid var(--wtm-menu-border, #44475a);
  color: inherit;
  border-radius: 3px;
  cursor: pointer;
}
.session-switch-dialog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 60vh;
  overflow-y: auto;
}
.session-switch-dialog-item {
  display: flex;
  flex-direction: column;
  gap: 0.1em;
  padding: 0.4em 0.6em;
  cursor: pointer;
}
.session-switch-dialog-item:hover {
  background: var(--wtm-menu-hover-bg, #343746);
}
/* `:hover` と詳細度をそろえ、後に置くことで選択中を勝たせる（`GroupPickerDialog.vue` と同じ理由）。 */
.session-switch-dialog-item.session-switch-dialog-item-selected {
  background: var(--wtm-menu-active-bg, #44475a);
}
.session-switch-dialog-item-disabled {
  cursor: default;
}
.session-switch-dialog-name {
  font-weight: bold;
}
.session-switch-dialog-status {
  font-size: 0.85em;
  opacity: 0.75;
}
</style>
