import type { DisplayState } from "@sodashitsu/protocol";
import type { ThemeColors } from "../color.js";
import { ATTR } from "../color.js";
import type { Grid, Rect } from "../Screen.js";
import { truncate } from "../width.js";
import { ALL_SIDES, type PaneSides } from "../../layout/computeLayout.js";
import { glyphFor, stateColor } from "./context.js";

export interface FrameInfo {
  name: string;
  state: DisplayState | null;
  focused: boolean;
  /** pane の大きさが割り付けと違う（右下に `⋯`。design「pane の大きさ」）。 */
  cropped: boolean;
  /** 状態を記号でも示すか（共有の設定 `statusSymbols`。省略は入）。 */
  symbols?: boolean;
}

/**
 * pane の枠（1 桁/1 行の罫線）。上辺に状態の記号と pane の名前。焦点の pane は `--soda-pane-current`（web の選ばれている pane の枠）で描く。
 */
export function paintFrame(
  grid: Grid,
  frame: Rect,
  info: FrameInfo,
  theme: ThemeColors,
  sides: PaneSides = ALL_SIDES,
): void {
  if (frame.w < 2 || frame.h < 2) return;
  const bg = theme.ground("--soda-bg");
  const color = info.focused ? theme.ui("--soda-pane-current") : theme.ui("--soda-menu-border");
  const attrs = info.focused ? ATTR.bold : 0;
  const { x, y, w, h } = frame;
  const right = x + w - 1;
  const bottom = y + h - 1;
  if (sides.top) for (let i = x; i <= right; i++) grid.set(i, y, "─", 1, color, bg, attrs);
  if (sides.bottom) for (let i = x; i <= right; i++) grid.set(i, bottom, "─", 1, color, bg, attrs);
  if (sides.left) for (let j = y; j <= bottom; j++) grid.set(x, j, "│", 1, color, bg, attrs);
  if (sides.right) for (let j = y; j <= bottom; j++) grid.set(right, j, "│", 1, color, bg, attrs);
  // 角（2 つの辺が会うところだけ）。
  const corner = (cx: number, cy: number, ch: string, a: boolean, b: boolean): void => {
    if (a && b) grid.set(cx, cy, ch, 1, color, bg, attrs);
  };
  corner(x, y, "┌", sides.top, sides.left);
  corner(right, y, "┐", sides.top, sides.right);
  corner(x, bottom, "└", sides.bottom, sides.left);
  if (sides.bottom && sides.right)
    grid.set(right, bottom, info.cropped ? "⋯" : "┘", 1, color, bg, attrs);
  if (!sides.top) return; // 名前は上辺に（上辺が無ければ出さない。herdr と同じ）

  // 上辺の名前：`┌─ ◐ name ─…┐`
  let cx = x + (sides.left ? 2 : 1);
  const limit = right - 1;
  if (cx >= limit) return;
  cx += grid.text(cx, y, " ", color, bg, 0, limit - cx);
  const glyph = glyphFor(info.state, info.symbols !== false);
  if (glyph !== "" && cx + 2 <= limit) {
    cx += grid.text(cx, y, glyph, stateColor(theme, info.state), bg, 0, limit - cx);
    cx += grid.text(cx, y, " ", color, bg, 0, limit - cx);
  }
  const room = limit - cx - 1;
  if (room <= 0) return;
  cx += grid.text(
    cx,
    y,
    truncate(info.name, room),
    info.focused ? theme.ui("--soda-fg") : color,
    bg,
    attrs,
    room,
  );
  grid.text(cx, y, " ", color, bg, 0, limit - cx);
}
