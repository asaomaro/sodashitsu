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
      if (tab === undefined) continue;
      leafPaneIds(tab.layout, ids);
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
