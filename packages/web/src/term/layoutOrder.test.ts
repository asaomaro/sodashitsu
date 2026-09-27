import type { LayoutNode } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { depthFirstPaneIds, neighborPaneId } from "./layoutOrder.js";

const pane = (paneId: string): LayoutNode => ({ type: "pane", paneId });
const split = (id: string, dir: "right" | "down", a: LayoutNode, b: LayoutNode): LayoutNode => ({ type: "split", id, dir, ratio: 0.5, a, b });

describe("layoutOrder", () => {
  it("depthFirstPaneIds は a→b の深さ優先", () => {
    expect(depthFirstPaneIds(split("s1", "right", pane("p1"), split("s2", "down", pane("p2"), pane("p3"))))).toEqual(["p1", "p2", "p3"]);
  });

  // サーバの LayoutTree.neighbor（packages/server/src/session/LayoutTree.test.ts）と同じ期待値。
  it("neighborPaneId：右分割をまたいで左右に動く・軸が違えば null", () => {
    const node = split("s1", "right", pane("p1"), pane("p2"));
    expect(neighborPaneId(node, "p1", "right")).toBe("p2");
    expect(neighborPaneId(node, "p2", "left")).toBe("p1");
    expect(neighborPaneId(node, "p1", "down")).toBeNull();
  });

  it("neighborPaneId：下分割をまたいで上下に動く", () => {
    const node = split("s1", "down", pane("p1"), pane("p2"));
    expect(neighborPaneId(node, "p1", "down")).toBe("p2");
    expect(neighborPaneId(node, "p2", "up")).toBe("p1");
  });

  it("neighborPaneId：入れ子では同じ軸の直近の祖先を使い、反対側の最初の葉に入る", () => {
    // p1｜（p2 上／p3 下）
    const node = split("s1", "right", pane("p1"), split("s2", "down", pane("p2"), pane("p3")));
    expect(neighborPaneId(node, "p3", "up")).toBe("p2");
    expect(neighborPaneId(node, "p3", "left")).toBe("p1");
    expect(neighborPaneId(node, "p1", "right")).toBe("p2"); // 反対側の最初の葉
    expect(neighborPaneId(node, "p2", "up")).toBeNull(); // 上端
    expect(neighborPaneId(node, "p1", "left")).toBeNull(); // 左端
    expect(neighborPaneId(node, "missing", "left")).toBeNull();
  });
});
