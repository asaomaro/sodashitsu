import type { AgentInfo } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { MemoryLogger } from "../../log/Logger.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerAgentMethods } from "./agent.js";
import type { MethodDeps } from "./deps.js";

/** `agent.rename`（20260926-agent-start-rename design「インターフェース / データ構造」）。中身は `SessionService.renameAgent`。 */

const NAMED: AgentInfo = {
  instanceId: "a1",
  kind: "claude",
  label: "Claude Code",
  state: "idle",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 1000,
  name: "reviewer",
};

function setup(renameAgent: MethodDeps["session"]["renameAgent"]) {
  const write = vi.fn();
  const deps = {
    session: { renameAgent },
    terminals: { get: () => ({ write, writeModal: write }) },
    sizeAuthority: { noteInteraction: vi.fn() },
  } as unknown as MethodDeps;
  const surface = new ControlSurface(new MemoryLogger());
  registerAgentMethods(surface, deps);
  const call = (params: unknown) =>
    surface.invoke({ clientId: "c1", sink: {} as never }, "agent.rename", params);
  return { call, write };
}

describe("agent.rename", () => {
  it("paneId・instanceId・name をそのまま renameAgent へ渡し、変更後のエージェントを返す。端末には何も書かない（AC1・AC11）", async () => {
    const renameAgent = vi.fn(() => NAMED);
    const s = setup(renameAgent);
    expect(await s.call({ paneId: "p1", instanceId: "a1", name: "reviewer" })).toEqual({
      ok: true,
      result: { agent: NAMED },
    });
    expect(renameAgent).toHaveBeenCalledWith("p1", "a1", "reviewer");
    expect(s.write).not.toHaveBeenCalled();
  });

  it("null は外す指定として渡し、instanceId の省略は undefined で渡す（AC2）", async () => {
    const renameAgent = vi.fn(() => NAMED);
    const s = setup(renameAgent);
    await s.call({ paneId: "p1", name: null });
    expect(renameAgent).toHaveBeenCalledWith("p1", undefined, null);
  });

  it("renameAgent の RpcError はその code のまま返る（AC5）", async () => {
    for (const code of ["agent_not_found", "invalid_agent_name", "agent_name_taken"] as const) {
      const s = setup(() => {
        throw new RpcError(code, "x");
      });
      const result = await s.call({ paneId: "p1", name: "reviewer" });
      expect(result.ok ? null : result.error.code).toBe(code);
    }
  });

  it("name の無い・文字列でも null でもない要求は invalid_params で、renameAgent を呼ばない", async () => {
    const renameAgent = vi.fn(() => NAMED);
    const s = setup(renameAgent);
    for (const params of [{ paneId: "p1" }, { paneId: "p1", name: 1 }, { paneId: "", name: "x" }]) {
      const result = await s.call(params);
      expect(result.ok ? null : result.error.code).toBe("invalid_params");
    }
    expect(renameAgent).not.toHaveBeenCalled();
  });
});
