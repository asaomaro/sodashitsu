import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "@sodashitsu/protocol";
import { layoutOverlaps, nodePositions } from "@sodashitsu/client-core";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";
import { graphStructure } from "./graph/graphStructure.js";
import type { ComposedServer } from "./composeServer.js";

/**
 * 20261008-graph-first の T6：保存の schema 1 → 2 の移行を、実物の `composeServer`（一時の状態ディレクトリ）で確かめる。
 * 以前の版が書いた（手で置いた位置の）graph.json を、新しい版が起動のときに、線を 1 本も変えずに、ノードを囲いの中へ置き直して読む。
 */
vi.setConfig({ testTimeout: 30_000 });

describe("composeServer: graph.json の移行（schema 1 → 2。20261008-graph-first）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(stateDir: string): Promise<ComposedServer> {
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

  const waitFor = (cond: () => boolean | Promise<boolean>, what: string) =>
    vi.waitFor(async () => expect(await cond(), what).toBe(true), {
      timeout: 10_000,
      interval: 25,
    });

  it("線は 1 本も変わらず、ノードは重ならない囲いの中へ。移行の前の控えが残り、2 回目の起動では何も変わらない", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "soda-graph-mig-"));
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );

    // 1 回目の起動: workspace 3 つ（A: 2 pane、B: 1 pane、C: 2 pane）を作って止める（session.json に pane の id が残る）。
    const first = await start(stateDir);
    const a1 = first.session.snapshot().panes[0]!.id;
    const a2 = (await first.session.splitPane(a1, "right", undefined)).pane.id;
    const b1 = (await first.session.createWorkspace(tmpdir(), "B")).pane.id;
    const cws = await first.session.createWorkspace(tmpdir(), "C");
    const c1 = cws.pane.id;
    const c2 = (await first.session.splitPane(c1, "right", undefined)).pane.id;
    await first.persist.flush();
    await first.close();

    // 以前の版の graph.json（schema 1）に書き換える。手で置いた位置: A のノードは遠くに散らばり、その中に B・C のノードがある。
    const L = (id: string) => `local:${id}` as const;
    const trigger = { on: "done", prompt: "見て", output: { lines: 80 }, whenBusy: "wait" };
    const links = [
      {
        id: "l-sup",
        kind: "supervise",
        from: L(a2),
        to: L(a1),
        limit: 10,
        count: 3,
        paused: "user",
      },
      {
        id: "l-trg",
        kind: "trigger",
        from: L(b1),
        to: L(c1),
        trigger,
        limit: 5,
        count: 1,
        paused: null,
      },
      {
        id: "l-app",
        kind: "approval",
        from: L(c2),
        to: L(c1),
        approval: { mode: "notify", lines: 40 },
        limit: 10,
        count: 0,
        paused: null,
      },
    ];
    const nodes = [
      { key: L(a1), x: 0, y: 0 },
      { key: L(a2), x: 3000, y: 2000 },
      { key: L(b1), x: 1000, y: 800 },
      { key: L(c1), x: 1000, y: 820 },
      { key: L(c2), x: 1240, y: 820 },
    ];
    const original = `${JSON.stringify(
      {
        schema: 1,
        rev: 9,
        graph: { paused: false, nodes, links },
        savedAt: "2026-10-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`;
    await writeFile(join(stateDir, "graph.json"), original);
    await rm(join(stateDir, "graph-backups"), { recursive: true, force: true });

    // 2 回目の起動: 移行する。
    const second = await start(stateDir);
    const g: Graph = second.graph.get();
    // 線は 1 本も変わらない（id・種類・設定・回数・一時停止）。
    expect(g.links).toEqual(links);
    // どの pane にもノードがあり、囲いは重ならない。
    expect(g.nodes.map((n) => n.key).sort()).toEqual(nodes.map((n) => n.key).sort());
    const structure = graphStructure(second.session, g);
    expect(layoutOverlaps(structure, nodePositions(g.nodes)).size).toBe(0);
    // A（外接が大きすぎた）は詰め直され、C（近い 2 ノード）は相対の位置を保って動く。
    const at = (id: string) => g.nodes.find((n) => n.key === L(id))!;
    expect(Math.abs(at(a2).x - at(a1).x) + Math.abs(at(a2).y - at(a1).y)).toBeLessThanOrEqual(240);
    expect([at(c2).x - at(c1).x, at(c2).y - at(c1).y]).toEqual([240, 0]);
    // 保存: schema 2。移行の前の元のファイルの控えが graph-backups/ に残る。
    const saved = JSON.parse(await readFile(join(stateDir, "graph.json"), "utf8")) as {
      schema: number;
      rev: number;
    };
    expect(saved.schema).toBe(2);
    expect(saved.rev).toBe(g.rev);
    const backups = await readdir(join(stateDir, "graph-backups"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(stateDir, "graph-backups", backups[0]!), "utf8")).toBe(original);

    // 2 回目の起動の後、さらに起動しても何も変わらない（rev も、ファイルも、控えも）。
    await waitFor(() => second.graph.get().rev === g.rev, "the graph settled");
    const fileAfter = await readFile(join(stateDir, "graph.json"), "utf8");
    await second.persist.flush();
    await second.close();
    const third = await start(stateDir);
    expect(third.graph.get()).toEqual(g);
    expect(await readFile(join(stateDir, "graph.json"), "utf8")).toBe(fileAfter);
    expect(await readdir(join(stateDir, "graph-backups"))).toHaveLength(1);
  });
});
