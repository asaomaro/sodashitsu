import { describe, expect, it } from "vitest";
import { clampRatio, ratioFromOffset, ratioPercent, stepRatio, type SectionBox } from "./sectionSizing";

const box: SectionBox = { total: 400, minTop: 100, minBottom: 80 };

describe("clampRatio", () => {
  it("範囲内の比はそのまま返す", () => {
    expect(clampRatio(0.5, box)).toBe(0.5);
  });
  it("spaces の最小を割る比は下限（minTop / total）に収める", () => {
    expect(clampRatio(0.05, box)).toBeCloseTo(0.25, 10);
  });
  it("agents の最小を割る比は上限（1 − minBottom / total）に収める", () => {
    expect(clampRatio(0.99, box)).toBeCloseTo(0.8, 10);
  });
  it("total が最小の合計に足りないときは 0.5", () => {
    expect(clampRatio(0.9, { total: 150, minTop: 100, minBottom: 80 })).toBe(0.5);
    expect(clampRatio(0.1, { total: 0, minTop: 100, minBottom: 80 })).toBe(0.5);
  });
});

describe("ratioFromOffset", () => {
  it("位置（px）を total で割った比にする", () => {
    expect(ratioFromOffset(200, box)).toBe(0.5);
  });
  it("最小を割る位置は収める", () => {
    expect(ratioFromOffset(10, box)).toBeCloseTo(0.25, 10);
    expect(ratioFromOffset(399, box)).toBeCloseTo(0.8, 10);
  });
  it("total が 0 なら 0.5", () => {
    expect(ratioFromOffset(10, { total: 0, minTop: 0, minBottom: 0 })).toBe(0.5);
  });
});

describe("stepRatio", () => {
  it("deltaPx ぶん動かす", () => {
    expect(stepRatio(0.5, 40, box)).toBeCloseTo(0.6, 10);
    expect(stepRatio(0.5, -40, box)).toBeCloseTo(0.4, 10);
  });
  it("端で止まる", () => {
    expect(stepRatio(0.26, -40, box)).toBeCloseTo(0.25, 10);
    expect(stepRatio(0.79, 40, box)).toBeCloseTo(0.8, 10);
  });
});

describe("ratioPercent", () => {
  it("百分率の整数にする", () => {
    expect(ratioPercent(0.5)).toBe(50);
    expect(ratioPercent(0.256)).toBe(26);
  });
});
