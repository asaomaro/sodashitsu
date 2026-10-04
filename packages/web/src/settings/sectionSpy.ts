/**
 * 設定画面のサイドメニューの「今の節」の計算（20261004-settings-side-menu）。DOM に触らない純関数。
 * 式は ask-form の目次（`third_party/ask-form/ask-form.js` の `spy()`・`go()`・`step()`）の決まりを、設定の形
 * （スクロールの入れ物が `<dialog>` 自身で、上に題名の行が固定される）に合わせて移したもの。
 * happy-dom は大きさが全部 0 なので、式をここに切り出して単体で確かめる。
 */

export interface SpyInput {
  /** 各節の見出しの上端（スクロールの入れ物の先頭からの位置。`scrollTop` と同じ座標）。 */
  tops: number[];
  scrollTop: number;
  /** スクロールの入れ物の見えている高さ（`clientHeight`）。 */
  viewHeight: number;
  scrollHeight: number;
  /** 題名の行の高さ（その下が「見えている範囲」の上端）。 */
  headerHeight: number;
}

/** 線を引く位置の基準の余裕。着く位置（見出しの 8px 上）との間に約 30px の余裕を持たせ、`scrollTop` の丸めで前の節に戻らないようにする。 */
const LINE_OFFSET = 40;
/** 着く位置と見出しの間（見出しが題名の行のすぐ下に来るように）。 */
const LAND_GAP = 8;
/** 「見えている」の判定で、題名の行の下に隠れた分を許す幅。 */
const VISIBLE_SLACK = 2;

const maxScroll = (i: SpyInput): number => Math.max(0, i.scrollHeight - i.viewHeight);

/**
 * スクロールの位置から決まる今の節（0 始まり）。節が無ければ -1。
 * 残りが 1 画面を切ると線が上端から下端へ下がり、いちばん下では最後の節になる。スクロールできないときは 0。
 */
export function sectionAtScroll(i: SpyInput): number {
  if (i.tops.length === 0) return -1;
  const max = maxScroll(i);
  if (max <= 0) return 0;
  const h = i.viewHeight;
  const tail = Math.min(h, max);
  const k0 = tail > 0 ? Math.min(1, Math.max(0, (i.scrollTop - (max - tail)) / tail)) : 0;
  const line = i.scrollTop + i.headerHeight + LINE_OFFSET + k0 * (h - i.headerHeight - LINE_OFFSET);
  let cur = 0;
  for (let n = 0; n < i.tops.length; n++) {
    if ((i.tops[n] as number) <= line) cur = n;
  }
  return cur;
}

const inView = (top: number, i: SpyInput): boolean => top >= i.scrollTop + i.headerHeight - VISIBLE_SLACK && top < i.scrollTop + i.viewHeight;

/**
 * 選んだ節 chosen を保つか。(a) その節の見出しが見える範囲にある、または (b) フォーカスのある要素がその節の中にあり、
 * その要素が見える範囲にある、なら chosen。どちらも外れたら null（スクロールの位置で決め直す）。
 * focus: フォーカスのある要素が入っている節の番号と、その要素の上端（`tops` と同じ座標）。無ければ null。
 */
export function keepChosen(chosen: number | null, i: SpyInput, focus: { section: number; top: number } | null): number | null {
  if (chosen === null || chosen < 0 || chosen >= i.tops.length) return null;
  if (inView(i.tops[chosen] as number, i)) return chosen;
  if (focus !== null && focus.section === chosen && inView(focus.top, i)) return chosen;
  return null;
}

/** 次・前の節。端では null。 */
export function stepSection(current: number, delta: 1 | -1, count: number): number | null {
  const next = current + delta;
  return next < 0 || next >= count ? null : next;
}

/** その節へ移るときの `scrollTop`（見出しが題名の行のすぐ下。0 未満・最大を超えない）。最初の節は 0。 */
export function scrollTopFor(index: number, i: SpyInput): number {
  if (index <= 0) return 0;
  const top = i.tops[index];
  if (top === undefined) return 0;
  return Math.min(maxScroll(i), Math.max(0, top - i.headerHeight - LAND_GAP));
}
