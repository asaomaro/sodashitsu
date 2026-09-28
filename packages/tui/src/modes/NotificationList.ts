import type { KeyInput } from "@sodashitsu/client-core";
import type { UiState } from "../model/UiState.js";
import type { NotificationController } from "../notify/NotificationController.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { truncate } from "../render/width.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isEnter,
  isEsc,
  isUp,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

const KIND_LABEL = { blocked: "入力待ち", done: "完了" } as const;

/**
 * 未処理の知らせの一覧（端末版だけ。design「modes/」の「通知の一覧」）。新しいものが上。Enter・クリックでその対象へ移り（`prefix+o` と同じく
 * 一覧から外す）、Delete で外す。Esc で閉じる。
 */
export class NotificationList implements Overlay {
  private selected = 0;
  private rect: Rect | null = null;
  private rowsTop = 0;
  private visible = 0;

  constructor(
    private readonly ui: UiState,
    private readonly notify: NotificationController,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private rows() {
    return [...this.notify.queued].reverse();
  }

  handleKey(k: KeyInput): void {
    const rows = this.rows();
    if (isEsc(k)) return this.cancel();
    if (rows.length === 0) return;
    // 開いている間に行き先が減る（ほかで片付けた・pane が閉じた）ことがあるので、毎回収める。
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    if (isDown(k)) this.selected = (this.selected + 1) % rows.length;
    else if (isUp(k)) this.selected = (this.selected - 1 + rows.length) % rows.length;
    else if (isEnter(k)) this.open(this.selected);
    else if (k.key === "Delete" || k.key === "Backspace" || k.key === "d") {
      const row = rows[this.selected];
      if (row) this.notify.dismiss(row.key);
      this.selected = Math.max(0, Math.min(this.selected, this.rows().length - 1));
    }
  }

  private open(index: number): void {
    const row = this.rows()[index];
    if (!row) return;
    this.ui.closeDialog();
    this.notify.focusNotification(row.key);
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0) {
      const i = ev.y - this.rowsTop;
      if (i >= 0 && i < this.visible && i < this.rows().length) this.open(i);
    } else if (ev.action === "wheel") {
      const n = this.rows().length;
      if (n > 0)
        this.selected = Math.max(0, Math.min(n - 1, this.selected + (ev.button === 65 ? 1 : -1)));
    }
    return true;
  }

  cancel(): void {
    this.ui.closeDialog();
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const rows = this.rows();
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    const r = centeredRect(grid, Math.min(80, grid.w - 2), Math.max(1, rows.length) + 4);
    this.rect = r;
    const inner = drawBox(grid, r, c, `知らせ（${rows.length} 件）`);
    this.rowsTop = inner.y;
    this.visible = Math.max(0, inner.h - 1);
    if (rows.length === 0) grid.text(inner.x, inner.y, "未処理の知らせはありません。", c.dim, c.bg);
    rows.slice(0, this.visible).forEach((q, i) => {
      const on = i === this.selected;
      const bg = on ? c.active : c.bg;
      grid.fill({ x: inner.x, y: inner.y + i, w: inner.w, h: 1 }, c.fg, bg);
      const age = Math.max(0, Math.round((this.now() - q.at) / 60000));
      const head = `${KIND_LABEL[q.kind]}  ${age === 0 ? "いま" : `${age} 分前`}  `;
      const w = grid.text(inner.x, inner.y + i, head, c.dim, bg, 0);
      grid.text(
        inner.x + w,
        inner.y + i,
        truncate(q.label, inner.w - w),
        c.fg,
        bg,
        on ? ATTR.bold : 0,
      );
    });
    grid.text(
      inner.x,
      inner.y + inner.h - 1,
      truncate("Enter で移る・Delete で外す・Esc で閉じる", inner.w),
      c.dim,
      c.bg,
    );
    return hiddenCursor();
  }
}
