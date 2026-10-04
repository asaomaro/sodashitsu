import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { snapshot, workspace } from "../testing/fixtures.js";
import { REFUSE_BY_NAME, REFUSE_CONTAINER } from "./sidebarDrag.js";

const down = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}M`;
const up = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}m`;
const drag = (x: number, y: number) => `\x1b[<32;${x + 1};${y + 1}M`;
const X = 8; // 名前の上（見出しの「▸/▾」〔x=1〕・先頭の行の記号の外）

const git = (linked: boolean) => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  repoKey: "r1",
  isLinkedWorktree: linked,
});

/**
 * 項目単位のドラッグ（20261004-group-worktree-items・追補 01・T27 のうち T18）。サイドバーの行（0 行目は見出しの「Spaces」）：
 * 1 = グループ g1 の見出し、2 = w1、3 = worktree グループの先頭 w2、4 = その子 w3、5 = グループ g2 の見出し、6 = w4、
 * 7 = 「グループなし」の見出し、8 = w5、9 = w6。
 */
describe("サイドバーのドラッグ（項目単位）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  const layoutSnap = () =>
    snapshot({
      workspaces: [
        workspace("w1", ["t1"]),
        workspace("w2", ["t2"], { git: git(false) }),
        workspace("w3", ["t3"], { git: git(true) }),
        workspace("w4", ["t4"]),
        workspace("w5", ["t5"]),
        workspace("w6", ["t6"]),
      ],
      groups: [
        { id: "g1", label: "G1", collapsed: false },
        { id: "g2", label: "G2", collapsed: false },
      ],
      layout: {
        top: ["g:g1", "g:g2", "u"],
        groups: { g1: ["w:w1", "r:r1"], g2: ["w:w4"] },
        ungrouped: ["w:w5", "w:w6"],
      },
    });
  async function start(opts: Parameters<typeof startedApp>[0] = { snapshot: layoutSnap() }) {
    const h = await startedApp({
      respond: { "prefs.set": (p: { patch: unknown }) => ({ prefs: p.patch, rev: 1 }) },
      ...opts,
    });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    await h.screen();
    h.app.renderNow();
    const moves = () => h.ws.requests("item.move").map((r) => r.params);
    const toasts = () => h.app.ui.toasts.map((t) => t.message);
    return { ...h, moves, toasts };
  }

  it("グループの中の項目：下へ落とすと落とした項目の次の前（末尾なら null）、上へなら落とした項目の前", async () => {
    const h = await start();
    h.io.type(down(X, 2) + drag(X, 3) + up(X, 3)); // w1 を worktree グループの先頭の行へ（下）
    expect(h.moves()).toEqual([{ item: { kind: "workspace", workspaceId: "w1" }, before: null }]);
    h.io.type(down(X, 4) + drag(X, 3) + drag(X, 2) + up(X, 2)); // 子の行を掴む＝worktree グループ全体（先頭の workspace）を w1 の上へ
    expect(h.moves().at(-1)).toEqual({
      item: { kind: "workspace", workspaceId: "w2" },
      before: { kind: "workspace", workspaceId: "w1" },
    });
  });

  it("worktree グループの先頭の行を掴む：グループ全体が動く。子の行の上に落としても、その項目の位置", async () => {
    const h = await start();
    h.io.type(down(X, 3) + drag(X, 2) + up(X, 2));
    expect(h.moves()).toEqual([
      {
        item: { kind: "workspace", workspaceId: "w2" },
        before: { kind: "workspace", workspaceId: "w1" },
      },
    ]);
    h.io.type(down(X, 2) + drag(X, 3) + drag(X, 4) + up(X, 4)); // 子の行の上へ（項目は worktree グループ。次の項目は無いので末尾）
    expect(h.moves().at(-1)).toEqual({
      item: { kind: "workspace", workspaceId: "w1" },
      before: null,
    });
  });

  it("「グループなし」の中の項目も並べ替えられる", async () => {
    const h = await start();
    h.io.type(down(X, 9) + drag(X, 8) + up(X, 8));
    expect(h.moves()).toEqual([
      {
        item: { kind: "workspace", workspaceId: "w6" },
        before: { kind: "workspace", workspaceId: "w5" },
      },
    ]);
  });

  it("入れ物をまたぐ落とし先（別のグループの項目・見出し・「グループなし」の項目）は送らず知らせる", async () => {
    const h = await start();
    h.io.type(down(X, 2) + drag(X, 6) + up(X, 6)); // g1 の項目 → g2 の項目
    h.io.type(down(X, 2) + drag(X, 5) + up(X, 5)); // g1 の項目 → 見出し
    h.io.type(down(X, 2) + drag(X, 8) + up(X, 8)); // g1 の項目 → 「グループなし」の項目
    expect(h.toasts()).toEqual([REFUSE_CONTAINER, REFUSE_CONTAINER, REFUSE_CONTAINER]);
    const before = h.app.ui.toasts.at(-1)!.id;
    h.io.type(down(X, 8) + drag(X, 6) + up(X, 6)); // 「グループなし」の項目 → g2 の項目
    expect(h.app.ui.toasts.at(-1)!.id).toBeGreaterThan(before);
    expect(h.moves()).toEqual([]);
  });

  it("グループの見出しのドラッグ：まとまりどうしを並べ替える（グループ・「グループなし」）", async () => {
    const h = await start();
    h.io.type(down(X, 1) + drag(X, 5) + up(X, 5)); // g1 を g2 の見出しへ（下）＝g2 の次の前（「グループなし」の前）
    h.io.type(down(X, 7) + drag(X, 1) + up(X, 1)); // 「グループなし」の見出しを g1 の見出しの上へ
    h.io.type(down(X, 5) + drag(X, 1) + up(X, 1)); // g2 を g1 の上へ
    h.io.type(down(X, 1) + drag(X, 7) + up(X, 7)); // g1 を「グループなし」へ（下）＝末尾
    expect(h.moves()).toEqual([
      { item: { kind: "group", groupId: "g1" }, before: { kind: "ungrouped" } },
      { item: { kind: "ungrouped" }, before: { kind: "group", groupId: "g1" } },
      { item: { kind: "group", groupId: "g2" }, before: { kind: "group", groupId: "g1" } },
      { item: { kind: "group", groupId: "g1" }, before: null },
    ]);
    expect(h.toasts()).toEqual([]);
  });

  it("グループの見出しは項目の行の上へは落とせない（まとまりの中の項目・グループなしの項目）。自分の中の行の上は何も起きない", async () => {
    const h = await start();
    h.io.type(down(X, 5) + drag(X, 8) + up(X, 8)); // g2 の見出し → 「グループなし」の項目
    expect(h.toasts()).toEqual([REFUSE_CONTAINER]);
    h.io.type(down(X, 5) + drag(X, 6) + up(X, 6)); // 自分（g2）の中の行
    h.io.type(down(X, 1) + drag(X, 3) + up(X, 3)); // 自分（g1）の中の worktree グループ
    expect(h.moves()).toEqual([]);
    expect(h.toasts()).toEqual([REFUSE_CONTAINER]);
  });

  it("行の外（区画の外・何も無い所）で離したら取り消し（何も送らず知らせない）", async () => {
    const h = await start();
    h.io.type(down(X, 2) + drag(X, 3) + drag(X, 20) + up(X, 20));
    h.io.type(down(X, 2) + drag(X, 3) + drag(60, 10) + up(60, 10));
    expect(h.moves()).toEqual([]);
    expect(h.toasts()).toEqual([]);
  });

  it("Esc で取り消し（そのあと離しても送らない）", async () => {
    const h = await start();
    h.io.type(down(X, 2) + drag(X, 3));
    h.io.type("\x1b");
    await new Promise((r) => setTimeout(r, 40));
    h.io.type(up(X, 3));
    expect(h.moves()).toEqual([]);
    expect(h.toasts()).toEqual([]);
    // 取り消したあとは次のドラッグが普通に動く。
    h.io.type(down(X, 2) + drag(X, 3) + up(X, 3));
    expect(h.moves()).toHaveLength(1);
  });

  it("見出し：動かさずに離すと畳み・広げ、動かして離すと畳まない。左の ▸/▾ は押した時点で畳み・広げ", async () => {
    const h = await start();
    h.io.type(down(X, 1) + up(X, 1));
    expect(h.ws.requests("group.toggle_collapsed").map((r) => r.params)).toEqual([
      { groupId: "g1" },
    ]);
    h.io.type(down(X, 1) + drag(X, 5) + up(X, 5));
    expect(h.ws.requests("group.toggle_collapsed")).toHaveLength(1);
    h.io.type(down(1, 5));
    expect(h.ws.requests("group.toggle_collapsed")).toHaveLength(2);
    h.io.type(up(1, 5));
    h.io.type(down(X, 7) + up(X, 7));
    expect(h.ws.requests("prefs.set").map((r) => r.params)).toEqual([
      { patch: { ungroupedCollapsed: true } },
    ]);
  });

  it("名前順：一番上（グループの並び・「グループなし」の中）は送らず知らせる。グループの中は送る", async () => {
    const h = await start();
    h.app.prefs.apply({ workspaceSort: "name" }, 1);
    h.app.renderNow();
    h.io.type(down(X, 1) + drag(X, 5) + up(X, 5));
    h.io.type(down(X, 9) + drag(X, 8) + up(X, 8));
    expect(h.moves()).toEqual([]);
    expect(h.toasts()).toEqual([REFUSE_BY_NAME, REFUSE_BY_NAME]);
    h.io.type(down(X, 2) + drag(X, 3) + up(X, 3));
    expect(h.moves()).toEqual([{ item: { kind: "workspace", workspaceId: "w1" }, before: null }]);
  });

  describe("layout の無い古いサーバ（workspace.move_to）", () => {
    // g1 = [w1]、g2 = []（空）、グループ外 = [w3, w4]。行：1 = g1 の見出し、2 = w1、3 = g2 の見出し、4 = 「グループなし」の見出し、5 = w3、6 = w4。
    const oldSnap = () =>
      snapshot({
        workspaces: [
          workspace("w1", ["t1"], { groupId: "g1" }),
          workspace("w3", ["t3"]),
          workspace("w4", ["t4"]),
        ],
        groups: [
          { id: "g1", label: "G1", collapsed: false },
          { id: "g2", label: "G2", collapsed: false },
        ],
      });
    const moveTo = (h: Awaited<ReturnType<typeof start>>) =>
      h.ws.requests("workspace.move_to").map((r) => r.params);

    it("項目の並べ替えは、掴んだ項目の workspace 全部と落とし先の項目の先頭の workspace", async () => {
      const h = await start({ snapshot: oldSnap() });
      h.io.type(down(X, 6) + drag(X, 5) + up(X, 5));
      expect(moveTo(h)).toEqual([{ workspaceIds: ["w4"], beforeWorkspaceId: "w3" }]);
      h.io.type(down(X, 5) + drag(X, 6) + up(X, 6)); // 下へ＝末尾
      expect(moveTo(h).at(-1)).toEqual({ workspaceIds: ["w3"], beforeWorkspaceId: null });
      expect(h.moves()).toEqual([]);
    });

    it("グループの見出しを掴んでまとまりどうしを並べ替える：メンバー全部と、落とし先の見出しの先頭の workspace（末尾なら null）", async () => {
      // g1 = [w1, w2]、g2 = [w3]、グループ外 = [w4]。行：1 = g1、2 = w1、3 = w2、4 = g2、5 = w3、6 = 「グループなし」の見出し、7 = w4。
      const snap = snapshot({
        workspaces: [
          workspace("w1", ["t1"], { groupId: "g1" }),
          workspace("w2", ["t2"], { groupId: "g1" }),
          workspace("w3", ["t3"], { groupId: "g2" }),
          workspace("w4", ["t4"]),
        ],
        groups: [
          { id: "g1", label: "G1", collapsed: false },
          { id: "g2", label: "G2", collapsed: false },
        ],
      });
      const h = await start({ snapshot: snap });
      h.io.type(down(X, 4) + drag(X, 1) + up(X, 1)); // g2 を g1 の見出しの上へ（上）＝落とし先の先頭 w1 の前
      h.io.type(down(X, 1) + drag(X, 4) + up(X, 4)); // g1 を g2 の見出しへ（下）＝次のまとまり（グループなし）の先頭 w4 の前
      h.io.type(down(X, 1) + drag(X, 6) + up(X, 6)); // g1 を「グループなし」の見出しへ（下）＝末尾
      expect(moveTo(h)).toEqual([
        { workspaceIds: ["w3"], beforeWorkspaceId: "w1" },
        { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w4" },
        { workspaceIds: ["w1", "w2"], beforeWorkspaceId: null },
      ]);
      expect(h.moves()).toEqual([]);
      expect(h.toasts()).toEqual([]);
    });

    it("グループの見出しはメンバー全部。空のグループは掴めず、落とし先にもならない。「グループなし」の見出しは掴めない", async () => {
      const h = await start({ snapshot: oldSnap() });
      h.io.type(down(X, 1) + drag(X, 3) + up(X, 3)); // g1 を空の g2 の上へ（落とし先に workspace が無い）
      h.io.type(down(X, 3) + drag(X, 1) + up(X, 1)); // 空の g2 を掴む
      h.io.type(down(X, 4) + drag(X, 1) + up(X, 1)); // 「グループなし」の見出しを掴む
      expect(moveTo(h)).toEqual([]);
      expect(h.toasts()).toEqual([]);
    });
  });
});
