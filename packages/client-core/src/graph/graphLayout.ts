import { GRAPH_COORD_MAX, type NodeKey } from "@sodashitsu/protocol";
import {
  GRAPH_GRID,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  snapToGrid,
  type GraphPoint,
  type GraphRect,
} from "./geometry.js";

/**
 * 囲いと置き場所の計算（20261008-graph-first の design 追補 01「囲いの定義」）。純粋な関数で、サーバ（`reconcileGraph`・`graph.update` の検査）と
 * ブラウザ（ドラッグの寄せ）の両方が使う。座標は、全体で 1 枚の面（D8）。囲いは保存せず、ノードの位置から毎回導く。
 *
 * - **ノード** 200×80（`geometry.ts`）。**升** = 幅 240・高さ 120（ノード + 間 40。D14）。
 * - **メンバーの囲い**（workspace・別のマシン 1 つ）= 中のノードの外接の四角 + 余白（見出し 40・周り 20）。幅は 320 より狭くしない。
 * - **worktree グループの囲い** = 中のメンバーの囲いの外接の四角 + 同じ余白。
 * - **重ならない規則**: (a) 最上位の囲い（worktree グループの囲い・グループに入らない workspace の囲い・別のマシンの囲い）どうし
 *   (b) 同じ worktree グループの中のメンバーの囲いどうし。
 */

/** 升の大きさ（ノード + 間 40）。 */
export const GRAPH_CELL_WIDTH = GRAPH_NODE_WIDTH + GRAPH_GRID * 2;
export const GRAPH_CELL_HEIGHT = GRAPH_NODE_HEIGHT + GRAPH_GRID * 2;
/** 囲いの見出しの高さ・周りの余白・最小の幅。 */
export const FRAME_HEADING = GRAPH_GRID * 2;
export const FRAME_PADDING = GRAPH_GRID;
export const FRAME_MIN_WIDTH = 320;
/** 置き場所の計算が囲いの間に空ける間（これより近い置き場所は、ほかに無いときだけ選ぶ）。 */
export const FRAME_GAP = GRAPH_GRID;
/** 面の左上の端（最初の囲いの左上）。 */
export const FRAME_ORIGIN = GRAPH_GRID;
/** 新しいノードを探す升の、いまの外接の外側への広げ幅（右・下に、それぞれこの数まで）。これでも空きが無ければ、囲いごと動かす。 */
const CELL_EXPAND_MAX = 2;
/** 置き場所の候補の数の上限（辺の座標の候補を近い順にこれだけ見る。無ければ最後の手段の場所へ）。 */
const EDGE_CANDIDATES_MAX = 64;
/** 計算で使ってよい座標の範囲（`GRAPH_COORD_MAX` に、ノードの大きさと余白の分の余裕を持たせる）。 */
const SAFE_COORD = GRAPH_COORD_MAX - 2000;

// --- 構成の型 ------------------------------------------------------------

/** 囲い 1 つの分のノード。`id` は workspace の id（別のマシンなら `m:<マシンの id>`）。 */
export interface LayoutMember {
  id: string;
  /** この囲いに属するノードの鍵（位置を持たないものは、囲いの計算で飛ばす）。 */
  nodes: readonly NodeKey[];
}

export type LayoutTopKind = "worktree" | "workspace" | "machine";

/**
 * 最上位の囲い 1 つ。`worktree` は複数のメンバー（workspace）を持つ外側の囲い、`workspace`・`machine` はメンバー 1 つ。
 * `id` は、worktree グループなら `r:<repoKey>`、それ以外ならメンバーの id と同じにしてよい。
 */
export interface LayoutTop {
  id: string;
  kind: LayoutTopKind;
  members: readonly LayoutMember[];
}

/** 空間（グループ 1 つか「グループなし」）。座標は空間ごとに分けない（D8）が、見出しの並びと `sodactl` の出力に使う。 */
export interface LayoutSpace {
  /** `g:<groupId>` か `u`（グループなし）。 */
  id: string;
  tops: readonly LayoutTop[];
}

export interface LayoutStructure {
  spaces: readonly LayoutSpace[];
}

export type NodePositions = ReadonlyMap<string, GraphPoint>;

/** ノードの並び（`Graph.nodes`）から、位置の引き当てを作る。 */
export function nodePositions(
  nodes: readonly { key: string; x: number; y: number }[],
): Map<string, GraphPoint> {
  return new Map(nodes.map((n) => [n.key, { x: n.x, y: n.y }]));
}

export interface LayoutFrame {
  /** メンバーの囲いなら メンバーの id、worktree グループの囲いなら `LayoutTop.id`。 */
  id: string;
  /** `worktree`（グループの囲い）・`workspace`（workspace の囲い。グループの中のもの、外のもの）・`machine`。 */
  kind: "worktree" | "workspace" | "machine";
  /** 属する worktree グループの囲いの id（最上位なら null）。 */
  parentId: string | null;
  rect: GraphRect;
}

// --- 囲いの導出 ----------------------------------------------------------

function allTops(structure: LayoutStructure): LayoutTop[] {
  return structure.spaces.flatMap((s) => [...s.tops]);
}

/** メンバーの囲い（ノードの位置の外接 + 余白）。ノードが無ければ null。 */
function rectOfPoints(points: readonly GraphPoint[]): GraphRect | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x = minX - FRAME_PADDING;
  const y = minY - FRAME_HEADING;
  const right = maxX + GRAPH_NODE_WIDTH + FRAME_PADDING;
  const bottom = maxY + GRAPH_NODE_HEIGHT + FRAME_PADDING;
  return { x, y, w: Math.max(right - x, FRAME_MIN_WIDTH), h: bottom - y };
}

/** 囲いの四角の並びを内側に含む外側の囲い（worktree グループ）。 */
function rectAround(rects: readonly GraphRect[]): GraphRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const x = minX - FRAME_PADDING;
  const y = minY - FRAME_HEADING;
  return {
    x,
    y,
    w: Math.max(maxX + FRAME_PADDING - x, FRAME_MIN_WIDTH),
    h: maxY + FRAME_PADDING - y,
  };
}

/** 点（ノードの左上）の並びから、メンバーの囲いの四角を求める（ノードが無ければ null）。 */
export function frameRectOf(points: readonly GraphPoint[]): GraphRect | null {
  return rectOfPoints(points);
}

/** ノード `n` 個を、ほぼ正方形のグリッド（升）に詰めたときの列数・行数と、その囲いの大きさ。 */
export function compactFrameSize(n: number): { cols: number; rows: number; w: number; h: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const w = Math.max(
    FRAME_MIN_WIDTH,
    (cols - 1) * GRAPH_CELL_WIDTH + GRAPH_NODE_WIDTH + FRAME_PADDING * 2,
  );
  const h = (rows - 1) * GRAPH_CELL_HEIGHT + GRAPH_NODE_HEIGHT + FRAME_PADDING + FRAME_HEADING;
  return { cols, rows, w, h };
}

/** 四角の並びの外接（余白は足さない）。 */
function unionRect(rects: readonly GraphRect[]): GraphRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

type MemberPoints = ReadonlyMap<string, readonly GraphPoint[]>;

/** 最上位の囲い 1 つの分の囲いの一覧。先頭が最上位の囲い、worktree グループなら続きがメンバーの囲い。ノードがひとつも無ければ空。 */
function topFramesOf(top: LayoutTop, points: MemberPoints): LayoutFrame[] {
  const memberFrames: LayoutFrame[] = [];
  for (const m of top.members) {
    const rect = rectOfPoints(points.get(m.id) ?? []);
    if (rect === null) continue;
    memberFrames.push({
      id: m.id,
      kind: top.kind === "machine" ? "machine" : "workspace",
      parentId: top.kind === "worktree" ? top.id : null,
      rect,
    });
  }
  if (memberFrames.length === 0) return [];
  if (top.kind !== "worktree") return [memberFrames[0]!];
  const group: LayoutFrame = {
    id: top.id,
    kind: "worktree",
    parentId: null,
    rect: rectAround(memberFrames.map((f) => f.rect))!,
  };
  return [group, ...memberFrames];
}

interface Ctx {
  tops: LayoutTop[];
  topOfMember: Map<string, LayoutTop>;
  points: Map<string, GraphPoint[]>;
  topFrames: Map<string, LayoutFrame[]>;
}

function pointsOfMember(m: LayoutMember, positions: NodePositions): GraphPoint[] {
  const out: GraphPoint[] = [];
  for (const k of m.nodes) {
    const p = positions.get(k);
    if (p !== undefined) out.push(p);
  }
  return out;
}

function buildCtx(structure: LayoutStructure, positions: NodePositions): Ctx {
  const tops = allTops(structure);
  const topOfMember = new Map<string, LayoutTop>();
  const points = new Map<string, GraphPoint[]>();
  const topFrames = new Map<string, LayoutFrame[]>();
  for (const top of tops) {
    for (const m of top.members) {
      topOfMember.set(m.id, top);
      points.set(m.id, pointsOfMember(m, positions));
    }
    const fs = topFramesOf(top, points);
    if (fs.length > 0) topFrames.set(top.id, fs);
  }
  return { tops, topOfMember, points, topFrames };
}

/** 囲いの一覧（最上位の囲いごとに、最上位の囲い → 中のメンバーの囲い）。ノードの無いメンバーの囲いは出ない。 */
export function frames(structure: LayoutStructure, positions: NodePositions): LayoutFrame[] {
  const ctx = buildCtx(structure, positions);
  return [...ctx.topFrames.values()].flat();
}

// --- 重なり --------------------------------------------------------------

/**
 * 2 つの囲いの重なりの量（重なった面積）。`gap` が正なら、それぞれを `gap / 2` だけ広げて見る（近すぎる置き方も重なりとして数える）。
 * 重なっていなければ 0。縁が接するだけは、`gap` が 0 なら重なりではない。
 */
export function overlaps(a: GraphRect, b: GraphRect, gap = 0): number {
  const g = gap / 2;
  const w = Math.min(a.x + a.w + g, b.x + b.w + g) - Math.max(a.x - g, b.x - g);
  const h = Math.min(a.y + a.h + g, b.y + b.h + g) - Math.max(a.y - g, b.y - g);
  return w > 0 && h > 0 ? w * h : 0;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * 重ならない規則の組ごとの重なりの量。`touched` の最上位の囲いが関わる組だけを数える（重なっていない組は入らない）。
 * 規則: (a) 最上位の囲いどうし (b) 同じ worktree グループの中のメンバーの囲いどうし。
 */
function pairMetrics(
  topFrames: ReadonlyMap<string, readonly LayoutFrame[]>,
  touched: ReadonlySet<string>,
  gap: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (a: LayoutFrame, b: LayoutFrame): void => {
    const m = overlaps(a.rect, b.rect, gap);
    if (m > 0) out.set(pairKey(a.id, b.id), m);
  };
  for (const tid of touched) {
    const fs = topFrames.get(tid);
    if (fs === undefined) continue;
    for (const [oid, ofs] of topFrames) {
      if (oid === tid) continue;
      if (touched.has(oid) && oid < tid) continue; // 両方が touched の組は 1 回だけ数える
      add(fs[0]!, ofs[0]!);
    }
    if (fs[0]!.kind === "worktree") {
      for (let i = 1; i < fs.length; i++)
        for (let j = i + 1; j < fs.length; j++) add(fs[i]!, fs[j]!);
    }
  }
  return out;
}

/** すべての組の重なり（重なっている組だけ）。キーは 2 つの囲いの id を並べたもの。 */
export function layoutOverlaps(
  structure: LayoutStructure,
  positions: NodePositions,
  gap = 0,
): Map<string, number> {
  const ctx = buildCtx(structure, positions);
  return pairMetrics(ctx.topFrames, new Set(ctx.topFrames.keys()), gap);
}

export interface OverlapIncrease {
  a: string;
  b: string;
  before: number;
  after: number;
}

/**
 * 位置を `before` から `after` に変えたとき、重なりが**新しくできた・広がった**組。すでに重なっていて、広がらない組は含めない
 * （すでに重なっている状態から、無関係の更新が断られないため。D10）。
 */
export function overlapIncreases(
  structure: LayoutStructure,
  before: NodePositions,
  after: NodePositions,
  gap = 0,
): OverlapIncrease[] {
  const was = layoutOverlaps(structure, before, gap);
  const now = layoutOverlaps(structure, after, gap);
  const out: OverlapIncrease[] = [];
  for (const [key, area] of now) {
    const prev = was.get(key) ?? 0;
    if (area > prev) {
      const [a, b] = key.split("\u0000") as [string, string];
      out.push({ a, b, before: prev, after: area });
    }
  }
  return out;
}

/** `after` の組のどれかが `before` より重なりが大きい（超えた量の合計。0 なら悪化なし）。 */
function excess(after: ReadonlyMap<string, number>, before: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const [k, a] of after) {
    const b = before.get(k) ?? 0;
    if (a > b) sum += a - b;
  }
  return sum;
}

// --- 置き場所の計算 ------------------------------------------------------

function inBounds(p: GraphPoint): boolean {
  return Math.abs(p.x) <= SAFE_COORD && Math.abs(p.y) <= SAFE_COORD;
}

function translate(points: readonly GraphPoint[], dx: number, dy: number): GraphPoint[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function uniqueSorted(values: Iterable<number>, key: (v: number) => number, max: number): number[] {
  return [...new Set(values)].sort((a, b) => key(a) - key(b) || a - b).slice(0, max);
}

/**
 * 動かす点の集まり（`moving`: メンバー id → 点。ひとつの最上位の囲いの中のメンバー）を、ほかの囲いに重ならない場所へ平行移動する量。
 * 候補の左上は、面の端・ほかの囲いの右端・下端（とそろえる左端・上端）から作り、左上に近い順に確かめる。基準（`baseline`）は、動かす点を外した
 * 状態の重なりで、それより悪くならない最初の場所を選ぶ。間（`FRAME_GAP`）を空ける置き方を先に探し、無ければ間なし。
 */
interface Translation extends GraphPoint {
  /** 重なりを悪くしない場所が見つかったか（false なら、いちばん重なりの少ない場所）。 */
  exact: boolean;
}

function findTranslation(
  ctx: Ctx,
  top: LayoutTop,
  moving: ReadonlyMap<string, readonly GraphPoint[]>,
): Translation {
  const rect = unionRect(
    [...moving.values()].map((pts) => rectOfPoints(pts)).filter((r): r is GraphRect => r !== null),
  );
  if (rect === null) return { x: 0, y: 0, exact: true };

  // 基準: 動かす点を外した状態の、この最上位の囲い。
  const without = new Map<string, readonly GraphPoint[]>(ctx.points);
  for (const id of moving.keys()) without.set(id, []);
  const baseFrames = new Map(ctx.topFrames);
  const baseTop = topFramesOf(top, without);
  if (baseTop.length === 0) baseFrames.delete(top.id);
  else baseFrames.set(top.id, baseTop);
  const touched = new Set([top.id]);

  const xs = new Set<number>([FRAME_ORIGIN]);
  const ys = new Set<number>([FRAME_ORIGIN]);
  let farRight = FRAME_ORIGIN;
  for (const fs of baseFrames.values()) {
    for (const f of fs) {
      xs.add(f.rect.x);
      xs.add(f.rect.x + f.rect.w + FRAME_GAP);
      xs.add(f.rect.x - rect.w - FRAME_GAP);
      ys.add(f.rect.y);
      ys.add(f.rect.y + f.rect.h + FRAME_GAP);
      ys.add(f.rect.y - rect.h - FRAME_GAP);
    }
    farRight = Math.max(farRight, fs[0]!.rect.x + fs[0]!.rect.w + FRAME_GAP);
  }
  const xList = uniqueSorted(xs, (v) => Math.abs(v), EDGE_CANDIDATES_MAX);
  const yList = uniqueSorted(ys, (v) => Math.abs(v), EDGE_CANDIDATES_MAX);
  const candidates: GraphPoint[] = [];
  for (const x of xList) for (const y of yList) candidates.push({ x, y });
  candidates.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y || a.x - b.x);
  candidates.push({ x: farRight, y: FRAME_ORIGIN }); // 最後の手段: 面の右端の外

  const baseMetrics = new Map<number, Map<string, number>>();
  const evaluate = (fx: number, fy: number, gap: number): number => {
    const dx = fx - rect.x;
    const dy = fy - rect.y;
    const next = new Map<string, readonly GraphPoint[]>(without);
    for (const [id, pts] of moving) next.set(id, translate(pts, dx, dy));
    const frames2 = new Map(baseFrames);
    frames2.set(top.id, topFramesOf(top, next));
    let baseMetric = baseMetrics.get(gap);
    if (baseMetric === undefined) {
      baseMetric = pairMetrics(baseFrames, touched, gap);
      baseMetrics.set(gap, baseMetric);
    }
    return excess(pairMetrics(frames2, touched, gap), baseMetric);
  };

  let best: { fx: number; fy: number; score: number } | null = null;
  for (const gap of [FRAME_GAP, 0]) {
    for (const c of candidates) {
      if (!inBounds({ x: c.x, y: c.y })) continue;
      const score = evaluate(c.x, c.y, gap);
      if (score === 0) return { x: c.x - rect.x, y: c.y - rect.y, exact: true };
      if (best === null || score < best.score) best = { fx: c.x, fy: c.y, score };
    }
  }
  // 重ならない場所が見つからない（座標の範囲の端まで詰まっている）。いちばん重なりの少ない場所にする。
  const pick = best ?? { fx: FRAME_ORIGIN, fy: FRAME_ORIGIN };
  return { x: pick.fx - rect.x, y: pick.fy - rect.y, exact: false };
}

function snapPoint(p: GraphPoint): GraphPoint {
  return { x: snapToGrid(p.x), y: snapToGrid(p.y) };
}

function findMember(ctx: Ctx, memberId: string): { member: LayoutMember; top: LayoutTop } | null {
  const top = ctx.topOfMember.get(memberId);
  if (top === undefined) return null;
  const member = top.members.find((m) => m.id === memberId);
  return member === undefined ? null : { member, top };
}

export interface PlaceNodeResult {
  /** 新しいノードの位置（`shift` を当てた後の、最終の位置）。 */
  x: number;
  y: number;
  /**
   * 空きが無く、囲いごと動かすとき（AC-V5 の、既存のノードの位置が動かない原則のただ 1 つの例外）の平行移動の量。
   * 動かさないなら null。当てる先は `scope`。
   */
  shift: GraphPoint | null;
  /**
   * `shift` を当てる範囲。`member` = その workspace（メンバー）の既存のノード。`top` = その最上位の囲いのすべてのメンバーの既存のノード
   * （worktree グループの中で、メンバーだけを動かしても空きが無いときだけ。グループごと動かす）。
   */
  scope: "member" | "top";
}

/**
 * 囲いごと動かす場合の置き場所。`memberPoints` はそのメンバーの点（新しいノードの仮の位置を含む）。メンバーだけの移動で重ならない場所が無く、
 * worktree グループの中のメンバーなら、グループごと動かす。
 */
function relocate(
  ctx: Ctx,
  top: LayoutTop,
  memberId: string,
  memberPoints: readonly GraphPoint[],
): { shift: GraphPoint; scope: "member" | "top" } {
  const t = findTranslation(ctx, top, new Map([[memberId, memberPoints]]));
  if (t.exact || top.kind !== "worktree") return { shift: snapPoint(t), scope: "member" };
  const all = new Map<string, readonly GraphPoint[]>();
  for (const m of top.members) {
    const pts = m.id === memberId ? memberPoints : (ctx.points.get(m.id) ?? []);
    if (pts.length > 0) all.set(m.id, pts);
  }
  return { shift: snapPoint(findTranslation(ctx, top, all)), scope: "top" };
}

function placeFirst(ctx: Ctx, top: LayoutTop, memberId: string): PlaceNodeResult {
  const t = findTranslation(ctx, top, new Map([[memberId, [{ x: 0, y: 0 }]]]));
  if (t.exact || top.kind !== "worktree") {
    const p = snapPoint(t);
    return { x: p.x, y: p.y, shift: null, scope: "member" };
  }
  // worktree グループの中で、メンバーだけでは置き場所が無い。グループごと動かす: 新しいノードは、グループの既存のメンバーの囲いの右隣に置いたものとして探す。
  const existing = top.members
    .filter((m) => m.id !== memberId)
    .map((m) => rectOfPoints(ctx.points.get(m.id) ?? []))
    .filter((r): r is GraphRect => r !== null);
  const u = unionRect(existing);
  if (u === null) {
    const p = snapPoint(t);
    return { x: p.x, y: p.y, shift: null, scope: "member" };
  }
  const rel = snapPoint({ x: u.x + u.w + FRAME_GAP + FRAME_PADDING, y: u.y + FRAME_HEADING });
  const r = relocate(ctx, top, memberId, [rel]);
  return { x: rel.x + r.shift.x, y: rel.y + r.shift.y, shift: r.shift, scope: r.scope };
}

/**
 * 新しい囲い（ノードがひとつも無いメンバー）の最初のノードの位置。空間のほかの囲いと重ならない、左上に最も近い場所。
 * 構成にそのメンバーが無ければ、面の左上の端。
 */
export function placeFrame(
  structure: LayoutStructure,
  positions: NodePositions,
  memberId: string,
): PlaceNodeResult {
  const ctx = buildCtx(structure, positions);
  const found = findMember(ctx, memberId);
  if (found === null) {
    const first = snapPoint({ x: FRAME_ORIGIN + FRAME_PADDING, y: FRAME_ORIGIN + FRAME_HEADING });
    return { ...first, shift: null, scope: "member" };
  }
  return placeFirst(ctx, found.top, memberId);
}

/**
 * 新しいノードの位置（`memberId` の囲いの中の、空いた升）。既存のノードは動かさない。囲いが広がって、ほかの囲いに重なる升は選ばない
 * （いまの外接の右 → 下の順に広げながら探す）。空きが無いときは、囲いごと `placeFrame` の場所へ移す（`shift`）。
 */
export function placeNode(
  structure: LayoutStructure,
  positions: NodePositions,
  memberId: string,
): PlaceNodeResult {
  const ctx = buildCtx(structure, positions);
  const found = findMember(ctx, memberId);
  if (found === null) return placeFrame(structure, positions, memberId);
  const { top } = found;
  const pts = ctx.points.get(memberId) ?? [];
  if (pts.length === 0) return placeFirst(ctx, top, memberId);

  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxX = Math.max(...pts.map((p) => p.x)) + GRAPH_NODE_WIDTH;
  const maxY = Math.max(...pts.map((p) => p.y)) + GRAPH_NODE_HEIGHT;
  const ox = snapToGrid(minX);
  const oy = snapToGrid(minY);
  const cols = Math.max(1, Math.ceil((maxX - ox) / GRAPH_CELL_WIDTH));
  const rows = Math.max(1, Math.ceil((maxY - oy) / GRAPH_CELL_HEIGHT));

  // 升の候補: いまの外接の中 → 右へ広げる → 下へ広げる（広げる量が小さい順）。
  const cells: { i: number; j: number; cost: number; down: number }[] = [];
  for (let j = 0; j < rows + CELL_EXPAND_MAX; j++) {
    for (let i = 0; i < cols + CELL_EXPAND_MAX; i++) {
      const right = Math.max(0, i - cols + 1);
      const down = Math.max(0, j - rows + 1);
      cells.push({ i, j, cost: right + down, down });
    }
  }
  cells.sort((a, b) => a.cost - b.cost || a.down - b.down || a.j - b.j || a.i - b.i);

  const nodeRect = (p: GraphPoint): GraphRect => ({
    x: p.x,
    y: p.y,
    w: GRAPH_NODE_WIDTH,
    h: GRAPH_NODE_HEIGHT,
  });
  const touched = new Set([top.id]);
  const baseline = new Map<number, Map<string, number>>();
  const baselineFor = (gap: number): Map<string, number> => {
    let b = baseline.get(gap);
    if (b === undefined) {
      b = pairMetrics(ctx.topFrames, touched, gap);
      baseline.set(gap, b);
    }
    return b;
  };

  const free = (p: GraphPoint, gap: number): boolean => {
    if (!inBounds(p)) return false;
    const r = nodeRect(p);
    return !pts.some((q) => overlaps(r, nodeRect(q), gap) > 0);
  };
  const fits = (p: GraphPoint, gap: number): boolean => {
    const next = new Map<string, readonly GraphPoint[]>(ctx.points);
    next.set(memberId, [...pts, p]);
    const frames2 = new Map(ctx.topFrames);
    frames2.set(top.id, topFramesOf(top, next));
    return excess(pairMetrics(frames2, touched, gap), baselineFor(gap)) === 0;
  };

  for (const gap of [FRAME_GAP, 0]) {
    for (const c of cells) {
      const p: GraphPoint = { x: ox + c.i * GRAPH_CELL_WIDTH, y: oy + c.j * GRAPH_CELL_HEIGHT };
      if (!free(p, gap)) continue;
      if (fits(p, gap)) return { x: p.x, y: p.y, shift: null, scope: "member" };
    }
  }

  // 詰んだ: 囲いごと動かす。新しいノードは、いまの外接の右隣（広げる最小）に置いたものとして、全体の置き場所を探す。
  const rel: GraphPoint = { x: ox + cols * GRAPH_CELL_WIDTH, y: oy };
  const r = relocate(ctx, top, memberId, [...pts, rel]);
  return { x: rel.x + r.shift.x, y: rel.y + r.shift.y, shift: r.shift, scope: r.scope };
}

/**
 * 最上位の囲い 1 つを、まるごと（含むメンバーすべて）動かす平行移動の量。ほかの囲いに重ならない、左上に最も近い場所へ。
 * `reconcileGraph` が、重なりを直すのに使う。囲いが無ければ null。
 */
export function placeTopFrame(
  structure: LayoutStructure,
  positions: NodePositions,
  topId: string,
): GraphPoint | null {
  const ctx = buildCtx(structure, positions);
  const top = ctx.tops.find((t) => t.id === topId);
  if (top === undefined) return null;
  const moving = new Map<string, readonly GraphPoint[]>();
  for (const m of top.members) {
    const pts = ctx.points.get(m.id) ?? [];
    if (pts.length > 0) moving.set(m.id, pts);
  }
  if (moving.size === 0) return null;
  return snapPoint(findTranslation(ctx, top, moving));
}

/**
 * worktree グループの中のメンバーの囲いを、ほかのメンバー（兄弟）の囲いの右隣へ動かす平行移動の量。兄弟どうしの重なりを直す最後の手段
 * （グループの外側の囲いが広がって、ほかの囲いに重なれば、その次の直しでグループごと動く）。兄弟が無い・囲いが無いなら null。
 */
export function placeMemberBeside(
  structure: LayoutStructure,
  positions: NodePositions,
  memberId: string,
): GraphPoint | null {
  const ctx = buildCtx(structure, positions);
  const found = findMember(ctx, memberId);
  if (found === null) return null;
  const mine = rectOfPoints(ctx.points.get(memberId) ?? []);
  const siblings = found.top.members
    .filter((m) => m.id !== memberId)
    .map((m) => rectOfPoints(ctx.points.get(m.id) ?? []))
    .filter((r): r is GraphRect => r !== null);
  const u = unionRect(siblings);
  if (mine === null || u === null) return null;
  return snapPoint({ x: u.x + u.w + FRAME_GAP - mine.x, y: u.y - mine.y });
}

/**
 * ドラッグの結果（`moves`: ノードの鍵 → 落とした位置）が、囲いの重なりを新しく作る・広げるなら、重ならない最も近い位置へ寄せる
 * （動かしたノードをまとめて同じ量だけずらす。相対の位置は保つ）。作らないなら、落とした位置のまま返す。
 * 返すのは、動かしたノードすべての最終の位置。重ならない場所が見つからないとき（座標の範囲の端）は、落とした位置のまま返す。
 */
export function resolveDrop(
  structure: LayoutStructure,
  positions: NodePositions,
  moves: ReadonlyMap<string, GraphPoint>,
): Map<string, GraphPoint> {
  const intended = new Map(moves);
  if (moves.size === 0) return intended;
  const ctx = buildCtx(structure, positions);
  const touched = new Set<string>();
  const memberOfKey = new Map<string, LayoutMember>();
  for (const top of ctx.tops)
    for (const m of top.members) for (const k of m.nodes) memberOfKey.set(k, m);
  for (const k of moves.keys()) {
    const m = memberOfKey.get(k);
    if (m === undefined) continue;
    const top = ctx.topOfMember.get(m.id);
    if (top !== undefined) touched.add(top.id);
  }
  if (touched.size === 0) return intended;

  const apply = (dx: number, dy: number): Map<string, readonly GraphPoint[]> => {
    const next = new Map<string, readonly GraphPoint[]>(ctx.points);
    const byMember = new Map<string, GraphPoint[]>();
    for (const top of ctx.tops) {
      if (!touched.has(top.id)) continue;
      for (const m of top.members) {
        const pts: GraphPoint[] = [];
        for (const k of m.nodes) {
          const base = moves.get(k);
          const orig = positions.get(k);
          if (base !== undefined) pts.push({ x: base.x + dx, y: base.y + dy });
          else if (orig !== undefined) pts.push(orig);
        }
        byMember.set(m.id, pts);
      }
    }
    for (const [id, pts] of byMember) next.set(id, pts);
    return next;
  };
  const framesFor = (points: MemberPoints): Map<string, LayoutFrame[]> => {
    const f = new Map(ctx.topFrames);
    for (const top of ctx.tops) {
      if (!touched.has(top.id)) continue;
      const fs = topFramesOf(top, points);
      if (fs.length === 0) f.delete(top.id);
      else f.set(top.id, fs);
    }
    return f;
  };
  const baseline = new Map<number, Map<string, number>>();
  const baselineFor = (gap: number): Map<string, number> => {
    let b = baseline.get(gap);
    if (b === undefined) {
      b = pairMetrics(ctx.topFrames, touched, gap);
      baseline.set(gap, b);
    }
    return b;
  };
  const score = (dx: number, dy: number, gap: number): number =>
    excess(pairMetrics(framesFor(apply(dx, dy)), touched, gap), baselineFor(gap));

  // 落とした位置が、重なりを新しく作らず広げもしないなら、そのまま（間 `FRAME_GAP` は、寄せるときの好みで、ここでは見ない）。
  if (score(0, 0, 0) === 0) return intended;

  // 動かした先の外接（触れた最上位の囲い）から、近くの囲いの辺にそろえる量を候補にする。
  const movedFrames = framesFor(apply(0, 0));
  const mine = [...touched]
    .map((id) => movedFrames.get(id)?.[0]?.rect)
    .filter((r): r is GraphRect => r !== undefined);
  const box = unionRect(mine);
  if (box === null) return intended;
  const dxs = new Set<number>([0]);
  const dys = new Set<number>([0]);
  let farRight = box.x + box.w;
  const topPartners: GraphRect[] = [];
  const sibPartners: GraphRect[] = [];
  const movedKeys = new Set(moves.keys());
  const movedMemberRects: GraphRect[] = [];
  for (const [id, fs] of ctx.topFrames) {
    if (!touched.has(id)) {
      topPartners.push(fs[0]!.rect);
      farRight = Math.max(farRight, fs[0]!.rect.x + fs[0]!.rect.w);
      continue;
    }
    // 触れた worktree グループの、動かさないメンバーの囲い（兄弟）も辺の候補にする。動かすメンバーの囲いは、兄弟と合わせる側の四角。
    const top = ctx.tops.find((t) => t.id === id);
    const nowFrames = movedFrames.get(id) ?? [];
    for (const f of fs.slice(1)) {
      const m = top?.members.find((x) => x.id === f.id);
      if (m === undefined) continue;
      if (m.nodes.some((k) => movedKeys.has(k))) {
        const now = nowFrames.find((x) => x.id === f.id);
        if (now !== undefined) movedMemberRects.push(now.rect);
      } else {
        sibPartners.push(f.rect);
      }
    }
  }
  const addEdges = (b: GraphRect, partners: readonly GraphRect[]): void => {
    for (const r of partners) {
      dxs.add(r.x - FRAME_GAP - (b.x + b.w));
      dxs.add(r.x + r.w + FRAME_GAP - b.x);
      dxs.add(r.x - b.x);
      dys.add(r.y - FRAME_GAP - (b.y + b.h));
      dys.add(r.y + r.h + FRAME_GAP - b.y);
      dys.add(r.y - b.y);
    }
  };
  addEdges(box, topPartners);
  const memberBox = unionRect(movedMemberRects);
  if (memberBox !== null) addEdges(memberBox, sibPartners);
  // 動かす前の位置へ戻す量も候補にする（動かす前の状態は、重なりを悪くしないので、見つからないときの確かな逃げ場になる）。
  const firstKey = [...moves.keys()].find((key) => positions.has(key));
  if (firstKey !== undefined) {
    const o = positions.get(firstKey)!;
    const m = moves.get(firstKey)!;
    dxs.add(o.x - m.x);
    dys.add(o.y - m.y);
  }
  const roundG = (v: number): number => Math.round(v / GRAPH_GRID) * GRAPH_GRID + 0;
  const dxList = uniqueSorted([...dxs].map(roundG), (v) => Math.abs(v), EDGE_CANDIDATES_MAX);
  const dyList = uniqueSorted([...dys].map(roundG), (v) => Math.abs(v), EDGE_CANDIDATES_MAX);
  const offsets: GraphPoint[] = [];
  for (const dx of dxList) for (const dy of dyList) offsets.push({ x: dx, y: dy });
  offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y || a.x - b.x);
  offsets.push({ x: roundG(farRight + FRAME_GAP - box.x + GRAPH_GRID), y: 0 }); // 最後の手段: 全部の右の外

  const result = (dx: number, dy: number): Map<string, GraphPoint> => {
    const out = new Map<string, GraphPoint>();
    for (const [k, p] of moves) out.set(k, { x: p.x + dx, y: p.y + dy });
    return out;
  };
  const okAt = (o: GraphPoint, gap: number): boolean => {
    for (const p of moves.values()) if (!inBounds({ x: p.x + o.x, y: p.y + o.y })) return false;
    return score(o.x, o.y, gap) === 0;
  };
  for (const gap of [FRAME_GAP, 0]) {
    for (const o of offsets) {
      if (okAt(o, gap) && (gap === 0 || okAt(o, 0))) return result(o.x, o.y);
    }
  }
  return intended;
}
