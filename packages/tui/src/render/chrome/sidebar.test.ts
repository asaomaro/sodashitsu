import type { AgentInfo, SidebarLayout, Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { PrefsModel } from "../../model/PrefsModel.js";
import { currentVisibleWorkspaceIds } from "../../model/sidebarTree.js";
import { SessionModel } from "../../model/SessionModel.js";
import { agent, snapshot, tab, workspace, pane, leaf } from "../../testing/fixtures.js";
import { ThemeColors } from "../color.js";
import { Grid } from "../Screen.js";
import type { ChromeContext } from "./context.js";
import { stringWidth } from "../width.js";
import { WORKTREE_GLYPH, paintSidebar, type SidebarHit } from "./sidebar.js";

/** 本体（r1）と worktree 2 つ（r1）、別のリポジトリ（r2）の本体、管理外の 1 つ。 */
function ws(id: string, extra: Partial<Workspace> = {}): Workspace {
  return workspace(id, [`t-${id}`], { label: id, ...extra });
}
const git = (repoKey: string, linked: boolean, branch: string | null = null) => ({
  branch,
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
    /** workspace ごとのエージェントの状態（その workspace の pane に居る）。 */
    states?: Record<string, Partial<AgentInfo> | AgentInfo["state"]>;
  } = {},
) {
  const model = new SessionModel();
  const focus = opts.focus ?? workspaces[0]!.id;
  model.applySnapshot(
    snapshot({
      workspaces,
      tabs: workspaces.map((w) => tab(w.tabIds[0]!, w.id, leaf(`p-${w.id}`))),
      panes: workspaces.map((w) => {
        const given = opts.states?.[w.id];
        const info = typeof given === "string" ? { state: given } : given;
        return pane(
          `p-${w.id}`,
          w.tabIds[0]!,
          info ? { agent: agent({ instanceId: `a-${w.id}`, ...info }) } : {},
        );
      }),
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
    const all = Array.from({ length: 22 }, (_, i) => text(i + 1)).filter((l) => l !== "");
    // 下の agents の区画（区切りの行から先）は見ない。
    const cut = all.findIndex((l) => l.startsWith("─"));
    const lines = cut < 0 ? all : all.slice(0, cut);
    return { lines, hits: hits as SidebarHit[] };
  };
  return { model, prefs, paint };
}

const REPO = [
  ws("main", { git: { ...git("r1", false, "main"), worktreeKey: "k-main" } }),
  ws("wt-a", { git: { ...git("r1", true, "feat-a"), worktreeKey: "k-a" } }),
  ws("wt-b", { git: { ...git("r1", true, "feat-b"), worktreeKey: "k-b" } }),
];

/** 空白をひとつにし、横線の連なりを 1 つの「─」にして読む（桁は別に `col` で固定する）。 */
const norm = (l: string) => l.replace(/─+/g, "─").replace(/\s+/g, " ").trim();
const col = (l: string) => l.search(/\S/);

describe("サイドバーの木（T16・T27。追補 01 の T4 の見た目）", () => {
  it("グループの見出しは「▾ ◐ 名前 ──── 数」、中は 2 桁の字下げ。worktree グループは木の線と ⎇ とブランチ名（行の右）", () => {
    const { paint } = setup([...REPO, ws("solo")], {
      groups: [{ id: "g1", label: "仕事", collapsed: false }],
      layout: { top: ["g:g1", "u"], groups: { g1: ["r:r1", "w:solo"] }, ungrouped: [] },
      states: { "wt-a": "working" },
    });
    const { lines } = paint();
    // 見出しの状態は中の全部のまとめ（子の wt-a が working）。数は項目の数（worktree グループは 1 つ）。
    expect(lines.map(norm)).toEqual([
      "▾ ◐ 仕事 ─ 2",
      `▾ ${WORKTREE_GLYPH} main main`,
      `├ ◐ ${WORKTREE_GLYPH} wt-a feat-a`,
      `└ ${WORKTREE_GLYPH} wt-b feat-b`,
      "solo",
      "▾ グループなし ─ 0",
    ]);
    // 桁: 見出し 1、項目の頭（▾・├・└・通常の行の空き）は 3、名前は worktree の行 9・通常の行 7。
    expect(lines.map(col)).toEqual([1, 3, 3, 3, 7, 1]);
    expect(lines[1]!.indexOf("main")).toBe(9);
    // ブランチ名は行の右端（border の手前）に寄る。
    expect(lines[1]!.endsWith("main")).toBe(true);
    expect(lines[2]!.endsWith("feat-a")).toBe(true);
    // 横線は名前と数の間を埋め、数は右端。
    expect(lines[0]).toMatch(/^ ▾ ◐ 仕事 ─+ 2$/);
  });

  it("⎇ は幅 1（端末版の他の記号と同じ）。崩れる端末が出たら別の記号にする（decisions D34）", () => {
    expect(stringWidth(WORKTREE_GLYPH)).toBe(1);
  });

  it("グループなしの見出しはグループが 1 つ以上あるときだけ（フォルダの印は付けない）。無ければ項目が字下げなしで並ぶ", () => {
    const none = setup([...REPO, ws("solo")], {
      layout: { top: ["u"], groups: {}, ungrouped: ["r:r1", "w:solo"] },
    });
    expect(none.paint().lines.map(norm)).toEqual([
      `▾ ${WORKTREE_GLYPH} main main`,
      `├ ${WORKTREE_GLYPH} wt-a feat-a`,
      `└ ${WORKTREE_GLYPH} wt-b feat-b`,
      "solo",
    ]);
    expect(none.paint().lines.map(col)).toEqual([1, 1, 1, 5]);
    expect(none.paint().hits.some((h) => h.kind === "ungrouped")).toBe(false);
    const some = setup([ws("a"), ws("b")], {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout: { top: ["g:g1", "u"], groups: { g1: ["w:a"] }, ungrouped: ["w:b"] },
    });
    const { lines } = some.paint();
    expect(lines.map(norm)).toEqual(["▾ G ─ 1", "a", "▾ グループなし ─ 1", "b"]);
    // 中の項目は見出しより 2 桁下がる。
    expect(lines.map(col)).toEqual([1, 7, 1, 7]);
  });

  it("見出しの状態は広げていても畳んでいても中の全部のまとめ。「グループなし」も同じ決まり", () => {
    const all = [ws("a"), ws("b"), ws("c")];
    const layout: SidebarLayout = {
      top: ["g:g1", "u"],
      groups: { g1: ["w:a", "w:b"] },
      ungrouped: ["w:c"],
    };
    for (const collapsed of [false, true]) {
      const { paint } = setup(all, {
        groups: [{ id: "g1", label: "G", collapsed }],
        layout,
        states: {
          a: "idle",
          b: "blocked",
          c: { state: "idle", completionSeq: 1, serverSeenSeq: 0 },
        },
        focus: "c",
      });
      const lines = paint().lines.map(norm);
      // blocked（×）が idle（○）より優先。「グループなし」は done（✓）。
      expect(lines[0]).toBe("" + (collapsed ? "▸" : "▾") + " × G ─ 2");
      expect(lines.at(collapsed ? 1 : 3)).toBe("▾ ✓ グループなし ─ 1");
    }
  });

  it("畳んだグループの中は今いる workspace の行だけ。畳んだ worktree グループは先頭と今いる子だけ", () => {
    const all = [...REPO, ws("solo")];
    const layout: SidebarLayout = {
      top: ["g:g1", "u"],
      groups: { g1: ["r:r1", "w:solo"] },
      ungrouped: [],
    };
    const closed = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: true }],
      layout,
      focus: "wt-b",
    });
    // 畳んだグループ: 今いる子の行だけ（種類の行のまま。最後の子なので └）。
    expect(closed.paint().lines.map(norm)).toEqual([
      "▸ G ─ 2",
      `└ ${WORKTREE_GLYPH} wt-b feat-b`,
      "▾ グループなし ─ 0",
    ]);
    const open = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout,
      focus: "wt-b",
    });
    open.prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    expect(open.paint().lines.map(norm)).toEqual([
      "▾ G ─ 2",
      `▸ ${WORKTREE_GLYPH} main +1 main`,
      `└ ${WORKTREE_GLYPH} wt-b feat-b`,
      "solo",
      "▾ グループなし ─ 0",
    ]);
  });

  it("畳んだ worktree グループの先頭の行は、本体と worktree 全部の状態のまとめと、隠れている数 +n。広げていれば本体の状態", () => {
    const states = { main: "idle", "wt-a": "blocked", "wt-b": "working" } as const;
    const layout: SidebarLayout = { top: ["u"], groups: {}, ungrouped: ["r:r1"] };
    const closed = setup(REPO, { layout, states });
    closed.prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    // 先頭の行は × （blocked が最優先）。隠れているのは 2 つ。
    expect(closed.paint().lines.map(norm)).toEqual([`▸ × ${WORKTREE_GLYPH} main +2 main`]);
    // 今いる子は見えているので数えない。
    const onChild = setup(REPO, { layout, states, focus: "wt-a" });
    onChild.prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    expect(onChild.paint().lines.map(norm)[0]).toBe(`▸ × ${WORKTREE_GLYPH} main +1 main`);
    // 広げていれば、先頭の行は本体の状態（idle ○）だけ。
    const open = setup(REPO, { layout, states });
    expect(open.paint().lines.map(norm)[0]).toBe(`▾ ○ ${WORKTREE_GLYPH} main main`);
  });

  it("ブランチ名は、行の並びの 1 行目に git の項目があれば重ねない。通常の行（worktree でない行）には出さない", () => {
    const { prefs, paint } = setup([...REPO, ws("solo", { git: git("r9", false, "dev") })], {
      layout: { top: ["u"], groups: {}, ungrouped: ["r:r1", "r:r9"] },
    });
    expect(paint().lines.map(norm)[3]).toBe("solo");
    prefs.apply(
      {
        sidebarRows: {
          spaces: [[{ token: "state_icon" }, { token: "workspace" }, { token: "branch" }]],
        },
      },
      1,
    );
    const lines = paint().lines;
    // 設定の branch が出る行（ここは ブランチが無い／ある）に、右端の重ねは無い。
    // 設定の branch が名前の隣に出る行は、右端への重ねが無い（ブランチ名は 1 回だけ。右端に寄らない）。
    expect(lines.map(norm)).toEqual([
      `▾ ${WORKTREE_GLYPH} main main`,
      `├ ${WORKTREE_GLYPH} wt-a feat-a`,
      `└ ${WORKTREE_GLYPH} wt-b feat-b`,
      "solo dev",
    ]);
    expect(lines[1]!.length).toBeLessThan(25);
  });

  it("名前順は「グループなし」の中とグループどうしを並べ、グループの中はレイアウトの順のまま", () => {
    const all = [ws("zz"), ws("b-in"), ws("a-in"), ws("m")];
    const { prefs, paint } = setup(all, {
      groups: [{ id: "g1", label: "grp", collapsed: false }],
      layout: {
        top: ["g:g1", "u"],
        groups: { g1: ["w:b-in", "w:a-in"] },
        ungrouped: ["w:zz", "w:m"],
      },
    });
    prefs.apply({ workspaceSort: "name" }, 1);
    expect(paint().lines.map(norm)).toEqual([
      "▾ grp ─ 2",
      "b-in",
      "a-in",
      "▾ グループなし ─ 2",
      "m",
      "zz",
    ]);
  });

  it("当たり判定: 先頭の行（autoGroup）・グループ・「グループなし」の見出しは左の ▸/▾ の桁 toggleX を持つ", () => {
    const { paint } = setup([...REPO, ws("solo")], {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout: { top: ["g:g1", "u"], groups: { g1: ["r:r1"] }, ungrouped: ["w:solo"] },
    });
    const { hits } = paint();
    expect(hits.find((h) => h.kind === "group")).toMatchObject({
      groupId: "g1",
      toggleX: 1,
      y: 1,
    });
    // 先頭の行の ▾ は字下げの桁（グループの中は 3）。
    expect(hits.find((h) => h.kind === "autoGroup")).toMatchObject({
      repoKey: "r1",
      workspaceId: "main",
      toggleX: 3,
    });
    expect(hits.find((h) => h.kind === "ungrouped")).toMatchObject({ toggleX: 1 });
    // 子・通常の行は workspace の当たり。
    expect(
      hits
        .filter((h) => h.kind === "workspace")
        .map((h) => h.kind === "workspace" && h.workspaceId),
    ).toEqual(["wt-a", "wt-b", "solo"]);
  });

  it("行の並びが 2 行以上でも、2 行目は名前の桁から（worktree の行は 頭・状態・⎇ の 6、通常の行は 頭・状態の 4）", () => {
    const { prefs, paint } = setup([...REPO, ws("solo")], {
      layout: { top: ["u"], groups: {}, ungrouped: ["r:r1", "w:solo"] },
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
    // 先頭（main）: 1 行目は 1 + 「▾ ◐ ⎇ 」、2 行目は 1 + 6。通常の行（solo）の 2 行目は 1 + 4。
    expect(at("main", 1)).toBe(7);
    expect(at("solo", 1)).toBe(5);
  });

  it("layout の無い古いサーバは layoutFromLegacy で本体の所属に描く（子が別のグループでも 1 つの項目）", () => {
    const all = [
      ws("main", { git: git("r1", false), groupId: "g1" }),
      ws("wt-a", { git: git("r1", true), groupId: null }),
    ];
    const { paint } = setup(all, { groups: [{ id: "g1", label: "G", collapsed: false }] });
    expect(paint().lines.map(norm)).toEqual([
      "▾ G ─ 1",
      `▾ ${WORKTREE_GLYPH} main`,
      `└ ${WORKTREE_GLYPH} wt-a`,
      "▾ グループなし ─ 0",
    ]);
  });

  it("workspace の切り替え・番号・navigate の順（見えている行の順）は描画と同じ木から出る。「グループなし」を畳むと今いる行だけ", () => {
    const all = [...REPO, ws("solo")];
    const { model, prefs, paint } = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout: { top: ["u", "g:g1"], groups: { g1: ["r:r1"] }, ungrouped: ["w:solo"] },
    });
    const names = ["solo", "main", "wt-a", "wt-b"];
    const drawn = paint()
      .lines.map((l) => norm(l).split(" "))
      .map((p) => names.find((n) => p.includes(n)))
      .filter((n) => n !== undefined);
    expect(drawn).toEqual(currentVisibleWorkspaceIds(model, prefs));
    expect(currentVisibleWorkspaceIds(model, prefs)).toEqual(["solo", "main", "wt-a", "wt-b"]);
    // worktree グループを畳むと今いる workspace だけ。
    prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    expect(currentVisibleWorkspaceIds(model, prefs)).toEqual(["solo", "main"]);
    // 「グループなし」を畳むと、今いる行ではない solo は消える（描画も同じ）。
    prefs.apply({ collapsedAutoGroups: ["r1"], ungroupedCollapsed: true }, 2);
    expect(paint().lines.map(norm)).toEqual([
      "▸ グループなし ─ 1",
      "▾ G ─ 1",
      `▸ ${WORKTREE_GLYPH} main +2 main`,
    ]);
    expect(currentVisibleWorkspaceIds(model, prefs)).toEqual(["main"]);
  });
});
