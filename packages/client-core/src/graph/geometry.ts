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

export type EdgeHeadShape = "triangle" | "diamond" | "circle";
/** 線の先の印の大きさ（世界の px）。 */
export const EDGE_HEAD_SIZE = 10;

/**
 * 線の先の印（design「線の種類の見た目」: トリガ ▶・監督 ◆・承認の代理 ●）。`end` を先端に、`start` から来る向きで描く SVG の path と、
 * 線を止める点（`lineEnd`。印と線が重ならない）。SVG の marker の色は線の色に追従しない（context-stroke がブラウザで揃わない）ので path で描く。
 */
export function edgeHead(
  start: GraphPoint,
  end: GraphPoint,
  shape: EdgeHeadShape,
  size = EDGE_HEAD_SIZE,
): { d: string; lineEnd: GraphPoint } {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  const ux = len === 0 ? 1 : (end.x - start.x) / len;
  const uy = len === 0 ? 0 : (end.y - start.y) / len;
  const nx = -uy;
  const ny = ux;
  const at = (back: number, side: number): GraphPoint => ({
    x: end.x - ux * back + nx * side,
    y: end.y - uy * back + ny * side,
  });
  const fmt = (p: GraphPoint): string => `${round2(p.x)} ${round2(p.y)}`;
  if (shape === "triangle") {
    const c1 = at(size, size / 2);
    const c2 = at(size, -size / 2);
    return { d: `M ${fmt(end)} L ${fmt(c1)} L ${fmt(c2)} Z`, lineEnd: at(size, 0) };
  }
  if (shape === "diamond") {
    const l = size * 1.4;
    return {
      d: `M ${fmt(end)} L ${fmt(at(l / 2, size / 2))} L ${fmt(at(l, 0))} L ${fmt(at(l / 2, -size / 2))} Z`,
      lineEnd: at(l, 0),
    };
  }
  const r = size / 2;
  const c = at(r, 0);
  return {
    d: `M ${round2(c.x - r)} ${round2(c.y)} A ${r} ${r} 0 1 0 ${round2(c.x + r)} ${round2(c.y)} A ${r} ${r} 0 1 0 ${round2(c.x - r)} ${round2(c.y)} Z`,
    lineEnd: at(size, 0),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

/**
 * 新しく載せるノードの位置（`index` 番目）。今のノードの外接矩形の右隣に縦に並べる（グリッドに合わせる）。ノードが無ければ左上から。
 */
export function nextFreeGraphPosition(rects: readonly GraphRect[], index: number): GraphPoint {
  const stepY = GRAPH_NODE_HEIGHT + GRAPH_GRID * 2;
  if (rects.length === 0)
    return { x: GRAPH_GRID * 2, y: snapToGrid(GRAPH_GRID * 2 + index * stepY) };
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  return { x: snapToGrid(maxX + GRAPH_GRID * 3), y: snapToGrid(minY + index * stepY) };
}

/**
 * 矩形（世界の座標）が画面（`size`）の余白の内側に見えるよう、最小のパンだけ動かした表示（フォーカスしたノード・線を画面へ入れる。research-ui §2.12）。
 * 既に見えていれば同じ表示を返す。
 */
export function revealGraphRect(
  view: GraphViewport,
  rect: GraphRect,
  size: { w: number; h: number },
  margin = 40,
): GraphViewport {
  const x0 = rect.x * view.zoom + view.panX;
  const y0 = rect.y * view.zoom + view.panY;
  const x1 = x0 + rect.w * view.zoom;
  const y1 = y0 + rect.h * view.zoom;
  const shift = (lo: number, hi: number, max: number): number => {
    if (lo < margin) return margin - lo;
    if (hi > max - margin) return Math.max(margin - lo, max - margin - hi);
    return 0;
  };
  const dx = shift(x0, x1, size.w);
  const dy = shift(y0, y1, size.h);
  if (dx === 0 && dy === 0) return view;
  return { zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy };
}

/**
 * 2 本指のピンチ（モバイルの閲覧）。始めの 2 点（`a`・`b`）の中点の下の世界の点を、今の 2 点の中点の下に保ったまま、2 点の間の距離の比でズームする。
 */
export function pinchGraphView(
  startView: GraphViewport,
  a: GraphPoint,
  b: GraphPoint,
  a2: GraphPoint,
  b2: GraphPoint,
): GraphViewport {
  const d0 = Math.hypot(b.x - a.x, b.y - a.y);
  const d1 = Math.hypot(b2.x - a2.x, b2.y - a2.y);
  const zoom = clampZoom(d0 === 0 ? startView.zoom : (startView.zoom * d1) / d0);
  const world = screenToGraph(startView, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const mx = (a2.x + b2.x) / 2;
  const my = (a2.y + b2.y) / 2;
  return { zoom, panX: mx - world.x * zoom, panY: my - world.y * zoom };
}
