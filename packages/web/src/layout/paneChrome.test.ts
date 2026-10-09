import { describe, expect, it } from "vitest";
import {
  childNeighbors,
  NO_NEIGHBORS,
  resolvePaneChrome,
  type PaneBorders,
  type PaneSide,
  type PaneSides,
} from "./paneChrome.js";

const ALL: PaneSides = { top: true, right: true, bottom: true, left: true };
const RIGHT_ONLY: PaneSides = { ...NO_NEIGHBORS, right: true };

describe("childNeighbors — 分割の子の隣（AC4）", () => {
  it("右分割：a は右に、b は左に隣を持つ", () => {
    expect(childNeighbors(NO_NEIGHBORS, "right", "a")).toEqual({ ...NO_NEIGHBORS, right: true });
    expect(childNeighbors(NO_NEIGHBORS, "right", "b")).toEqual({ ...NO_NEIGHBORS, left: true });
  });
  it("下分割：a は下に、b は上に隣を持つ", () => {
    expect(childNeighbors(NO_NEIGHBORS, "down", "a")).toEqual({ ...NO_NEIGHBORS, bottom: true });
    expect(childNeighbors(NO_NEIGHBORS, "down", "b")).toEqual({ ...NO_NEIGHBORS, top: true });
  });
  it("入れ子：親の隣を引き継いで 1 辺足す（親は変えない）", () => {
    const parent = childNeighbors(NO_NEIGHBORS, "right", "b"); // 左に隣
    expect(childNeighbors(parent, "down", "a")).toEqual({
      ...NO_NEIGHBORS,
      left: true,
      bottom: true,
    });
    expect(childNeighbors(parent, "down", "b")).toEqual({ ...NO_NEIGHBORS, left: true, top: true });
    expect(parent).toEqual({ ...NO_NEIGHBORS, left: true });
  });
});

describe("resolvePaneChrome — 描画モードと隙間の組み合わせ", () => {
  it("常に×隙間入（既定）：どの隣でも 4 辺に余白、枠あり（AC1）", () => {
    for (const neighbors of [NO_NEIGHBORS, RIGHT_ONLY, ALL]) {
      for (const multiPane of [false, true]) {
        expect(resolvePaneChrome("always", true, multiPane, neighbors)).toEqual({
          framed: true,
          padded: ALL,
        });
      }
    }
  });

  it("分割時だけ：分割していなければ枠なし・余白なし、分割していれば常にと同じ（AC2）", () => {
    expect(resolvePaneChrome("auto", true, false, NO_NEIGHBORS)).toEqual({
      framed: false,
      padded: NO_NEIGHBORS,
    });
    expect(resolvePaneChrome("auto", true, true, RIGHT_ONLY)).toEqual(
      resolvePaneChrome("always", true, true, RIGHT_ONLY),
    );
    expect(resolvePaneChrome("auto", true, true, NO_NEIGHBORS)).toEqual({
      framed: true,
      padded: ALL,
    }); // zoom 中
  });

  it("表示しない：分割の有無に関わらず枠なし、外周の辺は余白なし（AC3）", () => {
    for (const multiPane of [false, true]) {
      expect(resolvePaneChrome("off", false, multiPane, NO_NEIGHBORS)).toEqual({
        framed: false,
        padded: NO_NEIGHBORS,
      });
    }
  });

  it("隙間切：隣と接する辺だけ余白なし、外周は枠の設定どおり（AC4）", () => {
    expect(resolvePaneChrome("always", false, true, RIGHT_ONLY)).toEqual({
      framed: true,
      padded: { top: true, right: false, bottom: true, left: true },
    });
    expect(resolvePaneChrome("always", false, true, ALL).padded).toEqual(NO_NEIGHBORS);
  });

  it("辺ごとに、その辺の隣だけを見る（隣が 1 辺だけの入力を 4 辺とも試す。AC4・AC5）", () => {
    const sides: PaneSide[] = ["top", "right", "bottom", "left"];
    for (const side of sides) {
      const one: PaneSides = { ...NO_NEIGHBORS, [side]: true };
      const notOne: PaneSides = { top: true, right: true, bottom: true, left: true, [side]: false };
      expect(resolvePaneChrome("always", false, true, one).padded, side).toEqual(notOne);
      expect(resolvePaneChrome("off", true, true, one).padded, side).toEqual(one);
    }
  });

  it("枠なし×隙間入：隣と接する辺にだけ余白（AC5）", () => {
    const modes: PaneBorders[] = ["off", "auto"];
    for (const mode of modes) {
      expect(resolvePaneChrome(mode, true, mode === "off", RIGHT_ONLY)).toEqual({
        framed: false,
        padded: RIGHT_ONLY,
      });
    }
    expect(resolvePaneChrome("off", true, true, ALL).padded).toEqual(ALL);
  });
});

// 20261008-ui-style T12a: 4 つの設定（枠の表示・隙間・外周の枠・太さ）は、様式に依らず、今と同じ意味で効く。
// `resolvePaneChrome` は様式を引数に持たない（太さは CSS 変数 `--soda-pane-gap` が決める）ので、すべての組み合わせで、様式の違いが入り込まないことを確かめる。
describe("resolvePaneChrome は、様式に依らない（すべての組み合わせ）", () => {
  it("設定の全組み合わせで、枠の有無・辺ごとの余白が、設定だけで決まる", () => {
    const sidesList: PaneSides[] = [
      NO_NEIGHBORS,
      { top: false, right: true, bottom: false, left: false },
      { top: true, right: false, bottom: true, left: true },
    ];
    for (const borders of ["always", "auto", "off"] as const)
      for (const gaps of [true, false])
        for (const multi of [true, false])
          for (const n of sidesList) {
            const c = resolvePaneChrome(borders, gaps, multi, n);
            const framed = borders === "always" || (borders === "auto" && multi);
            expect(c.framed).toBe(framed);
            for (const side of ["top", "right", "bottom", "left"] as const)
              expect(c.padded[side], `${borders}/${gaps}/${multi}/${side}`).toBe(n[side] ? gaps : framed);
          }
  });
});
