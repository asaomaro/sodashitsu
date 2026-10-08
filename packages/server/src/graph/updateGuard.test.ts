import { describe, expect, it } from "vitest";
import type {
  Graph,
  GraphNode,
  GraphOp,
  NodeKey,
  Pane,
  Tab,
  Workspace,
} from "@sodashitsu/protocol";
import { emptyGraph } from "@sodashitsu/client-core";
import type { GraphStructureSession } from "./graphStructure.js";
import { guardGraphUpdate } from "./updateGuard.js";

// 20261008-graph-first の T7：graph.update の検査（node_required・frame_overlap）。

function world(transient: string[] = []): GraphStructureSession {
  const workspaces: Workspace[] = [];
  const tabs: Tab[] = [];
  const panes: Pane[] = [];
  const add = (id: string, paneIds: string[]) => {
    const tabIds = paneIds.map((_, i) => `${id}t${i}`);
    paneIds.forEach((p, i) => {
      tabs.push({
        id: tabIds[i]!,
        workspaceId: id,
        label: "t",
        layout: { type: "pane", paneId: p },
        focusedPaneId: p,
        zoomedPaneId: null,
        sizeOwnerClientId: null,
      });
      panes.push({
        id: p,
        tabId: tabIds[i]!,
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
    });
    workspaces.push({
      id,
      label: id,
      cwd: "/",
      tabIds,
      activeTabId: tabIds[0]!,
      groupId: null,
      git: null,
      autoLabel: false,
    });
  };
  add("w1", ["p1", "p2"]);
  add("w2", ["p3"]);
  return {
    snapshot: () => ({ workspaces, tabs, panes, groups: [] }),
    isTransientPane: (id) => transient.includes(id),
  };
}

const k = (p: string): NodeKey => `local:${p}`;
const REMOTE: NodeKey = `${"c".repeat(32)}:r1`;

/** w1（p1・p2）と w2（p3）は重ならない位置にある。 */
function graph(extra: GraphNode[] = []): Graph {
  return {
    ...emptyGraph(),
    rev: 3,
    nodes: [
      { key: k("p1"), x: 40, y: 60 },
      { key: k("p2"), x: 280, y: 60 },
      { key: k("p3"), x: 40, y: 400 },
      ...extra,
    ],
  };
}
const move = (key: NodeKey, x: number, y: number): GraphOp => ({ op: "move_node", key, x, y });

describe("guardGraphUpdate: node_required", () => {
  it("開いている手元の pane のノードは外せない・選び直せない", () => {
    const s = world();
    expect(guardGraphUpdate(s, graph(), [{ op: "remove_node", key: k("p2") }])?.code).toBe(
      "node_required",
    );
    expect(
      guardGraphUpdate(s, graph(), [{ op: "rekey_node", key: k("p2"), newKey: k("p9") }])?.code,
    ).toBe("node_required");
  });

  it("否定の対照: 別のマシンのノード・構成に無いノード（閉じた pane）・一時的な pane のノードは外せる。別のマシンへの付け替えは保存の側が断る", () => {
    const s = world(["p2"]); // p2 は一時的な pane（構成に出ない）
    const g = graph([
      { key: REMOTE, x: 3000, y: 0 },
      { key: k("gone"), x: 3000, y: 400 },
    ]);
    expect(guardGraphUpdate(s, g, [{ op: "remove_node", key: REMOTE }])).toBeNull();
    expect(guardGraphUpdate(s, g, [{ op: "remove_node", key: k("gone") }])).toBeNull();
    expect(guardGraphUpdate(s, g, [{ op: "remove_node", key: k("p2") }])).toBeNull();
    expect(
      guardGraphUpdate(s, g, [
        { op: "rekey_node", key: k("p1"), newKey: `${"d".repeat(32)}:x` as NodeKey },
      ]),
    ).toBeNull(); // rekey_other_machine は applyGraphOps が断る
  });
});

describe("guardGraphUpdate: frame_overlap", () => {
  it("別の workspace の囲いに重なる位置へ動かす更新は断る", () => {
    const s = world();
    // p3 の囲い（w2）の中へ p1 を動かす
    const failure = guardGraphUpdate(s, graph(), [move(k("p1"), 40, 400)]);
    expect(failure?.code).toBe("frame_overlap");
  });

  it("重ならない位置への移動・同じ workspace の中の移動は通す", () => {
    const s = world();
    expect(guardGraphUpdate(s, graph(), [move(k("p1"), 40, 200)])).toBeNull();
    expect(guardGraphUpdate(s, graph(), [move(k("p2"), 520, 60)])).toBeNull();
  });

  it("すでに重なっている状態から、重なりを広げない更新（無関係の更新）は通す。広げる更新だけ断る", () => {
    const s = world();
    // p3 を w1 の囲いに重ねた状態（すでに重なっている）
    const overlapped = graph();
    overlapped.nodes = overlapped.nodes.map((n) =>
      n.key === k("p3") ? { ...n, x: 100, y: 100 } : n,
    );
    // 無関係の更新: 別のマシンのノードを遠くへ足す・p2 を動かさない
    expect(
      guardGraphUpdate(s, overlapped, [{ op: "add_node", key: REMOTE, x: 5000, y: 0 }]),
    ).toBeNull();
    // 重なりを減らす更新（p3 を離す）は通す
    expect(guardGraphUpdate(s, overlapped, [move(k("p3"), 40, 900)])).toBeNull();
    // 重なりを広げる更新（p3 を w1 の中心へ寄せる）は断る
    expect(guardGraphUpdate(s, overlapped, [move(k("p3"), 140, 60)])?.code).toBe("frame_overlap");
  });

  it("別のマシンのノードを手元の囲いの上に足す更新も断る", () => {
    const s = world();
    expect(
      guardGraphUpdate(s, graph(), [{ op: "add_node", key: REMOTE, x: 60, y: 60 }])?.code,
    ).toBe("frame_overlap");
    expect(
      guardGraphUpdate(s, graph(), [{ op: "add_node", key: REMOTE, x: 3000, y: 0 }]),
    ).toBeNull();
  });

  it("線の操作だけの更新は検査しない（構造を導きもしない）", () => {
    const s = world();
    expect(
      guardGraphUpdate(s, graph(), [
        { op: "add_link", kind: "supervise", from: k("p1"), to: k("p2") },
      ]),
    ).toBeNull();
  });
});
