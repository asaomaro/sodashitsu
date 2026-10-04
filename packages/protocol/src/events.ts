import type {
  AgentInfo,
  MachineStatus,
  Pane,
  SessionFocus,
  SidebarLayout,
  Tab,
  Workspace,
  WorkspaceGroup,
} from "./model.js";
import type { AgentIntegrationStatusResult, SharedPrefs } from "./messages.js";
import type { Graph, LinkRun } from "./graph.js";
import type { CommandListResult } from "./commands.js";

/**
 * イベント（design.md「WebSocket の通信」のイベント表。architecture.md の独立点検で data の形を確定）。
 */

export interface WorkspaceCreatedEvent {
  event: "workspace.created";
  data: { workspace: Workspace };
}
export interface WorkspaceUpdatedEvent {
  event: "workspace.updated";
  data: { workspace: Workspace };
}
export interface WorkspaceClosedEvent {
  event: "workspace.closed";
  data: { workspaceId: string };
}
/**
 * workspace の並び順が変わった（20260923-workspace-grouping。decisions.md D5）。`workspace.move`/
 * `workspace.move_to` は動いた workspace 自身のフィールドを変えない（サーバ側 Map の並びを
 * 作り直すだけ）ので、既存の `WorkspaceUpdatedEvent` だけでは並び替えを伝えられない——この
 * イベントで新しい全順序（workspace id の配列）を明示的に配る。
 */
export interface WorkspaceOrderChangedEvent {
  event: "workspace.order_changed";
  data: { workspaceIds: string[] };
}
/** サイドバーの項目の並びが変わった（20261004-group-worktree-items）。新しい並びの全体を配る。 */
export interface SidebarLayoutChangedEvent {
  event: "sidebar.layout_changed";
  data: { layout: SidebarLayout };
}
/** 手動グループを作った（20260923-workspace-grouping）。 */
export interface GroupCreatedEvent {
  event: "group.created";
  data: { group: WorkspaceGroup };
}
/** 手動グループの名前変更・折りたたみ状態が変わった。 */
export interface GroupUpdatedEvent {
  event: "group.updated";
  data: { group: WorkspaceGroup };
}
/** 手動グループを削除した（メンバーの workspace 自体は消えない。個々の groupId の変更は
 *  `WorkspaceUpdatedEvent` で配る）。 */
export interface GroupDeletedEvent {
  event: "group.deleted";
  data: { groupId: string };
}
export interface TabCreatedEvent {
  event: "tab.created";
  data: { tab: Tab };
}
export interface TabUpdatedEvent {
  event: "tab.updated";
  data: { tab: Tab };
}
export interface TabClosedEvent {
  event: "tab.closed";
  data: { tabId: string };
}
export interface LayoutUpdatedEvent {
  event: "layout.updated";
  data: { tab: Tab };
}
export interface PaneCreatedEvent {
  event: "pane.created";
  data: { pane: Pane };
}
export interface PaneUpdatedEvent {
  event: "pane.updated";
  data: { pane: Pane };
}
export interface PaneExitedEvent {
  event: "pane.exited";
  data: { paneId: string; exitCode: number };
}
export interface PaneClosedEvent {
  event: "pane.closed";
  /**
   * `successorPaneId`（20260925-pane-replace-focus-hint）: この pane に focus していた
   * クライアントが選ぶべき後継 pane の推奨ヒント。`replacePane`（生存した pane が常に後継）と、
   * スクロールバックのエディタの pane を閉じたとき（開いた元の pane。20260926-edit-scrollback）だけが埋める。
   * それ以外の `closePane`/`closeTab`/`closeWorkspace` は含めない
   * （クライアント側は既存の DFS-first-leaf の規則にフォールバックする）。
   */
  data: { paneId: string; successorPaneId?: string };
}
export interface PaneAgentStatusChangedEvent {
  event: "pane.agent_status_changed";
  data: { paneId: string; agent: AgentInfo | null };
}
export interface PaneSizeChangedEvent {
  event: "pane.size_changed";
  data: { paneId: string; cols: number; rows: number };
}
/**
 * pane の直結の所有者が変わった（20260926-pane-direct-connect）。`clientId` は所有者の `client.hello` の clientId で、直結が終わったら null。
 * 奪われた `sodactl pane attach` はこれで終わる。ブラウザは今は使わない。
 */
export interface PaneAttachChangedEvent {
  event: "pane.attach_changed";
  data: { paneId: string; clientId: string | null };
}
export interface SessionFocusChangedEvent {
  event: "session.focus_changed";
  data: { focus: SessionFocus | null };
}
export interface ClientErrorEvent {
  event: "client.error";
  /** `paneId` は対象の pane が決まる知らせ（`input_queue_full`。20260927-server-size-input-limits）だけに載る。 */
  data: { code: string; message: string; paneId?: string };
}
/** 導入状態・自動再開設定が変わったときに全クライアントへ配布する（20260923-agent-session-resume）。 */
export interface AgentIntegrationChangedEvent {
  event: "agent_integration.changed";
  data: AgentIntegrationStatusResult;
}

/** 保存した SSH のマシンの一覧・状態・名前が変わった（20260927-multi-host-machines）。中身は `machine.list` と同じ。 */
export interface MachineChangedEvent {
  event: "machine.changed";
  data: { machines: MachineStatus[] };
}
/** 独自コマンドの一覧が変わった（読み直し。20260927-custom-command-keys）。全クライアントへ配る。 */
export interface CommandUpdatedEvent {
  event: "command.updated";
  data: CommandListResult;
}
/**
 * popup が閉じた（コマンドが終わった・閉じる要求・開いた接続の切断・サーバの停止。20260927-custom-command-keys）。`exitCode` はコマンドが
 * 自分で終わったときだけ。全クライアントへ配るが、その popup を開いた接続以外は知らない id として無視する。
 */
export interface CommandPopupClosedEvent {
  event: "command.popup_closed";
  data: { popupId: string; exitCode?: number };
}

/**
 * 共有の設定が保存された（`prefs.set`。20260927-cli-mode）。全クライアントへ配る（保存した本人にも）。`byClientId` は保存した接続の clientId——
 * 自分の変更の反映を二重に行わないために使える。
 */
export interface PrefsChangedEvent {
  event: "prefs.changed";
  data: { prefs: SharedPrefs; rev: number; byClientId: string };
}

/**
 * 連携のグラフが保存された（`graph.update`・`graph.pause`／`graph.resume`・サーバの実行による回数の変化。20260927-agent-graph）。全クライアントへ配る。
 * `byClientId` は変えた接続の clientId（サーバ自身の変更——実行の回数・上限での一時停止——は null）。
 */
export interface GraphChangedEvent {
  event: "graph.changed";
  data: { graph: Graph; byClientId: string | null };
}
/** 線が 1 回動いた（送った・待ち・見送り・失敗。20260927-agent-graph）。全クライアントへ配る。 */
export interface GraphFiredEvent {
  event: "graph.fired";
  data: { run: LinkRun };
}

/**
 * 質問が出た（`sodactl ask`。20261002-sodactl-ask）。**中身（定義）は載せない**——全クライアントへ配るので、sodactl・軽い接続にも届く。
 * 質問を出せる画面（`ask.subscribe` 済み）は `ask.get` で定義を取る。
 */
export interface AskOpenedEvent {
  event: "ask.opened";
  data: { askId: string; paneId: string };
}
/** 質問が閉じた（回答・取り消し・時間切れ・pane が閉じた・呼び出し側の切断）。全クライアントへ配るが、知らない id は無視する。 */
export interface AskClosedEvent {
  event: "ask.closed";
  data: { askId: string; paneId: string };
}

export type ServerEvent =
  | WorkspaceCreatedEvent
  | WorkspaceUpdatedEvent
  | WorkspaceClosedEvent
  | WorkspaceOrderChangedEvent
  | GroupCreatedEvent
  | GroupUpdatedEvent
  | GroupDeletedEvent
  | SidebarLayoutChangedEvent
  | TabCreatedEvent
  | TabUpdatedEvent
  | TabClosedEvent
  | LayoutUpdatedEvent
  | PaneCreatedEvent
  | PaneUpdatedEvent
  | PaneExitedEvent
  | PaneClosedEvent
  | PaneAgentStatusChangedEvent
  | PaneSizeChangedEvent
  | PaneAttachChangedEvent
  | SessionFocusChangedEvent
  | ClientErrorEvent
  | AgentIntegrationChangedEvent
  | MachineChangedEvent
  | CommandUpdatedEvent
  | CommandPopupClosedEvent
  | PrefsChangedEvent
  | GraphChangedEvent
  | GraphFiredEvent
  | AskOpenedEvent
  | AskClosedEvent;

export type ServerEventName = ServerEvent["event"];
