import { z } from "zod";

/**
 * 端末の大きさの上限（20260927-server-size-input-limits の design・decisions D2）。`/ws` から届く `cols/rows`
 * （`client.view`・`pane.attach`・`pane.attach_resize`）はサーバのスキーマがこれで断り、ブラウザと `sodactl pane attach` は
 * `clampTerminalSize` で丸めてから送る。値は herdr のクライアントの画面の上限（1 辺 4096・1,000,000 セル）と同じ。
 * 上限が無いと、1 通の要求でサーバのミラー（headless の xterm）が巨大な画面をその場で確保して落ち、全 pane を巻き込む。
 * SNAPSHOT のフレームは大きさを u16 で運ぶので、この上限はその内側に収まる。
 */
export const TERMINAL_SIZE_MAX = 4096;
/** `cols × rows` の上限（1,000,000 セル。1000×1000 はちょうど上限で通る）。 */
export const TERMINAL_CELLS_MAX = 1_000_000;
/** `client.view` の `visible` の件数の上限（herdr の描画の `MAX_PANES` と同じ）。 */
export const VIEW_VISIBLE_PANES_MAX = 4096;

/** 端末の 1 辺（1〜`TERMINAL_SIZE_MAX` の整数）。 */
export const terminalDimension = z.number().int().min(1).max(TERMINAL_SIZE_MAX);

/** `cols × rows` が面積の上限以下か（スキーマの refine に使う）。 */
export function withinCellLimit(v: { cols: number; rows: number }): boolean {
  return v.cols * v.rows <= TERMINAL_CELLS_MAX;
}

/** refine のメッセージ（`invalid_params` の message に載る）。 */
export const CELL_LIMIT_MESSAGE = `cols × rows exceeds ${TERMINAL_CELLS_MAX} cells`;

/**
 * 測った大きさを上限の内側に丸める（ブラウザ・`sodactl pane attach` が送る前に使う）。各辺は 1〜`TERMINAL_SIZE_MAX` の整数（切り捨て。
 * NaN は 1・+∞ は上限）にし、面積が上限を超えるなら幅を保って行を減らす。
 */
export function clampTerminalSize(cols: number, rows: number): { cols: number; rows: number } {
  const c = clampDimension(cols);
  let r = clampDimension(rows);
  if (c * r > TERMINAL_CELLS_MAX) r = Math.max(1, Math.floor(TERMINAL_CELLS_MAX / c));
  return { cols: c, rows: r };
}

function clampDimension(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.min(TERMINAL_SIZE_MAX, Math.max(1, Math.floor(n)));
}
