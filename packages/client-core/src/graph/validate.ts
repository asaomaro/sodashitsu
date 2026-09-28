import {
  GRAPH_LINKS_MAX,
  GRAPH_NODES_MAX,
  GRAPH_PROMPT_MAX_BYTES,
  type Graph,
  type GraphLink,
  type LinkKind,
} from "@sodashitsu/protocol";

/**
 * 線とノードの検証（20260927-agent-graph の design「線の検証」）。サーバ（`graph.update` の拒否）と画面（保存の前の知らせ）が同じ規則を使う。
 * 形（id の書式・数値の範囲）は protocol のスキーマが見るので、ここはグラフとしての意味だけを見る。
 */
export type GraphIssueCode =
  | "duplicate_node"
  | "unknown_node"
  | "unknown_link"
  | "self_link"
  | "duplicate_link"
  | "supervisor_taken"
  | "too_many_nodes"
  | "too_many_links"
  | "prompt_too_long"
  | "empty_prompt"
  | "config_mismatch";

export interface GraphIssue {
  code: GraphIssueCode;
  /** 利用者に見せる日本語。 */
  message: string;
  linkId?: string;
  key?: string;
}

const KIND_NAME: Record<LinkKind, string> = {
  trigger: "トリガ",
  supervise: "監督",
  approval: "承認の代理",
};

/** 検証に使う線の中身（新しい線の下書きは id を持たない）。 */
export type LinkDraft = Pick<GraphLink, "kind" | "from" | "to" | "trigger" | "approval"> & {
  id?: string;
};

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** 線 1 本だけで決まる規則（自己参照・種類と設定の組・prompt）。 */
function linkOwnIssues(link: LinkDraft): GraphIssue[] {
  const at = link.id === undefined ? {} : { linkId: link.id };
  const issues: GraphIssue[] = [];
  if (link.from === link.to)
    issues.push({ code: "self_link", message: "同じノードどうしは結べません。", ...at });
  const wantsTrigger = link.kind === "trigger";
  const wantsApproval = link.kind === "approval";
  if (
    (link.trigger !== undefined) !== wantsTrigger ||
    (link.approval !== undefined) !== wantsApproval
  ) {
    issues.push({
      code: "config_mismatch",
      message: `${KIND_NAME[link.kind]}の線の設定の形が合いません。`,
      ...at,
    });
  }
  if (link.trigger !== undefined) {
    if (utf8Bytes(link.trigger.prompt) > GRAPH_PROMPT_MAX_BYTES) {
      issues.push({
        code: "prompt_too_long",
        message: `送る文面が長すぎます（${GRAPH_PROMPT_MAX_BYTES / 1024}KB まで）。`,
        ...at,
      });
    }
    if (link.trigger.prompt.trim() === "" && link.trigger.output === null) {
      issues.push({
        code: "empty_prompt",
        message: "送る文面が空です（文面を書くか、結果を受け渡してください）。",
        ...at,
      });
    }
  }
  return issues;
}

/** 他の線との関係で決まる規則（重複・監督役は 1 つ）。`others` に `link` 自身は含めない。 */
function linkRelationIssues(link: LinkDraft, others: readonly LinkDraft[]): GraphIssue[] {
  const at = link.id === undefined ? {} : { linkId: link.id };
  const issues: GraphIssue[] = [];
  if (others.some((o) => o.kind === link.kind && o.from === link.from && o.to === link.to)) {
    issues.push({
      code: "duplicate_link",
      message: `同じ向きの${KIND_NAME[link.kind]}の線が既にあります。`,
      ...at,
    });
  } else if (
    link.kind !== "trigger" &&
    others.some((o) => o.kind === link.kind && o.from === link.from)
  ) {
    // 監督・承認の代理は、1 つの配下につき監督役 1 つまで（どちらへ知らせるかを決められなくなるため）。
    issues.push({
      code: "supervisor_taken",
      message: `このノードには${KIND_NAME[link.kind]}の相手が既にいます（1 つまで）。`,
      ...at,
    });
  }
  return issues;
}

/** グラフ全体を検証する。問題が無ければ空。 */
export function validateGraph(graph: Pick<Graph, "nodes" | "links">): GraphIssue[] {
  const issues: GraphIssue[] = [];
  if (graph.nodes.length > GRAPH_NODES_MAX) {
    issues.push({
      code: "too_many_nodes",
      message: `載せられる pane は ${GRAPH_NODES_MAX} 個までです。`,
    });
  }
  if (graph.links.length > GRAPH_LINKS_MAX) {
    issues.push({ code: "too_many_links", message: `線は ${GRAPH_LINKS_MAX} 本までです。` });
  }
  const keys = new Set<string>();
  for (const node of graph.nodes) {
    if (keys.has(node.key))
      issues.push({
        code: "duplicate_node",
        message: "同じ pane が 2 回載っています。",
        key: node.key,
      });
    keys.add(node.key);
  }
  graph.links.forEach((link, i) => {
    for (const end of [link.from, link.to]) {
      if (!keys.has(end))
        issues.push({
          code: "unknown_node",
          message: "線の端のノードが載っていません。",
          linkId: link.id,
          key: end,
        });
    }
    issues.push(...linkOwnIssues(link));
    // 重複は後から来た線の方に付ける（同じ組を 2 回数えない）。
    issues.push(...linkRelationIssues(link, graph.links.slice(0, i)));
  });
  return issues;
}

/**
 * 1 本の線（新しい線の下書き・編集中の線）を、今のグラフに足した／置き換えたとして検証する（画面の保存の前）。
 * `link.id` があれば同じ id の線を置き換えたものとして見る。線の数の上限は新しい線のときだけ見る。
 */
export function validateLink(graph: Pick<Graph, "nodes" | "links">, link: LinkDraft): GraphIssue[] {
  const others = graph.links.filter((l) => link.id === undefined || l.id !== link.id);
  const issues: GraphIssue[] = [];
  const keys = new Set(graph.nodes.map((n) => n.key));
  for (const end of [link.from, link.to]) {
    if (!keys.has(end))
      issues.push({ code: "unknown_node", message: "線の端のノードが載っていません。", key: end });
  }
  if (link.id === undefined && others.length >= GRAPH_LINKS_MAX) {
    issues.push({ code: "too_many_links", message: `線は ${GRAPH_LINKS_MAX} 本までです。` });
  }
  issues.push(...linkOwnIssues(link), ...linkRelationIssues(link, others));
  return issues;
}
