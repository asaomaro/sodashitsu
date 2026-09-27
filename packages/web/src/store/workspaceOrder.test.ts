import type { Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { orderedWorkspaceIds } from "./workspaceOrder.js";

const ws = (id: string, label: string): Workspace =>
  ({
    id,
    label,
    autoLabel: false,
    cwd: "/home/u",
    tabIds: [],
    activeTabId: "t1",
    git: null,
  }) as unknown as Workspace;

describe("orderedWorkspaceIds", () => {
  it("opened は渡された配列順のまま（並べ替えない）", () => {
    const workspaces = [ws("w2", "zeta"), ws("w1", "alpha"), ws("w3", "mid")];
    expect(orderedWorkspaceIds(workspaces, "opened")).toEqual(["w2", "w1", "w3"]);
  });

  it("name はラベルの文字列順（昇順）", () => {
    const workspaces = [ws("w2", "zeta"), ws("w1", "alpha"), ws("w3", "mid")];
    expect(orderedWorkspaceIds(workspaces, "name")).toEqual(["w1", "w3", "w2"]);
  });

  it("name で同名のときは渡された順が残る（安定ソート）", () => {
    const workspaces = [ws("w1", "same"), ws("w2", "same")];
    expect(orderedWorkspaceIds(workspaces, "name")).toEqual(["w1", "w2"]);
  });

  it("空配列でも例外にならない", () => {
    expect(orderedWorkspaceIds([], "opened")).toEqual([]);
    expect(orderedWorkspaceIds([], "name")).toEqual([]);
  });
});
