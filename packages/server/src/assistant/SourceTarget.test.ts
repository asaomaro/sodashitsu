import { AgentSendKeysParams } from "@sodashitsu/protocol";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sourceTarget } from "./SourceTarget.js";
import { registerAssistantMethods } from "../surface/methods/assistant.js";
import { ControlSurface } from "../surface/ControlSurface.js";
import type { MethodDeps } from "../surface/methods/deps.js";
function fixture() {
  const pane = {
      id: randomUUID(),
      tabId: randomUUID(),
      agent: {
        instanceId: randomUUID(),
        state: "blocked",
        since: 42,
        completionSeq: 1,
        serverSeenSeq: 0,
      },
    },
    tab = { id: pane.tabId, workspaceId: randomUUID() },
    workspace = { id: tab.workspaceId, projectDir: "/old", cwd: "/old" };
  const notices: Array<{ key: string; status: string }> = [];
  const deps = {
    session: {
      getPane: (id: string) => (id === pane.id ? pane : undefined),
      getTab: (id: string) => (id === tab.id ? tab : undefined),
      getWorkspace: (id: string) => (id === workspace.id ? workspace : undefined),
    },
    notifications: { state: () => ({ notices }), update: vi.fn(async () => {}) },
  } as unknown as MethodDeps;
  const source = {
      serverOrigin: "http://localhost:7780",
      machineId: "local",
      paneId: pane.id,
      workspaceId: workspace.id,
      agentInstanceId: pane.agent.instanceId,
    },
    key = `blocked:${pane.agent.instanceId}:42`;
  return { pane, tab, workspace, notices, deps, source, key };
}
it("rejects expired, moved, replaced and shared-resolved notification targets", () => {
  const f = fixture();
  const t = sourceTarget(f.deps, f.source, f.key);
  f.workspace.projectDir = "/replacement";
  expect(() => t.guard()).toThrow("変更");
  f.workspace.projectDir = "/old";
  f.pane.agent.instanceId = randomUUID();
  expect(() => t.guard()).toThrow("変更");
  f.pane.agent.instanceId = f.source.agentInstanceId;
  f.notices.push({ key: f.key, status: "resolved" });
  expect(() => sourceTarget(f.deps, f.source, f.key)).toThrow("対応済み");
});
it("rechecks after queued writes and never replays an uncertain reply", async () => {
  const f = fixture(),
    surface = new ControlSurface();
  registerAssistantMethods(surface, f.deps);
  const writes: string[] = [];
  surface.register("agent.send_keys", {
    schema: AgentSendKeysParams,
    handler: (ctx) => {
      f.workspace.projectDir = "/moved";
      ctx.agentPromptGuard?.(f.pane.agent as any);
      writes.push("bad");
      return {};
    },
  });
  const ctx = { clientId: "test", sink: {} as any };
  const result = await surface.invoke(ctx, "assistant.reply_key", {
    source: f.source,
    key: f.key,
    keyName: "Enter",
  });
  expect(result.ok).toBe(false);
  expect(writes).toEqual([]);
  f.workspace.projectDir = "/old";
  const second = await surface.invoke(ctx, "assistant.reply_key", {
    source: f.source,
    key: f.key,
    keyName: "Enter",
  });
  expect(second.ok).toBe(false);
  expect(writes).toEqual([]);
});
it("successfully sends one explicit confirmation and resolves the shared notice", async () => {
  const f = fixture(),
    surface = new ControlSurface();
  registerAssistantMethods(surface, f.deps);
  let calls = 0;
  surface.register("agent.send_keys", {
    schema: AgentSendKeysParams,
    handler: (ctx) => {
      ctx.agentPromptGuard?.(f.pane.agent as any);
      calls++;
      return {};
    },
  });
  expect(
    (
      await surface.invoke({ clientId: "test", sink: {} as any }, "assistant.reply_key", {
        source: f.source,
        key: f.key,
        keyName: "y",
      })
    ).ok,
  ).toBe(true);
  expect(calls).toBe(1);
  expect(f.deps.notifications!.update).toHaveBeenCalled();
});

it("expires done notifications when seen or zero sequence even before queued input", () => {
  const f = fixture();
  f.pane.agent.state = "idle";
  const key = `done:${f.pane.agent.instanceId}:1`;
  const t = sourceTarget(f.deps, f.source, key);
  f.pane.agent.serverSeenSeq = 1;
  expect(() => t.guard()).toThrow();
  f.pane.agent.serverSeenSeq = 0;
  f.pane.agent.completionSeq = 0;
  expect(() => sourceTarget(f.deps, f.source, `done:${f.pane.agent.instanceId}:0`)).toThrow();
});

it("allows ordinary same-binding pane runtime replacement", () => {
  const f = fixture();
  const target = sourceTarget(f.deps, f.source, f.key);
  f.deps.session.getPane = () => ({ ...f.pane, busy: false }) as any;
  expect(() => target.guard()).not.toThrow();
});

it("rejects a replacement workspace object with the same UUID and a new project",()=>{
 const f=fixture();const target=sourceTarget(f.deps,f.source,f.key);f.deps.session.getWorkspace=()=>({...f.workspace,projectDir:"/replacement"})as any;expect(()=>target.guard()).toThrow("変更");
});
