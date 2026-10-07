import { describe, expect, it } from "vitest";
import { resumeCommandFor } from "./resumeCommand.js";

describe("resumeCommandFor", () => {
  it("builds the Claude Code resume command", () => {
    expect(resumeCommandFor("claude", "1f9c-uuid")).toBe("claude --resume 1f9c-uuid");
  });

  it("builds the Codex resume command", () => {
    expect(resumeCommandFor("codex", "thr_123")).toBe("codex resume thr_123");
  });

  // 20260923-other-agents-session-resume（research.md F2）。
  it("builds the Cursor Agent CLI resume command", () => {
    expect(resumeCommandFor("cursor", "sess_123")).toBe("cursor-agent --resume sess_123");
  });

  it("builds the GitHub Copilot CLI resume command", () => {
    expect(resumeCommandFor("copilot", "sess_123")).toBe("copilot --resume=sess_123");
  });

  it("builds the Devin CLI resume command", () => {
    expect(resumeCommandFor("devin", "sess_123")).toBe("devin --resume sess_123");
  });

  it("builds the Droid resume command", () => {
    expect(resumeCommandFor("droid", "sess_123")).toBe("droid --resume sess_123");
  });

  it("builds the Grok CLI resume command", () => {
    expect(resumeCommandFor("grok", "sess_123")).toBe("grok --resume sess_123");
  });

  it("builds the Qwen Code resume command", () => {
    expect(resumeCommandFor("qwen", "sess_123")).toBe("qwen --resume sess_123");
  });

  it("builds the Qoder CLI resume command (kind qodercli, executable qoder)", () => {
    expect(resumeCommandFor("qodercli", "abc-123")).toBe("qoder --resume abc-123");
    expect(resumeCommandFor("qodercli", "a; rm -rf /")).toBeUndefined();
  });

  it("rejects an unsafe sessionId for all 6 new kinds too", () => {
    for (const kind of ["cursor", "copilot", "devin", "droid", "grok", "qwen"] as const) {
      expect(resumeCommandFor(kind, "abc; rm -rf ~")).toBeUndefined();
    }
  });

  it("returns undefined for an unknown kind", () => {
    expect(resumeCommandFor("gemini", "abc")).toBeUndefined();
  });

  it("rejects a sessionId with shell metacharacters", () => {
    expect(resumeCommandFor("claude", "abc; rm -rf ~")).toBeUndefined();
    expect(resumeCommandFor("claude", "abc`whoami`")).toBeUndefined();
    expect(resumeCommandFor("claude", "abc$(id)")).toBeUndefined();
    expect(resumeCommandFor("claude", "abc\ndef")).toBeUndefined();
  });

  it("allows a path-like sessionId", () => {
    expect(resumeCommandFor("claude", "/home/user/.claude/projects/foo/1f9c.jsonl")).toBe(
      "claude --resume /home/user/.claude/projects/foo/1f9c.jsonl",
    );
  });
});
