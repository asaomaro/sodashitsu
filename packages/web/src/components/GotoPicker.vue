<script setup lang="ts">
import type { DisplayState } from "@sodashitsu/protocol";
import { computed, inject, nextTick, ref, watch } from "vue";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { aggregate, displayStateFor, useSeenStore } from "../store/seen.js";
import { paneNameOf } from "../store/paneName.js";
import { useViewStore } from "../store/view.js";
import { depthFirstPaneIds } from "../term/layoutOrder.js";
import StateIcon from "./StateIcon.vue";

/**
 * goto（session navigator。T24。design「ダイアログ」「goto」）。herdr の `aggregate_navigation.rs`
 * `navigator_rows()`／`overlay_input.rs:628-771`（`route_overlay_key` の Navigator 分岐）を移植（D76）。
 * 本製品は 1 ホスト固定なので herdr の machine の段は無い（D56 の訂正 7）。
 *
 * workspace → tab → pane の木。最初は全展開（`open_navigator_overlay` が `expanded_workspaces` を
 * 全 workspace で初期化することを確認済み）。`/` で文字の絞り込み（名前・cwd・tab の名前・workspace の
 * ブランチ）、`b/w/i/d` で状態の絞り込み・`a` で解除、Backspace は状態の絞り込みだけを消す。
 * 絞り込み中は Esc は検索欄から離れるだけで絞り込みの内容は保持する（HelpDialog の Esc とは違う——
 * herdr は Navigator の Esc で `query`/`filter` を消さないが、Help の Esc は消す。D76）。
 */
type GotoTarget = { kind: "workspace"; workspaceId: string } | { kind: "tab"; tabId: string } | { kind: "pane"; paneId: string };

interface GotoRow {
  depth: 0 | 1 | 2;
  label: string;
  meta: string;
  state: DisplayState | null;
  current: boolean;
  target: GotoTarget;
}

const STATE_KEYS: Record<string, DisplayState> = { b: "blocked", w: "working", i: "idle", d: "done" };

function targetKey(t: GotoTarget): string {
  return t.kind === "workspace" ? `workspace:${t.workspaceId}` : t.kind === "tab" ? `tab:${t.tabId}` : `pane:${t.paneId}`;
}

const session = useSessionStore();
const seen = useSeenStore();
const view = useViewStore();
const conn = inject(ConnectionKey);

const dialogEl = ref<HTMLDialogElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const queryInputEl = ref<HTMLInputElement | null>(null);
const query = ref("");
const filter = ref<DisplayState | null>(null);
const selectedTarget = ref<GotoTarget | null>(null);
const expandedWorkspaces = ref<Set<string>>(new Set());

function paneState(paneId: string) {
  const pane = session.panes.get(paneId);
  if (!pane) return null;
  return displayStateFor(pane.agent, seen.getSeenSeq(pane.agent?.instanceId ?? "", pane.agent?.serverSeenSeq ?? 0));
}

const rows = computed<GotoRow[]>(() => {
  const q = query.value.trim().toLowerCase();
  const activeFilter = filter.value;
  const filtering = activeFilter !== null || q !== "";
  const textMatch = (v: string) => q === "" || v.toLowerCase().includes(q);
  const statusMatch = (s: DisplayState | null) => activeFilter === null || s === activeFilter;

  const out: GotoRow[] = [];
  for (const ws of session.workspaces.values()) {
    const tabRows: GotoRow[] = [];
    for (const tabId of ws.tabIds) {
      const tab = session.tabs.get(tabId);
      if (!tab) continue;
      const paneIds = depthFirstPaneIds(tab.layout);
      const paneRows: GotoRow[] = [];
      for (const [index, paneId] of paneIds.entries()) {
        const pane = session.panes.get(paneId);
        if (!pane) continue;
        const state = paneState(paneId);
        // 連鎖の正典は `store/paneName.ts` の `paneNameOf`（herdr のフォールバック連鎖と同じ）。
        // ここは tab 内の順番を既定にする。
        const label = paneNameOf(pane, `pane ${index + 1}`);
        // 名前（agent rename）が呼び名になっても、エージェントの種類の表示名でも引けるようにする（20260926-agent-start-rename）。
        if (!filtering || (statusMatch(state) && (textMatch(label) || textMatch(pane.agent?.label ?? "") || textMatch(pane.cwd)))) {
          paneRows.push({ depth: 2, label, meta: pane.cwd, state, current: view.focusedPaneId === paneId, target: { kind: "pane", paneId } });
        }
      }
      const tabState = aggregate(paneIds.map((id) => paneState(id)));
      const tabMatches = statusMatch(tabState) && textMatch(tab.label);
      if (!filtering || tabMatches || paneRows.length > 0) {
        tabRows.push({ depth: 1, label: tab.label, meta: `${paneIds.length} pane`, state: tabState, current: false, target: { kind: "tab", tabId: tab.id } });
        if (expandedWorkspaces.value.has(ws.id) || filtering) tabRows.push(...paneRows);
      }
    }
    const wsPaneStates = session.panesInWorkspace(ws.id).map((p) => paneState(p.id));
    const wsState = aggregate(wsPaneStates);
    const branch = ws.git?.branch ?? "";
    const wsMatches = statusMatch(wsState) && (textMatch(ws.label) || textMatch(branch));
    if (!filtering || wsMatches || tabRows.length > 0) {
      out.push({ depth: 0, label: ws.label, meta: branch, state: wsState, current: false, target: { kind: "workspace", workspaceId: ws.id } });
      if (expandedWorkspaces.value.has(ws.id) || filtering) out.push(...tabRows);
    }
  }
  return out;
});

const selectedKey = computed(() => (selectedTarget.value ? targetKey(selectedTarget.value) : null));

function selectedIndex(): number {
  const list = rows.value;
  if (selectedTarget.value) {
    const key = targetKey(selectedTarget.value);
    const idx = list.findIndex((r) => targetKey(r.target) === key);
    if (idx >= 0) return idx;
  }
  return list.length > 0 ? 0 : -1;
}

function moveSelection(delta: number): void {
  const list = rows.value;
  if (list.length === 0) {
    selectedTarget.value = null;
    return;
  }
  const next = Math.min(list.length - 1, Math.max(0, selectedIndex() + delta));
  selectedTarget.value = list[next]!.target;
}

function toggleWorkspaceExpand(workspaceId: string): void {
  const next = new Set(expandedWorkspaces.value);
  if (next.has(workspaceId)) next.delete(workspaceId);
  else next.add(workspaceId);
  expandedWorkspaces.value = next;
  selectedTarget.value = null;
}

function toggleSelectedWorkspace(): void {
  const row = rows.value[selectedIndex()];
  if (row?.target.kind === "workspace") toggleWorkspaceExpand(row.target.workspaceId);
}

function navigateTo(target: GotoTarget): void {
  if (target.kind === "workspace") {
    const ws = session.workspaces.get(target.workspaceId);
    if (!ws) return;
    const tab = session.tabs.get(ws.activeTabId);
    view.setView(target.workspaceId, ws.activeTabId);
    if (tab) view.focusPane(tab.focusedPaneId);
    void conn?.request("workspace.focus", { workspaceId: target.workspaceId }).catch(() => undefined);
  } else if (target.kind === "tab") {
    const tab = session.tabs.get(target.tabId);
    if (!tab) return;
    view.setView(tab.workspaceId, tab.id);
    view.focusPane(tab.focusedPaneId);
    void conn?.request("tab.focus", { tabId: target.tabId }).catch(() => undefined);
  } else {
    const pane = session.panes.get(target.paneId);
    const tab = pane ? session.tabs.get(pane.tabId) : undefined;
    if (!pane || !tab) return;
    view.setView(tab.workspaceId, tab.id);
    view.focusPane(target.paneId);
    void conn?.request("pane.focus", { paneId: target.paneId }).catch(() => undefined);
  }
}

function accept(): void {
  const row = rows.value[selectedIndex()];
  if (!row) return;
  // 先に閉じる（開く前の pane へ一旦戻す view.closeDialog）。新しい対象への上書きはそのあと
  // （`ActionDispatcher.confirmNewTab` と同じ順序）。
  view.closeDialog();
  navigateTo(row.target);
}

function selectRow(row: GotoRow): void {
  selectedTarget.value = row.target;
  accept();
}

watch(
  () => view.dialogContext,
  (ctx) => {
    if (ctx?.kind === "goto") {
      query.value = "";
      filter.value = null;
      expandedWorkspaces.value = new Set(session.workspaces.keys()); // 最初は全展開
      const current = rows.value.find((r) => r.current);
      selectedTarget.value = current?.target ?? null;
      void nextTick(() => {
        dialogEl.value?.showModal();
        listEl.value?.focus();
      });
    } else {
      dialogEl.value?.close();
    }
  },
);

const cancel = (): void => {
  view.closeDialog();
};

function onNativeCancel(ev: Event): void {
  ev.preventDefault();
  cancel();
}

const onDialogKeydown = (ev: KeyboardEvent): void => {
  const filtering = document.activeElement === queryInputEl.value;
  const key = ev.key;

  if (key === "Escape") {
    ev.preventDefault();
    if (filtering) queryInputEl.value?.blur(); // 検索欄から離れるだけ。絞り込みの内容は保持する。
    else cancel();
    return;
  }
  if (key === "Enter") {
    ev.preventDefault();
    accept();
    return;
  }
  if (filtering) {
    if (key === "ArrowUp" || (key === "p" && ev.ctrlKey)) {
      ev.preventDefault();
      moveSelection(-1);
    } else if (key === "ArrowDown" || (key === "n" && ev.ctrlKey)) {
      ev.preventDefault();
      moveSelection(1);
    }
    return;
  }

  if (key === "Backspace") {
    ev.preventDefault();
    filter.value = null; // 状態の絞り込みだけを消す（文字の絞り込みは検索欄にフォーカスがあるときの編集操作）。
    return;
  }
  if (key === "Home") {
    ev.preventDefault();
    selectedTarget.value = rows.value[0]?.target ?? null;
    return;
  }
  if (key === "End" || key === "G") {
    ev.preventDefault();
    selectedTarget.value = rows.value.at(-1)?.target ?? null;
    return;
  }
  if (key === "/") {
    ev.preventDefault();
    filter.value = null; // 検索欄に入ると状態の絞り込みは消える。
    queryInputEl.value?.focus();
    return;
  }
  if (key === "j" || key === "ArrowDown") {
    ev.preventDefault();
    moveSelection(1);
    return;
  }
  if (key === "k" || key === "ArrowUp") {
    ev.preventDefault();
    moveSelection(-1);
    return;
  }
  if (key === "d" && ev.ctrlKey) {
    ev.preventDefault();
    moveSelection(8);
    return;
  }
  if (key === "u" && ev.ctrlKey) {
    ev.preventDefault();
    moveSelection(-8);
    return;
  }
  if (!ev.ctrlKey && key in STATE_KEYS) {
    ev.preventDefault();
    query.value = "";
    filter.value = STATE_KEYS[key]!;
    selectedTarget.value = null;
    return;
  }
  if (key === "a") {
    ev.preventDefault();
    query.value = "";
    filter.value = null;
    selectedTarget.value = null;
    return;
  }
  if (key === " ") {
    ev.preventDefault();
    toggleSelectedWorkspace();
  }
};
</script>

<template>
  <dialog ref="dialogEl" class="goto-picker" aria-label="goto" @cancel="onNativeCancel" @click.self="cancel" @keydown="onDialogKeydown">
    <div class="goto-picker-search">
      <input ref="queryInputEl" v-model="query" type="text" role="combobox" aria-expanded="true" aria-controls="goto-picker-list" placeholder="/ で絞り込み・b/w/i/d で状態・a で解除" />
      <span v-if="filter" class="goto-picker-filter-badge">{{ filter }}</span>
    </div>
    <ul id="goto-picker-list" ref="listEl" class="goto-picker-list" role="listbox" tabindex="-1">
      <li
        v-for="row in rows"
        :key="targetKey(row.target)"
        role="option"
        class="goto-picker-row"
        :class="{ 'goto-picker-row-selected': targetKey(row.target) === selectedKey }"
        :aria-selected="targetKey(row.target) === selectedKey"
        :style="{ paddingLeft: `${row.depth * 1.25}em` }"
        @click="selectRow(row)"
      >
        <span v-if="row.target.kind === 'workspace'" class="goto-picker-caret" @click.stop="toggleWorkspaceExpand(row.target.workspaceId)">{{
          expandedWorkspaces.has(row.target.workspaceId) ? "▾" : "▸"
        }}</span>
        <StateIcon class="goto-picker-state" :state="row.state" />
        <span class="goto-picker-label">{{ row.label }}</span>
        <span v-if="row.current" class="goto-picker-current">現在地</span>
        <span v-if="row.meta" class="goto-picker-meta">{{ row.meta }}</span>
      </li>
      <li v-if="rows.length === 0" class="goto-picker-empty">一致するものがありません</li>
    </ul>
  </dialog>
</template>

<style scoped>
/* `display` は `[open]` に限定する（HelpDialog.vue の同じコメント参照。実機の Chromium を使う smoke
   （T26）で、無条件の `display: flex` が UA の既定（閉じていれば `display: none`）を上書きし、
   閉じていても描画されてクリックを奪う不具合を発見した）。 */
.goto-picker {
  border: 1px solid var(--soda-menu-border, #44475a);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  border-radius: 4px;
  width: min(36em, 90vw);
  max-height: 70vh;
  padding: 1em;
}
.goto-picker[open] {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
.goto-picker::backdrop {
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.goto-picker-search {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.goto-picker-search input {
  flex: 1;
  font: inherit;
  padding: 0.3em 0.5em;
}
.goto-picker-filter-badge {
  font-size: 0.8em;
  padding: 0.1em 0.5em;
  border-radius: 999px;
  background: var(--soda-menu-active-bg, #44475a);
}
.goto-picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
}
.goto-picker-row {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.2em 0.3em;
  cursor: pointer;
}
.goto-picker-row-selected {
  background: var(--soda-menu-active-bg, #44475a);
}
.goto-picker-caret {
  width: 1em;
  text-align: center;
}
/* 状態の印の見た目は `StateIcon.vue` だけが持つ（20260921-herdr-settings-gaps の D2）。 */
.goto-picker-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.goto-picker-current {
  font-size: 0.75em;
  opacity: 0.7;
}
.goto-picker-meta {
  font-size: 0.8em;
  /* 0.6 では選ばれた行（--soda-menu-active-bg）の上で 4.27:1 と WCAG 1.4.3 を割った。薄めて描く文字は 0.7 以上（20260921-theme-settings の
   * decisions D2。`theme/uiTokens.ts` の MUTED_TEXT_ALPHA）。 */
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 12em;
}
.goto-picker-empty {
  opacity: 0.7;
  padding: 0.3em;
}
</style>
