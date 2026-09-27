import type { AgentStartResult } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import type { AgentStarter } from "../../agent/AgentStarter.js";
import { MemoryLogger } from "../../log/Logger.js";
import { ControlSurface } from "../ControlSurface.js";
import { registerAgentMethods } from "./agent.js";
import type { MethodDeps } from "./deps.js";

/** RPC `agent.start`（20260926-agent-start design「server RPC `agent.start`」）。中身は `AgentStarter.start`。 */

const RESULT: AgentStartResult = {
  paneId: "p1",
  name: "reviewer",
  kind: "claude",
  argv: ["claude"],
};

function setup(agentStarter: Pick<AgentStarter, "start"> | undefined) {
  const noteInteraction = vi.fn();
  const deps = {
    session: {},
    terminals: { get: () => undefined },
    sizeAuthority: { noteInteraction },
    agentStarter,
  } as unknown as MethodDeps;
  const surface = new ControlSurface(new MemoryLogger());
  registerAgentMethods(surface, deps);
  const call = (params: unknown) =>
    surface.invoke({ clientId: "c1", sink: {} as never }, "agent.start", params);
  return { call, noteInteraction };
}

describe("agent.start", () => {
  it("受け付けた後・打ち込む前に操作したクライアントを記録し、引数をそのまま AgentStarter.start へ渡して結果を返す", async () => {
    const order: string[] = [];
    const start = vi.fn((_params: unknown, onAccepted?: () => void) => {
      order.push("start");
      onAccepted?.();
      order.push("write");
      return Promise.resolve(RESULT);
    });
    const s = setup({ start });
    s.noteInteraction.mockImplementation(() => order.push("note"));
    const params = {
      name: "reviewer",
      kind: "claude",
      paneId: "p1",
      args: ["-x"],
      timeoutMs: 5000,
    };
    expect(await s.call(params)).toEqual({ ok: true, result: RESULT });
    expect(start).toHaveBeenCalledWith(params, expect.any(Function));
    expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");
    expect(order).toEqual(["start", "note", "write"]);
  });

  it("AgentStarter が拒否した（onAccepted を呼ばない）要求は操作として記録しない（review ラウンド 1）", async () => {
    const s = setup({ start: () => Promise.reject(new RpcError("agent_pane_busy", "busy")) });
    await s.call({ name: "r", kind: "claude", paneId: "p1", args: [] });
    expect(s.noteInteraction).not.toHaveBeenCalled();
  });

  it("AgentStarter の RpcError はその code で返る（AC8）", async () => {
    const s = setup({ start: () => Promise.reject(new RpcError("agent_pane_busy", "busy")) });
    expect(await s.call({ name: "r", kind: "claude", paneId: "p1", args: [] })).toEqual({
      ok: false,
      error: { code: "agent_pane_busy", message: "busy" },
    });
  });

  it("引数の型が合わなければ invalid_params で AgentStarter を呼ばない", async () => {
    const start = vi.fn();
    const s = setup({ start });
    expect(await s.call({ name: "r", kind: "claude", paneId: "p1", args: "x" })).toMatchObject({
      ok: false,
      error: { code: "invalid_params" },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("agentStarter が無い組み立てでは登録しない（not_found。decisions.md D7）", async () => {
    const s = setup(undefined);
    expect(await s.call({ name: "r", kind: "claude", paneId: "p1", args: [] })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});
