import { describe, expect, it } from "vitest";
import { popupCells } from "./popupSize.js";

describe("popupCells（20260927-custom-command-keys の AC4）", () => {
  const area = { cols: 200, rows: 50 };
  it("省略は半分・数はセル・% は割合（切り捨て）", () => {
    expect(popupCells(undefined, undefined, area)).toEqual({ cols: 100, rows: 25 });
    expect(popupCells(90, 30, area)).toEqual({ cols: 90, rows: 30 });
    expect(popupCells("80%", "33%", area)).toEqual({ cols: 160, rows: 16 });
  });
  it("最小 10×3 に切り上げ、領域を超えない", () => {
    expect(popupCells(1, 1, area)).toEqual({ cols: 10, rows: 3 });
    expect(popupCells("1%", "1%", area)).toEqual({ cols: 10, rows: 3 });
    expect(popupCells(1000, 1000, area)).toEqual({ cols: 200, rows: 50 });
    expect(popupCells("100%", "100%", area)).toEqual({ cols: 200, rows: 50 });
  });
  it("領域が最小より小さいときは領域を優先し、サーバの範囲（2〜500）に収める", () => {
    expect(popupCells(undefined, undefined, { cols: 6, rows: 2 })).toEqual({ cols: 6, rows: 2 });
    expect(popupCells(undefined, undefined, { cols: 1, rows: 0 })).toEqual({ cols: 2, rows: 2 });
    expect(popupCells("100%", "100%", { cols: 900, rows: 700 })).toEqual({ cols: 500, rows: 500 });
  });
  it("読めない指定は省略と同じ", () => {
    expect(popupCells("wide" as never, 0 as never, area)).toEqual({ cols: 100, rows: 25 });
  });
});
