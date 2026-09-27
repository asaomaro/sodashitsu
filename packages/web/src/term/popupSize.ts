import {
  parsePopupDimension,
  POPUP_RUN_SIZE_MAX,
  POPUP_RUN_SIZE_MIN,
  type PopupDimension,
} from "@sodashitsu/protocol";

/** popup の端末の最小（列・行）。herdr は外枠 6×4（`popup_size.rs`）だが、見出しの行がある本製品では端末そのものの最小にする。 */
export const POPUP_MIN_COLS = 10;
export const POPUP_MIN_ROWS = 3;
/** サーバが受ける範囲（`CommandRunParams` の cols・rows。protocol の定数を使う）。 */
const SERVER_MIN = POPUP_RUN_SIZE_MIN;
const SERVER_MAX = POPUP_RUN_SIZE_MAX;

function resolveOne(dim: PopupDimension | undefined, available: number, min: number): number {
  const parsed = dim === undefined ? null : parsePopupDimension(dim);
  let v: number;
  if (parsed === null)
    v = Math.floor(available / 2); // 省略（または読めない値）は半分（herdr・tmux と同じ）
  else if (parsed.kind === "cells") v = parsed.value;
  else v = Math.floor((available * parsed.value) / 100);
  v = Math.max(v, min);
  v = Math.min(v, available); // はみ出さない（領域が最小より小さいときは領域を優先する）
  return Math.min(SERVER_MAX, Math.max(SERVER_MIN, v));
}

/**
 * 独自コマンドの popup の端末の大きさ（20260927-custom-command-keys）。`area` は popup の端末に使える列数・行数（pane の領域から、枠と見出しの分を
 * 呼び出し側が差し引いた値）。幅・高さは省略で半分・数はセル・`"N%"` は割合（切り捨て）。最小 10×3、最大は領域。最後にサーバの範囲（2〜500）へ収める。
 */
export function popupCells(
  width: PopupDimension | undefined,
  height: PopupDimension | undefined,
  area: { cols: number; rows: number },
): { cols: number; rows: number } {
  return {
    cols: resolveOne(width, area.cols, POPUP_MIN_COLS),
    rows: resolveOne(height, area.rows, POPUP_MIN_ROWS),
  };
}
