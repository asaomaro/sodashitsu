import { describe, expect, it } from "vitest";
import { panelWidth, panelWidthRange, visibleBands } from "./displayLayout.js";

describe("panelWidthRange", () => {
  it("最大は pane の半分と、端末 40 列を残す幅の小さい方", () => {
    expect(panelWidthRange(1000, 9)).toEqual({ min: 160, max: 500 }); // 半分 500・1000-360=640
    expect(panelWidthRange(700, 9)).toEqual({ min: 160, max: 340 }); // 半分 350・700-360=340
  });
  it("最大が 160 を下回れば null（自動でたたむ）。ちょうど 160 は出せる", () => {
    expect(panelWidthRange(500, 9)).toBeNull(); // min(250, 140)
    expect(panelWidthRange(520, 9)).toEqual({ min: 160, max: 160 });
    expect(panelWidthRange(519, 9)).toBeNull();
  });
  it("セルの幅が不正なら 9 を使う", () => {
    expect(panelWidthRange(700, 0)).toEqual(panelWidthRange(700, 9));
  });
});

describe("panelWidth", () => {
  it("利用者の幅 > プログラムの size を、範囲に丸める", () => {
    expect(panelWidth(1000, 320, 9)).toEqual({ width: 320, autoCollapsed: false });
    expect(panelWidth(1000, 320, 9, 400)).toEqual({ width: 400, autoCollapsed: false });
    expect(panelWidth(1000, 800, 9)).toEqual({ width: 500, autoCollapsed: false });
    expect(panelWidth(1000, 100, 9, 120)).toEqual({ width: 160, autoCollapsed: false });
  });
  it("範囲が無ければ自動でたたむ", () => {
    expect(panelWidth(400, 320, 9)).toEqual({ width: 0, autoCollapsed: true });
  });
});

describe("visibleBands", () => {
  it("高さの合計が pane の高さの 3 分の 1 以下に収まる先頭の本数", () => {
    expect(visibleBands([32, 32], 300)).toEqual({ shown: 2, hidden: 0 }); // 64 <= 100
    expect(visibleBands([32, 32], 180)).toEqual({ shown: 1, hidden: 1 }); // 60: 32 ok, 64 > 60
    expect(visibleBands([32, 32], 192)).toEqual({ shown: 2, hidden: 0 }); // 64 <= 64
    expect(visibleBands([96], 100)).toEqual({ shown: 0, hidden: 1 });
    expect(visibleBands([], 100)).toEqual({ shown: 0, hidden: 0 });
  });
});
