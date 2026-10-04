import {
  itemRefOf,
  navigableRowsOfTree,
  sidebarTree,
  visibleWorkspaceIdsInOrder,
  type NavigateRow,
  type TopRow,
} from "@sodashitsu/client-core";
import type { PrefsModel } from "./PrefsModel.js";
import type { SessionModel } from "./SessionModel.js";

/**
 * サイドバーの描画の木（20261004-group-worktree-items。web の `store/sidebarTree.ts` と同じ役）。描画（`render/chrome/sidebar.ts`）と
 * キー操作（workspace の切り替え・番号・navigate の順）が**同じ関数**を通る——描画とキー操作の順をずらさないため。
 * レイアウトはサーバが配ったもの、無ければ（古いサーバ）`layoutFromLegacy` で導いたもの（`model.effectiveLayout()`）。
 */
export function currentSidebarTree(
  model: SessionModel,
  prefs: Pick<PrefsModel, "workspaceSort" | "ungroupedCollapsed">,
): TopRow[] {
  return sidebarTree(
    [...model.workspaces.values()],
    [...model.groups.values()],
    model.effectiveLayout(),
    prefs.workspaceSort,
    prefs.ungroupedCollapsed,
  );
}

/** サイドバーに見えている workspace の id（上から下へ）。畳んだ入れ物の中は今いる workspace だけ。 */
export function currentVisibleWorkspaceIds(
  model: SessionModel,
  prefs: Pick<PrefsModel, "workspaceSort" | "collapsedAutoGroups" | "ungroupedCollapsed">,
): string[] {
  return visibleWorkspaceIdsInOrder(
    currentSidebarTree(model, prefs),
    prefs.collapsedAutoGroups,
    model.workspaceId,
  );
}

/** navigate で選べる行（グループの見出し・「グループなし」の見出しを含む。上から下へ）。選択のキーは `navigateKeyOfRow`。 */
export function currentNavigableRows(
  model: SessionModel,
  prefs: Pick<PrefsModel, "workspaceSort" | "collapsedAutoGroups" | "ungroupedCollapsed">,
): NavigateRow[] {
  return navigableRowsOfTree(
    currentSidebarTree(model, prefs),
    prefs.collapsedAutoGroups,
    model.workspaceId,
  );
}

/**
 * その workspace の項目（リポジトリなら丸ごと）が今いるグループの id（「グループなし」なら null）。レイアウトで見るので、
 * 古いサーバでも `layoutFromLegacy` が導いた本体の所属で答える（worktree の子の行でも同じ答え。web の `itemGroupIdOf`）。
 */
export function itemGroupIdOf(model: SessionModel, workspaceId: string): string | null {
  const ws = model.workspaces.get(workspaceId);
  if (!ws) return null;
  const ref = itemRefOf(ws, [...model.workspaces.values()]);
  for (const [groupId, refs] of Object.entries(model.effectiveLayout().groups))
    if (refs.includes(ref)) return groupId;
  return null;
}
