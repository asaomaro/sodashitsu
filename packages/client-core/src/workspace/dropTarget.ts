import type { ItemTarget } from "@sodashitsu/protocol";

/**
 * ドラッグの落とし先の計算（純関数。web の `Sidebar.vue` と端末版の `input/sidebarDrag.ts` が共有する。
 * 20261004-group-worktree-items の T30）。`item.move` の `before` の決め方を 1 か所にして、2 つの画面で食い違わせない。
 */

/** 落とし先になる項目（`anchorId` は `layout` の無い古いサーバの `workspace.move_to` 用の、項目の先頭の workspace。空のグループは null）。 */
export interface DropAnchor {
  item: ItemTarget;
  anchorId: string | null;
}

/** 掴み・落とし先になる行の位置。`index` は同じ入れ物の中の番号（畳んで見えない項目も数える）、`next` は同じ入れ物の次の項目（最後なら null）。 */
export interface DropSlot extends DropAnchor {
  index: number;
  next: DropAnchor | null;
}

/** 入れ物の中の `i` 番目の次の項目（最後・範囲外なら null）。畳んで見えない項目も `list` に含めて数える。 */
export function nextAnchorOf<T>(
  list: readonly T[],
  i: number,
  toAnchor: (t: T) => DropAnchor,
): DropAnchor | null {
  const next = list[i + 1];
  return next === undefined ? null : toAnchor(next);
}

export function sameItemTarget(a: ItemTarget, b: ItemTarget): boolean {
  if (a.kind === "group") return b.kind === "group" && a.groupId === b.groupId;
  if (a.kind === "ungrouped") return b.kind === "ungrouped";
  return b.kind === "workspace" && a.workspaceId === b.workspaceId;
}

/**
 * 掴んだ項目 `source` を同じ入れ物の項目 `target` の上で離したときの `item.move` の `before`。上へ動かす（`target` が前にある）なら
 * 落とした項目の前、下へなら落とした項目の次の前（最後なら null＝入れ物の末尾）。自分自身の上（前へは入れられない）は `undefined`。
 */
export function dropBefore(
  source: Pick<DropSlot, "item" | "index">,
  target: DropSlot,
): DropAnchor | null | undefined {
  if (sameItemTarget(source.item, target.item)) return undefined;
  return target.index < source.index
    ? { item: target.item, anchorId: target.anchorId }
    : target.next;
}
