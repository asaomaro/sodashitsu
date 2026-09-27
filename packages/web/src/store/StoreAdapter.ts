import type { AgentInfo, AgentIntegrationStatusResult, MachineStatus, ServerEvent, SessionSnapshot } from "@wtm/protocol";
import type { Pinia } from "pinia";
import type { ConnectionState, StorePort } from "../net/ports.js";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";
import { repairView } from "./viewRepair.js";

export interface StoreAdapterOptions {
  pinia: Pinia;
  onAuthRequired: () => void;
  onConnectionState: (s: ConnectionState) => void;
  /** `pane.exited`（シェルの終了。design「エラー処理」）。省略可——直後に `pane.closed` が届く。 */
  onPaneExited?: (paneId: string, exitCode: number) => void;
  /** `client.error`（要求 id の無い不正なフレームへの通知）。省略可。 */
  onClientError?: (code: string, message: string) => void;
  /** `StorePort.onOriginRejectSuspected`（D107）。省略可（省けば手がかりを出さない）。 */
  onOriginRejectSuspected?: (suspected: boolean) => void;
  /**
   * エージェントの状態が変わった（20260920-agent-notifications）。**`prev` は本物の前の値**——
   * `session` は前の値を持たないので、ここで更新の直前に読んで渡す。
   * `next` は `null` を取りうる（`PaneAgentStatusChangedEvent.data.agent`）。省略可。
   */
  onAgentChanged?: (paneId: string, prev: AgentInfo | null, next: AgentInfo | null) => void;
  /**
   * スナップショットを適用した（初回・再接続のたび）。**`first` は初回かどうか**——
   * 初回は基準線にし、再接続では「まだ知らせていないもの」だけを知らせる（AC14）。
   * `session.clientId` の有無では判定できない（再接続でも埋まる）ので、`StoreAdapter` 自身が持つ。省略可。
   */
  onSnapshotApplied?: (panes: { paneId: string; agent: AgentInfo | null }[], first: boolean) => void;
  /** pane が閉じた。**`pane.exited` とは別のイベント**（待ち行列と判定済みの掃除に要る）。省略可。 */
  onPaneClosed?: (paneId: string) => void;
  /** 公式フック連携の導入状態・自動再開設定が変わった（20260923-agent-session-resume）。省略可。 */
  onAgentIntegrationChanged?: (status: AgentIntegrationStatusResult) => void;
  /**
   * 保存した SSH のマシンの一覧が変わった（`machine.changed`。20260927-multi-host-machines）。**画面の接続がローカルを向いているときだけ**
   * 意味を持つ（リモートを向いていればそのマシンの登録簿）——使うかは呼び出し側（`main.ts`）が決める。省略可。
   */
  onMachinesChanged?: (machines: MachineStatus[]) => void;
}

/**
 * `StorePort` の実装（architecture.md「store/StoreAdapter」）。snapshot とイベントを各ストアに反映する。
 * 認証・接続状態（`onAuthRequired`/`onConnectionState`）は `store/view`（T16）の関心事だが、
 * `store/session`（T14）が先に作られる依存の順序（T14→T16）に合わせ、注入したコールバックへ委ねる
 * （T26 で `store/view` の該当メソッドを bind する）。
 */
export class StoreAdapter implements StorePort {
  /** 最初のスナップショットを適用したか（`onSnapshotApplied` の `first`）。 */
  #appliedSnapshot = false;

  constructor(private readonly opts: StoreAdapterOptions) {}

  /** 次の snapshot を初回（通知の基準線）として扱う（マシンの切り替え。20260927-multi-host-machines）。 */
  resetBaseline(): void {
    this.#appliedSnapshot = false;
  }

  applySnapshot(s: SessionSnapshot, clientId: string): void {
    const session = useSessionStore(this.opts.pinia);
    session.applySnapshot(s, clientId);
    const first = !this.#appliedSnapshot;
    this.#appliedSnapshot = true;
    this.opts.onSnapshotApplied?.(
      s.panes.map((p) => ({ paneId: p.id, agent: p.agent })),
      first,
    );
    // `client.hello` のたび（初回・再接続のたび）に表示を復元する（design「フォーカスと表示」）。
    // `view.restoreView`（T16）はここまで呼び出し元が無かった——T26 で結線した。
    useViewStore(this.opts.pinia).restoreView((workspaceId, tabId) => {
      const tab = session.tabs.get(tabId);
      return tab && tab.workspaceId === workspaceId ? tab.focusedPaneId : null;
    }, session.focus);
  }

  applyEvent(e: ServerEvent): void {
    this.applyEventToSession(e);
    // `successorPaneId`（20260925-pane-replace-focus-hint）: pane.closed が運ぶ後継ヒントを、
    // この1回の repair 呼び出しだけへ渡す（使い捨て。保持しない）。
    this.applyViewRepair(e.event === "pane.closed" ? e.data.successorPaneId : undefined);
  }

  /**
   * 表示中の pane / tab / workspace が閉じられていたら、残っているものへ表示と焦点を移す（D97）。
   * 構造のイベント以外では何も変わらない（`repairView` が null を返す）ので、毎回呼んでよい。
   * ダイアログを開いている間は、焦点そのものではなく「閉じたときに戻す先」を差し替える（焦点を動かすと
   * `TerminalPane` が `term.focus()` してダイアログからフォーカスを奪うため）。
   */
  private applyViewRepair(successorHint?: string): void {
    const session = useSessionStore(this.opts.pinia);
    const view = useViewStore(this.opts.pinia);
    const dialogOpen = view.openDialog !== null;
    const focused = dialogOpen ? (view.preDialogFocusPaneId ?? view.focusedPaneId) : view.focusedPaneId;
    const next = repairView({ workspaceId: view.workspaceId, tabId: view.tabId, focusedPaneId: focused }, session, successorHint);
    if (!next) return;
    if (next.workspaceId && next.tabId && (next.workspaceId !== view.workspaceId || next.tabId !== view.tabId)) view.setView(next.workspaceId, next.tabId);
    if (next.focusedPaneId === focused) return;
    if (dialogOpen) view.retargetPreDialogFocus(next.focusedPaneId);
    else view.focusPane(next.focusedPaneId);
  }

  private applyEventToSession(e: ServerEvent): void {
    const session = useSessionStore(this.opts.pinia);
    switch (e.event) {
      case "workspace.created":
      case "workspace.updated":
        session.workspaceUpserted(e.data.workspace);
        return;
      case "workspace.closed":
        session.workspaceClosed(e.data.workspaceId);
        return;
      case "workspace.order_changed":
        session.workspacesReordered(e.data.workspaceIds);
        return;
      case "group.created":
      case "group.updated":
        session.groupUpserted(e.data.group);
        return;
      case "group.deleted":
        session.groupDeleted(e.data.groupId);
        return;
      case "tab.created":
      case "tab.updated":
        session.tabUpserted(e.data.tab);
        return;
      case "layout.updated":
        session.tabUpserted(e.data.tab);
        return;
      case "tab.closed":
        session.tabClosed(e.data.tabId);
        return;
      case "pane.created":
      case "pane.updated":
        session.paneUpserted(e.data.pane);
        return;
      case "pane.closed":
        session.paneClosed(e.data.paneId);
        this.opts.onPaneClosed?.(e.data.paneId);
        return;
      case "pane.agent_status_changed": {
        // **前の値はここでしか取れない**（`session` は履歴を持たない）。更新する前に読む。
        // サーバは `pane.agent_status_changed` を `pane.updated` より**先に** publish するので
        // （`packages/server/src/session/SessionService.ts:361-366`）、この時点の値は「変わる前」。
        const prev = session.panes.get(e.data.paneId)?.agent ?? null;
        session.paneAgentStatusChanged(e.data.paneId, e.data.agent);
        this.opts.onAgentChanged?.(e.data.paneId, prev, e.data.agent);
        return;
      }
      case "pane.size_changed":
        session.paneSizeChanged(e.data.paneId, e.data.cols, e.data.rows);
        return;
      case "session.focus_changed":
        session.sessionFocusChanged(e.data.focus);
        return;
      case "pane.exited":
        this.opts.onPaneExited?.(e.data.paneId, e.data.exitCode);
        return;
      case "client.error":
        this.opts.onClientError?.(e.data.code, e.data.message);
        return;
      case "agent_integration.changed":
        this.opts.onAgentIntegrationChanged?.(e.data);
        return;
      case "machine.changed":
        this.opts.onMachinesChanged?.(e.data.machines);
        return;
    }
  }

  onAuthRequired(): void {
    this.opts.onAuthRequired();
  }

  onConnectionState(s: ConnectionState): void {
    this.opts.onConnectionState(s);
  }

  onOriginRejectSuspected(suspected: boolean): void {
    this.opts.onOriginRejectSuspected?.(suspected);
  }
}
