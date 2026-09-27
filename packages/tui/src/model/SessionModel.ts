import type {
  AgentInfo,
  AgentIntegrationStatusResult,
  CommandListResult,
  DisplayState,
  HostInfo,
  Pane,
  PrefsChangedEvent,
  ServerEvent,
  SessionFocus,
  SessionLimits,
  SessionSnapshot,
  Tab,
  Workspace,
  WorkspaceGroup,
} from "@sodashitsu/protocol";
import {
  aggregate,
  displayStateFor,
  repairView,
  sweepMarkSeen,
  type ViewTarget,
} from "@sodashitsu/client-core";

/**
 * 端末版のセッションのモデル（20260927-cli-mode の architecture「model/SessionModel.ts」）。web の `store/session.ts`（保持）と
 * `store/StoreAdapter.ts`（snapshot とイベントの適用・表示の修復）を pinia なしの 1 クラスにしたもの。**イベントの適用の規則は web と同じ**。
 * 表示（workspace / tab / 焦点の pane）はクライアントごと（web の `store/view` と同じ）。既読（`done`）もクライアントごとに手元のメモリへ持つ（design D-3）。
 */
export interface SessionModelHooks {
  onPaneClosed?(paneId: string): void;
  onPaneExited?(paneId: string, exitCode: number): void;
  onClientError?(code: string, message: string): void;
  onPrefsChanged?(data: PrefsChangedEvent["data"]): void;
  onAgentChanged?(paneId: string, prev: AgentInfo | null, next: AgentInfo | null): void;
}

export class SessionModel {
  clientId: string | null = null;
  serverVersion = "";
  host: HostInfo | null = null;
  workspaces = new Map<string, Workspace>();
  tabs = new Map<string, Tab>();
  panes = new Map<string, Pane>();
  groups = new Map<string, WorkspaceGroup>();
  focus: SessionFocus | null = null;
  limits: SessionLimits = { scrollbackLines: 5000 };
  /** 公式フック連携の状態（設定画面を開いたときの `agent_integration.status` と `agent_integration.changed`）。 */
  agentIntegration: AgentIntegrationStatusResult | null = null;
  /** 独自コマンドの一覧（接続ごとの `command.list`・`command.updated`・`reload_config`。コマンドの文字列は来ない）。 */
  commands: CommandListResult = { commands: [], problem: null };

  /** 独自コマンドの一覧を置き換える（`command.list`・`command.reload` の結果）。 */
  setCommands(r: CommandListResult): void {
    this.commands = normalizeCommands(r);
    this.emit();
  }

  /** このクライアントの表示。 */
  workspaceId: string | null = null;
  tabId: string | null = null;
  focusedPaneId: string | null = null;
  /** 直前に焦点のあった pane（`last_pane`。04 で使う）。 */
  lastFocusedPaneId: string | null = null;

  /** instanceId → 既読の completionSeq（web の `soda.seen.v1` と同じ意味。このプロセスのメモリだけ）。 */
  private readonly seen = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly hooks: SessionModelHooks = {}) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  applySnapshot(s: SessionSnapshot, clientId: string): void {
    this.serverVersion = s.serverVersion;
    this.host = s.host;
    this.clientId = clientId;
    this.workspaces = new Map(s.workspaces.map((w) => [w.id, w]));
    this.tabs = new Map(s.tabs.map((t) => [t.id, t]));
    this.panes = new Map(s.panes.map((p) => [p.id, p]));
    this.groups = new Map(s.groups.map((g) => [g.id, g]));
    this.focus = s.focus;
    this.limits = s.limits;
    // 表示の復元：前の表示（再接続）がまだ生きていればそのまま、無ければサーバの焦点、それも無ければ修復の規則（先頭）。
    const cur = this.viewTarget();
    const alive =
      cur.focusedPaneId !== null && this.panes.get(cur.focusedPaneId)?.tabId === cur.tabId;
    if (!alive && s.focus && this.panes.has(s.focus.paneId)) {
      this.workspaceId = s.focus.workspaceId;
      this.tabId = s.focus.tabId;
      this.focusedPaneId = s.focus.paneId;
    }
    this.repair();
    this.emit();
  }

  applyEvent(e: ServerEvent): void {
    this.applyToSession(e);
    this.repair(e.event === "pane.closed" ? e.data.successorPaneId : undefined);
    this.emit();
  }

  private applyToSession(e: ServerEvent): void {
    switch (e.event) {
      case "workspace.created":
      case "workspace.updated":
        this.workspaces.set(e.data.workspace.id, e.data.workspace);
        return;
      case "workspace.closed":
        this.workspaces.delete(e.data.workspaceId);
        return;
      case "workspace.order_changed": {
        // `Map.set` は既存キーの位置を動かさないので作り直す（web の `workspacesReordered` と同じ規則）。
        const known = new Set(this.workspaces.keys());
        const ordered = e.data.workspaceIds.filter((id) => known.has(id));
        const missing = [...this.workspaces.keys()].filter((id) => !ordered.includes(id));
        this.workspaces = new Map(
          [...ordered, ...missing].map((id) => [id, this.workspaces.get(id)!] as const),
        );
        return;
      }
      case "group.created":
      case "group.updated":
        this.groups.set(e.data.group.id, e.data.group);
        return;
      case "group.deleted":
        this.groups.delete(e.data.groupId);
        return;
      case "tab.created":
      case "tab.updated":
      case "layout.updated":
        this.tabs.set(e.data.tab.id, e.data.tab);
        return;
      case "tab.closed":
        this.tabs.delete(e.data.tabId);
        return;
      case "pane.created":
      case "pane.updated":
        this.panes.set(e.data.pane.id, e.data.pane);
        return;
      case "pane.closed":
        this.panes.delete(e.data.paneId);
        this.hooks.onPaneClosed?.(e.data.paneId);
        return;
      case "pane.agent_status_changed": {
        // 前の値はここでしか取れない（サーバは pane.updated より先にこれを送る。web の StoreAdapter と同じ）。
        const p = this.panes.get(e.data.paneId);
        const prev = p?.agent ?? null;
        if (p) this.panes.set(p.id, { ...p, agent: e.data.agent });
        this.hooks.onAgentChanged?.(e.data.paneId, prev, e.data.agent);
        return;
      }
      case "pane.size_changed": {
        const p = this.panes.get(e.data.paneId);
        if (p) this.panes.set(p.id, { ...p, cols: e.data.cols, rows: e.data.rows });
        return;
      }
      case "session.focus_changed":
        this.focus = e.data.focus;
        return;
      case "pane.exited":
        this.hooks.onPaneExited?.(e.data.paneId, e.data.exitCode);
        return;
      case "client.error":
        this.hooks.onClientError?.(e.data.code, e.data.message);
        return;
      case "prefs.changed":
        this.hooks.onPrefsChanged?.(e.data);
        return;
      case "command.updated":
        // 独自コマンドの一覧（読み直し。web の StoreAdapter と同じ）。
        this.commands = normalizeCommands(e.data);
        return;
      case "agent_integration.changed":
        // 公式フック連携の状態（設定画面の「エージェント連携」。web の `agentIntegrations` の store と同じ）。
        this.agentIntegration = e.data;
        return;
      default:
        // machine.changed・command.popup_closed・pane.attach_changed は 05 の T4・T6 で扱う。
        return;
    }
  }

  viewTarget(): ViewTarget {
    return { workspaceId: this.workspaceId, tabId: this.tabId, focusedPaneId: this.focusedPaneId };
  }

  /** 表示中のものが閉じられていたら、残っているものへ移す（web の `StoreAdapter.applyViewRepair` と同じ `repairView`）。 */
  private repair(successorHint?: string): void {
    const next = repairView(this.viewTarget(), this, successorHint);
    if (!next) return;
    this.workspaceId = next.workspaceId;
    this.tabId = next.tabId;
    if (next.focusedPaneId !== this.focusedPaneId) this.setFocusedPane(next.focusedPaneId);
  }

  /** 表示する workspace/tab を替える。 */
  setView(workspaceId: string, tabId: string, focusedPaneId?: string | null): void {
    this.workspaceId = workspaceId;
    this.tabId = tabId;
    if (focusedPaneId !== undefined) this.setFocusedPane(focusedPaneId);
    this.emit();
  }

  focusPane(paneId: string): void {
    const pane = this.panes.get(paneId);
    if (!pane) return;
    const tab = this.tabs.get(pane.tabId);
    if (!tab) return;
    this.workspaceId = tab.workspaceId;
    this.tabId = tab.id;
    this.setFocusedPane(paneId);
    this.emit();
  }

  private setFocusedPane(paneId: string | null): void {
    // null（pane が無くなった）のときは直前を更新しない（web の `view.focusPane` と同じ）。
    if (paneId !== null && this.focusedPaneId !== null && this.focusedPaneId !== paneId)
      this.lastFocusedPaneId = this.focusedPaneId;
    this.focusedPaneId = paneId;
  }

  currentTab(): Tab | undefined {
    return this.tabId ? this.tabs.get(this.tabId) : undefined;
  }

  /** このクライアントがその tab のサイズ権限を持っているか。 */
  hasSizeAuthority(tabId: string): boolean {
    return this.clientId !== null && this.tabs.get(tabId)?.sizeOwnerClientId === this.clientId;
  }

  /** workspace の tab を `tabIds` の順で（まだ載っていない新しい tab は後ろに。`repairView` と同じ）。 */
  tabsOf(workspaceId: string): Tab[] {
    const w = this.workspaces.get(workspaceId);
    if (!w) return [];
    const ids = [
      ...w.tabIds,
      ...[...this.tabs.values()]
        .filter((t) => t.workspaceId === w.id && !w.tabIds.includes(t.id))
        .map((t) => t.id),
    ];
    return ids
      .map((id) => this.tabs.get(id))
      .filter((t): t is Tab => t !== undefined && t.workspaceId === workspaceId);
  }

  panesInWorkspace(workspaceId: string): Pane[] {
    const result: Pane[] = [];
    for (const pane of this.panes.values())
      if (this.tabs.get(pane.tabId)?.workspaceId === workspaceId) result.push(pane);
    return result;
  }

  // --- 既読（done）---

  seenSeqOf(agent: AgentInfo): number {
    return this.seen.get(agent.instanceId) ?? agent.serverSeenSeq;
  }

  displayStateOf(pane: Pane): DisplayState | null {
    return pane.agent ? displayStateFor(pane.agent, this.seenSeqOf(pane.agent)) : null;
  }

  workspaceState(workspaceId: string): DisplayState | null {
    return aggregate(this.panesInWorkspace(workspaceId).map((p) => this.displayStateOf(p)));
  }

  /** 見えていて外側の端末にフォーカスがある pane の既読を進める（web の `sweepMarkSeen` と同じ規則）。変わったら true。 */
  sweepSeen(isVisible: (paneId: string) => boolean, windowFocused: boolean): boolean {
    let changed = false;
    sweepMarkSeen(this.panes.values(), isVisible, windowFocused, (instanceId, seq) => {
      // 同じ値を何度も記録しない（描画 → 既読 → 変更の知らせ → 描画…を 1 回で止める）。
      if ((this.seen.get(instanceId) ?? -1) >= seq) return;
      this.seen.set(instanceId, seq);
      changed = true;
    });
    if (changed) this.emit();
    return changed;
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

/** 独自コマンドの一覧の形を確かめる（版の違うサーバ・壊れた応答でも落ちない）。 */
function normalizeCommands(r: unknown): CommandListResult {
  const o = r && typeof r === "object" ? (r as Partial<CommandListResult>) : {};
  return {
    commands: Array.isArray(o.commands) ? o.commands : [],
    problem: typeof o.problem === "string" ? o.problem : null,
  };
}
