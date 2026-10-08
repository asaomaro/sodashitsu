import { describe, expect, it } from "vitest";
import { freeIntervals, pickToastSlot } from "./toastSlot.js";

const base = { viewportH: 800, stripLeft: 700, stripRight: 1000, margin: 8, need: 60 };
const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe("pickToastSlot", () => {
  it("固定の部品が無ければ、画面全体が空き（今の右下と同じ。区間の下端に寄る）", () => {
    expect(pickToastSlot({ ...base, chrome: [] })).toEqual({ top: 8, maxHeight: 784 });
  });
  it("右のパネルの見出し（上）だけなら、その下から下端まで。下端は今の右下と同じ（margin だけ空ける）", () => {
    const s = pickToastSlot({ ...base, chrome: [r(700, 0, 300, 28)] });
    expect(s).toEqual({ top: 28, maxHeight: 764 });
    expect(s.top + s.maxHeight).toBe(800 - 8);
  });
  it("横に重ならない固定の部品（左のパネルの見出し）は避けない", () => {
    expect(pickToastSlot({ ...base, chrome: [r(0, 100, 300, 28)] })).toEqual({ top: 8, maxHeight: 784 });
  });
  it("下の帯の行が右の縁まで届くなら、その上に出る（重ならない）", () => {
    const s = pickToastSlot({ ...base, chrome: [r(0, 770, 1000, 30)] });
    expect(s.top + s.maxHeight).toBeLessThanOrEqual(770);
  });
  it("下から見て、need 以上の最初の空き。下の空きが足りなければ、その上の空きを選ぶ", () => {
    const s = pickToastSlot({ ...base, need: 100, chrome: [r(700, 0, 300, 28), r(700, 400, 300, 28), r(700, 740, 300, 60)] });
    // 空き: [28,400)・[428,740)。下から見て 100 以上の最初は [428,740)
    expect(s).toEqual({ top: 428, maxHeight: 312 });
  });
  it("どの空きも need に足りなければ、いちばん高い区間（重ねない。区間の中でスクロール）", () => {
    const s = pickToastSlot({ ...base, need: 500, chrome: [r(700, 0, 300, 100), r(700, 300, 300, 50), r(700, 700, 300, 100)] });
    // 空き: [100,300)=200・[350,700)=350 → 350
    expect(s).toEqual({ top: 350, maxHeight: 350 });
  });
  it("空きが 1 つも無ければ画面全体（重ねるしかない）", () => {
    expect(pickToastSlot({ ...base, chrome: [r(700, 0, 300, 800)] })).toEqual({ top: 8, maxHeight: 784 });
  });
  it("chrome が空・大きさ 0 の箱は無視する", () => {
    expect(freeIntervals({ ...base, chrome: [r(700, 100, 0, 30), r(700, 100, 30, 0)] })).toEqual([{ start: 8, end: 792 }]);
  });
  it("重なり合う固定の部品は 1 つに数える", () => {
    expect(freeIntervals({ ...base, chrome: [r(700, 100, 300, 50), r(700, 120, 300, 100)] })).toEqual([
      { start: 8, end: 100 },
      { start: 220, end: 792 },
    ]);
  });
});
