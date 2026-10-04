import type { ItemRef, SidebarLayout, Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import type { WorkspaceSort } from "../prefs/types.js";

/**
 * workspace のグルーピング（純関数。20260923-workspace-grouping）。`store/workspaceOrder.ts` と
 * 同じ「純関数・複数箇所から共有」の形——`Sidebar.vue`（描画）と `ConfirmDialog.vue`
 * （一括クローズのチェックボックス表示）の両方から使う。
 */

export type WorkspaceRow =
  | { kind: "standalone"; workspace: Workspace }
  | { kind: "manualGroup"; group: WorkspaceGroup; members: Workspace[] }
  | { kind: "autoGroup"; repoKey: string; parent: Workspace; children: Workspace[]; collapsed: boolean };

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * worktree 自動グループ（design「振る舞いの詳細（worktree 自動グループの表示）」）。`groupId` が
 * 無く（手動グループが優先。design「設計方針」）、git の `repoKey` を持つ workspace を repoKey ごとに
 * 束ね、**2件以上のものだけ**を返す（AC2：1件なら束ねない）。本体（`isLinkedWorktree === false`）を
 * 「親」とする。理論上、本体は高々1件のはずだが、`GitInfoPoller` の周期の谷間で見つからないときは
 * 先頭の workspace を暫定的に親にする（design の同じ節に明記）。
 *
 * **この暫定親の扱いは、本体が本当にどこにも無いときだけに限る**（タスク点検の指摘）。本体が
 * 手動グループに入っている等で候補（`groupId === null` の集合）から外れているだけなら、実際には
 * 本体がどこかに実在するので、残った linked worktree の1つを「親」と誤って見せてしまう——
 * その場合はこの repoKey の自動グループ自体を作らない。
 */
export function autoGroupsOf(workspaces: Workspace[]): { repoKey: string; parent: Workspace; children: Workspace[] }[] {
  const candidates = workspaces.filter((w) => w.groupId === null && w.git?.repoKey);
  const byRepoKey = groupBy(candidates, (w) => w.git!.repoKey!);
  const result: { repoKey: string; parent: Workspace; children: Workspace[] }[] = [];
  for (const [repoKey, members] of byRepoKey) {
    if (members.length < 2) continue;
    const parentIndex = members.findIndex((w) => w.git!.isLinkedWorktree === false);
    if (parentIndex === -1 && workspaces.some((w) => w.git?.repoKey === repoKey && w.git.isLinkedWorktree === false)) {
      continue; // 本体は実在するが候補から外れている（手動グループ等）——誤った親表示を避ける
    }
    const parent = members[parentIndex === -1 ? 0 : parentIndex]!;
    const children = members.filter((w) => w.id !== parent.id);
    result.push({ repoKey, parent, children });
  }
  return result;
}

/**
 * 手動グループ（herdr に前例が無い独自拡張。decisions.md D1）。`groups`（サーバに永続化されている
 * 全グループ）を基準に、その `id` に一致する `groupId` を持つ workspace をメンバーとして集める。
 * **空のグループも含む**（design「エラー処理」：メンバーが0でもグループ自体は自動削除しない）。
 */
export function manualGroupsOf(workspaces: Workspace[], groups: WorkspaceGroup[]): { group: WorkspaceGroup; members: Workspace[] }[] {
  const byGroupId = groupBy(
    workspaces.filter((w) => w.groupId !== null),
    (w) => w.groupId!,
  );
  return groups.map((group) => ({ group, members: byGroupId.get(group.id) ?? [] }));
}

/**
 * `workspaceId` が worktree 自動グループの本体（親）なら、束ねられた linked worktree を返す
 * （一括クローズの対象・チェックボックス表示の判定に使う。design「振る舞いの詳細（一括クローズ）」）。
 * 本体でなければ・グループが無ければ `[]`。`SessionModel.linkedWorktreeGroupMembers` のクライアント
 * 側版（サーバとブラウザは別ランタイムなので実装は共有しない）。
 *
 * **想定する呼び出し方**: `ConfirmDialog` が開いたときに対象 workspace 1 件分だけ呼ぶ
 * （タスク点検の指摘：内部で `autoGroupsOf` を毎回計算し直すので、workspace の一覧を
 * 1 件ずつループしながら呼ぶ使い方はしないこと——その場合は呼び出し側で `autoGroupsOf` を
 * 1 回だけ計算し、`parent.id` から引く形にする）。
 */
export function linkedWorktreeChildrenOf(workspaceId: string, workspaces: Workspace[]): Workspace[] {
  return autoGroupsOf(workspaces).find((g) => g.parent.id === workspaceId)?.children ?? [];
}

/**
 * サイドバーに描画するトップレベル行（design「設計方針」：グループはまとめて1つの単位。グループの
 * 中の並びは常に「開いた順」——グループというまとまり自体が利用者の意図的な整理なので、中身を勝手に
 * 並べ替えない）。`sort === "name"` は**トップレベル行同士**（グループ・グループに属さない
 * workspace）だけをラベルのアルファベット順に並べ替える。
 *
 * @param workspaces 「開いた順」そのまま（`orderedWorkspaceIds` 等で並べ替え**済みでない**、
 *   `session.workspaces` の反復順）。グループ内の並びの基準にもなる。
 */
export function groupedWorkspaceRows(workspaces: Workspace[], groups: WorkspaceGroup[], sort: WorkspaceSort, collapsedAutoGroups: ReadonlySet<string>): WorkspaceRow[] {
  const manual = manualGroupsOf(workspaces, groups);
  const manualMemberIds = new Set(manual.flatMap((g) => g.members.map((w) => w.id)));
  const auto = autoGroupsOf(workspaces);
  const autoMemberIds = new Set(auto.flatMap((g) => [g.parent.id, ...g.children.map((w) => w.id)]));
  const standalone = workspaces.filter((w) => !manualMemberIds.has(w.id) && !autoMemberIds.has(w.id));

  const openedIndexOf = new Map(workspaces.map((w, i) => [w.id, i]));
  // 空の手動グループには基準にできるメンバーが無い——「開いた順」では末尾寄りに置く。
  const NO_MEMBER_INDEX = workspaces.length;

  const entries: { row: WorkspaceRow; sortLabel: string; openedIndex: number }[] = [
    ...manual.map((g) => ({
      row: { kind: "manualGroup" as const, group: g.group, members: g.members },
      sortLabel: g.group.label,
      openedIndex: g.members[0] ? openedIndexOf.get(g.members[0].id)! : NO_MEMBER_INDEX,
    })),
    ...auto.map((g) => ({
      row: { kind: "autoGroup" as const, repoKey: g.repoKey, parent: g.parent, children: g.children, collapsed: collapsedAutoGroups.has(g.repoKey) },
      sortLabel: g.parent.label,
      openedIndex: openedIndexOf.get(g.parent.id)!,
    })),
    ...standalone.map((w) => ({
      row: { kind: "standalone" as const, workspace: w },
      sortLabel: w.label,
      openedIndex: openedIndexOf.get(w.id)!,
    })),
  ];

  if (sort === "name") entries.sort((a, b) => a.sortLabel.localeCompare(b.sortLabel));
  else entries.sort((a, b) => a.openedIndex - b.openedIndex);

  return entries.map((e) => e.row);
}

/**
 * 折りたたみ中に隠れるメンバー（手動グループ）／子（worktree 自動グループ）を、focus 中の
 * workspace だけの例外表示で絞り込む（design「振る舞いの詳細」AC3・AC6）。`Sidebar.vue` の描画と
 * `visibleWorkspaceIdsInOrder`（キーボード操作の対象順）の両方が同じ判定を使う
 * （20260923-workspace-grouping レビューの指摘：同じ条件を2箇所に書き分けない）。
 */
export function visibleGroupMembers<T extends { id: string }>(members: T[], collapsed: boolean, focusedWorkspaceId: string | null): T[] {
  return collapsed ? members.filter((w) => w.id === focusedWorkspaceId) : members;
}

/**
 * サイドバーに実際に見えている workspace の id を、上から下へ辿った順で返す（グループのヘッダー行
 * 自体は特定の workspace ではないため含めない）。`ActionDispatcher` の `previous_workspace`/
 * `next_workspace`・`navigate`（サイドバー内のジャンプ選択）が共有する——画面で見る順と操作の対象順を
 * 一致させるため（`store/workspaceOrder.ts` の不変条件と同じ趣旨。design decisions D4 相当）。
 *
 * **20260923-workspace-grouping レビューで発見**：`Sidebar.vue` がこの work で `orderedWorkspaceIds`
 * から `groupedWorkspaceRows` に切り替わった際、`ActionDispatcher` 側の更新が漏れていた
 * （画面の並びとキーボード操作の対象順が乖離する回帰）。
 */
export function visibleWorkspaceIdsInOrder(
  workspaces: Workspace[],
  groups: WorkspaceGroup[],
  sort: WorkspaceSort,
  collapsedAutoGroups: ReadonlySet<string>,
  focusedWorkspaceId: string | null,
): string[] {
  const rows = groupedWorkspaceRows(workspaces, groups, sort, collapsedAutoGroups);
  const ids: string[] = [];
  for (const row of rows) {
    if (row.kind === "standalone") {
      ids.push(row.workspace.id);
    } else if (row.kind === "manualGroup") {
      for (const w of visibleGroupMembers(row.members, row.group.collapsed, focusedWorkspaceId)) ids.push(w.id);
    } else {
      ids.push(row.parent.id);
      for (const w of visibleGroupMembers(row.children, row.collapsed, focusedWorkspaceId)) ids.push(w.id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------
// 項目の木（20261004-group-worktree-items）。上の古い関数（`autoGroupsOf` 等）は、画面とサーバが
// これに乗り換えるまで残す（撤去は T19）。サーバ・ブラウザ版・端末版が同じ関数を使う。
// ---------------------------------------------------------------------------------------------

/** 項目の行。リポジトリに workspace が 1 つなら `workspace`、2 つ以上なら `worktreeGroup`。 */
export type ItemRow =
  | { kind: "workspace"; workspace: Workspace }
  | { kind: "worktreeGroup"; repoKey: string; head: Workspace; children: Workspace[] };

/** 一番上の行。グループの中は項目の行だけ（入れ子は 1 段）。 */
export type TopRow = ItemRow | { kind: "group"; group: WorkspaceGroup; items: ItemRow[] };

/** 一番上のまとまり（`topUnitOf` の結果。グラフの単位の入口）。 */
export type TopUnit =
  | { kind: "group"; groupId: string }
  | { kind: "repo"; repoKey: string }
  | { kind: "workspace"; workspaceId: string };

/** workspace の項目の参照。`git.repoKey` があれば `r:<repoKey>`、無ければ `w:<id>`。 */
export function itemRefOf(ws: Workspace): ItemRef {
  const repoKey = ws.git?.repoKey;
  return repoKey ? `r:${repoKey}` : `w:${ws.id}`;
}

/** リポジトリの workspace 全部。本体（`isLinkedWorktree === false`）が先頭、残りは `workspaces` の順（開いた順）。本体が無ければ開いた順のまま（先頭が暫定の頭）。 */
export function repoMembers(workspaces: Workspace[], repoKey: string): Workspace[] {
  const members = workspaces.filter((w) => w.git?.repoKey === repoKey);
  const body = members.find((w) => w.git!.isLinkedWorktree === false);
  return body ? [body, ...members.filter((w) => w !== body)] : members;
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

/**
 * レイアウトの参照を、workspace の**今の判定**で項目の参照へ読み替える。`w:<id>` の workspace が
 * その後 git と判定されていれば `r:<repoKey>`、`r:<repoKey>` を持つ workspace が無ければ null
 * （実在しない参照は読み飛ばす）。判定とレイアウトの食い違いは、今の判定で項目を決める。
 */
function resolveRef(
  workspaces: Workspace[],
  repoKeys: ReadonlySet<string>,
  ref: ItemRef,
): ItemRef | null {
  if (ref.startsWith("r:")) return repoKeys.has(ref.slice(2)) ? ref : null;
  if (ref.startsWith("w:")) {
    const ws = workspaces.find((w) => w.id === ref.slice(2));
    return ws ? itemRefOf(ws) : null;
  }
  return null;
}

/** 項目の置き場所（`null` は一番上）を、置いた順に返す。実在しない参照・重複は読み飛ばし、レイアウトに無い workspace は一番上の末尾へ足す。 */
function placeItems(
  workspaces: Workspace[],
  groupIds: ReadonlySet<string>,
  layout: SidebarLayout,
): { groupOrder: string[]; placed: { ref: ItemRef; groupId: string | null }[] } {
  const repoKeys = new Set<string>();
  for (const w of workspaces) if (w.git?.repoKey) repoKeys.add(w.git.repoKey);
  const seen = new Set<ItemRef>();
  const placed: { ref: ItemRef; groupId: string | null }[] = [];
  const groupOrder: string[] = [];
  const takeItems = (refs: ItemRef[], groupId: string | null): void => {
    for (const raw of refs) {
      if (raw.startsWith("g:")) continue;
      const ref = resolveRef(workspaces, repoKeys, raw);
      if (ref === null || seen.has(ref)) continue;
      seen.add(ref);
      placed.push({ ref, groupId });
    }
  };
  const takeGroup = (groupId: string): void => {
    if (!groupIds.has(groupId) || groupOrder.includes(groupId)) return;
    groupOrder.push(groupId);
    placed.push({ ref: `g:${groupId}`, groupId: null });
    takeItems(layout.groups[groupId] ?? [], groupId);
  };
  for (const ref of layout.top) {
    if (ref.startsWith("g:")) takeGroup(ref.slice(2));
    else takeItems([ref], null);
  }
  // レイアウトの一番上に無いグループ・workspace は一番上の末尾へ（配信の途中の状態でも崩れない）。
  for (const groupId of groupIds) takeGroup(groupId);
  takeItems(
    workspaces.map((w) => `w:${w.id}`),
    null,
  );
  return { groupOrder, placed };
}

/**
 * サイドバーの描画用の木。`layout` の順で、グループ（中に項目）・worktree グループ・通常の行を並べる。
 * 配信の途中の状態でも崩れない決まり: レイアウトに無い workspace は一番上の末尾に足す／実在しない参照は
 * 読み飛ばす／workspace の判定とレイアウトの参照が食い違うときは今の判定（`itemRefOf`）で項目を決め、
 * 置き場所はレイアウトにある参照のうち先に見つかったもの。
 *
 * `sort === "name"` は**一番上の行だけ**を名前（グループはグループの名前、worktree グループは先頭の
 * workspace の名前）で並べる。グループの中・worktree グループの中はレイアウトの順。
 */
export function sidebarTree(
  workspaces: Workspace[],
  groups: WorkspaceGroup[],
  layout: SidebarLayout,
  sort: WorkspaceSort,
): TopRow[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const { placed } = placeItems(workspaces, new Set(groupById.keys()), layout);
  const rows: TopRow[] = [];
  const groupRows = new Map<string, Extract<TopRow, { kind: "group" }>>();
  for (const { ref, groupId } of placed) {
    if (ref.startsWith("g:")) {
      const row = {
        kind: "group" as const,
        group: groupById.get(ref.slice(2))!,
        items: [] as ItemRow[],
      };
      groupRows.set(row.group.id, row);
      rows.push(row);
      continue;
    }
    const item = itemRowOf(workspaces, ref);
    if (!item) continue;
    if (groupId === null) rows.push(item);
    else groupRows.get(groupId)!.items.push(item);
  }
  if (sort === "name") {
    const labelOf = (r: TopRow): string =>
      r.kind === "group"
        ? r.group.label
        : r.kind === "workspace"
          ? r.workspace.label
          : r.head.label;
    rows.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
  }
  return rows;
}

/**
 * 木の上で、サイドバーに実際に見えている workspace の id を上から下へ辿った順で返す（`visibleWorkspaceIdsInOrder`
 * の木版。T19 で元の名前へ戻す）。畳んだグループ・畳んだ worktree グループの中は、今いる workspace だけ。
 * グループの折りたたみは木の `group.collapsed`、worktree グループは `collapsedRepos`（`repoKey` の集合）。
 */
export function visibleWorkspaceIdsOfTree(
  tree: TopRow[],
  collapsedRepos: ReadonlySet<string>,
  focusedWorkspaceId: string | null,
): string[] {
  const ids: string[] = [];
  const pushItem = (item: ItemRow, groupCollapsed: boolean): void => {
    if (item.kind === "workspace") {
      if (!groupCollapsed || item.workspace.id === focusedWorkspaceId) ids.push(item.workspace.id);
    } else if (groupCollapsed) {
      // 畳んだグループの中は、今いる workspace の行だけ（先頭でも子でも）。
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
    if (row.kind === "group") for (const item of row.items) pushItem(item, row.group.collapsed);
    else pushItem(row, false);
  }
  return ids;
}

/**
 * workspace の「一番上のまとまり」。グループの中の項目ならそのグループ、2 つ以上の workspace を持つ
 * リポジトリなら worktree グループ（`repo`）、それ以外は workspace 単体。`workspaceId` が無ければ null。
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
  const ref = itemRefOf(ws);
  const { placed } = placeItems(workspaces, groupIds, layout);
  const hit = placed.find((p) => p.ref === ref);
  if (hit?.groupId) return { kind: "group", groupId: hit.groupId };
  if (ref.startsWith("r:") && repoMembers(workspaces, ref.slice(2)).length >= 2)
    return { kind: "repo", repoKey: ref.slice(2) };
  return { kind: "workspace", workspaceId };
}

/**
 * `layout` を持たない古いサーバ・古い保存のための、仮のレイアウト（F13）。同じ `repoKey` は 1 つの項目にし、
 * 所属は本体の `groupId`（本体が無ければ最初に開いたもの）。位置は、グループなら先頭のメンバーの平らな順
 * （空のグループは末尾）、一番上の項目なら項目の先頭の workspace の平らな順。
 */
export function layoutFromLegacy(workspaces: Workspace[], groups: WorkspaceGroup[]): SidebarLayout {
  const groupIds = new Set(groups.map((g) => g.id));
  const indexOf = new Map(workspaces.map((w, i) => [w.id, i]));
  const items = new Map<ItemRef, { groupId: string | null; position: number }>();
  for (const w of workspaces) {
    const ref = itemRefOf(w);
    const position = indexOf.get(w.id)!;
    const known = items.get(ref);
    if (known) {
      known.position = Math.min(known.position, position);
      continue;
    }
    const owner = ref.startsWith("r:") ? repoMembers(workspaces, ref.slice(2))[0]! : w;
    items.set(ref, {
      groupId: owner.groupId !== null && groupIds.has(owner.groupId) ? owner.groupId : null,
      position,
    });
  }
  const sorted = [...items].sort((a, b) => a[1].position - b[1].position);
  const layout: SidebarLayout = { top: [], groups: {} };
  for (const g of groups) layout.groups[g.id] = [];
  const topUnits: { ref: ItemRef; position: number }[] = [];
  for (const [ref, item] of sorted) {
    if (item.groupId === null) {
      topUnits.push({ ref, position: item.position });
    } else {
      layout.groups[item.groupId]!.push(ref);
    }
  }
  for (const g of groups) {
    const first = layout.groups[g.id]![0];
    if (first !== undefined)
      topUnits.push({ ref: `g:${g.id}`, position: items.get(first)!.position });
  }
  topUnits.sort((a, b) => a.position - b.position);
  layout.top = topUnits.map((u) => u.ref);
  // 空のグループは末尾。
  for (const g of groups) if (layout.groups[g.id]!.length === 0) layout.top.push(`g:${g.id}`);
  return layout;
}
