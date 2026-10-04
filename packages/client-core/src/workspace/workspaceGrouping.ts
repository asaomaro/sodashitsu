import type { ItemRef, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import type { WorkspaceSort } from "../prefs/types.js";

/**
 * workspace のグルーピング（純関数。20260923-workspace-grouping）。`store/workspaceOrder.ts` と
 * 同じ「純関数・複数箇所から共有」の形——`Sidebar.vue`（描画）と `ConfirmDialog.vue`
 * （一括クローズのチェックボックス表示）の両方から使う。
 */

/**
 * 折りたたみ中に隠れる子（worktree グループ）を、focus 中の workspace だけの例外表示で絞り込む
 * （design「振る舞いの詳細」AC3・AC6）。`Sidebar.vue` の描画と `visibleWorkspaceIdsInOrder`
 * （キーボード操作の対象順）の両方が同じ判定を使う
 * （20260923-workspace-grouping レビューの指摘：同じ条件を2箇所に書き分けない）。
 */
export function visibleGroupMembers<T extends { id: string }>(members: T[], collapsed: boolean, focusedWorkspaceId: string | null): T[] {
  return collapsed ? members.filter((w) => w.id === focusedWorkspaceId) : members;
}

// ---------------------------------------------------------------------------------------------
// 項目の木（20261004-group-worktree-items）。サーバ・ブラウザ版・端末版が同じ関数を使う。
// ---------------------------------------------------------------------------------------------

/** 項目の行。worktree に代表が 1 つなら `workspace`、2 つ以上なら `worktreeGroup`（子も代表）。 */
export type ItemRow =
  | { kind: "workspace"; workspace: Workspace }
  | { kind: "worktreeGroup"; repoKey: string; head: Workspace; children: Workspace[] };

/**
 * 「グループなし」のまとまり（追補 01 B）。`heading` は見出しを出すか（本物のグループが 1 つ以上あるときだけ）。
 * `collapsed` は見出しがあって畳んでいるとき（見出しが無ければ畳めないので常に false）。
 */
export type UngroupedRow = { kind: "ungrouped"; items: ItemRow[]; heading: boolean; collapsed: boolean };

/** 一番上の行はまとまりだけ（本物のグループと「グループなし」）。まとまりの中は項目の行だけ（入れ子は 1 段）。 */
export type TopRow = { kind: "group"; group: WorkspaceGroup; items: ItemRow[] } | UngroupedRow;

/** 一番上のまとまり（`topUnitOf` の結果。グラフの単位の入口）。 */
export type TopUnit =
  | { kind: "group"; groupId: string }
  | { kind: "repo"; repoKey: string }
  | { kind: "workspace"; workspaceId: string };

/** レイアウトの `top` に入る「グループなし」の参照（必ず 1 つ）。 */
export const UNGROUPED_REF = "u";

/**
 * workspace が、その worktree（`git.worktreeKey`）の代表か（追補 01 A）。同じ `worktreeKey` の workspace のうち
 * `workspaces` の順（平らな順）で最初のものが代表。`worktreeKey` が無い（古いサーバ・管理外）workspace は
 * 全部代表として扱う（今までどおり、同じ `repoKey` を全部メンバーにする）。
 */
export function isRepresentative(ws: Workspace, workspaces: Workspace[]): boolean {
  const key = ws.git?.worktreeKey;
  if (typeof key !== "string") return true;
  const first = workspaces.find((w) => w.git?.worktreeKey === key);
  return first === undefined || first.id === ws.id;
}

/** 代表の workspace の id の集まり（`isRepresentative` を全部について 1 回で求める）。 */
export function representativeIds(workspaces: Workspace[]): Set<string> {
  const seen = new Set<string>();
  const reps = new Set<string>();
  for (const w of workspaces) {
    const key = w.git?.worktreeKey;
    if (typeof key === "string") {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    reps.add(w.id);
  }
  return reps;
}

/** workspace の項目の参照。`repoKey` を持つ代表なら `r:<repoKey>`、そうでなければ（管理外・代表でない）`w:<id>`。 */
export function itemRefOf(ws: Workspace, workspaces: Workspace[]): ItemRef {
  const repoKey = ws.git?.repoKey;
  return repoKey && isRepresentative(ws, workspaces) ? `r:${repoKey}` : `w:${ws.id}`;
}

/**
 * リポジトリの項目に入る workspace（代表だけ）。本体（`isLinkedWorktree === false`）が先頭、残りは `workspaces` の順
 * （開いた順）。本体が無ければ開いた順のまま（先頭が暫定の頭）。
 */
export function repoMembers(workspaces: Workspace[], repoKey: string): Workspace[] {
  const reps = representativeIds(workspaces);
  const members = workspaces.filter((w) => w.git?.repoKey === repoKey && reps.has(w.id));
  const body = members.find((w) => w.git!.isLinkedWorktree === false);
  return body ? [body, ...members.filter((w) => w !== body)] : members;
}

/** 畳んだ worktree グループで隠れている子の数（`+n`）。今いる子は見えているので数えない。 */
export function hiddenWorktreeCount(
  item: Extract<ItemRow, { kind: "worktreeGroup" }>,
  focusedWorkspaceId: string | null,
): number {
  return item.children.filter((w) => w.id !== focusedWorkspaceId).length;
}

function itemRowOf(workspaces: Workspace[], ref: ItemRef): ItemRow | null {
  if (ref.startsWith("r:")) {
    const repoKey = ref.slice(2);
    const members = repoMembers(workspaces, repoKey);
    if (members.length === 0) return null;
    if (members.length === 1) return { kind: "workspace", workspace: members[0]! };
    return { kind: "worktreeGroup", repoKey, head: members[0]!, children: members.slice(1) };
  }
  if (ref.startsWith("w:")) {
    const ws = workspaces.find((w) => w.id === ref.slice(2));
    return ws ? { kind: "workspace", workspace: ws } : null;
  }
  return null;
}

/** まとまり 1 つと、その中の項目（解決済みの参照）。`unit` は `g:<groupId>` か `UNGROUPED_REF`。 */
interface PlacedUnit {
  unit: string;
  items: ItemRef[];
}

/**
 * レイアウトを、今の workspace の判定で解決して並べる。まとまりの順は `layout.top`（実在しないグループ・重複は読み飛ばす）。
 * `top` に無いグループは「グループなし」の直前、「グループなし」が `top` に無ければ末尾に足す。項目の参照は今の判定
 * （`itemRefOf`）で読み替え、実在しない参照・重複・`g:` は読み飛ばし、どこにも無い workspace の項目は「グループなし」の末尾へ足す。
 */
function placeItems(
  workspaces: Workspace[],
  groupIds: ReadonlySet<string>,
  layout: SidebarLayout,
): PlacedUnit[] {
  const reps = representativeIds(workspaces);
  const repoKeys = new Set<string>();
  const refById = new Map<string, ItemRef>();
  for (const w of workspaces) {
    const repoKey = w.git?.repoKey;
    if (repoKey && reps.has(w.id)) repoKeys.add(repoKey);
    refById.set(w.id, repoKey && reps.has(w.id) ? `r:${repoKey}` : `w:${w.id}`);
  }
  const resolve = (ref: ItemRef): ItemRef | null => {
    if (ref.startsWith("r:")) return repoKeys.has(ref.slice(2)) ? ref : null;
    if (ref.startsWith("w:")) return refById.get(ref.slice(2)) ?? null;
    return null;
  };

  const units: string[] = [];
  for (const ref of layout.top) {
    if (units.includes(ref)) continue;
    if (ref === UNGROUPED_REF || (ref.startsWith("g:") && groupIds.has(ref.slice(2)))) units.push(ref);
  }
  for (const groupId of groupIds) {
    const ref = `g:${groupId}`;
    if (units.includes(ref)) continue;
    const at = units.indexOf(UNGROUPED_REF);
    if (at === -1) units.push(ref);
    else units.splice(at, 0, ref);
  }
  if (!units.includes(UNGROUPED_REF)) units.push(UNGROUPED_REF);

  const seen = new Set<ItemRef>();
  const take = (refs: readonly ItemRef[]): ItemRef[] => {
    const out: ItemRef[] = [];
    for (const raw of refs) {
      const ref = resolve(raw);
      if (ref === null || seen.has(ref)) continue;
      seen.add(ref);
      out.push(ref);
    }
    return out;
  };
  const placed = units.map((unit) => ({
    unit,
    items: take(unit === UNGROUPED_REF ? layout.ungrouped : (layout.groups[unit.slice(2)] ?? [])),
  }));
  const ungrouped = placed.find((p) => p.unit === UNGROUPED_REF)!;
  ungrouped.items.push(...take(workspaces.map((w) => refById.get(w.id)!)));
  return placed;
}

/**
 * サイドバーの描画用の木。一番上は**まとまりの列**（`layout.top` の順。本物のグループと「グループなし」）で、中に
 * 項目（worktree グループ・通常の行）が並ぶ。配信の途中の状態でも崩れない決まり: レイアウトに無い workspace は
 * 「グループなし」の末尾に足す／実在しない参照は読み飛ばす／判定とレイアウトの参照が食い違うときは今の判定
 * （`itemRefOf`）で項目を決め、置き場所はレイアウトにある参照のうち先に見つかったもの。
 *
 * `ungroupedCollapsed` は共有の設定の「グループなし」を畳んだか。見出しを出さないとき（本物のグループが無い）は畳めない。
 *
 * `sort === "name"` は、「グループなし」の中の項目をその名前（worktree グループは先頭の workspace の名前）で並べ、
 * グループどうしをグループの名前で並べる（「グループなし」は `top` での位置のまま）。グループの中・worktree グループの
 * 中はレイアウトの順。
 */
export function sidebarTree(
  workspaces: Workspace[],
  groups: WorkspaceGroup[],
  layout: SidebarLayout,
  sort: WorkspaceSort,
  ungroupedCollapsed = false,
): TopRow[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const heading = groupById.size > 0;
  const itemsOf = (refs: ItemRef[]): ItemRow[] =>
    refs.flatMap((ref) => {
      const item = itemRowOf(workspaces, ref);
      return item ? [item] : [];
    });
  const labelOf = (item: ItemRow): string => (item.kind === "workspace" ? item.workspace.label : item.head.label);
  const rows: TopRow[] = placeItems(workspaces, new Set(groupById.keys()), layout).map(({ unit, items }) =>
    unit === UNGROUPED_REF
      ? { kind: "ungrouped" as const, items: itemsOf(items), heading, collapsed: heading && ungroupedCollapsed }
      : { kind: "group" as const, group: groupById.get(unit.slice(2))!, items: itemsOf(items) },
  );
  if (sort === "name") {
    const ungrouped = rows.find((r): r is UngroupedRow => r.kind === "ungrouped")!;
    ungrouped.items.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
    const sortedGroups = rows
      .filter((r) => r.kind === "group")
      .sort((a, b) => a.group.label.localeCompare(b.group.label));
    let next = 0;
    return rows.map((r) => (r.kind === "group" ? sortedGroups[next++]! : r));
  }
  return rows;
}

/**
 * 木の上で、サイドバーに実際に見えている workspace の id を上から下へ辿った順で返す（キーボード操作の
 * 対象順と描画の順が同じになる関数）。畳んだグループ・畳んだ「グループなし」・畳んだ worktree グループの中は、今いる
 * workspace だけ。グループの折りたたみは木の `group.collapsed`、「グループなし」は `row.collapsed`、worktree グループは
 * `collapsedRepos`（`repoKey` の集合）。
 */
export function visibleWorkspaceIdsInOrder(
  tree: TopRow[],
  collapsedRepos: ReadonlySet<string>,
  focusedWorkspaceId: string | null,
): string[] {
  const ids: string[] = [];
  const pushItem = (item: ItemRow, unitCollapsed: boolean): void => {
    if (item.kind === "workspace") {
      if (!unitCollapsed || item.workspace.id === focusedWorkspaceId) ids.push(item.workspace.id);
    } else if (unitCollapsed) {
      // 畳んだまとまりの中は、今いる workspace の行だけ（先頭でも子でも）。
      for (const w of [item.head, ...item.children])
        if (w.id === focusedWorkspaceId) ids.push(w.id);
    } else {
      ids.push(item.head.id);
      for (const w of visibleGroupMembers(
        item.children,
        collapsedRepos.has(item.repoKey),
        focusedWorkspaceId,
      ))
        ids.push(w.id);
    }
  };
  for (const row of tree) {
    const collapsed = row.kind === "group" ? row.group.collapsed : row.collapsed;
    for (const item of row.items) pushItem(item, collapsed);
  }
  return ids;
}

/**
 * navigate の選択の行（20261004-group-worktree-items。design「画面」）。グループの見出しの行・「グループなし」の
 * 見出しの行と workspace の行。選択のキーは、グループの見出しなら `group:<id>`（`navigateKeyOfGroup`）、
 * 「グループなし」なら `ungrouped:`、workspace なら workspace の id そのもの（workspace の id は `:` を含まないので
 * 混ざらない。サイドバーの行のキー `row.key` と同じ形）。
 */
export type NavigateRow =
  | { kind: "group"; groupId: string }
  | { kind: "ungrouped" }
  | { kind: "workspace"; workspaceId: string };

const NAVIGATE_GROUP_PREFIX = "group:";
const NAVIGATE_UNGROUPED_KEY = "ungrouped:";

/** グループの見出しの行の選択のキー。 */
export function navigateKeyOfGroup(groupId: string): string {
  return `${NAVIGATE_GROUP_PREFIX}${groupId}`;
}

/** 「グループなし」の見出しの行の選択のキー。 */
export function navigateKeyOfUngrouped(): string {
  return NAVIGATE_UNGROUPED_KEY;
}

/** 選択のキーがグループの見出しならそのグループの id、それ以外（workspace・「グループなし」・null）なら null。 */
export function groupIdOfNavigateKey(key: string | null): string | null {
  return key !== null && key.startsWith(NAVIGATE_GROUP_PREFIX) ? key.slice(NAVIGATE_GROUP_PREFIX.length) : null;
}

/** 選択のキーが「グループなし」の見出しか。 */
export function isUngroupedNavigateKey(key: string | null): boolean {
  return key === NAVIGATE_UNGROUPED_KEY;
}

/** 選択のキーが指す行（`NavigateRow`）。 */
export function navigateKeyOfRow(row: NavigateRow): string {
  return row.kind === "group"
    ? navigateKeyOfGroup(row.groupId)
    : row.kind === "ungrouped"
      ? navigateKeyOfUngrouped()
      : row.workspaceId;
}

/**
 * 木の上で、navigate で選べる行を上から下へ辿った順で返す。`visibleWorkspaceIdsInOrder` に、見出しの行（グループは
 * 畳んだもの・空のものも含む。「グループなし」は見出しを出すときだけ）を、そのまとまりの中の行の前へ差し込んだもの。
 */
export function navigableRowsOfTree(
  tree: TopRow[],
  collapsedRepos: ReadonlySet<string>,
  focusedWorkspaceId: string | null,
): NavigateRow[] {
  const rows: NavigateRow[] = [];
  for (const row of tree) {
    if (row.kind === "group") rows.push({ kind: "group", groupId: row.group.id });
    else if (row.heading) rows.push({ kind: "ungrouped" });
    for (const id of visibleWorkspaceIdsInOrder([row], collapsedRepos, focusedWorkspaceId))
      rows.push({ kind: "workspace", workspaceId: id });
  }
  return rows;
}

/**
 * workspace の「一番上のまとまり」。グループの中の項目ならそのグループ、「グループなし」の中の項目は（グループとは扱わず）
 * 代表が 2 つ以上のリポジトリなら worktree グループ（`repo`）、それ以外は workspace 単体。`workspaceId` が無ければ null。
 */
export function topUnitOf(
  workspaceId: string,
  workspaces: Workspace[],
  layout: SidebarLayout,
): TopUnit | null {
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return null;
  const groupIds = new Set([
    ...Object.keys(layout.groups),
    ...layout.top.filter((r) => r.startsWith("g:")).map((r) => r.slice(2)),
  ]);
  const ref = itemRefOf(ws, workspaces);
  const hit = placeItems(workspaces, groupIds, layout).find((p) => p.items.includes(ref));
  if (hit && hit.unit !== UNGROUPED_REF) return { kind: "group", groupId: hit.unit.slice(2) };
  if (ref.startsWith("r:") && repoMembers(workspaces, ref.slice(2)).length >= 2)
    return { kind: "repo", repoKey: ref.slice(2) };
  return { kind: "workspace", workspaceId };
}

/**
 * `layout` を持たない古いサーバ・古い保存のための、仮のレイアウト（F13）。同じ `repoKey` の代表は 1 つの項目にし、
 * 所属は本体の `groupId`（本体が無ければ最初に開いたもの）。代表でない workspace は `w:<id>` で自分の `groupId`。
 * まとまりの順は、グループは先頭のメンバーの平らな順、空のグループはその後ろ、`"u"` は末尾。グループに入らない項目は
 * 平らな順で `ungrouped` へ。
 */
export function layoutFromLegacy(workspaces: Workspace[], groups: WorkspaceGroup[]): SidebarLayout {
  const groupIds = new Set(groups.map((g) => g.id));
  const items = new Map<ItemRef, { groupId: string | null; position: number }>();
  workspaces.forEach((w, position) => {
    const ref = itemRefOf(w, workspaces);
    const known = items.get(ref);
    if (known) {
      known.position = Math.min(known.position, position);
      return;
    }
    const owner = ref.startsWith("r:") ? repoMembers(workspaces, ref.slice(2))[0]! : w;
    items.set(ref, {
      groupId: owner.groupId !== null && groupIds.has(owner.groupId) ? owner.groupId : null,
      position,
    });
  });
  const sorted = [...items].sort((a, b) => a[1].position - b[1].position);
  const layout: SidebarLayout = { top: [], groups: {}, ungrouped: [] };
  for (const g of groups) layout.groups[g.id] = [];
  const firstPosition = new Map<string, number>();
  for (const [ref, item] of sorted) {
    if (item.groupId === null) {
      layout.ungrouped.push(ref);
    } else {
      layout.groups[item.groupId]!.push(ref);
      if (!firstPosition.has(item.groupId)) firstPosition.set(item.groupId, item.position);
    }
  }
  const filled = groups.filter((g) => firstPosition.has(g.id));
  filled.sort((a, b) => firstPosition.get(a.id)! - firstPosition.get(b.id)!);
  layout.top = [
    ...filled.map((g) => `g:${g.id}`),
    ...groups.filter((g) => !firstPosition.has(g.id)).map((g) => `g:${g.id}`),
    UNGROUPED_REF,
  ];
  return layout;
}
