import type { GitInfo, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  addItemToGroup,
  deleteGroupFromLayout,
  flattenWorkspaceIds,
  insertGroup,
  insertItem,
  moveItem,
  moveItemBy,
  removeItem,
  removeItemFromGroup,
  repairLayout,
} from "./sidebarLayout.js";

function git(repoKey: string, isLinkedWorktree = false, worktreeKey?: string | null): GitInfo {
  return { branch: "main", ahead: 0, behind: 0, repoKey, isLinkedWorktree, ...(worktreeKey !== undefined ? { worktreeKey } : {}) };
}

function ws(id: string, overrides: Partial<Workspace> = {}): Workspace {
  return {
    id,
    label: id,
    cwd: `/${id}`,
    tabIds: [],
    activeTabId: "t1",
    groupId: null,
    git: null,
    autoLabel: false,
    ...overrides,
  };
}

const groups: WorkspaceGroup[] = [
  { id: "g1", label: "G1", collapsed: false },
  { id: "g2", label: "G2", collapsed: false },
];

const base = (): SidebarLayout => ({
  top: ["g:g1", "g:g2", "u"],
  groups: { g1: ["r:R", "w:c"], g2: [] },
  ungrouped: ["w:a", "w:b"],
});

describe("insertItem / removeItem", () => {
  it("before の前へ入れる。before が無ければ末尾。同じ入れ物に既にあれば同じ参照を返す。null は「グループなし」", () => {
    expect(insertItem(base(), "w:x", null, "w:b").ungrouped).toEqual(["w:a", "w:x", "w:b"]);
    expect(insertItem(base(), "w:x", null).ungrouped).toEqual(["w:a", "w:b", "w:x"]);
    expect(insertItem(base(), "w:x", "g1").groups.g1).toEqual(["r:R", "w:c", "w:x"]);
    const l = base();
    expect(insertItem(l, "w:a", null)).toBe(l);
  });
  it("まとまり（g:・u）は入れない。存在しないグループへも入れない", () => {
    const l = base();
    expect(insertItem(l, "g:g2", "g1")).toBe(l);
    expect(insertItem(l, "g:g2", null)).toBe(l);
    expect(insertItem(l, "u", null)).toBe(l);
    expect(insertItem(l, "w:x", "nope")).toBe(l);
  });
  it("removeItem はどの入れ物からでも外す。空になってもキーは残す。元は書き換えない。まとまりは外さない", () => {
    const l = base();
    expect(removeItem(l, "w:c").groups.g1).toEqual(["r:R"]);
    expect(removeItem(removeItem(l, "r:R"), "w:c").groups.g1).toEqual([]);
    expect(removeItem(l, "w:a").ungrouped).toEqual(["w:b"]);
    expect(l).toEqual(base());
    expect(removeItem(l, "w:none")).toBe(l);
    expect(removeItem(l, "g:g1")).toBe(l);
    expect(removeItem(l, "u")).toBe(l);
  });
});

describe("insertGroup（追補 01 B: 新しいグループは「グループなし」の直前）", () => {
  it("top の u の直前へ足し、groups に空のキーを作る", () => {
    const r = insertGroup(base(), "g3");
    expect(r.top).toEqual(["g:g1", "g:g2", "g:g3", "u"]);
    expect(r.groups).toEqual({ g1: ["r:R", "w:c"], g2: [], g3: [] });
    expect(r.ungrouped).toEqual(["w:a", "w:b"]);
  });
  it("u が先頭にあればその直前（グループの前）。u が top に無ければ末尾。すでにあれば同じ参照", () => {
    expect(insertGroup({ ...base(), top: ["u", "g:g1", "g:g2"] }, "g3").top).toEqual(["g:g3", "u", "g:g1", "g:g2"]);
    expect(insertGroup({ ...base(), top: ["g:g1", "g:g2"] }, "g3").top).toEqual(["g:g1", "g:g2", "g:g3"]);
    const l = base();
    expect(insertGroup(l, "g1")).toBe(l);
  });
});

describe("moveItem（AC5・AC20）", () => {
  it("まとまり（グループ・グループなし）は top の中で動く", () => {
    expect(moveItem(base(), "g:g2", "g:g1")).toEqual({
      layout: { ...base(), top: ["g:g2", "g:g1", "u"] },
      moved: true,
    });
    expect(moveItem(base(), "u", "g:g1").layout.top).toEqual(["u", "g:g1", "g:g2"]);
    expect(moveItem(base(), "g:g1", null).layout.top).toEqual(["g:g2", "u", "g:g1"]);
  });
  it("グループの中・グループなしの中の項目はその中で動く", () => {
    expect(moveItem(base(), "w:c", "r:R").layout.groups.g1).toEqual(["w:c", "r:R"]);
    expect(moveItem(base(), "w:a", null).layout.ungrouped).toEqual(["w:b", "w:a"]);
    expect(moveItem(base(), "w:b", "w:a").layout.ungrouped).toEqual(["w:b", "w:a"]);
  });
  it("入れ物をまたぐ・自分自身の前・項目とまとまりの取り違え・無い項目は moved: false で何も変えない", () => {
    const l = base();
    for (const [item, before] of [
      ["w:a", "w:c"], // グループなし → グループの中
      ["w:c", "w:b"], // グループの中 → グループなし
      ["r:R", "r:R"],
      ["w:a", "g:g1"], // 項目をまとまりの前へ（グループの間に項目は挟めない）
      ["g:g1", "w:a"], // まとまりを項目の前へ
      ["g:g2", "r:R"],
      ["w:none", null],
      ["w:a", "w:none"],
      ["g:none", null],
    ] as const) {
      const r = moveItem(l, item, before);
      expect(r.moved, `${item} -> ${before}`).toBe(false);
      expect(r.layout).toBe(l);
    }
  });
  it("位置が変わらない移動は受け付ける（moved: true・同じ参照）", () => {
    const l = base();
    expect(moveItem(l, "g:g2", "u")).toEqual({ layout: l, moved: true });
    expect(moveItem(l, "w:a", "w:b")).toEqual({ layout: l, moved: true });
  });
});

describe("moveItemBy", () => {
  it("1 つ動かす。端では巡回せず止まる", () => {
    expect(moveItemBy(base(), "g:g1", "next").layout.top).toEqual(["g:g2", "g:g1", "u"]);
    expect(moveItemBy(base(), "u", "previous").layout.top).toEqual(["g:g1", "u", "g:g2"]);
    expect(moveItemBy(base(), "w:c", "previous").layout.groups.g1).toEqual(["w:c", "r:R"]);
    expect(moveItemBy(base(), "w:a", "next").layout.ungrouped).toEqual(["w:b", "w:a"]);
    const l = base();
    for (const [ref, dir] of [
      ["g:g1", "previous"],
      ["u", "next"],
      ["w:c", "next"],
      ["r:R", "previous"],
      ["w:a", "previous"],
      ["w:b", "next"],
      ["w:none", "next"],
      ["g:none", "next"],
    ] as const) {
      const r = moveItemBy(l, ref, dir);
      expect(r.moved, `${ref} ${dir}`).toBe(false);
      expect(r.layout).toBe(l);
    }
  });
});

describe("addItemToGroup / removeItemFromGroup（AC10）", () => {
  it("末尾へ入れる。別のグループにいれば移す", () => {
    const a = addItemToGroup(base(), "w:a", "g1");
    expect(a.ungrouped).toEqual(["w:b"]);
    expect(a.groups.g1).toEqual(["r:R", "w:c", "w:a"]);
    const b = addItemToGroup(base(), "r:R", "g2");
    expect(b.groups).toEqual({ g1: ["w:c"], g2: ["r:R"] });
  });
  it("まとまり・存在しないグループは何もしない", () => {
    const l = base();
    expect(addItemToGroup(l, "g:g2", "g1")).toBe(l);
    expect(addItemToGroup(l, "u", "g1")).toBe(l);
    expect(addItemToGroup(l, "w:a", "nope")).toBe(l);
  });
  it("外すと「グループなし」の末尾へ置く。グループに居なければ何もしない", () => {
    const r = removeItemFromGroup(base(), "w:c");
    expect(r.ungrouped).toEqual(["w:a", "w:b", "w:c"]);
    expect(r.groups.g1).toEqual(["r:R"]);
    expect(r.top).toEqual(base().top);
    const l = base();
    expect(removeItemFromGroup(l, "w:a")).toBe(l); // もう「グループなし」
    expect(removeItemFromGroup(l, "w:none")).toBe(l);
  });
});

describe("deleteGroupFromLayout（AC10）", () => {
  it("中身を「グループなし」の末尾へ順に出し、グループのキーと top の参照を消す", () => {
    const r = deleteGroupFromLayout(base(), "g1");
    expect(r.top).toEqual(["g:g2", "u"]);
    expect(r.ungrouped).toEqual(["w:a", "w:b", "r:R", "w:c"]);
    expect(r.groups).toEqual({ g2: [] });
  });
  it("空のグループは位置から消えるだけ。無いグループは何もしない", () => {
    const r = deleteGroupFromLayout(base(), "g2");
    expect(r.top).toEqual(["g:g1", "u"]);
    expect(r.ungrouped).toEqual(["w:a", "w:b"]);
    const l = base();
    expect(deleteGroupFromLayout(l, "nope")).toBe(l);
  });
});

describe("flattenWorkspaceIds", () => {
  it("平らな順: top の順にまとまりの中身を並べる。r: は本体が先頭で展開、グループなしは u の位置", () => {
    const list = [
      ws("a"),
      ws("c"),
      ws("w1", { git: git("R", true) }),
      ws("w2", { git: git("R", false) }),
      ws("b"),
    ];
    expect(flattenWorkspaceIds(base(), list)).toEqual(["w2", "w1", "c", "a", "b"]);
    expect(flattenWorkspaceIds({ ...base(), top: ["u", "g:g1", "g:g2"] }, list)).toEqual(["a", "b", "w2", "w1", "c"]);
  });
  it("レイアウトに無い workspace（top に無いグループの中身を含む）は末尾へ、実在しない参照は飛ばす、重複は先のものだけ", () => {
    const list = [ws("a"), ws("z"), ws("y")];
    const layout: SidebarLayout = {
      top: ["u", "g:nope", "w:z"],
      groups: { orphan: ["w:y"] },
      ungrouped: ["w:ghost", "w:a", "w:a"],
    };
    expect(flattenWorkspaceIds(layout, list)).toEqual(["a", "z", "y"]);
  });
  it("AC19: r: の展開は代表だけ。代表でない workspace は w: の位置に出る", () => {
    const k = "/R/worktrees/x";
    const list = [
      ws("p", { git: git("R", true, k) }),
      ws("q", { git: git("R", true, k) }),
    ];
    const layout: SidebarLayout = { top: ["u"], groups: {}, ungrouped: ["w:q", "r:R"] };
    // q は代表でないので w:q の位置（先頭）に出ようとするが、代表 p が同じ worktree の最前列を占める
    expect(flattenWorkspaceIds(layout, list)).toEqual(["p", "q"]);
  });
  it("AC19: 代表でない workspace を代表の前へ並べても、代表は同じ worktree の workspace の一番前に残る（代表が入れ替わり続けない）", () => {
    const k = "/R/worktrees/x";
    const list = [
      ws("a"),
      ws("p", { git: git("R", true, k) }),
      ws("q", { git: git("R", true, k) }),
    ];
    const layout: SidebarLayout = { top: ["u"], groups: {}, ungrouped: ["w:q", "w:a", "r:R"] };
    const flat = flattenWorkspaceIds(layout, list);
    expect(flat).toEqual(["p", "a", "q"]);
    // 平らな順を入力に戻しても代表は p のまま。
    const again = flat.map((id) => list.find((w) => w.id === id)!);
    expect(flattenWorkspaceIds(layout, again)).toEqual(["p", "a", "q"]);
  });
});

describe("repairLayout（AC13）", () => {
  const list = [ws("a"), ws("b"), ws("c"), ws("w1", { git: git("R") })];

  it("壊れていなければ同じ内容で、捨てたものは無い", () => {
    const r = repairLayout(base(), list, groups);
    expect(r.layout).toEqual(base());
    expect(r.dropped).toEqual([]);
  });
  it("実在しない参照・重複・top の中の項目・2 つ目の u・グループの中の g:・実在しないグループのキーを捨てて、捨てた参照を返す", () => {
    const broken: SidebarLayout = {
      top: ["w:a", "g:g1", "g:gone", "u", "u", "g:g1", "g:g2"],
      groups: { g1: ["r:R", "g:g2", "w:c", "w:b"], gone: ["w:z"] },
      ungrouped: ["w:ghost", "w:a", "r:Gone", "w:b", "w:b"],
    };
    const r = repairLayout(broken, list, groups);
    expect(r.layout).toEqual({
      top: ["g:g1", "u", "g:g2"],
      groups: { g1: ["r:R", "w:c", "w:b"], g2: [] },
      ungrouped: ["w:a"],
    });
    expect([...r.dropped].sort()).toEqual(
      ["g:g1", "g:g2", "g:gone", "r:Gone", "u", "w:a", "w:b", "w:b", "w:ghost", "w:z"].sort(),
    );
  });
  it("無い workspace は「グループなし」の末尾へ、無いグループは u の直前へ、u が無ければ末尾に足す", () => {
    const r = repairLayout({ top: [], groups: {}, ungrouped: ["w:a"] }, list, groups);
    expect(r.layout.top).toEqual(["g:g1", "g:g2", "u"]);
    expect(r.layout.groups).toEqual({ g1: [], g2: [] });
    expect(r.layout.ungrouped).toEqual(["w:a", "w:b", "w:c", "r:R"]);
    expect(r.dropped).toEqual([]);
    const r2 = repairLayout({ top: ["u"], groups: {}, ungrouped: [] }, [ws("a")], groups);
    expect(r2.layout.top).toEqual(["g:g1", "g:g2", "u"]);
  });
  it("workspace の今の判定と合わない参照（w: なのに repoKey を持つ代表）は捨て、判定どおりの項目を足す", () => {
    const r = repairLayout({ top: ["u"], groups: {}, ungrouped: ["w:w1"] }, [ws("w1", { git: git("R") })], []);
    expect(r.layout.ungrouped).toEqual(["r:R"]);
    expect(r.dropped).toEqual(["w:w1"]);
  });
  it("AC19: 代表でない workspace の参照は w:<id>。代表の r:R を残し、w:<id> も有効", () => {
    const k = "/R/worktrees/x";
    const l = [ws("p", { git: git("R", true, k) }), ws("q", { git: git("R", true, k) })];
    const r = repairLayout({ top: ["u"], groups: {}, ungrouped: ["r:R", "w:q"] }, l, []);
    expect(r.layout.ungrouped).toEqual(["r:R", "w:q"]);
    expect(r.dropped).toEqual([]);
    // 代表が閉じて q が代表になったあとの復元では、w:q は捨てて r:R に統合する。
    const r2 = repairLayout({ top: ["u"], groups: {}, ungrouped: ["r:R", "w:q"] }, [l[1]!], []);
    expect(r2.layout.ungrouped).toEqual(["r:R"]);
    expect(r2.dropped).toEqual(["w:q"]);
  });
});
