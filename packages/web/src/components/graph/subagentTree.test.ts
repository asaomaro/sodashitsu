import { describe, expect, it } from "vitest";
import {
  flattenTree,
  ledgerKey,
  ledgerVisible,
  reconcileLedger,
  SUBAGENT_FADE_MS,
  SUBAGENT_INDENT_MAX,
  SUBAGENT_SHOW_DELAY_MS,
  type LedgerEntry,
} from "./subagentTree.js";

const live = (...ids: string[]) =>
  new Map(ids.map((id) => [ledgerKey("p", id), { parentKey: "p", item: { id } }]));
const empty = new Map<string, LedgerEntry<{ id: string }>>();

describe("reconcileLedger", () => {
  it("初めて見たものは firstSeen = now。2 秒たつまで出さない", () => {
    const l = reconcileLedger(empty, live("a"), 1000, false);
    const e = l.get(ledgerKey("p", "a"))!;
    expect(e.firstSeen).toBe(1000);
    expect(ledgerVisible(e, 1000 + SUBAGENT_SHOW_DELAY_MS - 1)).toBe(false);
    expect(ledgerVisible(e, 1000 + SUBAGENT_SHOW_DELAY_MS)).toBe(true);
  });

  it("更新しても firstSeen は変わらない（項目は新しいものに替わる）", () => {
    const a = reconcileLedger(empty, live("a"), 1000, false);
    const b = reconcileLedger(a, live("a"), 5000, false);
    expect(b.get(ledgerKey("p", "a"))!.firstSeen).toBe(1000);
  });

  it("出ていたものが一覧から消えたら goneAt を付けて 1 秒残し、その後捨てる", () => {
    let l = reconcileLedger(empty, live("a"), 0, false);
    l = reconcileLedger(l, live(), 3000, false);
    expect(l.get(ledgerKey("p", "a"))!.goneAt).toBe(3000);
    expect(ledgerVisible(l.get(ledgerKey("p", "a"))!, 3500)).toBe(true);
    l = reconcileLedger(l, live(), 3000 + SUBAGENT_FADE_MS - 1, false);
    expect(l.has(ledgerKey("p", "a"))).toBe(true);
    l = reconcileLedger(l, live(), 3000 + SUBAGENT_FADE_MS, false);
    expect(l.size).toBe(0);
  });

  it("出る前（2 秒たたない）に消えたものは、すぐ捨てる（ちらつかせない）", () => {
    let l = reconcileLedger(empty, live("a"), 0, false);
    l = reconcileLedger(l, live(), 1500, false);
    expect(l.size).toBe(0);
  });

  it("動きを減らす設定では、出ていたものも残さずすぐ捨てる", () => {
    let l = reconcileLedger(empty, live("a"), 0, true);
    l = reconcileLedger(l, live(), 3000, true);
    expect(l.size).toBe(0);
  });

  it("消える途中のものが一覧に戻れば、goneAt を外す。親ごとに別の鍵", () => {
    let l = reconcileLedger(empty, live("a"), 0, false);
    l = reconcileLedger(l, live(), 3000, false);
    l = reconcileLedger(l, live("a"), 3200, false);
    expect(l.get(ledgerKey("p", "a"))!.goneAt).toBeNull();
    expect(ledgerKey("p1", "a")).not.toBe(ledgerKey("p2", "a"));
  });
});

describe("flattenTree", () => {
  const it_ = (id: string, parentId?: string) => ({ id, ...(parentId ? { parentId } : {}) });
  it("親の次に子、起動した順。入れ子は字下げ、親の行の番号を持つ", () => {
    const rows = flattenTree([it_("a"), it_("b"), it_("a1", "a"), it_("a1x", "a1"), it_("b1", "b")]);
    expect(rows.map((r) => [r.item.id, r.indent, r.parentRow])).toEqual([
      ["a", 0, null],
      ["a1", 1, 0],
      ["a1x", 2, 1],
      ["b", 0, null],
      ["b1", 1, 3],
    ]);
  });

  it("親が一覧に無い・自分を親にしたものは根。輪になったものも落とさない", () => {
    const rows = flattenTree([it_("x", "gone"), it_("self", "self"), it_("c1", "c2"), it_("c2", "c1")]);
    expect(rows.map((r) => r.item.id).sort()).toEqual(["c1", "c2", "self", "x"]);
    expect(rows.find((r) => r.item.id === "x")!.parentRow).toBeNull();
  });

  it("字下げの段は上限で止まる", () => {
    const chain = Array.from({ length: 8 }, (_, i) => it_(`n${i}`, i === 0 ? undefined : `n${i - 1}`));
    expect(Math.max(...flattenTree(chain).map((r) => r.indent))).toBe(SUBAGENT_INDENT_MAX);
  });

  it("重複した id は 1 つにする", () => {
    expect(flattenTree([it_("a"), it_("a")]).length).toBe(1);
  });
});
