import { GRAPH_COORD_MAX, type NodeKey } from "@sodashitsu/protocol";
import { snapToGrid, type GraphPoint, type GraphRect } from "./geometry.js";
import {
  FRAME_GAP,
  FRAME_HEADING,
  FRAME_MIN_WIDTH,
  FRAME_ORIGIN,
  FRAME_PADDING,
  GRAPH_CELL_HEIGHT,
  GRAPH_CELL_WIDTH,
  compactFrameSize,
  frames,
  overlaps,
  type LayoutStructure,
  type LayoutTop,
  type NodePositions,
} from "./graphLayout.js";

/**
 * 「並びを整える」の計算（20261008-graph-first の PR1e T17c。AC-L3）。表示中の空間の囲いとノードを、詰めて並べ直す純粋な関数。
 *
 * - 最上位の囲いの並びは、**いまの位置の順**（上から下・左から右）を保つ。囲いの中のノードも、いまの並びの順（上から下・左から右）を保って、ほぼ正方形の升に置く。
 *   worktree グループの中のメンバーの囲いは、構成の順（サイドバーの順）を保って、グループの中で詰めて並べる。
 * - 囲いどうしは重ならず、`FRAME_GAP` の間を空ける。**ほかの空間の囲いは動かさず、重ならない場所へ**（元の左上 → ほかの空間の右 → 下、の順に試す）。
 * - 位置は 20 の倍数・座標の範囲の中・同じ座標に 2 つ置かない。位置の無いノード（まだ足されていない）は触らない。線は関係しない。
 * 返すのは、空間のノードの新しい位置（動かさないものも含む）。範囲の中に収まらないなら `null`。
 */
export function tidySpace(
  structure: LayoutStructure,
  positions: NodePositions,
  spaceId: string,
): Map<NodeKey, GraphPoint> | null {
  const space = structure.spaces.find((s) => s.id === spaceId);
  if (space === undefined) return new Map();
  const safe = GRAPH_COORD_MAX - 2000;

  const posOf = (k: NodeKey): GraphPoint | undefined => positions.get(k);
  const byReadingOrder = (a: GraphPoint, b: GraphPoint): number => a.y - b.y || a.x - b.x;

  /** 囲い 1 つ分（メンバー）の中のノードを、升に並べた相対の位置（囲いの左上が原点）と、囲いの大きさ。 */
  const layoutMember = (nodes: readonly NodeKey[]): { rel: Map<NodeKey, GraphPoint>; w: number; h: number } => {
    const placed = nodes
      .map((k) => ({ k, p: posOf(k) }))
      .filter((e): e is { k: NodeKey; p: GraphPoint } => e.p !== undefined)
      .sort((a, b) => byReadingOrder(a.p, b.p));
    const { cols, w, h } = compactFrameSize(placed.length);
    const rel = new Map<NodeKey, GraphPoint>();
    placed.forEach((e, i) => {
      rel.set(e.k, {
        x: FRAME_PADDING + (i % cols) * GRAPH_CELL_WIDTH,
        y: FRAME_HEADING + Math.floor(i / cols) * GRAPH_CELL_HEIGHT,
      });
    });
    return { rel, w: placed.length === 0 ? 0 : w, h: placed.length === 0 ? 0 : h };
  };

  interface Block {
    top: LayoutTop;
    /** 最上位の囲いの大きさ。 */
    w: number;
    h: number;
    /** ノードの相対の位置（最上位の囲いの左上が原点）。 */
    rel: Map<NodeKey, GraphPoint>;
    /** いまの位置（並びの順に使う）。 */
    at: GraphPoint;
  }
  const currentRects = new Map(frames(structure, positions).map((f) => [f.id, f.rect]));

  const blocks: Block[] = [];
  for (const top of space.tops) {
    const rect = currentRects.get(top.id);
    if (rect === undefined) continue; // ノードがひとつも無い
    if (top.kind !== "worktree") {
      const m = layoutMember(top.members.flatMap((mm) => [...mm.nodes]));
      if (m.rel.size > 0) blocks.push({ top, w: m.w, h: m.h, rel: m.rel, at: { x: rect.x, y: rect.y } });
      continue;
    }
    // worktree グループ: メンバーの囲いを、構成の順で、ほぼ正方形の升に（囲いの大きさのまま。行ごとに高さをそろえる）
    const members = top.members.map((mm) => ({ mm, m: layoutMember(mm.nodes) })).filter((e) => e.m.rel.size > 0);
    if (members.length === 0) continue;
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const rowsOf: (typeof members)[] = [];
    members.forEach((e, i) => {
      if (i % cols === 0) rowsOf.push([]);
      rowsOf.at(-1)!.push(e);
    });
    const rel = new Map<NodeKey, GraphPoint>();
    let y = FRAME_HEADING;
    let width = 0;
    for (const row of rowsOf) {
      let x = FRAME_PADDING;
      const rowH = Math.max(...row.map((e) => e.m.h));
      for (const e of row) {
        for (const [k, p] of e.m.rel) rel.set(k, { x: x + p.x, y: y + p.y });
        x += e.m.w + FRAME_GAP;
      }
      width = Math.max(width, x - FRAME_GAP + FRAME_PADDING);
      y += rowH + FRAME_GAP;
    }
    blocks.push({
      top,
      w: Math.max(width, FRAME_MIN_WIDTH),
      h: y - FRAME_GAP + FRAME_PADDING,
      rel,
      at: { x: rect.x, y: rect.y },
    });
  }
  if (blocks.length === 0) return new Map();
  blocks.sort((a, b) => byReadingOrder(a.at, b.at));

  // 棚に詰める（行の幅の目標は、全部の面積から。いちばん広い囲いより狭くしない）。
  const gap = FRAME_GAP * 2;
  const area = blocks.reduce((s, b) => s + (b.w + gap) * (b.h + gap), 0);
  const maxW = Math.max(...blocks.map((b) => b.w));
  const rowWidth = Math.max(maxW, Math.ceil(Math.sqrt(area * 1.6)));
  const origin: GraphPoint[] = []; // ブロックごとの、詰めた並びの中の左上
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.w > rowWidth) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    origin.push({ x, y });
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
  }
  const packedW = Math.max(...blocks.map((b, i) => origin[i]!.x + b.w));
  const packedH = Math.max(...blocks.map((b, i) => origin[i]!.y + b.h));

  // 置く場所: 元の左上。ほかの空間の囲いと重なるなら、その右 → 下。
  const mine = new Set(space.tops.flatMap((t) => [t.id, ...t.members.map((m) => m.id)]));
  const others: GraphRect[] = frames(structure, positions)
    .filter((f) => f.parentId === null && !mine.has(f.id))
    .map((f) => f.rect);
  const oldLeft = Math.min(...blocks.map((b) => b.at.x));
  const oldTop = Math.min(...blocks.map((b) => b.at.y));
  const start = { x: snapToGrid(Math.max(oldLeft, -safe)), y: snapToGrid(Math.max(oldTop, -safe)) };
  const free = (px: number, py: number): boolean => {
    const r: GraphRect = { x: px - FRAME_GAP, y: py - FRAME_GAP, w: packedW + FRAME_GAP * 2, h: packedH + FRAME_GAP * 2 };
    return others.every((o) => overlaps(r, o) === 0);
  };
  const maxRight = others.length === 0 ? 0 : Math.max(...others.map((o) => o.x + o.w));
  const maxBottom = others.length === 0 ? 0 : Math.max(...others.map((o) => o.y + o.h));
  const candidates = [
    start,
    { x: snapToGrid(Math.max(maxRight + gap, FRAME_ORIGIN)), y: start.y },
    { x: start.x, y: snapToGrid(Math.max(maxBottom + gap, FRAME_ORIGIN)) },
    { x: snapToGrid(Math.max(maxRight + gap, FRAME_ORIGIN)), y: snapToGrid(Math.max(maxBottom + gap, FRAME_ORIGIN)) },
  ];
  const at = candidates.find((c) => free(c.x, c.y));
  if (at === undefined) return null;

  const out = new Map<NodeKey, GraphPoint>();
  blocks.forEach((b, i) => {
    for (const [k, p] of b.rel) out.set(k, { x: snapToGrid(at.x + origin[i]!.x + p.x), y: snapToGrid(at.y + origin[i]!.y + p.y) });
  });
  for (const p of out.values()) if (Math.abs(p.x) > safe || Math.abs(p.y) > safe) return null;
  return out;
}
