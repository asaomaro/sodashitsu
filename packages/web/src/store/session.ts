import type { AgentInfo, HostInfo, Pane, SessionFocus, SessionLimits, SessionSnapshot, Tab, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 構造と状態の保持（architecture.md「store/session」）。出力（バイト列）は持たない（規則 5）。
 * `SessionSnapshot` と `ServerEvent` の反映は `store/StoreAdapter` が行う——ここはミューテーションだけを持つ。
 */
export const useSessionStore = defineStore("session", () => {
  const protocolVersion = ref<1 | null>(null);
  const serverVersion = ref("");
  const host = ref<HostInfo | null>(null);
  /** `client.hello` の応答の `clientId`（このブラウザ自身。サイズ権限の判定に使う）。 */
  const clientId = ref<string | null>(null);
  const workspaces = ref(new Map<string, Workspace>());
  const tabs = ref(new Map<string, Tab>());
  const panes = ref(new Map<string, Pane>());
  /** 手動グループ（20260923-workspace-grouping。herdr に前例が無い独自拡張）。 */
  const groups = ref(new Map<string, WorkspaceGroup>());
  const focus = ref<SessionFocus | null>(null);
  const limits = ref<SessionLimits>({ scrollbackLines: 5000 });
  /**
   * 同じ session の根の名前付き session の数（`server.sessions` の結果。20260926-named-session-ui）。既定の session のサイドバーに
   * session の入口を出すかを決める。hello のたびと一覧を開くたびに取り直す（失敗したら前の値のまま）。
   */
  const namedSessionCount = ref(0);

  function setNamedSessionCount(n: number): void {
    namedSessionCount.value = n;
  }

  function applySnapshot(s: SessionSnapshot, myClientId: string): void {
    protocolVersion.value = s.protocol;
    serverVersion.value = s.serverVersion;
    host.value = s.host;
    clientId.value = myClientId;
    workspaces.value = new Map(s.workspaces.map((w) => [w.id, w]));
    tabs.value = new Map(s.tabs.map((t) => [t.id, t]));
    panes.value = new Map(s.panes.map((p) => [p.id, p]));
    groups.value = new Map(s.groups.map((g) => [g.id, g]));
    focus.value = s.focus;
    limits.value = s.limits;
  }

  /**
   * マシンの切り替えの前に、前のマシンの workspace・tab・pane・グループ・焦点を捨てる（20260927-multi-host-machines。id がマシンをまたいで
   * 衝突するので持ち越さない）。host・limits は次の snapshot が上書きするまで残す（表示のちらつきを避ける）。
   */
  function clear(): void {
    workspaces.value = new Map();
    tabs.value = new Map();
    panes.value = new Map();
    groups.value = new Map();
    focus.value = null;
    clientId.value = null;
    namedSessionCount.value = 0;
  }

  /** このクライアントがその tab のサイズ権限を持っているか（design「サイズ権限」）。 */
  function hasSizeAuthority(tabId: string): boolean {
    return clientId.value !== null && tabs.value.get(tabId)?.sizeOwnerClientId === clientId.value;
  }

  function workspaceUpserted(w: Workspace): void {
    workspaces.value.set(w.id, w);
  }
  function workspaceClosed(workspaceId: string): void {
    workspaces.value.delete(workspaceId);
  }
  /**
   * `workspace.order_changed`（20260923-workspace-grouping。decisions.md D5）：`Map.set` は
   * 既存キーの挿入位置を動かさないので、`workspace.updated` の upsert では並び替えを表現できない。
   * サーバと同じ「エントリを並べ替えてから `new Map(...)` で作り直す」技法をここにも適用する。
   * イベントに含まれない（ローカルにまだ無い）id は無視し、ローカルにあるがイベントに含まれない
   * workspace は末尾に残す（防御的——競合するイベント順序があっても壊れない）。
   */
  function workspacesReordered(workspaceIds: string[]): void {
    const known = new Set(workspaces.value.keys());
    const ordered = workspaceIds.filter((id) => known.has(id));
    const missing = [...workspaces.value.keys()].filter((id) => !ordered.includes(id));
    const entries = [...ordered, ...missing].map((id) => [id, workspaces.value.get(id)!] as const);
    workspaces.value = new Map(entries);
  }
  function groupUpserted(g: WorkspaceGroup): void {
    groups.value.set(g.id, g);
  }
  function groupDeleted(groupId: string): void {
    groups.value.delete(groupId);
  }
  function tabUpserted(t: Tab): void {
    tabs.value.set(t.id, t);
  }
  function tabClosed(tabId: string): void {
    tabs.value.delete(tabId);
  }
  function paneUpserted(p: Pane): void {
    panes.value.set(p.id, p);
  }
  function paneClosed(paneId: string): void {
    panes.value.delete(paneId);
  }
  function paneAgentStatusChanged(paneId: string, agent: AgentInfo | null): void {
    const p = panes.value.get(paneId);
    if (p) panes.value.set(paneId, { ...p, agent });
  }
  function paneSizeChanged(paneId: string, cols: number, rows: number): void {
    const p = panes.value.get(paneId);
    if (p) panes.value.set(paneId, { ...p, cols, rows });
  }
  function sessionFocusChanged(f: SessionFocus | null): void {
    focus.value = f;
  }

  /** その workspace 配下の全 pane（集約の計算に使う。`store/seen` の `aggregate` と組み合わせる）。 */
  function panesInWorkspace(workspaceId: string): Pane[] {
    const result: Pane[] = [];
    for (const pane of panes.value.values()) {
      if (tabs.value.get(pane.tabId)?.workspaceId === workspaceId) result.push(pane);
    }
    return result;
  }

  return {
    protocolVersion,
    serverVersion,
    host,
    clientId,
    workspaces,
    tabs,
    panes,
    groups,
    focus,
    limits,
    namedSessionCount,
    setNamedSessionCount,
    applySnapshot,
    clear,
    hasSizeAuthority,
    workspaceUpserted,
    workspaceClosed,
    workspacesReordered,
    groupUpserted,
    groupDeleted,
    tabUpserted,
    tabClosed,
    paneUpserted,
    paneClosed,
    paneAgentStatusChanged,
    paneSizeChanged,
    sessionFocusChanged,
    panesInWorkspace,
  };
});
