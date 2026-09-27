import type { AgentInfo, Pane, SessionSnapshot } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { resolveAgentTarget } from "./agentTarget.js";
import { RpcFailure } from "./wsClient.js";

/** 対象の解決（20260926-agent-start-rename design「CLI の対象の解決」。AC5・AC7・AC8）。 */

function agent(instanceId: string, name?: string): AgentInfo {
  const info: AgentInfo = {
    instanceId,
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1000,
  };
  if (name !== undefined) info.name = name;
  return info;
}

function snapshot(
  panes: { id: string; tabId?: string; agent: AgentInfo | null }[],
): SessionSnapshot {
  return {
    panes: panes.map((p) => ({ tabId: "t1", ...p }) as unknown as Pane),
  } as unknown as SessionSnapshot;
}

function failureOf(fn: () => unknown): RpcFailure {
  try {
    fn();
  } catch (err) {
    if (err instanceof RpcFailure) return err;
    throw err;
  }
  throw new Error("expected an RpcFailure");
}

describe("resolveAgentTarget", () => {
  it("pane ID でエージェントの居る pane を指せばその pane（AC7）", () => {
    const snap = snapshot([
      { id: "p1", agent: agent("a1") },
      { id: "p2", tabId: "t2", agent: agent("a2", "reviewer") },
    ]);
    expect(resolveAgentTarget(snap, "p2")).toEqual({
      paneId: "p2",
      tabId: "t2",
      agent: agent("a2", "reviewer"),
    });
  });

  it("名前で指せばその名前のエージェントの pane（AC7）", () => {
    const snap = snapshot([
      { id: "p1", agent: agent("a1") },
      { id: "p2", tabId: "t2", agent: agent("a2", "reviewer") },
    ]);
    expect(resolveAgentTarget(snap, "reviewer")).toEqual({
      paneId: "p2",
      tabId: "t2",
      agent: agent("a2", "reviewer"),
    });
  });

  it("pane ID の pane にエージェントが居れば、同じ文字列の名前を持つ別のエージェントより優先する（AC8）", () => {
    const snap = snapshot([
      { id: "p1", agent: agent("a1") },
      { id: "p2", agent: agent("a2", "p1") },
    ]);
    expect(resolveAgentTarget(snap, "p1").paneId).toBe("p1");
  });

  it("pane ID の pane にエージェントが居なければ名前として解決する（AC8）", () => {
    const snap = snapshot([
      { id: "p1", agent: null },
      { id: "p2", agent: agent("a2", "p1") },
    ]);
    expect(resolveAgentTarget(snap, "p1").paneId).toBe("p2");
  });

  it("エージェントの居ない pane・無い pane・誰も持たない名前は agent_not_found（AC5）", () => {
    const snap = snapshot([
      { id: "p1", agent: null },
      { id: "p2", agent: agent("a2", "reviewer") },
    ]);
    const noAgent = failureOf(() => resolveAgentTarget(snap, "p1"));
    expect([noAgent.code, noAgent.message]).toEqual([
      "agent_not_found",
      "no agent detected in pane: p1",
    ]);
    const missing = failureOf(() => resolveAgentTarget(snap, "writer"));
    expect([missing.code, missing.message]).toEqual([
      "agent_not_found",
      "agent target not found: writer",
    ]);
  });

  it("同じ名前が 2 つ以上なら agent_target_ambiguous で候補を並べる（防御）", () => {
    const snap = snapshot([
      { id: "p1", agent: agent("a1", "reviewer") },
      { id: "p2", agent: agent("a2", "reviewer") },
    ]);
    const err = failureOf(() => resolveAgentTarget(snap, "reviewer"));
    expect(err.code).toBe("agent_target_ambiguous");
    expect(err.message).toContain("p1, p2");
  });
});
