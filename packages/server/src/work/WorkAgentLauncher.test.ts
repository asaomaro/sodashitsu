import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { WorkAgentLauncher, type WorkAgentRemote } from "./WorkAgentLauncher.js";
import type { SessionService } from "../session/SessionService.js";
import type { AgentStarter } from "../agent/AgentStarter.js";

it.each(["unknown executable", "wrong request", "unsafe args", "invalid scope"])("rejects a forged B response before creating A's pane: %s", async scenario => {
  const id = randomUUID();
  const request = { id, paneId: String(randomUUID()), workspaceId: randomUUID(), folder: "/remote", root: "/remote", identity: "a".repeat(64), agentKind: "claude", args: [], expiresAt: Date.now() + 60000, state: "claimed" };
  if (scenario === "unknown executable") request.agentKind = "node";
  if (scenario === "wrong request") request.id = randomUUID();
  if (scenario === "unsafe args") (request.args as string[]).push("mcp", "add", "bad");
  if (scenario === "invalid scope") request.paneId = "../elsewhere";
  const createWorkspace = vi.fn(), start = vi.fn();
  const remote = { request: vi.fn(async () => ({ request, claim: randomUUID() })), valid: () => true, close: vi.fn() };
  const launcher = new WorkAgentLauncher("/unused", { createWorkspace } as unknown as SessionService, { start } as unknown as AgentStarter, async () => remote as unknown as WorkAgentRemote);
  await expect(launcher.launch("b".repeat(32), id)).rejects.toThrow();
  expect(createWorkspace).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled(); expect(remote.close).toHaveBeenCalled();
  launcher.close();
});
