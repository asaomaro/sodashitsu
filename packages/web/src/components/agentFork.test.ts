import { describe, expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { forkReasonText, forkUnavailableReason, noteStatusText } from "./agentFork.js";

const UUID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const pane = (over: Partial<Pane> = {}): Pane =>
  ({ id: "p1", agent: { kind: "claude", state: "idle" }, agentSession: { kind: "claude", sessionId: UUID, reportedAt: 1 }, ...over }) as unknown as Pane;

describe("forkUnavailableReason（メニューの項目の理由。20261009-agent-fork PR2）", () => {
  it("fork できる（Claude Code・会話の id が UUID）なら null", () => {
    expect(forkUnavailableReason(pane(), true)).toBeNull();
  });
  it("別のマシンの pane・pane が無い・エージェントが居ない・Claude Code でない・会話の id が無い／形が違う", () => {
    expect(forkUnavailableReason(pane(), false)).toBe("remote");
    expect(forkUnavailableReason(undefined, true)).toBe("pane_not_found");
    expect(forkUnavailableReason(pane({ agent: null }), true)).toBe("no_agent");
    expect(forkUnavailableReason(pane({ agent: { kind: "codex" } as never }), true)).toBe("not_claude");
    expect(forkUnavailableReason(pane({ agentSession: null }), true)).toBe("no_session_id");
    expect(forkUnavailableReason(pane({ agentSession: { kind: "claude", sessionId: "../x", reportedAt: 1 } }), true)).toBe("bad_session_id");
  });
  it("理由の文言（空でない）と、最初の知らせの状態の文言", () => {
    for (const r of ["pane_not_found", "no_agent", "not_claude", "no_session_id", "bad_session_id", "unsupported_shell", "remote"] as const) expect(forkReasonText(r).length).toBeGreaterThan(5);
    expect(noteStatusText("pending")).toContain("まだ送っていません");
    expect(noteStatusText("pending")).toContain("入力欄を待っています");
    expect(noteStatusText("skipped", "パスに制御文字")).toContain("パスに制御文字");
    expect(noteStatusText("timed_out")).toContain("待ちが切れて");
    expect(noteStatusText(undefined)).toBe("");
  });
});
