import type { Graph, GraphOp } from "@sodashitsu/protocol";
import {
  applyGraphOps,
  isLocalNodeKey,
  localNodeKeys,
  nodePositions,
  overlapIncreases,
  sameNodeMachine,
} from "@sodashitsu/client-core";
import { graphStructure, type GraphStructureSession } from "./graphStructure.js";

/**
 * `graph.update` の検査（20261008-graph-first の T7。D10）。**方式の層だけ**で行い、`applyGraphOps`・`validateGraph`（保存の読み込みにも使う純粋な関数）には入れない
 * ——入れると、保存済みのグラフが読めなくなる。サーバの内部の更新（`GraphPaneCleanup`・`GraphMaintainer`・`AgentLineage`・`GraphEngine`）は、これを通さない。
 *
 * - `node_required`: 開いている手元の pane のノードを外す（`remove_node`）・手元のノードを選び直す（`rekey_node`）。手元のすべての pane のノードはサーバが
 *   持ち、pane が閉じたときだけ消える。
 * - `frame_overlap`: その更新が、囲いの重なりを**新しく作る・広げる**ときだけ断る。すでに重なっている状態から、重なりを広げない更新（無関係の更新）は通す。
 */
export type GraphGuardCode = "node_required" | "frame_overlap";

export interface GraphGuardFailure {
  code: GraphGuardCode;
  message: string;
}

export function guardGraphUpdate(
  session: GraphStructureSession,
  before: Graph,
  ops: readonly GraphOp[],
): GraphGuardFailure | null {
  const touchesNodes = ops.some(
    (o) =>
      o.op === "remove_node" ||
      o.op === "rekey_node" ||
      o.op === "add_node" ||
      o.op === "move_node",
  );
  if (!touchesNodes) return null;

  // node_required: 構成に出てくる手元のノード（一時的な pane のものは含まない）を外す・選び直す操作。
  const required = new Set<string>(localNodeKeys(graphStructure(session, before)));
  for (const op of ops) {
    if (op.op === "remove_node" && required.has(op.key)) {
      return {
        code: "node_required",
        message: `the node of an open pane cannot be removed (close the pane instead): ${op.key}`,
      };
    }
    // 別のマシンへの付け替えは、`applyGraphOps` の `rekey_other_machine` で断られる（ここでは見ない）。
    if (op.op === "rekey_node" && isLocalNodeKey(op.key) && sameNodeMachine(op.key, op.newKey)) {
      return {
        code: "node_required",
        message: `the node of a local pane cannot be re-keyed: ${op.key}`,
      };
    }
  }

  // frame_overlap: 位置に関わる操作の結果が、囲いの重なりを新しく作る・広げるか。当てられない更新は、ここでは見ない（保存の側が断る）。
  if (!ops.some((o) => o.op === "add_node" || o.op === "move_node")) return null;
  let n = 0;
  const applied = applyGraphOps({ graph: before }, ops, () => `check-${++n}`);
  if (!applied.ok) return null;
  const structure = graphStructure(session, applied.graph);
  const increases = overlapIncreases(
    structure,
    nodePositions(before.nodes),
    nodePositions(applied.graph.nodes),
  );
  if (increases.length === 0) return null;
  const first = increases[0]!;
  return {
    code: "frame_overlap",
    message: `the update would make frames overlap (or overlap more): ${first.a} / ${first.b}`,
  };
}
