import { defaultCheckoutPath } from "@sodashitsu/protocol";
import { linkedWorktreeChildrenOf, type KeyInput } from "@sodashitsu/client-core";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { DialogContext, UiState } from "../model/UiState.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { truncate } from "../render/width.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  drawButtons,
  hiddenCursor,
  inside,
  isDown,
  isEnter,
  isEsc,
  isUp,
  wrapText,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import { TextInput } from "./TextInput.js";

export interface DialogDeps {
  ui: UiState;
  model: SessionModel;
  actions: TuiDispatcher;
}

type NameKind = Extract<
  DialogContext,
  {
    kind: "newTab" | "renamePane" | "renameTab" | "renameWorkspace" | "createGroup" | "renameGroup";
  }
>;

const NAME_TITLES: Record<NameKind["kind"], string> = {
  newTab: "新しい tab の名前",
  renamePane: "pane の名前を変更",
  renameTab: "tab の名前を変更",
  renameWorkspace: "workspace の名前を変更",
  createGroup: "新しいグループの名前",
  renameGroup: "グループの名前を変更",
};

export function isNameKind(ctx: DialogContext): ctx is NameKind {
  return ctx.kind in NAME_TITLES;
}

/** 名前の入力欄（web の `NameDialog.vue`）。Enter で確定・Esc で取り消し（AC-I2）。 */
export class NameDialog implements Overlay {
  private readonly input: TextInput;
  /** 開いたときの値（新しい tab は、変えずに確定したら名前を送らない。web の D75）。 */
  private readonly openedWith: string;
  private rect: Rect | null = null;

  constructor(
    private readonly ctx: NameKind,
    private readonly deps: DialogDeps,
  ) {
    this.openedWith = initialName(ctx, deps.model);
    this.input = new TextInput(this.openedWith);
  }

  handleKey(k: KeyInput): void {
    if (isEsc(k)) return this.cancel();
    if (isEnter(k)) return this.confirm();
    this.input.handleKey(k);
  }

  handlePaste(text: string): void {
    this.input.insert(text);
  }

  handleMouse(ev: OverlayMouse): boolean {
    return inside(this.rect, ev.x, ev.y);
  }

  cancel(): void {
    this.deps.ui.closeDialog();
  }

  private confirm(): void {
    const { actions } = this.deps;
    const value = this.input.value;
    switch (this.ctx.kind) {
      case "newTab":
        actions.confirmNewTab(value.trim() === this.openedWith.trim() ? "" : value);
        return;
      case "renamePane":
        actions.confirmRenamePane(value);
        return;
      case "renameTab":
        actions.confirmRenameTab(value);
        return;
      case "renameWorkspace":
        actions.confirmRenameWorkspace(value);
        return;
      case "createGroup":
        actions.confirmCreateGroup(value);
        return;
      case "renameGroup":
        actions.confirmRenameGroup(value);
        return;
    }
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const hint =
      this.ctx.kind === "renameWorkspace"
        ? `${this.ctx.currentAutoLabel ? "いまは自動の名前です。" : ""}空にして確定すると、自動の名前（リポジトリ名かフォルダ名）に戻ります。`
        : "";
    const width = Math.min(60, grid.w - 2);
    const hintLines = hint ? wrapText(hint, width - 4) : [];
    const r = centeredRect(grid, width, 5 + hintLines.length);
    this.rect = r;
    const inner = drawBox(grid, r, c, NAME_TITLES[this.ctx.kind]);
    const field = { x: inner.x, y: inner.y, w: inner.w };
    grid.fill({ ...field, h: 1 }, c.fg, c.active);
    const view = this.input.view(field.w);
    grid.text(field.x, field.y, view.text, c.fg, c.active, 0, field.w);
    hintLines.forEach((l, i) => grid.text(inner.x, inner.y + 1 + i, l, c.dim, c.bg));
    grid.text(
      inner.x,
      inner.y + inner.h - 1,
      "Enter で確定・Esc で取り消し",
      c.dim,
      c.bg,
      0,
      inner.w,
    );
    return { x: field.x + view.cursorCol, y: field.y, visible: true, style: "bar", blink: true };
  }
}

function initialName(ctx: NameKind, model: SessionModel): string {
  if (ctx.kind === "newTab") {
    const ws = model.workspaces.get(ctx.workspaceId);
    return ws ? String(ws.tabIds.length + 1) : "";
  }
  if (ctx.kind === "createGroup") return "";
  return ctx.currentLabel;
}

type ConfirmKind = Extract<
  DialogContext,
  {
    kind:
      | "confirmClose"
      | "confirmReplacePane"
      | "confirmWorktreeRemove"
      | "confirmWorktreeRemoveForce"
      | "confirmStopServer";
  }
>;

export function isConfirmKind(ctx: DialogContext): ctx is ConfirmKind {
  return (
    ctx.kind === "confirmClose" ||
    ctx.kind === "confirmReplacePane" ||
    ctx.kind === "confirmWorktreeRemove" ||
    ctx.kind === "confirmWorktreeRemoveForce" ||
    ctx.kind === "confirmStopServer"
  );
}

/** 確認の文言（web の `ConfirmDialog.vue` と同じ）。 */
export function confirmMessage(ctx: ConfirmKind): string {
  switch (ctx.kind) {
    case "confirmClose":
      return `閉じますか？（${ctx.targets.map((t) => t.type).join("・")}）`;
    case "confirmReplacePane":
      return "ドロップ先の pane はまだ動作中です。閉じてドラッグした pane に置き換えますか？";
    case "confirmWorktreeRemove":
      return ctx.openWorkspaceId
        ? "この worktree は現在 workspace として開いています。workspace を閉じて worktree を削除しますか？"
        : "この worktree を削除しますか？";
    case "confirmStopServer": {
      const which = ctx.remote ? `保存したマシン「${ctx.target}」` : `このマシン（${ctx.target}）`;
      return `${which}の soda serve を止めますか？ そのサーバのすべての pane のプロセスが終わり、繋いでいる画面はすべて切れます。`;
    }
    case "confirmWorktreeRemoveForce":
      return ctx.reason === "locked"
        ? "この worktree はロックされています。ロックを解除せずに強制的に削除しますか？"
        : "この worktree には未コミットの変更が残っています。変更を破棄して削除しますか？";
  }
}

export function confirmLabel(ctx: ConfirmKind): string {
  if (ctx.kind === "confirmStopServer") return "止める";
  return ctx.kind === "confirmWorktreeRemove" || ctx.kind === "confirmWorktreeRemoveForce"
    ? "削除"
    : "閉じる";
}

/**
 * 確認（web の `ConfirmDialog.vue`）。最初に選ばれているのは「キャンセル」。`y` で確定・`n`/Esc で取り消し・←→/Tab でボタン・Enter で選んだボタン。
 * 対象が worktree の自動グループの本体 1 件なら「束ねた worktree も一緒に閉じる」（Space で切り替え。既定オフ）。
 */
export class ConfirmDialog implements Overlay {
  private selected = 0;
  private closeLinked = false;
  private rect: Rect | null = null;
  private buttons: Rect[] = [];
  private checkboxRow = -1;

  constructor(
    private readonly ctx: ConfirmKind,
    private readonly deps: DialogDeps,
  ) {}

  private linkedCount(): number {
    const ctx = this.ctx;
    if (ctx.kind !== "confirmClose" || ctx.targets.length !== 1) return 0;
    const t = ctx.targets[0]!;
    if (t.type !== "workspace") return 0;
    return linkedWorktreeChildrenOf(t.id, [...this.deps.model.workspaces.values()]).length;
  }

  handleKey(k: KeyInput): void {
    if (k.key === "y" || k.key === "Y") return this.confirm();
    if (k.key === "n" || k.key === "N" || isEsc(k)) return this.cancel();
    if (
      k.key === "ArrowLeft" ||
      k.key === "ArrowRight" ||
      k.key === "Tab" ||
      k.key === "h" ||
      k.key === "l"
    ) {
      this.selected = this.selected === 0 ? 1 : 0;
      return;
    }
    if (k.key === " " && this.linkedCount() > 0) {
      this.closeLinked = !this.closeLinked;
      return;
    }
    if (isEnter(k)) {
      if (this.selected === 1) this.confirm();
      else this.cancel();
    }
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0) {
      if (inside(this.buttons[0] ?? null, ev.x, ev.y)) this.cancel();
      else if (inside(this.buttons[1] ?? null, ev.x, ev.y)) this.confirm();
      else if (ev.y === this.checkboxRow && this.linkedCount() > 0)
        this.closeLinked = !this.closeLinked;
    }
    return true;
  }

  cancel(): void {
    this.deps.actions.cancelConfirm();
  }

  private confirm(): void {
    const { actions } = this.deps;
    switch (this.ctx.kind) {
      case "confirmReplacePane":
        actions.confirmReplacePane();
        return;
      case "confirmWorktreeRemove":
        actions.confirmWorktreeRemove();
        return;
      case "confirmWorktreeRemoveForce":
        actions.confirmWorktreeRemoveForce();
        return;
      case "confirmStopServer":
        actions.confirmStopServer();
        return;
      case "confirmClose":
        actions.confirmClose(this.closeLinked);
        return;
    }
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const width = Math.min(64, grid.w - 2);
    const lines = wrapText(confirmMessage(this.ctx), width - 4);
    const linked = this.linkedCount();
    const r = centeredRect(grid, width, lines.length + (linked > 0 ? 2 : 0) + 5);
    this.rect = r;
    const inner = drawBox(grid, r, c, "確認");
    lines.forEach((l, i) => grid.text(inner.x, inner.y + i, l, c.fg, c.bg, 0, inner.w));
    let y = inner.y + lines.length + 1;
    this.checkboxRow = -1;
    if (linked > 0) {
      this.checkboxRow = y;
      grid.text(
        inner.x,
        y,
        `${this.closeLinked ? "[x]" : "[ ]"} 束ねた worktree も一緒に閉じる（${linked} 件）`,
        c.fg,
        c.bg,
        0,
        inner.w,
      );
      y += 2;
    }
    this.buttons = drawButtons(
      grid,
      inner.x,
      Math.min(y, inner.y + inner.h - 1),
      ["キャンセル", confirmLabel(this.ctx)],
      this.selected,
      c,
    );
    return hiddenCursor();
  }
}

interface ListRow {
  label: string;
  meta?: string;
}

/**
 * 選ぶだけの一覧（worktree を開く・グループへ追加）。↑↓/j/k で移動・Enter で確定・Esc で閉じる。worktree の一覧は Delete/Backspace で削除
 * （web の `WorktreeOpenDialog.vue`・`GroupPickerDialog.vue`）。
 */
export class ListDialog implements Overlay {
  private selected = 0;
  private rect: Rect | null = null;
  private rowsTop = 0;
  private scroll = 0;

  constructor(
    private readonly ctx: Extract<DialogContext, { kind: "worktreeOpen" | "addToGroup" }>,
    private readonly deps: DialogDeps,
  ) {}

  private rows(): ListRow[] {
    if (this.ctx.kind === "worktreeOpen")
      return this.ctx.entries.map((e) => ({ label: e.branch ?? "(detached)", meta: e.path }));
    return this.ctx.groups.map((g) => ({ label: g.label }));
  }

  handleKey(k: KeyInput): void {
    const n = this.rows().length;
    if (isEsc(k)) return this.cancel();
    if (isEnter(k)) return this.accept();
    if (isDown(k) && n > 0) this.selected = (this.selected + 1) % n;
    else if (isUp(k) && n > 0) this.selected = (this.selected - 1 + n) % n;
    else if ((k.key === "Delete" || k.key === "Backspace") && this.ctx.kind === "worktreeOpen") {
      const entry = this.ctx.entries[this.selected];
      if (entry) this.deps.actions.removeWorktree(this.ctx.workspaceId, entry.path);
    }
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0) {
      const index = ev.y - this.rowsTop + this.scroll;
      if (index >= 0 && index < this.rows().length && ev.y >= this.rowsTop) {
        this.selected = index;
        this.accept();
      }
    } else if (ev.action === "wheel") {
      const n = this.rows().length;
      if (n > 0)
        this.selected = Math.max(0, Math.min(n - 1, this.selected + (ev.button === 65 ? 1 : -1)));
    }
    return true;
  }

  cancel(): void {
    this.deps.ui.closeDialog();
  }

  private accept(): void {
    if (this.ctx.kind === "worktreeOpen") {
      const entry = this.ctx.entries[this.selected];
      if (entry) this.deps.actions.confirmWorktreeOpen(entry.path);
    } else {
      const group = this.ctx.groups[this.selected];
      if (group) this.deps.actions.confirmAddToGroup(group.id);
    }
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const rows = this.rows();
    const title = this.ctx.kind === "worktreeOpen" ? "worktree を開く" : "グループへ追加";
    const width = Math.min(80, grid.w - 2);
    const r = centeredRect(grid, width, Math.min(rows.length, grid.h - 6) + 4);
    this.rect = r;
    const inner = drawBox(grid, r, c, title);
    const visible = Math.max(1, inner.h - 1);
    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + visible) this.scroll = this.selected - visible + 1;
    this.rowsTop = inner.y;
    for (let i = 0; i < visible && i + this.scroll < rows.length; i++) {
      const row = rows[i + this.scroll]!;
      const on = i + this.scroll === this.selected;
      const bg = on ? c.active : c.bg;
      grid.fill({ x: inner.x, y: inner.y + i, w: inner.w, h: 1 }, c.fg, bg);
      const labelW = grid.text(
        inner.x,
        inner.y + i,
        truncate(row.label, Math.floor(inner.w / 2)),
        c.fg,
        bg,
        on ? ATTR.bold : 0,
      );
      if (row.meta)
        grid.text(
          inner.x + labelW + 2,
          inner.y + i,
          truncate(row.meta, inner.w - labelW - 2),
          c.dim,
          bg,
        );
    }
    const help =
      this.ctx.kind === "worktreeOpen"
        ? "Enter で開く・Delete で削除・Esc で閉じる"
        : "Enter で追加・Esc で閉じる";
    grid.text(inner.x, inner.y + inner.h - 1, help, c.dim, c.bg, 0, inner.w);
    return hiddenCursor();
  }
}

/** worktree の作成（ブランチ名と作成先のプレビュー。web の `WorktreeCreateDialog.vue`）。空では確定しない。 */
export class WorktreeCreateDialog implements Overlay {
  private readonly input: TextInput;
  private rect: Rect | null = null;

  constructor(
    private readonly ctx: Extract<DialogContext, { kind: "worktreeCreate" }>,
    private readonly deps: DialogDeps,
  ) {
    this.input = new TextInput(ctx.info.suggestedBranch);
  }

  handleKey(k: KeyInput): void {
    if (isEsc(k)) return this.cancel();
    if (isEnter(k)) {
      this.deps.actions.confirmWorktreeCreate(this.input.value);
      return;
    }
    this.input.handleKey(k);
  }

  handlePaste(text: string): void {
    this.input.insert(text);
  }

  handleMouse(ev: OverlayMouse): boolean {
    return inside(this.rect, ev.x, ev.y);
  }

  cancel(): void {
    this.deps.ui.closeDialog();
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const r = centeredRect(grid, Math.min(80, grid.w - 2), 7);
    this.rect = r;
    const inner = drawBox(grid, r, c, "新しい worktree のブランチ名");
    grid.fill({ x: inner.x, y: inner.y, w: inner.w, h: 1 }, c.fg, c.active);
    const view = this.input.view(inner.w);
    grid.text(inner.x, inner.y, view.text, c.fg, c.active, 0, inner.w);
    const { worktreeRoot, repoName } = this.ctx.info;
    const preview = `作成先  ${defaultCheckoutPath(worktreeRoot, repoName, this.input.value)}`;
    grid.text(inner.x, inner.y + 2, truncate(preview, inner.w), c.dim, c.bg);
    grid.text(
      inner.x,
      inner.y + inner.h - 1,
      "Enter で作成・Esc で取り消し",
      c.dim,
      c.bg,
      0,
      inner.w,
    );
    return { x: inner.x + view.cursorCol, y: inner.y, visible: true, style: "bar", blink: true };
  }
}
