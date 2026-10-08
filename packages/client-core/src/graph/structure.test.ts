import type {
  GitInfo,
  LayoutNode,
  Pane,
  Tab,
  Workspace,
  WorkspaceGroup,
} from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { graphStructureFrom, localNodeKeys, machineMemberId } from "./structure.js";

// 20261008-graph-first の T3：空間の構成を、セッションの状態から導く。

function git(repoKey: string, linked: boolean, worktreeKey: string): GitInfo {
  return { branch: "main", ahead: 0, behind: 0, repoKey, isLinkedWorktree: linked, worktreeKey };
}

interface World {
  workspaces: Workspace[];
  tabs: Tab[];
  panes: Pane[];
  groups: WorkspaceGroup[];
}

/** workspace を作る。`tabs` は tab ごとの pane の id の並び（1 つなら 1 pane、複数なら右へ分割した並び）。 */
function world(): {
  w: World;
  add(id: string, tabs: string[][], over?: Partial<Workspace>): void;
} {
  const w: World = { workspaces: [], tabs: [], panes: [], groups: [] };
  return {
    w,
    add(id, tabs, over = {}) {
      const tabIds: string[] = [];
      tabs.forEach((paneIds, i) => {
        const tabId = `${id}t${i}`;
        tabIds.push(tabId);
        let layout: LayoutNode = { type: "pane", paneId: paneIds[0]! };
        paneIds.slice(1).forEach((p, j) => {
          layout = {
            type: "split",
            id: `${tabId}s${j}`,
            dir: "right",
            ratio: 0.5,
            a: layout,
            b: { type: "pane", paneId: p },
          };
        });
        w.tabs.push({
          id: tabId,
          workspaceId: id,
          label: tabId,
          layout,
          focusedPaneId: paneIds[0]!,
          zoomedPaneId: null,
          sizeOwnerClientId: null,
        });
        for (const p of paneIds) {
          w.panes.push({
            id: p,
            tabId,
            label: null,
            cwd: "/",
            shell: "sh",
            cols: 80,
            rows: 24,
            status: "running",
            failure: null,
            busy: false,
            title: "",
            rightClick: "herdr",
            agent: null,
            agentSession: null,
          });
        }
      });
      w.workspaces.push({
        id,
        label: id,
        cwd: `/${id}`,
        tabIds,
        activeTabId: tabIds[0]!,
        groupId: null,
        git: null,
        autoLabel: false,
        ...over,
      });
    },
  };
}

const L = (id: string) => `local:${id}`;

describe("graphStructureFrom", () => {
  it("workspace ごとに、tab の順・分割の並びの順の pane をノードの鍵にする", () => {
    const { w, add } = world();
    add("w1", [["p1", "p2"], ["p3"]]);
    const st = graphStructureFrom(w);
    expect(st.spaces).toHaveLength(1);
    expect(st.spaces[0]!.id).toBe("u");
    const top = st.spaces[0]!.tops[0]!;
    expect(top).toMatchObject({ id: "w1", kind: "workspace" });
    expect(top.members[0]!.nodes).toEqual([L("p1"), L("p2"), L("p3")]);
  });

  it("一時的な pane（独自コマンドの pane・スクロールバックのエディタ）は含めない（否定の対照: 通常の pane は含める）", () => {
    const { w, add } = world();
    add("w1", [["p1", "p2", "p3"]]);
    const st = graphStructureFrom(w, { isTransient: (id) => id === "p2" || id === "p3" });
    expect(localNodeKeys(st)).toEqual([L("p1")]);
    expect(localNodeKeys(graphStructureFrom(w))).toEqual([L("p1"), L("p2"), L("p3")]);
  });

  it("グループごとに空間ができ、グループの外は u。順はサイドバーと同じ", () => {
    const { w, add } = world();
    w.groups.push({ id: "g1", label: "G1", collapsed: false });
    add("w1", [["p1"]], { groupId: "g1" });
    add("w2", [["p2"]]);
    const st = graphStructureFrom(w);
    expect(st.spaces.map((s) => s.id)).toEqual(["g:g1", "u"]);
    expect(st.spaces[0]!.tops.map((t) => t.id)).toEqual(["w1"]);
    expect(st.spaces[1]!.tops.map((t) => t.id)).toEqual(["w2"]);
  });

  it("同じ worktree の複数の代表（リポジトリの項目）は worktree グループの囲いに、代表でない workspace は単独の項目になる", () => {
    const { w, add } = world();
    add("w1", [["p1"]], { git: git("/r", false, "/r"), representative: true });
    add("w2", [["p2"]], { git: git("/r", true, "/r/worktrees/a"), representative: true });
    // 同じフォルダ（worktreeKey）の 2 つ目: 代表ではない → 単独の項目
    add("w3", [["p3"]], { git: git("/r", true, "/r/worktrees/a"), representative: false });
    const st = graphStructureFrom(w);
    const tops = st.spaces[0]!.tops;
    expect(tops.map((t) => [t.id, t.kind, t.members.map((m) => m.id)])).toEqual([
      ["r:/r", "worktree", ["w1", "w2"]],
      ["w3", "workspace", ["w3"]],
    ]);
  });

  it("worktree が 1 つだけのリポジトリは、通常の workspace の囲い", () => {
    const { w, add } = world();
    add("w1", [["p1"]], { git: git("/r", false, "/r"), representative: true });
    const top = graphStructureFrom(w).spaces[0]!.tops[0]!;
    expect(top).toMatchObject({ id: "w1", kind: "workspace" });
  });

  it("worktree グループは、グループの所属を引き継ぐ（実効の groupId）", () => {
    const { w, add } = world();
    w.groups.push({ id: "g1", label: "G1", collapsed: false });
    add("w1", [["p1"]], { git: git("/r", false, "/r"), representative: true, groupId: "g1" });
    add("w2", [["p2"]], { git: git("/r", true, "/r/wt"), representative: true, groupId: "g1" });
    const st = graphStructureFrom(w);
    expect(st.spaces.find((s) => s.id === "g:g1")!.tops.map((t) => t.id)).toEqual(["r:/r"]);
    expect(st.spaces.find((s) => s.id === "u")!.tops).toEqual([]);
  });

  it("別のマシンのノードは、マシンごとの囲いにして「グループなし」の末尾へ（手元の鍵は無視）", () => {
    const { w, add } = world();
    add("w1", [["p1"]]);
    const m1 = "a".repeat(32);
    const m2 = "b".repeat(32);
    const st = graphStructureFrom(w, {
      remoteKeys: [`${m1}:x1`, `${m2}:y1`, `${m1}:x2`, "local:ignored"],
    });
    const u = st.spaces.find((s) => s.id === "u")!;
    expect(u.tops.map((t) => [t.id, t.kind])).toEqual([
      ["w1", "workspace"],
      [machineMemberId(m1), "machine"],
      [machineMemberId(m2), "machine"],
    ]);
    expect(u.tops[1]!.members[0]!.nodes).toEqual([`${m1}:x1`, `${m1}:x2`]);
    // 手元の鍵には別のマシンの鍵は入らない。
    expect(localNodeKeys(st)).toEqual([L("p1")]);
  });

  it("workspace が無くても、別のマシンのノードだけの「グループなし」の空間ができる", () => {
    const m1 = "a".repeat(32);
    const st = graphStructureFrom(
      { workspaces: [], tabs: [], panes: [], groups: [] },
      { remoteKeys: [`${m1}:x1`] },
    );
    expect(st.spaces.map((s) => s.id)).toContain("u");
    expect(st.spaces.find((s) => s.id === "u")!.tops).toHaveLength(1);
  });
});
