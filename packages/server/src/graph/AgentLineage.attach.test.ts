import { describe, expect, it, vi } from "vitest";
import {
  GRAPH_LINKS_MAX,
  GRAPH_LOCAL_NODES_MAX,
  type AgentInfo,
  type Graph,
  type GraphLink,
  type GraphOp,
  type LinkKind,
  type NodeKey,
  type ServerEvent,
} from "@sodashitsu/protocol";
import {
  applyGraphOps,
  defaultApprovalConfig,
  defaultTriggerConfig,
  LINK_LIMIT_DEFAULT,
} from "@sodashitsu/client-core";
import { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import { GraphInvalidError, GraphRevConflictError } from "../persist/GraphStore.js";
import { AgentLineage } from "./AgentLineage.js";

// 20261003-graph-auto-nodes T4：グラフへ足す処理（偽の store。検証は実物の applyGraphOps）。
// 20261008-graph-first D9：ノードは維持（GraphMaintainer）が足す。ここは線だけを足し、ノードが無ければ足さない。
const agentInfo: AgentInfo = {
  instanceId: "i1",
  kind: "claude",
  label: "Claude",
  state: "idle",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
};
const P: NodeKey = "local:p1"; // 親
const C: NodeKey = "local:p2"; // 子

function link(id: number, kind: LinkKind, from: NodeKey, to: NodeKey): GraphLink {
  return {
    id: `l${id}`,
    kind,
    from,
    to,
    ...(kind === "approval" ? { approval: defaultApprovalConfig() } : {}),
    ...(kind === "trigger" ? { trigger: defaultTriggerConfig() } : {}),
    limit: 10,
    count: 0,
    paused: null,
  };
}

class FakeStore {
  graph: Graph;
  readonly updates: { baseRev: number; ops: GraphOp[] }[] = [];
  getCalls = 0;
  /** update の前に呼ばれる（他の編集が割り込んだことにする）。 */
  beforeUpdate: (() => void) | null = null;
  conflicts = 0;
  failWith: Error | null = null;
  private linkSeq = 0;

  constructor(seed: Partial<Graph> = {}) {
    this.graph = { rev: 5, paused: false, nodes: [], links: [], ...seed };
  }
  get(): Graph {
    this.getCalls++;
    return structuredClone(this.graph);
  }
  async update(baseRev: number, ops: readonly GraphOp[], _by: string): Promise<Graph> {
    this.updates.push({ baseRev, ops: [...ops] });
    this.beforeUpdate?.();
    if (this.failWith !== null) throw this.failWith;
    if (this.conflicts > 0) {
      this.conflicts--;
      this.graph = { ...this.graph, rev: this.graph.rev + 1 }; // 他の編集で rev が進んだ
      throw new GraphRevConflictError(baseRev, this.graph.rev);
    }
    if (baseRev !== this.graph.rev) throw new GraphRevConflictError(baseRev, this.graph.rev);
    const r = applyGraphOps({ graph: this.graph }, ops, () => `new-${++this.linkSeq}`);
    if (!r.ok) throw new GraphInvalidError(r.issues);
    this.graph = { ...r.graph, rev: this.graph.rev + 1 };
    return this.graph;
  }
}

function setup(
  seed: Partial<Graph> = {},
  opts: { live?: string[]; retries?: number; ensureNodes?: () => Promise<unknown> } = {},
) {
  const bus = new EventBus();
  const live = new Set(opts.live ?? ["p1", "p2"]);
  // 既定では、親子のノードは維持が足し済み。
  const store = new FakeStore({
    nodes: [
      { key: P, x: 0, y: 0 },
      { key: C, x: 300, y: 0 },
    ],
    ...seed,
  });
  const log: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const lineage = new AgentLineage({
    bus,
    store: store as never,
    paneExists: (id) => live.has(id),
    logger: log,
    ...(opts.retries === undefined ? {} : { retries: opts.retries }),
    ...(opts.ensureNodes === undefined ? {} : { ensureNodes: opts.ensureNodes }),
  });
  lineage.noteCreated("p2", "p1");
  const run = async () => {
    bus.publish({
      event: "pane.agent_status_changed",
      data: { paneId: "p2", agent: agentInfo },
    } as ServerEvent);
    await new Promise<void>((r) => setTimeout(r, 0));
  };
  const reasons = () =>
    vi
      .mocked(log.info)
      .mock.calls.concat(vi.mocked(log.warn).mock.calls)
      .filter(([m]) => m === "graph.auto: skipped")
      .map(([, f]) => (f as { reason: string }).reason);
  return { bus, store, log, live, lineage, run, reasons };
}

const addedLog = (log: Logger) =>
  vi.mocked(log.info).mock.calls.filter(([m]) => m === "graph.auto: added");

describe("AgentLineage.attach", () => {
  it("監督の線・承認の代理の線（notify・40・10）だけを 1 回の更新で足す。ノードは足さない・動かさない", async () => {
    const s = setup({
      nodes: [
        { key: P, x: 300, y: 40 },
        { key: C, x: 600, y: 40 },
      ],
    });
    await s.run();
    expect(s.store.updates).toHaveLength(1);
    expect(s.store.updates[0]!.baseRev).toBe(5);
    expect(s.store.updates[0]!.ops.every((o) => o.op === "add_link")).toBe(true);
    expect(s.store.graph.rev).toBe(6); // 1 つ進む（AC12）
    expect(s.store.graph.nodes).toEqual([
      { key: P, x: 300, y: 40 },
      { key: C, x: 600, y: 40 },
    ]);
    const [sup, appr] = s.store.graph.links;
    expect(sup).toMatchObject({ kind: "supervise", from: C, to: P, limit: LINK_LIMIT_DEFAULT });
    expect(appr).toMatchObject({
      kind: "approval",
      from: C,
      to: P,
      limit: 10,
      approval: { mode: "notify", lines: 40 },
    });
    expect(addedLog(s.log)).toEqual([
      ["graph.auto: added", { child: "p2", parent: "p1", links: 2 }],
    ]);
  });

  it("線を足す前に ensureNodes を呼ぶ（維持が先にノードを足す。順が逆でも線が落ちない）", async () => {
    const order: string[] = [];
    const s = setup(
      { nodes: [] },
      {
        ensureNodes: async () => {
          order.push("ensure");
          s.store.graph.nodes.push({ key: P, x: 0, y: 0 }, { key: C, x: 300, y: 0 });
        },
      },
    );
    await s.run();
    expect(order).toEqual(["ensure"]);
    expect(s.store.graph.links.map((l) => l.kind)).toEqual(["supervise", "approval"]);
    // 否定の対照: ensureNodes が無く、ノードが無ければ、線は足さない。
    const t = setup({ nodes: [] });
    await t.run();
    expect(t.store.graph.links).toEqual([]);
    expect(t.reasons()).toEqual(["nodes_pending"]);
  });

  it("同じ線がある（duplicate_link）とその線だけ外し、ほかは足す。既存の線は変えない", async () => {
    const existing = { ...link(1, "supervise", C, P), paused: "user" as const, limit: 3 };
    const s = setup({
      nodes: [
        { key: P, x: 0, y: 0 },
        { key: C, x: 300, y: 0 },
      ],
      links: [existing],
    });
    await s.run();
    expect(s.reasons()).toEqual(["duplicate_link"]);
    expect(s.store.graph.links[0]).toEqual(existing);
    expect(s.store.graph.links.map((l) => l.kind)).toEqual(["supervise", "approval"]);
  });

  it("同じ配下の別の監督役の線がある（supervisor_taken）とその種類の線は引かない", async () => {
    const s = setup({
      nodes: [P, C, "local:p9" as NodeKey].map((key, i) => ({ key, x: i * 300, y: 0 })),
      links: [link(1, "supervise", C, "local:p9")],
    });
    await s.run();
    expect(s.reasons()).toEqual(["supervisor_taken"]);
    expect(s.store.graph.links.map((l) => `${l.kind}:${l.to}`)).toEqual([
      "supervise:local:p9",
      "approval:local:p1",
    ]);
  });

  it("逆向きの線がある（reverse_link）と、その種類の線は引かない", async () => {
    const s = setup({
      nodes: [
        { key: P, x: 0, y: 0 },
        { key: C, x: 300, y: 0 },
      ],
      links: [link(1, "approval", P, C)],
    });
    await s.run();
    expect(s.reasons()).toEqual(["reverse_link"]);
    expect(s.store.graph.links.map((l) => `${l.kind}:${l.from}>${l.to}`)).toEqual([
      "approval:local:p1>local:p2",
      "supervise:local:p2>local:p1",
    ]);
  });

  it("足すものが何も無ければ update を呼ばない（rev は進まない）", async () => {
    const s = setup({
      nodes: [
        { key: P, x: 0, y: 0 },
        { key: C, x: 300, y: 0 },
      ],
      links: [link(1, "supervise", C, P), link(2, "approval", C, P)],
    });
    await s.run();
    expect(s.reasons()).toEqual(["duplicate_link", "duplicate_link"]);
    expect(s.store.updates).toEqual([]);
    expect(s.store.graph.rev).toBe(5);
    expect(addedLog(s.log)).toEqual([]);
  });

  it("親か子のノードが無く、上限でもないとき（維持がまだ足していない・引き継ぎの停止の間）は nodes_pending。この pane の機会を使い切らず、次の検出でやり直せる", async () => {
    const s = setup({ nodes: [{ key: P, x: 0, y: 0 }] });
    await s.run();
    expect(s.reasons()).toEqual(["nodes_pending"]);
    expect(s.store.updates).toEqual([]);
    // 維持がノードを足した後の、次の検出で線が足される
    s.store.graph.nodes.push({ key: C, x: 300, y: 0 });
    await s.run();
    expect(s.store.graph.links.map((l) => l.kind)).toEqual(["supervise", "approval"]);
  });

  it("手元のノードが上限の手前に達していて、親か子のノードが無いなら、線を足さず warn で出す（too_many_nodes）。機会は使い切る", async () => {
    const nodes = Array.from({ length: GRAPH_LOCAL_NODES_MAX - 7 }, (_, i) => ({
      key: `local:q${i}` as NodeKey,
      x: i * 10,
      y: 0,
    }));
    const s = setup({ nodes });
    await s.run();
    expect(s.reasons()).toEqual(["too_many_nodes"]);
    expect(s.store.updates).toEqual([]);
    // 利用者の手動操作を塞ぐので、見落とされないよう warn で出す
    expect(s.log.warn).toHaveBeenCalledWith(
      "graph.auto: skipped",
      expect.objectContaining({ reason: "too_many_nodes" }),
    );
    // 上限のときは、同じ pane の再検出でやり直さない
    s.store.graph.nodes.push({ key: P, x: 0, y: 0 }, { key: C, x: 300, y: 0 });
    await s.run();
    expect(s.store.graph.links).toEqual([]);
  });

  // 親子と無関係の 34 ノード間の trigger 線（向きは添字の昇順だけで輪にならない。上限の境界用の詰め物）。
  const fillerNodes = Array.from({ length: 34 }, (_, i) => ({
    key: `local:p${i + 10}` as NodeKey,
    x: i * 300,
    y: 300,
  }));
  const fillerLinks = (count: number, firstId: number): GraphLink[] =>
    fillerNodes
      .flatMap((a, i) => fillerNodes.slice(i + 1).map((b) => [a.key, b.key] as const))
      .slice(0, count)
      .map(([from, to], i) => link(firstId + i, "trigger", from, to));

  it("線 511 本＋1 本（片方が外れる）で 512 になるなら足す（境界）", async () => {
    const links = [link(1, "supervise", C, P), ...fillerLinks(GRAPH_LINKS_MAX - 2, 2)];
    expect(links).toHaveLength(GRAPH_LINKS_MAX - 1);
    const s = setup({
      nodes: [{ key: P, x: 0, y: 0 }, { key: C, x: 300, y: 0 }, ...fillerNodes],
      links,
    });
    await s.run();
    expect(s.reasons()).toEqual(["duplicate_link"]);
    expect(s.store.graph.links).toHaveLength(GRAPH_LINKS_MAX);
  });

  it("線がすでに 512 本なら 1 本足すだけでも何も足さない", async () => {
    const links = [link(1, "supervise", C, P), ...fillerLinks(GRAPH_LINKS_MAX - 1, 2)];
    expect(links).toHaveLength(GRAPH_LINKS_MAX);
    const s = setup({
      nodes: [{ key: P, x: 0, y: 0 }, { key: C, x: 300, y: 0 }, ...fillerNodes],
      links,
    });
    await s.run();
    expect(s.reasons()).toEqual(["duplicate_link", "too_many_links"]);
    expect(s.store.updates).toEqual([]);
  });

  it("追加後の線が 512 を超えるなら何も足さない（too_many_links）", async () => {
    const links = Array.from({ length: GRAPH_LINKS_MAX - 1 }, (_, i) =>
      link(i + 1, "trigger", `local:p${i + 10}`, `local:p${i + 500}`),
    );
    const s = setup({ links });
    await s.run();
    expect(s.reasons()).toEqual(["too_many_links"]);
    expect(s.store.updates).toEqual([]);
  });

  it("親の pane が閉じていたら何も足さずログする（parent_gone）", async () => {
    const s = setup({}, { live: ["p1", "p2"] });
    // 検出の時点では親がいたが、attach までに閉じた。
    s.live.delete("p1");
    await s.run();
    expect(s.reasons()).toEqual(["parent_gone"]);
    expect(s.store.updates).toEqual([]);
  });

  it("子が attach までに閉じていたら何もせず、ログも出さない", async () => {
    const s = setup();
    s.live.delete("p2");
    await s.run();
    expect(s.store.updates).toEqual([]);
    expect(s.log.info).not.toHaveBeenCalled();
    expect(s.log.warn).not.toHaveBeenCalled();
  });

  it("rev_conflict は get から取り直してやり直す（他の編集で同じ線が引かれていればそのぶん減る）", async () => {
    const s = setup();
    s.store.conflicts = 1;
    s.store.beforeUpdate = () => {
      if (s.store.conflicts === 1) s.store.graph.links.push(link(9, "supervise", C, P)); // 割り込みで同じ線が引かれた
    };
    await s.run();
    expect(s.store.updates).toHaveLength(2);
    expect(s.store.getCalls).toBe(2);
    expect(s.store.updates[1]!.baseRev).toBe(s.store.updates[0]!.baseRev + 1);
    expect(s.store.updates[1]!.ops.filter((o) => o.op === "add_link")).toHaveLength(1);
    expect(s.store.graph.links).toHaveLength(2);
  });

  it("競合が 3 回続いたら諦めてログする（conflict）。4 回目は試さない", async () => {
    const s = setup();
    s.store.conflicts = 10;
    await s.run();
    expect(s.store.updates).toHaveLength(3);
    expect(s.reasons()).toEqual(["conflict"]);
    expect(s.log.warn).toHaveBeenCalledWith(
      "graph.auto: skipped",
      expect.objectContaining({ reason: "conflict" }),
    );
    expect(addedLog(s.log)).toEqual([]);
  });

  it("競合を挟んでも同じ skip の理由は 1 回だけ出る", async () => {
    const s = setup({
      nodes: [P, C, "local:p9" as NodeKey].map((key) => ({ key, x: 0, y: 0 })),
      links: [link(1, "supervise", C, "local:p9")],
    });
    s.store.conflicts = 2;
    await s.run();
    expect(s.store.updates).toHaveLength(3);
    expect(s.reasons()).toEqual(["supervisor_taken"]);
  });

  it("競合の間に子が閉じたら、死んだ pane の線を足さない（黙る）", async () => {
    const s = setup();
    s.store.conflicts = 1;
    s.store.beforeUpdate = () => s.live.delete("p2");
    await s.run();
    expect(s.store.updates).toHaveLength(1);
    expect(s.store.graph.links).toEqual([]);
    expect(s.log.warn).not.toHaveBeenCalled();
  });

  it("競合の間に親が閉じたら載せずに parent_gone をログする", async () => {
    const s = setup();
    s.store.conflicts = 1;
    s.store.beforeUpdate = () => s.live.delete("p1");
    await s.run();
    expect(s.store.updates).toHaveLength(1);
    expect(s.store.graph.links).toEqual([]);
    expect(s.reasons()).toEqual(["parent_gone"]);
  });

  it("競合が 2 回なら 3 回目で通る", async () => {
    const s = setup();
    s.store.conflicts = 2;
    await s.run();
    expect(s.store.updates).toHaveLength(3);
    expect(s.store.graph.links).toHaveLength(2);
  });

  it("retries を指定するとその回数で諦める", async () => {
    const s = setup({}, { retries: 1 });
    s.store.conflicts = 10;
    await s.run();
    expect(s.store.updates).toHaveLength(1);
    expect(s.reasons()).toEqual(["conflict"]);
  });

  it("GraphInvalidError はやり直さずログする（invalid）", async () => {
    const s = setup();
    s.store.failWith = new GraphInvalidError([{ code: "duplicate_link", message: "x" }]);
    await s.run();
    expect(s.store.updates).toHaveLength(1);
    expect(s.reasons()).toEqual(["invalid"]);
  });

  it("保存の失敗など想定外の例外も握ってログに残す", async () => {
    const s = setup();
    s.store.failWith = new Error("disk full");
    await s.run();
    expect(s.log.warn).toHaveBeenCalledWith(
      "graph.auto: failed",
      expect.objectContaining({ child: "p2", parent: "p1" }),
    );
  });

  it("外した線は同じ子で加え直さない。別の子の検出では、その子の線が足される（AC7）", async () => {
    const s = setup(
      {
        nodes: [P, C, "local:p3" as NodeKey].map((key, i) => ({ key, x: i * 300, y: 0 })),
      },
      { live: ["p1", "p2", "p3"] },
    );
    await s.run();
    // 利用者が線を外した。
    s.store.graph = { ...s.store.graph, links: [] };
    await s.run(); // 同じ子の再検出
    expect(s.store.graph.links).toEqual([]);
    s.lineage.noteCreated("p3", "p1");
    s.store.updates.length = 0;
    s.bus.publish({
      event: "pane.agent_status_changed",
      data: { paneId: "p3", agent: agentInfo },
    } as ServerEvent);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(s.store.graph.links.map((l) => `${l.kind}:${l.from}>${l.to}`)).toEqual([
      "supervise:local:p3>local:p1",
      "approval:local:p3>local:p1",
    ]);
  });
});
