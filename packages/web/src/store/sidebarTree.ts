import { itemRefOf, navigableRowsOfTree, sidebarTree, visibleWorkspaceIdsOfTree, type NavigateRow, type TopRow } from "@sodashitsu/client-core";
import type { useSessionStore } from "./session.js";
import type { useViewStore } from "./view.js";

/**
 * サイドバーの描画の木（20261004-group-worktree-items）。描画（`Sidebar.vue`）とキー操作
 * （`ActionDispatcher` の workspace の切り替え・navigate の上下）が**同じ関数**を通る——描画とキー操作の順を
 * ずらさないため（前の work で、描画だけ替えてキー操作の順が古いまま残る回帰があった）。
 * `workspaces` は「開いた順」そのまま（`session.workspaces` の反復順）。レイアウトはサーバが配ったもの、
 * 無ければ（古いサーバ）`layoutFromLegacy` で導いたもの（`session.effectiveLayout`）。
 */
export function currentSidebarTree(
  session: ReturnType<typeof useSessionStore>,
  view: ReturnType<typeof useViewStore>,
): TopRow[] {
  return sidebarTree([...session.workspaces.values()], [...session.groups.values()], session.effectiveLayout, view.workspaceSort, view.ungroupedCollapsed);
}

/** サイドバーに見えている workspace の id（上から下へ）。畳んだ入れ物の中は今いる workspace だけ。 */
export function currentVisibleWorkspaceIds(
  session: ReturnType<typeof useSessionStore>,
  view: ReturnType<typeof useViewStore>,
): string[] {
  return visibleWorkspaceIdsOfTree(currentSidebarTree(session, view), view.collapsedAutoGroups, view.workspaceId);
}

/** navigate で選べる行（グループの見出しを含む。上から下へ）。選択のキーは `navigateKeyOfRow`。 */
export function currentNavigableRows(
  session: ReturnType<typeof useSessionStore>,
  view: ReturnType<typeof useViewStore>,
): NavigateRow[] {
  // 暫定（T26 で直す）: 「グループなし」の見出しはまだ描かないので、選べる行から外す。
  return navigableRowsOfTree(currentSidebarTree(session, view), view.collapsedAutoGroups, view.workspaceId).filter((r) => r.kind !== "ungrouped");
}

/**
 * その workspace の項目（リポジトリなら丸ごと）が今いるグループの id（一番上なら null）。レイアウトで見るので、
 * 古いサーバでも `layoutFromLegacy` が導いた本体の所属で答える（worktree の子の行でも同じ答え）。
 */
export function itemGroupIdOf(session: ReturnType<typeof useSessionStore>, workspaceId: string): string | null {
  const ws = session.workspaces.get(workspaceId);
  if (!ws) return null;
  const ref = itemRefOf(ws, [...session.workspaces.values()]);
  for (const [groupId, refs] of Object.entries(session.effectiveLayout.groups)) if (refs.includes(ref)) return groupId;
  return null;
}
