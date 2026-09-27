import {
  PaneCloseParams,
  PaneEditScrollbackParams,
  PaneFocusDirectionParams,
  PaneFocusParams,
  PaneInputSetParams,
  PaneMoveToEdgeParams,
  PaneMoveToNewTabParams,
  PaneMoveToTabParams,
  PaneRenameParams,
  PaneReplaceParams,
  PaneReportMetadataParams,
  PaneResizeParams,
  PaneSplitParams,
  PaneSwapParams,
  PaneSwapWithParams,
  PaneZoomParams,
} from "@wtm/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerPaneMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("pane.split", {
    schema: PaneSplitParams,
    handler: async (ctx, params) => {
      deps.clients.touch(ctx.clientId); // 起動の猶予より前に（色の問い合わせの答え。20260921-theme-settings の decisions D13）
      const result = await deps.session.splitPane(
        params.paneId,
        params.direction,
        params.ratio,
        params.newCwd,
      );
      deps.sizeAuthority.noteInteraction(ctx.clientId, result.pane.id);
      return result;
    },
  });

  surface.register("pane.close", {
    schema: PaneCloseParams,
    handler: async (_ctx, params) => {
      await deps.session.closePane(params.paneId);
      return {};
    },
  });

  surface.register("pane.focus", {
    schema: PaneFocusParams,
    handler: (ctx, params) => {
      // 未知の paneId は `SessionModel.focusPane`（内部の `requirePane`）が投げる `NotFoundError` を
      // `ControlSurface.invoke` が `not_found` に読み替える（レビュー指摘。個別ガードは不要になった）。
      deps.session.focusPane(params.paneId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return {};
    },
  });

  surface.register("pane.rename", {
    schema: PaneRenameParams,
    handler: (_ctx, params) => {
      deps.session.renamePane(params.paneId, params.label);
      return {};
    },
  });

  // 独自トークンの報告（20260927-sidebar-row-tokens。herdr の pane.report_metadata のうちトークンだけ）。
  const metadata = deps.metadata;
  if (metadata) {
    surface.register("pane.report_metadata", {
      schema: PaneReportMetadataParams,
      handler: (_ctx, params) => {
        metadata.reportPane(params);
        return {};
      },
    });
  }

  surface.register("pane.focus_direction", {
    schema: PaneFocusDirectionParams,
    handler: (ctx, params) => {
      const target = deps.session.focusPaneDirection(params.paneId, params.direction);
      deps.sizeAuthority.noteInteraction(ctx.clientId, target);
      return { paneId: target };
    },
  });

  surface.register("pane.swap", {
    schema: PaneSwapParams,
    handler: (ctx, params) => {
      const other = deps.session.swapPane(params.paneId, params.direction);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return { paneId: other };
    },
  });

  surface.register("pane.swap_with", {
    schema: PaneSwapWithParams,
    handler: (ctx, params) => {
      const ok = deps.session.swapPaneWith(params.paneId, params.otherPaneId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return { ok };
    },
  });

  // 20260924-pane-dnd-split-move（ドラッグでの分割）。
  surface.register("pane.move_to_edge", {
    schema: PaneMoveToEdgeParams,
    handler: (ctx, params) => {
      const ok = deps.session.moveToEdge(params.paneId, params.targetPaneId, params.edge);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return { ok };
    },
  });

  // 20260924-pane-dnd-split-move（ドラッグでの分割解除）。
  surface.register("pane.replace", {
    schema: PaneReplaceParams,
    handler: (ctx, params) => {
      const ok = deps.session.replacePane(params.paneId, params.targetPaneId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return { ok };
    },
  });

  // 20260924-pane-move-cross-tab（ドラッグでの別 tab への移動）。
  surface.register("pane.move_to_tab", {
    schema: PaneMoveToTabParams,
    handler: (ctx, params) => {
      const ok = deps.session.moveToTab(params.paneId, params.targetTabId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return { ok };
    },
  });

  // 20260924-pane-move-cross-tab（ドラッグでの別 workspace の新しい tab への移動）。
  surface.register("pane.move_to_new_tab", {
    schema: PaneMoveToNewTabParams,
    handler: (ctx, params) => {
      const tab = deps.session.moveToNewTab(params.paneId, params.targetWorkspaceId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return tab ? { ok: true as const, tab } : { ok: false as const };
    },
  });

  surface.register("pane.zoom", {
    schema: PaneZoomParams,
    handler: (ctx, params) => {
      deps.session.zoomPane(params.paneId, params.mode);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return {};
    },
  });

  surface.register("pane.resize", {
    schema: PaneResizeParams,
    handler: (ctx, params) => {
      deps.session.resizePaneByDirection(params.paneId, params.direction, params.amount);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      return {};
    },
  });

  // 20260926-edit-scrollback（herdr の pane.edit_scrollback）。エディタの pane も作る方式なので、分割と同じく先に操作の時刻を進める。
  surface.register("pane.edit_scrollback", {
    schema: PaneEditScrollbackParams,
    handler: async (ctx, params) => {
      deps.clients.touch(ctx.clientId);
      const result = await deps.session.editScrollback(params.paneId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, result.pane.id);
      return result;
    },
  });

  surface.register("pane.input.set", {
    schema: PaneInputSetParams,
    handler: (_ctx, params) => {
      deps.session.setPaneRightClick(params.paneId, params.rightClick);
      return {};
    },
  });
}
