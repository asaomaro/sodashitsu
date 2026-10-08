import type {
  NodeKey,
  Pane,
  SidebarLayout,
  Tab,
  Workspace,
  WorkspaceGroup,
  LayoutNode,
} from "@sodashitsu/protocol";
import { layoutFromLegacy, sidebarTree, UNGROUPED_REF } from "../workspace/workspaceGrouping.js";
import type { LayoutMember, LayoutStructure, LayoutTop } from "./graphLayout.js";
import { LOCAL_MACHINE, nodeKey, parseNodeKey } from "./nodeKey.js";

/**
 * グラフの空間の構成を、セッションの状態から導く（20261008-graph-first の T3。サーバの `graphStructure`・ブラウザ・`sodactl` が同じ関数を使う）。
 * 保存はしない。pane → workspace → サイドバーの項目（`r:`・`w:`）→ グループ（`Workspace.groupId` の実効値）にまとめる。
 *
 * - 手元の pane のノードの鍵は `local:<paneId>`。**一時的な pane**（独自コマンドの pane・スクロールバックのエディタ）は含めない。
 * - 代表でない workspace は、サイドバーと同じに、単独の項目（worktree グループの囲いに入れない）。
 * - 別のマシンのノードは、鍵のマシンの id ごとに 1 つの囲い（`m:<マシンの id>`）にして、「グループなし」の空間の末尾に置く。
 */
export interface StructureSource {
  workspaces: readonly Workspace[];
  tabs: readonly Tab[];
  panes: readonly Pane[];
  groups: readonly WorkspaceGroup[];
  layout?: SidebarLayout | undefined;
}

export interface GraphStructureOptions {
  /** 一時的な pane か（ノードを足さない）。 */
  isTransient?: (paneId: string) => boolean;
  /** グラフにある、別のマシンのノードの鍵（手元の鍵は無視する）。 */
  remoteKeys?: readonly string[];
}

/** 別のマシンの囲いの id。 */
export function machineMemberId(machineId: string): string {
  return `m:${machineId}`;
}

function leafPaneIds(node: LayoutNode, out: string[]): void {
  if (node.type === "pane") out.push(node.paneId);
  else {
    leafPaneIds(node.a, out);
    leafPaneIds(node.b, out);
  }
}

export function graphStructureFrom(
  src: StructureSource,
  options: GraphStructureOptions = {},
): LayoutStructure {
  const workspaces = [...src.workspaces];
  const groups = [...src.groups];
  const isTransient = options.isTransient ?? (() => false);
  const tabById = new Map(src.tabs.map((t) => [t.id, t]));
  const paneById = new Map(src.panes.map((p) => [p.id, p]));

  // workspace ごとのノードの鍵（tab の順 → tab の中の分割の並び順）。
  const keysOf = new Map<string, NodeKey[]>();
  for (const ws of workspaces) {
    const ids: string[] = [];
    for (const tabId of ws.tabIds) {
      const tab = tabById.get(tabId);
      // 分割の並び順（layout）で。配信の途中などで layout が無い・一部の pane が layout に無いときは、pane の並びで補う。
      if (tab?.layout !== undefined) leafPaneIds(tab.layout, ids);
      for (const p of src.panes) if (p.tabId === tabId) ids.push(p.id);
    }
    const keys: NodeKey[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id) || !paneById.has(id) || isTransient(id)) continue;
      seen.add(id);
      keys.push(nodeKey(LOCAL_MACHINE, id));
    }
    keysOf.set(ws.id, keys);
  }
  const memberOf = (ws: Workspace): LayoutMember => ({ id: ws.id, nodes: keysOf.get(ws.id) ?? [] });

  const layout = src.layout ?? layoutFromLegacy(workspaces, groups);
  const rows = sidebarTree(workspaces, groups, layout, "opened");
  const spaces: { id: string; tops: LayoutTop[] }[] = rows.map((row) => {
    const tops: LayoutTop[] = row.items.map((item) =>
      item.kind === "workspace"
        ? { id: item.workspace.id, kind: "workspace", members: [memberOf(item.workspace)] }
        : {
            id: `r:${item.repoKey}`,
            kind: "worktree",
            members: [item.head, ...item.children].map(memberOf),
          },
    );
    return { id: row.kind === "group" ? `g:${row.group.id}` : UNGROUPED_REF, tops };
  });

  // 別のマシンのノード: マシンごとに 1 つの囲い。「グループなし」の末尾へ。
  const byMachine = new Map<string, NodeKey[]>();
  for (const key of options.remoteKeys ?? []) {
    const parsed = parseNodeKey(key);
    if (parsed === null || parsed.machine === LOCAL_MACHINE) continue;
    const list = byMachine.get(parsed.machine) ?? [];
    list.push(key as NodeKey);
    byMachine.set(parsed.machine, list);
  }
  if (byMachine.size > 0) {
    const ungrouped = spaces.find((s) => s.id === UNGROUPED_REF);
    const machineTops: LayoutTop[] = [...byMachine].map(([machine, nodes]) => ({
      id: machineMemberId(machine),
      kind: "machine",
      members: [{ id: machineMemberId(machine), nodes }],
    }));
    if (ungrouped !== undefined) {
      ungrouped.tops.push(...machineTops);
    } else {
      spaces.push({ id: UNGROUPED_REF, tops: machineTops });
    }
  }
  return { spaces };
}

/** 構成の中の、手元のノードの鍵の全部（一時的な pane を除く）。 */
export function localNodeKeys(structure: LayoutStructure): NodeKey[] {
  return structure.spaces.flatMap((s) =>
    s.tops.flatMap((t) =>
      t.members.flatMap((m) => m.nodes.filter((k) => k.startsWith(`${LOCAL_MACHINE}:`))),
    ),
  );
}

/** `sodactl graph show --json` の空間（グループの id・名前・含む workspace の id）。`id`・`name` が null のものは「グループなし」。 */
export interface GraphSpaceInfo {
  id: string | null;
  name: string | null;
  workspaces: string[];
}

/**
 * 空間の一覧（20261008-graph-first。`sodactl graph show` の `spaces`）。グループの並び（サイドバーと同じ）で、含む workspace は項目の並びの順。
 * 別のマシンの囲いは workspace ではないので含めない。ノードを持たない空間・workspace も出す（空間は、グループ・「グループなし」ごとにある）。
 */
export function describeGraphSpaces(
  structure: LayoutStructure,
  groups: readonly WorkspaceGroup[],
): GraphSpaceInfo[] {
  const labelOf = new Map(groups.map((g) => [g.id, g.label]));
  return structure.spaces.map((sp) => {
    const groupId = sp.id.startsWith("g:") ? sp.id.slice(2) : null;
    return {
      id: groupId,
      name: groupId === null ? null : (labelOf.get(groupId) ?? null),
      workspaces: sp.tops.flatMap((t) => (t.kind === "machine" ? [] : t.members.map((m) => m.id))),
    };
  });
}
