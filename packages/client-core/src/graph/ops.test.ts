import { describe, expect, it } from "vitest";
import type { Graph, GraphOp, NodeKey } from "@sodashitsu/protocol";
import {
  APPROVAL_LINES_DEFAULT,
  defaultTriggerConfig,
  emptyGraph,
  LINK_LIMIT_DEFAULT,
} from "./defaults.js";
import { applyGraphOps, type GraphDraftState } from "./ops.js";
import { GRAPH_LINK_ID_MAX } from "./validate.js";

// 20260927-agent-graph の T2（ops）：graph.update の操作をまとめて当てる。
const A = "local:p1";
const B = "local:p2";
const R: NodeKey = `${"f".repeat(32)}:p1`;

function state(graph: Partial<Graph> = {}, nextLinkId = 1): GraphDraftState {
  return { graph: { ...emptyGraph(), ...graph }, nextLinkId };
}
function ok(s: GraphDraftState, ops: GraphOp[]) {
  const r = applyGraphOps(s, ops);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r;
}

describe("applyGraphOps", () => {
  it("ノードを足して線を結ぶ（id は採番、既定の上限、回数 0）", () => {
    const r = ok(state(), [
      { op: "add_node", key: A, x: 0, y: 0 },
      { op: "add_node", key: B, x: 240, y: 0 },
      { op: "add_link", kind: "trigger", from: A, to: B, trigger: defaultTriggerConfig() },
      { op: "add_link", kind: "approval", from: A, to: B },
    ]);
    expect(r.nextLinkId).toBe(3);
    expect(r.graph.links).toEqual([
      {
        id: "l1",
        kind: "trigger",
        from: A,
        to: B,
        trigger: defaultTriggerConfig(),
        limit: LINK_LIMIT_DEFAULT,
        count: 0,
        paused: null,
      },
      {
        id: "l2",
        kind: "approval",
        from: A,
        to: B,
        approval: { mode: "notify", lines: APPROVAL_LINES_DEFAULT }, // 既定は知らせるだけ（D2）
        limit: LINK_LIMIT_DEFAULT,
        count: 0,
        paused: null,
      },
    ]);
  });

  it("消した線の id は使い回さない", () => {
    const s1 = ok(state(), [
      { op: "add_node", key: A, x: 0, y: 0 },
      { op: "add_node", key: B, x: 0, y: 0 },
      { op: "add_link", kind: "supervise", from: A, to: B },
    ]);
    const s2 = ok(s1, [{ op: "remove_link", id: "l1" }]);
    const s3 = ok(s2, [{ op: "add_link", kind: "supervise", from: A, to: B }]);
    expect(s3.graph.links.map((l) => l.id)).toEqual(["l2"]);
  });

  it("ノードを除くと線も消える", () => {
    const s1 = ok(state(), [
      { op: "add_node", key: A, x: 0, y: 0 },
      { op: "add_node", key: B, x: 0, y: 0 },
      { op: "add_link", kind: "supervise", from: A, to: B },
    ]);
    expect(ok(s1, [{ op: "remove_node", key: B }]).graph).toEqual({
      ...emptyGraph(),
      nodes: [{ key: A, x: 0, y: 0 }],
    });
  });

  it("move_node・update_link は位置・設定だけを変え、回数・一時停止は保つ", () => {
    const s1 = state(
      {
        nodes: [
          { key: A, x: 0, y: 0 },
          { key: B, x: 0, y: 0 },
        ],
        links: [
          {
            id: "l1",
            kind: "trigger",
            from: A,
            to: B,
            trigger: defaultTriggerConfig(),
            limit: 10,
            count: 7,
            paused: "limit",
          },
        ],
      },
      2,
    );
    const r = ok(s1, [
      { op: "move_node", key: B, x: 40, y: 60 },
      {
        op: "update_link",
        id: "l1",
        limit: 20,
        trigger: { ...defaultTriggerConfig(), on: "blocked" },
      },
    ]);
    expect(r.graph.nodes[1]).toEqual({ key: B, x: 40, y: 60 });
    expect(r.graph.links[0]).toMatchObject({
      limit: 20,
      count: 7,
      paused: "limit",
      trigger: { on: "blocked" },
    });
  });

  it("rekey_node は無効の印を外し、線を付け替える", () => {
    const s1 = state(
      {
        nodes: [
          { key: A, x: 0, y: 0, stale: true },
          { key: B, x: 0, y: 0 },
        ],
        links: [{ id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null }],
      },
      2,
    );
    const r = ok(s1, [{ op: "rekey_node", key: A, newKey: R }]);
    expect(r.graph.nodes[0]).toEqual({ key: R, x: 0, y: 0 });
    expect(r.graph.links[0]).toMatchObject({ from: R, to: B });
    // 既に載っている pane へは選び直せない
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "duplicate_node" }],
    });
  });

  it("rekey_node で既に載っている鍵へ移すのは duplicate_node、トリガの線を設定なしで足すのは config_mismatch（g01 点検）", () => {
    const s1 = state({
      nodes: [
        { key: A, x: 0, y: 0, stale: true },
        { key: B, x: 0, y: 0 },
      ],
    });
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "duplicate_node", key: B }],
    });
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: A }])).toMatchObject({
      ok: true,
    }); // 同じ鍵は選び直し（印だけ外れる）
    expect(applyGraphOps(s1, [{ op: "add_link", kind: "trigger", from: A, to: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "config_mismatch" }],
    });
  });

  it("次の番号が安全な整数の範囲を超えるなら add_link を断る（01 のレビュー ラウンド 1）", () => {
    const s1 = state(
      {
        nodes: [
          { key: A, x: 0, y: 0 },
          { key: B, x: 0, y: 0 },
        ],
      },
      GRAPH_LINK_ID_MAX,
    );
    expect(ok(s1, [{ op: "add_link", kind: "supervise", from: A, to: B }]).graph.links[0]!.id).toBe(
      `l${GRAPH_LINK_ID_MAX}`,
    );
    const s2 = { ...s1, nextLinkId: GRAPH_LINK_ID_MAX + 1 };
    expect(
      applyGraphOps(s2, [{ op: "add_link", kind: "supervise", from: A, to: B }]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "link_id_too_large" }],
    });
  });

  it("途中の 1 つでも不正なら何も変えない（入力も書き換えない）", () => {
    const s1 = state({ nodes: [{ key: A, x: 0, y: 0 }] });
    const before = JSON.stringify(s1);
    const cases: [GraphOp[], string][] = [
      [[{ op: "add_node", key: A, x: 1, y: 1 }], "duplicate_node"],
      [[{ op: "move_node", key: B, x: 1, y: 1 }], "unknown_node"],
      [[{ op: "remove_node", key: B }], "unknown_node"],
      [[{ op: "rekey_node", key: B, newKey: R }], "unknown_node"],
      [[{ op: "update_link", id: "l9", limit: 3 }], "unknown_link"],
      [[{ op: "remove_link", id: "l9" }], "unknown_link"],
      [
        [
          { op: "move_node", key: A, x: 5, y: 5 },
          { op: "add_link", kind: "supervise", from: A, to: B },
        ],
        "unknown_node",
      ],
      [[{ op: "add_link", kind: "supervise", from: A, to: A }], "self_link"],
    ];
    for (const [ops, code] of cases) {
      expect(applyGraphOps(s1, ops)).toMatchObject({
        ok: false,
        issues: [expect.objectContaining({ code })],
      });
    }
    expect(JSON.stringify(s1)).toBe(before);
  });

  it("成功しても入力のグラフを書き換えない", () => {
    const s1 = state({ nodes: [{ key: A, x: 0, y: 0 }] });
    const before = JSON.stringify(s1);
    ok(s1, [{ op: "move_node", key: A, x: 20, y: 20 }]);
    expect(JSON.stringify(s1)).toBe(before);
  });
});
