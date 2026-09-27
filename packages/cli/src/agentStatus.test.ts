import type { AgentInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  currentScreen,
  DEFAULT_UNTIL,
  judgeWait,
  lastLines,
  PROMPT_EFFECT_TIMEOUT_MS,
  PromptWait,
  resolveUntil,
  statusOf,
  toAgentView,
} from "./agentStatus.js";

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 1000,
    ...patch,
  };
}

describe("statusOf", () => {
  it("idle で未読の完了があれば done", () => {
    expect(statusOf(agent({ state: "idle", completionSeq: 2, serverSeenSeq: 1 }))).toBe("done");
  });
  it("idle で既読なら idle", () => {
    expect(statusOf(agent({ state: "idle", completionSeq: 2, serverSeenSeq: 2 }))).toBe("idle");
  });
  it.each(["working", "blocked", "unknown"] as const)(
    "%s は未読の完了があってもそのまま",
    (state) => {
      expect(statusOf(agent({ state, completionSeq: 3, serverSeenSeq: 1 }))).toBe(state);
    },
  );
});

describe("resolveUntil", () => {
  it("空なら既定の idle/done/blocked", () => {
    expect(resolveUntil([])).toEqual(["idle", "done", "blocked"]);
    expect(DEFAULT_UNTIL).not.toContain("unknown");
    expect(DEFAULT_UNTIL).not.toContain("working");
  });
  it("指定があればそのまま", () => {
    expect(resolveUntil(["working", "unknown"])).toEqual(["working", "unknown"]);
  });
});

describe("judgeWait", () => {
  const until = resolveUntil([]);
  it.each([
    ["idle", 0, 0],
    ["idle", 1, 0],
    ["blocked", 0, 0],
  ] as const)(
    "既定では %s（completionSeq=%i, seen=%i）で match",
    (state, completionSeq, serverSeenSeq) => {
      expect(judgeWait("a1", agent({ state, completionSeq, serverSeenSeq }), until)).toBe("match");
    },
  );
  it.each(["working", "unknown"] as const)("既定では %s は pending", (state) => {
    expect(judgeWait("a1", agent({ state }), until)).toBe("pending");
  });
  it("until に done だけを指定すると、既読の idle では pending・未読なら match", () => {
    expect(
      judgeWait("a1", agent({ state: "idle", completionSeq: 1, serverSeenSeq: 1 }), ["done"]),
    ).toBe("pending");
    expect(
      judgeWait("a1", agent({ state: "idle", completionSeq: 2, serverSeenSeq: 1 }), ["done"]),
    ).toBe("match");
  });
  it("エージェントが null なら gone", () => {
    expect(judgeWait("a1", null, until)).toBe("gone");
  });
  it("instanceId が違う（入れ替わった）なら、状態が一致していても gone", () => {
    expect(judgeWait("a1", agent({ instanceId: "a2", state: "idle" }), until)).toBe("gone");
  });
});

describe("toAgentView", () => {
  it("位置と状態（done を含む）と AgentInfo の項目を並べる", () => {
    const view = toAgentView(
      { paneId: "p1", tabId: "t1", workspaceId: "w1" },
      agent({ state: "idle", completionSeq: 1, serverSeenSeq: 0 }),
    );
    expect(view).toEqual({
      paneId: "p1",
      name: null,
      workspaceId: "w1",
      tabId: "t1",
      status: "done",
      kind: "claude",
      label: "Claude Code",
      state: "idle",
      instanceId: "a1",
      completionSeq: 1,
      serverSeenSeq: 0,
      since: 1000,
      verified: true,
    });
  });

  it("名前があれば name に出し、無ければ null（20260926-agent-start-rename AC9）", () => {
    const loc = { paneId: "p1", tabId: "t1", workspaceId: "w1" };
    expect(toAgentView(loc, agent({ name: "reviewer" })).name).toBe("reviewer");
    expect(toAgentView(loc, agent()).name).toBeNull();
  });
});

describe("lastLines", () => {
  it("最後の n 行を返す", () => {
    expect(lastLines("a\nb\nc\nd", 2)).toBe("c\nd");
  });
  it("末尾の空行（空白だけ・ANSI だけの行を含む）は数えない", () => {
    expect(lastLines("a\nb\nc\n\n   \n\u001B[0m\n", 2)).toBe("b\nc");
  });
  it("途中の空行は残す", () => {
    expect(lastLines("a\n\nb", 3)).toBe("a\n\nb");
  });
  it("\\r\\n を区切りとして扱い、\\n でつなぐ", () => {
    expect(lastLines("a\r\nb\r\nc\r\n", 2)).toBe("b\nc");
  });
  it("行数が n より少なければ全部", () => {
    expect(lastLines("a\nb", 80)).toBe("a\nb");
  });
});

describe("currentScreen", () => {
  it("alt screen が無ければそのまま", () => {
    expect(currentScreen("$ ls\r\nfileA")).toBe("$ ls\r\nfileA");
  });
  it("alt screen が有効なら、最後の ESC[?1049h より後ろ（今の画面）だけ", () => {
    expect(
      currentScreen("$ ls\r\nfileA\r\n$ codex\u001B[?1049h\u001B[HALT-ROW-1\r\nALT-ROW-2"),
    ).toBe("\u001B[HALT-ROW-1\r\nALT-ROW-2");
  });
});

// 20260926-agent-prompt-send-keys
describe("PromptWait（agent prompt --wait の活動の確認 → 状態待ち）", () => {
  it("活動の確認の上限は herdr と同じ 5000ms", () => {
    expect(PROMPT_EFFECT_TIMEOUT_MS).toBe(5000);
  });

  it("活動を観測するまでは、until に含まれる idle・done でも一致しない（AC6）", () => {
    const w = new PromptWait("a1", DEFAULT_UNTIL, false);
    expect(w.observe(agent({ state: "idle" }))).toBe("pending");
    expect(w.observe(agent({ state: "idle", completionSeq: 2, serverSeenSeq: 1 }))).toBe("pending"); // done
    expect(w.observe(agent({ state: "unknown" }))).toBe("pending");
    expect(w.activityObserved).toBe(false);
  });

  it("working を観測した後は、until のどれかで一致する（AC8）", () => {
    const w = new PromptWait("a1", DEFAULT_UNTIL, false);
    expect(w.observe(agent({ state: "working" }))).toBe("pending");
    expect(w.activityObserved).toBe(true);
    expect(w.observe(agent({ state: "unknown" }))).toBe("pending");
    expect(w.observe(agent({ state: "idle", completionSeq: 1 }))).toBe("match");
  });

  it("活動として観測した blocked が until に含まれていれば、それで一致する（既定の until）（AC8）", () => {
    const w = new PromptWait("a1", DEFAULT_UNTIL, false);
    expect(w.observe(agent({ state: "blocked" }))).toBe("match");
  });

  it("until を絞れば、活動の後でもそれ以外では一致しない（--until の複数指定）（AC8）", () => {
    const w = new PromptWait("a1", ["done", "unknown"], false);
    expect(w.observe(agent({ state: "blocked" }))).toBe("pending");
    expect(w.observe(agent({ state: "idle" }))).toBe("pending");
    expect(w.observe(agent({ state: "unknown" }))).toBe("match");
  });

  it("送信前から working なら活動を観測済みとして始める（idle ですぐ一致・until に working があれば working で一致）（AC8）", () => {
    expect(new PromptWait("a1", DEFAULT_UNTIL, true).observe(agent({ state: "idle" }))).toBe(
      "match",
    );
    expect(new PromptWait("a1", ["working"], true).observe(agent({ state: "working" }))).toBe(
      "match",
    );
  });

  it("居なくなった・入れ替わったら gone（活動の前でも後でも）（AC9）", () => {
    expect(new PromptWait("a1", DEFAULT_UNTIL, false).observe(null)).toBe("gone");
    expect(
      new PromptWait("a1", DEFAULT_UNTIL, true).observe(agent({ instanceId: "a2", state: "idle" })),
    ).toBe("gone");
  });
});
