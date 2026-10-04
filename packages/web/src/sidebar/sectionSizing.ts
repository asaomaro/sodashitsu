/**
 * サイドバーの 2 区画（spaces と agents）の高さの比の計算（20261004-ui-interaction-polish。
 * design「純関数」）。比は spaces の取り分（0〜1）。画面の外へ出ない純関数に切り出して単体テストする
 * （`paneDragZone.ts` と同じ慣習）。
 */
export interface SectionBox {
  /** 2 区画に配れる高さ（px。境目を除く）。 */
  total: number;
  /** spaces の最小の高さ（見出し＋2 行分。フッタを足す）。 */
  minTop: number;
  /** agents の最小の高さ（見出し＋2 行分）。 */
  minBottom: number;
}

/** 比を、どちらの区画も最小を割らない範囲に収める。`total` が最小の合計に足りないときは 0.5。 */
export function clampRatio(ratio: number, box: SectionBox): number {
  const { total, minTop, minBottom } = box;
  if (!(total > 0) || total < minTop + minBottom) return 0.5;
  const lo = minTop / total;
  const hi = 1 - minBottom / total;
  return Math.min(hi, Math.max(lo, ratio));
}

/** 区画の入れ物の上端からのポインタの位置（px）→ 比。 */
export function ratioFromOffset(offsetPx: number, box: SectionBox): number {
  if (!(box.total > 0)) return 0.5;
  return clampRatio(offsetPx / box.total, box);
}

/** キーで 1 段（`deltaPx`。上向きは負）動かす。端で止まる。 */
export function stepRatio(ratio: number, deltaPx: number, box: SectionBox): number {
  if (!(box.total > 0)) return 0.5;
  return clampRatio(ratio + deltaPx / box.total, box);
}

/** 読み上げ用の値（spaces の取り分の百分率。整数）。 */
export function ratioPercent(ratio: number): number {
  return Math.round(ratio * 100);
}
