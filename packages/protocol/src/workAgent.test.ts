import { expect, it } from "vitest";
import { WorkAgentTool, workAgentArgumentError, WorkAgentRequestSchema } from "./workAgent.js";

it("allows native resume/model arguments without allowing policy or admin overrides", () => {
  expect(workAgentArgumentError("claude", ["--resume", "--model", "sonnet", "--effort", "high"])).toBeUndefined();
  expect(workAgentArgumentError("codex", ["--model", "gpt-6.1-sol", "resume", "--last", "-c", 'model_reasoning_effort="high"'])).toBeUndefined();
  for (const args of [["--model", "x", "mcp", "add", "x"], ["delete", "x"], ["--config", "features.shell_tool=true"], ["--sandbox=workspace-write"], ["-cfeatures.hooks=true"], ["--worktree"], ["resume", "--remote", "ws://other"]])
    expect(workAgentArgumentError("codex", args)).toBeDefined();
  for (const args of [["mcp", "add", "x"], ["purge", "--yes"], ["--tools", "Bash"], ["--settings=evil.json"], ["--plugin-dir", "x"], ["--chrome"], ["--bg"], ["-wother"]])
    expect(workAgentArgumentError("claude", args)).toBeDefined();
  expect(workAgentArgumentError("node" as never, ["--version"])).toBeDefined();
});
it("rejects target/cwd/method injection even when a caller bypasses the CLI", () => {
  for (const value of [
    { operation: "exec", command: "pwd", cwd: "/wrong" },
    { operation: "file", action: "read", path: "README.md", workspaceId: "other" },
    { operation: "memory", action: "write", name: "MEMORY.md", content: "x", sourcePaneId: "other" },
    { operation: "auth.login", token: "x" },
  ]) expect(WorkAgentTool.safeParse(value).success).toBe(false);
  expect(WorkAgentRequestSchema.safeParse({ agentKind: "node" }).success).toBe(false);
});
