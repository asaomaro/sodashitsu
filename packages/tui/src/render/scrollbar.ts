/*
 * スクロールバーのつまみの位置と、つまみの位置からスクロールの量への換算は herdr（https://github.com/herdrdev/herdr、
 * commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の `src/ui/scrollbar.rs`（`scrollbar_thumb`・`scrollbar_offset_from_row`・
 * `scrollbar_offset_from_drag_row`）を TypeScript へ移したもの（Apache-2.0。ルートの `NOTICE` を参照）。
 */
import type { PaneBox } from "../layout/computeLayout.js";
import type { HeadlessTerminal, PaneTerminal } from "../term/PaneTerminal.js";

/** スクロールの量（herdr の `ScrollMetrics`）。 */
export interface ScrollMetrics {
  /** いちばん上まで遡ったときの、末尾からの行数（＝スクロールバックの行数）。 */
  maxOffsetFromBottom: number;
  /** 今の末尾からの行数（0 は末尾）。 */
  offsetFromBottom: number;
  viewportRows: number;
}

/** 溝（縦 1 桁）の上端の行と高さ。 */
export interface Track {
  y: number;
  h: number;
}

export interface Thumb {
  top: number;
  len: number;
}

/** headless のバッファのスクロールの量。スクロールバックが無ければ null（スクロールバーを出さない。代替画面も）。 */
export function scrollMetricsOf(term: HeadlessTerminal): ScrollMetrics | null {
  const buf = term.buffer.active;
  if (buf.baseY <= 0) return null;
  return {
    maxOffsetFromBottom: buf.baseY,
    offsetFromBottom: Math.max(0, buf.baseY - buf.viewportY),
    viewportRows: term.rows,
  };
}

/** つまみ（溝の中の位置と長さ）。 */
export function scrollbarThumb(m: ScrollMetrics, track: Track): Thumb | null {
  if (m.maxOffsetFromBottom === 0 || track.h <= 0) return null;
  const total = m.maxOffsetFromBottom + m.viewportRows;
  if (total === 0) return null;
  const len = Math.min(track.h, Math.max(1, Math.round((m.viewportRows * track.h) / total)));
  const maxTop = Math.max(0, track.h - len);
  const fromTop = Math.max(0, m.maxOffsetFromBottom - m.offsetFromBottom);
  const top =
    maxTop === 0
      ? 0
      : Math.min(maxTop, Math.max(0, Math.round((fromTop * maxTop) / m.maxOffsetFromBottom)));
  return { top: track.y + top, len };
}

function offsetFromThumbTop(m: ScrollMetrics, track: Track, thumbTop: number): number {
  if (m.maxOffsetFromBottom === 0) return 0;
  const len = scrollbarThumb(m, track)?.len ?? 1;
  const maxTop = track.h - Math.min(len, track.h);
  if (maxTop === 0) return 0;
  const desired = Math.min(Math.max(0, thumbTop), maxTop);
  const fromTop = Math.round((desired * m.maxOffsetFromBottom) / maxTop);
  return Math.max(0, m.maxOffsetFromBottom - fromTop);
}

/** 溝のある行を押した：つまみの真ん中がその行に来るスクロールの量。 */
export function offsetFromRow(m: ScrollMetrics, track: Track, row: number): number {
  const thumb = scrollbarThumb(m, track);
  if (!thumb) return 0;
  const r = Math.min(Math.max(row, track.y), track.y + track.h - 1) - track.y;
  return offsetFromThumbTop(m, track, r - Math.floor(thumb.len / 2));
}

/** つまみを掴んで動かした：掴んだ位置（つまみの上端からの行数）を保ったスクロールの量。 */
export function offsetFromDragRow(
  m: ScrollMetrics,
  track: Track,
  row: number,
  grab: number,
): number {
  const r = Math.min(Math.max(row, track.y), track.y + track.h - 1) - track.y;
  return offsetFromThumbTop(m, track, r - grab);
}

/** pane のスクロールバーの溝（右の罫線の、中身の行の範囲。pane が割り付けより小さければその行数まで）。出せなければ null。 */
export function paneScrollTrack(box: PaneBox, term: PaneTerminal): Track | null {
  if (!box.sides.right || box.frame.w < 2 || box.content.h <= 0) return null; // 右の罫線が無ければ出さない
  return { y: box.content.y, h: Math.min(box.content.h, term.rows) };
}
