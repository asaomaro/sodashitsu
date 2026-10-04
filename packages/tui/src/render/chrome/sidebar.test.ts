import type { SidebarLayout, Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { PrefsModel } from "../../model/PrefsModel.js";
import { currentVisibleWorkspaceIds } from "../../model/sidebarTree.js";
import { SessionModel } from "../../model/SessionModel.js";
import { snapshot, tab, workspace, pane, leaf } from "../../testing/fixtures.js";
import { ThemeColors } from "../color.js";
import { Grid } from "../Screen.js";
import type { ChromeContext } from "./context.js";
import { KIND_GLYPH, paintSidebar, type SidebarHit } from "./sidebar.js";

/** 本体（r1）と worktree 2 つ（r1）、別のリポジトリ（r2）の本体、管理外の 1 つ。 */
function ws(id: string, extra: Partial<Workspace> = {}): Workspace {
  return workspace(id, [`t-${id}`], { label: id, ...extra });
}
const git = (repoKey: string, linked: boolean) => ({
  branch: null,
  ahead: 0,
  behind: 0,
  repoKey,
  isLinkedWorktree: linked,
});

function setup(
  workspaces: Workspace[],
  opts: {
    layout?: SidebarLayout;
    groups?: { id: string; label: string; collapsed: boolean }[];
    focus?: string;
  } = {},
) {
  const model = new SessionModel();
  const focus = opts.focus ?? workspaces[0]!.id;
  model.applySnapshot(
    snapshot({
      workspaces,
      tabs: workspaces.map((w) => tab(w.tabIds[0]!, w.id, leaf(`p-${w.id}`))),
      panes: workspaces.map((w) => pane(`p-${w.id}`, w.tabIds[0]!)),
      groups: opts.groups ?? [],
      focus: { workspaceId: focus, tabId: `t-${focus}`, paneId: `p-${focus}` },
      ...(opts.layout ? { layout: opts.layout } : {}),
    }),
    "c1",
  );
  const prefs = new PrefsModel();
  const ctx: ChromeContext = {
    model,
    prefs,
    theme: new ThemeColors("dracula"),
    mode: "terminal",
    connection: "open",
    notice: null,
  };
  const paint = () => {
    const grid = new Grid(40, 24);
    const hits = paintSidebar(grid, { x: 0, y: 0, w: 40, h: 24 }, ctx);
    const text = (y: number) => {
      let s = "";
      for (let x = 0; x < 39; x++) s += grid.cell(x, y).ch;
      return s.trimEnd();
    };
    // 0 行目は見出し「Spaces」。
    const lines = Array.from({ length: 12 }, (_, i) => text(i + 1)).filter((l) => l !== "");
    return { lines, hits: hits as SidebarHit[] };
  };
  return { model, prefs, paint };
}

const REPO = [
  ws("main", { git: git("r1", false) }),
  ws("wt-a", { git: git("r1", true) }),
  ws("wt-b", { git: git("r1", true) }),
];

describe("サイドバーの木（T16。グループ・worktree グループ・子・通常の行）", () => {
  it("グループの中に worktree グループと通常の行を 3 段で描き、先頭の行とグループの見出しに種類の印を付ける", () => {
    const all = [...REPO, ws("solo")];
    const { paint } = setup(all, {
      groups: [{ id: "g1", label: "仕事", collapsed: false }],
      layout: { top: ["g:g1"], groups: { g1: ["r:r1", "w:solo"] }, ungrouped: [] },
    });
    const { lines } = paint();
    // 字下げ: グループ 0・項目 2・子 4（workspace の行は頭に状態の印の欄 2 桁があるので、最初の文字は +2 桁）。
    // `ψ` は worktree グループの先頭の行だけ、`≡` はグループの見出しだけ。
    expect(lines.map((l) => l.replace(/\s+/g, " ").trim())).toEqual([
      `▾ ${KIND_GLYPH.group} 仕事`,
      `▾ ${KIND_GLYPH.worktreeGroup} main`,
      "wt-a",
      "wt-b",
      "solo",
    ]);
    expect(lines.map((l) => l.search(/\S/))).toEqual([1, 3, 7, 7, 5]);
  });

  it("畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ", () => {
    const all = [...REPO, ws("solo")];
    const layout = { top: ["g:g1"], groups: { g1: ["r:r1", "w:solo"] }, ungrouped: [] };
    const closed = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: true }],
      layout,
      focus: "wt-b",
    });
    expect(closed.paint().lines.map((l) => l.trim().split(" ").at(-1))).toEqual(["G", "wt-b"]);
    const open = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout,
      focus: "wt-b",
    });
    open.prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    const { lines } = open.paint();
    expect(lines.map((l) => l.replace(/\s+/g, " ").trim())).toEqual([
      `▾ ${KIND_GLYPH.group} G`,
      `▸ ${KIND_GLYPH.worktreeGroup} main`,
      "wt-b",
      "solo",
    ]);
  });

  it("名前順は一番上の行だけを並べ、グループの中はレイアウトの順のまま", () => {
    const all = [ws("zz"), ws("b-in"), ws("a-in"), ws("m")];
    const { prefs, paint } = setup(all, {
      groups: [{ id: "g1", label: "grp", collapsed: false }],
      layout: { top: ["w:zz", "g:g1", "w:m"], groups: { g1: ["w:b-in", "w:a-in"] }, ungrouped: [] },
    });
    prefs.apply({ workspaceSort: "name" }, 1);
    expect(paint().lines.map((l) => l.replace(/\s+/g, " ").trim())).toEqual([
      `▾ ${KIND_GLYPH.group} grp`,
      "b-in",
      "a-in",
      "m",
      "zz",
    ]);
  });

  it("先頭の行の当たり判定: 左の ▸/▾ が折りたたみ、ほかの桁は workspace。畳んだ・開いたの両方を持つ", () => {
    const { paint } = setup(REPO, { layout: { top: ["r:r1"], groups: {}, ungrouped: [] } });
    const head = paint().hits.find((h) => h.kind === "autoGroup");
    expect(head).toMatchObject({
      kind: "autoGroup",
      repoKey: "r1",
      workspaceId: "main",
      toggleX: 1,
    });
    // 子の行は workspace の当たり。
    expect(
      paint()
        .hits.filter((h) => h.kind === "workspace")
        .map((h) => h.kind === "workspace" && h.workspaceId),
    ).toEqual(["wt-a", "wt-b"]);
  });

  it("行の並びが 2 行以上でも、先頭の行の 2 行目は「▸ ψ 」の分だけ下げる（通常の行は状態の印の幅だけ）", () => {
    const { prefs, paint } = setup([...REPO, ws("solo")], {
      layout: { top: ["r:r1", "w:solo"], groups: {}, ungrouped: [] },
    });
    prefs.apply(
      {
        sidebarRows: {
          spaces: [[{ token: "state_icon" }, { token: "workspace" }], [{ token: "workspace" }]],
        },
      },
      1,
    );
    const { lines } = paint();
    const at = (name: string, nth = 0) =>
      lines.map((l, i) => [i, l.indexOf(name)] as const).filter(([, c]) => c >= 0)[nth]![1];
    // 先頭（main）: 1 行目は「▸ ψ 」＋状態の印の後ろ、2 行目は 1 + 6。通常の行（solo）の 2 行目は 1 + 2。
    expect(at("main", 1)).toBe(7);
    expect(at("solo", 1)).toBe(3);
  });

  it("layout の無い古いサーバは layoutFromLegacy で本体の所属に描く（子が別のグループでも 1 つの項目）", () => {
    const all = [
      ws("main", { git: git("r1", false), groupId: "g1" }),
      ws("wt-a", { git: git("r1", true), groupId: null }),
    ];
    const { paint } = setup(all, { groups: [{ id: "g1", label: "G", collapsed: false }] });
    const { lines } = paint();
    expect(lines.map((l) => l.replace(/\s+/g, " ").trim())).toEqual([
      `▾ ${KIND_GLYPH.group} G`,
      `▾ ${KIND_GLYPH.worktreeGroup} main`,
      "wt-a",
    ]);
  });

  it("workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る", () => {
    const all = [...REPO, ws("solo")];
    const { model, prefs, paint } = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout: { top: ["u", "g:g1"], groups: { g1: ["r:r1"] }, ungrouped: ["w:solo"] },
    });
    // 描画の順（見出しを除く）と、キー操作の順が一致する。
    const drawn = paint().lines.map((l) => l.trim().split(" ").at(-1)!);
    expect(drawn.filter((n) => n !== "G")).toEqual(currentVisibleWorkspaceIds(model, prefs));
    expect(currentVisibleWorkspaceIds(model, prefs)).toEqual(["solo", "main", "wt-a", "wt-b"]);
    // 畳むと今いる workspace だけ（solo にいるので、グループの中は何も見えない）。
    prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    expect(currentVisibleWorkspaceIds(model, prefs)).toEqual(["solo", "main"]);
  });
});
