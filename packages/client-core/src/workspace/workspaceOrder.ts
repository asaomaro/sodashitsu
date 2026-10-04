import type { Workspace } from "@sodashitsu/protocol";
import type { WorkspaceSort } from "../prefs/types.js";

/**
 * workspace の表示順（純関数。20260923-missing-keybinding-actions）。元は `Sidebar.vue` の `spaces` computed と
 * `ActionDispatcher`（`previous_workspace`/`next_workspace`）が共有していた。20261004-group-worktree-items 以降、
 * 画面の順・操作の対象順は `sidebarTree` の木（`visibleWorkspaceIdsInOrder`）が決めるので、本番コードの呼び出し元は無い
 * （単体テストが「opened/name の順」の定義として使うだけ）。
 */
export function orderedWorkspaceIds(workspaces: Workspace[], sort: WorkspaceSort): string[] {
  // `opened`（既定）は並べ替えない——渡された配列の順（`session.workspaces` の反復順）のまま（design AC3）。
  if (sort === "opened") return workspaces.map((ws) => ws.id);
  // `name`：workspace のラベルの文字列順。`sort` は安定なので、同点（同名）なら渡された順が残る。
  return [...workspaces].sort((a, b) => a.label.localeCompare(b.label)).map((ws) => ws.id);
}
