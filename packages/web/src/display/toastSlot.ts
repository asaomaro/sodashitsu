/**
 * 知らせ（トースト）の縦の位置（20261008-display-layout の design「知らせの位置」。純粋）。
 * 表示の面の固定の部品（見出し・トレイ・帯の行のアプリの部分。`[data-display-chrome]`）が、下・左・窓の中にも来るので、「右下へ寄せる」だけでは重なる。
 * 知らせの帯（右の縁の `[stripLeft, stripRight]`）と横に重なる固定の部品を避けて、縦の空きから選ぶ。
 */
export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ToastSlotInput {
  viewportH: number;
  stripLeft: number;
  stripRight: number;
  chrome: readonly SlotRect[];
  /** 知らせの並びの、今の高さ。 */
  need: number;
  margin: number;
}
export interface ToastSlot {
  top: number;
  maxHeight: number;
}

/** 空きの区間 `[start, end)` を、`[margin, viewportH − margin]` から、帯と重なる固定の部品を引いて作る（上から順）。 */
export function freeIntervals(a: Pick<ToastSlotInput, "viewportH" | "stripLeft" | "stripRight" | "chrome" | "margin">): { start: number; end: number }[] {
  const lo = a.margin;
  const hi = a.viewportH - a.margin;
  const blocks = a.chrome
    .filter((r) => r.w > 0 && r.h > 0 && r.x < a.stripRight && r.x + r.w > a.stripLeft)
    .map((r) => ({ start: Math.max(lo, r.y), end: Math.min(hi, r.y + r.h) }))
    .filter((b) => b.end > b.start)
    .sort((x, y) => x.start - y.start);
  const out: { start: number; end: number }[] = [];
  let cursor = lo;
  for (const b of blocks) {
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (hi > cursor) out.push({ start: cursor, end: hi });
  return out;
}

/**
 * 下から見て、高さが `need` 以上の最初の空きの区間を選ぶ。無ければ、いちばん高い区間。空きが 1 つも無ければ画面の全体（重ねるしかない）。
 * `top`・`maxHeight` はその区間（知らせは区間の下端に寄せ、区間を超える分は区間の中でスクロールする）。
 */
export function pickToastSlot(a: ToastSlotInput): ToastSlot {
  const free = freeIntervals(a);
  for (let i = free.length - 1; i >= 0; i--) {
    const f = free[i]!;
    if (f.end - f.start >= a.need) return { top: f.start, maxHeight: f.end - f.start };
  }
  let best: { start: number; end: number } | null = null;
  for (const f of free) if (best === null || f.end - f.start > best.end - best.start) best = f;
  if (best) return { top: best.start, maxHeight: best.end - best.start };
  return { top: a.margin, maxHeight: Math.max(0, a.viewportH - 2 * a.margin) };
}
