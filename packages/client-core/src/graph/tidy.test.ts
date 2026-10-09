import { describe, expect, it } from "vitest";
import type { Graph, GraphNode, NodeKey } from "@sodashitsu/protocol";
import { emptyGraph } from "./defaults.js";
import type { GraphPoint } from "./geometry.js";
import { frames, layoutOverlaps, nodePositions, type LayoutStructure, type LayoutTop } from "./graphLayout.js";
import { reconcileGraph } from "./reconcile.js";
import { tidySpace } from "./tidy.js";

// 20261008-graph-first の PR1e T17c：「並びを整える」の計算。
const k = (id: string): NodeKey => `local:${id}`;
const ws = (id: string, n: number) => ({ id, nodes: Array.from({ length: n }, (_, i) => k(`${id}p${i}`)) });

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

/** 乱数の構成: 2 つの空間。空間 a は workspace と worktree グループ、空間 b は workspace。位置はばらばら（重ならないよう、遠く離して置く）。 */
function randomWorld(seed: number): { st: LayoutStructure; pos: Map<string, GraphPoint>; nodesA: NodeKey[] } {
  const rnd = rng(seed);
  const tops: LayoutTop[] = [];
  const topsB: LayoutTop[] = [];
  const pos = new Map<string, GraphPoint>();
  let slot = 0;
  const place = (m: { id: string; nodes: NodeKey[] }): void => {
    // 囲いごとに、離れた区画（4000 角）の中に、ばらばらに置く
    const bx = (slot % 5) * 4000;
    const by = Math.floor(slot / 5) * 4000;
    slot++;
    for (const key of m.nodes) pos.set(key, { x: bx + Math.floor(rnd() * 8) * 100, y: by + Math.floor(rnd() * 8) * 100 });
  };
  const nA = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < nA; i++) {
    if (rnd() < 0.35) {
      const members = [ws(`g${i}a`, 1 + Math.floor(rnd() * 5)), ws(`g${i}b`, 1 + Math.floor(rnd() * 5))];
      tops.push({ id: `r:${i}`, kind: "worktree", members });
      // グループのメンバーは 1 つの区画に（同じグループの囲いは近く）
      members.forEach((m, j) => {
        const bx = (slot % 5) * 4000 + j * 1500;
        const by = Math.floor(slot / 5) * 4000;
        for (const key of m.nodes) pos.set(key, { x: bx + Math.floor(rnd() * 3) * 100, y: by + Math.floor(rnd() * 5) * 100 });
      });
      slot++;
    } else {
      const m = ws(`w${i}`, 1 + Math.floor(rnd() * 9));
      tops.push({ id: m.id, kind: "workspace", members: [m] });
      place(m);
    }
  }
  const nB = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < nB; i++) {
    const m = ws(`b${i}`, 1 + Math.floor(rnd() * 6));
    topsB.push({ id: m.id, kind: "workspace", members: [m] });
    place(m);
  }
  const st: LayoutStructure = { spaces: [{ id: "g:a", tops }, { id: "g:b", tops: topsB }] };
  const nodesA = tops.flatMap((t) => t.members.flatMap((m) => m.nodes));
  return { st, pos, nodesA };
}

describe("tidySpace（並びを整える）", () => {
  it("性質（乱数 150 通り）: 囲いは重ならず・同じ座標が無く・20 の倍数・範囲の中・ほかの空間は動かない・reconcileGraph に通すと空", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const { st, pos, nodesA } = randomWorld(seed);
      const moves = tidySpace(st, pos, "g:a");
      expect(moves, `seed ${seed}`).not.toBeNull();
      const m = moves!;
      expect([...m.keys()].sort(), `seed ${seed}: 空間のノードだけ`).toEqual([...nodesA].sort());
      const next = new Map(pos);
      for (const [key, p] of m) next.set(key, p);
      for (const [key, p] of pos) if (!nodesA.includes(key as NodeKey)) expect(next.get(key), `seed ${seed}: 他の空間`).toEqual(p);
      expect([...layoutOverlaps(st, next).keys()], `seed ${seed}: 囲いの重なり`).toEqual([]);
      const seen = new Set<string>();
      for (const p of m.values()) {
        expect(p.x % 20 === 0 && p.y % 20 === 0, `seed ${seed}: 20 の倍数`).toBe(true);
        expect(Math.abs(p.x) <= 1_000_000 && Math.abs(p.y) <= 1_000_000).toBe(true);
        const id = `${p.x},${p.y}`;
        expect(seen.has(id), `seed ${seed}: 同じ座標`).toBe(false);
        seen.add(id);
      }
      const graph: Graph = { ...emptyGraph(), nodes: [...next].map(([key, p]) => ({ key: key as NodeKey, x: p.x, y: p.y }) as GraphNode) };
      expect(reconcileGraph(st, graph), `seed ${seed}: reconcile は空`).toEqual([]);
    }
  });

  it("もう一度整えても、同じ結果（冪等）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { st, pos } = randomWorld(seed);
      const once = tidySpace(st, pos, "g:a")!;
      const next = new Map(pos);
      for (const [key, p] of once) next.set(key, p);
      const twice = tidySpace(st, next, "g:a")!;
      expect([...twice]).toEqual([...once]);
    }
  });

  it("囲いの中は、いまの並び（上から下・左から右）の順を保って、ほぼ正方形の升に置く。囲いの順もいまの位置の順", () => {
    const a = ws("a", 4);
    const b = ws("b", 1);
    const st: LayoutStructure = { spaces: [{ id: "g:a", tops: [{ id: "a", kind: "workspace", members: [a] }, { id: "b", kind: "workspace", members: [b] }] }] };
    const pos = nodePositions([
      { key: a.nodes[0]!, x: 1500, y: 900 }, // 4 番目
      { key: a.nodes[1]!, x: 1000, y: 100 }, // 1 番目
      { key: a.nodes[2]!, x: 1300, y: 100 }, // 2 番目
      { key: a.nodes[3]!, x: 1000, y: 700 }, // 3 番目
      { key: b.nodes[0]!, x: 0, y: 0 }, // 囲い b のほうが先（左上）
    ]);
    const m = tidySpace(st, pos, "g:a")!;
    const at = (key: NodeKey) => m.get(key)!;
    // b が先（読む順: 上から下・左から右）
    const bp = at(b.nodes[0]!);
    const ap = at(a.nodes[1]!);
    expect(bp.y < ap.y || (bp.y === ap.y && bp.x < ap.x)).toBe(true);
    // a の中: 1 番目・2 番目が同じ行、3 番目・4 番目が次の行（2 列）
    expect(at(a.nodes[1]!).y).toBe(at(a.nodes[2]!).y);
    expect(at(a.nodes[3]!).y).toBeGreaterThan(at(a.nodes[1]!).y);
    expect(at(a.nodes[3]!).x).toBe(at(a.nodes[1]!).x);
    expect(at(a.nodes[0]!).x).toBe(at(a.nodes[2]!).x);
    // 囲いは詰まっている（4 個は 2×2: 高さは 2 行分）
    const fa = frames(st, new Map([...pos, ...m])).find((f) => f.id === "a")!.rect;
    expect(fa.h).toBeLessThan(400);
  });

  it("ほかの空間の囲いが、整えた並びが元の左上から始まると重なる所にあっても、その囲いを避けて置く（PR1e レビュー S1。避けなければ落ちる）", () => {
    const a1 = ws("a1", 1);
    const a2 = ws("a2", 1);
    const o = ws("o", 2);
    const st: LayoutStructure = {
      spaces: [
        { id: "g:a", tops: [{ id: "a1", kind: "workspace", members: [a1] }, { id: "a2", kind: "workspace", members: [a2] }] },
        { id: "g:o", tops: [{ id: "o", kind: "workspace", members: [o] }] },
      ],
    };
    const pos = nodePositions([
      { key: a1.nodes[0]!, x: 1000, y: 1000 }, // 整える空間の囲い a1（左上は 980,960）
      { key: a2.nodes[0]!, x: 6000, y: 6000 }, // a2 は遠く（整えると、a1 の下の段へ来る）
      { key: o.nodes[0]!, x: 1000, y: 1250 }, // ほかの空間の囲い o: a1 のすぐ下（詰めた a2 の置き場所に重なる）
      { key: o.nodes[1]!, x: 1240, y: 1250 },
    ]);
    const m = tidySpace(st, pos, "g:a")!;
    const next = new Map(pos);
    for (const [key, p] of m) next.set(key, p);
    const fs = frames(st, next);
    const fo = fs.find((f) => f.id === "o")!.rect;
    for (const id of ["a1", "a2"]) {
      const f = fs.find((x) => x.id === id)!.rect;
      const apart = f.x + f.w <= fo.x || fo.x + fo.w <= f.x || f.y + f.h <= fo.y || fo.y + fo.h <= f.y;
      expect(apart, `${id} ${JSON.stringify(f)} と o ${JSON.stringify(fo)}`).toBe(true);
    }
    for (const key of o.nodes) expect(next.get(key)).toEqual(pos.get(key)); // ほかの空間は動かない
  });

  it("空間が無い・ノードが無いなら、何も動かさない", () => {
    expect(tidySpace({ spaces: [] }, new Map(), "g:x")!.size).toBe(0);
    const st: LayoutStructure = { spaces: [{ id: "g:a", tops: [{ id: "a", kind: "workspace", members: [ws("a", 0)] }] }] };
    expect(tidySpace(st, new Map(), "g:a")!.size).toBe(0);
  });
});
