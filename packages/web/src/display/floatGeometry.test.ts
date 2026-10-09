import { describe, expect, it } from "vitest";
import {
  FLOAT_CASCADE_PX,
  FLOAT_HANDLES,
  FLOAT_INSET_PX,
  FLOAT_MIN_H_PX,
  FLOAT_MIN_W_PX,
  clampFloatRect,
  defaultFloatRect,
  floatAreaOf,
  floatZ,
  insertFloat,
  keyAdjustFloatRect,
  moveFloatRect,
  raiseFloat,
  reconcileFloatOrder,
  resizeFloatRect,
  type Area,
  type Rect,
} from "./floatGeometry.js";

const AREA: Area = { w: 800, h: 500 };
const inside = (r: Rect, a: Area): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= a.w && r.y + r.h <= a.h && r.w >= FLOAT_MIN_W_PX && r.h >= FLOAT_MIN_H_PX;

describe("clampFloatRect", () => {
  it("領域の中の矩形は、そのまま", () => {
    expect(clampFloatRect({ x: 10, y: 20, w: 300, h: 200 }, AREA)).toEqual({ x: 10, y: 20, w: 300, h: 200 });
  });
  it("負の位置は 0 へ・大きすぎる位置は領域の中へ", () => {
    expect(clampFloatRect({ x: -50, y: -9, w: 300, h: 200 }, AREA)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect(clampFloatRect({ x: 700, y: 480, w: 300, h: 200 }, AREA)).toEqual({ x: 500, y: 300, w: 300, h: 200 });
  });
  it("領域より大きい矩形は、領域いっぱいに縮む（先に大きさ、次に位置）", () => {
    expect(clampFloatRect({ x: 100, y: 100, w: 5000, h: 5000 }, AREA)).toEqual({ x: 0, y: 0, w: 800, h: 500 });
  });
  it("最小より小さい矩形は、最小まで広がる", () => {
    expect(clampFloatRect({ x: 0, y: 0, w: 10, h: 10 }, AREA)).toEqual({ x: 0, y: 0, w: FLOAT_MIN_W_PX, h: FLOAT_MIN_H_PX });
    expect(clampFloatRect({ x: 790, y: 495, w: 10, h: 10 }, AREA)).toEqual({ x: 800 - FLOAT_MIN_W_PX, y: 500 - FLOAT_MIN_H_PX, w: FLOAT_MIN_W_PX, h: FLOAT_MIN_H_PX });
  });
  it("領域が縮んだ後は、新しい領域の中へ寄る（記憶の矩形は変えない）", () => {
    const stored: Rect = { x: 500, y: 300, w: 300, h: 200 };
    const shrunk = clampFloatRect(stored, { w: 400, h: 250 });
    expect(shrunk).toEqual({ x: 100, y: 50, w: 300, h: 200 });
    expect(stored).toEqual({ x: 500, y: 300, w: 300, h: 200 });
    expect(clampFloatRect(stored, AREA)).toEqual(stored); // 広がれば元の位置
  });
  it("NaN・無限大・数でない値を受けても、有限の矩形を返す", () => {
    const bad = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "x" as unknown as number, undefined as unknown as number];
    for (const v of bad) {
      for (const r of [{ x: v, y: v, w: v, h: v }, { x: 1, y: v, w: 300, h: v }, { x: v, y: 1, w: v, h: 200 }]) {
        const out = clampFloatRect(r, AREA);
        expect(Object.values(out).every(Number.isFinite)).toBe(true);
        expect(inside(out, AREA)).toBe(true);
      }
    }
    const bigArea = clampFloatRect({ x: 1, y: 1, w: 300, h: 200 }, { w: Number.NaN, h: Number.POSITIVE_INFINITY });
    expect(Object.values(bigArea).every(Number.isFinite)).toBe(true);
  });
  it("領域が最小より小さくても、領域の外へ出ない", () => {
    const out = clampFloatRect({ x: 50, y: 50, w: 300, h: 200 }, { w: 100, h: 60 });
    expect(out).toEqual({ x: 0, y: 0, w: 100, h: 60 });
  });
  it("乱数で、結果がいつも領域の中（最小以上）に収まる", () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 4000 - 1500;
    for (let i = 0; i < 2000; i++) {
      const area = { w: 240 + Math.abs(rnd()) / 2, h: 120 + Math.abs(rnd()) / 3 };
      const out = clampFloatRect({ x: rnd(), y: rnd(), w: rnd(), h: rnd() }, area);
      expect(inside(out, area)).toBe(true);
    }
  });
});

describe("defaultFloatRect", () => {
  it("幅は size・高さは領域の 6 割・右上に余白 8px", () => {
    expect(defaultFloatRect(0, 320, AREA)).toEqual({ x: 800 - 320 - FLOAT_INSET_PX, y: FLOAT_INSET_PX, w: 320, h: 300 });
  });
  it("i 番目は 24px ずつ左下へずれる", () => {
    const a = defaultFloatRect(0, 320, AREA);
    const b = defaultFloatRect(2, 320, AREA);
    expect(b.x).toBe(a.x - 2 * FLOAT_CASCADE_PX);
    expect(b.y).toBe(a.y + 2 * FLOAT_CASCADE_PX);
  });
  it("幅は 240〜領域−16 に丸める", () => {
    expect(defaultFloatRect(0, 100, AREA).w).toBe(FLOAT_MIN_W_PX);
    expect(defaultFloatRect(0, 800, AREA).w).toBe(800 - FLOAT_INSET_PX * 2);
  });
  it("ずらしが領域を出ない（何番目でも領域の中）", () => {
    for (let i = 0; i < 40; i++) expect(inside(defaultFloatRect(i, 320, AREA), AREA)).toBe(true);
  });
  it("領域が小さくて範囲が逆転しても、領域の中の値を返す", () => {
    const small = { w: 250, h: 130 };
    expect(inside(defaultFloatRect(0, 320, small), small)).toBe(true);
    expect(Object.values(defaultFloatRect(Number.NaN, Number.NaN, small)).every(Number.isFinite)).toBe(true);
  });
});

describe("moveFloatRect", () => {
  it("start に dx・dy を足して丸める", () => {
    const start = { x: 100, y: 100, w: 300, h: 200 };
    expect(moveFloatRect(start, 50, -30, AREA)).toEqual({ x: 150, y: 70, w: 300, h: 200 });
    expect(moveFloatRect(start, -5000, -5000, AREA)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
    expect(moveFloatRect(start, 5000, 5000, AREA)).toEqual({ x: 500, y: 300, w: 300, h: 200 });
    expect(moveFloatRect(start, Number.NaN, Number.POSITIVE_INFINITY, AREA)).toEqual({ x: 100, y: 100, w: 300, h: 200 });
  });
});

describe("resizeFloatRect — 8 つのつかむ場所", () => {
  const start: Rect = { x: 200, y: 150, w: 300, h: 200 };
  const right = (r: Rect): number => r.x + r.w;
  const bottom = (r: Rect): number => r.y + r.h;
  it("動かさない側の縁は動かない（大きく動かしても・最小を割っても）", () => {
    for (const [dx, dy] of [[40, 30], [-40, -30], [-5000, -5000], [5000, 5000], [-250, 250], [250, -250]] as const) {
      const n = resizeFloatRect(start, "n", dx, dy, AREA);
      expect(bottom(n)).toBe(bottom(start));
      expect([n.x, n.w]).toEqual([start.x, start.w]);
      const s = resizeFloatRect(start, "s", dx, dy, AREA);
      expect(s.y).toBe(start.y);
      expect([s.x, s.w]).toEqual([start.x, start.w]);
      const e = resizeFloatRect(start, "e", dx, dy, AREA);
      expect(e.x).toBe(start.x);
      expect([e.y, e.h]).toEqual([start.y, start.h]);
      const w = resizeFloatRect(start, "w", dx, dy, AREA);
      expect(right(w)).toBe(right(start));
      expect([w.y, w.h]).toEqual([start.y, start.h]);
      const nw = resizeFloatRect(start, "nw", dx, dy, AREA);
      expect([right(nw), bottom(nw)]).toEqual([right(start), bottom(start)]);
      const ne = resizeFloatRect(start, "ne", dx, dy, AREA);
      expect([ne.x, bottom(ne)]).toEqual([start.x, bottom(start)]);
      const sw = resizeFloatRect(start, "sw", dx, dy, AREA);
      expect([right(sw), sw.y]).toEqual([right(start), start.y]);
      const se = resizeFloatRect(start, "se", dx, dy, AREA);
      expect([se.x, se.y]).toEqual([start.x, start.y]);
    }
  });
  it("どの場所でも、結果は領域の中で、最小以上", () => {
    for (const h of FLOAT_HANDLES) {
      for (const [dx, dy] of [[9999, 9999], [-9999, -9999], [-9999, 9999], [9999, -9999], [3, 4]] as const) {
        expect(inside(resizeFloatRect(start, h, dx, dy, AREA), AREA)).toBe(true);
      }
    }
  });
  it("広げる・縮める量が、そのまま大きさに出る", () => {
    expect(resizeFloatRect(start, "e", 40, 0, AREA)).toEqual({ ...start, w: 340 });
    expect(resizeFloatRect(start, "w", -40, 0, AREA)).toEqual({ ...start, x: 160, w: 340 });
    expect(resizeFloatRect(start, "s", 0, 30, AREA)).toEqual({ ...start, h: 230 });
    expect(resizeFloatRect(start, "n", 0, -30, AREA)).toEqual({ ...start, y: 120, h: 230 });
    expect(resizeFloatRect(start, "e", -500, 0, AREA).w).toBe(FLOAT_MIN_W_PX);
  });
  it("NaN は動かさなかったことになる", () => {
    expect(resizeFloatRect(start, "se", Number.NaN, Number.NaN, AREA)).toEqual(start);
  });
});

describe("keyAdjustFloatRect", () => {
  const start: Rect = { x: 200, y: 150, w: 300, h: 200 };
  it("矢印で 16px・Shift で 64px。矢印でないキーは null", () => {
    expect(keyAdjustFloatRect(start, "move", "ArrowRight", false, AREA)).toEqual({ ...start, x: 216 });
    expect(keyAdjustFloatRect(start, "move", "ArrowUp", true, AREA)).toEqual({ ...start, y: 86 });
    expect(keyAdjustFloatRect(start, "resize", "ArrowDown", false, AREA)).toEqual({ ...start, h: 216 });
    expect(keyAdjustFloatRect(start, "resize", "ArrowLeft", true, AREA)).toEqual({ ...start, w: 236 < FLOAT_MIN_W_PX ? FLOAT_MIN_W_PX : 236 });
    expect(keyAdjustFloatRect(start, "move", "a", false, AREA)).toBeNull();
  });
  it("領域を出ない", () => {
    expect(keyAdjustFloatRect({ ...start, x: 0 }, "move", "ArrowLeft", true, AREA)?.x).toBe(0);
  });
});

describe("重なりの決まり", () => {
  it("決まり 2: 押した窓は末尾へ（操作中の id を見ない）。もう末尾なら動かない", () => {
    expect(raiseFloat(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(raiseFloat(["a", "b", "c"], "c")).toEqual(["a", "b", "c"]);
    expect(raiseFloat(["a"], "z")).toEqual(["a", "z"]);
  });
  it("決まり 3: 新しい窓は、操作中の窓があればその 1 つ後ろ・無ければ最前面", () => {
    expect(insertFloat(["a", "b"], "n", "b")).toEqual(["a", "n", "b"]);
    expect(insertFloat(["a", "b"], "n", "a")).toEqual(["n", "a", "b"]);
    expect(insertFloat(["a", "b"], "n", null)).toEqual(["a", "b", "n"]);
    expect(insertFloat(["a", "b"], "n", "ghost")).toEqual(["a", "b", "n"]);
  });
  it("すでに並びにある窓は、insertFloat で動かない", () => {
    expect(insertFloat(["a", "b"], "a", "b")).toEqual(["a", "b"]);
  });
  it("決まり 1: reconcile は、閉じた窓を外し・新しい窓を入れ、操作中の窓は動かさない（新しい窓がその後ろに入る）", () => {
    expect(reconcileFloatOrder(["a", "b"], ["a", "b", "n"], "b")).toEqual(["a", "n", "b"]);
    expect(reconcileFloatOrder(["a", "b", "c"], ["a", "c"], null)).toEqual(["a", "c"]);
    expect(reconcileFloatOrder([], ["a", "b"], null)).toEqual(["a", "b"]);
    expect(reconcileFloatOrder([], ["a", "b"], "a")).toEqual(["b", "a"]); // 操作中の a が最前面
    expect(reconcileFloatOrder(["a"], ["a"], "a")).toEqual(["a"]);
  });
  it("z-index は並びの位置（20 + 位置）。並びに無い窓は最前面", () => {
    expect(floatZ(["a", "b"], "a")).toBe(20);
    expect(floatZ(["a", "b"], "b")).toBe(21);
    expect(floatZ(["a", "b"], "x")).toBe(22);
  });
});

describe("floatAreaOf", () => {
  it("端末の領域を各辺 4px 縮める。最小の窓が入らなければ null", () => {
    expect(floatAreaOf({ w: 808, h: 508 })).toEqual({ w: 800, h: 500 });
    expect(floatAreaOf({ w: 247, h: 400 })).toBeNull();
    expect(floatAreaOf({ w: 248, h: 127 })).toBeNull();
    expect(floatAreaOf({ w: 248, h: 128 })).toEqual({ w: 240, h: 120 });
    expect(floatAreaOf({ w: Number.NaN, h: 400 })).toBeNull();
  });
});
