/**
 * グラフ画面の座標の計算（20260927-agent-graph の architecture「client-core/graph」）。happy-dom はレイアウトしないので、座標の計算は
 * ここに純粋な関数として置いて試験する（research F7.5）。座標は「世界」（ズーム前の px。ノードの `x`・`y`）と「画面」（表示の px）の 2 つで、
 * 画面 = 世界 × zoom + pan。
 */
export const GRAPH_GRID = 20;
export const GRAPH_ZOOM_MIN = 0.25;
export const GRAPH_ZOOM_MAX = 2;
/** ノードの既定の大きさ（世界の px）。 */
export const GRAPH_NODE_WIDTH = 200;
export const GRAPH_NODE_HEIGHT = 80;
/** 同じ 2 つのノードを結ぶ線どうしの間隔（世界の px）。 */
export const PARALLEL_LINK_GAP = 14;

export interface GraphPoint {
  x: number;
  y: number;
}
export interface GraphRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GraphViewport {
  zoom: number;
  panX: number;
  panY: number;
}

/** グリッドへ吸着する（-0 を返さない）。 */
export function snapToGrid(v: number, grid = GRAPH_GRID): number {
  return Math.round(v / grid) * grid + 0;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(GRAPH_ZOOM_MAX, Math.max(GRAPH_ZOOM_MIN, zoom));
}

export function graphToScreen(view: GraphViewport, p: GraphPoint): GraphPoint {
  return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY };
}

export function screenToGraph(view: GraphViewport, p: GraphPoint): GraphPoint {
  return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom };
}

/** `anchor`（画面の座標。ホイールの位置）を動かさずにズームする。 */
export function zoomGraphAt(view: GraphViewport, zoom: number, anchor: GraphPoint): GraphViewport {
  const next = clampZoom(zoom);
  const world = screenToGraph(view, anchor);
  return { zoom: next, panX: anchor.x - world.x * next, panY: anchor.y - world.y * next };
}

/** 全体表示: すべての矩形が `size`（画面の px）に余白つきで収まる表示。矩形が無ければ等倍・原点。ズームは 1 を超えない。 */
export function fitGraphView(
  rects: readonly GraphRect[],
  size: { w: number; h: number },
  padding = 40,
): GraphViewport {
  if (rects.length === 0) return { zoom: 1, panX: 0, panY: 0 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const availW = Math.max(1, size.w - padding * 2);
  const availH = Math.max(1, size.h - padding * 2);
  const zoom = clampZoom(
    Math.min(1, availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY)),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { zoom, panX: size.w / 2 - cx * zoom, panY: size.h / 2 - cy * zoom };
}

export function rectCenter(r: GraphRect): GraphPoint {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** 矩形の中心から `toward` へ向かう半直線と、矩形の縁の交点。`toward` が中心と同じなら中心。 */
export function borderPoint(r: GraphRect, toward: GraphPoint): GraphPoint {
  const c = rectCenter(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export interface EdgeGeometry {
  start: GraphPoint;
  end: GraphPoint;
  /** 中点（回数のチップを置く）。 */
  mid: GraphPoint;
}

/**
 * 線の経路（直線）。ノードの縁から縁へ。`offset` は同じ 2 つのノードを結ぶ線をずらす段数（`parallelOffsets`）で、
 * 向きに依らずノードの組の同じ側へずらす（行きと帰りの線が重ならない）。
 */
export function edgeGeometry(from: GraphRect, to: GraphRect, offset = 0): EdgeGeometry {
  const a = rectCenter(from);
  const b = rectCenter(to);
  // ずらす向き: 組の順（左上が先）で決めた向きの法線。行きと帰りで同じ法線を使い、offset の符号で分ける。
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  const shift = offset * PARALLEL_LINK_GAP;
  const a2 = { x: a.x + nx * shift, y: a.y + ny * shift };
  const b2 = { x: b.x + nx * shift, y: b.y + ny * shift };
  const shiftedFrom = { ...from, x: from.x + nx * shift, y: from.y + ny * shift };
  const shiftedTo = { ...to, x: to.x + nx * shift, y: to.y + ny * shift };
  const start = borderPoint(shiftedFrom, b2);
  const end = borderPoint(shiftedTo, a2);
  return { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

/**
 * 同じ 2 つのノード（向きを問わない）を結ぶ線ごとのずらしの段数。1 本なら 0、2 本なら -0.5・0.5、3 本なら -1・0・1。
 * 順は与えた線の順。
 */
export function parallelOffsets(
  links: readonly { id: string; from: string; to: string }[],
): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const l of links) {
    const pair = l.from < l.to ? `${l.from}\u0000${l.to}` : `${l.to}\u0000${l.from}`;
    const ids = groups.get(pair) ?? [];
    ids.push(l.id);
    groups.set(pair, ids);
  }
  const out = new Map<string, number>();
  for (const ids of groups.values()) ids.forEach((id, i) => out.set(id, i - (ids.length - 1) / 2));
  return out;
}

/** 点（世界の座標）の上にあるノードの鍵。重なっていれば後に描いた方（配列の後ろ）。無ければ null。 */
export function graphNodeAt(
  nodes: readonly { key: string; rect: GraphRect }[],
  p: GraphPoint,
): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { key, rect } = nodes[i]!;
    if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h)
      return key;
  }
  return null;
}

/** ノードの矩形（既定の大きさ）。 */
export function graphNodeRect(node: { x: number; y: number }): GraphRect {
  return { x: node.x, y: node.y, w: GRAPH_NODE_WIDTH, h: GRAPH_NODE_HEIGHT };
}
