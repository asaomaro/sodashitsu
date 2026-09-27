<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { aggregate, displayStateFor, useSeenStore, type STATE_PRIORITY } from "../store/seen.js";
import StateIcon from "../components/StateIcon.vue";
import { useViewStore } from "../store/view.js";

/**
 * 全画面のピッカー（04-mobile T4。design「1 列のレイアウト」：「workspace / tab の切替と、エージェントの
 * 一覧を全画面のピッカーで開ける」「表示する pane は 1 つで、pane のピッカーで切り替える」）。
 * `Sidebar.vue`（03-web-desktop）と同じ集約ロジック（`store/seen` の `aggregate`/`displayStateFor`）を、
 * モバイル向けの全画面レイアウトで使う——デスクトップのサイドバーとモバイルのピッカーは表示形が違うだけで
 * 中身（workspace / tab / agent の一覧と状態）は同じという判断（zellij の Web のモバイル UI と同じ考え方。
 * research.md F11.9）。開閉は `MobileShell.vue`（T5）が持つ（`v-if` で出し入れする）。
 *
 * AC-I1「Esc で閉じる」：他のダイアログ（`NameDialog`・`HelpDialog` 等）は native `<dialog>` に任せられるが、
 * ここは全画面の `<div>`（`role="dialog"`）なので、自前で keydown を受けて閉じる必要がある（04-mobile
 * レビューで発見——当初 `×` ボタンでしか閉じられなかった）。`ContextMenu.vue`（03-web-desktop）と同じ
 * 手法：マウント時に自身へ `.focus()` して keydown を受け取れるようにする。
 */
const emit = defineEmits<{ close: [] }>();

const session = useSessionStore();
const seen = useSeenStore();
const view = useViewStore();
const conn = inject(ConnectionKey);
const rootEl = ref<HTMLElement | null>(null);
onMounted(() => rootEl.value?.focus());

const spaces = computed(() =>
  [...session.workspaces.values()].map((ws) => {
    const wsStates = session.panesInWorkspace(ws.id).map((p) => displayStateFor(p.agent, seen.getSeenSeq(p.agent?.instanceId ?? "", p.agent?.serverSeenSeq ?? 0)));
    const tabs = ws.tabIds
      .map((id) => session.tabs.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((tab) => {
        const tabStates = [...session.panes.values()].filter((p) => p.tabId === tab.id).map((p) => displayStateFor(p.agent, seen.getSeenSeq(p.agent?.instanceId ?? "", p.agent?.serverSeenSeq ?? 0)));
        return { tab, state: aggregate(tabStates) as keyof typeof STATE_PRIORITY | null };
      });
    return { workspace: ws, state: aggregate(wsStates) as keyof typeof STATE_PRIORITY | null, tabs };
  }),
);

const agents = computed(() =>
  [...session.panes.values()]
    .filter((p) => p.agent)
    .map((p) => {
      const tab = session.tabs.get(p.tabId);
      const ws = tab ? session.workspaces.get(tab.workspaceId) : undefined;
      const agent = p.agent!;
      const state = displayStateFor(agent, seen.getSeenSeq(agent.instanceId, agent.serverSeenSeq));
      return { pane: p, tab, workspace: ws, agent, state };
    }),
);

function selectWorkspace(workspaceId: string): void {
  const ws = session.workspaces.get(workspaceId);
  if (!ws) return;
  const tab = session.tabs.get(ws.activeTabId);
  view.setView(workspaceId, ws.activeTabId);
  if (tab) view.focusPane(tab.focusedPaneId);
  void conn?.request("workspace.focus", { workspaceId }).catch(() => undefined);
  emit("close");
}

function selectTab(tabId: string): void {
  const tab = session.tabs.get(tabId);
  if (!tab) return;
  view.setView(tab.workspaceId, tabId);
  view.focusPane(tab.focusedPaneId);
  void conn?.request("tab.focus", { tabId }).catch(() => undefined);
  emit("close");
}

function selectPane(paneId: string, tabId: string, workspaceId: string): void {
  view.setView(workspaceId, tabId);
  view.focusPane(paneId);
  void conn?.request("pane.focus", { paneId }).catch(() => undefined);
  emit("close");
}
</script>

<template>
  <div ref="rootEl" class="pane-picker" role="dialog" aria-modal="true" aria-label="pane の一覧" tabindex="-1" @keydown.esc="emit('close')">
    <div class="pane-picker-header">
      <button type="button" class="pane-picker-close" aria-label="閉じる" @click="emit('close')">×</button>
    </div>
    <section class="pane-picker-section" aria-label="spaces">
      <div v-for="{ workspace, state, tabs } in spaces" :key="workspace.id" class="pane-picker-workspace">
        <button type="button" class="pane-picker-row pane-picker-row-workspace" @click="selectWorkspace(workspace.id)">
          <StateIcon class="pane-picker-state" :state="state" />
          <span class="pane-picker-label">{{ workspace.label }}</span>
        </button>
        <button v-for="{ tab, state: tabState } in tabs" :key="tab.id" type="button" class="pane-picker-row pane-picker-row-tab" @click="selectTab(tab.id)">
          <StateIcon class="pane-picker-state" :state="tabState" />
          <span class="pane-picker-label">{{ tab.label }}</span>
        </button>
      </div>
    </section>
    <section class="pane-picker-section" aria-label="agents">
      <button
        v-for="{ pane, tab, workspace, agent, state } in agents"
        :key="pane.id"
        type="button"
        class="pane-picker-row"
        @click="selectPane(pane.id, pane.tabId, workspace?.id ?? '')"
      >
        <StateIcon class="pane-picker-state" :state="state" />
        <span class="pane-picker-label">{{ workspace?.label }} / {{ tab?.label }} — {{ agent.name ? `${agent.name}（${agent.label}）` : agent.label }}</span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.pane-picker {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  flex-direction: column;
  background: var(--soda-bg, #1e1f29);
  color: var(--soda-fg, #f8f8f2);
  overflow-y: auto;
}
.pane-picker-header {
  display: flex;
  justify-content: flex-end;
  padding: 0.5em;
}
.pane-picker-close {
  font: inherit;
  font-size: 1.5em;
  line-height: 1;
  padding: 0.2em 0.5em;
  color: inherit;
  background: none;
  border: none;
}
.pane-picker-section {
  padding: 0.5em 0;
}
.pane-picker-workspace {
  display: flex;
  flex-direction: column;
}
.pane-picker-row {
  display: flex;
  align-items: center;
  gap: 0.6em;
  width: 100%;
  padding: 0.6em 1em;
  font: inherit;
  text-align: left;
  color: inherit;
  background: none;
  border: none;
}
.pane-picker-row-tab {
  padding-left: 2.5em;
}
/* 状態の印の見た目は `StateIcon.vue` だけが持つ（20260921-herdr-settings-gaps の D2）。 */
.pane-picker-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
