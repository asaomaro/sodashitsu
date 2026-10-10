import type { AgentForkPreviewResult, AgentIntegrationInstallResult, AgentIntegrationKind, ItemTarget, NewCwd, PaneMoveBlock, WorkspaceGroup } from "@sodashitsu/protocol";
import type { Pinia } from "pinia";
import { nextTick } from "vue";
import { openDisplayMenu, pickFocusTarget, withDisplayChange } from "../display/displayOps.js";
import { focusFrame } from "../display/frameRegistry.js";
import type { DisplayHost } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import type { KeyInputController, ActionPort, FocusPort } from "../keys/KeyInputController.js";
import type { Action, CopyCommand, Dir } from "@sodashitsu/client-core";
import type { InputHold } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useMachinesStore } from "../store/machines.js";
import { LOCAL_MACHINE_ID, groupIdOfNavigateKey, paneMoveBlock, paneMoveBlockMessage, isRepresentative, isUngroupedNavigateKey, navigateKeyOfRow, repoMembers } from "@sodashitsu/client-core";
import { useAgentIntegrationsStore } from "../store/agentIntegrations.js";
import { useAgentForkStore } from "../store/agentFork.js";
import { useCommandsStore } from "../store/commands.js";
import { useSeenStore, displayStateFor } from "../store/seen.js";
import { orderedAgentPaneIds, type AgentOrderEntry } from "@sodashitsu/client-core";
import { currentNavigableRows, currentVisibleWorkspaceIds, itemGroupIdOf } from "../store/sidebarTree.js";
import {
  buildNewCwd,
  loadNewCwdPath,
  loadNewCwdPolicy,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneFrameThickness,
  loadPaneGaps,
  loadPaneOuterBorders,
  loadDisplayBandEdge,
  loadDisplayPanelDock,
  loadDisplayPanelInitial,
  loadDisplayScriptEnabled,
  loadShellCwdTracking,
  loadStatusSymbols,
  loadTabBarAlways,
  loadUiStyle,
  useSettingsStore,
} from "../store/settings.js";
import { loadAgentSort, loadSidebarCollapsed, loadSidebarSectionRatio, loadSidebarSectionsCollapsed, loadSidebarWidth, loadWorkspaceSort, readPrefs, useViewStore } from "../store/view.js";
import { loadScrollbackPref } from "../term/scrollback.js";
import { loadTabBarPosition, loadTabBarRightEntries, loadTabBarRightSeparator } from "@sodashitsu/client-core";
import { loadSidebarRows } from "@sodashitsu/client-core";
import { loadThemePrefs } from "@sodashitsu/client-core";
import { clientErrorMessage, errorCodeOf } from "@sodashitsu/client-core";
import { depthFirstPaneIds, neighborPaneId } from "@sodashitsu/client-core";
import type { MenuAt, MenuTarget, UiPort } from "../term/MouseBridge.js";
import { readClipboard, writeClipboard } from "../term/clipboard.js";
import type { TerminalRegistry } from "../term/TerminalRegistry.js";

export interface ActionDispatcherOptions {
  conn: ConnectionPort;
  pinia: Pinia;
  registry: TerminalRegistry;
  keys: KeyInputController;
  /** 新しい pane へ焦点を移す操作の応答を待つ間の入力を溜める関所（D99。`net/InputGate`）。省略時は溜めない。 */
  input?: { holdInput(sourcePaneId: string | null): InputHold };
  /**
   * 通知（20260920-agent-notifications）。`prefix+o` の行き先。**必須**——省略可にすると
   * **結線を落としたときに `prefix+o` が完全に無反応**になる（「キーを押したのに無反応を作らない」）。
   * 必須なら落とした時点で型で落ちる。
   */
  notifications: { focusNext(): void };
  /** クリップボードの画像の貼り付け（20260927-clipboard-image-paste。`term/ImagePaster`）。省略時はメニューの「貼り付け」はテキストだけ（今までの経路）。 */
  imagePaste?: { pasteClipboard(paneId: string): void };
  /** 設定を読み直す（`reloadConfig`）のとき、拡張の設定も読み直す（20261007-ext-host。古いサーバ〔`not_found`〕は黙って無視。省略時は何もしない）。 */
  extensionReload?: () => void;
}

/**
 * `Action` の実行（architecture.md「actions/ActionDispatcher」）。T17：構造の操作／T18：モード・ダイアログ・
 * その他（このファイル）。`ActionPort`・`FocusPort`・`UiPort` を実装する。
 */
export class ActionDispatcher implements ActionPort, FocusPort, UiPort {
  private readonly conn: ConnectionPort;
  private readonly session: ReturnType<typeof useSessionStore>;
  private readonly agentIntegrations: ReturnType<typeof useAgentIntegrationsStore>;
  private readonly seen: ReturnType<typeof useSeenStore>;
  private readonly view: ReturnType<typeof useViewStore>;
  private readonly displays: ReturnType<typeof useDisplayStore>;
  /** 保存した SSH のマシン（20260927-multi-host-machines）。ローカル以外を選んでいる間は session の一覧を使わない。 */
  private readonly machines: ReturnType<typeof useMachinesStore>;
  private readonly settings: ReturnType<typeof useSettingsStore>;
  private readonly commands: ReturnType<typeof useCommandsStore>;
  private readonly agentFork: ReturnType<typeof useAgentForkStore>;
  private readonly registry: TerminalRegistry;
  private readonly keys: KeyInputController;
  private readonly input: ActionDispatcherOptions["input"];
  private readonly notifications: ActionDispatcherOptions["notifications"];
  private readonly imagePaste: ActionDispatcherOptions["imagePaste"];
  private readonly extensionReload: ActionDispatcherOptions["extensionReload"];

  constructor(opts: ActionDispatcherOptions) {
    this.conn = opts.conn;
    this.input = opts.input;
    this.notifications = opts.notifications;
    this.imagePaste = opts.imagePaste;
    this.extensionReload = opts.extensionReload;
    this.session = useSessionStore(opts.pinia);
    this.agentIntegrations = useAgentIntegrationsStore(opts.pinia);
    this.seen = useSeenStore(opts.pinia);
    this.view = useViewStore(opts.pinia);
    this.displays = useDisplayStore(opts.pinia);
    this.machines = useMachinesStore(opts.pinia);
    this.settings = useSettingsStore(opts.pinia);
    this.commands = useCommandsStore(opts.pinia);
    this.agentFork = useAgentForkStore(opts.pinia);
    this.registry = opts.registry;
    this.keys = opts.keys;
  }

  focusedPaneId(): string | null {
    return this.view.focusedPaneId;
  }

  // --- UiPort --------------------------------------------------------------

  openContextMenu(target: MenuTarget, at: MenuAt): void {
    this.view.openContextMenu(target, at);
  }

  toast(message: string): void {
    this.view.toast(message);
  }

  run(action: Action): void {
    switch (action.type) {
      case "split":
        this.split(action.dir);
        return;
      case "focusDir":
        this.focusDir(action.dir);
        return;
      case "swap":
        this.swap(action.dir);
        return;
      case "cyclePane":
        this.cyclePane(action.delta);
        return;
      case "closePane":
        this.closePane();
        return;
      case "zoom":
        this.zoom();
        return;
      case "newTab":
        this.newTab();
        return;
      case "tabDelta":
        this.tabDelta(action.delta);
        return;
      case "tabIndex":
        this.tabIndex(action.index);
        return;
      case "closeTab":
        this.closeTab();
        return;
      case "newWorkspace":
        this.newWorkspace();
        return;
      case "closeWorkspace":
        this.closeWorkspace();
        return;
      case "enterMode":
        if (action.mode === "navigate") this.view.setNavigateSelection(this.view.workspaceId);
        if (action.mode === "copy") {
          const paneId = this.view.focusedPaneId;
          // copy モードに入るたび、カーソルを端末の現在の末尾位置へ合わせ直す（D94。CopyTarget は
          // pane の acquire 時に一度だけ作られ、位置を自分では追跡し続けないため）。
          if (paneId) this.registry.get(paneId)?.copy.resetCursor();
        }
        return; // モードの実際の遷移は KeyRouter 自身が行う（ModeSink 経由で view.mode に反映済み）
      case "exitMode":
        this.keys.setMode("terminal");
        return;
      case "help":
        this.view.openDialogWithContext({ kind: "help" });
        return;
      case "goto":
        this.view.openDialogWithContext({ kind: "goto" });
        return;
      case "toggleSidebar":
        this.view.toggleSidebar();
        return;
      case "toggleSidebarSection":
        // サイドバーを畳んでいる間も状態は変わる（見た目には出ない）。フォーカスは動かさない（20261004-ui-interaction-polish）。
        this.view.toggleSectionCollapsed(action.section);
        return;
      case "newWorktree": {
        // メニューは `workspace.git`（5 秒周期）を見るが、キーは見ない——作った直後でも始められるように。
        // git でなければサーバが `not_a_git_repository` を返し、下の toast に理由が出る（decisions.md D3）。
        const workspaceId = this.view.workspaceId;
        if (workspaceId) this.newWorktree(workspaceId);
        return;
      }
      case "detach":
        void this.conn.request("client.detach", {}).catch(() => undefined); // 後始末は Connection 自身が行う（D58）
        return;
      // 20260920-agent-notifications。**`switch` に `default` も網羅性の検査も無い**ので、
      // 足し忘れてもキーが黙って何もしないだけで型では落ちない。
      case "settings":
        this.view.openDialogWithContext({ kind: "settings" });
        return;
      case "nextNotification":
        this.notifications.focusNext();
        return;
      // 20261005-notify-bell。応答せずに閉じた知らせの一覧（画面のベルのボタンからも開ける）。
      case "openNotificationHistory":
        this.view.openDialogWithContext({ kind: "notificationHistory" });
        return;
      case "editScrollback":
        this.editScrollback();
        return;
      case "reloadConfig":
        this.reloadConfig();
        return;
      case "runCommand":
        this.runCommand(action.commandId);
        return;
      case "navigate":
        this.navigate(action.op, action.dir);
        return;
      case "resizeBy":
        this.resizeBy(action.dir, action.amount);
        return;
      case "copy":
        this.copy(action.cmd);
        return;
      case "renamePane":
        this.beginRenamePane();
        return;
      case "renameTab":
        this.beginRenameTab();
        return;
      case "renameWorkspace":
        this.beginRenameWorkspace();
        return;
      // 20260923-missing-keybinding-actions。
      case "workspaceDelta":
        this.workspaceDelta(action.delta);
        return;
      case "lastPane":
        this.lastPane();
        return;
      case "moveTab":
        this.moveTab(action.direction);
        return;
      // 20260923-workspace-grouping。
      case "moveWorkspace":
        this.moveWorkspace(action.direction);
        return;
      case "agentDelta":
        this.agentDelta(action.delta);
        return;
      case "focusAgentIndex":
        this.focusAgentIndex(action.index);
        return;
      // 20260927-cli-mode（herdr にあって Web に無かった操作。design D-7）。
      case "workspaceIndex":
        this.workspaceIndex(action.index);
        return;
      case "openWorktree": {
        const workspaceId = this.view.workspaceId;
        if (!workspaceId) return;
        // herdr と同じく、linked worktree の workspace からは始めない（一覧は repo の本体から開く。herdr の
        // 「New and open worktree actions start from the repo parent workspace.」）。
        if (this.session.workspaces.get(workspaceId)?.git?.isLinkedWorktree === true) {
          this.view.toast("worktree を開く操作は、repo の本体の workspace から始めてください。");
          return;
        }
        this.openWorktree(workspaceId);
        return;
      }
      case "removeWorktree":
        this.removeCurrentWorktree();
        return;
      case "swapWithFocused":
        this.swapWithFocused(action.paneId);
        return;
      case "stopServer":
        this.view.openDialogWithContext({ kind: "confirmStopServer", ...this.stopTarget() });
        return;
      // 20260927-agent-graph。グラフはダイアログの 1 枠とは別の状態。デスクトップでは基本画面とグラフの画面の入れ替え（サイドバーにフォーカスがあるときも同じ。20261008-graph-first）、
      // 1 列の画面では重ねるダイアログを開く（閉じるのはダイアログ自身。Esc・閉じるボタン・同じキー）。
      // 基本画面以外（グラフ・ダッシュボード）では、同じキーで基本画面へ戻す（ダッシュボードに入るキーは、今回は足さない。20261010-agent-usage PR3）。
      case "openGraph":
        if (this.view.screen === "graph") this.view.closeGraph();
        else if (this.view.screen !== "base") this.view.setScreen("base");
        else this.view.openGraph();
        return;
      case "displayMenu":
        this.displayMenu();
        return;
      case "focusDisplay":
        void this.focusDisplay();
        return;
      // 20261004-subagent-display。フォーカスしている pane のエージェントの一覧を開く。件数が 0・分からない（報告を受けていない）・
      // エージェントが居ないときは何もしない（開いても見るものが無い。サイドバーの件数のボタンが 1 件以上のときだけ出るのと同じ）。
      case "showSubagents": {
        const paneId = this.view.focusedPaneId;
        if (!paneId) return;
        const count = this.session.panes.get(paneId)?.agent?.subagents?.count ?? 0;
        if (count < 1) return;
        this.view.openDialogWithContext({ kind: "subagents", machineId: this.machines.selectedId, paneId });
        return;
      }
    }
  }

  /** T23（`NameDialog`）が新規 tab の名前を確定したときに呼ぶ。 */
  confirmNewTab(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "newTab") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    const hold = this.input?.holdInput(this.view.focusedPaneId); // D99：応答までに打った文字は新しい pane へ
    // 元の pane は焦点の pane が**作る先の workspace にあるときだけ**（無ければ載せない → その workspace の場所。design D7）。
    // **ダイアログを閉じた後に読む**——開いている間に焦点の pane が閉じられたら、閉じたときに戻す先へ差し替わっている（D97）。
    const newCwd = this.newCwdFor(this.focusedPaneIn(ctx.workspaceId));
    this.conn
      .request("tab.create", { workspaceId: ctx.workspaceId, ...(trimmed ? { label: trimmed } : {}), newCwd })
      .then((result) => {
        this.view.setView(ctx.workspaceId, result.tab.id);
        this.view.focusPane(result.pane.id);
        this.releaseHold(hold, result.pane.id);
        this.noteCwdFallback(result);
      })
      .catch(() => {
        hold?.cancel();
        this.view.toast("tab を作成できませんでした");
      });
  }

  // --- session の一覧と切り替え（20260926-named-session-ui。herdr の `session attach`）----------------

  /** 名前付き session の数を取り直す（hello のたび。サイドバーの入口の表示条件）。失敗は黙って前の値のまま。 */
  refreshServerSessions(): Promise<void> {
    // リモートのマシンを選んでいる間は、そのマシンの session の一覧を読まない（手元のブラウザのホスト名でそのポートを開けない）。
    if (this.machines.selectedId !== LOCAL_MACHINE_ID) {
      this.session.setNamedSessionCount(0);
      return Promise.resolve();
    }
    return this.conn
      .request("server.sessions", {})
      .then((r) => this.session.setNamedSessionCount(r.sessions.filter((e) => !e.default).length))
      .catch(() => undefined);
  }

  /** 独自コマンドの一覧を取り直す（20260927-custom-command-keys。接続ごとに `main.ts` が呼ぶ）。 */
  refreshCommands(): Promise<void> {
    return this.conn
      .request("command.list", {})
      .then((r) => this.commands.setCatalog(r))
      .catch(() => undefined);
  }

  /**
   * 独自コマンドを走らせる（20260927-custom-command-keys。herdr の `[[keys.command]]`）。送るのは id と、このブラウザでフォーカス中の pane だけ
   * （コマンドの文字列はサーバの `commands.json` にある）。一覧に無い id（読み直しで消えた）・焦点の無いときは何もしない。
   * - `shell`：裏で走らせ、「走らせました」を知らせる。
   * - `pane`：scrollback の編集と同じく、応答の pane へ焦点を移す（入力は応答まで溜める）。
   * - `popup`：浮いた端末の部品（`CommandPopup.vue`）を開く。大きさは部品が画面から決めて `command.run` を送る。
   */
  private runCommand(commandId: string): void {
    const def = this.commands.catalog.find((c) => c.id === commandId);
    const paneId = this.view.focusedPaneId;
    if (!def || !paneId) return;
    const label = def.description ?? def.id;
    if (def.type === "popup") {
      this.view.openDialogWithContext({
        kind: "commandPopup",
        commandId,
        paneId,
        title: label,
        ...(def.width !== undefined ? { width: def.width } : {}),
        ...(def.height !== undefined ? { height: def.height } : {}),
      });
      return;
    }
    if (def.type === "shell") {
      this.conn
        .request("command.run", { commandId, paneId })
        .then(() => this.view.toast(`「${label}」を走らせました。`))
        .catch((err: unknown) => this.view.toast(commandErrorMessage(err)));
      return;
    }
    const hold = this.input?.holdInput(paneId);
    this.conn
      .request("command.run", { commandId, paneId })
      .then((r) => {
        const pane = r.type === "pane" ? r.pane : null;
        // コマンドがすぐ終わると、応答の前に pane が閉じている（焦点は pane.closed の後継で元の pane に戻っている）
        if (pane && this.session.panes.has(pane.id)) this.view.focusPane(pane.id);
        this.releaseHold(hold, pane?.id ?? paneId);
      })
      .catch((err: unknown) => {
        hold?.cancel();
        this.view.toast(commandErrorMessage(err));
      });
  }

  /** 一覧のダイアログを開く。**先にサーバへ聞く**（開く時点の一覧）。 */
  openSessionSwitcher(): void {
    if (this.machines.selectedId !== LOCAL_MACHINE_ID) {
      this.view.toast("ほかのマシンを選んでいる間は session を切り替えられません（ローカルに戻ってから）");
      return;
    }
    this.conn
      .request("server.sessions", {})
      .then((r) => {
        this.session.setNamedSessionCount(r.sessions.filter((e) => !e.default).length);
        this.view.openDialogWithContext({ kind: "sessionSwitch", sessions: r.sessions });
      })
      .catch(() => this.view.toast("session の一覧を取れませんでした"));
  }

  /**
   * 別の session の画面を新しいタブで開き、ダイアログを閉じる。別の session は別のオリジンなので、開いた先はその session の Cookie が
   * 無ければログイン画面になる。`noopener,noreferrer`：開いた先から元のページ（`window.opener`）を操作させず、URL も渡さない。
   */
  openServerSession(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
    this.view.closeDialog();
  }

  // --- worktree（20260920-git-worktree-actions）-------------------------------

  /** 作成のダイアログを開く。**先にサーバへ聞く**——パスのプレビューに根とリポジトリ名が要るため。 */
  newWorktree(workspaceId: string): void {
    this.conn
      .request("worktree.list", { workspaceId })
      .then((info) => this.view.openDialogWithContext({ kind: "worktreeCreate", workspaceId, info }))
      .catch((err: unknown) => this.view.toast(worktreeErrorMessage(err)));
  }

  /** 一覧のダイアログを開く。**空なら開かずに知らせる**（選ぶものが無いダイアログを見せない）。 */
  openWorktree(workspaceId: string): void {
    this.conn
      .request("worktree.list", { workspaceId })
      .then((info) => {
        if (info.entries.length === 0) {
          this.view.toast("この repo にはまだ worktree がありません。");
          return;
        }
        this.view.openDialogWithContext({ kind: "worktreeOpen", workspaceId, entries: info.entries });
      })
      .catch((err: unknown) => this.view.toast(worktreeErrorMessage(err)));
  }

  /** 作って、その場所を cwd に workspace を開く（`confirmNewTab` と同じ形）。 */
  confirmWorktreeCreate(branch: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "worktreeCreate") return;
    const trimmed = branch.trim();
    if (!trimmed) return; // 空では確定しない（ボタンも disabled）
    this.view.closeDialog();
    const hold = this.input?.holdInput(this.view.focusedPaneId); // D99
    this.conn
      .request("worktree.create", { workspaceId: ctx.workspaceId, branch: trimmed })
      .then((created) => this.openWorkspaceAt(created.path, trimmed, hold))
      .catch((err: unknown) => {
        hold?.cancel();
        this.view.toast(worktreeErrorMessage(err));
      });
  }

  /** 選んだ worktree を開く。**既に開いていればそこへ移るだけ**（同じ場所の workspace を 2 つ作らない）。 */
  confirmWorktreeOpen(path: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "worktreeOpen") return;
    this.view.closeDialog();
    const existing = [...this.session.workspaces.values()].find((w) => w.cwd === path);
    if (existing) {
      this.view.setView(existing.id, existing.activeTabId);
      // `setView` は焦点の pane を触らないので、対で移す（Sidebar・GotoPicker・goto・PanePicker と同じ形）。
      const tab = this.session.tabs.get(existing.activeTabId);
      if (tab) this.view.focusPane(tab.focusedPaneId);
      void this.conn.request("workspace.focus", { workspaceId: existing.id }).catch(() => undefined);
      return;
    }
    // 一覧で選んだ項目のブランチ名（detached なら git が返すとおり branch は null なので、パスの末尾で代える）。
    const label = ctx.entries.find((e) => e.path === path)?.branch ?? path.split("/").pop() ?? path;
    this.openWorkspaceAt(path, label, this.input?.holdInput(this.view.focusedPaneId));
  }

  /**
   * worktree 一覧の行から削除を実行する（20260924-worktree-remove）。確認を経る
   * （design「クライアント側」・AC-I1・AC-I2）。現在開いている workspace の cwd と一致すれば、
   * 確認の文言でそれが伝わる（AC4）。
   */
  removeWorktree(sourceWorkspaceId: string, path: string): void {
    const openWorkspace = [...this.session.workspaces.values()].find((w) => w.cwd === path);
    this.view.openDialogWithContext({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId,
      path,
      openWorkspaceId: openWorkspace?.id ?? null,
    });
  }

  confirmWorktreeRemove(): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "confirmWorktreeRemove") return;
    this.view.closeDialog();
    this.sendWorktreeRemove(ctx.sourceWorkspaceId, ctx.path, false, ctx.openWorkspaceId, ctx.closeOnCancel === true);
  }

  /** dirty で通常の削除が失敗したあとの `--force` での再実行（AC7・AC8）。 */
  confirmWorktreeRemoveForce(): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "confirmWorktreeRemoveForce") return;
    this.view.closeDialog();
    this.sendWorktreeRemove(ctx.sourceWorkspaceId, ctx.path, true, ctx.openWorkspaceId, ctx.closeOnCancel === true);
  }

  /**
   * `worktree.remove` を送る。成功・dirty 以外の失敗のときは `openWorktree` で一覧を開き直す
   * ——`view.dialogContext` は単一の値で、一覧ダイアログの上に確認を「重ねる」ことはできない
   * ため（design「設計方針」）。dirty で force 無しの初回が失敗した場合だけ、一覧へは戻らず
   * `--force` 確認へ進む。
   * **2つの例外**（review round1 の should 指摘）: (1) 削除対象が一覧を開いた元の workspace
   * 自身だった場合、成功時はその workspace 自体が既に閉じられているため一覧を開き直さない
   * （view の移動先は既存の `repairView` に任せる）。(2) RPC の応答を待つ間に別の操作で
   * 他のダイアログが開いていたら、それを奪わない。
   */
  private sendWorktreeRemove(
    sourceWorkspaceId: string,
    path: string,
    force: boolean,
    openWorkspaceId: string | null,
    /** 一覧を経ずに始めた削除（キーの `remove_worktree`）。失敗しても一覧を開き直さず、`--force` の確認にも引き継ぐ。 */
    closeOnCancel = false,
  ): void {
    this.conn
      .request("worktree.remove", { workspaceId: sourceWorkspaceId, path, force })
      .then(() => {
        // 応答を待つ間に別の操作で他のダイアログが開いていたら、それを奪わない
        // （review round1 の should 指摘。20260924-pane-move-cross-tab の D2 と同じ考え方）。
        if (this.view.dialogContext !== null) return;
        // 削除対象が「一覧を開いた元の workspace」自身だった場合、その workspace は
        // サーバ側で既に閉じられている——そこから一覧を開き直すことはできない（`not_found` に
        // なる）。view の移動先は既存の `repairView`（`StoreAdapter.ts`）に任せる
        // （review round1 の should 指摘）。
        if (sourceWorkspaceId === openWorkspaceId) return;
        this.openWorktree(sourceWorkspaceId); // 更新された一覧を開き直す（AC2・AC3・AC-I1）
      })
      .catch((err: unknown) => {
        // dirty・ロック済みのどちらも同じ `--force` 確認フローへ合流する（20260925-worktree-remove-locked。
        // design「設計方針」）。`reason` で `ConfirmDialog.vue` の文言だけを出し分ける。
        const code = errorCodeOf(err);
        if (!force && (code === "worktree_dirty" || code === "worktree_locked")) {
          if (this.view.dialogContext === null) {
            this.view.openDialogWithContext({
              kind: "confirmWorktreeRemoveForce",
              sourceWorkspaceId,
              path,
              openWorkspaceId,
              reason: code === "worktree_locked" ? "locked" : "dirty",
              ...(closeOnCancel ? { closeOnCancel: true as const } : {}),
            });
          }
          return;
        }
        // トーストは常に出す（失敗した事実は、他のダイアログが開いていても伝えてよい）。
        this.view.toast(worktreeErrorMessage(err));
        // 何も変わっていないので、削除元の workspace は必ず生きている——一覧を開き直して戻す
        // （AC9・AC-I1）。他のダイアログを奪わないことだけ守る。
        if (this.view.dialogContext === null && !closeOnCancel) this.openWorktree(sourceWorkspaceId);
      });
  }

  /**
   * その場所を cwd に workspace を作って表示を移す（作成と一覧の共通の後半）。
   * **label にブランチ名を渡す**（review ラウンド1）。渡さなければサーバが worktree の根のフォルダ名を自動の名前にする
   * （20260921-workspace-auto-label。以前は一律に `"1"` で、worktree を 2 つ作ると `1` が並んだ）が、ダイアログで選んだブランチ名のほうが
   * 情報が多い（`feature/x` の `/` はフォルダ名では消える）ので渡す——herdr（名前を渡さない）との違い（`docs/herdr-parity.md` の H01b ④）。
   * 2 行目のブランチ表示は `ahead > 0 || behind > 0` のときだけなので、**上流の無い新しい worktree は構造上そこに出ない**。
   */
  private openWorkspaceAt(cwd: string, label: string, hold: InputHold | undefined): void {
    // **場所を明示する経路なので `newCwd` を載せない**——方針に関わらず worktree の場所で開く（AC11・design D5）。
    this.conn
      .request("workspace.create", { cwd, label })
      .then((result) => {
        this.view.setView(result.workspace.id, result.tab.id);
        this.view.focusPane(result.pane.id);
        this.releaseHold(hold, result.pane.id);
      })
      .catch((err: unknown) => {
        hold?.cancel();
        this.view.toast(worktreeErrorMessage(err));
      });
  }

  // --- 手動グループ（20260923-workspace-grouping。herdr に前例が無い独自拡張）------------------

  /** 「新しいグループを作る…」（`ContextMenu`）。名前を確定したら、右クリック元の workspace を追加する。 */
  createGroupForWorkspace(workspaceId: string): void {
    this.view.openDialogWithContext({ kind: "createGroup", workspaceId });
  }

  /**
   * `NameDialog` が確定したときに呼ぶ。`layout` を持つサーバには `group.create` に `workspaceId` を添えて 1 回で送る
   * （項目丸ごと入る）。`layout` の無い古いサーバは `workspaceId` を黙って落とすので、今までの 2 段（`group.create` →
   * 作成したグループへ項目の workspace 全部を追加）を残す（design「古いサーバ・古い画面」）。
   * **2段階の失敗を区別する**（タスク点検の指摘）：`group.create` 自体が失敗すればグループは
   * 存在しないので「作成できませんでした」。それが成功した後の追加だけが失敗した場合は
   * グループ自体は残っている（空のグループとしてサイドバーに出る）ので、
   * 「作成できませんでした」と伝えると実際の状態と食い違う——別の文言にする（ロールバック＝
   * 作ったグループを削除する、まではしない。空のグループは無害で design のエラー処理どおり）。
   */
  confirmCreateGroup(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "createGroup") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return; // 空では確定しない（ボタンも disabled）
    if (this.session.hasServerLayout) {
      void this.conn.request("group.create", { label: trimmed, workspaceId: ctx.workspaceId }).catch(() => this.view.toast("グループを作成できませんでした"));
      return;
    }
    void this.conn
      .request("group.create", { label: trimmed })
      .then((r) =>
        this.addItemToGroupLegacy(r.group.id, ctx.workspaceId).catch(() =>
          this.view.toast("グループは作成しましたが、workspace の追加に失敗しました。"),
        ),
      )
      .catch(() => this.view.toast("グループを作成できませんでした"));
  }

  /**
   * 古いサーバ向け：項目（同じ `repoKey` の workspace 全部）へ `group.add_member` を順に送る。古いサーバは 1 件ずつしか
   * 動かさず、入った workspace だけが所属を持つ（`SessionModel.ts:427-442`）。順に送って 1 件でも失敗したら止めて投げ直す。
   */
  private async addItemToGroupLegacy(groupId: string, workspaceId: string): Promise<void> {
    for (const id of this.itemWorkspaceIds(workspaceId)) {
      await this.conn.request("group.add_member", { groupId, workspaceId: id });
    }
  }

  /** workspace の項目に含まれる workspace の id（リポジトリなら `repoMembers` の順で全部。そうでなければ自分だけ）。 */
  private itemWorkspaceIds(workspaceId: string): string[] {
    const ws = this.session.workspaces.get(workspaceId);
    const repoKey = ws?.git?.repoKey;
    if (!repoKey) return [workspaceId];
    const members = repoMembers([...this.session.workspaces.values()], repoKey);
    return members.length > 0 ? members.map((m) => m.id) : [workspaceId];
  }

  renameGroupById(groupId: string): void {
    const group = this.session.groups.get(groupId);
    if (!group) return;
    this.view.openDialogWithContext({ kind: "renameGroup", groupId, currentLabel: group.label });
  }

  confirmRenameGroup(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "renameGroup") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return;
    void this.conn.request("group.rename", { groupId: ctx.groupId, label: trimmed }).catch(() => this.view.toast("名前を変更できませんでした"));
  }

  /** グループを削除する（メンバーの workspace 自体は消えない）。herdr に前例が無いため確認は design どおり無し。 */
  deleteGroupById(groupId: string): void {
    void this.conn.request("group.delete", { groupId }).catch(() => this.view.toast("グループを削除できませんでした"));
  }

  /**
   * 折りたたみの切り替え（サーバに永続化。`WorkspaceGroup.collapsed`。AC6）。**値をサーバに
   * 反転させる**（`pane.zoom` の `mode: "toggle"` と同じ考え方。タスク点検の指摘：クライアントが
   * 今の値を読んで反転して送る形だと、応答前に連続で呼ばれたとき〔すばやい2回クリック〕両方が
   * 同じ古い値から同じ結果を送ってしまい、2回目が効かなくなる）。
   */
  toggleGroupCollapsed(groupId: string): void {
    void this.conn.request("group.toggle_collapsed", { groupId }).catch(() => undefined);
  }

  /** グループの選択肢（レイアウトの順。一番上の `g:` の並び、レイアウトに無いものは末尾）。 */
  private groupsInLayoutOrder(): WorkspaceGroup[] {
    const groups = this.session.groups;
    const ordered: WorkspaceGroup[] = [];
    for (const ref of this.session.effectiveLayout.top) {
      const group = ref.startsWith("g:") ? groups.get(ref.slice(2)) : undefined;
      if (group && !ordered.includes(group)) ordered.push(group);
    }
    for (const group of groups.values()) if (!ordered.includes(group)) ordered.push(group);
    return ordered;
  }

  /**
   * 「グループへ追加…」「別のグループへ移す…」。選択肢はレイアウトの順。移すときは今のグループを除く。
   * **選べるグループが無ければ開かずに知らせる**（`openWorktree` と同じ形）。
   */
  openGroupPicker(workspaceId: string): void {
    const current = itemGroupIdOf(this.session, workspaceId);
    const groups = this.groupsInLayoutOrder().filter((g) => g.id !== current);
    if (groups.length === 0) {
      this.view.toast("まだグループがありません。");
      return;
    }
    this.view.openDialogWithContext({ kind: "addToGroup", workspaceId, groups, ...(current !== null ? { moving: true as const } : {}) });
  }

  confirmAddToGroup(groupId: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "addToGroup") return;
    this.view.closeDialog();
    const failed = (): void => {
      this.view.toast("グループへ追加できませんでした");
    };
    // `layout` を持つサーバは項目丸ごとを 1 回で動かす。古いサーバは項目の workspace 全部に順に送る。
    if (this.session.hasServerLayout) {
      void this.conn.request("group.add_member", { groupId, workspaceId: ctx.workspaceId }).catch(failed);
      return;
    }
    void this.addItemToGroupLegacy(groupId, ctx.workspaceId).catch(failed);
  }

  /**
   * 項目（workspace・worktree グループはひとかたまり）を、別のグループへ入れる・「グループなし」へ出す（`groupId` が null）。
   * グラフの画面（20261008-graph-first PR4 T15b）から呼ぶ。サイドバーの「グループへ追加…」「グループから外す」と同じ方式で、結果を返す
   * （失敗したときは、トーストを出して false）。
   */
  async moveItemToGroup(workspaceId: string, groupId: string | null): Promise<boolean> {
    try {
      if (groupId === null) {
        if (this.session.hasServerLayout) await this.conn.request("group.remove_member", { workspaceId });
        else for (const id of this.itemWorkspaceIds(workspaceId)) await this.conn.request("group.remove_member", { workspaceId: id });
      } else if (this.session.hasServerLayout) {
        await this.conn.request("group.add_member", { groupId, workspaceId });
      } else {
        await this.addItemToGroupLegacy(groupId, workspaceId);
      }
      return true;
    } catch {
      this.view.toast(groupId === null ? "グループから外せませんでした" : "グループへ追加できませんでした");
      return false;
    }
  }

  // --- エージェントの fork（20261009-agent-fork PR2）--------------------------------------------------

  /** pane の「会話を fork…」。確定の前の画面（`AgentForkDialog`）を開く。 */
  openAgentFork(paneId: string): void {
    this.view.openDialogWithContext({ kind: "agentFork", paneId });
  }

  /** 確定の前の読み取り（何も作らない）。 */
  forkPreview(paneId: string, branch?: string): Promise<AgentForkPreviewResult> {
    return this.conn.request("agent.fork_preview", { paneId, ...(branch !== undefined ? { branch } : {}) });
  }

  /**
   * fork する。**ダイアログを閉じても続く**ので、結果は `agentFork` ストアに残し、完了・失敗のトーストもそこから出す。
   * 新しい pane ができる前の失敗（`fork_unavailable`・`fork_branch_exists`・`fork_in_progress` など）は、ここで返す（呼び手が画面に出す）。
   */
  async forkAgent(paneId: string, target: { kind: "same" } | { kind: "worktree"; branch: string }, note: boolean): Promise<{ ok: true } | { ok: false; code: string | null; message: string }> {
    const store = this.agentFork;
    store.begin(paneId);
    try {
      const r = await this.conn.request("agent.fork", { paneId, target, ...(target.kind === "worktree" ? { note } : {}) });
      store.started(paneId, r);
      return { ok: true };
    } catch (err) {
      const code = errorCodeOf(err);
      const message = code ? clientErrorMessage(code) : "fork できませんでした。";
      // 画面（ダイアログ）に出すだけにして、トーストにはしない（開いたままのダイアログで読める）。
      store.forget(paneId);
      return { ok: false, code: code ?? null, message };
    }
  }

  /** 「グループから外す」（項目がグループに入っているときだけ `ContextMenu` が出す）。古いサーバは項目の workspace 全部に順に送る。 */
  removeWorkspaceFromGroup(workspaceId: string): void {
    if (this.session.hasServerLayout) {
      void this.conn.request("group.remove_member", { workspaceId }).catch(() => undefined);
      return;
    }
    void (async () => {
      for (const id of this.itemWorkspaceIds(workspaceId)) await this.conn.request("group.remove_member", { workspaceId: id });
    })().catch(() => undefined);
  }

  /**
   * グループの見出しの「上へ移動」「下へ移動」（`item.move_by`。一番上の項目として 1 つ動かす）。
   * 名前順のときは一番上の並べ替えを受け付けず知らせる（design「並びと名前順」）。端では動かない（`moved: false`・何も知らせない）。
   */
  moveGroupBy(groupId: string, direction: "previous" | "next"): void {
    if (this.view.workspaceSort === "name") {
      this.view.toast("名前順では並べ替えできません");
      return;
    }
    void this.conn.request("item.move_by", { item: { kind: "group", groupId }, direction }).catch(() => this.view.toast("グループを移動できませんでした"));
  }

  /** 「グループなし」の見出しの「上へ移動」「下へ移動」（`item.move_by`。グループと同じ決まり）。 */
  moveUngroupedBy(direction: "previous" | "next"): void {
    if (this.view.workspaceSort === "name") {
      this.view.toast("名前順では並べ替えできません");
      return;
    }
    void this.conn.request("item.move_by", { item: { kind: "ungrouped" }, direction }).catch(() => this.view.toast("「グループなし」を移動できませんでした"));
  }

  // --- 公式フック連携（20260923-agent-session-resume）-------------------------

  /** 設定画面の「エージェント連携」節を開いたときに呼ぶ（`client.hello` のスナップショットには含まれない）。 */
  async refreshAgentIntegrationStatus(): Promise<void> {
    const status = await this.conn.request("agent_integration.status", {});
    this.agentIntegrations.setStatus(status);
  }

  /** 導入・解除の結果（`agent_integration.changed` で最新状態が自動的に届く。ここで store は更新しない）。 */
  installAgentIntegration(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult> {
    return this.conn.request("agent_integration.install", { kind });
  }

  uninstallAgentIntegration(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult> {
    return this.conn.request("agent_integration.uninstall", { kind });
  }

  /** Claude Code のステータスラインの包み（20261010-agent-usage の PR2。フックの導入とは別。押したときだけ書き換える）。 */
  installStatusLineWrap(): Promise<AgentIntegrationInstallResult> {
    return this.conn.request("agent_integration.statusline_install", {});
  }

  uninstallStatusLineWrap(): Promise<AgentIntegrationInstallResult> {
    return this.conn.request("agent_integration.statusline_uninstall", {});
  }

  async setAgentIntegrationAutoResume(enabled: boolean): Promise<void> {
    await this.conn.request("agent_integration.set_auto_resume", { enabled });
  }

  /**
   * 新しく開く場所（20260921-new-terminal-cwd）。方針はこのブラウザの設定から、その時点の値で作る——設定を変えても
   * 既に開いている pane には何も送らない（AC10）。「引き継ぐ」の元の pane は呼ぶ側が決める（design D7）。
   */
  private newCwdFor(sourcePaneId: string | null): NewCwd {
    return buildNewCwd(this.settings.newCwdPolicy, this.settings.newCwdPath, sourcePaneId);
  }

  /** 焦点の pane が `workspaceId` の中にあればその id、無ければ null。 */
  private focusedPaneIn(workspaceId: string): string | null {
    const paneId = this.view.focusedPaneId;
    const pane = paneId ? this.session.panes.get(paneId) : undefined;
    const tab = pane ? this.session.tabs.get(pane.tabId) : undefined;
    return tab?.workspaceId === workspaceId ? paneId : null;
  }

  /**
   * 選んだ方針の場所が使えず、代わりの場所で開いたことを知らせる（AC9）。**知らせるかどうかはサーバが決める**
   * （「引き継ぐ」では立たない。design D9）ので、ここで方針を見直さない。
   */
  private noteCwdFallback(result: { cwdFallback?: true }): void {
    if (result.cwdFallback) {
      this.view.toast("新しく開く場所が使えないため、代わりの場所で開きました（設定の「端末」で確かめてください）");
    }
  }

  /**
   * 溜めた入力を新しい pane へ流す（D99）。ただし新しい pane が入力を受けられないときは元の pane へ戻す：
   * もう閉じている（シェルが起動確認の猶予中に終わった等。サーバは応答の前に閉じる）、または zoom 中の別の pane に
   * 隠れて表示されていない（DOM の焦点が元の pane に残るので、以後の入力と行き先が分かれてしまう）。後者は、サーバの
   * 処理順では通常起きない（分割を確定するときに zoom を解除し（D100）、応答はその直後に返す）——順序の前提が崩れたときの保険。
   */
  private releaseHold(hold: InputHold | undefined, newPaneId: string): void {
    if (!hold) return;
    const pane = this.session.panes.get(newPaneId);
    const tab = pane ? this.session.tabs.get(pane.tabId) : undefined;
    const hiddenByZoom = !!tab?.zoomedPaneId && tab.zoomedPaneId !== newPaneId;
    if (pane && !hiddenByZoom) hold.release(newPaneId);
    else hold.cancel();
  }

  /**
   * T24（`ConfirmDialog`）が閉じる確認を確定したときに呼ぶ。`closeLinkedWorktrees`
   * （20260923-workspace-grouping。herdr の `close_group` 相当）は「束ねた worktree も
   * 一緒に閉じる」チェックボックスの状態。**`ConfirmDialog.vue` はこのチェックボックスを
   * workspace 対象が1件のときだけ出す**ので、ここでも workspace 対象が1件のときだけ適用する
   * （タスク点検の指摘：`targets` の型は複数件を許容するので、将来 workspace 対象が複数になる
   * 呼び出し元が増えても、意図しない workspace の worktree まで一緒に閉じてしまわないように
   * 防御する）。
   */
  confirmClose(closeLinkedWorktrees = false): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "confirmClose") return;
    this.view.closeDialog();
    const singleWorkspaceTarget = ctx.targets.filter((t) => t.type === "workspace").length === 1;
    for (const target of ctx.targets) {
      if (target.type === "pane") void this.conn.request("pane.close", { paneId: target.id }).catch(() => undefined);
      else if (target.type === "tab") void this.conn.request("tab.close", { tabId: target.id }).catch(() => undefined);
      else void this.conn.request("workspace.close", { workspaceId: target.id, closeLinkedWorktrees: closeLinkedWorktrees && singleWorkspaceTarget }).catch(() => undefined);
    }
  }

  private split(dir: "right" | "down"): void {
    const paneId = this.view.focusedPaneId;
    if (paneId) this.splitPane(paneId, dir);
  }

  /** T22（`ContextMenu`）から任意の pane を対象に呼ぶ（フォーカス中とは限らない）。 */
  splitPane(paneId: string, dir: "right" | "down"): void {
    const hold = this.input?.holdInput(this.view.focusedPaneId); // D99：応答までに打った文字は新しい pane へ
    // 「引き継ぐ」の元は分割する pane そのもの（`paneId`）なので、元の pane は載せない（design D7）。
    this.conn
      .request("pane.split", { paneId, direction: dir, newCwd: this.newCwdFor(null) })
      .then((r) => {
        this.view.focusPane(r.pane.id); // AC-I4：新しい pane へフォーカスを移す
        this.releaseHold(hold, r.pane.id);
        this.noteCwdFallback(r);
      })
      .catch(() => {
        hold?.cancel();
        this.view.toast("分割できませんでした");
      });
  }

  /** 20260926-edit-scrollback。開いたエディタの pane（サーバが拡大表示にする）へ焦点を移す。入力の関所は分割と同じ（D99）。 */
  private editScrollback(): void {
    const paneId = this.view.focusedPaneId;
    if (!paneId) return;
    const hold = this.input?.holdInput(paneId);
    this.conn
      .request("pane.edit_scrollback", { paneId })
      .then((r) => {
        // エディタがすぐ終わると、応答の前に pane が閉じている（焦点は pane.closed の後継で元の pane に戻っている）
        if (this.session.panes.has(r.pane.id)) this.view.focusPane(r.pane.id);
        this.releaseHold(hold, r.pane.id);
      })
      .catch(() => {
        hold?.cancel();
        this.view.toast("スクロールバックをエディタで開けませんでした");
      });
  }

  /**
   * 移動先はクライアントで求め、焦点を即座に移してからサーバへ知らせる（`cyclePane` と同じ形。D97）。
   * 以前は `pane.focus_direction` の応答を待ってから移していたため、その往復の間に打った文字が移動前の
   * 焦点（端末以外の要素なら捨てられ、端末なら移動前の pane）へ届いていた。
   */
  private focusDir(dir: Dir): void {
    const paneId = this.view.focusedPaneId;
    const tab = this.view.tabId ? this.session.tabs.get(this.view.tabId) : undefined;
    if (!paneId || !tab) return;
    const next = neighborPaneId(tab.layout, paneId, dir);
    if (!next) return; // その方向に pane が無い
    this.view.focusPane(next);
    void this.conn.request("pane.focus", { paneId: next }).catch(() => undefined);
  }

  private swap(dir: Dir): void {
    const paneId = this.view.focusedPaneId;
    if (!paneId) return;
    void this.conn.request("pane.swap", { paneId, direction: dir }).catch(() => undefined);
  }

  /**
   * 焦点の pane と入れ替える（herdr の pane のメニューの「Swap with focused pane」。20260927-cli-mode の design D-7）。`paneId` はメニューを開いた pane。
   * 入れ替えた後も焦点は元の pane のまま（herdr と同じく `pane.focus` を送り直す）。キーから使うとき（`paneId` 無し）は、直前に焦点のあった pane と入れ替える。
   * 同じ tab の pane どうしでなければ何もしない（`pane.swap_with` が `ok: false` を返す）。
   */
  swapWithFocused(paneId?: string): void {
    const focused = this.view.focusedPaneId;
    const other = paneId ?? this.view.lastFocusedPaneId;
    if (!focused || !other || other === focused) return;
    if (this.session.panes.get(other)?.tabId !== this.session.panes.get(focused)?.tabId) return;
    void this.conn
      .request("pane.swap_with", { paneId: focused, otherPaneId: other })
      .then((r) => {
        if (r.ok) void this.conn.request("pane.focus", { paneId: focused }).catch(() => undefined);
      })
      .catch(() => undefined);
  }

  /**
   * 名前ラベルのドラッグを、別の pane の縁へドロップしての分割（20260924-pane-dnd-split-move。
   * `PaneFrame.vue` から直接呼ぶ）。`swapPanesByDrag`（20260923-pane-name-dnd-swap。ドロップ先を
   * 問わず入れ替え）はこの work で縁/中央のゾーン方式に置き換わったため削除した
   * （`pane.swap_with` RPC 自体・`SessionModel`/`SessionService` 側は変更していない。decisions.md
   * D4）。サーバの `layout.updated` で各クライアントの表示が揃うので、応答は待たない
   * （`pane.swap` と同じ形）。
   */
  movePaneToEdge(paneId: string, targetPaneId: string, edge: "top" | "bottom" | "left" | "right"): void {
    void this.conn.request("pane.move_to_edge", { paneId, targetPaneId, edge }).catch(() => undefined);
  }

  /**
   * 名前ラベルのドラッグを、別の pane の中央へドロップしての分割解除（20260924-pane-dnd-split-move。
   * `PaneFrame.vue` から直接呼ぶ）。**`targetPaneId` が busy なら、`closePaneById`/`closeTabById`
   * と同じ D23 の安全策で確認ダイアログを挟む**（review 指摘 must：中央ドロップはプロセスを実際に
   * 終了させる破壊的操作だが、確認なしに即座に実行していた）。
   */
  replacePaneWithDrag(paneId: string, targetPaneId: string): void {
    const target = this.session.panes.get(targetPaneId);
    if (target?.busy) {
      this.view.openDialogWithContext({ kind: "confirmReplacePane", paneId, targetPaneId });
      return;
    }
    this.sendReplacePane(paneId, targetPaneId);
  }

  private sendReplacePane(paneId: string, targetPaneId: string): void {
    void this.conn.request("pane.replace", { paneId, targetPaneId }).catch(() => undefined);
  }

  /** `ConfirmDialog`（`kind: "confirmReplacePane"`）が確定したときに呼ぶ。 */
  confirmReplacePane(): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "confirmReplacePane") return;
    this.view.closeDialog();
    this.sendReplacePane(ctx.paneId, ctx.targetPaneId);
  }

  /**
   * 名前ラベルのドラッグを、tab バーの既存の tab へドロップしての移動（20260924-pane-move-cross-tab。
   * `PaneFrame.vue` から直接呼ぶ）。プロセスは終了しないので busy 確認は不要（design R4）。
   * **RPC の成否を待ってから view を移動先へ切り替える**——`ok: false`（自分自身の tab・
   * 存在しない tab 等）のときに表示だけ移してしまうと、実際には何も動いていない tab を見せる
   * ことになる（design「エラー処理」の「失敗時は何もしない」と揃える。AC8・AC-I4）。
   * **応答を待つ間にユーザーが別の tab/workspace へ既に移っていたら、view は追わない**
   * （review round1 の should 指摘）——移動自体は成立させるが、応答到着時に無関係な画面から
   * 強制的に移動先へ視点を引き戻さない。
   */
  movePaneToTab(
    paneId: string,
    targetTabId: string,
    /** `follow: false`（グラフの画面から。20261008-graph-first PR4）: 移した後に、見ている workspace・tab を移動先へ切り替えない。 */
    opts: { follow?: boolean } = {},
  ): Promise<{ ok: boolean; reason?: PaneMoveBlock } | null> {
    const originWorkspaceId = this.view.workspaceId;
    const originTabId = this.view.tabId;
    return this.conn
      .request("pane.move_to_tab", { paneId, targetTabId })
      .then((r) => {
        if (!r.ok) {
          // サーバが断った（別の worktree の workspace。20261008-web-tab-dnd）。理由の無い ok:false は今までどおり黙る。
          if (r.reason) this.view.toast(paneMoveBlockMessage(r.reason));
          return r;
        }
        if (opts.follow === false) return r;
        if (this.view.workspaceId !== originWorkspaceId || this.view.tabId !== originTabId) return r;
        const targetTab = this.session.tabs.get(targetTabId);
        // 移動先 tab がまだ同期されていなければ何もしない（`movePaneToNewTab` の `!r.tab` と対称。
        // 表示を切り替えないのに focus だけ動くと、キー入力の宛先が画面と食い違う）。
        if (!targetTab) return r;
        this.view.setView(targetTab.workspaceId, targetTabId);
        this.view.focusPane(paneId);
        this.registry.focus(paneId);
        return r;
      })
      .catch(() => null);
  }

  /**
   * 名前ラベルのドラッグを、サイドバーの workspace 行へドロップしての移動
   * （20260924-pane-move-cross-tab。`PaneFrame.vue` から直接呼ぶ）。新しい tab の id は応答が
   * 返るまで分からないため、`movePaneToTab` と同じく応答を待ってから view を切り替える
   * （応答を待つ間に view が動いていたら追わないことも含めて同じ。review round1 の should 指摘）。
   */
  movePaneToNewTab(paneId: string, targetWorkspaceId: string): void {
    // 別の worktree の workspace へは送らずに知らせる（20261008-web-tab-dnd）。移動元・移動先がストアに無ければ確認を飛ばして送る
    // （古いサーバの workspace〔worktreeKey 無し〕は lenient で断らず、サーバに任せる）。
    const pane = this.session.panes.get(paneId);
    const sourceTab = pane ? this.session.tabs.get(pane.tabId) : undefined;
    const source = sourceTab ? this.session.workspaces.get(sourceTab.workspaceId) : undefined;
    const target = this.session.workspaces.get(targetWorkspaceId);
    if (source && target) {
      const block = paneMoveBlock(source, target, { lenient: true });
      if (block) {
        this.view.toast(paneMoveBlockMessage(block));
        return;
      }
    }
    const originWorkspaceId = this.view.workspaceId;
    const originTabId = this.view.tabId;
    void this.conn
      .request("pane.move_to_new_tab", { paneId, targetWorkspaceId })
      .then((r) => {
        if (!r.ok) {
          if (r.reason) this.view.toast(paneMoveBlockMessage(r.reason));
          return;
        }
        if (!r.tab) return;
        if (this.view.workspaceId !== originWorkspaceId || this.view.tabId !== originTabId) return;
        this.view.setView(targetWorkspaceId, r.tab.id);
        this.view.focusPane(paneId);
        this.registry.focus(paneId);
      })
      .catch(() => undefined);
  }

  private cyclePane(delta: 1 | -1): void {
    const tab = this.view.tabId ? this.session.tabs.get(this.view.tabId) : undefined;
    if (!tab) return;
    const ids = depthFirstPaneIds(tab.layout);
    if (ids.length === 0) return;
    const current = this.view.focusedPaneId ? ids.indexOf(this.view.focusedPaneId) : -1;
    const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
    if (!next) return;
    this.view.focusPane(next);
    void this.conn.request("pane.focus", { paneId: next }).catch(() => undefined);
  }

  private zoom(): void {
    const paneId = this.view.focusedPaneId;
    if (paneId) this.zoomPane(paneId);
  }

  zoomPane(paneId: string): void {
    void this.conn.request("pane.zoom", { paneId, mode: "toggle" }).catch(() => undefined);
  }

  /** herdr の `prompt_new_tab_name`（既定 true）：空欄で開く（design「ダイアログ」）。 */
  private newTab(): void {
    const workspaceId = this.view.workspaceId;
    if (workspaceId) this.newTabInWorkspace(workspaceId);
  }

  newTabInWorkspace(workspaceId: string): void {
    this.view.openDialogWithContext({ kind: "newTab", workspaceId });
  }

  private tabDelta(delta: 1 | -1): void {
    const tab = this.view.tabId ? this.session.tabs.get(this.view.tabId) : undefined;
    if (!tab) return;
    const ws = this.session.workspaces.get(tab.workspaceId);
    if (!ws || ws.tabIds.length === 0) return;
    const idx = ws.tabIds.indexOf(tab.id);
    const nextTabId = ws.tabIds[(idx === -1 ? 0 : idx + delta + ws.tabIds.length) % ws.tabIds.length];
    if (nextTabId) this.switchToTab(ws.id, nextTabId);
  }

  private tabIndex(index: number): void {
    const workspaceId = this.view.workspaceId;
    if (!workspaceId) return;
    const ws = this.session.workspaces.get(workspaceId);
    const tabId = ws?.tabIds[index - 1];
    if (tabId) this.switchToTab(workspaceId, tabId);
  }

  private switchToTab(workspaceId: string, tabId: string): void {
    this.view.setView(workspaceId, tabId);
    const tab = this.session.tabs.get(tabId);
    if (tab) this.view.focusPane(tab.focusedPaneId);
    void this.conn.request("tab.focus", { tabId }).catch(() => undefined);
  }

  /** closePane/closeTab は対象に busy な pane を含むときだけ確認する（D23。workspace は常に確認）。 */
  private closePane(): void {
    const paneId = this.view.focusedPaneId;
    if (paneId) this.closePaneById(paneId);
  }

  /** 表示の面の枠が、アプリの端末へフォーカスを戻すための窓口（`main.ts` が組み立てる）。無ければ（単体テスト）フォーカスは動かさない。 */
  private displayHost: DisplayHost | undefined;
  setDisplayHost(host: DisplayHost | undefined): void {
    this.displayHost = host;
  }

  /**
   * `focus_display`（`prefix+i`）: フォーカス中の pane の面の枠へフォーカスを移す。行き先は、① 開いているパネル（最後に操作した面 → 無ければ出た順。ドック・浮いた窓を問わない）
   * → ② たたんだパネル（開いてから）→ ③ 出ている帯 → ④ たたんだ帯（開いてから）。自動でたたまれた面（pane が狭くて出せない）は飛ばす。面が無ければトースト。
   * たたんだ面を開くのは利用者の操作なので、記憶に「開く」を書く（`withDisplayChange`）。開いた直後は枠がまだ載っていないので、載るのを（数回）待つ。
   * **モバイル（重ね表示）では今の動きのまま**（記憶を見ない・書かない）。
   */
  async focusDisplay(): Promise<void> {
    const paneId = this.view.focusedPaneId;
    const store = this.displays;
    if (!paneId) {
      this.view.toast("この pane に表示はありません");
      return;
    }
    if (store.sheetAvailable) {
      const legacy = store.activePanelOf(paneId) ?? store.bandsOf(paneId)[0] ?? null;
      if (!legacy) {
        this.view.toast("この pane に表示はありません");
        return;
      }
      for (let i = 0; i < 5; i++) {
        if (focusFrame(legacy.id)) return;
        await nextTick();
      }
      if (legacy.kind === "panel") {
        store.sheetRequest++;
        return;
      }
      this.view.toast("表示を出せません（pane が狭い、または読み込み中です）");
      return;
    }
    const pick = pickFocusTarget(
      store.all.filter((d) => d.paneId === paneId),
      (d) => store.effectiveOf(d).collapsed,
      new Set(store.layoutByPane.get(paneId)?.auto ?? []),
      store.lastFace.get(paneId) ?? null,
    );
    if (!pick) {
      this.view.toast(store.all.some((d) => d.paneId === paneId) ? "表示を出せません（pane が狭い、または読み込み中です）" : "この pane に表示はありません");
      return;
    }
    if (pick.open) {
      await withDisplayChange(pick.info, () => store.setFaceCollapsed(pick.info, false), () => null, this.displayHost);
    }
    for (let i = 0; i < 10; i++) {
      if (focusFrame(pick.info.id)) return;
      await nextTick();
    }
    this.view.toast("表示を出せません（pane が狭い、または読み込み中です）");
  }

  /** `display_menu`（`prefix+shift+i`）: フォーカス中の pane の、表示の面の一覧のメニューを開く。モバイルでは重ね表示を開く。 */
  displayMenu(): void {
    const paneId = this.view.focusedPaneId;
    if (!paneId) return;
    if (this.displays.sheetAvailable) {
      this.displays.sheetRequest++;
      return;
    }
    if (!this.displays.hasAny(paneId)) {
      this.view.toast("この pane に表示はありません");
      return;
    }
    const body = document.querySelector(`[data-pane-id="${paneId}"]`);
    const r = body?.getBoundingClientRect();
    openDisplayMenu((t, at) => this.view.openContextMenu(t, at), { kind: "displays", paneId }, r ? { x: Math.round(r.left) + 8, y: Math.round(r.top) + 8 } : { x: 8, y: 8 }, this.displayHost, paneId);
  }

  /** 右クリックのメニュー「表示をすべて閉じる」: その pane の表示の面（パネル・帯）を全部閉じる（20261007-soda-extensions）。 */
  dismissDisplays(paneId: string): void {
    void this.conn.request("display.dismiss", { paneId }).catch(() => undefined);
  }

  /** T22（`ContextMenu`）から任意の pane を対象に呼ぶ（フォーカス中とは限らない）。 */
  closePaneById(paneId: string): void {
    const pane = this.session.panes.get(paneId);
    if (pane?.busy) {
      this.view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: paneId }] });
      return;
    }
    void this.conn.request("pane.close", { paneId }).catch(() => undefined);
  }

  /**
   * pane の枠の［閉じる］ボタン（モダンの様式。20261008-ui-style PR4 の AC21）。**busy でなくても必ず確認する**（誤って押すおそれがあるため）。
   * 確認のダイアログは `closePaneById` と同じもの（`confirmClose`）。キー（`prefix+x`）の経路〔`closePane`〕は変えない。
   */
  closePaneWithConfirm(paneId: string): void {
    this.view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: paneId }] });
  }

  private closeTab(): void {
    const tabId = this.view.tabId;
    if (tabId) this.closeTabById(tabId);
  }

  /** T22 から任意の tab を対象に呼ぶ（表示中の tab とは限らない）。 */
  closeTabById(tabId: string): void {
    const panesInTab = [...this.session.panes.values()].filter((p) => p.tabId === tabId);
    if (panesInTab.some((p) => p.busy)) {
      this.view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "tab", id: tabId }] });
      return;
    }
    void this.conn.request("tab.close", { tabId }).catch(() => undefined);
  }

  /**
   * herdr は worktree グループ経由でも busy 以外の追加確認をする（D56 の訂正 2 の時点では、
   * 本製品はグルーピングが対象外だった）。**20260923-workspace-grouping で対応**——
   * `ConfirmDialog.vue` が「束ねた worktree も一緒に閉じる」チェックボックスを、対象が
   * worktree グループの本体のときだけ追加で出す（`confirmClose` の `closeLinkedWorktrees`）。
   */
  private closeWorkspace(): void {
    const workspaceId = this.view.workspaceId;
    if (workspaceId) this.closeWorkspaceById(workspaceId);
  }

  /** T22 から任意の workspace を対象に呼ぶ。 */
  closeWorkspaceById(workspaceId: string): void {
    this.view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: workspaceId }] });
  }

  /** herdr の `prompt_new_workspace_name`（既定 false）：名前を尋ねずすぐ作る（design「ダイアログ」）。 */
  private newWorkspace(onCreated?: (workspaceId: string) => void): void {
    const hold = this.input?.holdInput(this.view.focusedPaneId); // D99：応答までに打った文字は新しい pane へ
    // 「引き継ぐ」の元は**このブラウザの焦点の pane**（サーバはクライアントごとの焦点を知らない。design D7）。
    this.conn
      .request("workspace.create", { newCwd: this.newCwdFor(this.view.focusedPaneId) })
      .then((r) => {
        this.view.setView(r.workspace.id, r.tab.id);
        this.view.focusPane(r.pane.id);
        this.releaseHold(hold, r.pane.id);
        this.noteCwdFallback(r);
        onCreated?.(r.workspace.id);
      })
      .catch(() => {
        hold?.cancel();
        this.view.toast("workspace を作成できませんでした");
      });
  }

  /**
   * グラフの「＋ workspace」（20261008-graph-first PR3）: 基本画面の「新しい workspace」と同じ作り方で、**作った workspace の id を受け取る**
   * （グラフが、その workspace だけを表示中のグループへ入れる。ほかの接続が同じ時間に作ったものは、推測で動かさない）。
   */
  newWorkspaceThen(onCreated: (workspaceId: string) => void): void {
    this.newWorkspace(onCreated);
  }

  // --- T18: navigate・resize・copy・名前の変更・その他 ----------------------

  private navigate(op: "up" | "down" | "paneDir" | "activate" | "cancel" | "openMenu" | "toggleCollapse", dir?: Dir): void {
    switch (op) {
      case "up":
      case "down": {
        // Sidebar.vue の描画（`sidebarTree`）と同じ並び・同じ可視範囲を辿る。選べるのは行（グループの見出しを含む。
        // 畳んだグループ・空のグループにも届く。20261004-group-worktree-items）。
        const keys = currentNavigableRows(this.session, this.view).map(navigateKeyOfRow);
        if (keys.length === 0) return;
        const current = this.view.navigateSelection ? keys.indexOf(this.view.navigateSelection) : -1;
        const delta = op === "up" ? -1 : 1;
        const next = keys[(current === -1 ? 0 : current + delta + keys.length) % keys.length];
        if (next) this.view.setNavigateSelection(next);
        return;
      }
      case "paneDir":
        if (dir) this.focusDir(dir);
        return;
      case "activate":
        this.activateNavigateSelection();
        return;
      case "cancel":
        this.view.setNavigateSelection(null);
        return;
      case "openMenu":
        // DOM には触れない（design「設計方針」）——実際に位置を計算して開くのは Sidebar.vue の役目
        // （20260925-sidebar-keyboard-menu）。
        if (this.view.navigateSelection) this.view.requestNavigateMenu();
        return;
      case "toggleCollapse":
        this.toggleCollapseOfSelection();
        return;
    }
  }

  /**
   * `navigate_toggle_collapse`。選んでいる行が「グループなし」の見出しなら共有の設定 `ungroupedCollapsed` を、グループの見出しならそのグループ（サーバ）を、worktree グループの
   * 先頭・子（代表の行）ならその worktree グループ（共有の設定 `collapsedAutoGroups`）を畳む・広げる。通常の行（代表でない行も）は何もしない。
   */
  private toggleCollapseOfSelection(): void {
    const key = this.view.navigateSelection;
    if (!key) return;
    // 「グループなし」の見出しの畳みは共有の設定（`ungroupedCollapsed`）。見出しが出ていない（グループが無くなった）なら選択を外す。
    if (isUngroupedNavigateKey(key)) {
      if (!currentNavigableRows(this.session, this.view).some((r) => r.kind === "ungrouped")) this.view.setNavigateSelection(null);
      else this.view.toggleUngroupedCollapsed();
      return;
    }
    const groupId = groupIdOfNavigateKey(key);
    if (groupId !== null) {
      // 別の画面で消されたグループが選択に残っていたら、何も送らず選択を外す。
      if (!this.session.groups.has(groupId)) this.view.setNavigateSelection(null);
      else this.toggleGroupCollapsed(groupId);
      return;
    }
    const ws = this.session.workspaces.get(key);
    const all = [...this.session.workspaces.values()];
    // 代表でない通常の行（同じフォルダの 2 つ目）は worktree の印が付かないので何もしない（追補 A）。
    if (!ws || !isRepresentative(ws, all)) return;
    const repoKey = ws.git?.repoKey ?? null;
    if (repoKey === null || repoMembers(all, repoKey).length < 2) return;
    this.view.toggleAutoGroupCollapsed(repoKey);
  }

  private activateNavigateSelection(): void {
    const workspaceId = this.view.navigateSelection;
    this.view.setNavigateSelection(null);
    // グループの見出しを選んでいるときの Enter は、選択をやめるだけ（畳むのは `navigate_toggle_collapse`）。
    if (!workspaceId || groupIdOfNavigateKey(workspaceId) !== null || isUngroupedNavigateKey(workspaceId)) return;
    this.focusWorkspaceById(workspaceId);
  }

  /**
   * 共有 private ヘルパー（20260923-missing-keybinding-actions。design「振る舞いの詳細」）。
   * `activateNavigateSelection` から抽出。`previous_workspace`/`next_workspace`（`workspaceDelta`）とも共有する。
   */
  private focusWorkspaceById(workspaceId: string): void {
    const ws = this.session.workspaces.get(workspaceId);
    if (ws) {
      this.view.setView(ws.id, ws.activeTabId);
      const tab = this.session.tabs.get(ws.activeTabId);
      if (tab) this.view.focusPane(tab.focusedPaneId);
    }
    void this.conn.request("workspace.focus", { workspaceId }).catch(() => undefined);
  }

  /**
   * 共有 private ヘルパー（20260923-missing-keybinding-actions）。`Sidebar.vue` の `focusPane` と同じ形
   * （`session.panes`→`tabId`→`session.tabs`→`workspaceId` を辿って `setView`→`focusPane`→request）。
   * `last_pane`/`previous_agent`/`next_agent`/`focus_agent` の4箇所で共有する。
   */
  private focusPaneAcrossViews(paneId: string): void {
    const pane = this.session.panes.get(paneId);
    if (!pane) return;
    const tab = this.session.tabs.get(pane.tabId);
    if (!tab) return;
    this.view.setView(tab.workspaceId, tab.id);
    this.view.focusPane(paneId);
    void this.conn.request("pane.focus", { paneId }).catch(() => undefined);
  }

  private resizeBy(dir: Dir, amount: number): void {
    const paneId = this.view.focusedPaneId;
    if (!paneId) return;
    void this.conn.request("pane.resize", { paneId, direction: dir, amount }).catch(() => undefined);
  }

  // --- 20260923-missing-keybinding-actions（herdr にあって本製品に操作自体が無かったもの） -------------

  private workspaceDelta(delta: 1 | -1): void {
    // Sidebar.vue の描画（`sidebarTree`）と同じ並び・同じ可視範囲を辿る（上の `navigate`
    // 「up」「down」と同じ理由。20260923-workspace-grouping レビューの指摘）。
    const ids = currentVisibleWorkspaceIds(this.session, this.view);
    if (ids.length <= 1) return; // AC4
    const current = this.view.workspaceId ? ids.indexOf(this.view.workspaceId) : -1;
    const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
    if (next) this.focusWorkspaceById(next);
  }

  /** `switch_workspace`（1〜9。20260927-cli-mode）。サイドバーの並び（`workspaceDelta` と同じ可視範囲）の N 番目へ。無ければ何もしない。 */
  private workspaceIndex(index: number): void {
    const ids = currentVisibleWorkspaceIds(this.session, this.view);
    const target = ids[index - 1];
    if (target) this.focusWorkspaceById(target);
  }

  /**
   * `remove_worktree`（20260927-cli-mode。herdr と同じく今の workspace が linked worktree のときだけ）。一覧（`worktree.list`）から、今の workspace の場所と
   * **同じ場所**の worktree を引き（一覧の行からの削除と同じく完全一致。サーバは完全一致の workspace だけを閉じる）、一覧を経ずに削除の確認を開く（取り消したら閉じる）。
   * 削除の流れ（dirty・ロックの `--force` の確認）は一覧の行からの削除と同じ。
   */
  private removeCurrentWorktree(): void {
    const workspaceId = this.view.workspaceId;
    const ws = workspaceId ? this.session.workspaces.get(workspaceId) : undefined;
    if (!ws) return;
    if (ws.git?.isLinkedWorktree !== true) {
      this.view.toast("この workspace は worktree のチェックアウトではありません（削除は worktree を開いた workspace で行います）。");
      return;
    }
    this.conn
      .request("worktree.list", { workspaceId: ws.id })
      .then((info) => {
        const entry = info.entries.find((e) => e.path === ws.cwd);
        if (!entry) {
          this.view.toast("この workspace の worktree が一覧に見つかりませんでした。");
          return;
        }
        if (this.view.dialogContext !== null) return; // 待つ間に別のダイアログが開いていたら奪わない
        this.view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: ws.id, path: entry.path, openWorkspaceId: ws.id, closeOnCancel: true });
      })
      .catch((err: unknown) => this.view.toast(worktreeErrorMessage(err)));
  }

  /**
   * `stop_server` で止まるサーバ（02 の review）。画面の接続が保存したマシンを向いていれば（`/ws?machine=`）、止まるのはそのマシンの `soda serve`
   * （herdr に無い操作なので本製品の選択。リモートでも止められるままにし、確認で名前を言う）。ローカルはホスト名（無ければ「このマシン」）。
   */
  private stopTarget(): { target: string; remote: boolean } {
    const id = this.machines.selectedId;
    if (id !== LOCAL_MACHINE_ID) return { target: this.machines.statusOf(id)?.label ?? id, remote: true };
    return { target: this.session.host?.hostname ?? "このマシン", remote: false };
  }

  /** `ConfirmDialog`（`kind: "confirmStopServer"`）が確定したときに呼ぶ（`stop_server`。20260927-cli-mode）。 */
  confirmStopServer(): void {
    if (this.view.dialogContext?.kind !== "confirmStopServer") return;
    this.view.closeDialog();
    this.conn
      .request("server.stop", {})
      .then(() => this.view.toast("サーバを止めています…"))
      .catch((err: unknown) => {
        const code = errorCodeOf(err);
        this.view.toast(code ? clientErrorMessage(code) : "サーバを止められませんでした。");
      });
  }

  private lastPane(): void {
    const target = this.view.lastFocusedPaneId;
    if (target === null || target === this.view.focusedPaneId) return; // AC2 のガード
    if (!this.session.panes.has(target)) return; // 直前の pane が既に閉じている（AC2）
    this.focusPaneAcrossViews(target);
  }

  private moveTab(direction: "previous" | "next"): void {
    const tab = this.view.tabId ? this.session.tabs.get(this.view.tabId) : undefined;
    if (!tab) return;
    // `tabIds` を先読みで並べ替えない（`tabDelta` と違い対象を求めるのに他の tab の情報が要らない。
    // `workspace.updated` が折り返ってから並びが反映される。design「振る舞いの詳細」）。
    void this.conn.request("tab.move", { tabId: tab.id, direction }).catch(() => undefined);
  }

  /**
   * `move_workspace_previous`/`move_workspace_next`（`moveTab` と同じ形）。対象は現在 focus 中の workspace の**項目**
   * （20261004-group-worktree-items。リポジトリなら worktree グループ丸ごと。同じ入れ物の中で 1 つ動く）。
   */
  private moveWorkspace(direction: "previous" | "next"): void {
    const workspaceId = this.view.workspaceId;
    // `moveTab` と同じく実在を確かめてから送る（タスク点検の指摘：閉じた直後の stale な id で
    // 空振りの要求を送らない。サーバ側では無視されるだけだが、意図を読める形にそろえる）。
    if (!workspaceId || !this.session.workspaces.has(workspaceId)) return;
    // 名前順のときの一番上は並べ替えを受け付けない（見た目が名前で決まる。グループの中は並べ替えられる）。
    if (this.view.workspaceSort === "name" && itemGroupIdOf(this.session, workspaceId) === null) {
      this.view.toast("名前順では並べ替えできません");
      return;
    }
    // `layout` を持つサーバは項目単位（子ならその worktree グループ全体。端では動かない）。無いサーバは今までの `workspace.move`。
    if (this.session.hasServerLayout) {
      void this.conn.request("item.move_by", { item: { kind: "workspace", workspaceId }, direction }).catch(() => undefined);
      return;
    }
    void this.conn.request("workspace.move", { workspaceId, direction }).catch(() => undefined);
  }

  /**
   * サイドバーの行のドラッグの確定（20261004-group-worktree-items。design「画面」のドラッグ）。動かすのは項目
   * （`item`。子を掴めばその worktree グループ）で、`before` の項目の前へ（null は入れ物の末尾。決め方は client-core の `dropBefore`）。入れ物が同じか・名前順の一番上かは
   * 呼び出し側（`Sidebar.vue`）が見て、ここへ来るのは受け付けてよい移動だけ。`layout` を持たない古いサーバには
   * 今までの `workspace.move_to`（項目の workspace の ID の集まりと、落とし先の項目の先頭の workspace。D22 のまま）を送る。
   */
  moveItemByDrag(item: ItemTarget, before: ItemTarget | null, legacy: { workspaceIds: string[]; beforeWorkspaceId: string | null }): void {
    if (!this.session.hasServerLayout) {
      // 古いサーバへ落とし先 null（末尾へ）を送ると意味が変わる。落とし先の無い行（空のグループ）の上では何も送らない。
      // 動かす workspace が無い（空のグループ）ときも送らない。
      if (legacy.beforeWorkspaceId === null || legacy.workspaceIds.length === 0) return;
      void this.conn.request("workspace.move_to", { workspaceIds: legacy.workspaceIds, beforeWorkspaceId: legacy.beforeWorkspaceId }).catch(() => undefined);
      return;
    }
    void this.conn.request("item.move", { item, before }).catch(() => this.view.toast("移動できませんでした"));
  }

  /** `previous_agent`/`next_agent`/`focus_agent` が共有する対象の組み立て（design「振る舞いの詳細」）。 */
  private agentOrderEntries(): AgentOrderEntry[] {
    return [...this.session.panes.values()]
      .filter((p) => p.agent !== null)
      .map((p) => {
        const agent = p.agent!;
        return { paneId: p.id, state: displayStateFor(agent, this.seen.getSeenSeq(agent.instanceId, agent.serverSeenSeq)), since: agent.since };
      });
  }

  private agentDelta(delta: 1 | -1): void {
    const ids = orderedAgentPaneIds(this.agentOrderEntries(), this.view.agentSort);
    if (ids.length === 0) return; // AC7a
    const current = ids.indexOf(this.view.focusedPaneId ?? "");
    const next = current === -1 ? (delta === 1 ? ids[0] : ids[ids.length - 1]) : ids[(current + delta + ids.length) % ids.length];
    if (next) this.focusPaneAcrossViews(next);
  }

  private focusAgentIndex(index: number): void {
    const ids = orderedAgentPaneIds(this.agentOrderEntries(), this.view.agentSort);
    const target = ids[index];
    if (target === undefined) return; // AC7b
    this.focusPaneAcrossViews(target);
  }

  /** `CopyTarget.apply()` の結果を見て、実際に抜けるかを決める（D63。`Esc` の `clearOrExit` はここで判断する）。 */
  private copy(cmd: CopyCommand): void {
    const paneId = this.view.focusedPaneId;
    if (!paneId) return;
    const entry = this.registry.get(paneId);
    if (!entry) return;
    const result = entry.copy.apply(cmd);
    if (result.copiedText !== undefined) {
      void writeClipboard(result.copiedText).then((ok) => this.view.toast(ok ? "コピーしました" : "コピーできませんでした"));
    }
    if (result.exited) this.keys.setMode("terminal");
  }

  private beginRenamePane(): void {
    const paneId = this.view.focusedPaneId;
    if (paneId) this.renamePaneById(paneId);
  }

  /** T22 から任意の pane を対象に呼ぶ。 */
  renamePaneById(paneId: string): void {
    const pane = this.session.panes.get(paneId);
    this.view.openDialogWithContext({ kind: "renamePane", paneId, currentLabel: pane?.label ?? "" });
  }

  private beginRenameTab(): void {
    const tabId = this.view.tabId;
    if (tabId) this.renameTabById(tabId);
  }

  /** T22 から任意の tab を対象に呼ぶ。 */
  renameTabById(tabId: string): void {
    const tab = this.session.tabs.get(tabId);
    if (!tab) return;
    this.view.openDialogWithContext({ kind: "renameTab", tabId, currentLabel: tab.label });
  }

  private beginRenameWorkspace(): void {
    const workspaceId = this.view.workspaceId;
    if (workspaceId) this.renameWorkspaceById(workspaceId);
  }

  /** T22 から任意の workspace を対象に呼ぶ。 */
  renameWorkspaceById(workspaceId: string): void {
    const ws = this.session.workspaces.get(workspaceId);
    if (!ws) return;
    this.view.openDialogWithContext({ kind: "renameWorkspace", workspaceId, currentLabel: ws.label, currentAutoLabel: ws.autoLabel });
  }

  /** T23（`NameDialog`）が名前の変更を確定したときに呼ぶ。`pane.rename` は空欄を「名前の消去」として送れる。 */
  confirmRenamePane(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "renamePane") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    void this.conn.request("pane.rename", { paneId: ctx.paneId, label: trimmed || null }).catch(() => this.view.toast("名前を変更できませんでした"));
  }

  /** `tab.rename` は空欄を受け付けない（サーバの検証）ので、空なら何もせず閉じるだけ。 */
  confirmRenameTab(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "renameTab") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return;
    void this.conn.request("tab.rename", { tabId: ctx.tabId, label: trimmed }).catch(() => this.view.toast("名前を変更できませんでした"));
  }

  /**
   * 空（空白だけ）なら `label: null`＝自動の名前に戻す。**自動の名前のまま変えずに確定したら送らない**——ダイアログは今の名前を全選択で開くので、
   * Enter だけで自動の名前が付けた名前として固定され、以後追従しなくなるのを防ぐ（20260921-workspace-auto-label の design D7。新しい tab の D75 と同じ考え）。
   * 自動かどうかは開いた時点の値で見る（開いている間にほかのブラウザで変わっても、変えずに確定したことに変わりはない）。
   */
  confirmRenameWorkspace(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "renameWorkspace") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    if (trimmed && ctx.currentAutoLabel && trimmed === ctx.currentLabel.trim()) return;
    void this.conn
      .request("workspace.rename", { workspaceId: ctx.workspaceId, label: trimmed || null })
      .catch(() => this.view.toast("名前を変更できませんでした"));
  }

  // --- メニュー専用の操作（`KeyRouter` を経由しない。D56 の訂正 10） --------

  /** メニューの「貼り付け」（design「マウス操作」）。`Ctrl+Shift+V` と同じ経路（`term.paste`）を使う。 */
  pasteFromMenu(): void {
    const paneId = this.view.focusedPaneId;
    if (paneId) this.pasteIntoPane(paneId);
  }

  /** T22 から、右クリックした pane（フォーカス中とは限らない）を対象に呼ぶ。 */
  pasteIntoPane(paneId: string): void {
    const entry = this.registry.get(paneId);
    if (!entry) return;
    if (this.imagePaste) {
      this.imagePaste.pasteClipboard(paneId); // テキストが無く画像があれば画像も（20260927-clipboard-image-paste）
      return;
    }
    void readClipboard().then((text) => {
      if (text) entry.term.paste(text);
    });
  }

  /** 「名前の消去」（名前があるときだけ出す判断は `ContextMenu`＝T22 の側）。 */
  clearPaneName(paneId: string): void {
    void this.conn.request("pane.rename", { paneId, label: null }).catch(() => undefined);
  }

  /** 右クリックの宛先の切替（herdr の同名の方式）。 */
  setRightClickTarget(paneId: string, target: "herdr" | "pane"): void {
    void this.conn.request("pane.input.set", { paneId, rightClick: target }).catch(() => undefined);
  }

  /**
   * 設定を読み直す（herdr の `reload_config` 相当。20260922-appearance-settings-rest。AC13〜AC15）。
   * `localStorage`（`soda.prefs.v1`）から、`settings`・`view` 各ストアの `soda.prefs.v1` 由来の値を
   * 読み直して反映する。**`settings`/`view` 以外のストア（`session`・通知の設定・`soda.seen.v1`）には
   * 触れない**（design decisions D4）。workspace・tab・pane の構成・フォーカスも変えない（AC15）。
   */
  private reloadConfig(): void {
    const raw = readPrefs();
    // `settings.ts` 側は raw 値を渡す形（`loadStatusSymbols(raw["statusSymbols"])` 等）。
    this.settings.statusSymbols = loadStatusSymbols(raw["statusSymbols"]);
    this.settings.scrollback = loadScrollbackPref(raw["scrollback"]);
    this.settings.newCwdPolicy = loadNewCwdPolicy(raw["newCwdPolicy"]);
    this.settings.newCwdPath = loadNewCwdPath(raw["newCwdPath"]);
    this.settings.shellCwdTracking = loadShellCwdTracking(raw["shellCwdTracking"]); // 20260928-windows-pane-cwd
    this.settings.displayScriptEnabled = loadDisplayScriptEnabled(raw["displayScriptEnabled"]); // 20261007-soda-extensions
    this.settings.displayPanelInitial = loadDisplayPanelInitial(raw["displayPanelInitial"]); // 20261008-display-layout
    this.settings.displayPanelDock = loadDisplayPanelDock(raw["displayPanelDock"]);
    this.settings.displayBandEdge = loadDisplayBandEdge(raw["displayBandEdge"]);
    const themePrefs = loadThemePrefs(raw);
    this.settings.theme = themePrefs.theme;
    this.settings.themeAuto = themePrefs.auto;
    this.settings.themeLight = themePrefs.light;
    this.settings.themeDark = themePrefs.dark;
    this.settings.paneFrameThickness = loadPaneFrameThickness(raw["paneFrameThickness"]);
    this.settings.paneAgentNameVisible = loadPaneAgentNameVisible(raw["paneAgentNameVisible"]);
    // 20260922-tabbar-pane-appearance（PR #12 から取り込み）分。
    this.settings.tabBarPosition = loadTabBarPosition(raw["tabBarPosition"]);
    this.settings.tabBarAlways = loadTabBarAlways(raw["tabBarAlways"]); // 20261008-ui-style AC24
    this.settings.tabBarRight = loadTabBarRightEntries(raw["tabBarRight"]);
    this.settings.tabBarRightSeparator = loadTabBarRightSeparator(raw["tabBarRightSeparator"]);
    this.settings.paneOuterBorders = loadPaneOuterBorders(raw["paneOuterBorders"]);
    // 20260926-pane-frame-auto-mode 分。
    this.settings.paneBorders = loadPaneBorders(raw["paneBorders"]);
    this.settings.paneGaps = loadPaneGaps(raw["paneGaps"]);
    this.settings.uiStyle = loadUiStyle(raw["uiStyle"]); // 20261008-ui-style
    // 20260927-sidebar-row-tokens 分。
    this.settings.sidebarRows = loadSidebarRows(raw["sidebarRows"]);
    // `view.ts` 側も同じ raw を渡す（`loadSidebarWidth`/`loadSidebarCollapsed`/`loadWorkspaceSort`
    // は元から raw 引数型。`loadAgentSort` は本来 `readPrefs()` を自分で呼ぶ自己完結型〔decisions
    // D7〕だが、ここで省略すると `readPrefs()`（＝ `localStorage` の読み出し）が実質2回になるため、
    // T7 の taskcheck 指摘で `raw` を渡せるようにした〔`loadAgentSort` 自体の定義参照〕）。
    this.view.sidebarWidth = loadSidebarWidth(raw["sidebarWidth"]);
    this.view.sidebarCollapsed = loadSidebarCollapsed(raw["sidebarCollapsed"]);
    // 20261004-ui-interaction-polish 分（サイドバーの区画の比と折りたたみ。同じく端末ごとの項目）。
    this.view.sidebarSectionRatio = loadSidebarSectionRatio(raw["sidebarSectionRatio"]);
    this.view.sectionsCollapsed = loadSidebarSectionsCollapsed(raw["sidebarSectionsCollapsed"]);
    this.view.agentSort = loadAgentSort(raw);
    this.view.workspaceSort = loadWorkspaceSort(raw["workspaceSort"]);
    this.view.toast("設定を読み直しました。");
    // 独自コマンド（20260927-custom-command-keys）：サーバに commands.json を読み直させる（結果は command.updated で全ブラウザへも配られる）。
    this.conn
      .request("command.reload", {})
      .then((r) => {
        this.commands.setCatalog(r);
        if (r.problem !== null) this.view.toast(`独自コマンドの設定を読めませんでした：${r.problem}`);
      })
      .catch(() => this.view.toast("独自コマンドの設定を読み直せませんでした。"));
    // 拡張（20261007-ext-host）：サーバに extensions.json を読み直させる（トーストは出さない。結果は節「拡張」の一覧に出る）。
    this.extensionReload?.();
  }
}

/** 独自コマンドの失敗の文言（code から引く。サーバの生の message は使わない。20260927-custom-command-keys）。 */
function commandErrorMessage(err: unknown): string {
  const code = errorCodeOf(err);
  return code ? clientErrorMessage(code) : "独自コマンドを走らせられませんでした。";
}

/**
 * worktree の失敗を利用者の言葉にする。**サーバの生の message は使わない**（D107・decisions.md D2）——
 * `code` を取り出して日本語の表から引く。取り出せなければ汎用の文言に落ちる。
 */
function worktreeErrorMessage(err: unknown): string {
  const code = errorCodeOf(err);
  return code ? clientErrorMessage(code) : "worktree の操作に失敗しました。";
}
