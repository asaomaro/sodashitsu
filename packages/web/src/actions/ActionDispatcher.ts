import type { AgentIntegrationInstallResult, AgentIntegrationKind, NewCwd } from "@sodashitsu/protocol";
import type { Pinia } from "pinia";
import type { KeyInputController, ActionPort, FocusPort } from "../keys/KeyInputController.js";
import type { Action, CopyCommand, Dir } from "../keys/actions.js";
import type { InputHold } from "../net/InputGate.js";
import type { ConnectionPort } from "../net/ports.js";
import { useSessionStore } from "../store/session.js";
import { useMachinesStore } from "../store/machines.js";
import { LOCAL_MACHINE_ID } from "../net/machineUrl.js";
import { useAgentIntegrationsStore } from "../store/agentIntegrations.js";
import { useCommandsStore } from "../store/commands.js";
import { useSeenStore, displayStateFor } from "../store/seen.js";
import { orderedAgentPaneIds, type AgentOrderEntry } from "../store/agentOrder.js";
import { visibleWorkspaceIdsInOrder } from "../store/workspaceGrouping.js";
import {
  buildNewCwd,
  loadNewCwdPath,
  loadNewCwdPolicy,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneFrameThickness,
  loadPaneGaps,
  loadPaneOuterBorders,
  loadStatusSymbols,
  useSettingsStore,
} from "../store/settings.js";
import { loadAgentSort, loadSidebarCollapsed, loadSidebarWidth, loadWorkspaceSort, readPrefs, useViewStore } from "../store/view.js";
import { loadScrollbackPref } from "../term/scrollback.js";
import { loadTabBarPosition, loadTabBarRightEntries, loadTabBarRightSeparator } from "../tabbar/tabBarRight.js";
import { loadSidebarRows } from "../sidebar/rowLayout.js";
import { loadThemePrefs } from "../theme/themes.js";
import { clientErrorMessage, errorCodeOf } from "../net/clientError.js";
import { depthFirstPaneIds, neighborPaneId } from "../term/layoutOrder.js";
import type { MenuTarget, UiPort } from "../term/MouseBridge.js";
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
  /** 保存した SSH のマシン（20260927-multi-host-machines）。ローカル以外を選んでいる間は session の一覧を使わない。 */
  private readonly machines: ReturnType<typeof useMachinesStore>;
  private readonly settings: ReturnType<typeof useSettingsStore>;
  private readonly commands: ReturnType<typeof useCommandsStore>;
  private readonly registry: TerminalRegistry;
  private readonly keys: KeyInputController;
  private readonly input: ActionDispatcherOptions["input"];
  private readonly notifications: ActionDispatcherOptions["notifications"];
  private readonly imagePaste: ActionDispatcherOptions["imagePaste"];

  constructor(opts: ActionDispatcherOptions) {
    this.conn = opts.conn;
    this.input = opts.input;
    this.notifications = opts.notifications;
    this.imagePaste = opts.imagePaste;
    this.session = useSessionStore(opts.pinia);
    this.agentIntegrations = useAgentIntegrationsStore(opts.pinia);
    this.seen = useSeenStore(opts.pinia);
    this.view = useViewStore(opts.pinia);
    this.machines = useMachinesStore(opts.pinia);
    this.settings = useSettingsStore(opts.pinia);
    this.commands = useCommandsStore(opts.pinia);
    this.registry = opts.registry;
    this.keys = opts.keys;
  }

  focusedPaneId(): string | null {
    return this.view.focusedPaneId;
  }

  // --- UiPort --------------------------------------------------------------

  openContextMenu(target: MenuTarget, at: { x: number; y: number }): void {
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
    this.sendWorktreeRemove(ctx.sourceWorkspaceId, ctx.path, false, ctx.openWorkspaceId);
  }

  /** dirty で通常の削除が失敗したあとの `--force` での再実行（AC7・AC8）。 */
  confirmWorktreeRemoveForce(): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "confirmWorktreeRemoveForce") return;
    this.view.closeDialog();
    this.sendWorktreeRemove(ctx.sourceWorkspaceId, ctx.path, true, ctx.openWorkspaceId);
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
  private sendWorktreeRemove(sourceWorkspaceId: string, path: string, force: boolean, openWorkspaceId: string | null): void {
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
            });
          }
          return;
        }
        // トーストは常に出す（失敗した事実は、他のダイアログが開いていても伝えてよい）。
        this.view.toast(worktreeErrorMessage(err));
        // 何も変わっていないので、削除元の workspace は必ず生きている——一覧を開き直して戻す
        // （AC9・AC-I1）。他のダイアログを奪わないことだけ守る。
        if (this.view.dialogContext === null) this.openWorktree(sourceWorkspaceId);
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
   * `NameDialog` が確定したときに呼ぶ。`group.create` → 作成したグループへ workspace を追加。
   * **2段階の失敗を区別する**（タスク点検の指摘）：`group.create` 自体が失敗すればグループは
   * 存在しないので「作成できませんでした」。それが成功した後の `group.add_member` だけが
   * 失敗した場合はグループ自体は残っている（空のグループとしてサイドバーに出る）ので、
   * 「作成できませんでした」と伝えると実際の状態と食い違う——別の文言にする（ロールバック＝
   * 作ったグループを削除する、まではしない。空のグループは無害で design のエラー処理どおり）。
   */
  confirmCreateGroup(label: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "createGroup") return;
    this.view.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return; // 空では確定しない（ボタンも disabled）
    void this.conn
      .request("group.create", { label: trimmed })
      .then((r) =>
        this.conn
          .request("group.add_member", { groupId: r.group.id, workspaceId: ctx.workspaceId })
          .catch(() => this.view.toast("グループは作成しましたが、workspace の追加に失敗しました。")),
      )
      .catch(() => this.view.toast("グループを作成できませんでした"));
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

  /** 「グループへ追加…」（既存グループが1件以上あるとき）。**空なら開かずに知らせる**（`openWorktree` と同じ形）。 */
  openGroupPicker(workspaceId: string): void {
    const groups = [...this.session.groups.values()];
    if (groups.length === 0) {
      this.view.toast("まだグループがありません。");
      return;
    }
    this.view.openDialogWithContext({ kind: "addToGroup", workspaceId, groups });
  }

  confirmAddToGroup(groupId: string): void {
    const ctx = this.view.dialogContext;
    if (ctx?.kind !== "addToGroup") return;
    this.view.closeDialog();
    void this.conn.request("group.add_member", { groupId, workspaceId: ctx.workspaceId }).catch(() => this.view.toast("グループへ追加できませんでした"));
  }

  /** 「グループから外す」（`groupId !== null` のときだけ `ContextMenu` が出す）。 */
  removeWorkspaceFromGroup(workspaceId: string): void {
    void this.conn.request("group.remove_member", { workspaceId }).catch(() => undefined);
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
  movePaneToTab(paneId: string, targetTabId: string): void {
    const originWorkspaceId = this.view.workspaceId;
    const originTabId = this.view.tabId;
    void this.conn
      .request("pane.move_to_tab", { paneId, targetTabId })
      .then((r) => {
        if (!r.ok) return;
        if (this.view.workspaceId !== originWorkspaceId || this.view.tabId !== originTabId) return;
        const targetTab = this.session.tabs.get(targetTabId);
        // 移動先 tab がまだ同期されていなければ何もしない（`movePaneToNewTab` の `!r.tab` と対称。
        // 表示を切り替えないのに focus だけ動くと、キー入力の宛先が画面と食い違う）。
        if (!targetTab) return;
        this.view.setView(targetTab.workspaceId, targetTabId);
        this.view.focusPane(paneId);
        this.registry.focus(paneId);
      })
      .catch(() => undefined);
  }

  /**
   * 名前ラベルのドラッグを、サイドバーの workspace 行へドロップしての移動
   * （20260924-pane-move-cross-tab。`PaneFrame.vue` から直接呼ぶ）。新しい tab の id は応答が
   * 返るまで分からないため、`movePaneToTab` と同じく応答を待ってから view を切り替える
   * （応答を待つ間に view が動いていたら追わないことも含めて同じ。review round1 の should 指摘）。
   */
  movePaneToNewTab(paneId: string, targetWorkspaceId: string): void {
    const originWorkspaceId = this.view.workspaceId;
    const originTabId = this.view.tabId;
    void this.conn
      .request("pane.move_to_new_tab", { paneId, targetWorkspaceId })
      .then((r) => {
        if (!r.ok || !r.tab) return;
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

  /** T22（`ContextMenu`）から任意の pane を対象に呼ぶ（フォーカス中とは限らない）。 */
  closePaneById(paneId: string): void {
    const pane = this.session.panes.get(paneId);
    if (pane?.busy) {
      this.view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: paneId }] });
      return;
    }
    void this.conn.request("pane.close", { paneId }).catch(() => undefined);
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
   * worktree 自動グループの本体のときだけ追加で出す（`confirmClose` の `closeLinkedWorktrees`）。
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
  private newWorkspace(): void {
    const hold = this.input?.holdInput(this.view.focusedPaneId); // D99：応答までに打った文字は新しい pane へ
    // 「引き継ぐ」の元は**このブラウザの焦点の pane**（サーバはクライアントごとの焦点を知らない。design D7）。
    this.conn
      .request("workspace.create", { newCwd: this.newCwdFor(this.view.focusedPaneId) })
      .then((r) => {
        this.view.setView(r.workspace.id, r.tab.id);
        this.view.focusPane(r.pane.id);
        this.releaseHold(hold, r.pane.id);
        this.noteCwdFallback(r);
      })
      .catch(() => {
        hold?.cancel();
        this.view.toast("workspace を作成できませんでした");
      });
  }

  // --- T18: navigate・resize・copy・名前の変更・その他 ----------------------

  private navigate(op: "up" | "down" | "paneDir" | "activate" | "cancel" | "openMenu", dir?: Dir): void {
    switch (op) {
      case "up":
      case "down": {
        // Sidebar.vue の描画（`groupedWorkspaceRows`）と同じ並び・同じ可視範囲を辿る
        // （20260923-workspace-grouping レビューの指摘：グループ導入前は素の反復順だったため
        // 画面の並びと一致していたが、グループ導入後は乖離していた）。
        const ids = visibleWorkspaceIdsInOrder([...this.session.workspaces.values()], [...this.session.groups.values()], this.view.workspaceSort, this.view.collapsedAutoGroups, this.view.workspaceId);
        if (ids.length === 0) return;
        const current = this.view.navigateSelection ? ids.indexOf(this.view.navigateSelection) : -1;
        const delta = op === "up" ? -1 : 1;
        const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
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
    }
  }

  private activateNavigateSelection(): void {
    const workspaceId = this.view.navigateSelection;
    this.view.setNavigateSelection(null);
    if (!workspaceId) return;
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
    // Sidebar.vue の描画（`groupedWorkspaceRows`）と同じ並び・同じ可視範囲を辿る（上の `navigate`
    // 「up」「down」と同じ理由。20260923-workspace-grouping レビューの指摘）。
    const ids = visibleWorkspaceIdsInOrder([...this.session.workspaces.values()], [...this.session.groups.values()], this.view.workspaceSort, this.view.collapsedAutoGroups, this.view.workspaceId);
    if (ids.length <= 1) return; // AC4
    const current = this.view.workspaceId ? ids.indexOf(this.view.workspaceId) : -1;
    const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
    if (next) this.focusWorkspaceById(next);
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
   * `move_workspace_previous`/`move_workspace_next`（20260923-workspace-grouping。`moveTab` と
   * 同じ形）。対象は現在 focus 中の workspace。グループの内側・外側を問わず、フラットな順序上で
   * 隣と入れ替わる——キーバインドはグループのまとまりを保つ動きはしない（design「振る舞いの詳細
   * （キーバインド）」。まとまりを保った移動は D&D の役割＝`moveWorkspacesByDrag`）。
   */
  private moveWorkspace(direction: "previous" | "next"): void {
    const workspaceId = this.view.workspaceId;
    // `moveTab` と同じく実在を確かめてから送る（タスク点検の指摘：閉じた直後の stale な id で
    // 空振りの要求を送らない。サーバ側では無視されるだけだが、意図を読める形にそろえる）。
    if (!workspaceId || !this.session.workspaces.has(workspaceId)) return;
    void this.conn.request("workspace.move", { workspaceId, direction }).catch(() => undefined);
  }

  /**
   * workspace 行・グループのヘッダー行の D&D 確定（20260923-workspace-grouping。design「振る舞いの
   * 詳細（D&D）」）。`workspaceIds` は動かす対象（通常の行なら1件、グループのヘッダー行ならそのグループの
   * 全メンバー id）。`Sidebar.vue` の `onRowPointerUp` から呼ぶ。
   */
  moveWorkspacesByDrag(workspaceIds: string[], beforeWorkspaceId: string | null): void {
    void this.conn.request("workspace.move_to", { workspaceIds, beforeWorkspaceId }).catch(() => undefined);
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
    const themePrefs = loadThemePrefs(raw);
    this.settings.theme = themePrefs.theme;
    this.settings.themeAuto = themePrefs.auto;
    this.settings.themeLight = themePrefs.light;
    this.settings.themeDark = themePrefs.dark;
    this.settings.paneFrameThickness = loadPaneFrameThickness(raw["paneFrameThickness"]);
    this.settings.paneAgentNameVisible = loadPaneAgentNameVisible(raw["paneAgentNameVisible"]);
    // 20260922-tabbar-pane-appearance（PR #12 から取り込み）分。
    this.settings.tabBarPosition = loadTabBarPosition(raw["tabBarPosition"]);
    this.settings.tabBarRight = loadTabBarRightEntries(raw["tabBarRight"]);
    this.settings.tabBarRightSeparator = loadTabBarRightSeparator(raw["tabBarRightSeparator"]);
    this.settings.paneOuterBorders = loadPaneOuterBorders(raw["paneOuterBorders"]);
    // 20260926-pane-frame-auto-mode 分。
    this.settings.paneBorders = loadPaneBorders(raw["paneBorders"]);
    this.settings.paneGaps = loadPaneGaps(raw["paneGaps"]);
    // 20260927-sidebar-row-tokens 分。
    this.settings.sidebarRows = loadSidebarRows(raw["sidebarRows"]);
    // `view.ts` 側も同じ raw を渡す（`loadSidebarWidth`/`loadSidebarCollapsed`/`loadWorkspaceSort`
    // は元から raw 引数型。`loadAgentSort` は本来 `readPrefs()` を自分で呼ぶ自己完結型〔decisions
    // D7〕だが、ここで省略すると `readPrefs()`（＝ `localStorage` の読み出し）が実質2回になるため、
    // T7 の taskcheck 指摘で `raw` を渡せるようにした〔`loadAgentSort` 自体の定義参照〕）。
    this.view.sidebarWidth = loadSidebarWidth(raw["sidebarWidth"]);
    this.view.sidebarCollapsed = loadSidebarCollapsed(raw["sidebarCollapsed"]);
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
