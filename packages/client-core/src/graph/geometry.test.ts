import { describe, expect, it } from "vitest";
import {
  borderPoint,
  clampZoom,
  edgeGeometry,
  fitGraphView,
  GRAPH_ZOOM_MAX,
  GRAPH_ZOOM_MIN,
  graphNodeAt,
  graphToScreen,
  parallelOffsets,
  PARALLEL_LINK_GAP,
  screenToGraph,
  snapToGrid,
  zoomGraphAt,
} from "./geometry.js";

// 20260927-agent-graph の T2（geometry）：吸着・ズーム・全体表示・線の経路・当たり判定。
describe("snapToGrid", () => {
  it("20px のグリッドの最も近い点（-0 にしない）", () => {
    expect(snapToGrid(9)).toBe(0);
    expect(snapToGrid(10)).toBe(20);
    expect(snapToGrid(31)).toBe(40);
    expect(snapToGrid(-29)).toBe(-20);
    expect(Object.is(snapToGrid(-4), 0)).toBe(true);
  });
});

describe("ズームと座標の変換", () => {
  it("ズームは 0.25〜2（非有限は 1）", () => {
    expect(clampZoom(0.1)).toBe(GRAPH_ZOOM_MIN);
    expect(clampZoom(5)).toBe(GRAPH_ZOOM_MAX);
    expect(clampZoom(NaN)).toBe(1);
  });

  it("画面と世界の往復", () => {
    const view = { zoom: 2, panX: 10, panY: -5 };
    expect(graphToScreen(view, { x: 3, y: 4 })).toEqual({ x: 16, y: 3 });
    expect(screenToGraph(view, { x: 16, y: 3 })).toEqual({ x: 3, y: 4 });
  });

  it("zoomGraphAt は基準の点を動かさない", () => {
    const view = { zoom: 1, panX: 30, panY: 40 };
    const anchor = { x: 100, y: 80 };
    const before = screenToGraph(view, anchor);
    const next = zoomGraphAt(view, 1.5, anchor);
    expect(next.zoom).toBe(1.5);
    expect(screenToGraph(next, anchor)).toEqual(before);
    expect(zoomGraphAt(view, 10, anchor).zoom).toBe(GRAPH_ZOOM_MAX);
  });
});

describe("fitGraphView", () => {
  it("何も無ければ等倍・原点", () => {
    expect(fitGraphView([], { w: 800, h: 600 })).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it("収まるときは等倍のまま中央へ", () => {
    const v = fitGraphView([{ x: 0, y: 0, w: 200, h: 100 }], { w: 800, h: 600 });
    expect(v).toEqual({ zoom: 1, panX: 300, panY: 250 });
  });

  it("大きければ縮めて、すべての矩形が余白の内側に入る", () => {
    const rects = [
      { x: -1000, y: 0, w: 200, h: 80 },
      { x: 1000, y: 700, w: 200, h: 80 },
    ];
    const size = { w: 800, h: 600 };
    const v = fitGraphView(rects, size, 40);
    expect(v.zoom).toBeLessThan(1);
    for (const r of rects) {
      const tl = graphToScreen(v, { x: r.x, y: r.y });
      const br = graphToScreen(v, { x: r.x + r.w, y: r.y + r.h });
      expect(tl.x).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(tl.y).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(br.x).toBeLessThanOrEqual(760 + 1e-9);
      expect(br.y).toBeLessThanOrEqual(560 + 1e-9);
    }
  });
});

describe("線の経路", () => {
  const left = { x: 0, y: 0, w: 200, h: 80 };
  const right = { x: 400, y: 0, w: 200, h: 80 };

  it("borderPoint は中心から向かう先の縁の点", () => {
    expect(borderPoint(left, { x: 1000, y: 40 })).toEqual({ x: 200, y: 40 });
    expect(borderPoint(left, { x: 100, y: -500 })).toEqual({ x: 100, y: 0 });
    expect(borderPoint(left, { x: 100, y: 40 })).toEqual({ x: 100, y: 40 });
  });

  it("ノードの縁から縁へ、中点つき", () => {
    expect(edgeGeometry(left, right)).toEqual({
      start: { x: 200, y: 40 },
      end: { x: 400, y: 40 },
      mid: { x: 300, y: 40 },
    });
  });

  it("ずらしは向きに依らず同じ側へ（行きと帰りが重ならない）", () => {
    const go = edgeGeometry(left, right, 0.5);
    const back = edgeGeometry(right, left, -0.5);
    expect(go.mid.y - 40).toBeCloseTo(PARALLEL_LINK_GAP / 2);
    expect(back.mid.y - 40).toBeCloseTo(-PARALLEL_LINK_GAP / 2);
    expect(go.start.x).toBe(200);
    expect(back.start.x).toBe(400);
  });

  it("parallelOffsets は同じ組（向きを問わない）の線を中央に振り分ける", () => {
    const m = parallelOffsets([
      { id: "l1", from: "a", to: "b" },
      { id: "l2", from: "b", to: "a" },
      { id: "l3", from: "a", to: "c" },
      { id: "l4", from: "a", to: "b" },
    ]);
    expect(Object.fromEntries(m)).toEqual({ l1: -1, l2: 0, l4: 1, l3: 0 });
  });
});

describe("graphNodeAt", () => {
  it("点の上のノード（重なれば後ろの方）、無ければ null", () => {
    const nodes = [
      { key: "a", rect: { x: 0, y: 0, w: 100, h: 100 } },
      { key: "b", rect: { x: 50, y: 50, w: 100, h: 100 } },
    ];
    expect(graphNodeAt(nodes, { x: 10, y: 10 })).toBe("a");
    expect(graphNodeAt(nodes, { x: 60, y: 60 })).toBe("b");
    expect(graphNodeAt(nodes, { x: 300, y: 300 })).toBeNull();
  });
});
