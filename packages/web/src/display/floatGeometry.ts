/**
 * 浮いた窓の矩形の計算と、重なりの順（20261008-display-layout の design「浮いた窓の矩形」「浮いた窓」）。**純粋**で、表示の面に固有のものを持たない
 * （どの窓も、領域〔`area`〕の左上からの矩形として扱う）。グラフの画面の「端末の窓」など、ほかの浮いた窓も使い回せる。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Area {
  w: number;
  h: number;
}
/** 窓の最小の大きさ（px）。 */
export const FLOAT_MIN_W_PX = 240;
export const FLOAT_MIN_H_PX = 120;
/** 窓の動ける領域は、端末の領域を各辺この分だけ縮めた箱（隣の部品のつまみの当たり判定を覆わないため）。 */
export const FLOAT_AREA_INSET_PX = 4;
/** 初めの矩形の、領域の縁からの余白。 */
export const FLOAT_INSET_PX = 8;
/** 初めの矩形を、窓の数ごとにずらす量。 */
export const FLOAT_CASCADE_PX = 24;
/** キーで動かす・大きさを変える 1 回の量（`Shift` で大きい量）。 */
export const FLOAT_KEY_STEP_PX = 16;
export const FLOAT_KEY_STEP_LARGE_PX = 64;

export type FloatHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const FLOAT_HANDLES: readonly FloatHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** 有限の数だけを通す（`NaN`・無限大・数でないものは `fallback`）。 */
function finite(v: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
/** `v` を [lo, hi] に丸める。範囲が逆転している（hi < lo）ときは lo。 */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}
const areaOf = (a: Area): Area => ({ w: Math.max(0, Math.floor(finite(a.w, 0))), h: Math.max(0, Math.floor(finite(a.h, 0))) });

/**
 * 窓の全体を、領域の中へ入れる。先に大きさを [最小, 領域] に丸め、次に位置を [0, 領域 − 大きさ] に丸める。数でない値・無限大は、最小の大きさ・原点として扱う。
 * 領域が最小より小さいときは、大きさは領域に収まる（呼ぶ側が、そのような領域では窓を出さない）。整数に丸める。
 */
export function clampFloatRect(r: Rect, area: Area, min: Area = { w: FLOAT_MIN_W_PX, h: FLOAT_MIN_H_PX }): Rect {
  const a = areaOf(area);
  const w = Math.round(Math.min(clamp(finite(r.w, min.w), min.w, a.w), a.w));
  const h = Math.round(Math.min(clamp(finite(r.h, min.h), min.h, a.h), a.h));
  const x = Math.round(clamp(finite(r.x, 0), 0, a.w - w));
  const y = Math.round(clamp(finite(r.y, 0), 0, a.h - h));
  return { x, y, w, h };
}

/**
 * 初めの矩形。幅は `size`（240〜領域−16）、高さは領域の 6 割（120〜領域−16）。右上から、i 番目は 24px ずつ左下へずらす。
 * 領域が小さくて範囲が逆転するときも、最後に `clampFloatRect` を通した値を返す。
 */
export function defaultFloatRect(i: number, size: number, area: Area): Rect {
  const a = areaOf(area);
  const n = Math.max(0, Math.floor(finite(i, 0)));
  const w = clamp(finite(size, FLOAT_MIN_W_PX), FLOAT_MIN_W_PX, a.w - FLOAT_INSET_PX * 2);
  const h = clamp(Math.round(a.h * 0.6), FLOAT_MIN_H_PX, a.h - FLOAT_INSET_PX * 2);
  return clampFloatRect({ x: a.w - w - FLOAT_INSET_PX - n * FLOAT_CASCADE_PX, y: FLOAT_INSET_PX + n * FLOAT_CASCADE_PX, w, h }, a);
}

/** 移動。`start` に dx・dy を足して丸める。 */
export function moveFloatRect(start: Rect, dx: number, dy: number, area: Area): Rect {
  const s = clampFloatRect(start, area);
  return clampFloatRect({ ...s, x: s.x + finite(dx, 0), y: s.y + finite(dy, 0) }, area);
}

/**
 * 大きさの変更。`handle` は n・s・e・w・ne・nw・se・sw。**動かさない側の縁は動かさず**、最小と領域に丸める
 * （例: 左の縁をつかんだとき、右の縁の位置は変わらない。左が領域の外へ出る・最小を割る分は止まる）。
 */
export function resizeFloatRect(start: Rect, handle: FloatHandle, dx: number, dy: number, area: Area, min: Area = { w: FLOAT_MIN_W_PX, h: FLOAT_MIN_H_PX }): Rect {
  const a = areaOf(area);
  const s = clampFloatRect(start, a, min);
  const mx = finite(dx, 0);
  const my = finite(dy, 0);
  let left = s.x;
  let top = s.y;
  let right = s.x + s.w;
  let bottom = s.y + s.h;
  if (handle.includes("e")) right = clamp(right + mx, left + Math.min(min.w, a.w), a.w);
  if (handle.includes("w")) left = clamp(left + mx, 0, right - Math.min(min.w, a.w));
  if (handle.includes("s")) bottom = clamp(bottom + my, top + Math.min(min.h, a.h), a.h);
  if (handle.includes("n")) top = clamp(top + my, 0, bottom - Math.min(min.h, a.h));
  return clampFloatRect({ x: left, y: top, w: right - left, h: bottom - top }, a, min);
}

/** 矢印キーの 1 回分。`mode` が move なら位置、resize なら右下の縁（幅・高さ）を動かす。矢印でないキーは null。 */
export function keyAdjustFloatRect(start: Rect, mode: "move" | "resize", key: string, shift: boolean, area: Area): Rect | null {
  const step = shift ? FLOAT_KEY_STEP_LARGE_PX : FLOAT_KEY_STEP_PX;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  if (dx === 0 && dy === 0) return null;
  return mode === "move" ? moveFloatRect(start, dx, dy, area) : resizeFloatRect(start, "se", dx, dy, area);
}

// --- 重なりの順（pane ごと。末尾が最前面） -------------------------------------------------------------------------------------------

/** 決まり 2: 押した窓を末尾へ（**操作中の id は見ない**。別の窓を押した瞬間は、`focusedDisplayId` がまだ前の窓を指していることがある）。無ければ末尾に足す。 */
export function raiseFloat(order: readonly string[], id: string): string[] {
  if (order[order.length - 1] === id) return [...order];
  return [...order.filter((x) => x !== id), id];
}

/**
 * 決まり 3: 新しく出た窓・開き直した窓は、**操作中の窓があれば、その 1 つ後ろ**に入れる（操作中の窓の見出しを覆わない）。無ければ最前面。
 * すでに並びにある窓は動かさない。
 */
export function insertFloat(order: readonly string[], id: string, engagedId: string | null): string[] {
  if (order.includes(id)) return [...order];
  const at = engagedId === null ? -1 : order.indexOf(engagedId);
  if (at < 0) return [...order, id];
  return [...order.slice(0, at), id, ...order.slice(at)];
}

/**
 * 出ている窓の集まり（`open`）に、並びを合わせる: 閉じた窓を外し、新しい窓を `insertFloat` で入れる。**決まり 1: 操作中の窓は、いつも最前面**
 * （`engagedId` が `open` の中にあれば、末尾へ）。変わらなければ同じ内容を返す。
 */
export function reconcileFloatOrder(order: readonly string[], open: readonly string[], engagedId: string | null): string[] {
  const openSet = new Set(open);
  let next = order.filter((id) => openSet.has(id));
  const engaged = engagedId !== null && openSet.has(engagedId) ? engagedId : null;
  for (const id of open) if (!next.includes(id)) next = insertFloat(next, id, engaged);
  return next;
}

/** 窓の `z-index`（層の中の値。層が重なりの文脈を作るので、外とは比べられない）。 */
export const FLOAT_Z_BASE = 20;
export function floatZ(order: readonly string[], id: string): number {
  const at = order.indexOf(id);
  return FLOAT_Z_BASE + (at < 0 ? order.length : at);
}

/** 窓の動ける領域（端末の領域を各辺 4px 縮めた箱）。最小の窓が入らなければ null。 */
export function floatAreaOf(terminal: Area, min: Area = { w: FLOAT_MIN_W_PX, h: FLOAT_MIN_H_PX }): Area | null {
  const w = finite(terminal.w, 0) - FLOAT_AREA_INSET_PX * 2;
  const h = finite(terminal.h, 0) - FLOAT_AREA_INSET_PX * 2;
  return w >= min.w && h >= min.h ? { w, h } : null;
}
