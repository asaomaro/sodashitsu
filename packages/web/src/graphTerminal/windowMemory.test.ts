import { describe, expect, it } from "vitest";
import { emptyMemory, fractionOf, loadMemory, placeFromMemory, rememberGeometry, sanitizeMemory, saveMemory, sweepMemory, WINDOW_MEMORY_KEY, WINDOW_MEMORY_MAX } from "./windowMemory.js";

describe("windowMemory", () => {
  it("壊れた値・形の違う値は、空の記憶になる。使える項目だけ残る", () => {
    expect(sanitizeMemory(null)).toEqual(emptyMemory());
    expect(sanitizeMemory("x")).toEqual(emptyMemory());
    const m = sanitizeMemory({
      geometry: { a: { fx: 0.5, fy: 2, cols: 80, rows: 24 }, b: { fx: "x", fy: 0, cols: 1, rows: 1 }, c: { fx: 0, fy: 0, cols: 0, rows: 5 }, d: null, e: { fx: -1, fy: 0, cols: 40.4, rows: 10 } },
      pinned: ["a", "a", 3, "", "b", "c", "d", "e"],
    });
    expect(m.geometry).toEqual({ a: { fx: 0.5, fy: 1, cols: 80, rows: 24 }, e: { fx: 0, fy: 0, cols: 40, rows: 10 } });
    expect(m.pinned).toEqual(["a", "b", "c"]); // 3 つまで
  });

  it("件数は 200 まで。古いものから捨てる。書き込み直すと新しい側へ", () => {
    let m = emptyMemory();
    for (let i = 0; i < WINDOW_MEMORY_MAX + 5; i++) m = rememberGeometry(m, `p${i}`, { fx: 0, fy: 0, cols: 80, rows: 24 });
    expect(Object.keys(m.geometry)).toHaveLength(WINDOW_MEMORY_MAX);
    expect(m.geometry["p0"]).toBeUndefined();
    expect(m.geometry[`p${WINDOW_MEMORY_MAX + 4}`]).toBeDefined();
    m = rememberGeometry(m, "p10", { fx: 1, fy: 1, cols: 50, rows: 12 });
    expect(Object.keys(m.geometry).at(-1)).toBe("p10");
  });

  it("無くなった pane の分を掃除する（留めの印も）", () => {
    const m = sweepMemory({ geometry: { a: { fx: 0, fy: 0, cols: 80, rows: 24 }, b: { fx: 0, fy: 0, cols: 80, rows: 24 } }, pinned: ["a", "b"] }, (id) => id === "a");
    expect(Object.keys(m.geometry)).toEqual(["a"]);
    expect(m.pinned).toEqual(["a"]);
  });

  it("保存して読み戻せる。読めない・保存できない環境でも投げない", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveMemory(storage, { geometry: { a: { fx: 0.25, fy: 0.5, cols: 90, rows: 30 } }, pinned: ["a"] });
    expect(loadMemory(storage)).toEqual({ geometry: { a: { fx: 0.25, fy: 0.5, cols: 90, rows: 30 } }, pinned: ["a"] });
    store.set(WINDOW_MEMORY_KEY, "{broken");
    expect(loadMemory(storage)).toEqual(emptyMemory());
    expect(() => saveMemory({ setItem: () => { throw new Error("quota"); } }, emptyMemory())).not.toThrow();
    expect(loadMemory(null)).toEqual(emptyMemory());
  });

  it("位置は余白に対する割合。領域が変わっても窓は領域の中に収まる", () => {
    const size = { w: 400, h: 300 };
    const f = fractionOf({ x: 300, y: 100 }, { w: 1000, h: 500 }, size);
    expect(f).toEqual({ fx: 0.5, fy: 0.5 });
    expect(placeFromMemory({ ...f, cols: 80, rows: 24 }, { w: 1000, h: 500 }, size)).toEqual({ x: 300, y: 100 });
    // 領域が縮んで窓と同じ大きさになったら、原点
    expect(placeFromMemory({ ...f, cols: 80, rows: 24 }, { w: 400, h: 300 }, size)).toEqual({ x: 0, y: 0 });
    expect(fractionOf({ x: 5, y: 5 }, { w: 400, h: 300 }, size)).toEqual({ fx: 0, fy: 0 });
  });
});
