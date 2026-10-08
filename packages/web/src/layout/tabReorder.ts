/**
 * tab バーのドラッグでの並べ替えの計算（20261008-web-tab-dnd。design「インターフェース / データ構造」）。
 * DOM に触らない純関数（`term/paneDragZone.ts` と同じ慣習）。
 */

/** ドラッグを始める動きの距離（`PaneFrame.vue` `DRAG_THRESHOLD_PX` と同じ）。 */
export const TAB_DRAG_THRESHOLD_PX = 6;
/** 列の端からこの幅の内側にいると自動スクロールする。 */
export const TAB_EDGE_SCROLL_PX = 24;
/** 自動スクロールの 1 フレームの量（px）。 */
export const TAB_EDGE_SCROLL_STEP = 8;

export interface TabRect {
  id: string;
  left: number;
  right: number;
}

/**
 * 入る位置（スロット）。0〜n。i は「i 番目の tab の前」、n は「末尾の後」。
 * x が tab の中央より左ならその tab の前。
 */
export function slotAt(tabs: readonly TabRect[], x: number): number {
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i]!;
    if (x < (t.left + t.right) / 2) return i;
  }
  return tabs.length;
}

/**
 * スロットへ入れるための `tab.move` の手順。順が変わらない（slot が from か from+1）・
 * draggedId が無い・slot が範囲外なら null。`count` は 1 以上 n-1 以下で、端を越えて回らない。
 */
export function reorderSteps(
  ids: readonly string[],
  draggedId: string,
  slot: number,
): { direction: "previous" | "next"; count: number; toIndex: number } | null {
  const from = ids.indexOf(draggedId);
  if (from < 0) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot > ids.length) return null;
  if (slot === from || slot === from + 1) return null;
  const toIndex = slot > from ? slot - 1 : slot;
  return { direction: toIndex > from ? "next" : "previous", count: Math.abs(toIndex - from), toIndex };
}

/** 列の端に近いときのスクロール量（-STEP・0・+STEP）。 */
export function edgeScrollDelta(row: { left: number; right: number }, x: number): number {
  if (x < row.left + TAB_EDGE_SCROLL_PX) return -TAB_EDGE_SCROLL_STEP;
  if (x > row.right - TAB_EDGE_SCROLL_PX) return TAB_EDGE_SCROLL_STEP;
  return 0;
}
