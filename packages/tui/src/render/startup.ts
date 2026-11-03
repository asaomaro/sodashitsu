import { Grid } from "./Screen.js";
import { hexColor, type ThemeColors } from "./color.js";
import { stringWidth } from "./width.js";

// 公式アイコン（64×64）の輪・8本のスポーク・色分けを、空白セルの背景色で表す。
// 端末のセルの実寸（未取得時は縦横比2.2）に合わせて行数を決める。
function wheelColor(x: number, y: number): string | null {
  const dx = x - 32, dy = y - 32, r = Math.hypot(dx, dy);
  if (r <= 10.8) return r >= 8.2 ? "#c8923a" : "#0f2230";
  if (r >= 21 && r <= 25) return "#c8923a";
  // 奇数行の中央だけを横スポークにし、太さを1行に揃える。
  const spoke = Math.abs(dy) < 0.001
    || Math.min(Math.abs(dx), Math.abs(dx - dy) / Math.SQRT2, Math.abs(dx + dy) / Math.SQRT2) <= 1.5;
  if (r <= 30 && spoke) return "#c8923a";
  if (r <= 23) return dx >= 0 && dy < 0 && -dy >= dx ? "#2bd1b8" : "#1d5d6e";
  return null;
}

/** 接続を待つ初回の画面。小さい端末では短縮し、折り返さない。 */
export function drawStartup(grid: Grid, theme: ThemeColors, cellAspect = 2.2): void {
  const bg = theme.ground("--soda-bg"), fg = theme.ui("--soda-fg");
  const cyan = hexColor("#2bd1b8"), hub = hexColor("#0f2230");
  grid.fill({ x: 0, y: 0, w: grid.w, h: grid.h }, fg, bg);
  const aspect = Number.isFinite(cellAspect) && cellAspect >= 1 && cellAspect <= 4 ? cellAspect : 2.2;
  const oddHeight = (w: number) => 2 * Math.round((w / aspect - 1) / 2) + 1;
  const size = [40, 32, 24].find(w => grid.w >= w + 4 && grid.h >= oddHeight(w) + 3) ?? 0;
  const height = size ? oddHeight(size) : 0;
  const top = Math.max(0, Math.floor((grid.h - (size ? height + 3 : 2)) / 2));
  if (size) {
    const left = Math.floor((grid.w - size) / 2);
    for (let y = 0; y < height; y++) for (let x = 0; x < size; x++) {
      const color = wheelColor((x + 0.5) * 64 / size, (y + 0.5) * 64 / height);
      if (color) grid.set(left + x, top + y, " ", 1, fg, hexColor(color));
    }
    grid.text(left + size / 2 - 1, top + Math.floor(height / 2), ">_", cyan, hub);
  }
  const lines = size ? ["Sodashitsu / 操舵室", "接続しています…"] : ["Sodashitsu >_", "接続しています…"];
  for (const [i, line] of lines.entries()) {
    const y = top + (size ? height + 1 : 0) + i;
    if (y >= grid.h) break;
    const x = Math.max(0, Math.floor((grid.w - stringWidth(line)) / 2));
    grid.text(x, y, line, fg, bg);
    if (!size && i === 0) {
      const prompt = x + line.indexOf(">_");
      grid.text(prompt, y, ">_", cyan, bg, 0, Math.max(0, grid.w - prompt));
    }
  }
}
