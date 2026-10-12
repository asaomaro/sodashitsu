import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
export interface HistorySession {
  panes: Map<string, Pane>;
  tabs: Map<string, Tab>;
  workspaces: Map<string, Workspace>;
}
/** このクライアントが最後に表示したtab/pane。共有のfocus変更には追従しない。 */
export class ViewHistory {
  private workspaces = new Map<string, string>();
  private panes = new Map<string, string>();
  remember(
    workspaceId: string | null,
    tabId: string | null,
    paneId: string | null,
    session: HistorySession,
  ) {
    if (!workspaceId || !tabId || session.tabs.get(tabId)?.workspaceId !== workspaceId) return;
    this.workspaces.set(workspaceId, tabId);
    if (paneId && session.panes.get(paneId)?.tabId === tabId && !session.panes.get(paneId)?.virtual)
      this.panes.set(tabId, paneId);
  }
  tab(workspaceId: string, session: HistorySession) {
    const ws = session.workspaces.get(workspaceId);
    if (!ws) return null;
    return (
      [this.workspaces.get(workspaceId), ws.activeTabId, ...ws.tabIds].find(
        (id) => id && ws.tabIds.includes(id) && session.tabs.get(id)?.workspaceId === workspaceId,
      ) ?? null
    );
  }
  pane(tabId: string, session: HistorySession) {
    const tab = session.tabs.get(tabId);
    if (!tab) return null;
    const valid = (id: string | undefined | null) =>
      !!id && session.panes.get(id)?.tabId === tabId && !session.panes.get(id)?.virtual;
    if (valid(tab.zoomedPaneId)) return tab.zoomedPaneId;
    const remembered = this.panes.get(tabId);
    return valid(remembered)
      ? remembered!
      : valid(tab.focusedPaneId)
        ? tab.focusedPaneId
        : ([...session.panes.values()].find((p) => p.tabId === tabId && !p.virtual)?.id ?? null);
  }
  clear() {
    this.workspaces.clear();
    this.panes.clear();
  }
}
