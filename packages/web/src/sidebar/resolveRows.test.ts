import type { AgentInfo, GitInfo, Pane, Tab, Workspace } from "@wtm/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUTS, type RowLayout } from "./rowLayout.js";
import {
  customTokenValue,
  resolveAgentLines,
  resolveSpaceLines,
  tokenStyleAttr,
  UNVERIFIED_TEXT,
} from "./resolveRows.js";

/** 20260927-sidebar-row-tokens の AC12・AC13・AC14（値の有無・行の消え方・代わりの行・条件・見た目）。 */

function git(overrides: Partial<GitInfo> = {}): GitInfo {
  return {
    branch: "main",
    ahead: 0,
    behind: 0,
    repoKey: null,
    isLinkedWorktree: false,
    ...overrides,
  };
}
function ws(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "w1",
    label: "proj",
    cwd: "/",
    tabIds: ["t1"],
    activeTabId: "t1",
    groupId: null,
    git: null,
    autoLabel: false,
    ...overrides,
  };
}
function tab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "t1",
    workspaceId: "w1",
    label: "main-tab",
    layout: { type: "pane", paneId: "p1" },
    focusedPaneId: "p1",
    zoomedPaneId: null,
    sizeOwnerClientId: null,
    ...overrides,
  };
}
function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "working",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    ...overrides,
  };
}
function pane(overrides: Partial<Pane> = {}): Pane {
  return {
    id: "p1",
    tabId: "t1",
    label: null,
    cwd: "/",
    shell: "/bin/bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "herdr",
    agent: null,
    agentSession: null,
    ...overrides,
  };
}
const L = (...rows: string[][]): RowLayout => rows.map((r) => r.map((token) => ({ token })));

/** 行ごとのトークンの要約（種類・文字）。 */
function summary(lines: ReturnType<typeof resolveSpaceLines>): string[][] {
  return lines.map((line) =>
    line.map((t) =>
      t.kind === "text"
        ? `${t.token}:${t.text}`
        : t.kind === "git"
          ? `git:${t.branch}|${t.counts}`
          : t.kind === "git_status"
            ? `git_status:${t.counts}`
            : t.kind,
    ),
  );
}

describe("resolveSpaceLines（spaces）", () => {
  it("既定の並び: ずれていなければ 1 行、ずれていれば 2 行目にブランチと ↑↓（今の描画と同じ条件）", () => {
    expect(
      summary(
        resolveSpaceLines(DEFAULT_LAYOUTS.spaces, { workspace: ws({ git: git() }), state: null }),
      ),
    ).toEqual([["state_icon", "workspace:proj"]]);
    expect(
      summary(
        resolveSpaceLines(DEFAULT_LAYOUTS.spaces, {
          workspace: ws({ git: git({ ahead: 2, behind: 1 }) }),
          state: "idle",
        }),
      ),
    ).toEqual([["state_icon", "workspace:proj"], ["git:main|↑2 ↓1"]]);
    expect(
      summary(
        resolveSpaceLines(DEFAULT_LAYOUTS.spaces, {
          workspace: ws({ git: git({ branch: null, behind: 3 }) }),
          state: null,
        }),
      )[1],
    ).toEqual(["git:null|↑0 ↓3"]);
    expect(
      summary(resolveSpaceLines(DEFAULT_LAYOUTS.spaces, { workspace: ws(), state: null })),
    ).toEqual([["state_icon", "workspace:proj"]]);
  });

  it("branch はブランチがあれば常に、git_status はずれているときだけ（herdr と同じ）", () => {
    const layout = L(["branch", "git_status"]);
    expect(
      summary(resolveSpaceLines(layout, { workspace: ws({ git: git() }), state: null })),
    ).toEqual([["branch:main"]]);
    expect(
      summary(
        resolveSpaceLines(layout, { workspace: ws({ git: git({ ahead: 1 }) }), state: null }),
      ),
    ).toEqual([["branch:main", "git_status:↑1 ↓0"]]);
  });

  it("branch はブランチが無い（detached・git の外）と消え、git_status・git は git の外で消える", () => {
    const layout = L(["branch", "git_status", "git", "workspace"]);
    expect(
      summary(
        resolveSpaceLines(layout, {
          workspace: ws({ git: git({ branch: null, ahead: 1 }) }),
          state: null,
        }),
      ),
    ).toEqual([["git_status:↑1 ↓0", "git:null|↑1 ↓0", "workspace:proj"]]);
    expect(
      summary(resolveSpaceLines(layout, { workspace: ws({ git: null }), state: null })),
    ).toEqual([["workspace:proj"]]);
  });

  it("state_text はエージェントが居るときの状態の語", () => {
    const layout = L(["workspace", "state_text"]);
    expect(summary(resolveSpaceLines(layout, { workspace: ws(), state: "blocked" }))).toEqual([
      ["workspace:proj", "state_text:入力待ち"],
    ]);
    expect(summary(resolveSpaceLines(layout, { workspace: ws(), state: null }))).toEqual([
      ["workspace:proj"],
    ]);
  });

  it("$名前 は workspace の独自トークン。無い値は消え、トークンの無くなった行も消える", () => {
    const layout = L(["workspace"], ["$build", "$missing"], ["$missing"]);
    expect(
      summary(
        resolveSpaceLines(layout, { workspace: ws({ tokens: { build: "green" } }), state: null }),
      ),
    ).toEqual([["workspace:proj"], ["$build:green"]]);
  });

  it("行が 1 つも残らなければ、状態の印と workspace 名の代わりの行（見た目なし）", () => {
    const layout: RowLayout = [
      [{ token: "$missing" }],
      [{ token: "workspace", fg: "#f00", rules: [{ when: "equals", value: "proj", hide: true }] }],
    ];
    const lines = resolveSpaceLines(layout, { workspace: ws(), state: null });
    expect(summary(lines)).toEqual([["state_icon", "workspace:proj"]]);
    expect(lines[0]!.every((t) => Object.keys(t.style).length === 0)).toBe(true);
    expect(summary(resolveSpaceLines([], { workspace: ws(), state: null }))).toEqual([
      ["state_icon", "workspace:proj"],
    ]);
  });

  it("見た目と条件: 条件は切り詰める前の値全体で比べ、当たった項目だけ重ねる。固定の見た目のトークンには条件を当てない", () => {
    const layout: RowLayout = [
      [
        {
          token: "$load",
          fg: "#fff",
          rules: [
            { when: "gt", value: 80, fg: "#f55", bold: true },
            { when: "gt", value: 50, fg: "#fc0" },
          ],
        },
        { token: "git_status", fg: "#0f0", dim: true },
      ],
    ];
    const at = (load: string) =>
      resolveSpaceLines(layout, {
        workspace: ws({ tokens: { load }, git: git({ ahead: 1 }) }),
        state: null,
      })[0]!;
    expect(at("90")[0]!.style).toEqual({ fg: "#f55", bold: true });
    expect(at("60")[0]!.style).toEqual({ fg: "#fc0" });
    expect(at("90%")[0]!.style).toEqual({ fg: "#fff" });
    expect(at("90")[1]).toEqual({
      kind: "git_status",
      counts: "↑1 ↓0",
      style: { fg: "#0f0", dim: true },
    });
  });
});

describe("resolveAgentLines（agents）", () => {
  const ctx = (
    o: {
      pane?: Partial<Pane>;
      agent?: Partial<AgentInfo>;
      tab?: Tab | undefined;
      workspace?: Workspace | undefined;
    } = {},
  ) => ({
    pane: pane(o.pane),
    tab: "tab" in o ? o.tab : tab(),
    workspace: "workspace" in o ? o.workspace : ws(),
    agent: agent(o.agent),
    state: "working" as const,
  });

  it("既定の並び: 1 行目は状態・workspace・tab、2 行目は付けた名前・表示名・未検証（今の描画と同じ）", () => {
    expect(summary(resolveAgentLines(DEFAULT_LAYOUTS.agents, ctx()))).toEqual([
      ["state_icon", "workspace:proj", "tab:main-tab"],
      ["agent:Claude Code"],
    ]);
    expect(
      summary(
        resolveAgentLines(
          DEFAULT_LAYOUTS.agents,
          ctx({ agent: { name: "reviewer", verified: false } }),
        ),
      )[1],
    ).toEqual(["name:reviewer", "agent:Claude Code", `unverified:${UNVERIFIED_TEXT}`]);
  });

  it("workspace・tab は常に（無ければ空文字。今の描画と同じ）、pane・terminal_title は空でないとき", () => {
    const layout = L(["workspace", "tab", "pane", "terminal_title", "state_text"]);
    expect(
      summary(resolveAgentLines(layout, ctx({ workspace: undefined, tab: undefined }))),
    ).toEqual([["workspace:", "tab:", "state_text:作業中"]]);
    expect(
      summary(resolveAgentLines(layout, ctx({ pane: { label: "p-name", title: "vim x" } }))),
    ).toEqual([
      [
        "workspace:proj",
        "tab:main-tab",
        "pane:p-name",
        "terminal_title:vim x",
        "state_text:作業中",
      ],
    ]);
    expect(
      summary(resolveAgentLines(layout, ctx({ pane: { label: "", title: "" } }))).at(0),
    ).toEqual(["workspace:proj", "tab:main-tab", "state_text:作業中"]);
  });

  it("$名前 は pane の独自トークン（workspace の値は読まない）", () => {
    const layout = L(["$summary"]);
    expect(
      summary(resolveAgentLines(layout, ctx({ pane: { tokens: { summary: "reviewing" } } }))),
    ).toEqual([["$summary:reviewing"]]);
    const fallback = resolveAgentLines(layout, {
      ...ctx(),
      workspace: ws({ tokens: { summary: "ws" } }),
    });
    expect(summary(fallback)).toEqual([["state_icon", "workspace:proj", "tab:main-tab"]]); // 代わりの行
  });

  it("条件の hide で消えたトークン", () => {
    const layout: RowLayout = [
      [
        {
          token: "agent",
          rules: [{ when: "starts_with", value: "claude", ignoreCase: true, hide: true }],
        },
        { token: "tab" },
      ],
    ];
    expect(summary(resolveAgentLines(layout, ctx()))).toEqual([["tab:main-tab"]]);
  });
});

describe("customTokenValue（AC9）", () => {
  it("自前の持ち物だけを引く（constructor・toString・__proto__ の名前でプロトタイプの値を返さない）", () => {
    const tokens = JSON.parse('{"__proto__":"x","a":"1"}') as Record<string, string>;
    expect(customTokenValue(tokens, "$a")).toBe("1");
    expect(customTokenValue(tokens, "$__proto__")).toBe("x");
    expect(customTokenValue({ a: "1" }, "$constructor")).toBeUndefined();
    expect(customTokenValue({ a: "1" }, "$toString")).toBeUndefined();
    expect(customTokenValue({ a: "1" }, "$__proto__")).toBeUndefined();
    expect(customTokenValue(undefined, "$a")).toBeUndefined();
    expect(customTokenValue({ a: "1" }, "a")).toBeUndefined();
  });

  it("プロトタイプから受け継いだ文字の値も引かない（プロトタイプ汚染への守り。負の確認で見つけた穴）", () => {
    const inherited = Object.create({ a: "inherited" }) as Record<string, string>;
    expect(customTokenValue(inherited, "$a")).toBeUndefined();
  });

  it("文字でない値は無いものとして扱う", () => {
    expect(customTokenValue({ a: 3 } as unknown as Record<string, string>, "$a")).toBeUndefined();
  });
});

describe("tokenStyleAttr（AC9・AC13）", () => {
  it("見た目が無ければ undefined（style 属性を付けない）", () => {
    expect(tokenStyleAttr({})).toBeUndefined();
  });

  it("色・太字・薄字（切は既定を外す）", () => {
    expect(tokenStyleAttr({ fg: "#abc", bold: true, dim: true })).toEqual({
      color: "#abc",
      "font-weight": "bold",
      opacity: "0.75",
    });
    expect(tokenStyleAttr({ bold: false, dim: false })).toEqual({
      "font-weight": "normal",
      opacity: "1",
    });
  });

  it("色として正しくない値は入れない（二重の守り）", () => {
    expect(tokenStyleAttr({ fg: "red;background:url(x)" })).toBeUndefined();
  });
});
