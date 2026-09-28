import type { Graph, GraphLink, GraphNode, GraphOp } from "@sodashitsu/protocol";
import { defaultApprovalConfig, LINK_LIMIT_DEFAULT } from "./defaults.js";
import { validateGraph, type GraphIssue } from "./validate.js";

/** 採番の続き（消した線の id を使い回さない。`graph.json` に保存する）。 */
export interface GraphDraftState {
  graph: Graph;
  /** 次に振る線の番号（"l<n>"）。 */
  nextLinkId: number;
}

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
export function applyGraphOps(state: GraphDraftState, ops: readonly GraphOp[]): ApplyOpsResult {
  const graph = cloneGraph(state.graph);
  let nextLinkId = state.nextLinkId;
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
        if (op.newKey !== op.key && findNode(op.newKey) !== undefined) {
          return fail({
            code: "duplicate_node",
            message: "その pane は既に載っています。",
            key: op.newKey,
          });
        }
        node.key = op.newKey;
        delete node.stale;
        for (const l of graph.links) {
          if (l.from === op.key) l.from = op.newKey;
          if (l.to === op.key) l.to = op.newKey;
        }
        break;
      }
      case "add_link": {
        const link: GraphLink = {
          id: `l${nextLinkId}`,
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
        nextLinkId++;
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
  return { ok: true, graph, nextLinkId };
}
