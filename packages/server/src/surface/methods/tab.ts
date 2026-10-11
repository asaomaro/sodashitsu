import { RpcError, TabCloseParams, TabCreateParams, TabFocusParams, TabMoveParams, TabRenameParams, TabPerspectiveParams, TabAddViewParams, TabRemoveViewParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerTabMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("tab.create", {
    schema: TabCreateParams,
    handler: async (ctx, params) => {
      // 作る操作も操作——作った pane のシェルが起動の直後に色を問い合わせたら、作った人の配色で答える（20260921-theme-settings の decisions D13）。
      deps.clients.touch(ctx.clientId);
      if (params.plugin) {
        const available = deps.extensions?.list().extensions.find(e => e.key === params.plugin!.extensionKey);
        if (!available || available.state !== "running" || available.tabView?.display !== params.plugin.display) throw new RpcError("invalid_params", "選択したプラグインビューは利用できません");
        const wsId = params.workspaceId ?? deps.session.snapshot().focus?.workspaceId;
        const ws = deps.session.snapshot().workspaces.find(w => w.id === wsId);
        if (!ws || !deps.extensions?.canOpenTab(available.key, ws.id)) throw new RpcError("invalid_params", "別のPJのプラグインは開けません");
        if (available.tabView?.requiresProject !== false && !ws.projectDir) throw new RpcError("invalid_params", "先にワークスペースのPJフォルダを設定してください");
      }
      const result = await deps.session.createTab(params.workspaceId, params.label, params.newCwd, params.plugin);
      deps.lineage?.noteCreated(result.pane.id, params.callerPaneId); // 20261003-graph-auto-nodes
      return result;
    },
  });

  surface.register("tab.set_perspective", {
    schema: TabPerspectiveParams,
    handler: (_ctx, p) => { deps.session.setTabPerspective(p.tabId, p.perspective); return {}; },
  });
  surface.register("tab.add_view", {
    schema: TabAddViewParams,
    handler: (_ctx, p) => {
      const tab = deps.session.getTab(p.tabId);
      if (!tab) throw new RpcError("not_found", "タブが見つかりません");
      const ext = deps.extensions?.list().extensions.find(e => e.key === p.extensionKey);
      const definition = ext?.views?.find(v => v.id === p.viewId);
      if (!definition || !deps.extensions?.canUseExtension(p.extensionKey, tab.workspaceId)) throw new RpcError("invalid_params", "このビューはこのPJでは利用できません");
      if (!definition.placements.includes(p.placement)) throw new RpcError("invalid_params", "このビューは指定された配置に対応していません");
      const workspace = deps.session.snapshot().workspaces.find(w => w.id === tab.workspaceId);
      if (definition.requiresProject !== false && !workspace?.projectDir) throw new RpcError("invalid_params", "PJフォルダを設定してください");
      return deps.session.addTabView(p.tabId, { extensionKey: p.extensionKey, viewId: p.viewId, target: p.target, placement: p.placement }, p.paneId);
    },
  });
  surface.register("tab.remove_view", {
    schema: TabRemoveViewParams,
    handler: (_ctx, p) => {
      const v = deps.session.removeTabView(p.tabId, p.viewInstanceId);
      if (deps.session.hasPane(v.paneId)) deps.displays?.close(v.paneId, { name: v.display });
      return {};
    },
  });

  surface.register("tab.rename", {
    schema: TabRenameParams,
    handler: (_ctx, params) => {
      deps.session.renameTab(params.tabId, params.label);
      return {};
    },
  });

  surface.register("tab.focus", {
    schema: TabFocusParams,
    handler: (ctx, params) => {
      deps.session.focusTab(params.tabId);
      const focusedPaneId = deps.session.getTab(params.tabId)?.focusedPaneId;
      if (focusedPaneId) deps.sizeAuthority.noteInteraction(ctx.clientId, focusedPaneId);
      return {};
    },
  });

  surface.register("tab.move", {
    schema: TabMoveParams,
    handler: (_ctx, params) => {
      deps.session.moveTab(params.tabId, params.direction);
      return {};
    },
  });

  surface.register("tab.close", {
    schema: TabCloseParams,
    handler: async (_ctx, params) => {
      await deps.session.closeTab(params.tabId);
      return {};
    },
  });
}
