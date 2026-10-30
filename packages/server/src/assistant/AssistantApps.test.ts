import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { TabAddViewParams } from "@sodashitsu/protocol";
import { registerAssistantApps } from "./AssistantApps.js";
import { ControlSurface } from "../surface/ControlSurface.js";
import type { MethodDeps } from "../surface/methods/deps.js";
function fixture() {
  const actor = randomUUID(),
    deviceId = randomUUID(),
    paneId = randomUUID(),
    tabId = randomUUID(),
    workspaceId = randomUUID(),
    runId = randomUUID();
  const t = { paneId, tabId, workspaceId, projectDir: "/original", agent: { instanceId: actor } },
    views: any[] = [];
  const ext = {
    key: "project:demo",
    state: "running",
    runId,
    views: [
      {
        id: "assistant",
        title: "Assistant UI",
        assistant: true,
        targets: ["pane"],
        placements: ["right"],
      },
    ],
  };
  const operations = [
    { name: "search", assistant: true, description: "Search", inputSchema: { type: "object" } },
    { name: "private", assistant: false, description: "private", inputSchema: {} },
  ];
  const canUse = vi.fn(() => true),
    call = vi.fn(async () => ({ result: "<img src=x>literal" }));
  const deps = {
    assistantSessions: { target: vi.fn(() => ({ ...t })) },
    session: { getTab: () => ({ views }) },
    extensions: {
      list: () => ({ extensions: [ext] }),
      canUseExtension: canUse,
      pluginOperations: { list: () => ({ operations }), call },
    },
  } as unknown as MethodDeps;
  const surface = new ControlSurface();
  registerAssistantApps(surface, deps);
  surface.register("tab.add_view", {
    schema: TabAddViewParams,
    handler: (_ctx, p) => {
      views.push({ ...p, paneId: p.paneId });
      return {};
    },
  });
  const ctx = { clientId: "test", sink: {} as any },
    params = { deviceId, instanceId: actor, extensionKey: ext.key, runId };
  return { surface, ctx, params, ext, t, canUse, call, views };
}
it("uses only in-scope running registered assistant views and actions", async () => {
  const f = fixture();
  const catalog = await f.surface.invoke(f.ctx, "assistant.apps", {
    deviceId: f.params.deviceId,
    instanceId: f.params.instanceId,
  });
  expect(catalog.ok && catalog.result).toMatchObject({
    views: [{ id: "assistant" }],
    operations: [{ name: "search" }],
  });
  expect(
    (await f.surface.invoke(f.ctx, "assistant.app_open", { ...f.params, viewId: "assistant" })).ok,
  ).toBe(true);
  expect(
    (await f.surface.invoke(f.ctx, "assistant.app_open", { ...f.params, viewId: "assistant" })).ok,
  ).toBe(true);
  expect(f.views).toHaveLength(1);
  expect(
    (
      await f.surface.invoke(f.ctx, "assistant.app_call", {
        ...f.params,
        operation: "private",
        params: {},
      })
    ).ok,
  ).toBe(false);
  expect(f.call).not.toHaveBeenCalled();
  f.canUse.mockReturnValue(false);
  expect(
    (
      await f.surface.invoke(f.ctx, "assistant.app_call", {
        ...f.params,
        operation: "search",
        params: {},
      })
    ).ok,
  ).toBe(false);
  expect(f.call).not.toHaveBeenCalled();
});
it("rejects restarted extension run ids and moved project responses", async () => {
  const f = fixture();
  f.ext.runId = randomUUID();
  expect(
    (
      await f.surface.invoke(f.ctx, "assistant.app_call", {
        ...f.params,
        operation: "search",
        params: {},
      })
    ).ok,
  ).toBe(false);
  expect(f.call).not.toHaveBeenCalled();
  f.ext.runId = f.params.runId;
  let finish!: (value: any) => void;
  f.call.mockImplementation(
    () =>
      new Promise<{result:string}>((resolve) => {
        finish = resolve;
      }),
  );
  const request = f.surface.invoke(f.ctx, "assistant.app_call", {
    ...f.params,
    operation: "search",
    params: { query: "test" },
  });
  f.t.projectDir = "/replacement";
  finish({ result: "stale" });
  expect((await request).ok).toBe(false);
  expect(f.call).toHaveBeenCalledWith({
    key: f.params.extensionKey,
    paneId: f.t.paneId,
    operation: "search",
    params: { query: "test" },
  });
});
