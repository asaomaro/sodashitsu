import type {
  GroupId,
  ItemRef,
  SidebarLayout,
  Workspace,
  WorkspaceGroup,
  WorkspaceId,
} from "@sodashitsu/protocol";
import { UNGROUPED_REF, itemRefOf, repoMembers, representativeIds } from "./workspaceGrouping.js";

/**
 * サイドバーのレイアウト（`SidebarLayout`）を変える純関数（20261004-group-worktree-items。追補 01 B の形）。サーバの
 * `SessionModel` が使う。どれも引数を書き換えず、新しいレイアウトを返す。変わらないときは**同じ参照**を返す
 * （呼び出し側は `===` で「変わったか」を見られる）。
 *
 * 並びは 2 層。**まとまり**（`g:<groupId>` と、グループなしを表す `"u"`）は `top` の中で並ぶ。**項目**（`r:`・`w:`）は
 * 入れ物の中で並ぶ。入れ物は「グループの中（`GroupId`）」か「グループなし（`null`）」。入れ子は 1 段で、
 * 項目をまとまりの外へ（`top` の中へ）直接置くことはできない。
 */

type Container = GroupId | null;

const groupRef = (groupId: GroupId): ItemRef => `g:${groupId}`;

/** まとまりの参照（`g:<id>`・`"u"`）か。項目の参照（`r:`・`w:`）ではない。 */
const isUnitRef = (ref: ItemRef): boolean => ref === UNGROUPED_REF || ref.startsWith("g:");

function listOf(layout: SidebarLayout, container: Container): readonly ItemRef[] {
  return container === null ? layout.ungrouped : (layout.groups[container] ?? []);
}

function withList(layout: SidebarLayout, container: Container, list: ItemRef[]): SidebarLayout {
  return container === null
    ? { top: layout.top, groups: layout.groups, ungrouped: list }
    : { top: layout.top, groups: { ...layout.groups, [container]: list }, ungrouped: layout.ungrouped };
}

/** 項目が今いる入れ物。どこにも無ければ `undefined`（`null` はグループなし）。まとまりの参照は `undefined`。 */
function containerOf(layout: SidebarLayout, ref: ItemRef): Container | undefined {
  if (isUnitRef(ref)) return undefined;
  if (layout.ungrouped.includes(ref)) return null;
  for (const [groupId, list] of Object.entries(layout.groups)) {
    if (list.includes(ref)) return groupId;
  }
  return undefined;
}

/**
 * 項目を入れ物へ足す。`before` がその入れ物にあればその前へ、`null`・無ければ末尾へ。
 * すでに別の場所にあっても消さない（先に `removeItem` する）。同じ入れ物にすでにあれば何もしない。
 * まとまり（`g:`・`"u"`）は入れない。存在しないグループへも入れない。
 */
export function insertItem(
  layout: SidebarLayout,
  ref: ItemRef,
  container: Container,
  before: ItemRef | null = null,
): SidebarLayout {
  if (isUnitRef(ref) || (container !== null && !(container in layout.groups))) return layout;
  const list = listOf(layout, container);
  if (list.includes(ref)) return layout;
  const index = before === null ? -1 : list.indexOf(before);
  const next = [...list];
  if (index === -1) next.push(ref);
  else next.splice(index, 0, ref);
  return withList(layout, container, next);
}

/** 項目をどの入れ物からも外す（`groups[...]` のキー自体は消さない。空になっても残す）。まとまりは外さない（グループは `deleteGroupFromLayout`）。 */
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
 * 新しいグループをレイアウトへ足す（`groups` に空のキーと `top` の `g:<id>`）。位置は `top` の「グループなし」の直前
 * （`"u"` が `top` に無ければ末尾）。すでにあれば何もしない。
 */
export function insertGroup(layout: SidebarLayout, groupId: GroupId): SidebarLayout {
  if (groupId in layout.groups && layout.top.includes(groupRef(groupId))) return layout;
  const top = layout.top.filter((r) => r !== groupRef(groupId));
  const at = top.indexOf(UNGROUPED_REF);
  top.splice(at === -1 ? top.length : at, 0, groupRef(groupId));
  return { top, groups: { ...layout.groups, [groupId]: layout.groups[groupId] ?? [] }, ungrouped: layout.ungrouped };
}

/**
 * 同じ入れ物の中で、項目を `before` の前（`null` は末尾）へ動かす。まとまり（`g:`・`"u"`）は `top` の中で動かす。
 * `moved` は「受け付けたか」（位置が変わらなくても受け付ければ `true`）。受け付けないのは、動かすものが無い・
 * 自分自身の前・`before` が別の入れ物（項目とまとまりの取り違えを含む）。
 */
export function moveItem(
  layout: SidebarLayout,
  ref: ItemRef,
  before: ItemRef | null,
): { layout: SidebarLayout; moved: boolean } {
  const unit = isUnitRef(ref);
  const container = unit ? undefined : containerOf(layout, ref);
  const list: readonly ItemRef[] = unit ? layout.top : container === undefined ? [] : listOf(layout, container);
  if (!list.includes(ref) || before === ref) return { layout, moved: false };
  if (before !== null && !list.includes(before)) return { layout, moved: false };
  const rest = list.filter((r) => r !== ref);
  const index = before === null ? rest.length : rest.indexOf(before);
  rest.splice(index, 0, ref);
  if (rest.every((r, i) => r === list[i])) return { layout, moved: true };
  if (unit) return { layout: { top: rest, groups: layout.groups, ungrouped: layout.ungrouped }, moved: true };
  return { layout: withList(layout, container!, rest), moved: true };
}

/** 同じ入れ物（まとまりなら `top`）の中で 1 つ動かす。端では動かない（巡回しない）ので `moved: false`。 */
export function moveItemBy(
  layout: SidebarLayout,
  ref: ItemRef,
  direction: "previous" | "next",
): { layout: SidebarLayout; moved: boolean } {
  const unit = isUnitRef(ref);
  const container = unit ? undefined : containerOf(layout, ref);
  const list: readonly ItemRef[] = unit ? layout.top : container === undefined ? [] : listOf(layout, container);
  const index = list.indexOf(ref);
  if (index === -1) return { layout, moved: false };
  const target = direction === "previous" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return { layout, moved: false };
  const next = [...list];
  next[index] = list[target]!;
  next[target] = ref;
  if (unit) return { layout: { top: next, groups: layout.groups, ungrouped: layout.ungrouped }, moved: true };
  return { layout: withList(layout, container!, next), moved: true };
}

/** 項目をグループの末尾へ入れる（別の場所にあれば移す）。まとまり・存在しないグループは何もしない。 */
export function addItemToGroup(
  layout: SidebarLayout,
  ref: ItemRef,
  groupId: GroupId,
): SidebarLayout {
  if (isUnitRef(ref) || !(groupId in layout.groups)) return layout;
  const without = removeItem(layout, ref);
  return insertItem(without, ref, groupId, null);
}

/** 項目をグループから出し、「グループなし」の末尾へ置く。グループの中に無ければ何もしない。 */
export function removeItemFromGroup(layout: SidebarLayout, ref: ItemRef): SidebarLayout {
  const container = containerOf(layout, ref);
  if (container === null || container === undefined) return layout;
  return insertItem(removeItem(layout, ref), ref, null, null);
}

/** グループを消し、中の項目を「グループなし」の末尾へ順に出す。`top` からも外す。 */
export function deleteGroupFromLayout(layout: SidebarLayout, groupId: GroupId): SidebarLayout {
  const ref = groupRef(groupId);
  if (!(groupId in layout.groups) && !layout.top.includes(ref)) return layout;
  const groups = { ...layout.groups };
  delete groups[groupId];
  return {
    top: layout.top.filter((r) => r !== ref),
    groups,
    ungrouped: [...layout.ungrouped, ...(layout.groups[groupId] ?? []).filter((r) => !layout.ungrouped.includes(r))],
  };
}

/**
 * レイアウトを workspace の平らな順にする（`SessionModel` の Map の並び）。まとまりは `top` の順（`"u"` は
 * `ungrouped`、`g:` は中身）、項目はその中の順、`r:` は `repoMembers` の順（本体が先頭）。実在しない参照は飛ばし、
 * 重複は先のものだけ。どの項目にも現れない workspace（`top` に無いグループの中身を含む）は、`workspaces` の順で末尾へ付ける。
 *
 * 代表（`worktreeKey` が同じ workspace の平らな順で最初のもの）が、並べ替えの結果で同じ worktree の代表でない workspace の
 * 後ろへ回らないようにする。回ると代表が入れ替わって項目の参照が変わり続けるため、代表は同じ worktree の workspace が
 * 占める位置のうち一番前に置く（代表は入力の `workspaces` の順で決める）。
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
  for (const unit of layout.top) {
    if (unit === UNGROUPED_REF) layout.ungrouped.forEach(pushItem);
    else if (unit.startsWith("g:")) (layout.groups[unit.slice(2)] ?? []).forEach(pushItem);
  }
  for (const w of workspaces) push(w.id);
  return keepRepresentativesFirst(ids, workspaces);
}

/** 同じ `worktreeKey` の workspace が占める位置のうち、一番前へ代表を置く（残りは今の相対順のまま）。 */
function keepRepresentativesFirst(ids: WorkspaceId[], workspaces: Workspace[]): WorkspaceId[] {
  const reps = representativeIds(workspaces);
  const keyOf = new Map<WorkspaceId, string>();
  for (const w of workspaces) {
    const key = w.git?.worktreeKey;
    if (typeof key === "string") keyOf.set(w.id, key);
  }
  const slots = new Map<string, number[]>();
  ids.forEach((id, i) => {
    const key = keyOf.get(id);
    if (key !== undefined) slots.set(key, [...(slots.get(key) ?? []), i]);
  });
  const result = [...ids];
  for (const positions of slots.values()) {
    if (positions.length < 2) continue;
    const members = positions.map((i) => ids[i]!);
    const ordered = [...members.filter((id) => reps.has(id)), ...members.filter((id) => !reps.has(id))];
    positions.forEach((pos, k) => {
      result[pos] = ordered[k]!;
    });
  }
  return result;
}

/**
 * レイアウトを実在するものに合わせて直す（復元時）。捨てるもの: 実在しないグループ・リポジトリ・workspace を
 * 指す参照、workspace の今の判定（`itemRefOf`）と合わない参照、重複（`groups` のキー順 → `ungrouped` の順で先のものだけ残す）、`top` の中の項目・
 * 2 つ目以降の `"u"`、グループの中の `g:`、実在しないグループのキー。足すもの: `"u"`（無ければ末尾）、`top` に
 * 無いグループ（「グループなし」の直前）、どこにも無い workspace の項目（「グループなし」の末尾）。
 * 捨てた参照を返す（呼び出し側がログに出す）。
 */
export function repairLayout(
  layout: SidebarLayout,
  workspaces: Workspace[],
  groups: WorkspaceGroup[],
): { layout: SidebarLayout; dropped: ItemRef[] } {
  const validItems = new Set(workspaces.map((w) => itemRefOf(w, workspaces)));
  const groupIds = new Set(groups.map((g) => g.id));
  const seen = new Set<ItemRef>();
  const dropped: ItemRef[] = [];
  const keep = (ref: ItemRef, ok: boolean): boolean => {
    const keepIt = ok && !seen.has(ref);
    if (keepIt) seen.add(ref);
    else dropped.push(ref);
    return keepIt;
  };

  const top = layout.top.filter((ref) =>
    keep(ref, ref === UNGROUPED_REF || (ref.startsWith("g:") && groupIds.has(ref.slice(2)))),
  );
  const fixedGroups: Record<GroupId, ItemRef[]> = {};
  for (const [groupId, list] of Object.entries(layout.groups)) {
    if (!groupIds.has(groupId)) {
      dropped.push(...list);
      continue;
    }
    fixedGroups[groupId] = list.filter((ref) => keep(ref, validItems.has(ref)));
  }
  const ungrouped = layout.ungrouped.filter((ref) => keep(ref, validItems.has(ref)));
  for (const g of groups) {
    if (!(g.id in fixedGroups)) fixedGroups[g.id] = [];
    if (!seen.has(groupRef(g.id))) {
      seen.add(groupRef(g.id));
      const at = top.indexOf(UNGROUPED_REF);
      top.splice(at === -1 ? top.length : at, 0, groupRef(g.id));
    }
  }
  if (!top.includes(UNGROUPED_REF)) top.push(UNGROUPED_REF);
  for (const w of workspaces) {
    const ref = itemRefOf(w, workspaces);
    if (!seen.has(ref)) {
      seen.add(ref);
      ungrouped.push(ref);
    }
  }
  return { layout: { top, groups: fixedGroups, ungrouped }, dropped };
}
