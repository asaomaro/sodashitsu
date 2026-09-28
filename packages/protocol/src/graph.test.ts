import { describe, expect, it } from "vitest";
import {
  GRAPH_LINKS_MAX,
  GRAPH_NODES_MAX,
  GRAPH_OPS_MAX,
  GRAPH_PROMPT_MAX_BYTES,
  GraphHistoryParams,
  GraphLinkSchema,
  GraphPauseParams,
  GraphSchema,
  GraphUpdateParams,
  NODE_KEY_RE,
  TriggerConfigSchema,
} from "./graph.js";
import { METHOD_SCHEMAS } from "./messages.js";

// 20260927-agent-graph の T1：グラフの型・方式の形。
const MACHINE = "ab".repeat(16);
const trigger = { on: "done", prompt: "見て", output: { lines: 80 }, whenBusy: "wait" } as const;
const link = {
  id: "l1",
  kind: "trigger",
  from: "local:p1",
  to: "local:p2",
  trigger,
  limit: 10,
  count: 0,
  paused: null,
} as const;

describe("NodeKey", () => {
  it("local か 32 桁の 16 進のマシン id と、pane の id", () => {
    expect(NODE_KEY_RE.test("local:p3")).toBe(true);
    expect(NODE_KEY_RE.test(`${MACHINE}:p12`)).toBe(true);
    expect(NODE_KEY_RE.test("local:w3")).toBe(false);
    expect(NODE_KEY_RE.test("local:p0")).toBe(false);
    expect(NODE_KEY_RE.test("box:p3")).toBe(false); // マシンは名前でなく id
    expect(NODE_KEY_RE.test(`${MACHINE.toUpperCase()}:p3`)).toBe(false);
    expect(NODE_KEY_RE.test("local:p3 ")).toBe(false);
  });
});

describe("GraphSchema", () => {
  it("正しいグラフを通す", () => {
    const g = {
      rev: 3,
      paused: false,
      nodes: [{ key: "local:p1", x: 0, y: 20, stale: true }],
      links: [link],
    };
    expect(GraphSchema.parse(g)).toEqual(g);
  });

  it("ノード・線の数の上限", () => {
    const nodes = Array.from({ length: GRAPH_NODES_MAX + 1 }, (_, i) => ({
      key: `local:p${i + 1}`,
      x: 0,
      y: 0,
    }));
    expect(GraphSchema.safeParse({ rev: 0, paused: false, nodes, links: [] }).success).toBe(false);
    const links = Array.from({ length: GRAPH_LINKS_MAX + 1 }, (_, i) => ({
      ...link,
      id: `l${i + 1}`,
    }));
    expect(GraphSchema.safeParse({ rev: 0, paused: false, nodes: [], links }).success).toBe(false);
  });

  it("stale は true だけ・座標は有限", () => {
    expect(
      GraphSchema.safeParse({
        rev: 0,
        paused: false,
        nodes: [{ key: "local:p1", x: 0, y: 0, stale: false }],
        links: [],
      }).success,
    ).toBe(false);
    expect(
      GraphSchema.safeParse({
        rev: 0,
        paused: false,
        nodes: [{ key: "local:p1", x: Infinity, y: 0 }],
        links: [],
      }).success,
    ).toBe(false);
  });

  it("線の limit は 1〜100、paused は user/limit/null", () => {
    expect(GraphLinkSchema.safeParse({ ...link, limit: 0 }).success).toBe(false);
    expect(GraphLinkSchema.safeParse({ ...link, limit: 101 }).success).toBe(false);
    expect(GraphLinkSchema.safeParse({ ...link, paused: "x" }).success).toBe(false);
    expect(GraphLinkSchema.safeParse({ ...link, id: "x1" }).success).toBe(false);
  });
});

describe("TriggerConfigSchema", () => {
  it("prompt は 8KB（UTF-8）まで", () => {
    expect(
      TriggerConfigSchema.safeParse({ ...trigger, prompt: "a".repeat(GRAPH_PROMPT_MAX_BYTES) })
        .success,
    ).toBe(true);
    expect(
      TriggerConfigSchema.safeParse({ ...trigger, prompt: "a".repeat(GRAPH_PROMPT_MAX_BYTES + 1) })
        .success,
    ).toBe(false);
    // 3 バイトの文字で数える（文字数でなくバイト数）
    expect(
      TriggerConfigSchema.safeParse({
        ...trigger,
        prompt: "あ".repeat(GRAPH_PROMPT_MAX_BYTES / 3 + 1),
      }).success,
    ).toBe(false);
  });

  it("受け渡す行数は 1〜500、null は受け渡さない", () => {
    expect(TriggerConfigSchema.safeParse({ ...trigger, output: null }).success).toBe(true);
    expect(TriggerConfigSchema.safeParse({ ...trigger, output: { lines: 0 } }).success).toBe(false);
    expect(TriggerConfigSchema.safeParse({ ...trigger, output: { lines: 501 } }).success).toBe(
      false,
    );
  });
});

describe("graph.* の方式", () => {
  it("METHOD_SCHEMAS に 5 つ登録する", () => {
    for (const m of ["graph.get", "graph.update", "graph.pause", "graph.resume", "graph.history"])
      expect(Object.keys(METHOD_SCHEMAS)).toContain(m);
  });

  it("graph.update は baseRev と 1 つ以上の操作", () => {
    expect(GraphUpdateParams.safeParse({ baseRev: 0, ops: [] }).success).toBe(false);
    expect(GraphUpdateParams.safeParse({ ops: [{ op: "remove_link", id: "l1" }] }).success).toBe(
      false,
    );
    expect(
      GraphUpdateParams.safeParse({
        baseRev: 2,
        ops: [
          { op: "add_node", key: "local:p1", x: 0, y: 0 },
          { op: "move_node", key: "local:p1", x: 20, y: 40 },
          { op: "rekey_node", key: "local:p1", newKey: `${MACHINE}:p1` },
          { op: "add_link", kind: "supervise", from: "local:p1", to: "local:p2" },
          { op: "update_link", id: "l1", limit: 5 },
          { op: "remove_link", id: "l1" },
          { op: "remove_node", key: "local:p1" },
        ],
      }).success,
    ).toBe(true);
    const many = Array.from({ length: GRAPH_OPS_MAX + 1 }, () => ({ op: "remove_link", id: "l1" }));
    expect(GraphUpdateParams.safeParse({ baseRev: 0, ops: many }).success).toBe(false);
    expect(GraphUpdateParams.safeParse({ baseRev: 0, ops: [{ op: "explode" }] }).success).toBe(
      false,
    );
  });

  it("add_link で count・paused は送れない（サーバが持つ値）", () => {
    const parsed = GraphUpdateParams.parse({
      baseRev: 0,
      ops: [
        {
          op: "add_link",
          kind: "supervise",
          from: "local:p1",
          to: "local:p2",
          count: 99,
          paused: "user",
        },
      ],
    });
    expect(parsed.ops[0]).toEqual({
      op: "add_link",
      kind: "supervise",
      from: "local:p1",
      to: "local:p2",
    });
  });

  it("pause・resume・history の linkId は省ける", () => {
    expect(GraphPauseParams.parse({})).toEqual({});
    expect(GraphPauseParams.safeParse({ linkId: "p1" }).success).toBe(false);
    expect(GraphHistoryParams.safeParse({ limit: 0 }).success).toBe(false);
  });
});
