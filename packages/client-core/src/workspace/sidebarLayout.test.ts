import type { GitInfo, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  addItemToGroup,
  deleteGroupFromLayout,
  flattenWorkspaceIds,
  insertItem,
  moveItem,
  moveItemBy,
  removeItem,
  removeItemFromGroup,
  repairLayout,
} from "./sidebarLayout.js";

function git(repoKey: string, isLinkedWorktree = false): GitInfo {
  return { branch: "main", ahead: 0, behind: 0, repoKey, isLinkedWorktree };
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
  top: ["w:a", "g:g1", "w:b", "g:g2"],
  groups: { g1: ["r:R", "w:c"], g2: [] },
});

describe("insertItem / removeItem", () => {
  it("before の前へ入れる。before が無ければ末尾。同じ入れ物に既にあれば同じ参照を返す", () => {
    expect(insertItem(base(), "w:x", null, "w:b").top).toEqual([
      "w:a",
      "g:g1",
      "w:x",
      "w:b",
      "g:g2",
    ]);
    expect(insertItem(base(), "w:x", "g1").groups.g1).toEqual(["r:R", "w:c", "w:x"]);
    const l = base();
    expect(insertItem(l, "w:a", null)).toBe(l);
  });
  it("グループの中へ g: は入れない。存在しないグループへも入れない", () => {
    const l = base();
    expect(insertItem(l, "g:g2", "g1")).toBe(l);
    expect(insertItem(l, "w:x", "nope")).toBe(l);
  });
  it("removeItem はどの入れ物からでも外す。空になってもキーは残す。元は書き換えない", () => {
    const l = base();
    expect(removeItem(l, "w:c").groups.g1).toEqual(["r:R"]);
    expect(removeItem(removeItem(l, "r:R"), "w:c").groups.g1).toEqual([]);
    expect(removeItem(l, "w:a").top).toEqual(["g:g1", "w:b", "g:g2"]);
    expect(l).toEqual(base());
    expect(removeItem(l, "w:none")).toBe(l);
  });
});

describe("moveItem（AC5）", () => {
  it("一番上の中で before の前へ。グループも動く", () => {
    expect(moveItem(base(), "g:g2", "g:g1")).toEqual({
      layout: { ...base(), top: ["w:a", "g:g2", "g:g1", "w:b"] },
      moved: true,
    });
    expect(moveItem(base(), "w:a", null).layout.top).toEqual(["g:g1", "w:b", "g:g2", "w:a"]);
  });
  it("グループの中の項目は中で動く", () => {
    expect(moveItem(base(), "w:c", "r:R").layout.groups.g1).toEqual(["w:c", "r:R"]);
  });
  it("入れ物をまたぐ・自分自身の前・グループをグループの中へ・無い項目は moved: false で何も変えない", () => {
    const l = base();
    for (const [item, before] of [
      ["w:a", "w:c"], // 上 → 中
      ["w:c", "w:b"], // 中 → 上
      ["r:R", "r:R"],
      ["g:g2", "r:R"], // グループをグループの中へ
      ["w:none", null],
      ["w:a", "w:none"],
    ] as const) {
      const r = moveItem(l, item, before);
      expect(r.moved, `${item} -> ${before}`).toBe(false);
      expect(r.layout).toBe(l);
    }
  });
  it("位置が変わらない移動は受け付ける（moved: true・同じ参照）", () => {
    const l = base();
    const r = moveItem(l, "w:a", "g:g1");
    expect(r).toEqual({ layout: l, moved: true });
  });
});

describe("moveItemBy", () => {
  it("1 つ動かす。端では巡回せず止まる", () => {
    expect(moveItemBy(base(), "w:a", "next").layout.top).toEqual(["g:g1", "w:a", "w:b", "g:g2"]);
    expect(moveItemBy(base(), "g:g2", "previous").layout.top).toEqual([
      "w:a",
      "g:g1",
      "g:g2",
      "w:b",
    ]);
    expect(moveItemBy(base(), "w:c", "previous").layout.groups.g1).toEqual(["w:c", "r:R"]);
    const l = base();
    for (const [ref, dir] of [
      ["w:a", "previous"],
      ["g:g2", "next"],
      ["w:c", "next"],
      ["r:R", "previous"],
      ["w:none", "next"],
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
    expect(a.top).toEqual(["g:g1", "w:b", "g:g2"]);
    expect(a.groups.g1).toEqual(["r:R", "w:c", "w:a"]);
    const b = addItemToGroup(base(), "r:R", "g2");
    expect(b.groups).toEqual({ g1: ["w:c"], g2: ["r:R"] });
  });
  it("g:・存在しないグループは何もしない", () => {
    const l = base();
    expect(addItemToGroup(l, "g:g2", "g1")).toBe(l);
    expect(addItemToGroup(l, "w:a", "nope")).toBe(l);
  });
  it("外すと一番上の、そのグループの直後へ置く。グループに居なければ何もしない", () => {
    const r = removeItemFromGroup(base(), "w:c");
    expect(r.top).toEqual(["w:a", "g:g1", "w:c", "w:b", "g:g2"]);
    expect(r.groups.g1).toEqual(["r:R"]);
    const l = base();
    expect(removeItemFromGroup(l, "w:a")).toBe(l);
    expect(removeItemFromGroup(l, "w:none")).toBe(l);
  });
});

describe("deleteGroupFromLayout（AC10）", () => {
  it("中身をグループのあった位置へ順に出し、グループのキーを消す", () => {
    const r = deleteGroupFromLayout(base(), "g1");
    expect(r.top).toEqual(["w:a", "r:R", "w:c", "w:b", "g:g2"]);
    expect(r.groups).toEqual({ g2: [] });
  });
  it("空のグループは位置から消えるだけ。無いグループは何もしない", () => {
    expect(deleteGroupFromLayout(base(), "g2").top).toEqual(["w:a", "g:g1", "w:b"]);
    const l = base();
    expect(deleteGroupFromLayout(l, "nope")).toBe(l);
  });
});

describe("flattenWorkspaceIds", () => {
  it("レイアウトの順。r: は本体が先頭で展開、g: は中身を展開", () => {
    const list = [
      ws("a"),
      ws("c"),
      ws("w1", { git: git("R", true) }),
      ws("w2", { git: git("R", false) }),
      ws("b"),
    ];
    expect(flattenWorkspaceIds(base(), list)).toEqual(["a", "w2", "w1", "c", "b"]);
  });
  it("レイアウトに無い workspace は末尾へ、実在しない参照は飛ばす、重複は先のものだけ", () => {
    const list = [ws("a"), ws("z")];
    const layout: SidebarLayout = { top: ["w:ghost", "w:a", "w:a", "g:nope"], groups: {} };
    expect(flattenWorkspaceIds(layout, list)).toEqual(["a", "z"]);
  });
});

describe("repairLayout（AC13）", () => {
  const list = [ws("a"), ws("b"), ws("c"), ws("w1", { git: git("R") })];

  it("壊れていなければ同じ内容で、捨てたものは無い", () => {
    const r = repairLayout(base(), list, groups);
    expect(r.layout).toEqual(base());
    expect(r.dropped).toEqual([]);
  });
  it("実在しない参照・重複・グループの中の g:・実在しないグループのキーを捨てて、捨てた参照を返す", () => {
    const broken: SidebarLayout = {
      top: ["w:a", "w:ghost", "g:g1", "g:gone", "w:a", "r:Gone", "w:b", "g:g2"],
      groups: { g1: ["r:R", "g:g2", "w:c", "w:b"], gone: ["w:z"] },
    };
    const r = repairLayout(broken, list, groups);
    expect(r.layout).toEqual({
      top: ["w:a", "g:g1", "w:b", "g:g2"],
      groups: { g1: ["r:R", "w:c"], g2: [] },
    });
    expect([...r.dropped].sort()).toEqual(
      ["g:g2", "g:gone", "r:Gone", "w:a", "w:b", "w:ghost", "w:z"].sort(),
    );
  });
  it("無い workspace・無いグループは一番上の末尾へ足す", () => {
    const r = repairLayout({ top: ["w:a"], groups: {} }, list, groups);
    expect(r.layout.top).toEqual(["w:a", "g:g1", "g:g2", "w:b", "w:c", "r:R"]);
    expect(r.layout.groups).toEqual({ g1: [], g2: [] });
    expect(r.dropped).toEqual([]);
  });
  it("workspace の今の判定と合わない参照（w: なのに repoKey を持つ）は捨て、判定どおりの項目を足す", () => {
    const r = repairLayout({ top: ["w:w1"], groups: {} }, [ws("w1", { git: git("R") })], []);
    expect(r.layout.top).toEqual(["r:R"]);
    expect(r.dropped).toEqual(["w:w1"]);
  });
});
