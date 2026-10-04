import { ItemMoveByParams, ItemMoveParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * 項目（グループ・リポジトリ・管理外の workspace）の並べ替え（20261004-group-worktree-items）。同じ入れ物の中だけ。
 * 受け付けない移動（入れ物が違う・自分自身の前・端）は `{ moved: false }`（エラーにしない）。実在しない ID は `not_found`。
 */
export function registerItemMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("item.move", {
    schema: ItemMoveParams,
    handler: (_ctx, params) => deps.session.moveItem(params.item, params.before),
  });

  surface.register("item.move_by", {
    schema: ItemMoveByParams,
    handler: (_ctx, params) => deps.session.moveItemBy(params.item, params.direction),
  });
}
