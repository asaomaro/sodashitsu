import { describe, expect, it } from "vitest";
import { DOCK_ZONE_EDGE_RATIO, dockZoneAt } from "./dockDrag.js";

const box = { left: 100, top: 50, width: 1000, height: 500 };

describe("dockZoneAt", () => {
  it("箱の外は null（縁の線の上は中）", () => {
    for (const [x, y] of [[99, 300], [1101, 300], [600, 49], [600, 551], [0, 0]] as const) expect(dockZoneAt(box, x, y, { float: true })).toBeNull();
    expect(dockZoneAt(box, 100, 300, { float: true })).toBe("left");
    expect(dockZoneAt(box, 1100, 300, { float: true })).toBe("right");
  });
  it("いちばん近い縁の側。幅・高さに対する比で比べる（箱が横長でも、縁からの割合）", () => {
    expect(dockZoneAt(box, 600, 60, { float: false })).toBe("top");
    expect(dockZoneAt(box, 600, 540, { float: false })).toBe("bottom");
    expect(dockZoneAt(box, 110, 300, { float: false })).toBe("left");
    expect(dockZoneAt(box, 1090, 300, { float: false })).toBe("right");
    // 左上の角: 左まで 20/1000=0.02、上まで 30/500=0.06 → 左
    expect(dockZoneAt(box, 120, 80, { float: false })).toBe("left");
    // 上まで 5/500=0.01、左まで 100/1000=0.1 → 上
    expect(dockZoneAt(box, 200, 55, { float: false })).toBe("top");
  });
  it("0.22 ちょうどは側、超えたら中央（float が偽なら null・真なら float）", () => {
    const edgeX = box.left + 1000 * DOCK_ZONE_EDGE_RATIO;
    expect(dockZoneAt(box, edgeX, 300, { float: true })).toBe("left");
    expect(dockZoneAt(box, edgeX + 1, 300, { float: true })).toBe("float");
    expect(dockZoneAt(box, edgeX + 1, 300, { float: false })).toBeNull();
    const edgeY = box.top + 500 * DOCK_ZONE_EDGE_RATIO;
    expect(dockZoneAt(box, 600, edgeY, { float: false })).toBe("top");
    expect(dockZoneAt(box, 600, edgeY + 1, { float: false })).toBeNull();
  });
  it("同じ距離なら 上・下・左・右 の順。大きさの無い箱は null", () => {
    expect(dockZoneAt({ left: 0, top: 0, width: 100, height: 100 }, 5, 5, { float: false })).toBe("top");
    expect(dockZoneAt({ left: 0, top: 0, width: 0, height: 100 }, 0, 5, { float: true })).toBeNull();
    expect(dockZoneAt({ left: 0, top: 0, width: 100, height: Number.NaN }, 5, 5, { float: true })).toBeNull();
  });
});
