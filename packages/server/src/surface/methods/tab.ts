import {
  viewSupportsTarget,
  BUILTIN_WORKSPACE_KEY,
  BUILTIN_VIEWS,
  BUILTIN_DEVELOPMENT_DISPLAY,
  RpcError,
  TabCloseParams,
  TabCreateParams,
  TabFocusParams,
  TabMoveParams,
  TabRenameParams,
  TabPerspectiveParams,
  TabAddViewParams,
  TabRemoveViewParams,
  TabMoveViewParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerTabMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("tab.create", {
    schema: TabCreateParams,
    handler: async (ctx, params) => {
      // 作る操作も操作——作った pane のシェルが起動の直後に色を問い合わせたら、作った人の配色で答える（20260921-theme-settings の decisions D13）。
      deps.clients.touch(ctx.clientId);
      let plugin = params.plugin;
      if (params.plugin?.extensionKey === BUILTIN_WORKSPACE_KEY) {
        const ws = deps.session
          .snapshot()
          .workspaces.find(
            (w) => w.id === (params.workspaceId ?? deps.session.snapshot().focus?.workspaceId),
          );
        if (!ws?.projectDir || params.plugin.display !== BUILTIN_DEVELOPMENT_DISPLAY)
          throw new RpcError("invalid_params", "開発タブにはPJフォルダ設定が必要です");
        plugin = { extensionKey: BUILTIN_WORKSPACE_KEY, display: BUILTIN_DEVELOPMENT_DISPLAY };
      } else if (params.plugin) {
        const available = deps.extensions
          ?.list()
          .extensions.find((e) => e.key === params.plugin!.extensionKey);
        if (
          !available ||
          available.state !== "running" ||
          available.tabView?.display !== params.plugin.display
        )
          throw new RpcError("invalid_params", "選択したプラグインビューは利用できません");
        if (
          params.plugin.mobileDisplay &&
          params.plugin.mobileDisplay !== available.tabView.mobileDisplay
        )
          throw new RpcError("invalid_params", "モバイルビューがプラグインの登録と一致しません");
        plugin = {
          extensionKey: available.key,
          display: available.tabView.display,
          ...(available.tabView.terminalDisplay
            ? { terminalDisplay: available.tabView.terminalDisplay }
            : {}),
          ...(available.tabView.mobileDisplay
            ? { mobileDisplay: available.tabView.mobileDisplay }
            : {}),
        };
        const wsId = params.workspaceId ?? deps.session.snapshot().focus?.workspaceId;
        const ws = deps.session.snapshot().workspaces.find((w) => w.id === wsId);
        if (!ws || !deps.extensions?.canOpenTab(available.key, ws.id))
          throw new RpcError("invalid_params", "別のPJのプラグインは開けません");
        if (available.tabView?.requiresProject !== false && !ws.projectDir)
          throw new RpcError("invalid_params", "先にワークスペースのPJフォルダを設定してください");
      }
      const result = await deps.session.createTab(
        params.workspaceId,
        params.label,
        params.newCwd,
        plugin,
      );
      deps.lineage?.noteCreated(result.pane.id, params.callerPaneId); // 20261003-graph-auto-nodes
      return result;
    },
  });

  surface.register("tab.set_perspective", {
    schema: TabPerspectiveParams,
    handler: (_ctx, p) => {
      deps.session.setTabPerspective(p.tabId, p.perspective);
      return {};
    },
  });
  surface.register("tab.add_view", {
    schema: TabAddViewParams,
    handler: (_ctx, p) => {
      const tab = deps.session.getTab(p.tabId);
      if (!tab) throw new RpcError("not_found", "タブが見つかりません");
      const ext = deps.extensions?.list().extensions.find((e) => e.key === p.extensionKey);
      const builtin = p.extensionKey === BUILTIN_WORKSPACE_KEY;
      const definition: import("@sodashitsu/protocol").ExtensionViewDefinition | undefined = builtin
        ? (BUILTIN_VIEWS.find(
            (v) => v.id === p.viewId,
          ) as unknown as import("@sodashitsu/protocol").ExtensionViewDefinition)
        : ext?.views?.find((v) => v.id === p.viewId);
      if (
        !definition ||
        (!builtin && !deps.extensions?.canUseExtension(p.extensionKey, tab.workspaceId))
      )
        throw new RpcError("invalid_params", "このビューはこのPJでは利用できません");
      if (!viewSupportsTarget(definition, p.target))
        throw new RpcError("invalid_params", "このビューは指定された情報の対象に対応していません");
      if (!definition.placements.includes(p.placement))
        throw new RpcError("invalid_params", "このビューは指定された配置に対応していません");
      const workspace = deps.session.snapshot().workspaces.find((w) => w.id === tab.workspaceId);
      if (definition.requiresProject !== false && !workspace?.projectDir)
        throw new RpcError("invalid_params", "PJフォルダを設定してください");
      return deps.session.addTabView(
        p.tabId,
        {
          extensionKey: p.extensionKey,
          viewId: p.viewId,
          target: p.target,
          // ファイル/Gitは端末クライアントが直接描画し、表示枠の上限を二重消費しない。
          ...(definition.terminal && !builtin ? { terminal: definition.terminal } : {}),
          informationTarget: builtin && p.viewId === "statusline" ? "pane" : definition.targets?.length === 1 ? definition.targets[0] : p.target,
          placement: p.placement,
        },
        p.paneId,
      );
    },
  });
  surface.register("tab.move_view", {
    schema: TabMoveViewParams,
    handler: (_ctx, p) => {
      const tab = deps.session.getTab(p.tabId),
        v = tab?.views?.find((v) => v.id === p.viewInstanceId);
      if (!v) throw new RpcError("not_found", "ビューが見つかりません");
      const def =
        v.extensionKey === BUILTIN_WORKSPACE_KEY
          ? BUILTIN_VIEWS.find((d) => d.id === v.viewId)
          : deps.extensions
              ?.list()
              .extensions.find((e) => e.key === v.extensionKey)
              ?.views?.find((d) => d.id === v.viewId);
      if (!def?.placements.includes(p.placement as never))
        throw new RpcError("invalid_params", "このビューは指定された配置に対応していません");
      deps.session.moveTabView(p.tabId, p.viewInstanceId, p.placement);
      return {};
    },
  });
  surface.register("tab.remove_view", {
    schema: TabRemoveViewParams,
    handler: (_ctx, p) => {
      const v = deps.session.removeTabView(p.tabId, p.viewInstanceId);
      if (deps.session.hasPane(v.paneId)) {
        deps.displays?.close(v.paneId, { name: v.display });
        if (v.terminalDisplay) deps.displays?.close(v.paneId, { name: v.terminalDisplay });
      }
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
