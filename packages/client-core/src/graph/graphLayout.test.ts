import { describe, expect, it } from "vitest";
import { GRAPH_COORD_MAX, type NodeKey } from "@sodashitsu/protocol";
import {
  FRAME_GAP,
  FRAME_HEADING,
  FRAME_MIN_WIDTH,
  FRAME_PADDING,
  GRAPH_CELL_HEIGHT,
  GRAPH_CELL_WIDTH,
  frames,
  layoutOverlaps,
  overlapIncreases,
  overlaps,
  placeFrame,
  placeNode,
  placeTopFrame,
  resolveDrop,
  type LayoutStructure,
  type LayoutTop,
} from "./graphLayout.js";
import { GRAPH_GRID, GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, type GraphPoint } from "./geometry.js";

// 20261008-graph-first の T2：囲いと置き場所の計算。

const k = (id: string): NodeKey => `local:${id}`;

function ws(id: string, n: number): { id: string; nodes: NodeKey[] } {
  return { id, nodes: Array.from({ length: n }, (_, i) => k(`${id}n${i}`)) };
}

/** 擬似乱数（再現できる）。 */
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

function structureOf(tops: LayoutTop[]): LayoutStructure {
  return { spaces: [{ id: "u", tops }] };
}

/** 置き場所の結果を位置の引き当てに反映する（`shift` は scope の範囲の既存のノードに当てる）。 */
function applyPlacement(
  st: LayoutStructure,
  pos: Map<string, GraphPoint>,
  memberId: string,
  key: NodeKey,
  r: { x: number; y: number; shift: GraphPoint | null; scope: "member" | "top" },
): void {
  if (r.shift !== null) {
    const tops = st.spaces.flatMap((sp) => sp.tops);
    const top = tops.find((t) => t.members.some((m) => m.id === memberId))!;
    const targets = r.scope === "top" ? top.members : top.members.filter((m) => m.id === memberId);
    for (const m of targets) {
      for (const key2 of m.nodes) {
        const p = pos.get(key2);
        if (p) pos.set(key2, { x: p.x + r.shift.x, y: p.y + r.shift.y });
      }
    }
  }
  pos.set(key, { x: r.x, y: r.y });
}

describe("frames / overlaps", () => {
  it("workspace の囲いは、ノードの外接 + 余白（見出し 40・周り 20）、幅は 320 以上", () => {
    const m = ws("w1", 2);
    const st = structureOf([{ id: "w1", kind: "workspace", members: [m] }]);
    const pos = new Map<string, GraphPoint>([
      [m.nodes[0]!, { x: 100, y: 200 }],
      [m.nodes[1]!, { x: 400, y: 300 }],
    ]);
    const [f] = frames(st, pos);
    expect(f).toMatchObject({ id: "w1", kind: "workspace", parentId: null });
    expect(f!.rect).toEqual({
      x: 100 - FRAME_PADDING,
      y: 200 - FRAME_HEADING,
      w: 400 + GRAPH_NODE_WIDTH + FRAME_PADDING - (100 - FRAME_PADDING),
      h: 300 + GRAPH_NODE_HEIGHT + FRAME_PADDING - (200 - FRAME_HEADING),
    });
    const one = new Map<string, GraphPoint>([[m.nodes[0]!, { x: 0, y: 0 }]]);
    expect(frames(st, one)[0]!.rect.w).toBe(FRAME_MIN_WIDTH);
  });

  it("ノードの無い workspace には囲いが出ない。worktree グループは、外側の囲いと中の囲いが出る", () => {
    const a = ws("a", 1);
    const b = ws("b", 0);
    const c = ws("c", 1);
    const st = structureOf([{ id: "r:x", kind: "worktree", members: [a, b, c] }]);
    const pos = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 100, y: 100 }],
      [c.nodes[0]!, { x: 500, y: 100 }],
    ]);
    const fs = frames(st, pos);
    expect(fs.map((f) => [f.id, f.kind, f.parentId])).toEqual([
      ["r:x", "worktree", null],
      ["a", "workspace", "r:x"],
      ["c", "workspace", "r:x"],
    ]);
    const g = fs[0]!.rect;
    for (const f of fs.slice(1)) {
      expect(f.rect.x).toBeGreaterThan(g.x);
      expect(f.rect.y).toBeGreaterThan(g.y);
      expect(f.rect.x + f.rect.w).toBeLessThan(g.x + g.w);
      expect(f.rect.y + f.rect.h).toBeLessThan(g.y + g.h);
    }
  });

  it("overlaps: 面積。縁が接するだけは 0。gap を足すと近すぎるものも数える", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(overlaps(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(2500);
    expect(overlaps(a, { x: 100, y: 0, w: 100, h: 100 })).toBe(0);
    expect(overlaps(a, { x: 110, y: 0, w: 100, h: 100 })).toBe(0);
    expect(overlaps(a, { x: 110, y: 0, w: 100, h: 100 }, 20)).toBeGreaterThan(0);
    expect(overlaps(a, { x: 130, y: 0, w: 100, h: 100 }, 20)).toBe(0);
  });

  it("重ならない規則: 最上位どうしと、同じ worktree グループの中のメンバーどうし", () => {
    const a = ws("a", 1);
    const b = ws("b", 1);
    const c = ws("c", 1);
    const g1: LayoutTop = { id: "r:1", kind: "worktree", members: [a, b] };
    const w3: LayoutTop = { id: "c", kind: "workspace", members: [c] };
    const st = structureOf([g1, w3]);
    const at = (x: number, y: number) => ({ x, y });
    // a と b が重なる（同じグループの中）→ 組 (a, b)。グループと c も重なる → 組 (r:1, c)。
    const pos = new Map<string, GraphPoint>([
      [a.nodes[0]!, at(100, 100)],
      [b.nodes[0]!, at(140, 100)],
      [c.nodes[0]!, at(100, 100)],
    ]);
    const keys = [...layoutOverlaps(st, pos).keys()].map((x) => x.split("\u0000").sort().join("|"));
    expect(keys.sort()).toEqual(["a|b", "c|r:1"]);
    // 別の最上位のメンバーどうし（a と c）は、組にならない（グループの外側の囲いが相手になる）。
    expect(keys).not.toContain("a|c");
  });

  it("overlapIncreases: 新しく作る・広げるだけを返す。すでに重なっている組が広がらない更新は、返さない", () => {
    const a = ws("a", 1);
    const b = ws("b", 2);
    const st = structureOf([
      { id: "a", kind: "workspace", members: [a] },
      { id: "b", kind: "workspace", members: [b] },
    ]);
    const before = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 100, y: 100 }],
      [b.nodes[0]!, { x: 160, y: 100 }], // すでに重なっている
      [b.nodes[1]!, { x: 160, y: 1000 }],
    ]);
    expect(layoutOverlaps(st, before).size).toBe(1);
    // 無関係の更新（b の下のノードを遠くへ）: 重なりは広がらない。
    const unrelated = new Map(before);
    unrelated.set(b.nodes[1]!, { x: 160, y: 1200 });
    expect(overlapIncreases(st, before, unrelated)).toEqual([]);
    // 否定の対照: 重なりを広げる更新（a を b の中へ寄せる）は返す。
    const worse = new Map(before);
    worse.set(a.nodes[0]!, { x: 160, y: 100 });
    expect(overlapIncreases(st, before, worse)).toHaveLength(1);
    // 重なりを減らす更新は返さない。
    const better = new Map(before);
    better.set(a.nodes[0]!, { x: -1000, y: 100 });
    expect(overlapIncreases(st, before, better)).toEqual([]);
  });
});

describe("placeNode / placeFrame", () => {
  it("最初のノードは面の左上の端に近い所、20 の倍数", () => {
    const m = ws("w1", 0);
    const st = structureOf([{ id: "w1", kind: "workspace", members: [m] }]);
    const p = placeFrame(st, new Map(), "w1");
    expect(Math.abs(p.x % GRAPH_GRID)).toBe(0);
    expect(Math.abs(p.y % GRAPH_GRID)).toBe(0);
    expect(p.x).toBeLessThan(200);
    expect(p.y).toBeLessThan(200);
  });

  it("同じ workspace の 2 つ目は、既存のノードの右（囲いの中の空き）。既存は動かさない", () => {
    const m = ws("w1", 2);
    const st = structureOf([{ id: "w1", kind: "workspace", members: [m] }]);
    const pos = new Map<string, GraphPoint>([[m.nodes[0]!, { x: 60, y: 100 }]]);
    const r = placeNode(st, pos, "w1");
    expect(r.shift).toBeNull();
    expect(r.x).toBe(60 + GRAPH_CELL_WIDTH);
    expect(r.y).toBe(100);
  });

  it("右隣が別の囲いに近づく場合は、右でなく下へ置く", () => {
    const a = ws("a", 2);
    const b = ws("b", 1);
    const st = structureOf([
      { id: "a", kind: "workspace", members: [a] },
      { id: "b", kind: "workspace", members: [b] },
    ]);
    // b は a のすぐ右。a が右へ広がると b に重なる。
    const pos = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 60, y: 100 }],
      [b.nodes[0]!, { x: 60 + 200 + 20 + 20 + 20 + 40, y: 100 }],
    ]);
    const r = placeNode(st, pos, "a");
    expect(r.shift).toBeNull();
    expect(r.x).toBe(60);
    expect(r.y).toBe(100 + GRAPH_CELL_HEIGHT);
  });

  it("詰むときは、囲いごと動かす（shift）。動いた後も、ほかの囲いと重ならない", () => {
    const a = ws("a", 2);
    // a のノード 1 つの周り（右・下へ 3 升ぶん）を、別の囲いがすき間なく（間 20 で）敷き詰める。広げる先がすべて別の囲いに当たる。
    const W = 320 + 20;
    const H = 140 + 20;
    const ax = 400;
    const ay = 400;
    const filler: ReturnType<typeof ws>[] = [];
    const pos = new Map<string, GraphPoint>([[a.nodes[0]!, { x: ax, y: ay }]]);
    for (let dx = -1; dx <= 4; dx++) {
      for (let dy = -1; dy <= 4; dy++) {
        if (dx === 0 && dy === 0) continue;
        const m = ws(`f${dx}_${dy}`, 1);
        filler.push(m);
        pos.set(m.nodes[0]!, { x: ax + dx * W, y: ay + dy * H });
      }
    }
    const st = structureOf([
      { id: "a", kind: "workspace", members: [a] },
      ...filler.map((m) => ({ id: m.id, kind: "workspace" as const, members: [m] })),
    ]);
    expect([...layoutOverlaps(st, pos).keys()]).toEqual([]);
    const r = placeNode(st, pos, "a");
    // 否定の対照: 空きがあるとき（上の「右隣」「下」のテスト）は shift が null。ここは詰んでいるので shift が出る。
    expect(r.shift).not.toBeNull();
    applyPlacement(st, pos, "a", a.nodes[1]!, r);
    expect([...layoutOverlaps(st, pos).keys()]).toEqual([]);
    expect(Math.abs(r.x % GRAPH_GRID)).toBe(0);
    expect(Math.abs(r.y % GRAPH_GRID)).toBe(0);
  });

  it("worktree グループの中の workspace に足しても、グループの外側の囲いが、ほかの囲いに重ならない", () => {
    const a = ws("a", 2);
    const b = ws("b", 1);
    const o = ws("o", 1);
    const st = structureOf([
      { id: "r:1", kind: "worktree", members: [a, b] },
      { id: "o", kind: "workspace", members: [o] },
    ]);
    const pos = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 60, y: 100 }],
      [b.nodes[0]!, { x: 60, y: 400 }],
      [o.nodes[0]!, { x: 440, y: 100 }],
    ]);
    expect([...layoutOverlaps(st, pos).keys()]).toEqual([]);
    const r = placeNode(st, pos, "a");
    applyPlacement(st, pos, "a", a.nodes[1]!, r);
    expect([...layoutOverlaps(st, pos).keys()]).toEqual([]);
  });
});

describe("placeNode（極端に離れたノード）", () => {
  it("数十万 px 離れたノードがある workspace でも、升を数千万個作らず（メモリを使い切らず）すぐ空きを返す", () => {
    const m = ws("big", 3);
    const st = structureOf([{ id: "big", kind: "workspace", members: [m] }]);
    const pos = new Map<string, GraphPoint>([
      [m.nodes[0]!, { x: -900_000, y: -900_000 }],
      [m.nodes[1]!, { x: 900_000, y: 900_000 }],
    ]);
    const t0 = Date.now();
    const r = placeNode(st, pos, "big");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(Math.abs(r.x)).toBeLessThanOrEqual(GRAPH_COORD_MAX);
    expect(Math.abs(r.y)).toBeLessThanOrEqual(GRAPH_COORD_MAX);
    expect(r.shift).toBeNull();
  });
});

describe("resolveDrop", () => {
  const a = ws("a", 1);
  const b = ws("b", 1);
  const st = structureOf([
    { id: "a", kind: "workspace", members: [a] },
    { id: "b", kind: "workspace", members: [b] },
  ]);
  const pos = new Map<string, GraphPoint>([
    [a.nodes[0]!, { x: 100, y: 100 }],
    [b.nodes[0]!, { x: 700, y: 100 }],
  ]);

  it("重なりを作らない落とし方は、そのまま", () => {
    const moves = new Map([[a.nodes[0]!, { x: 100, y: 400 }]]);
    expect(resolveDrop(st, pos, moves)).toEqual(moves);
  });

  it("別の囲いの上に落とすと、重ならない最も近い位置へ寄る（20 の倍数）", () => {
    const moves = new Map([[a.nodes[0]!, { x: 720, y: 120 }]]);
    const out = resolveDrop(st, pos, moves);
    const p = out.get(a.nodes[0]!)!;
    const next = new Map(pos);
    next.set(a.nodes[0]!, p);
    expect(layoutOverlaps(st, next).size).toBe(0);
    expect(Math.abs(p.x % GRAPH_GRID)).toBe(0);
    expect(Math.abs(p.y % GRAPH_GRID)).toBe(0);
    // 近さ: 落とした位置から一つの囲いの幅ほどしか離れない。
    expect(Math.hypot(p.x - 720, p.y - 120)).toBeLessThan(500);
  });

  it("複数のノードを動かすときは、同じ量だけずらす（相対の位置を保つ）", () => {
    const c = ws("c", 2);
    const st2 = structureOf([
      { id: "a", kind: "workspace", members: [a] },
      { id: "c", kind: "workspace", members: [c] },
    ]);
    const pos2 = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 100, y: 100 }],
      [c.nodes[0]!, { x: 700, y: 100 }],
      [c.nodes[1]!, { x: 700, y: 300 }],
    ]);
    const moves = new Map([
      [c.nodes[0]!, { x: 100, y: 100 }],
      [c.nodes[1]!, { x: 100, y: 300 }],
    ]);
    const out = resolveDrop(st2, pos2, moves);
    const d0 = out.get(c.nodes[0]!)!;
    const d1 = out.get(c.nodes[1]!)!;
    expect(d1.x - d0.x).toBe(0);
    expect(d1.y - d0.y).toBe(200);
    const next = new Map(pos2);
    out.forEach((p, key) => next.set(key, p));
    expect(layoutOverlaps(st2, next).size).toBe(0);
  });

  it("すでに重なっている状態でも、重なりを広げない落とし方はそのまま（動けなくならない）", () => {
    const overlapped = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 100, y: 100 }],
      [b.nodes[0]!, { x: 160, y: 100 }],
    ]);
    const moves = new Map([[a.nodes[0]!, { x: 100, y: 100 }]]);
    expect(resolveDrop(st, overlapped, moves)).toEqual(moves);
  });
});

// --- 性質のテスト（乱数の構成を 200 通り） ---------------------------------

function randomStructure(rand: () => number): LayoutStructure {
  const tops: LayoutTop[] = [];
  const nTops = 1 + Math.floor(rand() * 6);
  let id = 0;
  for (let i = 0; i < nTops; i++) {
    const kind = rand() < 0.3 ? "worktree" : rand() < 0.15 ? "machine" : "workspace";
    const nMembers = kind === "worktree" ? 2 + Math.floor(rand() * 3) : 1;
    const members = Array.from({ length: nMembers }, () => {
      const mid = `w${++id}`;
      return { id: mid, nodes: [] as NodeKey[] };
    });
    tops.push({ id: kind === "worktree" ? `r:${i}` : members[0]!.id, kind, members });
  }
  return structureOf(tops);
}

/** 構成の中のメンバーに、ノードの鍵を 1 つ足す（鍵は構成の中の `nodes` に入れる）。 */
function addKey(st: LayoutStructure, memberId: string, key: NodeKey): void {
  for (const sp of st.spaces)
    for (const t of sp.tops)
      for (const m of t.members) if (m.id === memberId) (m.nodes as NodeKey[]).push(key);
}

describe("性質（乱数の構成 200 通り）", () => {
  it("placeNode・placeFrame の結果は重ならない・既存のノードを動かさない（詰むとき以外）・20 の倍数・座標の上限の中", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const st = randomStructure(rand);
      const members = st.spaces.flatMap((s) => s.tops.flatMap((t) => t.members.map((m) => m.id)));
      const pos = new Map<string, GraphPoint>();
      let n = 0;
      const steps = 5 + Math.floor(rand() * 40);
      for (let s = 0; s < steps; s++) {
        const mid = members[Math.floor(rand() * members.length)]!;
        const key = k(`s${seed}n${++n}`);
        addKey(st, mid, key);
        const before = new Map(pos);
        const r = placeNode(st, pos, mid);
        expect(Math.abs(r.x % GRAPH_GRID), `seed ${seed} step ${s}`).toBe(0);
        expect(Math.abs(r.y % GRAPH_GRID)).toBe(0);
        expect(Math.abs(r.x)).toBeLessThan(GRAPH_COORD_MAX);
        expect(Math.abs(r.y)).toBeLessThan(GRAPH_COORD_MAX);
        if (r.shift !== null) {
          expect(Math.abs(r.shift.x % GRAPH_GRID)).toBe(0);
          expect(Math.abs(r.shift.y % GRAPH_GRID)).toBe(0);
        }
        applyPlacement(st, pos, mid, key, r);
        // 既存のノードを動かさない（shift が無いとき）
        if (r.shift === null) for (const [key2, p] of before) expect(pos.get(key2)).toEqual(p);
        // 重ならない（規則の組で、間なし）
        expect([...layoutOverlaps(st, pos).keys()], `seed ${seed} step ${s}`).toEqual([]);
      }
    }
  });

  it("placeFrame: 新しい囲いは、ほかの囲いに重ならない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed * 7919);
      const st = randomStructure(rand);
      const members = st.spaces.flatMap((s) => s.tops.flatMap((t) => t.members.map((m) => m.id)));
      const pos = new Map<string, GraphPoint>();
      let n = 0;
      for (const mid of members) {
        const count = 1 + Math.floor(rand() * 4);
        const first = placeFrame(st, pos, mid);
        expect(Math.abs(first.x % GRAPH_GRID)).toBe(0);
        expect(Math.abs(first.y % GRAPH_GRID)).toBe(0);
        const key0 = k(`p${seed}n${++n}`);
        addKey(st, mid, key0);
        applyPlacement(st, pos, mid, key0, first);
        for (let i = 1; i < count; i++) {
          const key = k(`p${seed}n${++n}`);
          addKey(st, mid, key);
          applyPlacement(st, pos, mid, key, placeNode(st, pos, mid));
        }
        expect([...layoutOverlaps(st, pos).keys()], `seed ${seed}`).toEqual([]);
      }
    }
  });

  it("resolveDrop: 結果は、重なりを新しく作らない・広げない", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed * 104729);
      const st = randomStructure(rand);
      const members = st.spaces.flatMap((s) => s.tops.flatMap((t) => t.members.map((m) => m.id)));
      const pos = new Map<string, GraphPoint>();
      let n = 0;
      for (const mid of members) {
        const key = k(`d${seed}n${++n}`);
        const r = placeFrame(st, pos, mid);
        addKey(st, mid, key);
        applyPlacement(st, pos, mid, key, r);
      }
      const keys = [...pos.keys()];
      const moved = keys[Math.floor(rand() * keys.length)]!;
      const target = {
        x: Math.round((rand() * 1500) / 20) * 20,
        y: Math.round((rand() * 800) / 20) * 20,
      };
      const out = resolveDrop(st, pos, new Map([[moved, target]]));
      const after = new Map(pos);
      out.forEach((p, key) => after.set(key, p));
      expect(overlapIncreases(st, pos, after), `seed ${seed}`).toEqual([]);
      const p = out.get(moved)!;
      expect(Math.abs(p.x % GRAPH_GRID)).toBe(0);
      expect(Math.abs(p.y % GRAPH_GRID)).toBe(0);
    }
  });

  it("placeTopFrame: 重なっている最上位の囲いを、重ならない場所へ移す量", () => {
    const a = ws("a", 1);
    const b = ws("b", 1);
    const st = structureOf([
      { id: "a", kind: "workspace", members: [a] },
      { id: "b", kind: "workspace", members: [b] },
    ]);
    const pos = new Map<string, GraphPoint>([
      [a.nodes[0]!, { x: 100, y: 100 }],
      [b.nodes[0]!, { x: 120, y: 100 }],
    ]);
    const d = placeTopFrame(st, pos, "b")!;
    const next = new Map(pos);
    next.set(b.nodes[0]!, { x: 120 + d.x, y: 100 + d.y });
    expect(layoutOverlaps(st, next).size).toBe(0);
    expect(Math.abs(d.x % GRAPH_GRID)).toBe(0);
    expect(placeTopFrame(st, pos, "nope")).toBeNull();
    void FRAME_GAP;
  });
});
