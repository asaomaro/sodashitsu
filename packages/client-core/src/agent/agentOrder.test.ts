import { describe, expect, it } from "vitest";
import { orderedAgentPaneIds, type AgentOrderEntry } from "./agentOrder.js";

const entry = (paneId: string, state: AgentOrderEntry["state"], since: number): AgentOrderEntry => ({ paneId, state, since });

describe("orderedAgentPaneIds", () => {
  it("grouped は渡された配列順のまま（並べ替えない）", () => {
    const entries = [entry("p3", "idle", 1), entry("p1", "blocked", 2), entry("p2", "working", 3)];
    expect(orderedAgentPaneIds(entries, "grouped")).toEqual(["p3", "p1", "p2"]);
  });

  it("priority は状態優先度の降順（blocked > done > working > idle > unknown）", () => {
    const entries = [entry("p-idle", "idle", 1), entry("p-blocked", "blocked", 1), entry("p-working", "working", 1), entry("p-done", "done", 1), entry("p-unknown", null, 1)];
    expect(orderedAgentPaneIds(entries, "priority")).toEqual(["p-blocked", "p-done", "p-working", "p-idle", "p-unknown"]);
  });

  it("priority は同じ状態なら since（直近の変化）の降順", () => {
    const entries = [entry("p-old", "working", 10), entry("p-new", "working", 30), entry("p-mid", "working", 20)];
    expect(orderedAgentPaneIds(entries, "priority")).toEqual(["p-new", "p-mid", "p-old"]);
  });

  it("priority は完全同点なら渡された順が残る（安定ソート）", () => {
    const entries = [entry("p1", "idle", 5), entry("p2", "idle", 5)];
    expect(orderedAgentPaneIds(entries, "priority")).toEqual(["p1", "p2"]);
  });

  it("空配列でも例外にならない", () => {
    expect(orderedAgentPaneIds([], "grouped")).toEqual([]);
    expect(orderedAgentPaneIds([], "priority")).toEqual([]);
  });
});
