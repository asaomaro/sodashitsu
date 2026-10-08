import { describe, expect, it } from "vitest";
import { edgeScrollDelta, reorderSteps, slotAt, type TabRect } from "./tabReorder.js";

function rects(n: number, w = 100, start = 0): TabRect[] {
  return Array.from({ length: n }, (_, i) => ({ id: `t${i}`, left: start + i * w, right: start + (i + 1) * w }));
}

describe("slotAt", () => {
  const r = rects(3);
  it("左半分はその tab の前、右半分は次の tab の前", () => {
    expect(slotAt(r, 10)).toBe(0);
    expect(slotAt(r, 49)).toBe(0);
    expect(slotAt(r, 50)).toBe(1);
    expect(slotAt(r, 149)).toBe(1);
    expect(slotAt(r, 150)).toBe(2);
    expect(slotAt(r, 249)).toBe(2);
  });
  it("最後の tab の右半分と、どの tab よりも右は n", () => {
    expect(slotAt(r, 250)).toBe(3);
    expect(slotAt(r, 299)).toBe(3);
    expect(slotAt(r, 9999)).toBe(3);
  });
  it("最初の tab より左は 0、空の配列は 0", () => {
    expect(slotAt(r, -500)).toBe(0);
    expect(slotAt([], 10)).toBe(0);
  });
  it("あふれて矩形が負の座標にある tab が混ざっても同じ決まり", () => {
    const s = rects(4, 100, -250); // -250..150
    expect(slotAt(s, -260)).toBe(0);
    expect(slotAt(s, -150)).toBe(1);
    expect(slotAt(s, -10)).toBe(2);
    expect(slotAt(s, 0)).toBe(3);
    expect(slotAt(s, 120)).toBe(4);
  });
});

describe("reorderSteps", () => {
  const ids = ["a", "b", "c", "d", "e"];
  function applyMoves(order: string[], id: string, direction: "previous" | "next", count: number): string[] {
    const o = [...order];
    for (let k = 0; k < count; k++) {
      const i = o.indexOf(id);
      const j = direction === "next" ? i + 1 : i - 1;
      [o[i], o[j]] = [o[j]!, o[i]!];
    }
    return o;
  }
  it("全部の (from, slot) の組", () => {
    for (let from = 0; from < 5; from++) {
      for (let slot = 0; slot <= 5; slot++) {
        const id = ids[from]!;
        const r = reorderSteps(ids, id, slot);
        if (slot === from || slot === from + 1) {
          expect(r).toBeNull();
          continue;
        }
        expect(r).not.toBeNull();
        const expected = ids.filter((x) => x !== id);
        expected.splice(r!.toIndex, 0, id);
        // 期待: 抜いて slot の位置（抜いた後の番号）へ入れた順
        const direct = ids.filter((x) => x !== id);
        direct.splice(slot > from ? slot - 1 : slot, 0, id);
        expect(applyMoves(ids, id, r!.direction, r!.count)).toEqual(direct);
        expect(r!.count).toBeGreaterThanOrEqual(1);
        const end = r!.direction === "next" ? from + r!.count : from - r!.count;
        expect(end).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(4);
        expect(end).toBe(r!.toIndex);
      }
    }
  });
  it("draggedId が無い・slot が範囲外は null", () => {
    expect(reorderSteps(ids, "zz", 2)).toBeNull();
    expect(reorderSteps(ids, "a", -1)).toBeNull();
    expect(reorderSteps(ids, "a", 6)).toBeNull();
  });
  it("tab が 1 個は常に null", () => {
    expect(reorderSteps(["a"], "a", 0)).toBeNull();
    expect(reorderSteps(["a"], "a", 1)).toBeNull();
  });
});

describe("edgeScrollDelta", () => {
  const row = { left: 100, right: 500 };
  it("端から 24px 未満はその向き、間は 0", () => {
    expect(edgeScrollDelta(row, 110)).toBe(-8);
    expect(edgeScrollDelta(row, 123)).toBe(-8);
    expect(edgeScrollDelta(row, 124)).toBe(0);
    expect(edgeScrollDelta(row, 300)).toBe(0);
    expect(edgeScrollDelta(row, 476)).toBe(0);
    expect(edgeScrollDelta(row, 477)).toBe(8);
    expect(edgeScrollDelta(row, 499)).toBe(8);
  });
  it("列の外もその向き", () => {
    expect(edgeScrollDelta(row, 0)).toBe(-8);
    expect(edgeScrollDelta(row, 900)).toBe(8);
  });
});
