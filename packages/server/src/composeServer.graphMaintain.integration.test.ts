import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Graph, GraphOp } from "@sodashitsu/protocol";
import { layoutOverlaps, nodePositions } from "@sodashitsu/client-core";
import { GRAPH_LOCAL_NODES_MAX } from "@sodashitsu/protocol";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import { graphStructure } from "./graph/graphStructure.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261008-graph-first の T9：維持（GraphMaintainer）を、実物の `composeServer` で確かめる。pane を作る → ノードが増える・pane を別の workspace へ移す → 囲いが重ならない・
 * workspace を別のグループへ移す → ノードの座標が変わらない・一時的な pane ではノードが増えず rev が進まない・上限。
 */
vi.setConfig({ testTimeout: 30_000 });

describe("composeServer: 連携のグラフの維持（20261008-graph-first）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function boot(): Promise<ComposedServer> {
    const stateDir = await mkdtemp(join(tmpdir(), "soda-graph-maintain-"));
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    let closed = false;
    const close = server.close.bind(server);
    server.close = async () => {
      if (closed) return;
      closed = true;
      await close();
    };
    cleanups.push(() => server.close());
    return server;
  }

  const key = (paneId: string) => `local:${paneId}` as const;
  const graphOf = (s: ComposedServer): Graph => s.graph.get();
  /** 手元の（一時的でない）pane のすべてにノードがそろい、rev が落ち着くまで待つ。rev を返す。 */
  async function settled(s: ComposedServer, expectedPanes?: string[]): Promise<number> {
    await vi.waitFor(
      () => {
        const have = new Set(graphOf(s).nodes.map((n) => n.key));
        const want = expectedPanes ?? s.session.snapshot().panes.map((p) => p.id);
        expect(want.every((id) => have.has(key(id)))).toBe(true);
      },
      { timeout: 10_000, interval: 25 },
    );
    for (;;) {
      const rev = graphOf(s).rev;
      await new Promise((r) => setTimeout(r, 150));
      if (graphOf(s).rev === rev) return rev;
    }
  }
  const overlaps = (s: ComposedServer): number =>
    layoutOverlaps(graphStructure(s.session, graphOf(s)), nodePositions(graphOf(s).nodes)).size;
  const positions = (s: ComposedServer): Record<string, { x: number; y: number }> =>
    Object.fromEntries(graphOf(s).nodes.map((n) => [n.key, { x: n.x, y: n.y }]));

  it("pane・tab・workspace を作ると、すべての pane にノードが付き、囲いは重ならない。既存のノードは動かない", async () => {
    const s = await boot();
    const p1 = s.session.snapshot().panes[0]!.id;
    await settled(s);
    const before = positions(s);
    const p2 = (await s.session.splitPane(p1, "right", undefined)).pane.id;
    const tab = await s.session.createTab(s.session.snapshot().workspaces[0]!.id, undefined);
    const ws = await s.session.createWorkspace(tmpdir(), "second");
    const ws3 = await s.session.createWorkspace(tmpdir(), "third");
    const created = [p2, tab.pane.id, ws.pane.id, ws3.pane.id];
    await settled(s);
    const g = graphOf(s);
    for (const id of [p1, ...created]) expect(g.nodes.some((n) => n.key === key(id))).toBe(true);
    expect(g.nodes).toHaveLength(5);
    expect(overlaps(s)).toBe(0);
    // 既存のノード（p1）は動かない
    expect(positions(s)[key(p1)]).toEqual(before[key(p1)]);
    // 線は触らない・新しい構造のできごとの繰り返しで rev は進まない
    const rev = graphOf(s).rev;
    for (let i = 0; i < 5; i++) s.session.focusPane(created[i % created.length]!);
    await new Promise((r) => setTimeout(r, 200));
    expect(graphOf(s).rev).toBe(rev);
  });

  it("pane を別の workspace へ移すと、そのノードは移った先の囲いの空きへ置き直され、囲いは重ならない。ほかのノードは動かない", async () => {
    const s = await boot();
    // 移せるのは同じ作業場所（git の外では cwd が同じ）の workspace どうし。git の判定の遅れに左右されないよう、どちらも一時ディレクトリで開く。
    const a = await s.session.createWorkspace(tmpdir(), "a");
    const p1 = a.pane.id;
    const p2 = (await s.session.splitPane(p1, "right", undefined)).pane.id;
    const other = await s.session.createWorkspace(tmpdir(), "other");
    await settled(s);
    const before = positions(s);
    expect(s.session.moveToTab(p2, other.tab.id)).toBe(true);
    await vi.waitFor(() => {
      expect(positions(s)[key(p2)]).not.toEqual(before[key(p2)]);
    });
    await settled(s);
    expect(overlaps(s)).toBe(0);
    // 移った p2 だけが動き、p1・移る前から居た other の pane は動かない
    expect(positions(s)[key(p1)]).toEqual(before[key(p1)]);
    expect(positions(s)[key(other.pane.id)]).toEqual(before[key(other.pane.id)]);
    // 移った先の囲い（other の pane のすぐ近く）に居る
    const p2Pos = positions(s)[key(p2)]!;
    const otherPos = positions(s)[key(other.pane.id)]!;
    expect(Math.abs(p2Pos.x - otherPos.x)).toBeLessThanOrEqual(500);
    expect(Math.abs(p2Pos.y - otherPos.y)).toBeLessThanOrEqual(300);
  });

  it("workspace を別のグループへ移しても、ノードの座標は変わらない（rev も進まない）", async () => {
    const s = await boot();
    const ws0 = s.session.snapshot().workspaces[0]!;
    const second = await s.session.createWorkspace(tmpdir(), "second");
    await settled(s);
    const before = positions(s);
    const rev = graphOf(s).rev;
    const group = s.session.createGroup("work", second.workspace.id);
    s.session.addToGroup(ws0.id, group.id);
    await new Promise((r) => setTimeout(r, 300));
    await settled(s);
    expect(positions(s)).toEqual(before);
    expect(graphOf(s).rev).toBe(rev);
    expect(overlaps(s)).toBe(0);
  });

  it("一時的な pane（独自コマンドの pane）ではノードが増えず、rev が進まない。閉じても進まない", async () => {
    const s = await boot();
    const p1 = s.session.snapshot().panes[0]!.id;
    await settled(s);
    const rev = graphOf(s).rev;
    const { pane } = await s.session.openCommandPane(p1, tmpdir(), {
      shell: "/bin/sh",
      args: ["-c", "sleep 30"],
      env: {},
    });
    expect(s.session.isTransientPane(pane.id)).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    expect(graphOf(s).nodes.map((n) => n.key)).toEqual([key(p1)]);
    expect(graphOf(s).rev).toBe(rev);
    await s.session.closePane(pane.id);
    await new Promise((r) => setTimeout(r, 400));
    expect(graphOf(s).rev).toBe(rev);
    // 否定の対照: 一時的でない pane にはノードが付く（同じ操作の流れで rev が進む）
    const p3 = (await s.session.splitPane(p1, "down", undefined)).pane.id;
    await settled(s, [p3]);
    expect(graphOf(s).rev).toBeGreaterThan(rev);
  });

  it("手元のノードの上限: 2 つ目以降は予備を残して止まり、workspace の最初のノードは上限まで足す", async () => {
    const s = await boot();
    const p1 = s.session.snapshot().panes[0]!.id;
    await settled(s);
    // 手元のノードを 505 個まで埋める（居ない pane のノード。起動の後は pane が閉じても外れないよう、直接 store へ）。
    const fillers: GraphOp[] = Array.from({ length: GRAPH_LOCAL_NODES_MAX - 8 - 1 }, (_, i) => ({
      op: "add_node" as const,
      key: `local:filler-${i}` as never,
      x: (i % 40) * 240 + 100_000,
      y: Math.floor(i / 40) * 120,
    }));
    await s.graph.update(graphOf(s).rev, fillers, "test");
    expect(graphOf(s).nodes.length).toBe(GRAPH_LOCAL_NODES_MAX - 8);
    // 2 つ目以降（同じ workspace の分割）にはノードが付かない。新しい workspace の最初のノードは付く。
    const split = (await s.session.splitPane(p1, "right", undefined)).pane.id;
    const ws = await s.session.createWorkspace(tmpdir(), "late");
    await settled(s, [ws.pane.id]);
    await new Promise((r) => setTimeout(r, 300));
    const keys = new Set(graphOf(s).nodes.map((n) => n.key));
    expect(keys.has(key(split))).toBe(false);
    expect(keys.has(key(ws.pane.id))).toBe(true);
    expect(graphOf(s).nodes.length).toBeLessThanOrEqual(GRAPH_LOCAL_NODES_MAX);
  });
});
