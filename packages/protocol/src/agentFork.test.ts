import { describe, expect, it } from "vitest";
import { isForkSessionId } from "./agentFork.js";
import { AgentForkParams, AgentForkPreviewParams, METHOD_SCHEMAS } from "./messages.js";

describe("agent.fork の入力（20261009-agent-fork）", () => {
  it("方式に登録されている", () => {
    expect(METHOD_SCHEMAS["agent.fork"]).toBe(AgentForkParams);
    expect(METHOD_SCHEMAS["agent.fork_preview"]).toBe(AgentForkPreviewParams);
  });

  it("pane・行き先・知らせるかだけを受ける", () => {
    expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "same" } }).success).toBe(true);
    expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "worktree", branch: "b" }, note: false }).success).toBe(true);
    expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "worktree", branch: "" } }).success).toBe(false);
  });

  it("会話の id・コマンド・引数など、知らない項目は断る（黙って捨てない。AC5・A4）", () => {
    for (const extra of [{ sessionId: "x" }, { argv: ["a"] }, { args: ["--x"] }, { command: "rm" }, { callerPaneId: "p" }]) {
      expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "same" }, ...extra }).success).toBe(false);
      expect(AgentForkPreviewParams.safeParse({ paneId: "p", ...extra }).success).toBe(false);
    }
    // 行き先の中の知らない項目も断る。
    expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "same", branch: "x" } }).success).toBe(false);
    expect(AgentForkParams.safeParse({ paneId: "p", target: { kind: "worktree", branch: "b", sessionId: "x" } }).success).toBe(false);
  });
});

describe("isForkSessionId", () => {
  it("UUID の形だけを通す", () => {
    expect(isForkSessionId("3e81f9a7-a757-461a-b21c-196db1d9196e")).toBe(true);
    expect(isForkSessionId("3E81F9A7-A757-461A-B21C-196DB1D9196E")).toBe(true);
  });
  it("名前・パス・引数に化ける形・長さの違うものを断る", () => {
    for (const bad of ["../x", "a b", "-x", "my-session", "/tmp/x.jsonl", "3e81f9a7-a757-461a-b21c-196db1d9196e0", "3e81f9a7-a757-461a-b21c-196db1d9196", "3e81f9a7-a757-461a-b21c-196db1d9196e\n", "3e81f9a7-a757-461a-b21c-196db1d9196e; rm", "", "$(id)"]) {
      expect(isForkSessionId(bad), bad).toBe(false);
    }
  });
});
