import {
  WorkspaceCloseParams,
  WorkspaceCreateParams,
  WorkspaceFocusParams,
  WorkspaceMoveParams,
  WorkspaceMoveToParams,
  WorkspaceRenameParams,
  WorkspaceReportMetadataParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

export function registerWorkspaceMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("workspace.create", {
    schema: WorkspaceCreateParams,
    handler: async (ctx, params) => {
      deps.clients.touch(ctx.clientId); // 作る操作も操作（色の問い合わせの答え。20260921-theme-settings の decisions D13）
      const result = await deps.session.createWorkspace(params.cwd, params.label, params.newCwd);
      // 20260925-workspace-git-immediate（design「設計方針」）。応答は待たせない（fire-and-forget）。
      // 結果は既存の workspace.updated イベントで届く。
      void deps.gitPoller.pollWorkspaceNow(result.workspace.id).catch(() => undefined);
      deps.lineage?.noteCreated(result.pane.id, params.callerPaneId); // 20261003-graph-auto-nodes
      return result;
    },
  });

  surface.register("workspace.rename", {
    schema: WorkspaceRenameParams,
    // `label: null` は自動の名前に戻す（20260921-workspace-auto-label）。**await してから応答する**——await しないと、無い workspace の
    // `RpcError("not_found")` の拒否が not_found の応答に届かず未処理の拒否になり、応答も `workspace.updated` より先に返る。
    handler: async (_ctx, params) => {
      await deps.session.renameWorkspace(params.workspaceId, params.label);
      return {};
    },
  });

  surface.register("workspace.focus", {
    schema: WorkspaceFocusParams,
    handler: (ctx, params) => {
      deps.session.focusWorkspace(params.workspaceId);
      const focus = deps.session.snapshot().focus;
      if (focus) deps.sizeAuthority.noteInteraction(ctx.clientId, focus.paneId);
      return {};
    },
  });

  surface.register("workspace.close", {
    schema: WorkspaceCloseParams,
    handler: async (_ctx, params) => {
      await deps.session.closeWorkspace(params.workspaceId, params.closeLinkedWorktrees);
      return {};
    },
  });

  // 独自トークンの報告（20260927-sidebar-row-tokens。herdr の workspace.report_metadata）。検査・帳簿・配布は MetadataService。
  const metadata = deps.metadata;
  if (metadata) {
    surface.register("workspace.report_metadata", {
      schema: WorkspaceReportMetadataParams,
      handler: (_ctx, params) => {
        metadata.reportWorkspace(params);
        return {};
      },
    });
  }

  // 20260923-workspace-grouping（キーバインド用。delta 指定。`tab.move` と同じ形）。
  surface.register("workspace.move", {
    schema: WorkspaceMoveParams,
    handler: (_ctx, params) => {
      deps.session.moveWorkspace(params.workspaceId, params.direction);
      return {};
    },
  });

  // 20260923-workspace-grouping（D&D 用。anchor 指定。単一・グループ一括の両方を同じ経路で扱う）。
  surface.register("workspace.move_to", {
    schema: WorkspaceMoveToParams,
    handler: (_ctx, params) => {
      deps.session.moveWorkspacesTo(params.workspaceIds, params.beforeWorkspaceId);
      return {};
    },
  });
}
