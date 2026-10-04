import { describe, expect, it } from "vitest";
import type { GitInfo, SidebarLayout, SessionSnapshot } from "@sodashitsu/protocol";
import {
  flattenWorkspaceIds,
  layoutFromLegacy,
  representativeIds,
  sidebarTree,
  visibleWorkspaceIdsInOrder,
  type TopRow,
} from "@sodashitsu/client-core";
import { SessionModel, type NewPaneInit } from "./SessionModel.js";

// 20261004-group-worktree-items（T19）: サーバと画面（client-core）が同じ純関数を使い、同じ入力から同じ結果になること。
// サーバが配るスナップショットの `layout`・並びを、画面が受け取ったものとして `sidebarTree` に通した結果と突き合わせる。

const init: NewPaneInit = { cwd: "/home/u", shell: "/bin/bash", cols: 80, rows: 24 };
const HOST = { os: "linux" as const, windowsBuild: null, hostname: "h" };

const gitOf = (repoKey: string, isLinkedWorktree: boolean, worktreeKey?: string): GitInfo => ({
  branch: "b",
  ahead: 0,
  behind: 0,
  repoKey,
  isLinkedWorktree,
  ...(worktreeKey !== undefined ? { worktreeKey } : {}),
});

function snapshotOf(model: SessionModel): SessionSnapshot {
  return model.buildSnapshot("0.1.0", HOST, { scrollbackLines: 5000 });
}

/** 画面が見る木の、全部広げたときの workspace の並び（サイドバーの上から下。グループの折りたたみは無視する）。 */
function treeIds(snapshot: SessionSnapshot, layout: SidebarLayout = snapshot.layout!): string[] {
  const groups = snapshot.groups.map((g) => ({ ...g, collapsed: false }));
  return visibleWorkspaceIdsInOrder(
    sidebarTree(snapshot.workspaces, groups, layout, "opened"),
    new Set(),
    null,
  );
}

/** 木を「まとまり → 項目の先頭の workspace → 子」の入れ子の文字列にして比べやすくする。 */
function shapeOf(tree: TopRow[]): unknown {
  return tree.map((row) => ({
    kind: row.kind,
    ...(row.kind === "group" ? { id: row.group.id } : { heading: row.heading }),
    items: row.items.map((it) =>
      it.kind === "workspace" ? it.workspace.id : [it.head.id, ...it.children.map((c) => c.id)],
    ),
  }));
}

/** 確定済みのモデルで、サーバの並び（Map）・実効の groupId・配るレイアウトが、画面の木と食い違わないこと。 */
function expectAgreement(model: SessionModel, step: string): void {
  const snapshot = snapshotOf(model);
  const layout = snapshot.layout!;
  const serverOrder = snapshot.workspaces.map((w) => w.id);
  // サーバが Map を並べ直すのに使う関数の結果が、サーバの並び。
  expect(flattenWorkspaceIds(layout, snapshot.workspaces), `${step}: flatten`).toEqual(serverOrder);
  // 画面の木の順も、同じ workspace を 1 度ずつ並べ、順まで同じになる（T33。サーバは旗で代表を決めるので、代表を先に置く入れ替えは無い）。
  const ids = treeIds(snapshot);
  expect([...ids].sort(), `${step}: tree has every workspace once`).toEqual(
    [...serverOrder].sort(),
  );
  expect(ids, `${step}: tree order`).toEqual(serverOrder);
  // settle は何度呼んでも同じ（冪等）。
  expect(flattenWorkspaceIds(layout, snapshot.workspaces), `${step}: idempotent`).toEqual(serverOrder);
  // 画面がレイアウトを持たない（古いサーバ）ときに導く結果と、確定後のレイアウトが違ってよいのは、利用者が並べ替えた分だけ。
  // 実効の groupId は、木でそのグループの中に居る workspace と一致する。
  const tree = sidebarTree(snapshot.workspaces, snapshot.groups, layout, "opened");
  for (const row of tree) {
    const ids = row.items.flatMap((it) =>
      it.kind === "workspace" ? [it.workspace.id] : [it.head.id, ...it.children.map((c) => c.id)],
    );
    for (const id of ids) {
      const expected = row.kind === "group" ? row.group.id : null;
      expect(
        snapshot.workspaces.find((w) => w.id === id)!.groupId,
        `${step}: groupId of ${id}`,
      ).toBe(expected);
    }
  }
}

describe("サーバと画面は同じ純関数で同じ木になる（T19）", () => {
  function build(): {
    model: SessionModel;
    a: string;
    b: string;
    c: string;
    d: string;
    e: string;
    f: string;
  } {
    const model = new SessionModel();
    const id = (cwd: string, label: string): string =>
      model.createWorkspace(cwd, label, init).workspace.id;
    const a = id("/repo", "a"); // リポジトリ R の本体
    const b = id("/repo-wt1", "b"); // R の linked worktree
    const c = id("/repo-wt2", "c"); // R の linked worktree
    const d = id("/plain", "d"); // 管理外
    const e = id("/repo-wt1", "e"); // b と同じフォルダの 2 つ目（代表ではない）
    const f = id("/other", "f"); // 別のリポジトリ S の本体
    model.updateWorkspaceGit(a, { kind: "git", git: gitOf("/repo/.git", false, "/repo/.git") });
    model.updateWorkspaceGit(b, {
      kind: "git",
      git: gitOf("/repo/.git", true, "/repo/.git/worktrees/b"),
    });
    model.updateWorkspaceGit(c, {
      kind: "git",
      git: gitOf("/repo/.git", true, "/repo/.git/worktrees/c"),
    });
    model.updateWorkspaceGit(e, {
      kind: "git",
      git: gitOf("/repo/.git", true, "/repo/.git/worktrees/b"),
    });
    model.updateWorkspaceGit(f, { kind: "git", git: gitOf("/other/.git", false, "/other/.git") });
    model.updateWorkspaceGit(d, { kind: "unmanaged" });
    return { model, a, b, c, d, e, f };
  }

  it("操作のたびに、サーバの並び・実効の groupId・配るレイアウトが画面の木と一致する（入れる・外す・並べ替える・グループの削除・代表の交代）", () => {
    const { model, a, b, d, e, f } = build();
    expectAgreement(model, "initial");

    const g1 = model.createGroup("g1", a); // 本体 a を入れて作る（worktree グループごと入る）
    expectAgreement(model, "createGroup");
    const g2 = model.createGroup("g2");
    expectAgreement(model, "createGroup (empty)");
    model.addToGroup(d, g1.id);
    expectAgreement(model, "addToGroup");
    model.addToGroup(e, g2.id); // 代表でない workspace は workspace 単位で入る
    expectAgreement(model, "addToGroup (non representative)");
    model.moveItem({ kind: "workspace", workspaceId: d }, { kind: "workspace", workspaceId: a });
    expectAgreement(model, "moveItem");
    model.moveItemBy({ kind: "group", groupId: g2.id }, "previous");
    expectAgreement(model, "moveItemBy (group)");
    model.moveItemBy({ kind: "ungrouped" }, "previous");
    expectAgreement(model, "moveItemBy (ungrouped)");
    model.removeFromGroup(d);
    expectAgreement(model, "removeFromGroup");
    model.toggleGroupCollapsed(g1.id);
    expectAgreement(model, "toggleGroupCollapsed");
    model.closeWorkspace(b); // 代表の交代: e が b の worktree の代表になる
    expectAgreement(model, "closeWorkspace (representative handover)");
    model.moveWorkspace(f, "previous");
    expectAgreement(model, "moveWorkspace");
    model.deleteGroup(g1.id);
    expectAgreement(model, "deleteGroup");
  });

  it("T29: 「グループなし」を上に並べ替えた後に同じフォルダへ workspace が増えても、サーバが配る代表と画面の代表が一致し、worktree グループは崩れない", () => {
    const model = new SessionModel();
    const m = model.createWorkspace("/m", "m", init).workspace.id;
    const w1 = model.createWorkspace("/w1", "w1", init).workspace.id;
    model.updateWorkspaceGit(m, { kind: "git", git: gitOf("/r/.git", false, "/r/.git") });
    model.updateWorkspaceGit(w1, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/w1") });
    const g = model.createGroup("G", m);
    model.moveItemBy({ kind: "ungrouped" }, "previous"); // top: ["u", g]
    const w2 = model.createWorkspace("/w1", "w2", init).workspace.id; // W1 を選んでの「＋新規」: 判定前は平らな順で W1 より前
    expectAgreement(model, "created");
    expect(snapshotOf(model).workspaces.map((w) => w.id).indexOf(w2)).toBeLessThan(snapshotOf(model).workspaces.map((w) => w.id).indexOf(w1));
    model.updateWorkspaceGit(w2, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/w1") });
    expectAgreement(model, "judged");
    const snapshot = snapshotOf(model);
    expect(representativeIds(snapshot.workspaces)).toEqual(new Set([m, w1]));
    expect(shapeOf(sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened"))).toEqual([
      { kind: "ungrouped", heading: true, items: [w2] },
      { kind: "group", id: g.id, items: [[m, w1]] },
    ]);
  });

  it("T33: linked worktree が 2 つ（M・Wa・Wb）で、2 つ目の Wb を選んで＋新規しても、worktree グループの子の順は変わらず、settle は何度呼んでも同じ（画面とサーバの一致）", () => {
    const model = new SessionModel();
    const m = model.createWorkspace("/m", "m", init).workspace.id;
    const wa = model.createWorkspace("/wa", "wa", init).workspace.id;
    const wb = model.createWorkspace("/wb", "wb", init).workspace.id;
    model.updateWorkspaceGit(m, { kind: "git", git: gitOf("/r/.git", false, "/r/.git") });
    model.updateWorkspaceGit(wa, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/wa") });
    model.updateWorkspaceGit(wb, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/wb") });
    const g = model.createGroup("G", m);
    model.moveItemBy({ kind: "ungrouped" }, "previous"); // top: ["u", g]
    const shape = (): unknown => {
      const snapshot = snapshotOf(model);
      return shapeOf(sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened"));
    };
    expect(shape()).toEqual([
      { kind: "ungrouped", heading: true, items: [] },
      { kind: "group", id: g.id, items: [[m, wa, wb]] },
    ]);
    const d = model.createWorkspace("/wb", "d", init).workspace.id; // Wb を選んでの「＋新規」
    expectAgreement(model, "created");
    model.updateWorkspaceGit(d, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/wb") });
    expectAgreement(model, "judged");
    const expected = [
      { kind: "ungrouped", heading: true, items: [d] },
      { kind: "group", id: g.id, items: [[m, wa, wb]] },
    ];
    expect(shape()).toEqual(expected);
    const order = snapshotOf(model).workspaces.map((w) => w.id);
    // 何度判定を反映しても（settle を何度通っても）並びも木も変わらない。
    for (let i = 0; i < 3; i++) {
      model.updateWorkspaceGit(d, { kind: "git", git: gitOf("/r/.git", true, "/r/.git/worktrees/wb") });
      expectAgreement(model, `again ${i}`);
      expect(snapshotOf(model).workspaces.map((w) => w.id)).toEqual(order);
      expect(shape()).toEqual(expected);
    }
  });

  it("仮の状態（layout の無い保存からの復元）: 配るレイアウトは、画面が古いサーバに対して導くレイアウトと同じ", () => {
    const model = new SessionModel();
    const wsData = (id: string, groupId?: string) =>
      ({
        id,
        label: id,
        cwd: "/x",
        activeTabId: `t-${id}`,
        ...(groupId ? { groupId } : {}),
        tabs: [
          {
            id: `t-${id}`,
            label: "1",
            layout: { type: "pane" as const, paneId: `p-${id}` },
            focusedPaneId: `p-${id}`,
            zoomedPaneId: null,
            panes: [{ id: `p-${id}`, label: null, cwd: "/x", shell: "sh" }],
          },
        ],
      }) as never;
    model.setNextIdCounters({ w: 5, t: 5, p: 5, s: 1, a: 1, g: 3 });
    model.restoreGroup({ id: "g1", label: "g1", collapsed: false });
    model.restoreGroup({ id: "g2", label: "g2", collapsed: false });
    model.restoreWorkspace(wsData("w1"), false);
    model.restoreWorkspace(wsData("w2", "g2"), false);
    model.restoreWorkspace(wsData("w3", "g1"), false);
    model.restoreWorkspace(wsData("w4"), false);
    model.updateWorkspaceGit("w1", { kind: "git", git: gitOf("/r/.git", false, "/r/.git") });
    model.updateWorkspaceGit("w4", {
      kind: "git",
      git: gitOf("/r/.git", true, "/r/.git/worktrees/w4"),
    });
    expect(model.hasLayout()).toBe(false);
    const snapshot = snapshotOf(model);
    expect(snapshot.layout).toEqual(layoutFromLegacy(snapshot.workspaces, snapshot.groups));
    // 画面は同じ入力から同じ木を作る（グループは先頭のメンバーの平らな順 → g2 が g1 より先。空のものは後ろ）。
    expect(
      shapeOf(sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened")),
    ).toEqual(
      shapeOf(
        sidebarTree(
          snapshot.workspaces,
          snapshot.groups,
          layoutFromLegacy(snapshot.workspaces, snapshot.groups),
          "opened",
        ),
      ),
    );
    expect(
      shapeOf(sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened")),
    ).toEqual([
      { kind: "group", id: "g2", items: ["w2"] },
      { kind: "group", id: "g1", items: ["w3"] },
      { kind: "ungrouped", heading: true, items: [["w1", "w4"]] },
    ]);
    // 確定しても、導いた結果は変わらない（確定は並びを動かさない）。
    const before = shapeOf(
      sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened"),
    );
    model.confirmLayout();
    const after = snapshotOf(model);
    expect(model.hasLayout()).toBe(true);
    expect(shapeOf(sidebarTree(after.workspaces, after.groups, after.layout!, "opened"))).toEqual(
      before,
    );
  });

  it("配信の途中（workspace.created が layout の前に届いた）でも、画面の木は layout が届いた後の木と同じになる", () => {
    const { model } = build();
    const beforeSnapshot = snapshotOf(model);
    const oldLayout = beforeSnapshot.layout!;
    const created = model.createWorkspace("/new", "new", init).workspace; // 「グループなし」の末尾へ入る
    model.updateWorkspaceGit(created.id, { kind: "unmanaged" });
    const after = snapshotOf(model);
    // 画面は workspace を足したが、layout はまだ古いまま。
    const midTree = sidebarTree(after.workspaces, after.groups, oldLayout, "opened");
    const finalTree = sidebarTree(after.workspaces, after.groups, after.layout!, "opened");
    expect(shapeOf(midTree)).toEqual(shapeOf(finalTree));
    // 閉じたとき（workspace.closed が layout の前に届く）も、残りの木は同じ。
    const target = after.workspaces[0]!.id;
    model.closeWorkspace(target);
    const closed = snapshotOf(model);
    const midClosed = sidebarTree(closed.workspaces, closed.groups, after.layout!, "opened");
    expect(shapeOf(midClosed)).toEqual(
      shapeOf(sidebarTree(closed.workspaces, closed.groups, closed.layout!, "opened")),
    );
  });

  it("配信の途中（layout が workspace.created／workspace.closed より先に届いた）: 実在しない workspace を指すレイアウトでも、画面の木は今ある workspace を 1 度ずつ並べる", () => {
    const { model } = build();
    const before = snapshotOf(model);
    const created = model.createWorkspace("/new", "new", init).workspace;
    model.updateWorkspaceGit(created.id, { kind: "unmanaged" });
    const afterCreate = snapshotOf(model);
    // 新しい layout だけが先に届いた: layout は created を指すが、workspaces にはまだ無い。
    expect(JSON.stringify(afterCreate.layout)).toContain(`w:${created.id}`);
    const idsOf = (snap: SessionSnapshot, layout: SidebarLayout): string[] =>
      treeIds({ ...snap, groups: snap.groups }, layout);
    const midCreated = idsOf(before, afterCreate.layout!);
    expect(midCreated).not.toContain(created.id);
    expect([...midCreated].sort()).toEqual(before.workspaces.map((w) => w.id).sort());
    // 閉じる向き: layout は閉じた workspace を含まないが、workspaces にはまだ残っている（残っていても落ちず 1 度ずつ並ぶ）。
    const target = created.id; // 管理外の workspace（レイアウトの `w:<id>` が消える）
    model.closeWorkspace(target);
    const afterClose = snapshotOf(model);
    expect(JSON.stringify(afterClose.layout)).not.toContain(`w:${target}`);
    expect(afterCreate.workspaces.map((w) => w.id)).toContain(target);
    const midClosed = idsOf(afterCreate, afterClose.layout!);
    expect([...midClosed].sort()).toEqual(afterCreate.workspaces.map((w) => w.id).sort());
  });

  it("workspace.created の直後（updateWorkspaceGit の前。git の判定がまだ無い）でも、サーバの並び・実効の groupId・レイアウトは画面の木と一致する", () => {
    const { model } = build();
    const created = model.createWorkspace("/new", "new", init).workspace; // git は未判定のまま
    expect(snapshotOf(model).workspaces.find((w) => w.id === created.id)!.git).toBeNull();
    expectAgreement(model, "created, no git verdict");
    const g = model.createGroup("g", created.id); // 判定前の workspace をグループに入れても一致する
    expectAgreement(model, "grouped before verdict");
    model.updateWorkspaceGit(created.id, { kind: "unmanaged" });
    expectAgreement(model, "after verdict");
    expect(snapshotOf(model).groups.map((x) => x.id)).toContain(g.id);
  });

  it("グループがまだ 1 つも無いとき「グループなし」は見出しを出さず、項目はそのまま並ぶ（サーバのスナップショットを画面の木に通す）", () => {
    const { model } = build();
    const snapshot = snapshotOf(model);
    const tree = sidebarTree(snapshot.workspaces, snapshot.groups, snapshot.layout!, "opened");
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: "ungrouped", heading: false });
  });
});
