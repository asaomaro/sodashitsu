import {
  GRAPH_LOCAL_NODES_MAX,
  type Graph,
  type GraphOp,
  type NodeKey,
} from "@sodashitsu/protocol";
import { snapToGrid, type GraphPoint } from "./geometry.js";
import {
  GRAPH_CELL_HEIGHT,
  GRAPH_CELL_WIDTH,
  compactFrameSize,
  frameRectOf,
  layoutOverlaps,
  nodePositions,
  placeMemberBeside,
  placeNode,
  placeTopFrame,
  type LayoutMember,
  type LayoutStructure,
  type LayoutTop,
  type PlaceNodeResult,
} from "./graphLayout.js";
import { LOCAL_MACHINE } from "./nodeKey.js";

/**
 * 連携のグラフの維持（20261008-graph-first の design 追補 01「維持」。D9）。構造のできごとごとの変換は書かず、**不変条件の検査と修復**を 1 つの関数にする。
 *
 * 不変条件:
 * - (I1) 手元の、一時的でない pane のすべてに、ノードがある（上限の中で）。workspace ごとに、少なくとも 1 つのノードがある。
 * - (I2) 手元のノードの pane は開いている——閉じた pane のノードは `GraphPaneCleanup` が消す（ここでは触れない）。
 * - (I3) 囲いは重ならない（`graphLayout` の規則）。
 *
 * `reconcileGraph` は、破れている所だけを直す `GraphOp` の列を返す純粋な関数。**破れていなければ空**（何度呼んでも同じ結果。
 * 直した後の `Graph` にもう一度かけると空になる）。線は触らない。既存のノードの位置は、直すのに要る場合のほか動かさない。
 */
export interface ReconcileHints {
  /**
   * 別の workspace から**移ってきた**ノード（pane が別の workspace へ移った）。移った先の囲いの空き場所へ置き直す。
   * 呼び出し側（サーバ）が、前回の構成との差から作る。無ければ、置き直さない（囲いが重なれば、重なりの直しで動く）。
   */
  arrived?: ReadonlySet<string>;
  /** 構成（含むノードの鍵・属する囲い）が変わった囲いの id。重なりを直すとき、この側を先に動かす（どちらが後かの手がかり）。 */
  changed?: ReadonlySet<string>;
  /**
   * 移行（`schema` 1 → 2）のとき: 外接が大きすぎる workspace（ノードの数から見込む大きさの 4 倍を超える）を、ほぼ正方形のグリッドに詰め直してから
   * 重なりを直す。以前の画面は、全体で 1 枚の面に好きなように置いていたので、1 つの workspace のノードが遠くに散らばり、別の workspace の
   * ノードを挟んでいることがある——そのままだと囲いが巨大になって重なる。
   */
  repack?: boolean;
}

/** 外接が大きすぎる、とみなす倍率（面積）。 */
export const GRAPH_OVERSIZE_FACTOR = 4;

/** 「workspace ごとに少なくとも 1 つ」のために空けておく手元のノードの枠の数。2 つ目以降のノードは、ここまでしか足さない。 */
export const GRAPH_FIRST_NODE_RESERVE = 8;

/** 修復の繰り返しの上限（囲いの数に比例）。 */
const REPAIR_ROUNDS_FACTOR = 2;

function isLocal(key: string): boolean {
  return key.startsWith(`${LOCAL_MACHINE}:`);
}

/** workspace の id の順（作った順に増える連番の末尾の数字。無ければ文字の順）。大きいほど後。 */
function idRank(id: string): [number, string] {
  const m = /(\d+)$/.exec(id);
  return [m ? Number(m[1]) : -1, id];
}

function compareIds(a: string, b: string): number {
  const [na, sa] = idRank(a);
  const [nb, sb] = idRank(b);
  return na - nb || (sa < sb ? -1 : sa > sb ? 1 : 0);
}

/** 動かす側を決める手がかり: 別のマシンの囲いは動かさない側（値が小さい）、worktree グループは先頭のメンバーの id。 */
function topRankId(top: LayoutTop): string {
  return top.kind === "machine" ? "" : (top.members[0]?.id ?? top.id);
}

export function reconcileGraph(
  structure: LayoutStructure,
  graph: Pick<Graph, "nodes">,
  hints: ReconcileHints = {},
): GraphOp[] {
  const tops = structure.spaces.flatMap((s) => [...s.tops]);
  const topOfMember = new Map<string, LayoutTop>();
  const memberOfKey = new Map<string, LayoutMember>();
  const memberById = new Map<string, LayoutMember>();
  for (const top of tops) {
    for (const m of top.members) {
      topOfMember.set(m.id, top);
      memberById.set(m.id, m);
      for (const k of m.nodes) memberOfKey.set(k, m);
    }
  }

  const pos = new Map<string, GraphPoint>(nodePositions(graph.nodes));
  const original = new Map(pos);
  const addedOrder: string[] = [];
  const shiftMember = (m: LayoutMember, d: GraphPoint): void => {
    for (const k of m.nodes) {
      const p = pos.get(k);
      if (p !== undefined) pos.set(k, { x: p.x + d.x, y: p.y + d.y });
    }
  };
  const applyPlacement = (memberId: string, key: string, r: PlaceNodeResult): void => {
    if (r.shift !== null) {
      const top = topOfMember.get(memberId)!;
      for (const m of r.scope === "top" ? top.members : [memberById.get(memberId)!]) {
        shiftMember(m, r.shift);
      }
    }
    pos.set(key, { x: r.x, y: r.y });
  };

  // 0. 移行: 外接が大きすぎる workspace を詰め直す。ノードは (y, x) の順に、いまの外接の左上から升に並べる。
  if (hints.repack === true) {
    for (const top of tops) {
      if (top.kind === "machine") continue;
      for (const m of top.members) {
        const keys = m.nodes.filter((k) => pos.has(k));
        if (keys.length < 2) continue;
        const pts = keys.map((k) => pos.get(k)!);
        const rect = frameRectOf(pts);
        if (rect === null) continue;
        const compact = compactFrameSize(keys.length);
        if (rect.w * rect.h <= compact.w * compact.h * GRAPH_OVERSIZE_FACTOR) continue;
        const ordered = [...keys].sort((a, b) => {
          const pa = pos.get(a)!;
          const pb = pos.get(b)!;
          return pa.y - pb.y || pa.x - pb.x || (a < b ? -1 : a > b ? 1 : 0);
        });
        const ox = snapToGrid(Math.min(...pts.map((p) => p.x)));
        const oy = snapToGrid(Math.min(...pts.map((p) => p.y)));
        ordered.forEach((k, i) => {
          pos.set(k, {
            x: ox + (i % compact.cols) * GRAPH_CELL_WIDTH,
            y: oy + Math.floor(i / compact.cols) * GRAPH_CELL_HEIGHT,
          });
        });
      }
    }
  }

  // 1. 別の workspace から移ってきたノードを、移った先の囲いへ置き直す。
  for (const key of [...(hints.arrived ?? [])].sort()) {
    const m = memberOfKey.get(key);
    if (m === undefined || !pos.has(key)) continue;
    pos.delete(key);
    applyPlacement(m.id, key, placeNode(structure, pos, m.id));
  }

  // 2. ノードの無い pane にノードを足す。まず workspace（メンバー）ごとの最初の 1 つ、次に残り（上限の手前まで）。
  let localCount = [...pos.keys()].filter(isLocal).length;
  const missingOf = (m: LayoutMember): string[] => m.nodes.filter((k) => isLocal(k) && !pos.has(k));
  const hasAnyNode = (m: LayoutMember): boolean => m.nodes.some((k) => pos.has(k));
  const addNode = (m: LayoutMember, key: string): void => {
    applyPlacement(m.id, key, placeNode(structure, pos, m.id));
    addedOrder.push(key);
    localCount++;
  };
  const members = tops.flatMap((t) => [...t.members]);
  for (const m of members) {
    if (hasAnyNode(m) || localCount >= GRAPH_LOCAL_NODES_MAX) continue;
    const first = missingOf(m)[0];
    if (first !== undefined) addNode(m, first);
  }
  for (const m of members) {
    for (const key of missingOf(m)) {
      if (localCount >= GRAPH_LOCAL_NODES_MAX - GRAPH_FIRST_NODE_RESERVE) break;
      addNode(m, key);
    }
  }

  // 3. 囲いの重なりを直す。後から来た側（構成が変わった側。分からなければ id の順で後ろの側）を、ほかの囲いに重ならない場所へ動かす。
  const moverOf = (a: string, b: string): { id: string; sibling: boolean } | null => {
    const ma = memberById.get(a);
    const mb = memberById.get(b);
    const ta = tops.find((t) => t.id === a);
    const tb = tops.find((t) => t.id === b);
    // 兄弟（同じ worktree グループの中のメンバーどうし）
    if (
      ma !== undefined &&
      mb !== undefined &&
      topOfMember.get(a)?.kind === "worktree" &&
      topOfMember.get(a) === topOfMember.get(b)
    ) {
      const later = pick(a, b, a, b);
      return { id: later, sibling: true };
    }
    // 最上位どうし。最上位の囲いの id は、worktree グループなら `LayoutTop.id`、そうでなければメンバーの id（= 最上位の id）。
    const topA = ta ?? topOfMember.get(a);
    const topB = tb ?? topOfMember.get(b);
    if (topA === undefined || topB === undefined) return null;
    const later = pick(topA.id, topB.id, topRankId(topA), topRankId(topB));
    return { id: later, sibling: false };
  };
  const pick = (idA: string, idB: string, rankA: string, rankB: string): string => {
    const ca = hints.changed?.has(idA) === true;
    const cb = hints.changed?.has(idB) === true;
    if (ca !== cb) return ca ? idA : idB;
    return compareIds(rankA, rankB) >= 0 ? idA : idB;
  };

  const maxRounds = Math.max(8, tops.length * REPAIR_ROUNDS_FACTOR + members.length);
  const moves = new Map<string, number>();
  for (let round = 0; round < maxRounds; round++) {
    const overlaps = layoutOverlaps(structure, pos, 0);
    if (overlaps.size === 0) break;
    // 重なりが大きい組から、決まった順で 1 組ずつ直す。
    const [pairKey] = [...overlaps].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]!;
    const [a, b] = pairKey.split("\u0000") as [string, string];
    const mover = moverOf(a, b);
    if (mover === null) break;
    const times = (moves.get(mover.id) ?? 0) + 1;
    moves.set(mover.id, times);
    if (times > 3) break; // 同じ囲いを何度動かしても直らない（座標の範囲の端など）。諦める。
    if (mover.sibling) {
      const d = placeMemberBeside(structure, pos, mover.id);
      if (d === null) break;
      shiftMember(memberById.get(mover.id)!, d);
    } else {
      const d = placeTopFrame(structure, pos, mover.id);
      if (d === null) break;
      const top = tops.find((t) => t.id === mover.id) ?? topOfMember.get(mover.id)!;
      for (const m of top.members) shiftMember(m, d);
    }
  }

  // 結果: 足したノード → 動かしたノード。
  const ops: GraphOp[] = [];
  for (const key of addedOrder) {
    const p = pos.get(key)!;
    ops.push({ op: "add_node", key: key as NodeKey, x: p.x, y: p.y });
  }
  for (const [key, was] of original) {
    const p = pos.get(key);
    if (p !== undefined && (p.x !== was.x || p.y !== was.y)) {
      ops.push({ op: "move_node", key: key as NodeKey, x: p.x, y: p.y });
    }
  }
  return ops;
}
