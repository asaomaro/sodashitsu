import { describe, expect, it } from "vitest";
import type { ItemTarget } from "@sodashitsu/protocol";
import {
  dropBefore,
  nextAnchorOf,
  sameItemTarget,
  type DropAnchor,
  type DropSlot,
} from "./dropTarget.js";

const ws = (id: string): ItemTarget => ({ kind: "workspace", workspaceId: id });
const anchor = (id: string): DropAnchor => ({ item: ws(id), anchorId: id });
/** 入れ物の中の項目 `ids` から i 番目の行の位置を作る。 */
const slot = (ids: string[], i: number): DropSlot => ({
  ...anchor(ids[i]!),
  index: i,
  next: nextAnchorOf(ids, i, anchor),
});
const IDS = ["a", "b", "c"];

describe("dropBefore（ドラッグの before の決め方）", () => {
  it("上へ動かすなら、落とした項目の前", () => {
    expect(dropBefore(slot(IDS, 2), slot(IDS, 0))).toEqual(anchor("a"));
    expect(dropBefore(slot(IDS, 2), slot(IDS, 1))).toEqual(anchor("b"));
  });
  it("下へ動かすなら、落とした項目の次の前", () => {
    expect(dropBefore(slot(IDS, 0), slot(IDS, 1))).toEqual(anchor("c"));
  });
  it("下へ動かして落とした項目が最後なら null（末尾）", () => {
    expect(dropBefore(slot(IDS, 0), slot(IDS, 2))).toBeNull();
    expect(dropBefore(slot(IDS, 1), slot(IDS, 2))).toBeNull();
  });
  it("自分自身の上は受け付けない（undefined）", () => {
    expect(dropBefore(slot(IDS, 1), slot(IDS, 1))).toBeUndefined();
  });
  it("グループ・「グループなし」の項目も同じ決まり", () => {
    const g = (id: string): DropAnchor => ({
      item: { kind: "group", groupId: id },
      anchorId: null,
    });
    const units: DropAnchor[] = [g("G1"), { item: { kind: "ungrouped" }, anchorId: null }, g("G2")];
    const s = (i: number): DropSlot => ({
      ...units[i]!,
      index: i,
      next: nextAnchorOf(units, i, (u) => u),
    });
    expect(dropBefore(s(0), s(1))).toEqual(units[2]);
    expect(dropBefore(s(0), s(2))).toBeNull();
    expect(dropBefore(s(2), s(1))).toEqual(units[1]);
    expect(dropBefore(s(1), s(1))).toBeUndefined();
  });
});

describe("nextAnchorOf", () => {
  it("次の項目を返し、最後は null", () => {
    expect(nextAnchorOf(IDS, 0, anchor)).toEqual(anchor("b"));
    expect(nextAnchorOf(IDS, 2, anchor)).toBeNull();
    expect(nextAnchorOf([], 0, anchor)).toBeNull();
  });
});

describe("sameItemTarget", () => {
  it("種類と id が同じときだけ同じ", () => {
    expect(sameItemTarget(ws("a"), ws("a"))).toBe(true);
    expect(sameItemTarget(ws("a"), ws("b"))).toBe(false);
    expect(sameItemTarget({ kind: "group", groupId: "G" }, { kind: "group", groupId: "G" })).toBe(
      true,
    );
    expect(sameItemTarget({ kind: "group", groupId: "G" }, { kind: "ungrouped" })).toBe(false);
    expect(sameItemTarget({ kind: "ungrouped" }, { kind: "ungrouped" })).toBe(true);
    expect(sameItemTarget(ws("a"), { kind: "ungrouped" })).toBe(false);
  });
});
