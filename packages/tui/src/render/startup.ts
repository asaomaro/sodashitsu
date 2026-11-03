import { Grid } from "./Screen.js";
import { hexColor, type ThemeColors } from "./color.js";
import { stringWidth } from "./width.js";

// 操舵室アイコンの舵輪と端末の >_。画像や外部プログラムは使わない。
const WHEEL = [
  "          |          ",
  "    \\  .--+--.  /    ",
  "     \\/   |   \\/     ",
  "     /     |     \\    ",
  " ---+----[>_]----+--- ",
  "     \\     |     /    ",
  "     /\\   |   /\\     ",
  "    /  '--+--'  \\    ",
  "          |          ",
];

/** 接続を待つ初回の画面。Grid の制限内に描き、小さい端末で折り返さない。 */
export function drawStartup(grid: Grid, theme: ThemeColors): void {
  const bg = theme.ground("--soda-bg"), fg = theme.ui("--soda-fg");
  const gold = hexColor("#c8923a"), cyan = hexColor("#2bd1b8");
  grid.fill({ x: 0, y: 0, w: grid.w, h: grid.h }, fg, bg);
  const full = grid.w >= 25 && grid.h >= 14;
  const lines = full ? [...WHEEL, "", "Sodashitsu / 操舵室", "接続しています…"] : ["Sodashitsu >_", "接続しています…"];
  const top = Math.max(0, Math.floor((grid.h - lines.length) / 2));
  for (const [i, line] of lines.entries()) {
    if (top + i >= grid.h) break;
    const width = full && i < WHEEL.length ? 21 : stringWidth(line);
    const x = Math.max(0, Math.floor((grid.w - width) / 2));
    grid.text(x, top + i, line, full && i < WHEEL.length ? gold : fg, bg);
    const prompt = line.indexOf(">_");
    if (prompt >= 0) grid.text(x + prompt, top + i, ">_", cyan, bg, 0, Math.max(0, grid.w - x - prompt));
  }
}
