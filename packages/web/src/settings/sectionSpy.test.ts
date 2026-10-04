import { describe, expect, it } from "vitest";
import { keepChosen, scrollTopFor, sectionAtScroll, stepSection, type SpyInput } from "./sectionSpy.js";

// 見えている高さ 500・題名の行 50・全体 2400（最大のスクロール 1900）。節は 6 つ。
const base: SpyInput = {
  tops: [50, 300, 600, 900, 1200, 2000],
  scrollTop: 0,
  viewHeight: 500,
  scrollHeight: 2400,
  headerHeight: 50,
};
const at = (scrollTop: number, over: Partial<SpyInput> = {}): SpyInput => ({ ...base, ...over, scrollTop });

describe("sectionAtScroll", () => {
  it("いちばん上は 0、いちばん下は最後の節", () => {
    expect(sectionAtScroll(at(0))).toBe(0);
    expect(sectionAtScroll(at(1900))).toBe(5);
  });

  it("途中は、題名の行のすぐ下に掛かっている節", () => {
    expect(sectionAtScroll(at(600))).toBe(2);
    expect(sectionAtScroll(at(300))).toBe(1);
  });

  it("線は題名の行の分だけ下にある（headerHeight を式から外すと変わる）", () => {
    // y=820: 線 = 820 + 50 + 40 = 910 → 900 の節（3）。題名の行を無視すると 860 で 2 になる。
    expect(sectionAtScroll(at(820))).toBe(3);
    expect(sectionAtScroll(at(820, { headerHeight: 0 }))).toBe(2);
  });

  it("残りが 1 画面を切ると線が下へ寄り、末尾の短い節が順に今の節になる", () => {
    const tail: Partial<SpyInput> = { tops: [50, 300, 600, 900, 1200, 1600], scrollHeight: 2000 }; // 最大 1500
    expect(sectionAtScroll(at(1100, tail))).toBe(4);
    expect(sectionAtScroll(at(1300, tail))).toBe(5);
    expect(sectionAtScroll(at(1500, tail))).toBe(5);
  });

  it("線の定数 40 を縛る（節の上端が線のちょうど上なら今の節、1px 下なら前の節）", () => {
    // y=0: 線 = 0 + 50 + 40 = 90。
    expect(sectionAtScroll(at(0, { tops: [50, 90, 600, 900, 1200, 2000] }))).toBe(1);
    expect(sectionAtScroll(at(0, { tops: [50, 91, 600, 900, 1200, 2000] }))).toBe(0);
  });

  it("見えている高さが 0 でも NaN にならない", () => {
    // 線は y + 50 + 40 から動かない（k0 = 0）。
    expect(sectionAtScroll(at(0, { viewHeight: 0 }))).toBe(0);
    expect(sectionAtScroll(at(1000, { viewHeight: 0 }))).toBe(3);
  });

  it("スクロールできないときは 0、節が無ければ -1", () => {
    expect(sectionAtScroll(at(0, { scrollHeight: 500 }))).toBe(0);
    expect(sectionAtScroll(at(0, { tops: [] }))).toBe(-1);
  });
});

describe("keepChosen", () => {
  it("選んでいなければ null", () => {
    expect(keepChosen(null, at(0), null)).toBeNull();
  });

  it("見出しが見える範囲にあれば保つ", () => {
    expect(keepChosen(0, at(0), null)).toBe(0);
    expect(keepChosen(2, at(400), null)).toBe(2);
  });

  it("見出しが題名の行の下に隠れたら外す", () => {
    expect(keepChosen(0, at(100), null)).toBeNull();
  });

  it("見える範囲の境界（上は題名の行の下 −2px まで保つ、下は端の手前まで）", () => {
    const y = 1000;
    const top = (t: number): SpyInput => at(y, { tops: [t, 1300, 1500, 1700, 1900, 2000] });
    expect(keepChosen(0, top(y + 50 - 2), null)).toBe(0);
    expect(keepChosen(0, top(y + 50 - 3), null)).toBeNull();
    expect(keepChosen(0, top(y + 500 - 1), null)).toBe(0);
    expect(keepChosen(0, top(y + 500), null)).toBeNull();
  });

  it("題名の行の高さを見える範囲に使う（headerHeight を式から外すと変わる）", () => {
    expect(keepChosen(0, at(10), null)).toBeNull();
    expect(keepChosen(0, at(10, { headerHeight: 0 }), null)).toBe(0);
  });

  it("見出しは外れたが、その節のフォーカスの部品が見えていれば保つ", () => {
    expect(keepChosen(5, at(0), { section: 5, top: 300 })).toBe(5);
  });

  it("見出しもフォーカスの部品も外れたら null", () => {
    expect(keepChosen(5, at(0), { section: 5, top: 2100 })).toBeNull();
    expect(keepChosen(5, at(0), null)).toBeNull();
  });

  it("フォーカスが別の節なら、見出しだけで決まる", () => {
    expect(keepChosen(5, at(0), { section: 2, top: 300 })).toBeNull();
  });

  it("範囲外の番号は null", () => {
    expect(keepChosen(9, at(0), null)).toBeNull();
  });
});

describe("stepSection", () => {
  it("次・前へ進み、端では null", () => {
    expect(stepSection(2, 1, 6)).toBe(3);
    expect(stepSection(2, -1, 6)).toBe(1);
    expect(stepSection(5, 1, 6)).toBeNull();
    expect(stepSection(0, -1, 6)).toBeNull();
  });
});

describe("scrollTopFor", () => {
  it("見出しが題名の行のすぐ下に来る位置（見出しの上 = 題名の行 + 8px）", () => {
    expect(scrollTopFor(2, base)).toBe(542);
  });

  it("最初の節は 0", () => {
    expect(scrollTopFor(0, base)).toBe(0);
  });

  it("0 未満にならず、最大を超えない", () => {
    expect(scrollTopFor(1, at(0, { tops: [50, 30, 600, 900, 1200, 2000] }))).toBe(0);
    expect(scrollTopFor(5, base)).toBe(1900);
  });

  it("存在しない節は 0", () => {
    expect(scrollTopFor(9, base)).toBe(0);
  });
});
