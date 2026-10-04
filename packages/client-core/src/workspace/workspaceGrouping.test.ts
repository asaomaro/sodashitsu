import type { GitInfo, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  UNGROUPED_REF,
  autoGroupsOf,
  hiddenWorktreeCount,
  type ItemRow,
  isRepresentative,
  isUngroupedNavigateKey,
  navigateKeyOfUngrouped,
  groupedWorkspaceRows,
  itemRefOf,
  layoutFromLegacy,
  linkedWorktreeChildrenOf,
  manualGroupsOf,
  repoMembers,
  sidebarTree,
  topUnitOf,
  visibleGroupMembers,
  visibleWorkspaceIdsInOrder,
  visibleWorkspaceIdsOfTree,
  navigableRowsOfTree,
  navigateKeyOfGroup,
  groupIdOfNavigateKey,
  navigateKeyOfRow,
} from "./workspaceGrouping.js";

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

// ---- 項目の木（20261004-group-worktree-items。追補 01 の構造） ----

const R = "/r/.git";
const R2 = "/r2/.git";
const body = (id: string, repoKey = R, extra: Partial<Workspace> = {}) =>
  ws(id, { git: git(repoKey, false), ...extra });
const linked = (id: string, repoKey = R, extra: Partial<Workspace> = {}) =>
  ws(id, { git: git(repoKey, true), ...extra });
/** `worktreeKey` を持つ（新しいサーバの）workspace。同じ `worktreeKey` は同じフォルダ。 */
const wt = (id: string, worktreeKey: string | null, isLinked = true, repoKey = R, extra: Partial<Workspace> = {}) =>
  ws(id, { git: { ...git(repoKey, isLinked), worktreeKey }, ...extra });
const lay = (top: string[], groups: Record<string, string[]> = {}, ungrouped: string[] = []): SidebarLayout => ({
  top,
  groups,
  ungrouped,
});

/** 項目の行を文字列・{r, children} にする。 */
function itemShape(item: ItemRow): unknown {
  return item.kind === "workspace" ? item.workspace.id : { r: item.head.id, children: item.children.map((c) => c.id) };
}

/** 木を比べやすくする（グループは `{g, items}`、「グループなし」は `{u: 項目…}`）。 */
function shape(rows: ReturnType<typeof sidebarTree>): unknown[] {
  return rows.map((r) => (r.kind === "group" ? { g: r.group.id, items: r.items.map(itemShape) } : { u: r.items.map(itemShape) }));
}

describe("itemRefOf / repoMembers / isRepresentative（追補 01 A）", () => {
  it("repoKey を持つ代表なら r:、無ければ（git 無し・repoKey が null でも）w:", () => {
    const a = body("a");
    expect(itemRefOf(a, [a])).toBe(`r:${R}`);
    const b = ws("b");
    expect(itemRefOf(b, [b])).toBe("w:b");
    const c = ws("c", { git: git(null) });
    expect(itemRefOf(c, [c])).toBe("w:c");
  });

  it("worktreeKey が無い（古いサーバ）なら、同じ repoKey の workspace は全部メンバー。本体が先頭、残りは開いた順。本体が無ければ開いた順のまま", () => {
    const list = [linked("w1"), linked("w2"), body("w3"), body("x", R2)];
    expect(repoMembers(list, R).map((w) => w.id)).toEqual(["w3", "w1", "w2"]);
    expect(list.map((w) => itemRefOf(w, list))).toEqual([`r:${R}`, `r:${R}`, `r:${R}`, `r:${R2}`]);
    expect(repoMembers([linked("w1"), linked("w2")], R).map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(repoMembers(list, "/none/.git")).toEqual([]);
  });

  it("AC19: 同じ worktreeKey は平らな順で最初の 1 つだけが代表（r:）。2 つ目以降は w: の通常の項目で、repoMembers に入らない", () => {
    const list = [wt("w1", "/r/.git", false), wt("w2", "/r/.git/worktrees/a"), wt("w3", "/r/.git/worktrees/a"), wt("w4", "/r/.git/worktrees/a")];
    expect(list.map((w) => isRepresentative(w, list))).toEqual([true, true, false, false]);
    expect(list.map((w) => itemRefOf(w, list))).toEqual([`r:${R}`, `r:${R}`, "w:w3", "w:w4"]);
    expect(repoMembers(list, R).map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("AC19: 代表が閉じる（一覧から消える）と、同じ worktreeKey の次の workspace が代表になる", () => {
    const w2 = wt("w2", "/r/.git/worktrees/a");
    const w3 = wt("w3", "/r/.git/worktrees/a");
    const w1 = wt("w1", "/r/.git", false);
    expect(repoMembers([w1, w2, w3], R).map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(repoMembers([w1, w3], R).map((w) => w.id)).toEqual(["w1", "w3"]);
    expect(itemRefOf(w3, [w1, w3])).toBe(`r:${R}`);
  });

  it("AC19: worktreeKey が別の場所へ変わった workspace は、新しい worktreeKey の側で代表かどうかを決める", () => {
    const w1 = wt("w1", "/r/.git/worktrees/a");
    const w2 = wt("w2", "/r/.git/worktrees/a");
    expect(isRepresentative(w2, [w1, w2])).toBe(false);
    const moved = wt("w2", "/r/.git/worktrees/b");
    expect(isRepresentative(moved, [w1, moved])).toBe(true);
  });

  it("worktreeKey が null（取れていない）の workspace は代表として扱う", () => {
    const a = wt("a", null);
    const b = wt("b", null);
    expect([a, b].map((w) => isRepresentative(w, [a, b]))).toEqual([true, true]);
  });
});

describe("sidebarTree", () => {
  it("AC1: 同じリポジトリの代表が 2 つ以上なら worktree グループ（本体が先頭）、1 つなら通常の行。グループに入っていても同じ。グループが無ければ「グループなし」だけ（見出しなし）", () => {
    const list = [linked("w1"), body("w2"), body("w3", R2), ws("w4")];
    const tree = sidebarTree(list, [], lay([UNGROUPED_REF], {}, [`r:${R}`, `r:${R2}`, "w:w4"]), "opened");
    expect(shape(tree)).toEqual([{ u: [{ r: "w2", children: ["w1"] }, "w3", "w4"] }]);
    expect(tree[0]).toMatchObject({ kind: "ungrouped", heading: false, collapsed: false });
    const g = [group("g1", "G")];
    const inGroup = sidebarTree(list, g, lay(["g:g1", "u"], { g1: [`r:${R}`, `r:${R2}`] }, ["w:w4"]), "opened");
    expect(shape(inGroup)).toEqual([
      { g: "g1", items: [{ r: "w2", children: ["w1"] }, "w3"] },
      { u: ["w4"] },
    ]);
    expect(inGroup[1]).toMatchObject({ kind: "ungrouped", heading: true });
  });

  it("AC1: worktree が 1 つに減っても同じ位置の通常の行として残る", () => {
    const tree = sidebarTree([body("w1")], [group("g1", "G")], lay(["g:g1", "u"], { g1: [`r:${R}`] }), "opened");
    expect(shape(tree)).toEqual([{ g: "g1", items: ["w1"] }, { u: [] }]);
  });

  it("AC4: グループの中に通常の workspace と worktree グループが項目として並ぶ。空のグループも出る", () => {
    const list = [body("w1"), linked("w2"), ws("w3")];
    const groups = [group("g1", "G"), group("g2", "E")];
    const tree = sidebarTree(list, groups, lay(["g:g1", "g:g2", "u"], { g1: ["w:w3", `r:${R}`], g2: [] }), "opened");
    expect(shape(tree)).toEqual([
      { g: "g1", items: ["w3", { r: "w1", children: ["w2"] }] },
      { g: "g2", items: [] },
      { u: [] },
    ]);
  });

  it("AC19: 同じフォルダ（worktreeKey）の 2 つ目は worktree グループに入らず、通常の行として「グループなし」の末尾に出る", () => {
    const list = [wt("w1", "/r/.git", false), wt("w2", "/r/.git/worktrees/a"), wt("w3", "/r/.git/worktrees/a")];
    const tree = sidebarTree(list, [], lay(["u"], {}, [`r:${R}`]), "opened");
    expect(shape(tree)).toEqual([{ u: [{ r: "w1", children: ["w2"] }, "w3"] }]);
    // w3 の行はレイアウトの w:w3 の位置に従う（グループの中へ入れても所属は workspace 単位）。
    const inGroup = sidebarTree(list, [group("g1", "G")], lay(["g:g1", "u"], { g1: ["w:w3"] }, [`r:${R}`]), "opened");
    expect(shape(inGroup)).toEqual([{ g: "g1", items: ["w3"] }, { u: [{ r: "w1", children: ["w2"] }] }]);
  });

  it("AC19: 代表が閉じると次の workspace が代表になり、worktree グループに加わる（レイアウトの w:<id> は読み飛ばす）", () => {
    const list = [wt("w1", "/r/.git", false), wt("w3", "/r/.git/worktrees/a")];
    const tree = sidebarTree(list, [], lay(["u"], {}, [`r:${R}`, "w:w3"]), "opened");
    expect(shape(tree)).toEqual([{ u: [{ r: "w1", children: ["w3"] }] }]);
  });

  it("AC19: worktreeKey の無い古いサーバでは、同じ repoKey を全部メンバーにする", () => {
    const list = [body("w1"), linked("w2"), linked("w3")];
    expect(shape(sidebarTree(list, [], lay(["u"], {}, [`r:${R}`]), "opened"))).toEqual([
      { u: [{ r: "w1", children: ["w2", "w3"] }] },
    ]);
  });

  it("AC20: 「グループなし」の見出しは、本物のグループが 1 つ以上あるときだけ。畳めるのも見出しがあるときだけ", () => {
    const l = lay(["g:g1", "u"], { g1: [] }, ["w:w1"]);
    const withGroup = sidebarTree([ws("w1")], [group("g1", "G")], l, "opened", true);
    expect(withGroup[1]).toMatchObject({ kind: "ungrouped", heading: true, collapsed: true });
    expect(sidebarTree([ws("w1")], [group("g1", "G")], l, "opened", false)[1]).toMatchObject({ heading: true, collapsed: false });
    const noGroup = sidebarTree([ws("w1")], [], lay(["u"], {}, ["w:w1"]), "opened", true);
    expect(noGroup[0]).toMatchObject({ kind: "ungrouped", heading: false, collapsed: false });
  });

  it("AC20: まとまりの並びは top の順。グループなしをグループの前に置ける", () => {
    const tree = sidebarTree([ws("w1"), ws("w2")], [group("g1", "G")], lay(["u", "g:g1"], { g1: ["w:w2"] }, ["w:w1"]), "opened");
    expect(shape(tree)).toEqual([{ u: ["w1"] }, { g: "g1", items: ["w2"] }]);
  });

  it("配信の途中: レイアウトに無い workspace は「グループなし」の末尾（同じリポジトリは 1 項目）", () => {
    const list = [ws("w1"), body("w2"), linked("w3"), ws("w4")];
    const tree = sidebarTree(list, [], lay(["u"], {}, ["w:w1"]), "opened");
    expect(shape(tree)).toEqual([{ u: ["w1", { r: "w2", children: ["w3"] }, "w4"] }]);
  });

  it("配信の途中: 実在しない参照・実在しないグループ・重複・top の中の項目・2 つ目の u は読み飛ばす", () => {
    const list = [ws("w1"), ws("w2")];
    const tree = sidebarTree(
      list,
      [group("g1", "G")],
      lay(["w:w2", "g:nope", "g:g1", "u", "u", "g:g1"], { g1: ["w:ghost", "g:g1", "w:w2"], nope: ["w:w1"] }, ["w:gone", "r:/gone/.git", "w:w2", "w:w2", "w:w1"]),
      "opened",
    );
    expect(shape(tree)).toEqual([{ g: "g1", items: ["w2"] }, { u: ["w1"] }]);
  });

  it("配信の途中: top に無いグループは「グループなし」の直前、「グループなし」が top に無ければ末尾に出る（中身は layout.groups の順）", () => {
    const g = [group("g1", "G"), group("g2", "H")];
    const noGroupsInTop = sidebarTree([ws("w1"), ws("w2")], g, lay(["u"], { g1: ["w:w2"], g2: [] }, ["w:w1"]), "opened");
    expect(shape(noGroupsInTop)).toEqual([{ g: "g1", items: ["w2"] }, { g: "g2", items: [] }, { u: ["w1"] }]);
    const noU = sidebarTree([ws("w1")], [group("g1", "G")], lay(["g:g1"], { g1: [] }, ["w:w1"]), "opened");
    expect(shape(noU)).toEqual([{ g: "g1", items: [] }, { u: ["w1"] }]);
  });

  it("配信の途中: 判定とレイアウトが食い違うときは今の判定で項目を決め、置き場所は先に見つかった参照", () => {
    // w1・w2 は今は同じリポジトリだが、レイアウトはまだ w:w1・w:w2 の別々で持っている（間に w:w3）
    const list = [body("w1"), ws("w3"), linked("w2")];
    const tree = sidebarTree(list, [], lay(["u"], {}, ["w:w1", "w:w3", "w:w2"]), "opened");
    expect(shape(tree)).toEqual([{ u: [{ r: "w1", children: ["w2"] }, "w3"] }]);
    // 逆: レイアウトは r:R を持つが、その workspace は管理外になった（r:R に workspace が無い）→ w:id として末尾
    const tree2 = sidebarTree([ws("w1"), ws("w2")], [], lay(["u"], {}, [`r:${R}`, "w:w2"]), "opened");
    expect(shape(tree2)).toEqual([{ u: ["w2", "w1"] }]);
  });

  it("名前順: グループどうしはグループの名前、「グループなし」の中は項目の名前で並べる（「グループなし」はまとまりの中の位置のまま）。グループの中・worktree グループの中はレイアウトの順", () => {
    const list = [
      ws("b", { label: "b" }),
      ws("a", { label: "a" }),
      ws("z", { label: "z" }),
      ws("y", { label: "y" }),
      body("m", R, { label: "m" }),
      linked("c", R, { label: "c" }),
    ];
    const tree = sidebarTree(
      list,
      [group("g1", "Q"), group("g2", "A")],
      lay(["g:g1", "u", "g:g2"], { g1: ["w:z", "w:y"], g2: ["w:a"] }, [`r:${R}`, "w:b"]),
      "name",
    );
    expect(shape(tree)).toEqual([
      { g: "g2", items: ["a"] },
      { u: ["b", { r: "m", children: ["c"] }] },
      { g: "g1", items: ["z", "y"] },
    ]);
  });
});

describe("visibleWorkspaceIdsOfTree", () => {
  const list = [body("w1"), linked("w2"), linked("w3"), ws("w4"), ws("w5")];
  const layout = (collapsed = false): [SidebarLayout, WorkspaceGroup[]] => [
    lay(["g:g1", "u"], { g1: [`r:${R}`, "w:w4"] }, ["w:w5"]),
    [group("g1", "G", collapsed)],
  ];

  it("何も畳んでいなければ上から下へ全部（見出しは含めない）", () => {
    const [l, g] = layout();
    expect(visibleWorkspaceIdsOfTree(sidebarTree(list, g, l, "opened"), new Set(), null)).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
      "w5",
    ]);
  });

  it("AC6: worktree グループだけ畳むと、先頭と今いる子だけ", () => {
    const [l, g] = layout();
    const tree = sidebarTree(list, g, l, "opened");
    expect(visibleWorkspaceIdsOfTree(tree, new Set([R]), null)).toEqual(["w1", "w4", "w5"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set([R]), "w3")).toEqual(["w1", "w3", "w4", "w5"]);
  });

  it("AC6: グループを畳むと中の worktree グループも隠れ、今いる workspace の行だけ残る（子でもその子だけ）", () => {
    const [l, g] = layout(true);
    const tree = sidebarTree(list, g, l, "opened");
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), null)).toEqual(["w5"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), "w3")).toEqual(["w3", "w5"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), "w1")).toEqual(["w1", "w5"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), "w4")).toEqual(["w4", "w5"]);
  });

  it("AC20: 「グループなし」を畳むと、中は今いる workspace の行だけ（worktree グループの子でもその子だけ）", () => {
    const l = lay(["g:g1", "u"], { g1: ["w:w4"] }, [`r:${R}`, "w:w5"]);
    const tree = sidebarTree(list, [group("g1", "G")], l, "opened", true);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), null)).toEqual(["w4"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), "w5")).toEqual(["w4", "w5"]);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), "w3")).toEqual(["w4", "w3"]);
  });

  it("AC20: 見出しが無い（本物のグループが無い）ときは畳む設定が残っていても全部見える", () => {
    const tree = sidebarTree([ws("w1"), ws("w2")], [], lay(["u"], {}, ["w:w1", "w:w2"]), "opened", true);
    expect(visibleWorkspaceIdsOfTree(tree, new Set(), null)).toEqual(["w1", "w2"]);
  });

  it("AC21: 畳んだ worktree グループで隠れている子の数（今いる子は数えない）", () => {
    const item = { kind: "worktreeGroup" as const, repoKey: R, head: body("w1"), children: [linked("w2"), linked("w3")] };
    expect(hiddenWorktreeCount(item, null)).toBe(2);
    expect(hiddenWorktreeCount(item, "w3")).toBe(1);
    expect(hiddenWorktreeCount(item, "w1")).toBe(2);
  });
});

describe("navigableRowsOfTree（AC-I3）", () => {
  const list = [body("w1"), linked("w2"), ws("w4"), ws("w5")];
  const mk = (collapsed: boolean): [SidebarLayout, WorkspaceGroup[]] => [
    lay(["g:g1", "g:g2", "u"], { g1: [`r:${R}`, "w:w4"], g2: [] }, ["w:w5"]),
    [group("g1", "G", collapsed), group("g2", "空", false)],
  ];
  const keys = (rows: ReturnType<typeof navigableRowsOfTree>): string[] => rows.map(navigateKeyOfRow);

  it("見出しを中の行の前に差し込む（空のグループにも届く。「グループなし」の見出しも）", () => {
    const [l, g] = mk(false);
    expect(keys(navigableRowsOfTree(sidebarTree(list, g, l, "opened"), new Set(), null))).toEqual([
      "group:g1", "w1", "w2", "w4", "group:g2", "ungrouped:", "w5",
    ]);
  });

  it("畳んだグループも見出しは残り、中は今いる workspace だけ", () => {
    const [l, g] = mk(true);
    const tree = sidebarTree(list, g, l, "opened");
    expect(keys(navigableRowsOfTree(tree, new Set(), null))).toEqual(["group:g1", "group:g2", "ungrouped:", "w5"]);
    expect(keys(navigableRowsOfTree(tree, new Set(), "w2"))).toEqual(["group:g1", "w2", "group:g2", "ungrouped:", "w5"]);
  });

  it("AC20: 畳んだ「グループなし」は見出しだけ（今いる workspace は残る）。本物のグループが無ければ見出しの行は無い", () => {
    const tree = sidebarTree(list, [group("g1", "G")], lay(["g:g1", "u"], { g1: [] }, [`r:${R}`, "w:w4"]), "opened", true);
    expect(keys(navigableRowsOfTree(tree, new Set(), null))).toEqual(["group:g1", "ungrouped:"]);
    expect(keys(navigableRowsOfTree(tree, new Set(), "w4"))).toEqual(["group:g1", "ungrouped:", "w4"]);
    const flat = sidebarTree([ws("w1")], [], lay(["u"], {}, ["w:w1"]), "opened");
    expect(keys(navigableRowsOfTree(flat, new Set(), null))).toEqual(["w1"]);
  });

  it("選択のキーの読み替え（workspace の id とは混ざらない）", () => {
    expect(groupIdOfNavigateKey("group:g1")).toBe("g1");
    expect(groupIdOfNavigateKey("w1")).toBeNull();
    expect(groupIdOfNavigateKey(null)).toBeNull();
    // 先頭が `group:` でない id は見出しとして読まない・中ほどの `group:` も読まない。
    expect(groupIdOfNavigateKey("xgroup:g1")).toBeNull();
    expect(groupIdOfNavigateKey("group:")).toBe("");
    // 「グループなし」の見出しのキーはグループの id としては読まない。
    expect(groupIdOfNavigateKey(navigateKeyOfUngrouped())).toBeNull();
    expect(isUngroupedNavigateKey(navigateKeyOfUngrouped())).toBe(true);
    expect(isUngroupedNavigateKey("w1")).toBe(false);
    expect(isUngroupedNavigateKey(null)).toBe(false);
  });

  it("navigateKeyOfGroup は group:<id>、navigateKeyOfRow は見出しなら group:<id>・ungrouped:、workspace なら id そのもの", () => {
    expect(navigateKeyOfGroup("g1")).toBe("group:g1");
    expect(navigateKeyOfRow({ kind: "group", groupId: "g1" })).toBe("group:g1");
    expect(navigateKeyOfRow({ kind: "ungrouped" })).toBe("ungrouped:");
    expect(navigateKeyOfRow({ kind: "workspace", workspaceId: "w1" })).toBe("w1");
    expect(groupIdOfNavigateKey(navigateKeyOfGroup("g9"))).toBe("g9");
  });
});

describe("topUnitOf（AC17）", () => {
  const list = [body("w1"), linked("w2"), ws("w3"), body("w4", R2), ws("w5")];
  const layout = lay(["g:g1", "u"], { g1: [`r:${R}`] }, ["w:w3", `r:${R2}`, "w:w5"]);

  it("グループの中ならグループ、「グループなし」の中の 1 つの repo・管理外は workspace 単体（「グループなし」はグループ扱いしない）", () => {
    expect(topUnitOf("w1", list, layout)).toEqual({ kind: "group", groupId: "g1" });
    expect(topUnitOf("w2", list, layout)).toEqual({ kind: "group", groupId: "g1" });
    expect(topUnitOf("w3", list, layout)).toEqual({ kind: "workspace", workspaceId: "w3" });
    expect(topUnitOf("w4", list, layout)).toEqual({ kind: "workspace", workspaceId: "w4" });
    expect(topUnitOf("w5", list, layout)).toEqual({ kind: "workspace", workspaceId: "w5" });
    expect(topUnitOf("nope", list, layout)).toBeNull();
  });

  it("「グループなし」の中の worktree グループは repo", () => {
    expect(topUnitOf("w2", list, lay(["u"], {}, [`r:${R}`, "w:w3"]))).toEqual({ kind: "repo", repoKey: R });
    expect(topUnitOf("w1", list, lay(["u"], {}, [`r:${R}`, "w:w3"]))).toEqual({ kind: "repo", repoKey: R });
  });

  it("AC19: 代表でない workspace（同じフォルダの 2 つ目）は、worktree グループの一員ではなく workspace 単体", () => {
    const l = [wt("w1", "/r/.git", false), wt("w2", "/r/.git/worktrees/a"), wt("w3", "/r/.git/worktrees/a")];
    expect(topUnitOf("w2", l, lay(["u"], {}, [`r:${R}`]))).toEqual({ kind: "repo", repoKey: R });
    expect(topUnitOf("w3", l, lay(["u"], {}, [`r:${R}`]))).toEqual({ kind: "workspace", workspaceId: "w3" });
    // 代表でない workspace はグループへ個別に入れられる。
    expect(topUnitOf("w3", l, lay(["g:g1", "u"], { g1: ["w:w3"] }, [`r:${R}`]))).toEqual({ kind: "group", groupId: "g1" });
  });

  it("配信の途中（レイアウトに無い workspace）でも一番上のまとまりを返す", () => {
    expect(topUnitOf("w5", list, lay([]))).toEqual({ kind: "workspace", workspaceId: "w5" });
    expect(topUnitOf("w1", list, lay([]))).toEqual({ kind: "repo", repoKey: R });
  });

  it("sidebarTree と同じ決まり: 食い違い（w: で持つが今は repo）も今の判定", () => {
    expect(topUnitOf("w2", [body("w1"), linked("w2")], lay(["u"], {}, ["w:w1", "w:w2"]))).toEqual({
      kind: "repo",
      repoKey: R,
    });
  });
});

describe("layoutFromLegacy（F13・AC13・追補 01 B）", () => {
  const groups = [group("g1", "A"), group("g2", "B"), group("g3", "Empty")];

  it("同じリポジトリが別々のグループ → 本体の所属に揃う（空のグループはその後ろ、u は末尾）", () => {
    const list = [linked("w1", R, { groupId: "g2" }), body("w2", R, { groupId: "g1" })];
    const l = layoutFromLegacy(list, groups);
    expect(l.groups).toEqual({ g1: [`r:${R}`], g2: [], g3: [] });
    expect(l.top).toEqual(["g:g1", "g:g2", "g:g3", "u"]);
    expect(l.ungrouped).toEqual([]);
  });

  it("本体だけがグループに入っている → worktree も同じグループへ", () => {
    const l = layoutFromLegacy([body("w1", R, { groupId: "g1" }), linked("w2")], groups);
    expect(l.groups.g1).toEqual([`r:${R}`]);
  });

  it("worktree だけがグループに入っている → 本体が居るので「グループなし」（グループを抜ける）", () => {
    const l = layoutFromLegacy([body("w1"), linked("w2", R, { groupId: "g1" })], groups);
    expect(l.groups.g1).toEqual([]);
    expect(l.ungrouped).toEqual([`r:${R}`]);
  });

  it("本体が開かれていない → 最初に開いたものの所属", () => {
    const l = layoutFromLegacy(
      [linked("w1", R, { groupId: "g2" }), linked("w2", R, { groupId: "g1" })],
      groups,
    );
    expect(l.groups.g2).toEqual([`r:${R}`]);
    expect(l.groups.g1).toEqual([]);
  });

  it("単独の workspace（管理外）は自分の groupId で置く。1 つだけの repo も r: の項目。グループに入らないものは ungrouped", () => {
    const l = layoutFromLegacy(
      [ws("w1", { groupId: "g1" }), ws("w2"), body("w3", R2, { groupId: "g1" })],
      groups,
    );
    expect(l.groups.g1).toEqual(["w:w1", `r:${R2}`]);
    expect(l.top).toEqual(["g:g1", "g:g2", "g:g3", "u"]);
    expect(l.ungrouped).toEqual(["w:w2"]);
  });

  it("位置: グループは先頭のメンバーの平らな順、空のグループはその後ろ、u は末尾。グループなしの項目は先頭の workspace の順", () => {
    const list = [
      ws("w1"),
      ws("w2", { groupId: "g2" }),
      linked("w3", R),
      ws("w4", { groupId: "g1" }),
      body("w5", R),
    ];
    const l = layoutFromLegacy(list, groups);
    expect(l.top).toEqual(["g:g2", "g:g1", "g:g3", "u"]);
    expect(l.groups).toEqual({ g1: ["w:w4"], g2: ["w:w2"], g3: [] });
    expect(l.ungrouped).toEqual(["w:w1", `r:${R}`]);
  });

  it("AC19: 代表でない workspace は w:<id> で自分の groupId に従い、代表の項目とは別に置く", () => {
    const list = [wt("w1", "/r/.git", false), wt("w2", "/r/.git", false, R, { groupId: "g1" })];
    const l = layoutFromLegacy(list, groups);
    expect(l.ungrouped).toEqual([`r:${R}`]);
    expect(l.groups.g1).toEqual(["w:w2"]);
  });

  it("存在しないグループを指す groupId は「グループなし」に置く。結果を sidebarTree に通すと元の平らな順と矛盾しない", () => {
    const list = [ws("w1", { groupId: "gone" }), body("w2"), linked("w3")];
    const l = layoutFromLegacy(list, []);
    expect(l.top).toEqual(["u"]);
    expect(l.ungrouped).toEqual(["w:w1", `r:${R}`]);
    expect(shape(sidebarTree(list, [], l, "opened"))).toEqual([{ u: ["w1", { r: "w2", children: ["w3"] }] }]);
  });
});
