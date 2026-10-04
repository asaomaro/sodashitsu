import type { ItemTarget } from "@sodashitsu/protocol";
import { UNGROUPED_REF, dropBefore, sameItemTarget } from "@sodashitsu/client-core";
import type { SidebarDragInfo } from "../render/chrome/sidebar.js";

/** 落とした結果（web の `Sidebar.vue` の `dropStateFor` と同じ決まり。20261004-group-worktree-items・追補 01）。 */
export type DropPlan =
  /** 何もしない（行の外・自分の項目の上・古いサーバで落とし先の workspace が無い行）。知らせない。 */
  | { kind: "none" }
  /** 送らず、利用者に知らせる。 */
  | { kind: "refuse"; reason: string }
  | {
      kind: "move";
      item: ItemTarget;
      /** 落とした項目の前（null は入れ物の末尾）。 */
      before: ItemTarget | null;
      /** `layout` の無い古いサーバの `workspace.move_to` 用。 */
      legacy: { workspaceIds: string[]; beforeWorkspaceId: string | null };
    };

export const REFUSE_CONTAINER =
  "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます";
export const REFUSE_BY_NAME = "名前順では並べ替えできません";

/**
 * 掴んだ行 `source` を `target` の行の上で離したときの扱い。落とせるのは同じ入れ物の中の項目の間だけ（グループの中・「グループなし」の
 * 中・一番上のまとまりの列）。上へ動かすなら落とした項目の前、下へなら落とした項目の次の前（末尾なら null）へ入れる。
 * 名前順で並ぶのは一番上のまとまりの列と「グループなし」の中（グループの中はレイアウトの順で並べ替えられる）。
 */
export function planDrop(
  source: SidebarDragInfo,
  target: SidebarDragInfo | undefined,
  opts: { hasServerLayout: boolean; sortByName: boolean },
): DropPlan {
  if (!target) return { kind: "none" };
  // 古いサーバは落とし先の workspace が要る（無い行＝メンバーのいない空のグループは落とし先にならない）。
  if (!opts.hasServerLayout && target.anchorId === null) return { kind: "none" };
  // 自分の項目の上（掴んだグループの中・掴んだ「グループなし」の中の行も含む）は何も起きない。
  if (
    sameItemTarget(target.item, source.item) ||
    (source.item.kind === "group" && target.container === source.item.groupId) ||
    (source.item.kind === "ungrouped" && target.container === UNGROUPED_REF)
  )
    return { kind: "none" };
  if (target.container !== source.container) return { kind: "refuse", reason: REFUSE_CONTAINER };
  if ((source.container === null || source.container === UNGROUPED_REF) && opts.sortByName)
    return { kind: "refuse", reason: REFUSE_BY_NAME };
  // `before` の決め方は web と共有（client-core の `dropBefore`）。
  const before = dropBefore(source, target);
  if (before === undefined) return { kind: "none" };
  // 古いサーバで落とし先が「次の項目」なのに workspace が無い（空のグループ）と、null が「末尾」の意味になってしまう。送らない。
  if (!opts.hasServerLayout && before !== null && before.anchorId === null) return { kind: "none" };
  return {
    kind: "move",
    item: source.item,
    before: before === null ? null : before.item,
    legacy: { workspaceIds: source.workspaceIds, beforeWorkspaceId: before?.anchorId ?? null },
  };
}

/** 古いサーバでは、掴めない行（メンバーのいない空のグループ・「グループなし」の見出し）がある。 */
export function canGrab(source: SidebarDragInfo, hasServerLayout: boolean): boolean {
  if (hasServerLayout) return true;
  return source.workspaceIds.length > 0 && source.item.kind !== "ungrouped";
}
