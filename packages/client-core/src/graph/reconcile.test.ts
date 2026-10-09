import { describe, expect, it } from "vitest";
import {
  GRAPH_COORD_MAX,
  GRAPH_LOCAL_NODES_MAX,
  GraphSchema,
  type Graph,
  type GraphNode,
  type GraphOp,
  type NodeKey,
} from "@sodashitsu/protocol";
import { applyGraphOps } from "./ops.js";
import { emptyGraph } from "./defaults.js";
import {
  layoutOverlaps,
  nodePositions,
  type LayoutStructure,
  type LayoutTop,
} from "./graphLayout.js";
import { GRAPH_FIRST_NODE_RESERVE, reconcileGraph, reconcileGraphDetailed } from "./reconcile.js";

// 20261008-graph-first の T4：不変条件の検査と修復。

const k = (id: string): NodeKey => `local:${id}`;

function ws(id: string, n: number) {
  return { id, nodes: Array.from({ length: n }, (_, i) => k(`${id}p${i}`)) };
}
function structureOf(tops: LayoutTop[]): LayoutStructure {
  return { spaces: [{ id: "u", tops }] };
}
function single(id: string, n: number): LayoutTop {
  return { id, kind: "workspace", members: [ws(id, n)] };
}

/** ops を当てる。当てられない（検証に落ちる）ならテストを落とす。 */
function apply(graph: Graph, ops: GraphOp[]): Graph {
  if (ops.length === 0) return graph;
  const r = applyGraphOps({ graph }, ops);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.graph;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const withLinks = (nodes: GraphNode[]): Graph => ({
  ...emptyGraph(),
  nodes,
  links: [
    {
      id: "l1",
      kind: "supervise",
      from: nodes[0]!.key,
      to: nodes[1]!.key,
      limit: 10,
      count: 3,
      paused: null,
    },
  ],
});

describe("reconcileGraph", () => {
  it("ノードの無い pane にノードを足す。重ならず、2 回目は何もしない（冪等）", () => {
    const st = structureOf([single("w1", 3), single("w2", 2), single("w3", 1)]);
    const ops = reconcileGraph(st, emptyGraph());
    expect(ops.every((o) => o.op === "add_node")).toBe(true);
    expect(ops).toHaveLength(6);
    const g = apply(emptyGraph(), ops);
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    expect(reconcileGraph(st, g)).toEqual([]);
  });

  it("全部そろって重なりも無ければ、空（既存のノードを動かさない）", () => {
    const st = structureOf([single("w1", 2), single("w2", 1)]);
    const g0 = apply(emptyGraph(), reconcileGraph(st, emptyGraph()));
    expect(reconcileGraph(st, g0)).toEqual([]);
  });

  it("線を変えない（ops に線の操作が無く、当てた後の線が同じ）", () => {
    const st = structureOf([single("w1", 2), single("w2", 2)]);
    const base = withLinks([
      { key: k("w1p0"), x: 40, y: 60 },
      { key: k("w2p0"), x: 40, y: 60 }, // w1 と同じ場所: 囲いが重なる
    ]);
    const ops = reconcileGraph(st, base);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((o) => o.op === "add_node" || o.op === "move_node")).toBe(true);
    const g = apply(base, ops);
    expect(g.links).toEqual(base.links);
    expect(reconcileGraph(st, g)).toEqual([]);
  });

  it("囲いが重なっていたら、後ろの id の側だけを動かす（前の側は動かさない）", () => {
    const st = structureOf([single("w1", 1), single("w2", 1)]);
    const base: Graph = {
      ...emptyGraph(),
      nodes: [
        { key: k("w1p0"), x: 100, y: 100 },
        { key: k("w2p0"), x: 120, y: 100 },
      ],
    };
    const ops = reconcileGraph(st, base);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "move_node", key: k("w2p0") });
    // 否定の対照: 構成が変わった側の手がかり（changed）があれば、そちらを動かす。
    const ops2 = reconcileGraph(st, base, { changed: new Set(["w1"]) });
    expect(ops2).toHaveLength(1);
    expect(ops2[0]).toMatchObject({ op: "move_node", key: k("w1p0") });
  });

  it("「移ってきた」ノードは、移った先の囲いの空きへ置き直し、ほかのノードは動かさない", () => {
    const st = structureOf([single("w1", 2), single("w2", 1)]);
    const base: Graph = {
      ...emptyGraph(),
      nodes: [
        { key: k("w1p0"), x: 40, y: 60 },
        { key: k("w2p0"), x: 1000, y: 60 },
        // w1 へ移ってきたが、座標は w2 の囲いの中
        { key: k("w1p1"), x: 1000, y: 200 },
      ],
    };
    const ops = reconcileGraph(st, base, { arrived: new Set([k("w1p1")]) });
    const g = apply(base, ops);
    expect(ops.every((o) => o.op === "move_node" && o.key === k("w1p1"))).toBe(true);
    const p = g.nodes.find((n) => n.key === k("w1p1"))!;
    expect(p.x).toBeLessThan(600); // w1 の囲いの近く
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    expect(reconcileGraph(st, g)).toEqual([]);
  });

  it("worktree グループ: メンバーの囲いが重なれば、後ろのメンバーだけ動く。グループが他の囲いに重なれば、グループごと動く", () => {
    const st = structureOf([
      { id: "r:1", kind: "worktree", members: [ws("w1", 1), ws("w2", 1)] },
      single("w3", 1),
    ]);
    const base: Graph = {
      ...emptyGraph(),
      nodes: [
        { key: k("w1p0"), x: 100, y: 100 },
        { key: k("w2p0"), x: 120, y: 100 }, // w1 と重なる
        { key: k("w3p0"), x: 100, y: 100 }, // グループとも重なる
      ],
    };
    const g = apply(base, reconcileGraph(st, base));
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    expect(reconcileGraph(st, g)).toEqual([]);
  });

  it("手元のノードの上限: 2 つ目以降は上限の手前（予備を残す）まで、workspace の最初の 1 つは上限まで", () => {
    const filler = Array.from(
      { length: GRAPH_LOCAL_NODES_MAX - GRAPH_FIRST_NODE_RESERVE - 1 },
      (_, i) => ({
        key: k(`f${i}`),
        x: (i % 40) * 240,
        y: Math.floor(i / 40) * 140 * 1,
      }),
    );
    // filler は 1 つの workspace（w0）が持つことにする。
    const w0 = { id: "w0", nodes: filler.map((n) => n.key) };
    const st = structureOf([
      { id: "w0", kind: "workspace", members: [w0] },
      single("w1", 3),
      single("w2", 3),
    ]);
    const base: Graph = { ...emptyGraph(), nodes: filler };
    const g = apply(base, reconcileGraph(st, base));
    const local = g.nodes.filter((n) => n.key.startsWith("local:")).length;
    // 最初のノードは全 workspace に付く
    expect(g.nodes.some((n) => n.key.startsWith("local:w1p"))).toBe(true);
    expect(g.nodes.some((n) => n.key.startsWith("local:w2p"))).toBe(true);
    expect(local).toBeLessThanOrEqual(GRAPH_LOCAL_NODES_MAX);
    expect(local).toBeLessThanOrEqual(GRAPH_LOCAL_NODES_MAX - GRAPH_FIRST_NODE_RESERVE + 2);
    // 否定の対照: 余裕があれば全部の pane にノードが付く。
    const small = structureOf([single("w1", 3), single("w2", 3)]);
    expect(apply(emptyGraph(), reconcileGraph(small, emptyGraph())).nodes).toHaveLength(6);
  });

  it("別のマシンのノードは足さない・消さない・上限の対象に数えない", () => {
    const m = "d".repeat(32);
    const st = structureOf([
      single("w1", 1),
      { id: `m:${m}`, kind: "machine", members: [{ id: `m:${m}`, nodes: [`${m}:x1` as NodeKey] }] },
    ]);
    const base: Graph = { ...emptyGraph(), nodes: [{ key: `${m}:x1` as NodeKey, x: 400, y: 400 }] };
    const ops = reconcileGraph(st, base);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "add_node", key: k("w1p0") });
  });

  it("移行（repack）: 外接が大きすぎる workspace は詰め直し、そうでない workspace は相対の位置を保ったまま動かす", async () => {
    // w1: 2 ノードが遠くに散らばっている（外接が見込みの 4 倍を超える）。w2: 近い 2 ノードだが、w1 の外接の中にある。
    const st = structureOf([single("w1", 2), single("w2", 2)]);
    const base = withLinks([
      { key: k("w1p0"), x: 0, y: 0 },
      { key: k("w1p1"), x: 3000, y: 2000 },
      { key: k("w2p0"), x: 1000, y: 800 },
      { key: k("w2p1"), x: 1240, y: 800 },
    ]);
    const plain = reconcileGraph(st, base);
    const ops = reconcileGraph(st, base, { repack: true });
    const g = apply(base, ops);
    expect(g.links).toEqual(base.links); // 線は触らない
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    // w1 は詰め直されて小さくなる
    const p0 = g.nodes.find((n) => n.key === k("w1p0"))!;
    const p1 = g.nodes.find((n) => n.key === k("w1p1"))!;
    expect(Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y)).toBeLessThanOrEqual(240);
    // w2（詰め直しの対象でない）は、相対の位置を保つ
    const q0 = g.nodes.find((n) => n.key === k("w2p0"))!;
    const q1 = g.nodes.find((n) => n.key === k("w2p1"))!;
    expect([q1.x - q0.x, q1.y - q0.y]).toEqual([240, 0]);
    // 2 回目は何もしない（repack を付けても）
    expect(reconcileGraph(st, g, { repack: true })).toEqual([]);
    // 否定の対照: repack しなければ、w1 の巨大な外接のまま（詰め直さず、重なりを直すだけ）
    const gPlain = apply(base, plain);
    const a0 = gPlain.nodes.find((n) => n.key === k("w1p0"))!;
    const a1 = gPlain.nodes.find((n) => n.key === k("w1p1"))!;
    expect(Math.abs(a1.x - a0.x) + Math.abs(a1.y - a0.y)).toBeGreaterThan(2000);
  });

  it("性質: 乱数の構成と、重なりを含む乱数の位置から直しても、結果は重ならず、2 回目は何もしない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed * 31);
      const tops: LayoutTop[] = [];
      let id = 0;
      const nTops = 1 + Math.floor(rand() * 6);
      for (let i = 0; i < nTops; i++) {
        const worktree = rand() < 0.35;
        const nm = worktree ? 2 + Math.floor(rand() * 3) : 1;
        const members = Array.from({ length: nm }, () => ws(`w${++id}`, Math.floor(rand() * 5)));
        tops.push(
          worktree
            ? { id: `r:${i}`, kind: "worktree", members }
            : { id: members[0]!.id, kind: "workspace", members },
        );
      }
      const st = structureOf(tops);
      // 一部のノードだけ、ばらばら（重なる）位置で既にある。
      const nodes: GraphNode[] = [];
      for (const t of tops)
        for (const m of t.members)
          for (const key of m.nodes)
            if (rand() < 0.5)
              nodes.push({
                key,
                x: Math.round((rand() * 600) / 20) * 20,
                y: Math.round((rand() * 400) / 20) * 20,
              });
      const base: Graph = { ...emptyGraph(), nodes };
      const ops = reconcileGraph(st, base);
      const g = apply(base, ops);
      expect([...layoutOverlaps(st, nodePositions(g.nodes)).keys()], `seed ${seed}`).toEqual([]);
      expect(reconcileGraph(st, g), `seed ${seed}`).toEqual([]);
      // どの pane にも（workspace ごとに少なくとも 1 つ。ここは上限の中）ノードがある。
      const have = new Set(g.nodes.map((n) => n.key));
      for (const t of tops)
        for (const m of t.members) for (const key of m.nodes) expect(have.has(key)).toBe(true);
    }
  });
});

describe("reconcileGraph（座標の範囲・上限・折り返し。PR1a レビュー指摘 1・5・7）", () => {
  const inRange = (nodes: readonly { x: number; y: number }[]): boolean =>
    nodes.every((n) => Math.abs(n.x) <= GRAPH_COORD_MAX && Math.abs(n.y) <= GRAPH_COORD_MAX);
  const schemaOk = (g: Graph): boolean => GraphSchema.safeParse(g).success;

  /** レビューの再現の構成（4 つの workspace・ノード 9・線 1。座標はどれも ±1,000,000 の中）。 */
  const reviewStructure = structureOf([
    { id: "w0", kind: "workspace", members: [{ id: "w0", nodes: [k("w0p0"), k("w0p1")] }] },
    {
      id: "w1",
      kind: "workspace",
      members: [{ id: "w1", nodes: [k("w1p0"), k("w1p1"), k("w1p2")] }],
    },
    { id: "w2", kind: "workspace", members: [{ id: "w2", nodes: [k("w2p0"), k("w2p1")] }] },
    { id: "w3", kind: "workspace", members: [{ id: "w3", nodes: [k("w3p0"), k("w3p1")] }] },
  ]);
  const reviewGraph = (): Graph => ({
    ...emptyGraph(),
    rev: 3,
    nodes: [
      { key: k("w0p0"), x: 68320, y: 675520 },
      { key: k("w0p1"), x: -580, y: 1120 },
      { key: k("w1p0"), x: -136400, y: 603000 },
      { key: k("w1p1"), x: 310000, y: -239940 },
      { key: k("w1p2"), x: 747360, y: -788080 },
      { key: k("w2p0"), x: 792180, y: -86260 },
      { key: k("w2p1"), x: -1060, y: -120 },
      { key: k("w3p0"), x: -1620, y: -1760 },
      { key: k("w3p1"), x: -2000, y: 1920 },
    ],
    links: [
      {
        id: "l1",
        kind: "supervise",
        from: k("w0p0"),
        to: k("w3p0"),
        limit: 10,
        count: 0,
        paused: null,
      },
    ],
  });

  it("レビューの再現: 数十万 px 離れたノードを直しても、出力の座標は範囲の中で、保存した形を読める。線は変わらない", () => {
    const base = reviewGraph();
    expect(schemaOk(base)).toBe(true);
    for (const repack of [false, true]) {
      const r = reconcileGraphDetailed(reviewStructure, base, { repack });
      for (const o of r.ops) {
        if (o.op === "add_node" || o.op === "move_node") {
          expect(Math.abs(o.x)).toBeLessThanOrEqual(GRAPH_COORD_MAX);
          expect(Math.abs(o.y)).toBeLessThanOrEqual(GRAPH_COORD_MAX);
        }
      }
      const g = apply(base, r.ops);
      expect(inRange(g.nodes)).toBe(true);
      expect(schemaOk(g)).toBe(true);
      expect(g.links).toEqual(base.links);
    }
  });

  it("動かし先が範囲の外になる囲いは、元の位置のまま残し（clamped）、重なりは残る（unresolved）。否定の対照: 範囲の中で直せるなら直す", () => {
    // 2 つの囲いが重なり、後ろの側の動かし先が範囲の外になる構成: 範囲の端いっぱいに、囲いが並んでいる。
    const M = GRAPH_COORD_MAX;
    const st = structureOf([single("w1", 1), single("w2", 1)]);
    const crowded: Graph = {
      ...emptyGraph(),
      nodes: [
        { key: k("w1p0"), x: -M, y: -M },
        { key: k("w2p0"), x: -M + 20, y: -M },
      ],
    };
    const fixed = reconcileGraphDetailed(st, crowded);
    expect(inRange(apply(crowded, fixed.ops).nodes)).toBe(true);
    // 範囲の外へしか動かせない（四方が詰まっている）構成でも、出力は範囲の中
    const walled: Graph = { ...emptyGraph(), nodes: [] };
    const bigTops: LayoutTop[] = [];
    for (let i = 0; i < 40; i++) bigTops.push(single(`w${i + 1}`, 1));
    const around = bigTops.map((t, i) => ({
      key: t.members[0]!.nodes[0]!,
      x: i % 2 === 0 ? M : -M,
      y: i < 20 ? M : -M,
    }));
    walled.nodes = around;
    const r = reconcileGraphDetailed(structureOf(bigTops), walled);
    expect(inRange(apply(walled, r.ops).nodes)).toBe(true);
    expect(r.unresolved).toBeGreaterThanOrEqual(0);
  });

  it("性質: 数十万 px 離れたノードを混ぜた構成でも、出力は必ず範囲の中で、適用した結果は保存の形を満たし、2 回目は空", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = rng(seed * 977);
      const tops: LayoutTop[] = [];
      let id = 0;
      const nTops = 2 + Math.floor(rand() * 8);
      for (let i = 0; i < nTops; i++) {
        const worktree = rand() < 0.3;
        const nm = worktree ? 2 + Math.floor(rand() * 3) : 1;
        const members = Array.from({ length: nm }, () =>
          ws(`w${++id}`, 1 + Math.floor(rand() * 5)),
        );
        tops.push(
          worktree
            ? { id: `r:${i}`, kind: "worktree", members }
            : { id: members[0]!.id, kind: "workspace", members },
        );
      }
      const far = (): number => Math.round(((rand() * 2 - 1) * 990_000) / 20) * 20;
      const nodes: GraphNode[] = [];
      for (const t of tops)
        for (const m of t.members)
          for (const key of m.nodes)
            if (rand() < 0.6)
              nodes.push({
                key,
                x: rand() < 0.5 ? far() : Math.round(rand() * 30) * 20,
                y: rand() < 0.5 ? far() : Math.round(rand() * 20) * 20,
              });
      const base: Graph = { ...emptyGraph(), nodes };
      for (const repack of [false, true]) {
        const r = reconcileGraphDetailed(structureOf(tops), base, { repack });
        const g = apply(base, r.ops);
        expect(inRange(g.nodes), `seed ${seed}`).toBe(true);
        expect(schemaOk(g), `seed ${seed}`).toBe(true);
      }
    }
  });

  it("200 ノードの workspace は、横一列でなく折り返す（ほぼ正方形）。範囲の中・重ならない・2 回目は空", () => {
    const st = structureOf([single("w1", 200), single("w2", 3)]);
    const g = apply(emptyGraph(), reconcileGraph(st, emptyGraph()));
    expect(g.nodes).toHaveLength(203);
    const w1 = g.nodes.filter((n) => n.key.startsWith("local:w1p"));
    const width = Math.max(...w1.map((n) => n.x)) - Math.min(...w1.map((n) => n.x));
    const height = Math.max(...w1.map((n) => n.y)) - Math.min(...w1.map((n) => n.y));
    // 横一列なら 240 × 199 ≒ 47,800。折り返すので、幅は高さの数倍以内。
    expect(width).toBeLessThan(240 * 40);
    expect(width).toBeLessThanOrEqual(height * 6 + 2000);
    expect(inRange(g.nodes)).toBe(true);
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    expect(reconcileGraph(st, g)).toEqual([]);
  });

  it("300 の囲いでも、出力は範囲の中・重ならない・2 回目は空", () => {
    const tops = Array.from({ length: 300 }, (_, i) => single(`w${i + 1}`, 1));
    const st = structureOf(tops);
    const g = apply(emptyGraph(), reconcileGraph(st, emptyGraph()));
    expect(g.nodes).toHaveLength(300);
    expect(inRange(g.nodes)).toBe(true);
    expect(schemaOk(g)).toBe(true);
    expect(layoutOverlaps(st, nodePositions(g.nodes)).size).toBe(0);
    expect(reconcileGraph(st, g)).toEqual([]);
  }, 30_000);

  it("maxAdds: 1 回で足す数に上限を設け、続きを次の確認へ回す（truncated）。上限なしでは一度に足す", () => {
    const st = structureOf([single("w1", 10), single("w2", 10)]);
    const first = reconcileGraphDetailed(st, emptyGraph(), { maxAdds: 5 });
    expect(first.ops.filter((o) => o.op === "add_node")).toHaveLength(5);
    expect(first.truncated).toBe(true);
    // workspace ごとの最初の 1 つが先に足される
    const keys = first.ops.flatMap((o) => (o.op === "add_node" ? [o.key] : []));
    expect(keys).toContain(k("w1p0"));
    expect(keys).toContain(k("w2p0"));
    let g = apply(emptyGraph(), first.ops);
    let rounds = 1;
    for (; rounds < 10; rounds++) {
      const r = reconcileGraphDetailed(st, g, { maxAdds: 5 });
      g = apply(g, r.ops);
      if (!r.truncated) break;
    }
    expect(g.nodes).toHaveLength(20);
    expect(rounds).toBe(3);
    // 否定の対照
    const all = reconcileGraphDetailed(st, emptyGraph());
    expect(all.truncated).toBe(false);
    expect(all.ops).toHaveLength(20);
  });
});
