import { beforeEach, describe, expect, it } from "vitest";
import {
  GRAPH_LOCAL_NODES_MAX,
  GRAPH_REMOTE_NODES_MAX,
  UUID_RE,
  type Graph,
  type GraphOp,
  type NodeKey,
} from "@sodashitsu/protocol";
import {
  APPROVAL_LINES_DEFAULT,
  defaultTriggerConfig,
  emptyGraph,
  LINK_LIMIT_DEFAULT,
} from "./defaults.js";
import { addMissingNodeOps, applyGraphOps, checkGraphOps, type GraphDraftState } from "./ops.js";

// 20260927-agent-graph の T2（ops）：graph.update の操作をまとめて当てる。
const A = "local:p1";
const B = "local:p2";
const R: NodeKey = `${"f".repeat(32)}:p1`;

function state(graph: Partial<Graph> = {}): GraphDraftState {
  return { graph: { ...emptyGraph(), ...graph } };
}
// 線の id は UUID（既定）。形を決め打ちしない試験は、決まった順の id を差し込む。
let linkSeq = 0;
const nextLink = (): string => `l${++linkSeq}`;
beforeEach(() => {
  linkSeq = 0;
});
function ok(s: GraphDraftState, ops: GraphOp[]) {
  const r = applyGraphOps(s, ops, nextLink);
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
    const s1 = state({
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
    });
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

  it("rekey_node は線を付け替える", () => {
    const s1 = state({
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: B, x: 0, y: 0 },
      ],
      links: [{ id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null }],
    });
    const C = "local:p5";
    const r = ok(s1, [{ op: "rekey_node", key: A, newKey: C }]);
    expect(r.graph.nodes[0]).toEqual({ key: C, x: 0, y: 0 });
    expect(r.graph.links[0]).toMatchObject({ from: C, to: B });
    // 既に載っている pane へは選び直せない
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "duplicate_node" }],
    });
  });

  it("rekey_node は別のマシンの pane へ付け替えない（手元⇄別のマシン・別のマシンどうし。統合レビュー R1）", () => {
    const R2: NodeKey = `${"e".repeat(32)}:p1`;
    const s1 = state({
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: R, x: 0, y: 0 },
      ],
    });
    for (const [key, newKey] of [
      [A, R2],
      [R, "local:p1"],
      [R, R2],
    ] as const) {
      expect(applyGraphOps(s1, [{ op: "rekey_node", key, newKey }])).toMatchObject({
        ok: false,
        issues: [{ code: "rekey_other_machine", key: newKey }],
      });
    }
    // 同じマシンの pane へは付け替えられる
    expect(
      applyGraphOps(s1, [{ op: "rekey_node", key: R, newKey: `${"f".repeat(32)}:p9` }]),
    ).toMatchObject({ ok: true });
  });

  it("rekey_node で既に載っている鍵へ移すのは duplicate_node、トリガの線を設定なしで足すのは config_mismatch（g01 点検）", () => {
    const s1 = state({
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: B, x: 0, y: 0 },
      ],
    });
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "duplicate_node", key: B }],
    });
    expect(applyGraphOps(s1, [{ op: "rekey_node", key: A, newKey: A }])).toMatchObject({
      ok: true,
    }); // 同じ鍵は何も変えない
    expect(applyGraphOps(s1, [{ op: "add_link", kind: "trigger", from: A, to: B }])).toMatchObject({
      ok: false,
      issues: [{ code: "config_mismatch" }],
    });
  });

  it("既定の線の id は UUID で、採番のたびに別の値（消した線の id も使い回さない）", () => {
    const s0 = state({
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: B, x: 0, y: 0 },
      ],
    });
    const r1 = applyGraphOps(s0, [{ op: "add_link", kind: "supervise", from: A, to: B }]);
    if (!r1.ok) throw new Error(JSON.stringify(r1.issues));
    const id1 = r1.graph.links[0]!.id;
    expect(id1).toMatch(UUID_RE);
    const r2 = applyGraphOps(s0, [{ op: "add_link", kind: "supervise", from: A, to: B }]);
    if (!r2.ok) throw new Error(JSON.stringify(r2.issues));
    expect(r2.graph.links[0]!.id).toMatch(UUID_RE);
    expect(r2.graph.links[0]!.id).not.toBe(id1);
  });

  it("update_link で上限を回数以下に下げたら paused: limit にする（既に止まっている線・上限が回数より大きい線は変えない。g02 点検）", () => {
    const base = (count: number, paused: "user" | "limit" | null) =>
      state({
        nodes: [
          { key: A, x: 0, y: 0 },
          { key: B, x: 0, y: 0 },
        ],
        links: [{ id: "l1", kind: "supervise", from: A, to: B, limit: 10, count, paused }],
      });
    expect(
      ok(base(5, null), [{ op: "update_link", id: "l1", limit: 5 }]).graph.links[0],
    ).toMatchObject({ limit: 5, count: 5, paused: "limit" });
    expect(
      ok(base(5, null), [{ op: "update_link", id: "l1", limit: 3 }]).graph.links[0],
    ).toMatchObject({ paused: "limit" });
    expect(
      ok(base(5, null), [{ op: "update_link", id: "l1", limit: 6 }]).graph.links[0],
    ).toMatchObject({ paused: null });
    expect(
      ok(base(5, "user"), [{ op: "update_link", id: "l1", limit: 3 }]).graph.links[0],
    ).toMatchObject({ paused: "user" });
    expect(
      ok(base(0, null), [{ op: "update_link", id: "l1", limit: 1 }]).graph.links[0],
    ).toMatchObject({ paused: null });
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

// 20260927-agent-graph の 05 T1：sodactl graph が操作を組み立てて送る前に確かめる。
describe("addMissingNodeOps", () => {
  it("載っていない鍵だけを、今のノードの右隣に縦に並べて載せる（同じ鍵の 2 回目は飛ばす）", () => {
    const g = { nodes: [{ key: A as NodeKey, x: 40, y: 40 }] };
    expect(addMissingNodeOps(g, [A, B, R, B])).toEqual([
      { op: "add_node", key: B, x: 300, y: 40 },
      { op: "add_node", key: R, x: 300, y: 160 },
    ]);
  });
  it("ノードが無ければ左上から", () => {
    expect(addMissingNodeOps({ nodes: [] }, [A])).toEqual([
      { op: "add_node", key: A, x: 40, y: 40 },
    ]);
  });
});

describe("checkGraphOps", () => {
  it("当てられる操作は空、当てられない操作は問題を返す（採番の続きを知らなくても線の検証は同じ）", () => {
    const g: Graph = {
      ...emptyGraph(),
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: B, x: 240, y: 0 },
      ],
      links: [{ id: "l7", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null }],
    };
    expect(
      checkGraphOps(g, [
        { op: "add_link", kind: "trigger", from: A, to: B, trigger: defaultTriggerConfig() },
      ]),
    ).toEqual([]);
    expect(
      checkGraphOps(g, [{ op: "add_link", kind: "supervise", from: A, to: B }]).map((i) => i.code),
    ).toEqual(["duplicate_link"]);
    expect(checkGraphOps(g, [{ op: "remove_link", id: "l9" }]).map((i) => i.code)).toEqual([
      "unknown_link",
    ]);
  });
});

describe("applyGraphOps のノードの上限（手元と別のマシンは別枠。20261008-graph-first）", () => {
  const localNodes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: `local:p${i + 1}` as NodeKey, x: 0, y: 0 }));

  it("手元のノードが 512 のとき、手元の 513 個目は断り、別のマシンのノードは足せる", () => {
    const s = state({ nodes: localNodes(GRAPH_LOCAL_NODES_MAX) });
    const over = applyGraphOps(s, [{ op: "add_node", key: "local:pz", x: 0, y: 0 }]);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.issues.map((i) => i.code)).toEqual(["too_many_nodes"]);
    // 否定の対照: 別のマシンのノードは別枠なので、同じ状態でも足せる。
    expect(applyGraphOps(s, [{ op: "add_node", key: R, x: 0, y: 0 }]).ok).toBe(true);
  });

  it("別のマシンのノードは 64 まで（65 個目は断る）", () => {
    const remote = Array.from({ length: GRAPH_REMOTE_NODES_MAX }, (_, i) => ({
      key: `${"f".repeat(32)}:p${i + 1}` as NodeKey,
      x: 0,
      y: 0,
    }));
    const r = applyGraphOps(state({ nodes: remote }), [{ op: "add_node", key: `${"e".repeat(32)}:p1`, x: 0, y: 0 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(["too_many_remote_nodes"]);
  });
});
