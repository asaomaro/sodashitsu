import type { Graph, GraphLink, GraphNode, GraphOp, NodeKey } from "@sodashitsu/protocol";
import { defaultApprovalConfig, LINK_LIMIT_DEFAULT } from "./defaults.js";
import { graphNodeRect, nextFreeGraphPosition } from "./geometry.js";
import { sameNodeMachine } from "./nodeKey.js";
import { validateGraph, type GraphIssue } from "./validate.js";

/** 操作を当てる対象（線の id は UUID で採番するので、採番の続きは持たない）。 */
export interface GraphDraftState {
  graph: Graph;
}

/** 線の id（UUID）。 */
export type LinkIdGenerator = () => string;

export type ApplyOpsResult = ({ ok: true } & GraphDraftState) | { ok: false; issues: GraphIssue[] };

function cloneGraph(g: Graph): Graph {
  return {
    rev: g.rev,
    paused: g.paused,
    nodes: g.nodes.map((n) => ({ ...n })),
    links: g.links.map((l) => ({
      ...l,
      ...(l.trigger === undefined
        ? {}
        : {
            trigger: {
              ...l.trigger,
              output: l.trigger.output === null ? null : { ...l.trigger.output },
            },
          }),
      ...(l.approval === undefined ? {} : { approval: { ...l.approval } }),
    })),
  };
}

/**
 * `graph.update` の操作をまとめて当てる（20260927-agent-graph の design「`graph.update`」）。途中で 1 つでも当てられない・当てた結果が
 * 検証に落ちるなら何も変えずに問題を返す。`rev` は変えない（保存する側が +1 する）。純粋（入力を書き換えない）。
 */
export function applyGraphOps(
  state: GraphDraftState,
  ops: readonly GraphOp[],
  newLinkId: LinkIdGenerator = () => globalThis.crypto.randomUUID(),
): ApplyOpsResult {
  const graph = cloneGraph(state.graph);
  const fail = (issue: GraphIssue): ApplyOpsResult => ({ ok: false, issues: [issue] });
  const findNode = (key: string): GraphNode | undefined => graph.nodes.find((n) => n.key === key);
  const findLink = (id: string): GraphLink | undefined => graph.links.find((l) => l.id === id);
  const unknownNode = (key: string) =>
    fail({ code: "unknown_node", message: "そのノードは載っていません。", key });
  const unknownLink = (id: string) =>
    fail({ code: "unknown_link", message: "その線はありません。", linkId: id });

  for (const op of ops) {
    switch (op.op) {
      case "add_node":
        if (findNode(op.key) !== undefined)
          return fail({
            code: "duplicate_node",
            message: "その pane は既に載っています。",
            key: op.key,
          });
        graph.nodes.push({ key: op.key, x: op.x, y: op.y });
        break;
      case "move_node": {
        const node = findNode(op.key);
        if (node === undefined) return unknownNode(op.key);
        node.x = op.x;
        node.y = op.y;
        break;
      }
      case "remove_node":
        if (findNode(op.key) === undefined) return unknownNode(op.key);
        graph.nodes = graph.nodes.filter((n) => n.key !== op.key);
        // 線も一緒に消える（design「異常系」）。
        graph.links = graph.links.filter((l) => l.from !== op.key && l.to !== op.key);
        break;
      case "rekey_node": {
        const node = findNode(op.key);
        if (node === undefined) return unknownNode(op.key);
        // 選び直しは同じマシンの pane へだけ（別のマシンへ付け替えると線の意味が変わる。web・sodactl も同じ規則。統合レビュー R1）。
        if (!sameNodeMachine(op.key, op.newKey)) {
          return fail({
            code: "rekey_other_machine",
            message: "別のマシンの pane へは選び直せません（同じマシンの pane だけ）。",
            key: op.newKey,
          });
        }
        if (op.newKey !== op.key && findNode(op.newKey) !== undefined) {
          return fail({
            code: "duplicate_node",
            message: "その pane は既に載っています。",
            key: op.newKey,
          });
        }
        node.key = op.newKey;
        for (const l of graph.links) {
          if (l.from === op.key) l.from = op.newKey;
          if (l.to === op.key) l.to = op.newKey;
        }
        break;
      }
      case "add_link": {
        const link: GraphLink = {
          id: newLinkId(),
          kind: op.kind,
          from: op.from,
          to: op.to,
          limit: op.limit ?? LINK_LIMIT_DEFAULT,
          count: 0,
          paused: null,
        };
        if (op.trigger !== undefined) link.trigger = op.trigger;
        if (op.approval !== undefined) link.approval = op.approval;
        else if (op.kind === "approval") link.approval = defaultApprovalConfig();
        graph.links.push(link);
        break;
      }
      case "update_link": {
        const link = findLink(op.id);
        if (link === undefined) return unknownLink(op.id);
        if (op.trigger !== undefined) link.trigger = op.trigger;
        if (op.approval !== undefined) link.approval = op.approval;
        if (op.limit !== undefined) {
          link.limit = op.limit;
          // 上限を今の回数以下に下げたら、その場で上限の一時停止にする（上限を超えて 1 回送らない。止まっている線はそのまま）。
          if (link.paused === null && link.count >= link.limit) link.paused = "limit";
        }
        break;
      }
      case "remove_link":
        if (findLink(op.id) === undefined) return unknownLink(op.id);
        graph.links = graph.links.filter((l) => l.id !== op.id);
        break;
      default:
        op satisfies never;
    }
  }
  const issues = validateGraph(graph);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, graph };
}

/**
 * 載っていない鍵を載せる `add_node`（画面の「pane を載せる」と同じ置き方: 今のノードの右隣に縦に並べる）。載っている鍵・同じ鍵の 2 回目は飛ばす。
 * sodactl の `graph node add`・`graph link add`（端のノードを一緒に載せる）が使う。
 */
export function addMissingNodeOps(
  graph: Pick<Graph, "nodes">,
  keys: readonly NodeKey[],
): GraphOp[] {
  const present = new Set<string>(graph.nodes.map((n) => n.key));
  const rects = graph.nodes.map(graphNodeRect);
  const ops: GraphOp[] = [];
  for (const key of keys) {
    if (present.has(key)) continue;
    present.add(key);
    ops.push({ op: "add_node", key, ...nextFreeGraphPosition(rects, ops.length) });
  }
  return ops;
}

/**
 * `graph.update` を送る前に、同じ規則で当ててみる（問題が無ければ空）。線の id は検証に関わらないので、仮の値を使う
 * （ブラウザの非セキュアな文脈では `crypto.randomUUID` が無いこともあるため、ここでは使わない）。
 */
export function checkGraphOps(graph: Graph, ops: readonly GraphOp[]): GraphIssue[] {
  let n = 0;
  const r = applyGraphOps({ graph }, ops, () => `check-${++n}`);
  return r.ok ? [] : r.issues;
}
