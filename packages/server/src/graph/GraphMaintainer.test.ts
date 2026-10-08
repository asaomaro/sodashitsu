import { describe, expect, it, vi } from "vitest";
import type { Graph, GraphOp, Pane, ServerEvent, Tab, Workspace } from "@sodashitsu/protocol";
import { applyGraphOps, emptyGraph, layoutOverlaps, nodePositions } from "@sodashitsu/client-core";
import { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import { GraphRevConflictError } from "../persist/GraphStore.js";
import { GraphMaintainer } from "./GraphMaintainer.js";
import { graphStructure, type GraphStructureSession } from "./graphStructure.js";

// 20261008-graph-first の T5：維持（構造のできごと → 50ms まとめて 1 回 → reconcileGraph → graph.update）。

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** pane を持つ workspace の世界（tab ごと 1 pane）。 */
class World implements GraphStructureSession {
  workspaces: Workspace[] = [];
  tabs: Tab[] = [];
  panes: Pane[] = [];
  transient = new Set<string>();
  addWorkspace(id: string, paneIds: string[]): void {
    const tabIds: string[] = [];
    paneIds.forEach((p, i) => {
      const tabId = `${id}t${i}`;
      tabIds.push(tabId);
      this.tabs.push({
        id: tabId,
        workspaceId: id,
        label: tabId,
        layout: { type: "pane", paneId: p },
        focusedPaneId: p,
        zoomedPaneId: null,
        sizeOwnerClientId: null,
      });
      this.panes.push({
        id: p,
        tabId,
        label: null,
        cwd: "/",
        shell: "sh",
        cols: 80,
        rows: 24,
        status: "running",
        failure: null,
        busy: false,
        title: "",
        rightClick: "herdr",
        agent: null,
        agentSession: null,
      });
    });
    this.workspaces.push({
      id,
      label: id,
      cwd: `/${id}`,
      tabIds,
      activeTabId: tabIds[0]!,
      groupId: null,
      git: null,
      autoLabel: false,
    });
  }
  /** pane を別の workspace の新しい tab へ移す。 */
  movePane(paneId: string, toWorkspaceId: string): void {
    const pane = this.panes.find((p) => p.id === paneId)!;
    const from = this.tabs.find((t) => t.id === pane.tabId)!;
    const fromWs = this.workspaces.find((w) => w.id === from.workspaceId)!;
    fromWs.tabIds = fromWs.tabIds.filter((t) => t !== from.id);
    this.tabs = this.tabs.filter((t) => t !== from);
    const toWs = this.workspaces.find((w) => w.id === toWorkspaceId)!;
    const tabId = `${toWorkspaceId}m${paneId}`;
    this.tabs.push({ ...from, id: tabId, workspaceId: toWorkspaceId });
    toWs.tabIds.push(tabId);
    pane.tabId = tabId;
  }
  snapshot() {
    return { workspaces: this.workspaces, tabs: this.tabs, panes: this.panes, groups: [] };
  }
  isTransientPane(id: string): boolean {
    return this.transient.has(id);
  }
}

function setup(world: World, opts: { conflicts?: number } = {}) {
  const bus = new EventBus();
  const state = { graph: emptyGraph() as Graph, conflicts: opts.conflicts ?? 0 };
  const updates: GraphOp[][] = [];
  const store = {
    get: () => structuredClone(state.graph),
    update: vi.fn(async (baseRev: number, ops: readonly GraphOp[]) => {
      if (state.conflicts > 0) {
        state.conflicts--;
        state.graph = { ...state.graph, rev: state.graph.rev + 1 };
        throw new GraphRevConflictError(baseRev, state.graph.rev);
      }
      if (baseRev !== state.graph.rev) throw new GraphRevConflictError(baseRev, state.graph.rev);
      const r = applyGraphOps({ graph: state.graph }, ops);
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      state.graph = { ...r.graph, rev: state.graph.rev + 1 };
      updates.push([...ops]);
      return structuredClone(state.graph);
    }),
  };
  const log = logger();
  const m = new GraphMaintainer({
    bus,
    store: store as never,
    session: world,
    logger: log,
    debounceMs: 5,
  });
  const emit = (event: ServerEvent["event"]) =>
    bus.publish({ event, data: {} } as unknown as ServerEvent);
  const wait = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms));
  return { bus, state, store, updates, m, emit, wait, log };
}

const k = (p: string) => `local:${p}` as const;

describe("GraphMaintainer", () => {
  it("起動の reconcileNow で、すべての pane にノードが付き、囲いは重ならない。2 回目は何もしない（rev が進まない）", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1", "p2"]);
    w.addWorkspace("w2", ["p3"]);
    const s = setup(w);
    expect(await s.m.reconcileNow({ force: true })).toBe(3);
    expect(s.state.graph.nodes.map((n) => n.key).sort()).toEqual([k("p1"), k("p2"), k("p3")]);
    expect(s.state.graph.rev).toBe(1);
    expect(
      layoutOverlaps(graphStructure(w, s.state.graph), nodePositions(s.state.graph.nodes)).size,
    ).toBe(0);
    // 毎回呼んでも同じ（強制でも何もしない）
    expect(await s.m.reconcileNow({ force: true })).toBe(0);
    expect(await s.m.reconcileNow()).toBe(0);
    expect(s.state.graph.rev).toBe(1);
    s.m.close();
  });

  it("構造のできごとが続けて来ても 50ms まとめて 1 回。足すものが無いできごとの繰り返しで rev は進まない", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w);
    await s.m.reconcileNow({ force: true });
    const rev = s.state.graph.rev;
    for (let i = 0; i < 20; i++) s.emit("pane.updated");
    await s.wait();
    expect(s.state.graph.rev).toBe(rev);
    // pane が増えたとき: できごとを何度出しても 1 回の更新
    w.addWorkspace("w2", ["p2"]);
    for (const e of [
      "pane.created",
      "layout.updated",
      "workspace.updated",
      "pane.updated",
    ] as const)
      s.emit(e);
    await s.wait();
    expect(s.state.graph.rev).toBe(rev + 1);
    expect(s.updates.at(-1)).toHaveLength(1);
    s.m.close();
  });

  it("一時的な pane（独自コマンドの pane・スクロールバックのエディタ）ではノードを足さず、rev を進めない", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w);
    await s.m.reconcileNow({ force: true });
    const rev = s.state.graph.rev;
    // 一時的な pane ができて閉じる、を繰り返す。
    for (let i = 0; i < 5; i++) {
      const id = `t${i}`;
      w.transient.add(id);
      w.addWorkspace(`tw${i}`, [id]);
      // 一つの workspace に一時的な pane だけがあるのは、現実には無いが、ノードが付かないことの確認。
      s.emit("pane.created");
      await s.wait();
      w.panes = w.panes.filter((p) => p.id !== id);
      w.workspaces = w.workspaces.filter((x) => x.id !== `tw${i}`);
      w.tabs = w.tabs.filter((t) => t.workspaceId !== `tw${i}`);
      s.emit("pane.closed");
      await s.wait();
    }
    expect(s.state.graph.nodes.map((n) => n.key)).toEqual([k("p1")]);
    expect(s.state.graph.rev).toBe(rev);
  });

  it("pane が別の workspace へ移ったら、そのノードを移った先の囲いへ置き直す（ほかのノードは動かさない）", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1", "p2"]);
    w.addWorkspace("w2", ["p3"]);
    const s = setup(w);
    await s.m.reconcileNow({ force: true });
    const before = new Map(s.state.graph.nodes.map((n) => [n.key, n]));
    w.movePane("p2", "w2");
    s.emit("pane.updated");
    s.emit("layout.updated");
    await s.wait();
    const after = new Map(s.state.graph.nodes.map((n) => [n.key, n]));
    // p2 だけが動き、p1・p3 は動かない
    expect(after.get(k("p1"))).toEqual(before.get(k("p1")));
    expect(after.get(k("p3"))).toEqual(before.get(k("p3")));
    expect(after.get(k("p2"))).not.toEqual(before.get(k("p2")));
    expect(
      layoutOverlaps(graphStructure(w, s.state.graph), nodePositions(s.state.graph.nodes)).size,
    ).toBe(0);
    // 線は触らない・2 回目は何もしない
    const rev = s.state.graph.rev;
    s.emit("pane.updated");
    await s.wait();
    expect(s.state.graph.rev).toBe(rev);
    s.m.close();
  });

  it("pause の間は確認を始めない。resume で止まっている間のできごとを拾う", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w);
    await s.m.reconcileNow({ force: true });
    s.m.pause();
    w.addWorkspace("w2", ["p2"]);
    s.emit("pane.created");
    await s.wait();
    expect(s.state.graph.nodes).toHaveLength(1);
    s.m.resume();
    await s.wait();
    expect(s.state.graph.nodes).toHaveLength(2);
    s.m.close();
  });

  it("close の後はできごとに反応しない", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w);
    s.m.close();
    s.emit("pane.created");
    await s.wait();
    expect(s.store.update).not.toHaveBeenCalled();
  });

  it("rev_conflict はやり直す", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w, { conflicts: 2 });
    expect(await s.m.reconcileNow({ force: true })).toBe(1);
    expect(s.store.update).toHaveBeenCalledTimes(3);
    s.m.close();
  });

  it("構造が前回の確認から変わっていなければ、確認を飛ばす（force 以外）", async () => {
    const w = new World();
    w.addWorkspace("w1", ["p1"]);
    const s = setup(w);
    await s.m.reconcileNow({ force: true });
    const spy = vi.spyOn(w, "snapshot");
    await s.m.reconcileNow();
    // 導き直しは 1 回（指紋の比較のため）。差が無ければ reconcile はせず、更新も無い。
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(s.store.update).toHaveBeenCalledTimes(1);
    s.m.close();
  });
});
