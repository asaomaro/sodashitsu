/**
 * 表示の面の大きさの丸め（純粋。20261007-soda-extensions の design「ブラウザ」「パネルの幅のつまみ」）。
 * パネルの開閉・幅の確定で pane の列数が変わるので、端末を最低 40 列は残すよう、パネルの幅に範囲を設ける。
 */

export const PANEL_MIN_PX = 160;
/** パネルを置いても端末に残す最小の列数。 */
export const TERMINAL_MIN_COLS = 40;
/** セルの幅が取れないときの値（px）。 */
export const DEFAULT_CELL_WIDTH_PX = 9;
/** 帯の合計の高さの上限は、pane の高さのこの割合。 */
export const BANDS_MAX_RATIO = 1 / 3;
/** 「ほか N 件」の 1 行の高さ。 */
export const BANDS_MORE_ROW_PX = 20;

/** パネルの幅の範囲。最大が最小を下回る（pane が狭い）なら `null`＝出せないので自動でたたむ。 */
export function panelWidthRange(paneWidthPx: number, cellWidthPx: number): { min: number; max: number } | null {
  const cell = cellWidthPx > 0 ? cellWidthPx : DEFAULT_CELL_WIDTH_PX;
  const max = Math.floor(Math.min(Math.floor(paneWidthPx / 2), paneWidthPx - TERMINAL_MIN_COLS * cell));
  if (!(max >= PANEL_MIN_PX)) return null;
  return { min: PANEL_MIN_PX, max };
}

/**
 * パネルの幅。元の値は `userPx ?? sizePx`（利用者が変えた幅 ＞ プログラムの `--size`）を、範囲に丸める。範囲が無ければ自動でたたむ。
 */
export function panelWidth(paneWidthPx: number, sizePx: number, cellWidthPx: number, userPx?: number): { width: number; autoCollapsed: boolean } {
  const range = panelWidthRange(paneWidthPx, cellWidthPx);
  if (!range) return { width: 0, autoCollapsed: true };
  const want = userPx ?? sizePx;
  return { width: Math.min(range.max, Math.max(range.min, Math.round(want))), autoCollapsed: false };
}

/**
 * 帯のうち、高さの合計が pane の高さの 3 分の 1 以下に収まる先頭の本数。残りは「ほか N 件」の 1 行にする。
 * 先頭の 1 本も収まらなければ 0 本（全部が「ほか」）。
 */
export function visibleBands(sizes: readonly number[], paneHeightPx: number): { shown: number; hidden: number } {
  const limit = paneHeightPx * BANDS_MAX_RATIO;
  let sum = 0;
  let shown = 0;
  for (const h of sizes) {
    if (sum + h > limit) break;
    sum += h;
    shown++;
  }
  return { shown, hidden: sizes.length - shown };
}
