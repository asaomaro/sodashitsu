import type { WorktreeEntry, WorktreeListResult, WorkspaceGroup } from "@sodashitsu/protocol";
import type { SessionModel } from "./SessionModel.js";

/**
 * 画面の一時的な状態（ダイアログ・メニュー・navigate の選択・知らせ）。web の `store/view.ts` のうちダイアログとメニューの部分を写した
 * （20260927-cli-mode の 04-tui-ops。ダイアログは 1 つずつ・閉じたら開く前の pane へ焦点を戻す。AC-I1・AC-I4）。
 * **`DialogContext` の形は web と同じ**——操作（`TuiDispatcher`）の確定・取り消しの規則を web の `ActionDispatcher` から写すため。
 */
export type DialogContext =
  | { kind: "newTab"; workspaceId: string }
  | { kind: "renamePane"; paneId: string; currentLabel: string }
  | { kind: "renameTab"; tabId: string; currentLabel: string }
  | {
      kind: "renameWorkspace";
      workspaceId: string;
      currentLabel: string;
      currentAutoLabel: boolean;
    }
  | { kind: "confirmClose"; targets: { type: "pane" | "tab" | "workspace"; id: string }[] }
  | { kind: "confirmReplacePane"; paneId: string; targetPaneId: string }
  | { kind: "help" }
  | { kind: "goto" }
  | { kind: "settings" }
  | { kind: "worktreeCreate"; workspaceId: string; info: WorktreeListResult }
  | { kind: "worktreeOpen"; workspaceId: string; entries: WorktreeEntry[] }
  | {
      kind: "confirmWorktreeRemove";
      sourceWorkspaceId: string;
      path: string;
      openWorkspaceId: string | null;
      closeOnCancel?: true;
    }
  | {
      kind: "confirmWorktreeRemoveForce";
      sourceWorkspaceId: string;
      path: string;
      openWorkspaceId: string | null;
      reason: "dirty" | "locked";
      closeOnCancel?: true;
    }
  | { kind: "confirmStopServer"; target: string; remote: boolean }
  | { kind: "createGroup"; workspaceId: string }
  | { kind: "renameGroup"; groupId: string; currentLabel: string }
  | { kind: "addToGroup"; workspaceId: string; groups: WorkspaceGroup[] };

/** 右クリックのメニューの対象（web の `MenuTarget` と同じ）。 */
export type MenuTarget =
  | { kind: "pane"; paneId: string }
  | { kind: "tab"; tabId: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "group"; groupId: string }
  | { kind: "global" };

export interface ContextMenuState {
  target: MenuTarget;
  /** 開いた位置（外側の端末の桁・行）。 */
  at: { x: number; y: number };
}

export interface Toast {
  id: number;
  message: string;
}

/** 知らせを出しておく時間。 */
export const TOAST_MS = 4000;

export class UiState {
  dialogContext: DialogContext | null = null;
  /** ダイアログを開く前に焦点のあった pane（閉じたら戻す。web の `preDialogFocusPaneId`）。 */
  preDialogFocusPaneId: string | null = null;
  contextMenu: ContextMenuState | null = null;
  /** navigate モードで選んでいる workspace（web の `navigateSelection`）。 */
  navigateSelection: string | null = null;
  /** navigate モードでメニューを開く求め（サイドバーの描画が位置を決めて開く）。 */
  navigateMenuRequested = false;
  toasts: Toast[] = [];
  private nextToastId = 1;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly model: SessionModel,
    private readonly setTimer: (fn: () => void, ms: number) => void = (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
    },
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** ダイアログかメニューが開いている（その間のキー・ホイール・ドラッグは pane へ流さない。AC-I5）。 */
  get overlayOpen(): boolean {
    return this.dialogContext !== null || this.contextMenu !== null;
  }

  openDialogWithContext(ctx: DialogContext): void {
    // 開いているメニューは閉じる（オーバーレイは 1 つずつ。architecture「状態遷移」）。
    this.contextMenu = null;
    // 別のダイアログから置き換えるとき（確認 → 一覧へ戻る等）は、最初の戻り先を保つ。
    if (this.dialogContext === null) this.preDialogFocusPaneId = this.model.focusedPaneId;
    this.dialogContext = ctx;
    this.emit();
  }

  /** ダイアログを閉じる（確定・取り消しのどちらでも）。開く前の pane へ焦点を戻す（AC-I4）。 */
  closeDialog(): void {
    const back = this.preDialogFocusPaneId;
    this.dialogContext = null;
    this.preDialogFocusPaneId = null;
    if (back && this.model.panes.has(back) && back !== this.model.focusedPaneId)
      this.model.focusPane(back);
    this.emit();
  }

  /** 開いている間に戻り先の pane が閉じられたら、戻す先を差し替える（web の D97）。 */
  retargetPreDialogFocus(paneId: string | null): void {
    this.preDialogFocusPaneId = paneId;
  }

  openContextMenu(target: MenuTarget, at: { x: number; y: number }): void {
    if (this.dialogContext !== null) return;
    this.contextMenu = { target, at };
    this.emit();
  }

  closeContextMenu(): void {
    if (this.contextMenu === null) return;
    this.contextMenu = null;
    this.emit();
  }

  setNavigateSelection(workspaceId: string | null): void {
    this.navigateSelection = workspaceId;
    this.emit();
  }

  requestNavigateMenu(): void {
    this.navigateMenuRequested = true;
    this.emit();
  }

  clearNavigateMenuRequest(): void {
    this.navigateMenuRequested = false;
  }

  toast(message: string): number {
    const id = this.nextToastId++;
    this.toasts = [...this.toasts, { id, message }].slice(-3);
    this.emit();
    this.setTimer(() => this.dismissToast(id), TOAST_MS);
    return id;
  }

  dismissToast(id: number): void {
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.id !== id);
    if (this.toasts.length !== before) this.emit();
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}
