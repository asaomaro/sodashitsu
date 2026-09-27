import type { AgentInfo, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { CLOSED_PANE_NAME, describeParts, describeTarget, type TargetLookup } from "./describe.js";

// キャストを使わない（既存の `store/seen.test.ts` 等と同じ流儀）——`as` で押し込むと、
// protocol に必須項目が増えてもテストが型で気づけない。
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 0, completionSeq: 0, serverSeenSeq: 0, ...overrides };
}

function makePane(overrides: Partial<Pane> = {}): Pane {
  return { id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}

function makeTab(overrides: Partial<Tab> = {}): Tab {
  return { id: "t1", workspaceId: "w1", label: "tab-A", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null, ...overrides };
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: "w1", label: "ws-A", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false, ...overrides };
}

function makeLookup(overrides: Partial<TargetLookup> = {}): TargetLookup {
  return {
    panes: new Map([["p1", makePane()]]),
    tabs: new Map([["t1", makeTab()]]),
    workspaces: new Map([["w1", makeWorkspace()]]),
    ...overrides,
  };
}

describe("describeTarget", () => {
  it("pane・tab・workspace が揃えば「pane 名（workspace / tab）」", () => {
    expect(describeTarget(makeLookup(), "p1")).toBe("pane p1（ws-A / tab-A）");
  });

  // **これがこの関数の存在理由**：エージェントの label は種類名なので、同じ tab で 2 つ回すと
  // 文言が区別できなくなる。pane 自身の名前を先に見ることで別物になる。
  it("同じ種類のエージェントが 2 つでも、pane の label で区別できる", () => {
    const lookup = makeLookup({
      panes: new Map([
        ["p1", makePane({ id: "p1", label: "実装", agent: makeAgent({ instanceId: "a1" }) })],
        ["p2", makePane({ id: "p2", label: "レビュー", agent: makeAgent({ instanceId: "a2" }) })],
      ]),
    });
    expect(describeTarget(lookup, "p1")).toBe("実装（ws-A / tab-A）");
    expect(describeTarget(lookup, "p2")).toBe("レビュー（ws-A / tab-A）");
  });

  it("pane が引けなければ「（閉じられた pane）」", () => {
    expect(describeTarget(makeLookup({ panes: new Map() }), "p1")).toBe(CLOSED_PANE_NAME);
  });

  it("tab が引けなければ pane の名前だけ", () => {
    expect(describeTarget(makeLookup({ tabs: new Map() }), "p1")).toBe("pane p1");
  });

  it("workspace が引けなければ tab だけを添える", () => {
    expect(describeTarget(makeLookup({ workspaces: new Map() }), "p1")).toBe("pane p1（tab-A）");
  });
});

describe("describeParts", () => {
  it("OS 通知の title と body に分けて返す", () => {
    expect(describeParts(makeLookup(), "p1")).toEqual({ paneName: "pane p1", place: "ws-A / tab-A" });
  });

  it("引けないときは place が空文字（body を落とせる）", () => {
    expect(describeParts(makeLookup({ tabs: new Map() }), "p1")).toEqual({ paneName: "pane p1", place: "" });
  });
});
