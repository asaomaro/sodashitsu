import { TabCloseParams, TabCreateParams, TabFocusParams, TabMoveParams, TabRenameParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerTabMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("tab.create", {
    schema: TabCreateParams,
    handler: async (ctx, params) => {
      // 作る操作も操作——作った pane のシェルが起動の直後に色を問い合わせたら、作った人の配色で答える（20260921-theme-settings の decisions D13）。
      deps.clients.touch(ctx.clientId);
      const result = await deps.session.createTab(params.workspaceId, params.label, params.newCwd);
      deps.lineage?.noteCreated(result.pane.id, params.callerPaneId); // 20261003-graph-auto-nodes
      return result;
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
