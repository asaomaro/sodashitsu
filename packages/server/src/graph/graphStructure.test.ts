import { describe, expect, it } from "vitest";
import { localNodeKeys } from "@sodashitsu/client-core";
import { graphStructure, type GraphStructureSession } from "./graphStructure.js";

// 20261008-graph-first の T3：サーバの graphStructure（一時的な pane の除外と、別のマシンのノードの囲い）。
function session(transient: string[]): GraphStructureSession {
  return {
    snapshot: () => ({
      workspaces: [
        {
          id: "w1",
          label: "w1",
          cwd: "/",
          tabIds: ["t1"],
          activeTabId: "t1",
          groupId: null,
          git: null,
          autoLabel: false,
        },
      ],
      tabs: [
        {
          id: "t1",
          workspaceId: "w1",
          label: "t",
          layout: {
            type: "split",
            id: "s1",
            dir: "right",
            ratio: 0.5,
            a: { type: "pane", paneId: "p1" },
            b: { type: "pane", paneId: "p2" },
          },
          focusedPaneId: "p1",
          zoomedPaneId: null,
          sizeOwnerClientId: null,
        },
      ],
      panes: ["p1", "p2"].map((id) => ({
        id,
        tabId: "t1",
        label: null,
        cwd: "/",
        shell: "sh",
        cols: 80,
        rows: 24,
        status: "running" as const,
        failure: null,
        busy: false,
        title: "",
        rightClick: "herdr" as const,
        agent: null,
        agentSession: null,
      })),
      groups: [],
    }),
    isTransientPane: (id) => transient.includes(id),
  };
}

describe("graphStructure", () => {
  it("一時的な pane を除く（否定の対照: 一時的でなければ含む）", () => {
    expect(localNodeKeys(graphStructure(session([]), { nodes: [] }))).toEqual([
      "local:p1",
      "local:p2",
    ]);
    expect(localNodeKeys(graphStructure(session(["p2"]), { nodes: [] }))).toEqual(["local:p1"]);
  });

  it("グラフにある別のマシンのノードを、マシンごとの囲いにまとめる", () => {
    const m = "c".repeat(32);
    const st = graphStructure(session([]), {
      nodes: [
        { key: `${m}:x`, x: 0, y: 0 },
        { key: "local:p1", x: 0, y: 0 },
      ],
    });
    const tops = st.spaces.find((s) => s.id === "u")!.tops;
    expect(tops.map((t) => t.kind)).toEqual(["workspace", "machine"]);
  });
});
