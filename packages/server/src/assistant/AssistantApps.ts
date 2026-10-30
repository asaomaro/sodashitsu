import {
  AssistantSessionAdoptParams,
  AssistantAppOpenParams,
  AssistantAppCallParams,
  RpcError,
  type AssistantAppsInfo,
} from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../surface/ControlSurface.js";
import type { MethodDeps } from "../surface/methods/deps.js";
/** Reuse approved extension views and correlated operations; never give a plugin native assistant IPC. */
export function registerAssistantApps(surface: ControlSurface, deps: MethodDeps) {
  const sessions = deps.assistantSessions,
    extensions = deps.extensions;
  if (!sessions || !extensions) return;
  const target = (p: { deviceId: string; instanceId: string }) =>
    sessions.target(p.deviceId, p.instanceId);
  const entries = (workspaceId: string) =>
    extensions
      .list()
      .extensions.filter(
        (entry) =>
          entry.state === "running" &&
          entry.runId &&
          extensions.canUseExtension(entry.key, workspaceId),
      );
  const entry = (p: { extensionKey: string; runId: string }, workspaceId: string) => {
    const entry = entries(workspaceId).find(
      (entry) => entry.key === p.extensionKey && entry.runId === p.runId,
    );
    if (!entry)
      throw new RpcError("not_found", "プラグインが停止・変更されたため一覧を更新してください");
    return entry;
  };
  surface.register("assistant.apps", {
    schema: AssistantSessionAdoptParams,
    handler: (_ctx, p) => {
      const t = target(p),
        result: AssistantAppsInfo = { instanceId: t.agent.instanceId, views: [], operations: [] };
      for (const ext of entries(t.workspaceId)) {
        for (const view of ext.views ?? [])
          if (view.assistant && (!view.targets || view.targets.includes("pane")))
            result.views.push({
              extensionKey: ext.key,
              runId: ext.runId!,
              id: view.id,
              title: view.title,
            });
        try {
          for (const operation of extensions.pluginOperations.list({
            key: ext.key,
            paneId: t.paneId,
          }).operations)
            if (operation.assistant)
              result.operations.push({ extensionKey: ext.key, runId: ext.runId!, ...operation });
        } catch {}
      }
      return result;
    },
  });
  const guard = (
    ctx: MethodContext,
    p: { deviceId: string; instanceId: string },
    before: ReturnType<typeof target>,
  ) => {
    if (ctx.connectionAuthorized && !ctx.connectionAuthorized())
      throw new RpcError("not_found", "接続が終了しました");
    const current = target(p);
    if (
      current.workspaceId !== before.workspaceId ||
      current.tabId !== before.tabId ||
      current.paneId !== before.paneId ||
      current.projectDir !== before.projectDir
    )
      throw new RpcError("not_found", "専用セッションが変更されました");
  };
  surface.register("assistant.app_open", {
    schema: AssistantAppOpenParams,
    handler: async (ctx, p) => {
      const t = target(p),
        ext = entry(p, t.workspaceId),
        view = ext.views?.find(
          (view) =>
            view.id === p.viewId &&
            view.assistant &&
            (!view.targets || view.targets.includes("pane")),
        );
      if (!view) throw new RpcError("not_found", "アシスタント用のビューがありません");
      guard(ctx, p, t);
      if (
        !deps.session
          .getTab(t.tabId)
          ?.views?.some(
            (value) =>
              value.extensionKey === p.extensionKey &&
              value.viewId === p.viewId &&
              value.target === "pane" &&
              value.paneId === t.paneId,
          )
      ) {
        const response = await surface.invoke(ctx, "tab.add_view", {
          tabId: t.tabId,
          extensionKey: p.extensionKey,
          viewId: p.viewId,
          target: "pane",
          paneId: t.paneId,
          placement: view.placements.includes("right") ? "right" : view.placements[0]!,
        });
        if (!response.ok) throw new RpcError(response.error.code, response.error.message);
      }
      guard(ctx, p, t);
      return {};
    },
  });
  surface.register("assistant.app_call", {
    schema: AssistantAppCallParams,
    handler: async (ctx, p) => {
      const t = target(p);
      entry(p, t.workspaceId);
      const operation = extensions.pluginOperations
        .list({ key: p.extensionKey, paneId: t.paneId })
        .operations.find((operation) => operation.name === p.operation && operation.assistant);
      if (!operation) throw new RpcError("not_found", "アシスタント用の操作がありません");
      guard(ctx, p, t);
      const result = await extensions.pluginOperations.call({
        key: p.extensionKey,
        paneId: t.paneId,
        operation: p.operation,
        params: p.params,
      });
      guard(ctx, p, t);
      return result;
    },
  });
}
