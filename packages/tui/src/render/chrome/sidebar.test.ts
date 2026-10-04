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
    /** navigate モードで選んでいる行のキー（workspace の id・`group:<id>`・`ungrouped:`）。 */
    navigateSelection?: string | null;
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
    ...(opts.navigateSelection !== undefined ? { navigateSelection: opts.navigateSelection } : {}),
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
    return { lines, hits: hits as SidebarHit[], grid };
  };
  return { model, prefs, paint, ctx };
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

describe("サイドバー：木の線の最後と navigate の見出しの選択（T17）", () => {
  const all = [...REPO, ws("solo")];
  const layout: SidebarLayout = {
    top: ["g:g1", "u"],
    groups: { g1: ["r:r1", "w:solo"] },
    ungrouped: [],
  };

  it("畳んだまとまりで今いる子が途中の子のとき、木の線の最後は「見えている子の最後」で決まる（└。├ にしない）", () => {
    // 子は wt-a・wt-b の 2 つ。今いるのは途中の wt-a。畳んだグループでも、畳んだ worktree グループでも、見えている子は wt-a だけなので └。
    const closed = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: true }],
      layout,
      focus: "wt-a",
    });
    expect(closed.paint().lines.map(norm)).toEqual([
      "▸ G ─ 2",
      `└ ${WORKTREE_GLYPH} wt-a feat-a`,
      "▾ グループなし ─ 0",
    ]);
    const open = setup(all, {
      groups: [{ id: "g1", label: "G", collapsed: false }],
      layout,
      focus: "wt-a",
    });
    open.prefs.apply({ collapsedAutoGroups: ["r1"] }, 1);
    expect(open.paint().lines.map(norm)).toEqual([
      "▾ G ─ 2",
      `▸ ${WORKTREE_GLYPH} main +1 main`,
      `└ ${WORKTREE_GLYPH} wt-a feat-a`,
      "solo",
      "▾ グループなし ─ 0",
    ]);
  });

  /** 行 y の左端の背景色（navigate で選んでいる行はアクセントの色）。 */
  const bgAt = (grid: Grid, y: number) => grid.cell(5, y).bg;

  it("navigate でグループの見出し・「グループなし」の見出しを選ぶと、その行だけアクセントの色になる", () => {
    for (const [key, row] of [
      ["group:g1", 1],
      ["ungrouped:", 6],
    ] as const) {
      const { paint } = setup(all, {
        groups: [{ id: "g1", label: "G", collapsed: false }],
        layout,
        navigateSelection: key,
      });
      const { grid } = paint();
      const plain = setup(all, {
        groups: [{ id: "g1", label: "G", collapsed: false }],
        layout,
      }).paint().grid;
      expect(bgAt(grid, row)).not.toBe(bgAt(plain, row));
      // 隣の行は変わらない。
      expect(bgAt(grid, row + 1)).toBe(bgAt(plain, row + 1));
    }
  });

  it("区画の外へ出ているグループ・「グループなし」の見出しを選ぶと、そこまで動かす（reveal）", () => {
    const many = Array.from({ length: 10 }, (_, i) => ws(`n${i}`));
    const refs = many.map((w) => `w:${w.id}` as const);
    // 見出しが下にあり、上のまとまりの 10 行で区画（高さ 8）の外へ出ている。
    for (const [key, kind, layout] of [
      ["ungrouped:", "ungrouped", { top: ["g:g1", "u"], groups: { g1: refs }, ungrouped: [] }],
      ["group:g1", "group", { top: ["u", "g:g1"], groups: { g1: [] }, ungrouped: refs }],
    ] as const) {
      const s = setup(many, {
        groups: [{ id: "g1", label: "G", collapsed: false }],
        layout: {
          top: [...layout.top],
          groups: { g1: [...layout.groups.g1] },
          ungrouped: [...layout.ungrouped],
        },
        navigateSelection: key,
      });
      const hitsOf = (reveal: boolean) => {
        s.ctx.sidebarScroll = {
          spaces: 0,
          agents: 0,
          reveal: reveal ? { workspaceId: key } : null,
        };
        return paintSidebar(new Grid(40, 8), { x: 0, y: 0, w: 40, h: 8 }, s.ctx) as SidebarHit[];
      };
      expect(hitsOf(false).some((h) => h.kind === kind)).toBe(false); // 動かさなければ見えない
      expect(hitsOf(true).some((h) => h.kind === kind)).toBe(true);
    }
  });
});

// 20261004-ui-interaction-polish（区画の折りたたみ。高さの 4 通り・見出しと区切りの行・当たり）。
describe("サイドバーの区画の折りたたみ", () => {
  const H = 24;
  function build(collapsed: { spaces?: true; agents?: true }, opts: { agents?: boolean; blocked?: boolean; w?: number } = {}) {
    const list = [ws("a"), ws("b"), ws("c")];
    const states: Record<string, AgentInfo["state"]> =
      opts.agents === false ? {} : { a: opts.blocked ? "blocked" : "working", b: "idle" };
    const s = setup(list, { states });
    s.prefs.setLocal({ sidebarSectionsCollapsed: collapsed });
    const w = opts.w ?? 40;
    const grid = new Grid(w, H);
    const hits = paintSidebar(grid, { x: 0, y: 0, w, h: H }, s.ctx) as SidebarHit[];
    const text = (y: number) => {
      let t = "";
      for (let x = 0; x < w - 1; x++) t += grid.cell(x, y).ch;
      return t.trimEnd();
    };
    const divY = hits.find((h) => h.kind === "sectionDivider")?.y ?? -1;
    const agentsH = hits.filter((h) => h.section === "agents" && h.kind !== "sectionDivider" && h.kind !== "sort").length;
    const spacesH = hits.filter((h) => h.section === "spaces" && h.kind !== "sort" && h.kind !== "sectionHeader").length;
    return { hits, text, divY, agentsH, spacesH };
  }

  it("両方開いている: 見出しは「▾ Spaces」・区切りは「▾ Agents」（今の高さのまま）", () => {
    const r = build({});
    expect(r.text(0)).toMatch(/^ ▾ Spaces/);
    expect(r.text(r.divY)).toMatch(/^─ ▾ Agents/);
    expect(r.spacesH + r.agentsH + 3).toBe(H);
  });

  it("spaces を畳む: 見出しは「▸ Spaces 3」・spaces は 0 行・区切りは見出しのすぐ下・agents が残りを使う（並び順は出ない）", () => {
    const r = build({ spaces: true });
    expect(r.text(0)).toMatch(/^ ▸ Spaces 3/);
    expect(r.text(0)).not.toContain("開いた順");
    expect(r.divY).toBe(1);
    expect(r.spacesH).toBe(0);
    expect(r.agentsH).toBe(H - 3);
  });

  it("agents を畳む: 区切りはいちばん下（「«」の上）・agents は 0 行・spaces が残りを使う。「▸ Agents 2」と並び順なし", () => {
    const r = build({ agents: true });
    expect(r.divY).toBe(H - 2);
    expect(r.text(r.divY)).toMatch(/^─ ▸ Agents 2/);
    expect(r.text(r.divY)).not.toContain("優先度順");
    expect(r.text(r.divY)).not.toContain("グループ順");
    expect(r.agentsH).toBe(0);
    expect(r.spacesH).toBe(H - 3);
  });

  it("両方畳む: どちらも 0 行・区切りは見出しのすぐ下", () => {
    const r = build({ spaces: true, agents: true });
    expect(r.spacesH).toBe(0);
    expect(r.agentsH).toBe(0);
    expect(r.divY).toBe(1);
  });

  it("畳んだ agents の見出しに、入力待ち（blocked）があるときだけ状態の字形が付く", () => {
    const plain = build({ agents: true });
    const blocked = build({ agents: true }, { blocked: true });
    expect(plain.text(plain.divY)).toMatch(/Agents 2\s*$|Agents 2 ─/);
    expect(blocked.text(blocked.divY)).toMatch(/Agents 2 \S/);
    expect(blocked.text(blocked.divY)).not.toBe(plain.text(plain.divY));
  });

  it("agents が 0 件: 区切りの行は今までどおり出ない。agents の折りたたみは効かず、spaces の折りたたみは見出しだけにする", () => {
    const open = build({ agents: true }, { agents: false });
    expect(open.divY).toBe(-1);
    expect(open.spacesH).toBe(H - 2);
    const folded = build({ spaces: true }, { agents: false });
    expect(folded.spacesH).toBe(0);
    expect(folded.text(0)).toMatch(/^ ▸ Spaces 3/);
  });

  it("spaces の見出しの行に sectionHeader の当たり（「＋」・並び順より前）", () => {
    const r = build({});
    const row = r.hits.filter((h) => h.y === 0).map((h) => h.kind);
    expect(row).toEqual(["sectionHeader", "newWorkspace", "sort"]);
  });

  it("「＋」は題に重ならない幅（inner 12 以上）でだけ出る", () => {
    for (const w of [11, 12]) {
      const r = build({}, { w });
      expect(r.text(0).startsWith(" ▾ Spaces")).toBe(true);
      expect(r.hits.some((h) => h.kind === "newWorkspace")).toBe(false);
    }
    expect(build({}, { w: 13 }).hits.some((h) => h.kind === "newWorkspace")).toBe(true);
  });

  it("区切りの行: 狭い幅では畳んでいても印と題だけ（件数・字形は出さない）", () => {
    const r = build({ agents: true }, { blocked: true, w: 16 });
    expect(r.text(r.divY)).toMatch(/^─ ▸ Agents/);
    expect(r.text(r.divY)).not.toMatch(/Agents 2/);
  });

  it("狭い幅では、畳んでいても印と題だけ（件数は出さない）", () => {
    const r = build({ spaces: true }, { w: 13 });
    expect(r.text(0)).toMatch(/^ ▸ Spaces\s+\+$/);
  });
});
