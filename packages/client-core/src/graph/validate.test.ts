import { describe, expect, it } from "vitest";
import {
  GRAPH_LINKS_MAX,
  GRAPH_LOCAL_NODES_MAX,
  GRAPH_REMOTE_NODES_MAX,
  GRAPH_PROMPT_MAX_BYTES,
  type Graph,
  type GraphLink,
  type NodeKey,
} from "@sodashitsu/protocol";
import { defaultApprovalConfig, defaultTriggerConfig } from "./defaults.js";
import { validateGraph, validateLink, type GraphIssueCode } from "./validate.js";

// 20260927-agent-graph の T2：線とノードの検証の全規則。
const A: NodeKey = "local:p1";
const B: NodeKey = "local:p2";
const C: NodeKey = "local:p3";

function link(over: Partial<GraphLink> & Pick<GraphLink, "id">): GraphLink {
  return {
    kind: "trigger",
    from: A,
    to: B,
    trigger: defaultTriggerConfig(),
    limit: 10,
    count: 0,
    paused: null,
    ...over,
  };
}
function graph(links: GraphLink[], keys: NodeKey[] = [A, B, C]): Graph {
  return { rev: 1, paused: false, nodes: keys.map((key) => ({ key, x: 0, y: 0 })), links };
}
const codes = (issues: { code: GraphIssueCode }[]) => issues.map((i) => i.code);

describe("validateGraph", () => {
  it("正しいグラフは問題なし（3 種類の線・往復のトリガ）", () => {
    const g = graph([
      link({ id: "l1" }),
      link({ id: "l2", from: B, to: A }),
      { id: "l3", kind: "supervise", from: A, to: C, limit: 10, count: 0, paused: null },
      {
        id: "l4",
        kind: "approval",
        from: A,
        to: C,
        approval: defaultApprovalConfig(),
        limit: 10,
        count: 0,
        paused: null,
      },
    ]);
    expect(validateGraph(g)).toEqual([]);
  });

  it("自分自身への線は不可", () => {
    expect(codes(validateGraph(graph([link({ id: "l1", to: A })])))).toEqual(["self_link"]);
  });

  it("同じ (kind, from, to) の重複は不可（後の線に付ける）", () => {
    const issues = validateGraph(graph([link({ id: "l1" }), link({ id: "l2" })]));
    expect(issues).toEqual([expect.objectContaining({ code: "duplicate_link", linkId: "l2" })]);
  });

  it("種類が違えば同じ向きでもよい", () => {
    const g = graph([
      link({ id: "l1" }),
      { id: "l2", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null },
    ]);
    expect(validateGraph(g)).toEqual([]);
  });

  it("監督・承認の代理は 1 つの配下につき監督役 1 つまで（トリガは制限なし）", () => {
    const sup = (id: string, to: NodeKey): GraphLink => ({
      id,
      kind: "supervise",
      from: A,
      to,
      limit: 10,
      count: 0,
      paused: null,
    });
    expect(codes(validateGraph(graph([sup("l1", B), sup("l2", C)])))).toEqual(["supervisor_taken"]);
    const appr = (id: string, to: NodeKey): GraphLink => ({
      id,
      kind: "approval",
      from: A,
      to,
      approval: defaultApprovalConfig(),
      limit: 10,
      count: 0,
      paused: null,
    });
    expect(codes(validateGraph(graph([appr("l1", B), appr("l2", C)])))).toEqual([
      "supervisor_taken",
    ]);
    expect(validateGraph(graph([link({ id: "l1" }), link({ id: "l2", to: C })]))).toEqual([]);
  });

  it("線の端のノードが載っていなければ不可", () => {
    expect(codes(validateGraph(graph([link({ id: "l1", to: "local:p9" })])))).toEqual([
      "unknown_node",
    ]);
  });

  it("同じノードが 2 回は不可", () => {
    expect(codes(validateGraph(graph([], [A, A])))).toEqual(["duplicate_node"]);
  });

  it("手元のノード 512・別のマシンのノード 64（別枠）・線 512 まで", () => {
    const keys = Array.from(
      { length: GRAPH_LOCAL_NODES_MAX + 1 },
      (_, i): NodeKey => `local:p${i + 1}`,
    );
    expect(codes(validateGraph(graph([], keys)))).toEqual(["too_many_nodes"]);
    expect(validateGraph(graph([], keys.slice(0, GRAPH_LOCAL_NODES_MAX)))).toEqual([]);
    // 別のマシンのノードは別枠: 手元が上限いっぱいでも、別のマシンのノードを 64 個まで足せる。
    const M = "0123456789abcdef0123456789abcdef";
    const remote = Array.from(
      { length: GRAPH_REMOTE_NODES_MAX + 1 },
      (_, i): NodeKey => `${M}:r${i + 1}`,
    );
    expect(
      validateGraph(
        graph([], [...keys.slice(0, GRAPH_LOCAL_NODES_MAX), ...remote.slice(0, GRAPH_REMOTE_NODES_MAX)]),
      ),
    ).toEqual([]);
    expect(codes(validateGraph(graph([], remote)))).toEqual(["too_many_remote_nodes"]);
    const many = Array.from({ length: GRAPH_LINKS_MAX + 1 }, (_, i) =>
      link({ id: `l${i + 1}`, from: keys[i % 100]!, to: keys[100 + Math.floor(i / 100)]! }),
    );
    const base = keys.slice(0, GRAPH_LOCAL_NODES_MAX);
    expect(codes(validateGraph(graph(many, base)))).toEqual(["too_many_links"]);
    expect(validateGraph(graph(many.slice(0, GRAPH_LINKS_MAX), base))).toEqual([]);
  });

  it("prompt は 8KB まで", () => {
    const at = (prompt: string) =>
      validateGraph(graph([link({ id: "l1", trigger: { ...defaultTriggerConfig(), prompt } })]));
    expect(at("a".repeat(GRAPH_PROMPT_MAX_BYTES))).toEqual([]);
    expect(codes(at("a".repeat(GRAPH_PROMPT_MAX_BYTES + 1)))).toEqual(["prompt_too_long"]);
  });

  it("文面が空で受け渡しも無いトリガは不可（受け渡しがあれば文面は空でよい）", () => {
    const t = defaultTriggerConfig();
    expect(
      codes(
        validateGraph(graph([link({ id: "l1", trigger: { ...t, prompt: " \n", output: null } })])),
      ),
    ).toEqual(["empty_prompt"]);
    expect(
      validateGraph(
        graph([link({ id: "l1", trigger: { ...t, prompt: "", output: { lines: 5 } } })]),
      ),
    ).toEqual([]);
  });

  it("種類と設定の組が合わなければ不可", () => {
    const bad: GraphLink[] = [
      { id: "l1", kind: "trigger", from: A, to: B, limit: 10, count: 0, paused: null },
      {
        id: "l2",
        kind: "supervise",
        from: A,
        to: B,
        trigger: defaultTriggerConfig(),
        limit: 10,
        count: 0,
        paused: null,
      },
      { id: "l3", kind: "approval", from: B, to: C, limit: 10, count: 0, paused: null },
      link({ id: "l4", from: C, to: A, approval: defaultApprovalConfig() }),
    ];
    expect(codes(validateGraph(graph(bad)))).toEqual([
      "config_mismatch",
      "config_mismatch",
      "config_mismatch",
      "config_mismatch",
    ]);
  });
});

describe("validate の修正（20260927-agent-graph の g01 点検）", () => {
  it("{output} を除くと空の文面は、受け渡しが無ければ empty_prompt（空の文面を送らない）", () => {
    const t = defaultTriggerConfig();
    expect(
      codes(
        validateGraph(
          graph([link({ id: "l1", trigger: { ...t, prompt: "{output}", output: null } })]),
        ),
      ),
    ).toEqual(["empty_prompt"]);
    expect(
      codes(
        validateGraph(
          graph([
            link({ id: "l1", trigger: { ...t, prompt: " {output}{output}\n", output: null } }),
          ]),
        ),
      ),
    ).toEqual(["empty_prompt"]);
    expect(
      validateGraph(
        graph([link({ id: "l1", trigger: { ...t, prompt: "見て {output}", output: null } })]),
      ),
    ).toEqual([]);
  });

  it("グラフに無い id の下書きは新しい線として 128 本の上限を見る", () => {
    const full = graph(
      Array.from({ length: GRAPH_LINKS_MAX }, (_, i) =>
        link({ id: `l${i + 1}`, to: `local:p${i + 2}` }),
      ),
    );
    expect(codes(validateLink(full, { id: "l999", kind: "supervise", from: C, to: A }))).toContain(
      "too_many_links",
    );
    // 既にある線の編集は上限に数えない
    expect(
      codes(
        validateLink(full, {
          id: "l1",
          kind: "trigger",
          from: A,
          to: B,
          trigger: defaultTriggerConfig(),
        }),
      ),
    ).not.toContain("too_many_links");
  });
});

describe("線の id（01 のレビュー ラウンド 1）", () => {
  it("同じ id の線が 2 本は duplicate_link_id（remove_link で両方消えない）", () => {
    const issues = validateGraph(graph([link({ id: "l1" }), link({ id: "l1", from: B, to: C })]));
    expect(issues).toEqual([expect.objectContaining({ code: "duplicate_link_id", linkId: "l1" })]);
  });
});

describe("validateLink（保存の前の検証）", () => {
  const g = graph([link({ id: "l1" })]);

  it("新しい線は既存と重複すれば不可、自身の編集は重複にしない", () => {
    expect(
      codes(validateLink(g, { kind: "trigger", from: A, to: B, trigger: defaultTriggerConfig() })),
    ).toEqual(["duplicate_link"]);
    expect(
      validateLink(g, {
        id: "l1",
        kind: "trigger",
        from: A,
        to: B,
        trigger: defaultTriggerConfig(),
      }),
    ).toEqual([]);
  });

  it("載っていない端・線の上限", () => {
    expect(
      codes(
        validateLink(g, {
          kind: "trigger",
          from: A,
          to: "local:p8",
          trigger: defaultTriggerConfig(),
        }),
      ),
    ).toEqual(["unknown_node"]);
    const full = graph(
      Array.from({ length: GRAPH_LINKS_MAX }, (_, i) =>
        link({ id: `l${i + 1}`, to: `local:p${i + 2}` }),
      ),
    );
    expect(codes(validateLink(full, { kind: "supervise", from: C, to: A }))).toContain(
      "too_many_links",
    );
  });
});
