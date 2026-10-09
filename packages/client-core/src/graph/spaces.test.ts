import { describe, expect, it } from "vitest";
import type { NodeKey, Tab, Workspace } from "@sodashitsu/protocol";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "./geometry.js";
import { FRAME_HEADING, FRAME_PADDING, overlaps, type LayoutStructure } from "./graphLayout.js";
import {
  deriveGraphSpaces,
  displayFrames,
  frameInfos,
  spaceOfMemberMap,
  spaceOfNodeMap,
  unionOfRects,
} from "./spaces.js";

const k = (id: string): NodeKey => `local:${id}`;

const structure: LayoutStructure = {
  spaces: [
    {
      id: "g:g1",
      tops: [
        { id: "w1", kind: "workspace", members: [{ id: "w1", nodes: [k("a"), k("b")] }] },
        {
          id: "r:/repo",
          kind: "worktree",
          members: [
            { id: "w2", nodes: [k("c")] },
            { id: "w3", nodes: [k("d")] },
          ],
        },
      ],
    },
    {
      id: "u",
      tops: [
        { id: "w4", kind: "workspace", members: [{ id: "w4", nodes: [] }] },
        { id: "m:abc", kind: "machine", members: [{ id: "m:abc", nodes: ["abc:p1" as NodeKey] }] },
      ],
    },
  ],
};

describe("deriveGraphSpaces", () => {
  it("グループの名前・囲いの数・ノードを、構成の並びの順に出す。「グループなし」は名前が決まっている", () => {
    const spaces = deriveGraphSpaces(structure, (id) => (id === "g1" ? "開発" : undefined));
    expect(spaces.map((s) => [s.id, s.label, s.count])).toEqual([
      ["g:g1", "開発", 3],
      ["u", "グループなし", 2],
    ]);
    expect(spaces[0]!.workspaceIds).toEqual(["w1", "w2", "w3"]);
    expect(spaces[1]!.workspaceIds).toEqual(["w4"]); // 別のマシンの囲いは workspace ではない
    expect(spaces[1]!.nodeKeys).toEqual(["abc:p1"]);
  });

  it("名前の分からないグループは id で出す", () => {
    expect(deriveGraphSpaces(structure, () => undefined)[0]!.label).toBe("g1");
  });
});

describe("spaceOf*", () => {
  it("ノード・メンバーから空間を引ける", () => {
    const n = spaceOfNodeMap(structure);
    expect(n.get(k("c"))).toBe("g:g1");
    expect(n.get("abc:p1")).toBe("u");
    const m = spaceOfMemberMap(structure);
    expect(m.get("w3")).toBe("g:g1");
    expect(m.get("w4")).toBe("u");
  });
});

describe("frameInfos", () => {
  const workspaces = [
    { id: "w1", label: "alpha", cwd: "/home/x/alpha/", tabIds: ["t1", "t2"], activeTabId: "t2", git: { branch: "main" } },
    { id: "w2", label: "beta", cwd: "/home/x/beta", tabIds: ["t3"], activeTabId: "t3", git: { branch: "feat" } },
    { id: "w3", label: "beta-wt", cwd: "/home/x/beta-wt", tabIds: [], activeTabId: "", git: null },
    { id: "w4", label: "solo", cwd: "/", tabIds: [], activeTabId: "", git: null },
  ] as unknown as Workspace[];
  const tabs = [
    { id: "t1", label: "one" },
    { id: "t2", label: "two" },
    { id: "t3", label: "three" },
  ] as unknown as Tab[];
  const infos = frameInfos(structure, { workspaces, tabs }, (id) => `M-${id}`);

  it("workspace: 名前・フォルダ・ブランチ・tab の並び（選ばれている tab を示す）", () => {
    const i = infos.get("w1")!;
    expect([i.title, i.folder, i.branch]).toEqual(["alpha", "alpha", "main"]);
    expect(i.tabs).toEqual([
      { id: "t1", label: "one", active: false },
      { id: "t2", label: "two", active: true },
    ]);
    expect(i.spaceId).toBe("g:g1");
  });

  it("worktree グループ: 名前は先頭の workspace・worktree の数・中のメンバー。メンバーの囲いは親を持つ", () => {
    const g = infos.get("r:/repo")!;
    expect([g.kind, g.title, g.worktreeCount, g.memberIds]).toEqual(["worktree", "beta", 2, ["w2", "w3"]]);
    expect(infos.get("w3")!.parentId).toBe("r:/repo");
    expect(infos.get("w3")!.branch).toBeNull();
  });

  it("別のマシンの囲い・ルートのフォルダ", () => {
    expect(infos.get("m:abc")!.title).toBe("M-abc");
    expect(infos.get("w4")!.folder).toBe("/");
  });
});

describe("displayFrames", () => {
  const positions = new Map([
    [k("a"), { x: 20, y: 40 }],
    [k("b"), { x: 260, y: 40 }],
    [k("c"), { x: 800, y: 40 }],
    [k("d"), { x: 1100, y: 40 }],
    ["abc:p1", { x: 20, y: 600 }],
  ]);

  it("空間の囲いだけを出す。ノードの無い workspace は、見出しだけの仮の囲い", () => {
    const g1 = displayFrames(structure, positions, "g:g1");
    expect(g1.map((f) => f.id).sort()).toEqual(["r:/repo", "w1", "w2", "w3"]);
    expect(g1.every((f) => !f.placeholder)).toBe(true);
    const u = displayFrames(structure, positions, "u");
    expect(u.map((f) => [f.id, f.placeholder]).sort()).toEqual([
      ["m:abc", false],
      ["w4", true],
    ]);
  });

  it("仮の囲いは、ほかの囲いと重ならない", () => {
    const u = displayFrames(structure, positions, "u");
    const [a, b] = u;
    expect(overlaps(a!.rect, b!.rect)).toBe(0);
  });

  it("囲いは、ノードの外接に余白（見出し・周り）を足したもの", () => {
    const w1 = displayFrames(structure, positions, "g:g1").find((f) => f.id === "w1")!;
    expect(w1.rect.x).toBe(20 - FRAME_PADDING);
    expect(w1.rect.y).toBe(40 - FRAME_HEADING);
    expect(w1.rect.h).toBe(FRAME_HEADING + GRAPH_NODE_HEIGHT + FRAME_PADDING);
    expect(w1.rect.w).toBeGreaterThanOrEqual(260 + GRAPH_NODE_WIDTH - 20 + FRAME_PADDING * 2);
  });

  it("無い空間は空", () => {
    expect(displayFrames(structure, positions, "g:none")).toEqual([]);
  });
});

describe("unionOfRects", () => {
  it("外接を返す。空なら null", () => {
    expect(unionOfRects([])).toBeNull();
    expect(unionOfRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 30, h: 15 });
  });
});
