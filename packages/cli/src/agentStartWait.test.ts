import type { AgentInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { StartWait } from "./agentStartWait.js";

/** `agent start` の起動完了の判定（20260926-agent-start design「`StartWait.observe`」。AC12〜AC14）。 */

function agent(patch: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "unknown",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    name: "reviewer",
    ...patch,
  };
}

function unnamed(patch: Partial<AgentInfo> = {}): AgentInfo {
  const a = agent(patch);
  delete a.name;
  return a;
}

const codeOf = (v: ReturnType<StartWait["observe"]>): string =>
  v.kind === "failed" ? v.code : v.kind;

describe("StartWait", () => {
  it("検出前（null）は待ち、unknown・working も待ち、idle で ready（AC13）", () => {
    const w = new StartWait("reviewer", "claude");
    expect(codeOf(w.observe(null))).toBe("pending");
    expect(codeOf(w.observe(agent()))).toBe("pending");
    expect(codeOf(w.observe(agent({ state: "working" })))).toBe("pending");
    const idle = agent({ state: "idle" });
    expect(w.observe(idle)).toEqual({ kind: "ready", agent: idle });
  });

  it("done（idle かつ未読の完了）も ready（AC13）", () => {
    const w = new StartWait("reviewer", "claude");
    expect(codeOf(w.observe(agent({ state: "idle", completionSeq: 1 })))).toBe("ready");
  });

  it("blocked は agent_not_ready（AC12）", () => {
    expect(codeOf(new StartWait("reviewer", "claude").observe(agent({ state: "blocked" })))).toBe(
      "agent_not_ready",
    );
  });

  it("別の種類は agent_kind_mismatch、名前が違う・無いのは agent_start_failed（AC14）", () => {
    expect(codeOf(new StartWait("reviewer", "claude").observe(agent({ kind: "codex" })))).toBe(
      "agent_kind_mismatch",
    );
    expect(codeOf(new StartWait("reviewer", "claude").observe(agent({ name: "other" })))).toBe(
      "agent_start_failed",
    );
    expect(codeOf(new StartWait("reviewer", "claude").observe(unnamed()))).toBe(
      "agent_start_failed",
    );
  });

  it("名前付きで見えた後に消える・入れ替わる・pane が閉じると agent_start_failed（AC14）", () => {
    const gone = new StartWait("reviewer", "claude");
    gone.observe(agent());
    expect(codeOf(gone.observe(null))).toBe("agent_start_failed");

    // unknown を経ずに working で最初に見えても、入れ替わりを判定できる
    const replaced = new StartWait("reviewer", "claude");
    expect(codeOf(replaced.observe(agent({ state: "working" })))).toBe("pending");
    expect(codeOf(replaced.observe(agent({ instanceId: "a2", state: "idle" })))).toBe(
      "agent_start_failed",
    );

    expect(codeOf(new StartWait("reviewer", "claude").paneClosed())).toBe("agent_start_failed");
  });
});
