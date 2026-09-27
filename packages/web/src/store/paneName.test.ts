import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { paneNameOf } from "./paneName.js";

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 0, completionSeq: 0, serverSeenSeq: 0, ...overrides };
}

function makePane(overrides: Partial<Pane> = {}): Pane {
  return { id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}

// herdr と同じフォールバックの連鎖。`title` は未設定なら空文字なので `||` で繋ぐ。
describe("paneNameOf", () => {
  it("pane の label が最優先", () => {
    expect(paneNameOf(makePane({ label: "editor", agent: makeAgent(), title: "vim" }))).toBe("editor");
  });

  it("label が無ければエージェントの label", () => {
    expect(paneNameOf(makePane({ agent: makeAgent(), title: "vim" }))).toBe("Claude Code");
  });

  it("label が無ければ、エージェントの種類の表示名より先に agent rename で付けた名前（20260926-agent-start-rename AC13）", () => {
    expect(paneNameOf(makePane({ agent: makeAgent({ name: "reviewer" }), title: "vim" }))).toBe("reviewer");
    expect(paneNameOf(makePane({ label: "editor", agent: makeAgent({ name: "reviewer" }) }))).toBe("editor");
  });

  it("どちらも無ければ端末のタイトル", () => {
    expect(paneNameOf(makePane({ title: "vim" }))).toBe("vim");
  });

  it("空文字は「値なし」として次へ落とす（`??` ではなく `||`）", () => {
    expect(paneNameOf(makePane({ label: "", title: "" }))).toBe("pane p1");
  });
});
