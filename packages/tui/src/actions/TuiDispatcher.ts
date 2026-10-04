import type { CommandListResult } from "@sodashitsu/protocol";
import {
  LOCAL_MACHINE_ID,
  clientErrorMessage,
  depthFirstPaneIds,
  errorCodeOf,
  neighborPaneId,
  orderedAgentPaneIds,
  visibleWorkspaceIdsInOrder,
  type Action,
  type AgentOrderEntry,
  type CopyCommand,
  type Dir,
  type InputHold,
  type Mode,
} from "@sodashitsu/client-core";
import { parseRemoteKey, remoteKey, type MachinesModel } from "../model/MachinesModel.js";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { MenuTarget, UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";

/** copy モードの対象（pane の headless の上のカーソル・選択・検索。`term/CopyTarget.ts`）。 */
export interface CopyResult {
  copiedText?: string;
  exited?: boolean;
}
export interface CopyTargetPort {
  apply(cmd: CopyCommand): CopyResult;
  resetCursor(): void;
}

export interface DispatcherHost {
  model: SessionModel;
  /** マシンを切り替える（navigate・goto で別のマシンの workspace を選んだとき。AC14・AC-I3）。 */
  switchMachine?(id: string, target?: { workspaceId: string; tabId: string }): void;
  /** 共有の設定（`prefs.*`）を送る先（ローカルのサーバ。無ければ `conn`。decisions D7.4）。 */
  prefsConn?: RequestPort;
  /** 保存した SSH のマシン（止めるサーバの名前。05 の T4）。 */
  machines?: MachinesModel;
  ui: UiState;
  prefs: PrefsModel;
  conn: RequestPort;
  /** 新しい pane へ焦点を移す操作の応答を待つ間の入力を溜める関所（web の D99。client-core の `InputGate`）。 */
  input?: { holdInput(sourcePaneId: string | null): InputHold };
  keys: { setMode(m: Mode): void };
  copyTarget(paneId: string): CopyTargetPort | undefined;
  writeClipboard(text: string): Promise<boolean>;
  /** 手元のクリップボードの文字（読めなければ null）。メニューの「貼り付け」（`pasteClipboard` が無いとき）。 */
  readClipboard(): Promise<string | null>;
  /** メニューの「貼り付け」：画像があれば画像、無ければ文字を貼る（web の ImagePaster.pasteClipboard）。 */
  pasteClipboard?(paneId: string): Promise<"image" | "text" | "empty" | "unavailable">;
  /** pane へ貼り付ける（pane のブラケットペーストに合わせて包む）。 */
  pasteText(paneId: string, text: string): void;
  detach(): void;
  /** 手元のサーバの停止（`server.stop`）が通った（この後にサーバが居なくなったら終了コード 0 で終える）。 */
  serverStopRequested?(): void;
  toggleSidebar(): void;
  /** 独自コマンドの一覧を受け取った（reload_config）。 */
  setCommands?(catalog: CommandListResult): void;
  /** 次の通知へ（prefix+o）。 */
  focusNextNotification(): void;
  /** クリップボードの画像の貼り付け（キー以外から。キーは TuiKeys が直接扱う）。 */
  pasteImage(): void;
}

/** 手元のクリップボードを読めないときの案内（05 の T5 で OS の道具から読むまで）。 */
export const PASTE_UNAVAILABLE =
  "クリップボードを読めません。外側の端末の貼り付け（Ctrl+Shift+V・Cmd+V 等）を使ってください";

/**
 * client-core の `Action` を RPC と画面の操作へ（20260927-cli-mode の architecture「actions/TuiDispatcher.ts」）。**web の
 * `packages/web/src/actions/ActionDispatcher.ts` を正として写した**——同じ RPC・同じ確認・同じ焦点の移り先。web の `view`（表示と焦点）は
 * `SessionModel`、ダイアログ・メニュー・知らせは `UiState` に当たる。
 */
export class TuiDispatcher {
  private readonly model: SessionModel;
  private readonly ui: UiState;
  private readonly conn: RequestPort;

  constructor(private readonly host: DispatcherHost) {
    this.model = host.model;
    this.ui = host.ui;
    this.conn = host.conn;
  }

  /** 旧名（03）。 */
  dispatch(action: Action): void {
    this.run(action);
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
        if (action.mode === "navigate") this.ui.setNavigateSelection(this.model.workspaceId);
        if (action.mode === "copy") {
          const paneId = this.model.focusedPaneId;
          // copy モードに入るたび、カーソルを端末の今の位置へ合わせ直す（web の D94）。
          if (paneId) this.host.copyTarget(paneId)?.resetCursor();
        }
        return; // モードの遷移は KeyRouter 自身が行う
      case "exitMode":
        this.host.keys.setMode("terminal");
        return;
      case "help":
        this.ui.openDialogWithContext({ kind: "help" });
        return;
      case "goto":
        this.ui.openDialogWithContext({ kind: "goto" });
        return;
      case "toggleSidebar":
        this.host.toggleSidebar();
        return;
      case "newWorktree": {
        // キーは `workspace.git` を見ない（作った直後でも始められるように。git でなければサーバの `not_a_git_repository` を知らせる）。
        const workspaceId = this.model.workspaceId;
        if (workspaceId) this.newWorktree(workspaceId);
        return;
      }
      case "detach":
        this.host.detach();
        return;
      case "settings":
        // 設定画面（web と同じく `settings` のダイアログ。05 の T1）。
        this.ui.openDialogWithContext({ kind: "settings" });
        return;
      case "nextNotification":
        this.host.focusNextNotification();
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
      case "pasteImage":
        this.host.pasteImage();
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
      case "workspaceDelta":
        this.workspaceDelta(action.delta);
        return;
      case "lastPane":
        this.lastPane();
        return;
      case "moveTab":
        this.moveTab(action.direction);
        return;
      case "moveWorkspace":
        this.moveWorkspace(action.direction);
        return;
      case "agentDelta":
        this.agentDelta(action.delta);
        return;
      case "focusAgentIndex":
        this.focusAgentIndex(action.index);
        return;
      case "workspaceIndex":
        this.workspaceIndex(action.index);
        return;
      case "openWorktree": {
        const workspaceId = this.model.workspaceId;
        if (!workspaceId) return;
        // herdr と同じく、linked worktree の workspace からは始めない（一覧は repo の本体から開く）。
        if (this.model.workspaces.get(workspaceId)?.git?.isLinkedWorktree === true) {
          this.ui.toast("worktree を開く操作は、repo の本体の workspace から始めてください。");
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
        this.ui.openDialogWithContext({ kind: "confirmStopServer", ...this.stopTarget() });
        return;
      case "openGraph":
        // 連携のグラフ画面はブラウザにだけある（20260927-agent-graph の decisions D1-8。操作表は共有のまま、端末版は知らせる）。
        this.ui.toast("グラフの画面はブラウザで開けます。");
        return;
      // 20261004-subagent-display。フォーカスしている pane のエージェントの一覧を開く（件数が 0・分からない・エージェントが居ないときは何もしない）。
      case "showSubagents": {
        const paneId = this.model.focusedPaneId;
        if (paneId) this.showSubagentsOf(paneId);
        return;
      }
      default:
        // 網羅の検査：`Action` に種類が増えたらここで型が落ちる（web は `switch` に網羅の検査が無く、足し忘れが黙って無反応になっていた）。
        action satisfies never;
    }
  }

  // --- tab・workspace の作成 ---

  /** 新しい tab。`tui.promptNewTabName`（herdr の prompt_new_tab_name。既定は入）が切なら名前を尋ねずすぐ作る。 */
  newTabInWorkspace(workspaceId: string): void {
    if (this.host.prefs.promptNewTabName)
      this.ui.openDialogWithContext({ kind: "newTab", workspaceId });
    else this.createTab(workspaceId, "");
  }

  /** 名前の入力欄が新規 tab の名前を確定したとき（空なら名前を送らない）。 */
  confirmNewTab(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "newTab") return;
    this.ui.closeDialog();
    this.createTab(ctx.workspaceId, label);
  }

  private createTab(workspaceId: string, label: string): void {
    const trimmed = label.trim();
    const hold = this.host.input?.holdInput(this.model.focusedPaneId);
    // 元の pane は焦点の pane が作る先の workspace にあるときだけ（閉じた後に読む。web の D97・design D7）。
    const newCwd = this.host.prefs.newCwd(this.focusedPaneIn(workspaceId));
    this.conn
      .request("tab.create", {
        workspaceId,
        ...(trimmed ? { label: trimmed } : {}),
        newCwd,
      })
      .then((result) => {
        this.model.setView(workspaceId, result.tab.id, result.pane.id);
        this.releaseHold(hold, result.pane.id);
        this.noteCwdFallback(result);
      })
      .catch(() => {
        hold?.cancel();
        this.ui.toast("tab を作成できませんでした");
      });
  }

  private newTab(): void {
    const workspaceId = this.model.workspaceId;
    if (workspaceId) this.newTabInWorkspace(workspaceId);
  }

  /** 新しい workspace。`tui.promptNewWorkspaceName`（herdr の prompt_new_workspace_name。既定は切）が入なら先に名前を尋ねる。 */
  private newWorkspace(): void {
    if (this.host.prefs.promptNewWorkspaceName)
      this.ui.openDialogWithContext({ kind: "newWorkspace" });
    else this.createWorkspace("");
  }

  /** 名前の入力欄が新規 workspace の名前を確定したとき（空なら名前を送らない＝自動の名前）。 */
  confirmNewWorkspace(label: string): void {
    if (this.ui.dialogContext?.kind !== "newWorkspace") return;
    this.ui.closeDialog();
    this.createWorkspace(label);
  }

  private createWorkspace(label: string): void {
    const trimmed = label.trim();
    const hold = this.host.input?.holdInput(this.model.focusedPaneId);
    this.conn
      .request("workspace.create", {
        ...(trimmed ? { label: trimmed } : {}),
        newCwd: this.host.prefs.newCwd(this.model.focusedPaneId),
      })
      .then((r) => {
        this.model.setView(r.workspace.id, r.tab.id, r.pane.id);
        this.releaseHold(hold, r.pane.id);
        this.noteCwdFallback(r);
      })
      .catch(() => {
        hold?.cancel();
        this.ui.toast("workspace を作成できませんでした");
      });
  }

  // --- worktree ---

  /** 作成のダイアログを開く（先にサーバへ聞く。パスのプレビューに根とリポジトリ名が要る）。 */
  newWorktree(workspaceId: string): void {
    this.conn
      .request("worktree.list", { workspaceId })
      .then((info) => this.ui.openDialogWithContext({ kind: "worktreeCreate", workspaceId, info }))
      .catch((err: unknown) => this.ui.toast(worktreeErrorMessage(err)));
  }

  /** 一覧のダイアログを開く（空なら開かずに知らせる）。 */
  openWorktree(workspaceId: string): void {
    this.conn
      .request("worktree.list", { workspaceId })
      .then((info) => {
        if (info.entries.length === 0) {
          this.ui.toast("この repo にはまだ worktree がありません。");
          return;
        }
        this.ui.openDialogWithContext({ kind: "worktreeOpen", workspaceId, entries: info.entries });
      })
      .catch((err: unknown) => this.ui.toast(worktreeErrorMessage(err)));
  }

  confirmWorktreeCreate(branch: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "worktreeCreate") return;
    const trimmed = branch.trim();
    if (!trimmed) return; // 空では確定しない
    this.ui.closeDialog();
    const hold = this.host.input?.holdInput(this.model.focusedPaneId);
    this.conn
      .request("worktree.create", { workspaceId: ctx.workspaceId, branch: trimmed })
      .then((created) => this.openWorkspaceAt(created.path, trimmed, hold))
      .catch((err: unknown) => {
        hold?.cancel();
        this.ui.toast(worktreeErrorMessage(err));
      });
  }

  /** 選んだ worktree を開く（既に開いていればそこへ移るだけ）。 */
  confirmWorktreeOpen(path: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "worktreeOpen") return;
    this.ui.closeDialog();
    const existing = [...this.model.workspaces.values()].find((w) => w.cwd === path);
    if (existing) {
      const tab = this.model.tabs.get(existing.activeTabId);
      this.model.setView(existing.id, existing.activeTabId, tab ? tab.focusedPaneId : undefined);
      void this.conn
        .request("workspace.focus", { workspaceId: existing.id })
        .catch(() => undefined);
      return;
    }
    const label = ctx.entries.find((e) => e.path === path)?.branch ?? path.split("/").pop() ?? path;
    this.openWorkspaceAt(path, label, this.host.input?.holdInput(this.model.focusedPaneId));
  }

  /** 一覧の行から削除（確認を経る）。今開いている workspace の場所と一致すれば、確認の文言で伝わる。 */
  removeWorktree(sourceWorkspaceId: string, path: string): void {
    const openWorkspace = [...this.model.workspaces.values()].find((w) => w.cwd === path);
    this.ui.openDialogWithContext({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId,
      path,
      openWorkspaceId: openWorkspace?.id ?? null,
    });
  }

  confirmWorktreeRemove(): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "confirmWorktreeRemove") return;
    this.ui.closeDialog();
    this.sendWorktreeRemove(
      ctx.sourceWorkspaceId,
      ctx.path,
      false,
      ctx.openWorkspaceId,
      ctx.closeOnCancel === true,
    );
  }

  confirmWorktreeRemoveForce(): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "confirmWorktreeRemoveForce") return;
    this.ui.closeDialog();
    this.sendWorktreeRemove(
      ctx.sourceWorkspaceId,
      ctx.path,
      true,
      ctx.openWorkspaceId,
      ctx.closeOnCancel === true,
    );
  }

  /** 確認の取り消し。worktree の削除系は一覧へ戻る（キーの `remove_worktree` から開いたものは閉じるだけ）。 */
  cancelConfirm(): void {
    const ctx = this.ui.dialogContext;
    if (
      (ctx?.kind === "confirmWorktreeRemove" || ctx?.kind === "confirmWorktreeRemoveForce") &&
      ctx.closeOnCancel !== true
    ) {
      this.openWorktree(ctx.sourceWorkspaceId);
      return;
    }
    this.ui.closeDialog();
  }

  /** web の `sendWorktreeRemove` と同じ規則（成功で一覧を開き直す・dirty/ロックは `--force` の確認へ・他のダイアログは奪わない）。 */
  private sendWorktreeRemove(
    sourceWorkspaceId: string,
    path: string,
    force: boolean,
    openWorkspaceId: string | null,
    closeOnCancel = false,
  ): void {
    this.conn
      .request("worktree.remove", { workspaceId: sourceWorkspaceId, path, force })
      .then(() => {
        if (this.ui.dialogContext !== null) return;
        if (sourceWorkspaceId === openWorkspaceId) return;
        this.openWorktree(sourceWorkspaceId);
      })
      .catch((err: unknown) => {
        const code = errorCodeOf(err);
        if (!force && (code === "worktree_dirty" || code === "worktree_locked")) {
          if (this.ui.dialogContext === null) {
            this.ui.openDialogWithContext({
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
        this.ui.toast(worktreeErrorMessage(err));
        if (this.ui.dialogContext === null && !closeOnCancel) this.openWorktree(sourceWorkspaceId);
      });
  }

  /** その場所を cwd に workspace を作って表示を移す（場所を明示するので `newCwd` は載せない。label にブランチ名）。 */
  private openWorkspaceAt(cwd: string, label: string, hold: InputHold | undefined): void {
    this.conn
      .request("workspace.create", { cwd, label })
      .then((result) => {
        this.model.setView(result.workspace.id, result.tab.id, result.pane.id);
        this.releaseHold(hold, result.pane.id);
      })
      .catch((err: unknown) => {
        hold?.cancel();
        this.ui.toast(worktreeErrorMessage(err));
      });
  }

  /** `remove_worktree`：今の workspace が linked worktree のときだけ、一覧から完全一致の場所を引いて削除の確認を開く（取り消したら閉じる）。 */
  private removeCurrentWorktree(): void {
    const workspaceId = this.model.workspaceId;
    const ws = workspaceId ? this.model.workspaces.get(workspaceId) : undefined;
    if (!ws) return;
    if (ws.git?.isLinkedWorktree !== true) {
      this.ui.toast(
        "この workspace は worktree のチェックアウトではありません（削除は worktree を開いた workspace で行います）。",
      );
      return;
    }
    this.conn
      .request("worktree.list", { workspaceId: ws.id })
      .then((info) => {
        const entry = info.entries.find((e) => e.path === ws.cwd);
        if (!entry) {
          this.ui.toast("この workspace の worktree が一覧に見つかりませんでした。");
          return;
        }
        if (this.ui.dialogContext !== null) return;
        this.ui.openDialogWithContext({
          kind: "confirmWorktreeRemove",
          sourceWorkspaceId: ws.id,
          path: entry.path,
          openWorkspaceId: ws.id,
          closeOnCancel: true,
        });
      })
      .catch((err: unknown) => this.ui.toast(worktreeErrorMessage(err)));
  }

  // --- 手動グループ ---

  createGroupForWorkspace(workspaceId: string): void {
    this.ui.openDialogWithContext({ kind: "createGroup", workspaceId });
  }

  confirmCreateGroup(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "createGroup") return;
    this.ui.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return;
    void this.conn
      .request("group.create", { label: trimmed })
      .then((r) =>
        this.conn
          .request("group.add_member", { groupId: r.group.id, workspaceId: ctx.workspaceId })
          .catch(() => this.ui.toast("グループは作成しましたが、workspace の追加に失敗しました。")),
      )
      .catch(() => this.ui.toast("グループを作成できませんでした"));
  }

  renameGroupById(groupId: string): void {
    const group = this.model.groups.get(groupId);
    if (!group) return;
    this.ui.openDialogWithContext({ kind: "renameGroup", groupId, currentLabel: group.label });
  }

  confirmRenameGroup(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "renameGroup") return;
    this.ui.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return;
    void this.conn
      .request("group.rename", { groupId: ctx.groupId, label: trimmed })
      .catch(() => this.ui.toast("名前を変更できませんでした"));
  }

  deleteGroupById(groupId: string): void {
    void this.conn
      .request("group.delete", { groupId })
      .catch(() => this.ui.toast("グループを削除できませんでした"));
  }

  toggleGroupCollapsed(groupId: string): void {
    void this.conn.request("group.toggle_collapsed", { groupId }).catch(() => undefined);
  }

  openGroupPicker(workspaceId: string): void {
    const groups = [...this.model.groups.values()];
    if (groups.length === 0) {
      this.ui.toast("まだグループがありません。");
      return;
    }
    this.ui.openDialogWithContext({ kind: "addToGroup", workspaceId, groups });
  }

  confirmAddToGroup(groupId: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "addToGroup") return;
    this.ui.closeDialog();
    void this.conn
      .request("group.add_member", { groupId, workspaceId: ctx.workspaceId })
      .catch(() => this.ui.toast("グループへ追加できませんでした"));
  }

  removeWorkspaceFromGroup(workspaceId: string): void {
    void this.conn.request("group.remove_member", { workspaceId }).catch(() => undefined);
  }

  /** worktree 自動グループの折りたたみ（共有の設定 `collapsedAutoGroups`。web は設定に持つ）。 */
  toggleAutoGroupCollapsed(repoKey: string): void {
    const now = new Set(this.host.prefs.collapsedAutoGroups);
    if (now.has(repoKey)) now.delete(repoKey);
    else now.add(repoKey);
    this.saveSharedPrefs({ collapsedAutoGroups: [...now] }, "折りたたみを保存できませんでした");
  }

  /** spaces の並び順を 2 値で行き来する（web の `view.toggleWorkspaceSort`。サイドバーのボタン。herdr の M14）。 */
  toggleWorkspaceSort(): void {
    const next = this.host.prefs.workspaceSort === "opened" ? "name" : "opened";
    this.saveSharedPrefs({ workspaceSort: next }, "並び順を保存できませんでした");
  }

  /** agents の並び順を 2 値で行き来する（web の `view.toggleAgentSort`）。 */
  toggleAgentSort(): void {
    const next = this.host.prefs.agentSort === "grouped" ? "priority" : "grouped";
    this.saveSharedPrefs({ agentSort: next }, "並び順を保存できませんでした");
  }

  /** 共有の設定を手元で先に変えて送る。保存できなければ元に戻して知らせる（黙って手元だけ変わったままにしない。04 の点検）。 */
  private saveSharedPrefs(patch: Record<string, unknown>, failure: string): void {
    const before = this.host.prefs.shared;
    const rev = this.host.prefs.rev;
    this.host.prefs.apply({ ...before, ...patch }, rev);
    (this.host.prefsConn ?? this.conn)
      .request("prefs.set", { patch })
      .then((r) => {
        if (r && typeof r.rev === "number") this.host.prefs.apply(r.prefs, r.rev);
      })
      .catch(() => {
        if (this.host.prefs.rev === rev) this.host.prefs.apply(before, rev);
        this.ui.toast(failure);
      });
  }

  // --- 閉じる ---

  /** 閉じる確認が確定したとき。`closeLinkedWorktrees` は workspace の対象が 1 件のときだけ効く。 */
  confirmClose(closeLinkedWorktrees = false): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "confirmClose") return;
    this.ui.closeDialog();
    const singleWorkspaceTarget = ctx.targets.filter((t) => t.type === "workspace").length === 1;
    for (const target of ctx.targets) {
      if (target.type === "pane")
        void this.conn.request("pane.close", { paneId: target.id }).catch(() => undefined);
      else if (target.type === "tab")
        void this.conn.request("tab.close", { tabId: target.id }).catch(() => undefined);
      else
        void this.conn
          .request("workspace.close", {
            workspaceId: target.id,
            closeLinkedWorktrees: closeLinkedWorktrees && singleWorkspaceTarget,
          })
          .catch(() => undefined);
    }
  }

  private closePane(): void {
    const paneId = this.model.focusedPaneId;
    if (paneId) this.closePaneById(paneId);
  }

  /** 実行中のプロセスがあれば確認（web の 20260918-web-terminal-multiplexer の D23）。 */
  closePaneById(paneId: string): void {
    const pane = this.model.panes.get(paneId);
    if (pane?.busy) {
      this.ui.openDialogWithContext({
        kind: "confirmClose",
        targets: [{ type: "pane", id: paneId }],
      });
      return;
    }
    void this.conn.request("pane.close", { paneId }).catch(() => undefined);
  }

  private closeTab(): void {
    const tabId = this.model.tabId;
    if (tabId) this.closeTabById(tabId);
  }

  closeTabById(tabId: string): void {
    const panesInTab = [...this.model.panes.values()].filter((p) => p.tabId === tabId);
    if (panesInTab.some((p) => p.busy)) {
      this.ui.openDialogWithContext({
        kind: "confirmClose",
        targets: [{ type: "tab", id: tabId }],
      });
      return;
    }
    void this.conn.request("tab.close", { tabId }).catch(() => undefined);
  }

  private closeWorkspace(): void {
    const workspaceId = this.model.workspaceId;
    if (workspaceId) this.closeWorkspaceById(workspaceId);
  }

  /**
   * workspace は確認する（`tui.confirmClose`。herdr の confirm_close。既定は入）。切にできるのは本作業の D18（H50）。切でも、実行中のプロセスがある pane を含むなら確認する（web の 20260918-web-terminal-multiplexer の D23）。
   * 確認しないときは紐づく worktree を消さない。
   */
  closeWorkspaceById(workspaceId: string): void {
    const busy = [...this.model.panes.values()].some(
      (p) => p.busy && this.model.tabs.get(p.tabId)?.workspaceId === workspaceId,
    );
    if (!this.host.prefs.confirmClose && !busy) {
      void this.conn
        .request("workspace.close", { workspaceId, closeLinkedWorktrees: false })
        .catch(() => undefined);
      return;
    }
    this.ui.openDialogWithContext({
      kind: "confirmClose",
      targets: [{ type: "workspace", id: workspaceId }],
    });
  }

  // --- pane ---

  private split(dir: "right" | "down"): void {
    const paneId = this.model.focusedPaneId;
    if (paneId) this.splitPane(paneId, dir);
  }

  /** 任意の pane を分割する（メニュー）。新しい pane へ焦点を移す（AC-I4）。 */
  splitPane(paneId: string, dir: "right" | "down"): void {
    const hold = this.host.input?.holdInput(this.model.focusedPaneId);
    this.conn
      .request("pane.split", { paneId, direction: dir, newCwd: this.host.prefs.newCwd(null) })
      .then((r) => {
        this.model.focusPane(r.pane.id);
        this.releaseHold(hold, r.pane.id);
        this.noteCwdFallback(r);
      })
      .catch(() => {
        hold?.cancel();
        this.ui.toast("分割できませんでした");
      });
  }

  /** スクロールバックをエディタで開く（サーバがエディタの pane を開く）。その pane へ焦点を移す。 */
  private editScrollback(): void {
    const paneId = this.model.focusedPaneId;
    if (!paneId) return;
    const hold = this.host.input?.holdInput(paneId);
    this.conn
      .request("pane.edit_scrollback", { paneId })
      .then((r) => {
        if (this.model.panes.has(r.pane.id)) this.model.focusPane(r.pane.id);
        this.releaseHold(hold, r.pane.id);
      })
      .catch(() => {
        hold?.cancel();
        this.ui.toast("スクロールバックをエディタで開けませんでした");
      });
  }

  /** 移動先はクライアントで求め、焦点を即座に移してからサーバへ知らせる（web の D97）。 */
  private focusDir(dir: Dir): void {
    const paneId = this.model.focusedPaneId;
    const tab = this.model.currentTab();
    if (!paneId || !tab) return;
    const next = neighborPaneId(tab.layout, paneId, dir);
    if (!next) return;
    this.model.focusPane(next);
    void this.conn.request("pane.focus", { paneId: next }).catch(() => undefined);
  }

  private swap(dir: Dir): void {
    const paneId = this.model.focusedPaneId;
    if (!paneId) return;
    void this.conn.request("pane.swap", { paneId, direction: dir }).catch(() => undefined);
  }

  /**
   * その pane のエージェントのサブエージェントの一覧（overlay）を開く（20261004-subagent-display。`show_subagents`・サイドバーの件数のクリック・pane のメニュー）。
   * 件数が 1 以上のときだけ（0・報告を受けていない・エージェントが居ないときは何もしない。web の `showSubagents` と同じ）。
   */
  showSubagentsOf(paneId: string): void {
    const agent = this.model.panes.get(paneId)?.agent;
    if (!agent || (agent.subagents?.count ?? 0) < 1) return;
    this.ui.openDialogWithContext({ kind: "subagents", paneId, instanceId: agent.instanceId });
  }

  /**
   * 焦点の pane と入れ替える（herdr の pane のメニューの「Swap with focused pane」）。キーから（`paneId` 無し）は直前の pane と。
   * 同じ tab の pane どうしだけ。入れ替えた後も焦点は元の pane のまま（`pane.focus` を送り直す）。
   */
  swapWithFocused(paneId?: string): void {
    const focused = this.model.focusedPaneId;
    const other = paneId ?? this.model.lastFocusedPaneId;
    if (!focused || !other || other === focused) return;
    if (this.model.panes.get(other)?.tabId !== this.model.panes.get(focused)?.tabId) return;
    void this.conn
      .request("pane.swap_with", { paneId: focused, otherPaneId: other })
      .then((r) => {
        if (r.ok) void this.conn.request("pane.focus", { paneId: focused }).catch(() => undefined);
      })
      .catch(() => undefined);
  }

  /** 名前のドラッグを別の pane の縁へ落としての分割（web の拡張 W01）。 */
  movePaneToEdge(
    paneId: string,
    targetPaneId: string,
    edge: "top" | "bottom" | "left" | "right",
  ): void {
    void this.conn
      .request("pane.move_to_edge", { paneId, targetPaneId, edge })
      .catch(() => undefined);
  }

  /** 名前のドラッグを別の pane の中央へ落としての置き換え。落とし先が動作中なら確認（web の 20260918-web-terminal-multiplexer の D23）。 */
  replacePaneWithDrag(paneId: string, targetPaneId: string): void {
    const target = this.model.panes.get(targetPaneId);
    if (target?.busy) {
      this.ui.openDialogWithContext({ kind: "confirmReplacePane", paneId, targetPaneId });
      return;
    }
    this.sendReplacePane(paneId, targetPaneId);
  }

  private sendReplacePane(paneId: string, targetPaneId: string): void {
    void this.conn.request("pane.replace", { paneId, targetPaneId }).catch(() => undefined);
  }

  confirmReplacePane(): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "confirmReplacePane") return;
    this.ui.closeDialog();
    this.sendReplacePane(ctx.paneId, ctx.targetPaneId);
  }

  /** 名前のドラッグを tab バーの tab へ（成功してから表示を移す。待つ間に表示が動いていたら追わない）。 */
  movePaneToTab(paneId: string, targetTabId: string): void {
    const originWorkspaceId = this.model.workspaceId;
    const originTabId = this.model.tabId;
    void this.conn
      .request("pane.move_to_tab", { paneId, targetTabId })
      .then((r) => {
        if (!r.ok) return;
        if (this.model.workspaceId !== originWorkspaceId || this.model.tabId !== originTabId)
          return;
        const targetTab = this.model.tabs.get(targetTabId);
        if (!targetTab) return;
        this.model.setView(targetTab.workspaceId, targetTabId, paneId);
      })
      .catch(() => undefined);
  }

  /** 名前のドラッグをサイドバーの workspace の行へ（新しい tab に移す）。 */
  movePaneToNewTab(paneId: string, targetWorkspaceId: string): void {
    const originWorkspaceId = this.model.workspaceId;
    const originTabId = this.model.tabId;
    void this.conn
      .request("pane.move_to_new_tab", { paneId, targetWorkspaceId })
      .then((r) => {
        if (!r.ok || !r.tab) return;
        if (this.model.workspaceId !== originWorkspaceId || this.model.tabId !== originTabId)
          return;
        this.model.setView(targetWorkspaceId, r.tab.id, paneId);
      })
      .catch(() => undefined);
  }

  private cyclePane(delta: 1 | -1): void {
    const tab = this.model.currentTab();
    if (!tab) return;
    const ids = depthFirstPaneIds(tab.layout);
    if (ids.length === 0) return;
    const current = this.model.focusedPaneId ? ids.indexOf(this.model.focusedPaneId) : -1;
    const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
    if (!next) return;
    this.model.focusPane(next);
    void this.conn.request("pane.focus", { paneId: next }).catch(() => undefined);
  }

  private zoom(): void {
    const paneId = this.model.focusedPaneId;
    if (paneId) this.zoomPane(paneId);
  }

  zoomPane(paneId: string): void {
    void this.conn.request("pane.zoom", { paneId, mode: "toggle" }).catch(() => undefined);
  }

  // --- tab ---

  private tabDelta(delta: 1 | -1): void {
    const tab = this.model.currentTab();
    if (!tab) return;
    const ws = this.model.workspaces.get(tab.workspaceId);
    if (!ws || ws.tabIds.length === 0) return;
    const idx = ws.tabIds.indexOf(tab.id);
    const nextTabId =
      ws.tabIds[(idx === -1 ? 0 : idx + delta + ws.tabIds.length) % ws.tabIds.length];
    if (nextTabId) this.switchToTab(ws.id, nextTabId);
  }

  private tabIndex(index: number): void {
    const workspaceId = this.model.workspaceId;
    if (!workspaceId) return;
    const tabId = this.model.workspaces.get(workspaceId)?.tabIds[index - 1];
    if (tabId) this.switchToTab(workspaceId, tabId);
  }

  switchToTab(workspaceId: string, tabId: string): void {
    const tab = this.model.tabs.get(tabId);
    this.model.setView(workspaceId, tabId, tab ? tab.focusedPaneId : undefined);
    void this.conn.request("tab.focus", { tabId }).catch(() => undefined);
  }

  private moveTab(direction: "previous" | "next"): void {
    const tab = this.model.currentTab();
    if (!tab) return;
    void this.conn.request("tab.move", { tabId: tab.id, direction }).catch(() => undefined);
  }

  // --- workspace ---

  /**
   * navigate モードで選べる並び：保存した SSH のマシンがあれば、マシンの見出しの順に、今のマシンは今の workspace、ほかのマシン（畳んでいない）は
   * 要約の workspace（`remoteKey`）。サイドバーの並びと同じ。
   */
  private navigateIds(): string[] {
    const m = this.host.machines;
    if (!m?.hasMachines) return this.visibleWorkspaceIds();
    const out: string[] = [];
    for (const s of m.sections) {
      if (s.id === m.selectedId) out.push(...this.visibleWorkspaceIds());
      else if (!m.collapsed[s.id])
        for (const ws of m.summaries[s.id]?.workspaces ?? []) out.push(remoteKey(s.id, ws.id));
    }
    return out;
  }

  /** 別のマシンの workspace へ（そのマシンへ切り替えて、その workspace へ移る）。 */
  openRemoteWorkspace(machineId: string, workspaceId: string): void {
    const ws = this.host.machines?.summaries[machineId]?.workspaces.find(
      (w) => w.id === workspaceId,
    );
    if (!ws) return;
    this.host.switchMachine?.(machineId, { workspaceId, tabId: ws.activeTabId });
  }

  private visibleWorkspaceIds(): string[] {
    return visibleWorkspaceIdsInOrder(
      [...this.model.workspaces.values()],
      [...this.model.groups.values()],
      this.host.prefs.workspaceSort,
      this.host.prefs.collapsedAutoGroups,
      this.model.workspaceId,
    );
  }

  private workspaceDelta(delta: 1 | -1): void {
    const ids = this.visibleWorkspaceIds();
    if (ids.length <= 1) return;
    const current = this.model.workspaceId ? ids.indexOf(this.model.workspaceId) : -1;
    const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
    if (next) this.focusWorkspaceById(next);
  }

  /** `switch_workspace`（1〜9）。サイドバーの並びの N 番目へ。 */
  private workspaceIndex(index: number): void {
    const target = this.visibleWorkspaceIds()[index - 1];
    if (target) this.focusWorkspaceById(target);
  }

  focusWorkspaceById(workspaceId: string): void {
    const ws = this.model.workspaces.get(workspaceId);
    if (ws) {
      const tab = this.model.tabs.get(ws.activeTabId);
      this.model.setView(ws.id, ws.activeTabId, tab ? tab.focusedPaneId : undefined);
    }
    void this.conn.request("workspace.focus", { workspaceId }).catch(() => undefined);
  }

  /** pane の属する tab・workspace へ表示を移して焦点を合わせる（サイドバー・エージェント・直前の pane）。 */
  focusPaneAcrossViews(paneId: string): void {
    const pane = this.model.panes.get(paneId);
    if (!pane || !this.model.tabs.get(pane.tabId)) return;
    this.model.focusPane(paneId);
    void this.conn.request("pane.focus", { paneId }).catch(() => undefined);
  }

  private moveWorkspace(direction: "previous" | "next"): void {
    const workspaceId = this.model.workspaceId;
    if (!workspaceId || !this.model.workspaces.has(workspaceId)) return;
    void this.conn.request("workspace.move", { workspaceId, direction }).catch(() => undefined);
  }

  /** サイドバーの行のドラッグで並べ替える（`workspaceIds` は動かす対象。グループのヘッダーならそのメンバー全部）。 */
  moveWorkspacesByDrag(workspaceIds: string[], beforeWorkspaceId: string | null): void {
    void this.conn
      .request("workspace.move_to", { workspaceIds, beforeWorkspaceId })
      .catch(() => undefined);
  }

  // --- エージェント・直前の pane ---

  private agentOrderEntries(): AgentOrderEntry[] {
    return [...this.model.panes.values()]
      .filter((p) => p.agent !== null)
      .map((p) => ({ paneId: p.id, state: this.model.displayStateOf(p), since: p.agent!.since }));
  }

  private agentDelta(delta: 1 | -1): void {
    const ids = orderedAgentPaneIds(this.agentOrderEntries(), this.host.prefs.agentSort);
    if (ids.length === 0) return;
    const current = ids.indexOf(this.model.focusedPaneId ?? "");
    const next =
      current === -1
        ? delta === 1
          ? ids[0]
          : ids[ids.length - 1]
        : ids[(current + delta + ids.length) % ids.length];
    if (next) this.focusPaneAcrossViews(next);
  }

  private focusAgentIndex(index: number): void {
    const ids = orderedAgentPaneIds(this.agentOrderEntries(), this.host.prefs.agentSort);
    const target = ids[index];
    if (target === undefined) return;
    this.focusPaneAcrossViews(target);
  }

  private lastPane(): void {
    const target = this.model.lastFocusedPaneId;
    if (target === null || target === this.model.focusedPaneId) return;
    if (!this.model.panes.has(target)) return;
    this.focusPaneAcrossViews(target);
  }

  // --- navigate・resize・copy ---

  private navigate(
    op: "up" | "down" | "paneDir" | "activate" | "cancel" | "openMenu",
    dir?: Dir,
  ): void {
    switch (op) {
      case "up":
      case "down": {
        // 別のマシンの workspace も同じ並びで選べる（サイドバーの並びと同じ。キーだけでマシンを切り替えられる）。
        const ids = this.navigateIds();
        if (ids.length === 0) return;
        const current = this.ui.navigateSelection ? ids.indexOf(this.ui.navigateSelection) : -1;
        const delta = op === "up" ? -1 : 1;
        const next = ids[(current === -1 ? 0 : current + delta + ids.length) % ids.length];
        if (next) this.ui.setNavigateSelection(next);
        return;
      }
      case "paneDir":
        if (dir) this.focusDir(dir);
        return;
      case "activate": {
        const workspaceId = this.ui.navigateSelection;
        this.ui.setNavigateSelection(null);
        const remote = workspaceId ? parseRemoteKey(workspaceId) : null;
        if (remote) this.openRemoteWorkspace(remote.machineId, remote.workspaceId);
        else if (workspaceId) this.focusWorkspaceById(workspaceId);
        return;
      }
      case "cancel":
        this.ui.setNavigateSelection(null);
        return;
      case "openMenu":
        // 別のマシンの workspace にはメニューが無い（そのマシンへ切り替えてから）。
        if (this.ui.navigateSelection && !parseRemoteKey(this.ui.navigateSelection))
          this.ui.requestNavigateMenu();
        return;
    }
  }

  private resizeBy(dir: Dir, amount: number): void {
    const paneId = this.model.focusedPaneId;
    if (!paneId) return;
    void this.conn
      .request("pane.resize", { paneId, direction: dir, amount })
      .catch(() => undefined);
  }

  /** copy の対象の結果を見て、実際に抜けるかを決める（Esc の `clearOrExit`。web の D63）。 */
  private copy(cmd: CopyCommand): void {
    const paneId = this.model.focusedPaneId;
    if (!paneId) return;
    const target = this.host.copyTarget(paneId);
    if (!target) return;
    const result = target.apply(cmd);
    if (result.copiedText !== undefined) {
      void this.host
        .writeClipboard(result.copiedText)
        .then((ok) => this.ui.toast(ok ? "コピーしました" : "コピーできませんでした"));
    }
    if (result.exited) this.host.keys.setMode("terminal");
  }

  // --- 名前の変更 ---

  private beginRenamePane(): void {
    const paneId = this.model.focusedPaneId;
    if (paneId) this.renamePaneById(paneId);
  }

  renamePaneById(paneId: string): void {
    const pane = this.model.panes.get(paneId);
    this.ui.openDialogWithContext({ kind: "renamePane", paneId, currentLabel: pane?.label ?? "" });
  }

  private beginRenameTab(): void {
    const tabId = this.model.tabId;
    if (tabId) this.renameTabById(tabId);
  }

  renameTabById(tabId: string): void {
    const tab = this.model.tabs.get(tabId);
    if (!tab) return;
    this.ui.openDialogWithContext({ kind: "renameTab", tabId, currentLabel: tab.label });
  }

  private beginRenameWorkspace(): void {
    const workspaceId = this.model.workspaceId;
    if (workspaceId) this.renameWorkspaceById(workspaceId);
  }

  renameWorkspaceById(workspaceId: string): void {
    const ws = this.model.workspaces.get(workspaceId);
    if (!ws) return;
    this.ui.openDialogWithContext({
      kind: "renameWorkspace",
      workspaceId,
      currentLabel: ws.label,
      currentAutoLabel: ws.autoLabel,
    });
  }

  /** `pane.rename` は空欄を「名前の消去」として送る。 */
  confirmRenamePane(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "renamePane") return;
    this.ui.closeDialog();
    const trimmed = label.trim();
    void this.conn
      .request("pane.rename", { paneId: ctx.paneId, label: trimmed || null })
      .catch(() => this.ui.toast("名前を変更できませんでした"));
  }

  /** `tab.rename` は空欄を受け付けないので、空なら閉じるだけ。 */
  confirmRenameTab(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "renameTab") return;
    this.ui.closeDialog();
    const trimmed = label.trim();
    if (!trimmed) return;
    void this.conn
      .request("tab.rename", { tabId: ctx.tabId, label: trimmed })
      .catch(() => this.ui.toast("名前を変更できませんでした"));
  }

  /** 空なら自動の名前に戻す。自動の名前のまま変えずに確定したら送らない（web の 20260921-workspace-auto-label D7）。 */
  confirmRenameWorkspace(label: string): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "renameWorkspace") return;
    this.ui.closeDialog();
    const trimmed = label.trim();
    if (trimmed && ctx.currentAutoLabel && trimmed === ctx.currentLabel.trim()) return;
    void this.conn
      .request("workspace.rename", { workspaceId: ctx.workspaceId, label: trimmed || null })
      .catch(() => this.ui.toast("名前を変更できませんでした"));
  }

  // --- メニュー専用の操作 ---

  openContextMenu(target: MenuTarget, at: { x: number; y: number }): void {
    this.ui.openContextMenu(target, at);
  }

  pasteIntoPane(paneId: string): void {
    // 空は黙って何もしない。読めない（null。手元のクリップボードを読む道具は 05 の T5）は外側の端末の貼り付けを案内する
    // （外側の端末の貼り付けはブラケットペーストで届く）。
    if (this.host.pasteClipboard) {
      void this.host.pasteClipboard(paneId).then((r) => {
        if (r === "unavailable") this.ui.toast(PASTE_UNAVAILABLE);
      });
      return;
    }
    void this.host.readClipboard().then((text) => {
      if (text === null) this.ui.toast(PASTE_UNAVAILABLE);
      else if (text !== "") this.host.pasteText(paneId, text);
    });
  }

  clearPaneName(paneId: string): void {
    void this.conn.request("pane.rename", { paneId, label: null }).catch(() => undefined);
  }

  /** 右クリックの宛先の切替（herdr の同名の方式）。 */
  setRightClickTarget(paneId: string, target: "herdr" | "pane"): void {
    void this.conn.request("pane.input.set", { paneId, rightClick: target }).catch(() => undefined);
  }

  // --- サーバの停止 ---

  /** 止まるサーバ（手元。ほかのマシンへの接続は 05）。ホスト名が無ければ「このマシン」。 */
  /** 止めるサーバ（web と同じ：別のマシンを見ていればそのマシンの名前、ローカルならホスト名）。 */
  private stopTarget(): { target: string; remote: boolean } {
    const m = this.host.machines;
    if (m && m.selectedId !== LOCAL_MACHINE_ID)
      return { target: m.statusOf(m.selectedId)?.label ?? m.selectedId, remote: true };
    return { target: this.model.host?.hostname ?? "このマシン", remote: false };
  }

  confirmStopServer(): void {
    if (this.ui.dialogContext?.kind !== "confirmStopServer") return;
    this.ui.closeDialog();
    const { remote } = this.stopTarget();
    this.conn
      .request("server.stop", {})
      .then(() => {
        this.ui.toast("サーバを止めています…");
        // 手元のサーバ（画面の接続の先）を止めた。別のマシンを止めても手元の接続は続く。
        if (!remote) this.host.serverStopRequested?.();
      })
      .catch((err: unknown) => {
        const code = errorCodeOf(err);
        this.ui.toast(code ? clientErrorMessage(code) : "サーバを止められませんでした。");
      });
  }

  // --- 設定の読み直し ---

  /** 設定を読み直す（herdr の `reload_config`。端末版は共有の設定をサーバから取り直し、独自コマンドの設定を読み直させる）。 */
  private reloadConfig(): void {
    // 共有の設定はローカルのサーバから（ほかのマシンを見ていても。decisions D7.4）。
    (this.host.prefsConn ?? this.conn)
      .request("prefs.get", {})
      .then((r) => {
        this.host.prefs.apply(r.prefs, r.rev);
        this.ui.toast("設定を読み直しました。");
      })
      .catch(() => this.ui.toast("設定を読み直せませんでした。"));
    this.conn
      .request("command.reload", {})
      .then((r) => {
        this.host.setCommands?.(r);
        if (r.problem !== null) this.ui.toast(`独自コマンドの設定を読めませんでした：${r.problem}`);
      })
      .catch(() => this.ui.toast("独自コマンドの設定を読み直せませんでした。"));
  }

  // --- 共通 ---

  private focusedPaneIn(workspaceId: string): string | null {
    const paneId = this.model.focusedPaneId;
    const pane = paneId ? this.model.panes.get(paneId) : undefined;
    const tab = pane ? this.model.tabs.get(pane.tabId) : undefined;
    return tab?.workspaceId === workspaceId ? paneId : null;
  }

  private noteCwdFallback(result: { cwdFallback?: true }): void {
    if (result.cwdFallback)
      this.ui.toast(
        "新しく開く場所が使えないため、代わりの場所で開きました（設定の「端末」で確かめてください）",
      );
  }

  /**
   * 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ）：popup は浮いた端末のダイアログ、shell は走らせて知らせる、pane は新しい
   * pane へ移る（応答までの打鍵は新しい pane へ）。一覧に無いコマンド・焦点の pane が無ければ何もしない。
   */
  private runCommand(commandId: string): void {
    const def = this.model.commands.commands.find((c) => c.id === commandId);
    const paneId = this.model.focusedPaneId;
    if (!def || !paneId) return;
    const label = def.description ?? def.id;
    if (def.type === "popup") {
      this.ui.openDialogWithContext({
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
        .then(() => this.ui.toast(`「${label}」を走らせました。`))
        .catch((err: unknown) => this.ui.toast(commandErrorMessage(err)));
      return;
    }
    const hold = this.host.input?.holdInput(paneId);
    this.conn
      .request("command.run", { commandId, paneId })
      .then((r) => {
        const pane = r.type === "pane" ? r.pane : null;
        if (pane && this.model.panes.has(pane.id)) this.model.focusPane(pane.id);
        this.releaseHold(hold, pane?.id ?? paneId);
      })
      .catch((err: unknown) => {
        hold?.cancel();
        this.ui.toast(commandErrorMessage(err));
      });
  }

  /** 溜めた入力を新しい pane へ（閉じている・zoom で隠れているなら元の pane へ戻す。web の D99）。 */
  private releaseHold(hold: InputHold | undefined, newPaneId: string): void {
    if (!hold) return;
    const pane = this.model.panes.get(newPaneId);
    const tab = pane ? this.model.tabs.get(pane.tabId) : undefined;
    const hiddenByZoom = !!tab?.zoomedPaneId && tab.zoomedPaneId !== newPaneId;
    if (pane && !hiddenByZoom) hold.release(newPaneId);
    else hold.cancel();
  }
}

function commandErrorMessage(err: unknown): string {
  const code = errorCodeOf(err);
  return code ? clientErrorMessage(code) : "独自コマンドを走らせられませんでした。";
}

function worktreeErrorMessage(err: unknown): string {
  const code = errorCodeOf(err);
  return code ? clientErrorMessage(code) : "worktree の操作に失敗しました。";
}
