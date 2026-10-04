import type { KeyInput } from "@sodashitsu/client-core";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { DialogContext, UiState } from "../model/UiState.js";
import type { ThemeColors } from "../render/color.js";
import type { CursorState, Grid } from "../render/Screen.js";
import { ContextMenu } from "./ContextMenu.js";
import {
  ConfirmDialog,
  isConfirmKind,
  isNameKind,
  ListDialog,
  NameDialog,
  WorktreeCreateDialog,
} from "./dialogs.js";
import { HelpDialog, type HelpGroup } from "./HelpDialog.js";
import { SubagentList } from "./SubagentList.js";
import type { Overlay, OverlayMouse } from "./overlay.js";

export interface OverlayHostDeps {
  ui: UiState;
  model: SessionModel;
  actions: TuiDispatcher;
  helpGroups(): HelpGroup[];
  /** ほかの種類（goto 等。T3 で足す）の部品を作る。作れなければ null（そのダイアログは閉じる）。 */
  extra?(ctx: DialogContext): Overlay | null;
}

/**
 * オーバーレイの持ち主（20260927-cli-mode の architecture「状態遷移」）。`UiState` のダイアログ・メニューに合わせて部品を作り（開いた文脈ごとに 1 回。
 * 入力欄の中身などの状態は部品が持つ）、キー・貼り付け・マウスを渡し、描く。開いている間は pane へ何も流さない（AC-I5）。
 */
export class OverlayHost {
  private current: { key: object; overlay: Overlay } | null = null;

  constructor(private readonly deps: OverlayHostDeps) {}

  get active(): boolean {
    return this.overlay() !== null;
  }

  /** 今の文脈の部品（無ければ作る）。 */
  overlay(): Overlay | null {
    const { ui } = this.deps;
    const key: object | null = ui.contextMenu ?? ui.dialogContext;
    if (this.current && this.current.key !== key) {
      // 置き換わった・閉じた：前の部品を片付ける（別のダイアログが popup を置き換えたら popup を止める。web の CommandPopup.vue の watch(ctx) と同じ）。
      const prev = this.current.overlay;
      this.current = null;
      prev.dispose?.();
    }
    if (key === null) return null;
    if (this.current?.key === key) return this.current.overlay;
    const overlay = ui.contextMenu
      ? new ContextMenu(ui.contextMenu, this.deps)
      : this.create(ui.dialogContext!);
    if (!overlay) {
      ui.closeDialog();
      this.current = null;
      return null;
    }
    this.current = { key, overlay };
    return overlay;
  }

  private create(ctx: DialogContext): Overlay | null {
    const deps = this.deps;
    if (isNameKind(ctx)) return new NameDialog(ctx, deps);
    if (isConfirmKind(ctx)) return new ConfirmDialog(ctx, deps);
    if (ctx.kind === "worktreeOpen" || ctx.kind === "addToGroup") return new ListDialog(ctx, deps);
    if (ctx.kind === "worktreeCreate") return new WorktreeCreateDialog(ctx, deps);
    if (ctx.kind === "help") return new HelpDialog(deps.ui, () => deps.helpGroups());
    if (ctx.kind === "subagents") return new SubagentList(ctx.paneId, deps.ui, deps.model);
    return deps.extra?.(ctx) ?? null;
  }

  handleKey(k: KeyInput, raw = ""): void {
    const o = this.overlay();
    if (!o) return;
    if (o.handleKeyEvent) o.handleKeyEvent({ key: k, raw });
    else o.handleKey(k);
  }

  handlePaste(text: string): void {
    this.overlay()?.handlePaste?.(text);
  }

  /** 外側を押したら取り消して閉じる（AC-I1）。内側・外側のどちらでも pane へは流さない。 */
  handleMouse(ev: OverlayMouse): void {
    const o = this.overlay();
    if (!o) return;
    const insideOverlay = o.handleMouse?.(ev) ?? false;
    if (!insideOverlay && ev.action === "down") o.cancel();
  }

  render(grid: Grid, theme: ThemeColors): CursorState | null {
    const o = this.overlay();
    return o ? o.render({ grid, theme }) : null;
  }
}
