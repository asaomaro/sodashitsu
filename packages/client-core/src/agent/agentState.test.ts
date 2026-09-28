import { describe, expect, it } from "vitest";
import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { aggregate, displayStateFor, shouldMarkSeen, sweepMarkSeen } from "./agentState.js";

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
}

describe("displayStateFor", () => {
  it("エージェントが居なければ null", () => {
    expect(displayStateFor(null, 0)).toBeNull();
  });

  it("idle かつ completionSeq > seenSeq なら done", () => {
    expect(displayStateFor(makeAgent({ state: "idle", completionSeq: 3 }), 2)).toBe("done");
  });

  it("idle でも completionSeq <= seenSeq なら idle のまま", () => {
    expect(displayStateFor(makeAgent({ state: "idle", completionSeq: 2 }), 2)).toBe("idle");
  });

  it("idle 以外はそのまま返す", () => {
    expect(displayStateFor(makeAgent({ state: "blocked" }), 0)).toBe("blocked");
    expect(displayStateFor(makeAgent({ state: "working" }), 0)).toBe("working");
    expect(displayStateFor(makeAgent({ state: "unknown" }), 0)).toBe("unknown");
  });
});

describe("aggregate", () => {
  it("blocked ＞ done ＞ working ＞ idle ＞ unknown の順で代表を選ぶ", () => {
    expect(aggregate(["idle", "working", "blocked", "done"])).toBe("blocked");
    expect(aggregate(["idle", "working", "done"])).toBe("done");
    expect(aggregate(["idle", "working"])).toBe("working");
    expect(aggregate(["unknown", "idle"])).toBe("idle");
    expect(aggregate(["unknown"])).toBe("unknown");
  });

  it("null（エージェント無し）は無視する", () => {
    expect(aggregate([null, null])).toBeNull();
    expect(aggregate([null, "idle"])).toBe("idle");
  });

  it("空配列は null", () => {
    expect(aggregate([])).toBeNull();
  });
});

describe("shouldMarkSeen", () => {
  it("表示中かつウィンドウにフォーカスがあるときだけ true", () => {
    expect(shouldMarkSeen(true, true)).toBe(true);
    expect(shouldMarkSeen(false, true)).toBe(false);
    expect(shouldMarkSeen(true, false)).toBe(false);
    expect(shouldMarkSeen(false, false)).toBe(false);
  });
});

// 20260925-seen-semantics-fix（design「設計方針」）。
describe("sweepMarkSeen", () => {
  function makePane(id: string, agent: AgentInfo | null): Pick<Pane, "id" | "agent"> {
    return { id, agent };
  }

  it("表示中かつウィンドウにフォーカスがある pane だけ既読になる", () => {
    const panes = [makePane("p1", makeAgent({ instanceId: "a1", completionSeq: 3 })), makePane("p2", makeAgent({ instanceId: "a2", completionSeq: 5 }))];
    const visible = new Set(["p1"]); // p2 は非表示
    const marked: [string, number][] = [];
    sweepMarkSeen(panes, (id) => visible.has(id), true, (instanceId, seq) => marked.push([instanceId, seq]));
    expect(marked).toEqual([["a1", 3]]);
  });

  it("ウィンドウにフォーカスが無ければ、表示中の pane も既読にしない", () => {
    const panes = [makePane("p1", makeAgent({ instanceId: "a1", completionSeq: 3 }))];
    const marked: [string, number][] = [];
    sweepMarkSeen(panes, () => true, false, (instanceId, seq) => marked.push([instanceId, seq]));
    expect(marked).toEqual([]);
  });

  it("エージェントの無い pane は無視する", () => {
    const panes = [makePane("p1", null)];
    const marked: [string, number][] = [];
    sweepMarkSeen(panes, () => true, true, (instanceId, seq) => marked.push([instanceId, seq]));
    expect(marked).toEqual([]);
  });

  it("複数 pane をそれぞれ独立に判定する（表示中と非表示が混在）", () => {
    const panes = [
      makePane("p1", makeAgent({ instanceId: "a1", completionSeq: 1 })),
      makePane("p2", makeAgent({ instanceId: "a2", completionSeq: 2 })),
      makePane("p3", makeAgent({ instanceId: "a3", completionSeq: 3 })),
    ];
    const visible = new Set(["p1", "p3"]);
    const marked: [string, number][] = [];
    sweepMarkSeen(panes, (id) => visible.has(id), true, (instanceId, seq) => marked.push([instanceId, seq]));
    expect(marked).toEqual([
      ["a1", 1],
      ["a3", 3],
    ]);
  });
});
