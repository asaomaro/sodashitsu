import type { KeyInput } from "@sodashitsu/client-core";
import { ATTR, type PackedColor, type ThemeColors } from "../render/color.js";
import type { CursorState, Grid, Rect } from "../render/Screen.js";
import { charWidth, stringWidth, truncate } from "../render/width.js";

/** オーバーレイが受けるマウスの事象（外側の端末の桁・行。0 始まり）。 */
export interface OverlayMouse {
  action: "down" | "up" | "move" | "wheel";
  button: number;
  x: number;
  y: number;
}

export interface OverlayRenderContext {
  grid: Grid;
  theme: ThemeColors;
}

/**
 * オーバーレイ（ダイアログ・メニュー）の部品（20260927-cli-mode の architecture「状態遷移」）。開いている間のキー・マウスはここへ来て、pane へは流れない（AC-I5）。
 * 1 つずつしか開かない（`OverlayHost`）。
 */
export interface Overlay {
  handleKey(k: KeyInput): void;
  handlePaste?(text: string): void;
  /** 内側の事象なら扱って true。外側なら false（押したら閉じる。AC-I1）。 */
  handleMouse?(ev: OverlayMouse): boolean;
  /** 描く。入力欄があれば本物のカーソルの位置を返す（無ければ隠したカーソル）。 */
  render(ctx: OverlayRenderContext): CursorState | null;
  /** 外側を押した・Esc で閉じる（取り消し）。 */
  cancel(): void;
}

export interface DialogColors {
  bg: PackedColor;
  fg: PackedColor;
  border: PackedColor;
  active: PackedColor;
  accent: PackedColor;
  accentFg: PackedColor;
  dim: PackedColor;
  warn: PackedColor;
}

export function dialogColors(theme: ThemeColors): DialogColors {
  return {
    bg: theme.ui("--soda-menu-bg"),
    fg: theme.ui("--soda-menu-fg"),
    border: theme.ui("--soda-menu-border"),
    active: theme.ui("--soda-menu-active-bg"),
    accent: theme.ui("--soda-accent"),
    accentFg: theme.ui("--soda-accent-fg"),
    dim: theme.ui("--soda-state-idle"),
    warn: theme.ui("--soda-warn-fg"),
  };
}

/** 罫線の箱を描き、内側の矩形を返す。`title` は上辺に。 */
export function drawBox(grid: Grid, r: Rect, c: DialogColors, title?: string): Rect {
  grid.fill(r, c.fg, c.bg);
  const right = r.x + r.w - 1;
  const bottom = r.y + r.h - 1;
  for (let x = r.x + 1; x < right; x++) {
    grid.set(x, r.y, "─", 1, c.border, c.bg);
    grid.set(x, bottom, "─", 1, c.border, c.bg);
  }
  for (let y = r.y + 1; y < bottom; y++) {
    grid.set(r.x, y, "│", 1, c.border, c.bg);
    grid.set(right, y, "│", 1, c.border, c.bg);
  }
  grid.set(r.x, r.y, "┌", 1, c.border, c.bg);
  grid.set(right, r.y, "┐", 1, c.border, c.bg);
  grid.set(r.x, bottom, "└", 1, c.border, c.bg);
  grid.set(right, bottom, "┘", 1, c.border, c.bg);
  if (title)
    grid.text(r.x + 2, r.y, ` ${truncate(title, r.w - 6)} `, c.fg, c.bg, ATTR.bold, r.w - 4);
  return { x: r.x + 2, y: r.y + 1, w: Math.max(0, r.w - 4), h: Math.max(0, r.h - 2) };
}

/** 画面の真ん中に置く箱の矩形（画面より大きくしない）。 */
export function centeredRect(grid: Grid, w: number, h: number): Rect {
  const width = Math.max(10, Math.min(w, grid.w - 2));
  const height = Math.max(3, Math.min(h, grid.h - 2));
  return {
    x: Math.floor((grid.w - width) / 2),
    y: Math.floor((grid.h - height) / 2),
    w: width,
    h: height,
  };
}

/** 桁数 `width` で折り返す（日本語は語の区切りが無いので文字単位）。 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [];
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    let w = 0;
    for (const ch of para) {
      const cw = charWidth(ch.codePointAt(0)!);
      if (w + cw > width) {
        lines.push(line);
        line = "";
        w = 0;
      }
      line += ch;
      w += cw;
    }
    lines.push(line);
  }
  return lines;
}

export function inside(r: Rect | null, x: number, y: number): boolean {
  return r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** 本物のカーソルを隠す（入力欄の無いオーバーレイ）。 */
export function hiddenCursor(): CursorState {
  return { x: 0, y: 0, visible: false, style: "block", blink: false };
}

/** ボタンの並び（`[ キャンセル ]  [ 閉じる ]`）を描き、各ボタンの矩形を返す。 */
export function drawButtons(
  grid: Grid,
  x: number,
  y: number,
  labels: string[],
  selected: number,
  c: DialogColors,
): Rect[] {
  const rects: Rect[] = [];
  let cx = x;
  labels.forEach((label, i) => {
    const text = `[ ${label} ]`;
    const w = stringWidth(text);
    const on = i === selected;
    grid.text(cx, y, text, on ? c.accentFg : c.fg, on ? c.accent : c.bg, on ? ATTR.bold : 0);
    rects.push({ x: cx, y, w, h: 1 });
    cx += w + 2;
  });
  return rects;
}

/** キーが「確定」（Enter）か。 */
export const isEnter = (k: KeyInput): boolean => k.key === "Enter" && !k.ctrl && !k.alt;
export const isEsc = (k: KeyInput): boolean => k.key === "Escape";
export const isDown = (k: KeyInput): boolean =>
  k.key === "ArrowDown" || (k.key === "j" && !k.ctrl) || (k.key === "n" && k.ctrl);
export const isUp = (k: KeyInput): boolean =>
  k.key === "ArrowUp" || (k.key === "k" && !k.ctrl) || (k.key === "p" && k.ctrl);
