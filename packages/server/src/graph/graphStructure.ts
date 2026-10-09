import type { Graph, SessionSnapshot } from "@sodashitsu/protocol";
import { graphStructureFrom, type LayoutStructure } from "@sodashitsu/client-core";

/**
 * 連携のグラフの空間の構成を、いまのセッションから導く（20261008-graph-first の T3）。保存しない。
 * 手元の、一時的でない pane（独自コマンドの pane・スクロールバックのエディタを除く。D16）を、workspace → サイドバーの項目（`r:`・`w:`）→
 * グループ（`Workspace.groupId` の実効値）にまとめる。別のマシンのノードは、グラフのノードの鍵から、マシンごとの囲いにまとめる。
 * 導き方の本体は client-core の `graphStructureFrom`（ブラウザ・`sodactl` と共有）。
 */
export interface GraphStructureSession {
  snapshot(): Pick<SessionSnapshot, "workspaces" | "tabs" | "panes" | "groups" | "layout">;
  isTransientPane(paneId: string): boolean;
}

export function graphStructure(
  session: GraphStructureSession,
  graph: Pick<Graph, "nodes">,
): LayoutStructure {
  const snap = session.snapshot();
  return graphStructureFrom(snap, {
    isTransient: (id) => session.isTransientPane(id),
    remoteKeys: graph.nodes.map((n) => n.key),
  });
}
