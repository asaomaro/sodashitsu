import { describe, expect, it } from "vitest";
import {
  AGENT_START_DEFAULT_TIMEOUT_MS,
  AGENT_START_KINDS,
  agentStartExecutable,
  isValidAgentStartTimeout,
} from "./agentStart.js";
import { AgentStartParams, METHOD_SCHEMAS } from "./messages.js";

describe("agentStartExecutable", () => {
  it("表の kind だけを実行ファイル名に引く（別名・パス・継承したキーは null）", () => {
    expect(agentStartExecutable("claude")).toBe("claude");
    expect(agentStartExecutable("cursor")).toBe("cursor-agent");
    expect(agentStartExecutable("kiro")).toBe("kiro-cli");
    for (const kind of [
      "claude-code",
      "/usr/bin/claude",
      "Claude",
      "omp",
      "mastracode",
      "__proto__",
      "constructor",
      "toString",
      "",
      "sh",
    ]) {
      expect(agentStartExecutable(kind), kind).toBeNull();
    }
  });

  it("23 種類（herdr の 22 と Bob Shell）で、実行ファイル名は英小文字・数字・'-' だけ（シェルに裸で出してよい）", () => {
    expect(AGENT_START_KINDS).toHaveLength(23);
    for (const kind of AGENT_START_KINDS)
      expect(agentStartExecutable(kind)).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("isValidAgentStartTimeout", () => {
  it("3000 より大きく 300000 以下の整数だけ（herdr と同じ範囲）", () => {
    for (const ms of [3001, AGENT_START_DEFAULT_TIMEOUT_MS, 300_000])
      expect(isValidAgentStartTimeout(ms), String(ms)).toBe(true);
    for (const ms of [3000, 0, -1, 300_001, 3500.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidAgentStartTimeout(ms), String(ms)).toBe(false);
    }
  });
});

describe("AgentStartParams", () => {
  it("agent.start に登録され、timeoutMs は省略可・整数だけ", () => {
    expect(METHOD_SCHEMAS["agent.start"]).toBe(AgentStartParams);
    expect(
      AgentStartParams.safeParse({ name: "r", kind: "claude", paneId: "p1", args: [] }).success,
    ).toBe(true);
    expect(
      AgentStartParams.safeParse({
        name: "r",
        kind: "claude",
        paneId: "p1",
        args: ["x"],
        timeoutMs: 1.5,
      }).success,
    ).toBe(false);
    expect(
      AgentStartParams.safeParse({ name: "r", kind: "claude", paneId: "p1", args: [1] }).success,
    ).toBe(false);
  });
});
