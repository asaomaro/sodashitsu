import type { Workspace, WorkspaceGroup } from "@sodashitsu/protocol";
import type { WorkspaceSort } from "./view.js";

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
