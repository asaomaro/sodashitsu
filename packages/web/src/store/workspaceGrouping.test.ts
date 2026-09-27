import type { GitInfo, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { autoGroupsOf, groupedWorkspaceRows, linkedWorktreeChildrenOf, manualGroupsOf, visibleGroupMembers, visibleWorkspaceIdsInOrder } from "./workspaceGrouping.js";

const NO_GIT: GitInfo | null = null;

function git(repoKey: string | null, isLinkedWorktree = false): GitInfo {
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
    git: NO_GIT,
    autoLabel: false,
    ...overrides,
  };
}

function group(id: string, label: string, collapsed = false): WorkspaceGroup {
  return { id, label, collapsed };
}

describe("autoGroupsOf", () => {
  it("同じ repoKey の workspace が2件以上あるときだけ束ねる（AC2：1件なら束ねない）", () => {
    const lone = ws("w1", { git: git("/r1/.git") });
    expect(autoGroupsOf([lone])).toEqual([]);
  });

  it("isLinkedWorktree===false を本体（親）にし、他を子にする", () => {
    const main = ws("w1", { git: git("/r/.git", false) });
    const wt = ws("w2", { git: git("/r/.git", true) });
    const groups = autoGroupsOf([wt, main]); // 順序を入れ替えても親判定に影響しないことも確かめる
    expect(groups).toHaveLength(1);
    expect(groups[0]!.parent.id).toBe("w1");
    expect(groups[0]!.children.map((w) => w.id)).toEqual(["w2"]);
  });

  it("本体が見つからない（全員 isLinkedWorktree===true）ときは先頭を暫定的に親にする（GitInfoPoller の周期の谷間）", () => {
    const a = ws("w1", { git: git("/r/.git", true) });
    const b = ws("w2", { git: git("/r/.git", true) });
    const groups = autoGroupsOf([a, b]);
    expect(groups[0]!.parent.id).toBe("w1");
    expect(groups[0]!.children.map((w) => w.id)).toEqual(["w2"]);
  });

  it("git が無い・repoKey が無い workspace は候補から外す", () => {
    const noGit = ws("w1");
    const noRepoKey = ws("w2", { git: git(null) });
    expect(autoGroupsOf([noGit, noRepoKey])).toEqual([]);
  });

  it("groupId が付いている（手動グループ優先。decisions D2）workspace は自動グループの候補から外す", () => {
    const inManualGroup = ws("w1", { git: git("/r/.git"), groupId: "g1" });
    const other = ws("w2", { git: git("/r/.git") });
    // w1 が手動グループに入っているため、repoKey が同じでも w2 は1件だけの候補となり束ねられない。
    expect(autoGroupsOf([inManualGroup, other])).toEqual([]);
  });

  // タスク点検の指摘：本体が手動グループに入って候補から外れているだけなのに、残った linked worktree
  // の1つを「親」と誤表示してはいけない（GitInfoPoller の周期の谷間と区別する）。
  it("本体が手動グループに入っていて候補から外れているだけなら、残りの linked worktree だけでは束ねない", () => {
    const mainInManualGroup = ws("w1", { git: git("/r/.git", false), groupId: "g1" });
    const wt1 = ws("w2", { git: git("/r/.git", true) });
    const wt2 = ws("w3", { git: git("/r/.git", true) });
    expect(autoGroupsOf([mainInManualGroup, wt1, wt2])).toEqual([]);
  });

  it("本体がどこにも実在しない（GitInfoPoller の周期の谷間）なら、従来どおり先頭を暫定的に親にする", () => {
    const wt1 = ws("w1", { git: git("/r/.git", true) });
    const wt2 = ws("w2", { git: git("/r/.git", true) });
    const groups = autoGroupsOf([wt1, wt2]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.parent.id).toBe("w1");
  });

  it("異なる repoKey は別々のグループになる", () => {
    const a1 = ws("a1", { git: git("/a/.git") });
    const a2 = ws("a2", { git: git("/a/.git", true) });
    const b1 = ws("b1", { git: git("/b/.git") });
    const b2 = ws("b2", { git: git("/b/.git", true) });
    const groups = autoGroupsOf([a1, a2, b1, b2]);
    expect(groups.map((g) => g.repoKey).sort()).toEqual(["/a/.git", "/b/.git"]);
  });
});

describe("manualGroupsOf", () => {
  it("groupId が一致する workspace をメンバーとして集める（渡された順を保つ）", () => {
    const g1 = group("g1", "backend");
    const w1 = ws("w1", { groupId: "g1" });
    const w2 = ws("w2", { groupId: "g1" });
    const other = ws("w3", { groupId: null });
    expect(manualGroupsOf([w1, other, w2], [g1])).toEqual([{ group: g1, members: [w1, w2] }]);
  });

  it("空のグループも含む（design「エラー処理」：メンバー0でも自動削除しない）", () => {
    const g1 = group("g1", "empty");
    expect(manualGroupsOf([], [g1])).toEqual([{ group: g1, members: [] }]);
  });

  it("groupId がどのグループにも一致しない workspace は含まれない（防御的）", () => {
    const orphan = ws("w1", { groupId: "g-unknown" });
    expect(manualGroupsOf([orphan], [])).toEqual([]);
  });
});

describe("linkedWorktreeChildrenOf", () => {
  it("本体の id を渡すと束ねられた linked worktree を返す", () => {
    const main = ws("w1", { git: git("/r/.git", false) });
    const wt1 = ws("w2", { git: git("/r/.git", true) });
    const wt2 = ws("w3", { git: git("/r/.git", true) });
    expect(new Set(linkedWorktreeChildrenOf("w1", [main, wt1, wt2]).map((w) => w.id))).toEqual(new Set(["w2", "w3"]));
  });

  it("子の id を渡すと [] を返す（本体でなければ対象外）", () => {
    const main = ws("w1", { git: git("/r/.git", false) });
    const wt = ws("w2", { git: git("/r/.git", true) });
    expect(linkedWorktreeChildrenOf("w2", [main, wt])).toEqual([]);
  });

  it("関係の無い id・存在しない id は [] を返す", () => {
    const main = ws("w1", { git: git("/r/.git", false) });
    expect(linkedWorktreeChildrenOf("w99", [main])).toEqual([]);
  });
});

describe("groupedWorkspaceRows", () => {
  it("opened: 手動グループ・自動グループ・単独行が、それぞれの先頭メンバーの位置で並ぶ", () => {
    const standalone1 = ws("s1");
    const manualA = ws("m1", { groupId: "g1" });
    const manualB = ws("m2", { groupId: "g1" });
    const autoMain = ws("a1", { git: git("/r/.git", false) });
    const autoWt = ws("a2", { git: git("/r/.git", true) });
    const standalone2 = ws("s2");
    const workspaces = [standalone1, manualA, manualB, autoMain, autoWt, standalone2];
    const rows = groupedWorkspaceRows(workspaces, [group("g1", "backend")], "opened", new Set());
    expect(rows.map((r) => (r.kind === "standalone" ? r.workspace.id : r.kind === "manualGroup" ? `group:${r.group.id}` : `auto:${r.repoKey}`))).toEqual(["s1", "group:g1", "auto:/r/.git", "s2"]);
  });

  it("name: トップレベル行だけをラベル順に並べ替え、グループ内の並びは opened のまま", () => {
    const zManual = ws("z-member2", { groupId: "g1", label: "z-member2" });
    const aManual = ws("a-member1", { groupId: "g1", label: "a-member1" });
    const standaloneB = ws("s-b", { label: "b-standalone" });
    const standaloneA = ws("s-a", { label: "a-standalone" });
    // グループのラベル自体は "m-group"（アルファベット順で b/a-standalone の間に来る）。
    const workspaces = [zManual, aManual, standaloneB, standaloneA];
    const rows = groupedWorkspaceRows(workspaces, [group("g1", "m-group")], "name", new Set());
    expect(rows.map((r) => (r.kind === "standalone" ? r.workspace.label : r.kind === "manualGroup" ? r.group.label : "auto"))).toEqual(["a-standalone", "b-standalone", "m-group"]);
    // グループ内は「開いた順」のまま（z が a より先——ラベル順ではない）。
    const manualRow = rows.find((r) => r.kind === "manualGroup");
    expect(manualRow?.kind === "manualGroup" && manualRow.members.map((w) => w.id)).toEqual(["z-member2", "a-member1"]);
  });

  it("autoGroup 行の collapsed は collapsedAutoGroups（repoKey の集合）から決まる", () => {
    const main = ws("w1", { git: git("/r/.git", false) });
    const wt = ws("w2", { git: git("/r/.git", true) });
    const collapsedRow = groupedWorkspaceRows([main, wt], [], "opened", new Set(["/r/.git"]))[0]!;
    expect(collapsedRow.kind === "autoGroup" && collapsedRow.collapsed).toBe(true);
    const expandedRow = groupedWorkspaceRows([main, wt], [], "opened", new Set())[0]!;
    expect(expandedRow.kind === "autoGroup" && expandedRow.collapsed).toBe(false);
  });

  it("空のグループは opened 順で末尾寄りに置かれる（基準にできるメンバーが無いため）", () => {
    const s1 = ws("s1");
    const rows = groupedWorkspaceRows([s1], [group("g1", "empty")], "opened", new Set());
    expect(rows.map((r) => r.kind)).toEqual(["standalone", "manualGroup"]);
  });

  it("空配列でも例外にならない", () => {
    expect(groupedWorkspaceRows([], [], "opened", new Set())).toEqual([]);
    expect(groupedWorkspaceRows([], [], "name", new Set())).toEqual([]);
  });
});

// レビューの指摘（should）：`Sidebar.vue` の折りたたみ＋focus 例外の判定（手動グループ・自動グループの
// 2箇所）を1つの純関数に統一する。
describe("visibleGroupMembers", () => {
  it("折りたたみ中でなければ全員そのまま返す", () => {
    const a = ws("a");
    const b = ws("b");
    expect(visibleGroupMembers([a, b], false, null)).toEqual([a, b]);
  });

  it("折りたたみ中は focus 中の workspace だけ返す", () => {
    const a = ws("a");
    const b = ws("b");
    expect(visibleGroupMembers([a, b], true, "b")).toEqual([b]);
  });

  it("折りたたみ中で focus 中の workspace がメンバーに無ければ空", () => {
    const a = ws("a");
    expect(visibleGroupMembers([a], true, "other")).toEqual([]);
  });
});

// レビューの指摘（must）：`ActionDispatcher` の `previous_workspace`/`next_workspace`・`navigate`
// （サイドバー内の選択ジャンプ）が、`Sidebar.vue` の描画（`groupedWorkspaceRows`）と同じ並び・同じ
// 可視範囲を辿れるようにするための共有関数。
describe("visibleWorkspaceIdsInOrder", () => {
  it("グループが無ければ単純に開いた順（グループのヘッダーは存在しないので含めようがない）", () => {
    const a = ws("a");
    const b = ws("b");
    expect(visibleWorkspaceIdsInOrder([a, b], [], "opened", new Set(), null)).toEqual(["a", "b"]);
  });

  it("手動グループはまとめて1ブロック——ヘッダー行は含めず、メンバーの id だけを開いた順のまま挟む", () => {
    // 開いた順は A, C, B。A・B は同じ手動グループ。画面上は A→B→C の1ブロックになる。
    const a = ws("A", { groupId: "g1" });
    const c = ws("C");
    const b = ws("B", { groupId: "g1" });
    const ids = visibleWorkspaceIdsInOrder([a, c, b], [group("g1", "grp")], "opened", new Set(), null);
    expect(ids).toEqual(["A", "B", "C"]);
  });

  it("worktree 自動グループも同様にまとめて1ブロック（本体→子の順）", () => {
    const main = ws("main", { git: git("/r/.git", false) });
    const other = ws("other");
    const wt = ws("wt", { git: git("/r/.git", true) });
    const ids = visibleWorkspaceIdsInOrder([main, other, wt], [], "opened", new Set(), null);
    expect(ids).toEqual(["main", "wt", "other"]);
  });

  it("折りたたみ中のグループは、focus 中の workspace が無ければ本体（頭）だけになる", () => {
    const main = ws("main", { git: git("/r/.git", false) });
    const wt = ws("wt", { git: git("/r/.git", true) });
    const ids = visibleWorkspaceIdsInOrder([main, wt], [], "opened", new Set(["/r/.git"]), null);
    expect(ids).toEqual(["main"]);
  });

  it("折りたたみ中でも focus 中の子は残る（AC3 と同じ判定）", () => {
    const main = ws("main", { git: git("/r/.git", false) });
    const wt = ws("wt", { git: git("/r/.git", true) });
    const ids = visibleWorkspaceIdsInOrder([main, wt], [], "opened", new Set(["/r/.git"]), "wt");
    expect(ids).toEqual(["main", "wt"]);
  });

  it("name ソートはトップレベル（グループ自体・単独行）だけを並べ替え、グループ内は開いた順のまま", () => {
    const zManual = ws("z-member", { groupId: "g1", label: "z-member" });
    const aManual = ws("a-member", { groupId: "g1", label: "a-member" });
    const standalone = ws("s", { label: "b-standalone" });
    // グループのラベルは "a-group"（アルファベット順で先頭に来る）。
    const ids = visibleWorkspaceIdsInOrder([zManual, aManual, standalone], [group("g1", "a-group")], "name", new Set(), null);
    expect(ids).toEqual(["z-member", "a-member", "s"]); // グループが先（ラベル順）、中は開いた順のまま
  });
});
