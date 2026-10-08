import type { DockSide } from "./displayPrefs.js";

/**
 * 面（パネル）の D&D（20261008-display-layout の design「D&D」）。このファイルの純粋な部分: ポインタの位置から、落とせる場所を決める。
 * つかむ・動かす・離す・取り消すの処理（`DockDragController`）は、同じファイルの下にある。
 */

/** 縁から、この割合（幅・高さに対する）までが、その側の落とせる場所。 */
export const DOCK_ZONE_EDGE_RATIO = 0.22;

export type DockZone = DockSide | "float";
export interface ZoneBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 箱の中の点から、落とせる場所を決める。箱の外は `null`。箱の中では、4 つの縁までの距離（幅・高さで割った比）のうち最小のものが 0.22 以下なら、その縁の側
 * （同じ距離なら 上・下・左・右 の順）。そうでなければ中央（`opts.float` が真のときだけ `float`。偽なら `null`＝落とせない）。
 */
export function dockZoneAt(box: ZoneBox, x: number, y: number, opts: { float: boolean }): DockZone | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  if (x < box.left || x > box.left + box.width || y < box.top || y > box.top + box.height) return null;
  const dist: [DockSide, number][] = [
    ["top", (y - box.top) / box.height],
    ["bottom", (box.top + box.height - y) / box.height],
    ["left", (x - box.left) / box.width],
    ["right", (box.left + box.width - x) / box.width],
  ];
  let best = dist[0]!;
  for (const d of dist) if (d[1] < best[1]) best = d;
  if (best[1] <= DOCK_ZONE_EDGE_RATIO) return best[0];
  return opts.float ? "float" : null;
}
