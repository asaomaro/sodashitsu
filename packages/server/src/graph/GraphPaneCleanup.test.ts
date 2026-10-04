import { describe, expect, it, vi } from "vitest";
import type { Graph, GraphOp, ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import { GraphRevConflictError } from "../persist/GraphStore.js";
import { GraphPaneCleanup } from "./GraphPaneCleanup.js";

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const node = (key: string, stale = false) => ({ key, x: 0, y: 0, ...(stale ? { stale: true as const } : {}) });

function setup(keys: { key: string; stale?: boolean }[], live: string[], conflicts = 0) {
  const bus = new EventBus();
  const graph = { rev: 1, nodes: keys.map((k) => node(k.key, k.stale)), links: [] } as unknown as Graph;
  const applied: GraphOp[][] = [];
  let left = conflicts;
  const store = {
    get: () => structuredClone(graph),
    update: vi.fn(async (_rev: number, ops: readonly GraphOp[]) => {
      if (left-- > 0) throw new GraphRevConflictError(1, 2);
      applied.push([...ops]);
      for (const op of ops) if (op.op === "remove_node") graph.nodes = graph.nodes.filter((n) => n.key !== op.key);
      return graph;
    }),
  };
  const liveSet = new Set(live);
  const cleanup = new GraphPaneCleanup({ bus, store: store as never, paneExists: (id) => liveSet.has(id), logger: logger() });
  const close = (paneId: string) => bus.publish({ event: "pane.closed", data: { paneId } } as ServerEvent);
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return { cleanup, graph, applied, store, close, tick };
}

describe("GraphPaneCleanup", () => {
  it("pane が閉じたら、その手元のノードを外す。ほかのノードと別のマシンのノードは残す", async () => {
    const s = setup([{ key: "local:p1" }, { key: "local:p2" }, { key: "box:p2" }], ["p1", "p2"]);
    s.close("p2");
    await s.tick();
    expect(s.applied).toEqual([[{ op: "remove_node", key: "local:p2" }]]);
    expect(s.graph.nodes.map((n) => n.key)).toEqual(["local:p1", "box:p2"]);
  });

  it("グラフに無い pane が閉じても何も書かない", async () => {
    const s = setup([{ key: "local:p1" }], ["p1"]);
    s.close("p9");
    await s.tick();
    expect(s.store.update).not.toHaveBeenCalled();
  });

  it("無効（stale）なノードは、同じ id の pane が閉じても外さない", async () => {
    const s = setup([{ key: "local:p2", stale: true }], ["p2"]);
    s.close("p2");
    await s.tick();
    expect(s.store.update).not.toHaveBeenCalled();
  });

  it("rev が競合したらやり直す", async () => {
    const s = setup([{ key: "local:p2" }], [], 1);
    s.close("p2");
    await s.tick();
    await s.tick();
    expect(s.graph.nodes).toEqual([]);
  });

  it("pruneMissing: 今の pane に無い手元のノードだけを外す（stale・別のマシンは残す）", async () => {
    const s = setup(
      [{ key: "local:p1" }, { key: "local:p2" }, { key: "local:p3", stale: true }, { key: "box:p9" }],
      ["p1"],
    );
    expect(await s.cleanup.pruneMissing()).toBe(1);
    expect(s.graph.nodes.map((n) => n.key)).toEqual(["local:p1", "local:p3", "box:p9"]);
    expect(await s.cleanup.pruneMissing()).toBe(0);
  });

  it("close の後は閉じても外さない（サーバを止める途中の保存を守る）", async () => {
    const s = setup([{ key: "local:p2" }], ["p2"]);
    s.cleanup.close();
    s.close("p2");
    await s.tick();
    expect(s.store.update).not.toHaveBeenCalled();
  });
});
