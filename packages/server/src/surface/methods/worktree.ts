import { WorktreeCreateParams, WorktreeListParams, WorktreeRemoveParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * worktree の一覧・作成・削除（一覧・作成は 20260920-git-worktree-actions。
 * 削除は 20260924-worktree-remove）。
 * **「開く」に方式は無い**——それは `workspace.create` に cwd を渡すだけなので、既にある機能で足りる。
 */
export function registerWorktreeMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("worktree.list", {
    schema: WorktreeListParams,
    handler: (_ctx, params) => deps.worktrees.list(params.workspaceId),
  });

  surface.register("worktree.create", {
    schema: WorktreeCreateParams,
    handler: (_ctx, params) => deps.worktrees.create(params.workspaceId, params.branch),
  });

  surface.register("worktree.remove", {
    schema: WorktreeRemoveParams,
    handler: async (_ctx, params) => {
      await deps.worktrees.remove(params.workspaceId, params.path, params.force ?? false);
      return {};
    },
  });
}
