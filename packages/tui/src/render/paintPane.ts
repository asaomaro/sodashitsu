import type { PaneTerminal } from "../term/PaneTerminal.js";
import { ATTR, type ThemeColors } from "./color.js";
import type { CursorState, Grid, Rect } from "./Screen.js";

/**
 * pane の中身（headless のバッファ）を格子へ描く（20260927-cli-mode の design「pane の大きさ」）。pane の実際の大きさが自分の割り付けと
 * 違えば**左上を合わせて切り取り、余りは背景色で埋める**（herdr と同じ。research F4.6）。右端で切れる全角は空白にする。
 * 焦点の pane なら、見えている範囲にあるカーソルの位置を返す（外なら null）。
 */
export function paintPane(
  grid: Grid,
  term: PaneTerminal,
  content: Rect,
  theme: ThemeColors,
): CursorState | null {
  const buffer = term.term.buffer.active;
  const top = buffer.viewportY;
  const rows = Math.min(content.h, term.rows);
  const cols = Math.min(content.w, term.cols);
  const cell = buffer.getNullCell();
  for (let y = 0; y < rows; y++) {
    const line = buffer.getLine(top + y);
    for (let x = 0; x < cols; x++) {
      const gx = content.x + x;
      const gy = content.y + y;
      const c = line?.getCell(x, cell);
      if (!c) {
        grid.set(gx, gy, " ", 1, theme.paneFg, theme.paneBg);
        continue;
      }
      const width = c.getWidth();
      if (width === 0) continue; // 全角の右半分（左の全角が書いた）
      const fg = theme.paneColor(
        c.isFgDefault() ? 0 : c.isFgPalette() ? 1 : 2,
        c.getFgColor(),
        false,
      );
      const bg = theme.paneColor(
        c.isBgDefault() ? 0 : c.isBgPalette() ? 1 : 2,
        c.getBgColor(),
        true,
      );
      let attrs = 0;
      if (c.isBold()) attrs |= ATTR.bold;
      if (c.isDim()) attrs |= ATTR.dim;
      if (c.isItalic()) attrs |= ATTR.italic;
      if (c.isUnderline()) attrs |= ATTR.underline;
      if (c.isBlink()) attrs |= ATTR.blink;
      if (c.isInverse()) attrs |= ATTR.inverse;
      if (c.isInvisible()) attrs |= ATTR.invisible;
      if (c.isStrikethrough()) attrs |= ATTR.strikethrough;
      if (c.isOverline()) attrs |= ATTR.overline;
      const chars = c.getChars();
      if (width === 2 && x + 1 >= cols) {
        grid.set(gx, gy, " ", 1, fg, bg, attrs); // 切り取りの右端で全角が半分になる
        continue;
      }
      grid.set(gx, gy, chars === "" ? " " : chars, width === 2 ? 2 : 1, fg, bg, attrs);
    }
  }
  // 切り取りの余り（pane が割り付けより小さい）。
  if (cols < content.w)
    grid.fill(
      { x: content.x + cols, y: content.y, w: content.w - cols, h: content.h },
      theme.paneFg,
      theme.paneBg,
    );
  if (rows < content.h)
    grid.fill(
      { x: content.x, y: content.y + rows, w: cols, h: content.h - rows },
      theme.paneFg,
      theme.paneBg,
    );

  const cy = buffer.baseY + buffer.cursorY - top;
  // 行末の折り返し待ち（cursorX が桁数と等しい）は最後の桁に置く。
  const cx = Math.min(buffer.cursorX, term.cols - 1);
  if (cy < 0 || cy >= rows || cx >= cols || content.w === 0 || content.h === 0) return null;
  return {
    x: content.x + cx,
    y: content.y + cy,
    visible: term.cursorVisible,
    style: term.cursorStyle,
    blink: term.cursorBlink,
  };
}

/** pane の大きさが割り付けと違う（切り取っている／余りがある）か。 */
export function isCropped(term: PaneTerminal, content: Rect): boolean {
  return term.cols !== content.w || term.rows !== content.h;
}
