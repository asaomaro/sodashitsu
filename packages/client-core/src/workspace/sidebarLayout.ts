import type {
  GroupId,
  ItemRef,
  SidebarLayout,
  Workspace,
  WorkspaceGroup,
  WorkspaceId,
} from "@sodashitsu/protocol";
import { itemRefOf, repoMembers } from "./workspaceGrouping.js";

/**
 * サイドバーのレイアウト（`SidebarLayout`）を変える純関数（20261004-group-worktree-items）。サーバの
 * `SessionModel` が使う。どれも引数を書き換えず、新しいレイアウトを返す。変わらないときは**同じ参照**を
 * 返す（呼び出し側は `===` で「変わったか」を見られる）。
 *
 * 入れ物は「一番上（`null`）」か「グループの中（`GroupId`）」。入れ子は 1 段なので、`g:` は一番上にしか入らない。
 */

type Container = GroupId | null;

const groupRef = (groupId: GroupId): ItemRef => `g:${groupId}`;

function listOf(layout: SidebarLayout, container: Container): readonly ItemRef[] {
  return container === null ? layout.top : (layout.groups[container] ?? []);
}

function withList(layout: SidebarLayout, container: Container, list: ItemRef[]): SidebarLayout {
  return container === null
    ? { top: list, groups: layout.groups, ungrouped: layout.ungrouped }
    : { top: layout.top, groups: { ...layout.groups, [container]: list }, ungrouped: layout.ungrouped };
}

/** 項目が今いる入れ物。どこにも無ければ `undefined`（`null` は一番上）。 */
function containerOf(layout: SidebarLayout, ref: ItemRef): Container | undefined {
  if (layout.top.includes(ref)) return null;
  for (const [groupId, list] of Object.entries(layout.groups)) {
    if (list.includes(ref)) return groupId;
  }
  return undefined;
}

/**
 * 項目を入れ物へ足す。`before` がその入れ物にあればその前へ、`null`・無ければ末尾へ。
 * すでに別の場所にあっても消さない（先に `removeItem` する）。同じ入れ物にすでにあれば何もしない。
 * グループの中へ `g:` は入れない。存在しないグループへも入れない。
 */
export function insertItem(
  layout: SidebarLayout,
  ref: ItemRef,
  container: Container,
  before: ItemRef | null = null,
): SidebarLayout {
  if (container !== null && (ref.startsWith("g:") || !(container in layout.groups))) return layout;
  const list = listOf(layout, container);
  if (list.includes(ref)) return layout;
  const index = before === null ? -1 : list.indexOf(before);
  const next = [...list];
  if (index === -1) next.push(ref);
  else next.splice(index, 0, ref);
  return withList(layout, container, next);
}

/** 項目をどの入れ物からも外す（`groups[...]` のキー自体は消さない。空になっても残す）。 */
export function removeItem(layout: SidebarLayout, ref: ItemRef): SidebarLayout {
  const container = containerOf(layout, ref);
  if (container === undefined) return layout;
  return withList(
    layout,
    container,
    listOf(layout, container).filter((r) => r !== ref),
  );
}

/**
 * 同じ入れ物の中で、項目を `before` の前（`null` は末尾）へ動かす。`moved` は「受け付けたか」
 * （位置が変わらなくても受け付ければ `true`）。受け付けないのは、項目が無い・自分自身の前・
 * `before` が別の入れ物（グループをグループの中へ、一番上と中をまたぐ、を含む）。
 */
export function moveItem(
  layout: SidebarLayout,
  ref: ItemRef,
  before: ItemRef | null,
): { layout: SidebarLayout; moved: boolean } {
  const container = containerOf(layout, ref);
  if (container === undefined || before === ref) return { layout, moved: false };
  const list = listOf(layout, container);
  if (before !== null && !list.includes(before)) return { layout, moved: false };
  const rest = list.filter((r) => r !== ref);
  const index = before === null ? rest.length : rest.indexOf(before);
  rest.splice(index, 0, ref);
  if (rest.every((r, i) => r === list[i])) return { layout, moved: true };
  return { layout: withList(layout, container, rest), moved: true };
}

/** 同じ入れ物の中で 1 つ動かす。端では動かない（巡回しない）ので `moved: false`。 */
export function moveItemBy(
  layout: SidebarLayout,
  ref: ItemRef,
  direction: "previous" | "next",
): { layout: SidebarLayout; moved: boolean } {
  const container = containerOf(layout, ref);
  if (container === undefined) return { layout, moved: false };
  const list = listOf(layout, container);
  const index = list.indexOf(ref);
  const target = direction === "previous" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return { layout, moved: false };
  const next = [...list];
  next[index] = list[target]!;
  next[target] = ref;
  return { layout: withList(layout, container, next), moved: true };
}

/** 項目をグループの末尾へ入れる（別の場所にあれば移す）。`g:`・存在しないグループは何もしない。 */
export function addItemToGroup(
  layout: SidebarLayout,
  ref: ItemRef,
  groupId: GroupId,
): SidebarLayout {
  if (ref.startsWith("g:") || !(groupId in layout.groups)) return layout;
  const without = removeItem(layout, ref);
  return insertItem(without, ref, groupId, null);
}

/** 項目をグループから出し、一番上の、そのグループの直後へ置く。グループの中に無ければ何もしない。 */
export function removeItemFromGroup(layout: SidebarLayout, ref: ItemRef): SidebarLayout {
  const container = containerOf(layout, ref);
  if (container === null || container === undefined) return layout;
  const without = removeItem(layout, ref);
  const top = [...without.top];
  const at = top.indexOf(groupRef(container));
  top.splice(at === -1 ? top.length : at + 1, 0, ref);
  return { top, groups: without.groups, ungrouped: without.ungrouped };
}

/** グループを消し、中の項目をグループのあった位置へ順に出す。グループが一番上に無ければ末尾へ出す。 */
export function deleteGroupFromLayout(layout: SidebarLayout, groupId: GroupId): SidebarLayout {
  const ref = groupRef(groupId);
  if (!(groupId in layout.groups) && !layout.top.includes(ref)) return layout;
  const items = layout.groups[groupId] ?? [];
  const top = [...layout.top];
  const at = top.indexOf(ref);
  if (at === -1) top.push(...items);
  else top.splice(at, 1, ...items);
  const groups = { ...layout.groups };
  delete groups[groupId];
  return { top, groups, ungrouped: layout.ungrouped };
}

/**
 * レイアウトを workspace の平らな順にする（`SessionModel` の Map の並び）。項目はレイアウトの順（`g:` は
 * 中身を展開）、`r:` は `repoMembers` の順（本体が先頭）。実在しない参照は飛ばし、重複は先のものだけ。
 * レイアウトにどの項目でも現れない workspace は、`workspaces` の順で末尾へ付ける。
 */
export function flattenWorkspaceIds(layout: SidebarLayout, workspaces: Workspace[]): WorkspaceId[] {
  const seen = new Set<WorkspaceId>();
  const ids: WorkspaceId[] = [];
  const push = (id: WorkspaceId): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  const pushItem = (ref: ItemRef): void => {
    if (ref.startsWith("r:")) for (const w of repoMembers(workspaces, ref.slice(2))) push(w.id);
    else if (ref.startsWith("w:")) {
      const id = ref.slice(2);
      if (byId.has(id)) push(id);
    }
  };
  for (const ref of layout.top) {
    if (ref.startsWith("g:"))
      for (const inner of layout.groups[ref.slice(2)] ?? []) pushItem(inner);
    else pushItem(ref);
  }
  for (const w of workspaces) push(w.id);
  return ids;
}

/**
 * レイアウトを実在するものに合わせて直す（復元時）。捨てるもの: 実在しないグループ・リポジトリ・workspace を
 * 指す参照、workspace の今の判定（`itemRefOf`）と合わない参照、重複（先のものだけ残す）、グループの中の `g:`、
 * 実在しないグループのキー。足すもの: どこにも無い workspace の項目・グループを一番上の末尾へ。
 * 捨てた参照を返す（呼び出し側がログに出す）。
 */
export function repairLayout(
  layout: SidebarLayout,
  workspaces: Workspace[],
  groups: WorkspaceGroup[],
): { layout: SidebarLayout; dropped: ItemRef[] } {
  const validItems = new Set(workspaces.map(itemRefOf));
  const groupIds = new Set(groups.map((g) => g.id));
  const seen = new Set<ItemRef>();
  const dropped: ItemRef[] = [];
  const keep = (ref: ItemRef, allowGroup: boolean): boolean => {
    const ok =
      !seen.has(ref) &&
      (ref.startsWith("g:") ? allowGroup && groupIds.has(ref.slice(2)) : validItems.has(ref));
    if (ok) seen.add(ref);
    else dropped.push(ref);
    return ok;
  };

  const top = layout.top.filter((ref) => keep(ref, true));
  const fixedGroups: Record<GroupId, ItemRef[]> = {};
  for (const [groupId, list] of Object.entries(layout.groups)) {
    if (!groupIds.has(groupId)) {
      dropped.push(...list);
      continue;
    }
    fixedGroups[groupId] = list.filter((ref) => keep(ref, false));
  }
  for (const g of groups) {
    if (!(g.id in fixedGroups)) fixedGroups[g.id] = [];
    if (!seen.has(groupRef(g.id))) {
      seen.add(groupRef(g.id));
      top.push(groupRef(g.id));
    }
  }
  for (const w of workspaces) {
    const ref = itemRefOf(w);
    if (!seen.has(ref)) {
      seen.add(ref);
      top.push(ref);
    }
  }
  return { layout: { top, groups: fixedGroups, ungrouped: [] }, dropped };
}
