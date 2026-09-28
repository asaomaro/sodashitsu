import type { Graph, GraphOp } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentOf,
  fakeGraphPort,
  graphOf,
  paneOf,
  rpcError,
  triggerLink,
} from "../components/graph/graphTestKit.js";
import { GRAPH_FIRE_GLOW_MS, useGraphStore } from "./graph.js";
import { useMachinesStore } from "./machines.js";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";

// 20260927-agent-graph の 03-web-graph T1：グラフの store。
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
});

const changed = (graph: Graph) => ({
  event: "graph.changed" as const,
  data: { graph, byClientId: null },
});

describe("store/graph", () => {
  it("load は graph.get の結果を当てる。失敗は理由を持つ", async () => {
    const g = useGraphStore();
    const { port, handlers } = fakeGraphPort({ "graph.get": () => graphOf({ rev: 3 }) });
    g.bind(port);
    await g.load();
    expect(g.graph?.rev).toBe(3);
    expect(g.loadError).toBeNull();
    handlers["graph.get"] = () => {
      throw rpcError("internal");
    };
    await g.load();
    expect(g.loadError).not.toBeNull();
    expect(g.graph?.rev).toBe(3); // 前の値は残す
  });

  it("graph.changed は同じ rev でも当て（実行の回数だけの保存。D5-14）、古い rev は捨てる", () => {
    const g = useGraphStore();
    g.applyGraph(graphOf({ rev: 5, links: [triggerLink("l1", "local:p1", "local:p2")] }), "fresh");
    g.applyEvent(
      changed(
        graphOf({ rev: 5, links: [triggerLink("l1", "local:p1", "local:p2", { count: 1 })] }),
      ),
    );
    expect(g.links[0]!.count).toBe(1);
    g.applyEvent(changed(graphOf({ rev: 4, links: [] })));
    expect(g.graph?.rev).toBe(5);
    expect(g.links).toHaveLength(1);
    g.applyEvent(changed(graphOf({ rev: 6, links: [] })));
    expect(g.links).toHaveLength(0);
  });

  it("方式の戻り値は rev が新しいときだけ当てる（先に届いた同じ rev の回数を巻き戻さない）", () => {
    const g = useGraphStore();
    g.applyGraph(
      graphOf({ rev: 5, links: [triggerLink("l1", "local:p1", "local:p2", { count: 2 })] }),
      "fresh",
    );
    g.applyGraph(
      graphOf({ rev: 5, links: [triggerLink("l1", "local:p1", "local:p2", { count: 1 })] }),
      "result",
    );
    expect(g.links[0]!.count).toBe(2);
    g.applyGraph(
      graphOf({ rev: 6, links: [triggerLink("l1", "local:p1", "local:p2", { count: 1 })] }),
      "result",
    );
    expect(g.links[0]!.count).toBe(1);
  });

  it("線が上限で止まったら（止まっていなかった線だけ）トーストで知らせる（AC11）", () => {
    const g = useGraphStore();
    const view = useViewStore();
    g.applyGraph(
      graphOf({ rev: 1, links: [triggerLink("l1", "local:p1", "local:p2", { count: 9 })] }),
      "fresh",
    );
    g.applyEvent(
      changed(
        graphOf({
          rev: 1,
          links: [triggerLink("l1", "local:p1", "local:p2", { count: 10, paused: "limit" })],
        }),
      ),
    );
    expect(view.toasts).toHaveLength(1);
    expect(view.toasts[0]!.message).toContain("上限の 10 回");
    expect(view.toasts[0]!.message).toContain("pane p1 → pane p2");
    // 既に上限で止まっている線の続く知らせでは出さない
    g.applyEvent(
      changed(
        graphOf({
          rev: 2,
          links: [triggerLink("l1", "local:p1", "local:p2", { count: 10, paused: "limit" })],
        }),
      ),
    );
    expect(view.toasts).toHaveLength(1);
  });

  it("最初の取得で既に上限の線は知らせない（前の値が無い）", () => {
    const g = useGraphStore();
    g.applyGraph(
      graphOf({ links: [triggerLink("l1", "local:p1", "local:p2", { paused: "limit" })] }),
      "fresh",
    );
    expect(useViewStore().toasts).toHaveLength(0);
  });

  it("graph.fired は線を 1.5 秒光らせ、読んだ履歴の先頭へ足す", async () => {
    vi.useFakeTimers();
    const g = useGraphStore();
    const { port } = fakeGraphPort({
      "graph.history": () => ({
        runs: [{ linkId: "l1", at: 1, result: "skipped", reason: "busy" }],
      }),
    });
    g.bind(port);
    g.applyFired({ linkId: "l1", at: 2, result: "sent" });
    expect(g.runs).toHaveLength(0); // 読む前は溜めない
    await g.loadHistory();
    g.applyEvent({
      event: "graph.fired",
      data: { run: { linkId: "l1", at: 3, result: "sent", text: "x" } },
    });
    expect(g.runs.map((r) => r.at)).toEqual([3, 1]);
    expect(g.firing.get("l1")).toBe("sent");
    vi.advanceTimersByTime(GRAPH_FIRE_GLOW_MS - 1);
    expect(g.firing.has("l1")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(g.firing.has("l1")).toBe(false);
  });

  it("update は rev_conflict なら取り直した最新で作り直して送り直す", async () => {
    const g = useGraphStore();
    let serverRev = 2;
    const { port, calls } = fakeGraphPort({
      "graph.get": () => graphOf({ rev: serverRev }),
      "graph.update": (p) => {
        const { baseRev } = p as { baseRev: number };
        if (baseRev !== serverRev) throw rpcError("rev_conflict");
        serverRev++;
        return graphOf({ rev: serverRev });
      },
    });
    g.bind(port);
    g.applyGraph(graphOf({ rev: 1 }), "fresh");
    const build = vi.fn((gr: Graph): GraphOp[] => [
      { op: "move_node", key: "local:p1", x: gr.rev * 20, y: 0 },
    ]);
    const r = await g.update(build);
    expect(r).toMatchObject({ ok: true, conflicted: true });
    expect(build).toHaveBeenCalledTimes(2);
    const updates = calls.filter((c) => c.method === "graph.update").map((c) => c.params);
    expect(updates).toEqual([
      { baseRev: 1, ops: [{ op: "move_node", key: "local:p1", x: 20, y: 0 }] },
      { baseRev: 2, ops: [{ op: "move_node", key: "local:p1", x: 40, y: 0 }] },
    ]);
    expect(g.graph?.rev).toBe(3);
  });

  it("作り直した操作が無ければ（対象が他で消えた）送らずに gone", async () => {
    const g = useGraphStore();
    const { port, calls } = fakeGraphPort({ "graph.update": () => graphOf() });
    g.bind(port);
    g.applyGraph(graphOf(), "fresh");
    const r = await g.update(() => []);
    expect(r).toMatchObject({ ok: false, reason: "gone" });
    expect(calls).toHaveLength(0);
  });

  it("rev_conflict が続けば 3 回で諦める。ほかの失敗は日本語の理由", async () => {
    const g = useGraphStore();
    const { port, calls, handlers } = fakeGraphPort({
      "graph.get": () => graphOf(),
      "graph.update": () => {
        throw rpcError("rev_conflict");
      },
    });
    g.bind(port);
    g.applyGraph(graphOf(), "fresh");
    const r = await g.update(() => [{ op: "remove_node", key: "local:p1" }]);
    expect(r.ok).toBe(false);
    expect(calls.filter((c) => c.method === "graph.update")).toHaveLength(3);
    handlers["graph.update"] = () => {
      throw rpcError("invalid_params");
    };
    const r2 = await g.update(() => [{ op: "remove_node", key: "local:p1" }]);
    expect(r2).toMatchObject({ ok: false, reason: "error" });
    if (!r2.ok) expect(r2.message).toMatch(/最新のグラフ/);
  });

  it("ドラッグ中の位置はサーバの graph.changed で上書きされない。離したら楽観的に置き、応答で外す", async () => {
    const g = useGraphStore();
    let resolve!: (v: Graph) => void;
    const { port } = fakeGraphPort({
      "graph.update": () => new Promise<Graph>((r) => (resolve = r)),
    });
    g.bind(port);
    g.applyGraph(graphOf({ rev: 1 }), "fresh");
    g.setDragPosition("local:p1", { x: 100, y: 40 });
    // 他の画面の変更（同じノードを別の位置へ）
    g.applyEvent(
      changed(
        graphOf({
          rev: 2,
          nodes: [
            { key: "local:p1", x: 500, y: 500 },
            { key: "local:p2", x: 300, y: 0 },
          ],
        }),
      ),
    );
    expect(g.nodes.find((n) => n.key === "local:p1")).toMatchObject({ x: 100, y: 40 });
    const done = g.moveNodes([{ key: "local:p1", x: 120, y: 40 }]);
    expect(g.dragPositions.size).toBe(0);
    expect(g.nodes.find((n) => n.key === "local:p1")).toMatchObject({ x: 120, y: 40 });
    await Promise.resolve();
    resolve(
      graphOf({
        rev: 3,
        nodes: [
          { key: "local:p1", x: 120, y: 40 },
          { key: "local:p2", x: 300, y: 0 },
        ],
      }),
    );
    await done;
    expect(g.pendingPositions.size).toBe(0);
    expect(g.nodes.find((n) => n.key === "local:p1")).toMatchObject({ x: 120, y: 40 });
  });

  it("配置の保存に失敗したらサーバの位置へ戻してトースト", async () => {
    const g = useGraphStore();
    const { port } = fakeGraphPort({
      "graph.update": () => {
        throw rpcError("internal");
      },
    });
    g.bind(port);
    g.applyGraph(graphOf(), "fresh");
    await g.moveNodes([{ key: "local:p1", x: 400, y: 400 }]);
    expect(g.nodes.find((n) => n.key === "local:p1")).toMatchObject({ x: 0, y: 0 });
    expect(useViewStore().toasts[0]!.message).toContain("配置を保存できませんでした");
  });

  it("setPaused は全体・線の一時停止・再開を送って結果を当てる。失敗はトースト", async () => {
    const g = useGraphStore();
    const { port, calls, handlers } = fakeGraphPort({
      "graph.pause": () => graphOf({ rev: 2, paused: true }),
    });
    g.bind(port);
    g.applyGraph(graphOf(), "fresh");
    expect(await g.setPaused(true)).toBe(true);
    expect(calls[0]).toEqual({ method: "graph.pause", params: {} });
    expect(g.graph?.paused).toBe(true);
    handlers["graph.resume"] = () => {
      throw rpcError("not_found");
    };
    expect(await g.setPaused(false, "l9")).toBe(false);
    expect(calls[1]).toEqual({ method: "graph.resume", params: { linkId: "l9" } });
    expect(useViewStore().toasts[0]!.message).toContain("再開できませんでした");
  });

  it("nodeInfo: 画面の接続が向いているマシンの pane は呼び名・エージェント・場所まで。無い pane・stale は無効", () => {
    const g = useGraphStore();
    const session = useSessionStore();
    session.tabs.set("t1", { id: "t1", workspaceId: "w1" } as never);
    session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("working") }));
    g.applyGraph(
      graphOf({
        nodes: [
          { key: "local:p1", x: 0, y: 0 },
          { key: "local:p2", x: 0, y: 0, stale: true },
        ],
      }),
      "fresh",
    );
    expect(g.nodeInfo("local:p1")).toMatchObject({
      name: "impl",
      machineLabel: "ローカル",
      exists: true,
      state: "working",
      location: { workspaceId: "w1", tabId: "t1" },
    });
    expect(g.nodeInfo("local:p2")).toMatchObject({ name: "pane p2", exists: false, stale: true });
    expect(g.nodeInfo("local:p3")).toMatchObject({ exists: false });
  });

  it("nodeInfo: ほかのマシン（別のマシンを見ている間の手元を含む）は要約から `pane <id>`。要約がまだ無ければ分からない（null）", () => {
    const g = useGraphStore();
    const machines = useMachinesStore();
    const M = "a".repeat(32);
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    expect(g.nodeInfo(`${M}:p7`)).toMatchObject({
      name: "pane p7",
      machineLabel: "box",
      exists: null,
      local: false,
    });
    machines.applySummarySnapshot(M, {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [],
      tabs: [{ id: "t1", workspaceId: "w1" } as never],
      panes: [paneOf("p7", "t1", { label: "reviewer", agent: agentOf("idle") })],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    });
    expect(g.nodeInfo(`${M}:p7`)).toMatchObject({
      name: "pane p7",
      exists: true,
      state: "idle",
      location: { workspaceId: "w1", tabId: "t1" },
    });
    expect(g.nodeInfo(`${M}:p8`)).toMatchObject({ exists: false });
  });
});

describe("store/graph（g03 点検）", () => {
  it("接続が無い（not_connected）は「繋がっていません」の文言にする（サーバのエラーの文言にしない）", async () => {
    const g = useGraphStore();
    const { port } = fakeGraphPort({
      "graph.get": () => {
        throw rpcError("not_connected");
      },
    });
    g.bind(port);
    await g.load();
    expect(g.loadError).toBe("サーバに繋がっていません（繋ぎ直しを待っています）。");
  });
});
