import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Graph, GraphOp, NodeKey } from "@sodashitsu/protocol";
import { defaultTriggerConfig } from "@sodashitsu/client-core";
import { makeTempDir } from "./atomicFile.js";
import {
  GRAPH_FILE_NAME,
  GraphInvalidError,
  GraphLinkNotFoundError,
  GraphRevConflictError,
  GraphStore,
  GraphStoreClosedError,
} from "./GraphStore.js";

// 20260927-agent-graph の T3：グラフの保存（graph.json・rev・壊れたファイル・stale）。
const A = "local:p1";
const B = "local:p2";
const R: NodeKey = `${"e".repeat(32)}:p1`;
const build: GraphOp[] = [
  { op: "add_node", key: A, x: 0, y: 0 },
  { op: "add_node", key: B, x: 240, y: 0 },
  { op: "add_node", key: R, x: 480, y: 0 },
  { op: "add_link", kind: "trigger", from: A, to: B, trigger: defaultTriggerConfig() },
];

describe("GraphStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  async function tempDir(): Promise<string> {
    const d = await makeTempDir("soda-graph-");
    dirs.push(d);
    return d;
  }
  async function loaded(dir?: string): Promise<GraphStore> {
    const store = new GraphStore(dir ?? (await tempDir()));
    await store.load();
    return store;
  }

  it("無ければ空・rev 0", async () => {
    const store = new GraphStore(await tempDir());
    expect(await store.load()).toBe("missing");
    expect(store.get()).toEqual({ rev: 0, paused: false, nodes: [], links: [] });
  });

  it("操作をまとめて 1 rev で当てる。作り直しても読める（再起動後の復元）。ファイルは 0600", async () => {
    const dir = await tempDir();
    const a = await loaded(dir);
    const g = await a.update(0, build, "c1");
    expect(g.rev).toBe(1);
    expect(g.nodes.map((n) => n.key)).toEqual([A, B, R]);
    expect(g.links).toEqual([
      expect.objectContaining({ id: "l1", from: A, to: B, count: 0, paused: null }),
    ]);
    const b = new GraphStore(dir);
    expect(await b.load()).toBe("ok");
    expect(b.get()).toEqual(g);
    if (process.platform !== "win32")
      expect((await stat(join(dir, GRAPH_FILE_NAME))).mode & 0o777).toBe(0o600);
  });

  it("消した線の番号は再起動をまたいでも使い回さない", async () => {
    const dir = await tempDir();
    const a = await loaded(dir);
    await a.update(0, build, "c1");
    await a.update(1, [{ op: "remove_link", id: "l1" }], "c1");
    const b = await loaded(dir);
    const g = await b.update(2, [{ op: "add_link", kind: "supervise", from: A, to: B }], "c1");
    expect(g.links.map((l) => l.id)).toEqual(["l2"]);
  });

  it("baseRev が今の rev と違えば GraphRevConflictError で、保存も rev も変えない", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    await store.update(0, build, "c1");
    const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    await expect(
      store.update(0, [{ op: "move_node", key: A, x: 20, y: 20 }], "c2"),
    ).rejects.toBeInstanceOf(GraphRevConflictError);
    expect(store.get().rev).toBe(1);
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(before);
  });

  it("同時の update は順に並び、同じ baseRev の 2 つ目は rev_conflict", async () => {
    const store = await loaded();
    const [first, second] = await Promise.allSettled([
      store.update(0, [{ op: "add_node", key: A, x: 0, y: 0 }], "c1"),
      store.update(0, [{ op: "add_node", key: B, x: 0, y: 0 }], "c2"),
    ]);
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: expect.any(GraphRevConflictError) });
    expect(store.get().nodes.map((n) => n.key)).toEqual([A]);
  });

  it("当てられない操作は GraphInvalidError（何も変えない）", async () => {
    const store = await loaded();
    await expect(
      store.update(0, [{ op: "add_link", kind: "supervise", from: A, to: B }], "c1"),
    ).rejects.toBeInstanceOf(GraphInvalidError);
    expect(store.get().rev).toBe(0);
  });

  it("一時停止・再開（全体・線）。線の再開は回数を 0 に戻し、全体の再開は線を変えない", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    await store.update(0, build, "c1");
    // 上限に達した線（実行は 02 で足す。ここではファイルを書き換えて作る）
    const raw = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as { graph: Graph };
    raw.graph.links[0]!.count = 10;
    raw.graph.links[0]!.paused = "limit";
    await writeFile(join(dir, GRAPH_FILE_NAME), JSON.stringify(raw));
    const s2 = await loaded(dir);
    expect((await s2.pause(undefined, "c1")).paused).toBe(true);
    const resumedAll = await s2.resume(undefined, "c1");
    expect(resumedAll.paused).toBe(false);
    expect(resumedAll.links[0]).toMatchObject({ count: 10, paused: "limit" });
    const resumed = await s2.resume("l1", "c1");
    expect(resumed.links[0]).toMatchObject({ count: 0, paused: null });
    expect((await s2.pause("l1", null)).links[0]).toMatchObject({ paused: "user" });
    await expect(s2.pause("l9", "c1")).rejects.toBeInstanceOf(GraphLinkNotFoundError);
    await expect(s2.resume("l9", "c1")).rejects.toBeInstanceOf(GraphLinkNotFoundError);
  });

  it("保存できた変更を onChange で知らせる（変えた接続の id、サーバ自身は null）。知らせる先が投げても保存は成功", async () => {
    const errors: unknown[] = [];
    const store = new GraphStore(await tempDir(), (e) => errors.push(e));
    await store.load();
    const seen: [number, string | null][] = [];
    store.onChange((g, by) => seen.push([g.rev, by]));
    store.onChange(() => {
      throw new Error("boom");
    });
    await store.update(0, [{ op: "add_node", key: A, x: 0, y: 0 }], "c1");
    await store.pause(undefined, null);
    await expect(
      store.update(0, [{ op: "move_node", key: A, x: 1, y: 1 }], "c1"),
    ).rejects.toThrow();
    expect(seen).toEqual([
      [1, "c1"],
      [2, null],
    ]);
    expect(errors).toHaveLength(2);
  });

  it("get は写しを返す（書き換えても中身は変わらない）", async () => {
    const store = await loaded();
    await store.update(0, build, "c1");
    const g = store.get();
    g.nodes[0]!.x = 999;
    g.links[0]!.trigger!.prompt = "changed";
    expect(store.get().nodes[0]!.x).toBe(0);
    expect(store.get().links[0]!.trigger!.prompt).toBe(defaultTriggerConfig().prompt);
  });

  it.each([
    ["JSON でない", "{not json"],
    [
      "schema が違う",
      JSON.stringify({
        schema: 2,
        rev: 1,
        nextLinkId: 1,
        graph: { paused: false, nodes: [], links: [] },
      }),
    ],
    [
      "形が違う",
      JSON.stringify({
        schema: 1,
        rev: 1,
        nextLinkId: 1,
        graph: { paused: "no", nodes: [], links: [] },
      }),
    ],
    [
      "意味の検証に落ちる（端の無い線）",
      JSON.stringify({
        schema: 1,
        rev: 1,
        nextLinkId: 2,
        graph: {
          paused: false,
          nodes: [],
          links: [
            { id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null },
          ],
        },
      }),
    ],
  ])("壊れたファイル（%s）は退避して空から始める", async (_name, content) => {
    const dir = await tempDir();
    await writeFile(join(dir, GRAPH_FILE_NAME), content);
    const store = new GraphStore(dir);
    expect(typeof (await store.load())).toBe("object");
    expect(store.get()).toEqual({ rev: 0, paused: false, nodes: [], links: [] });
    expect((await readdir(join(dir, "graph-backups"))).length).toBe(1);
  });

  it("nextLinkId が線の番号以下なら最大の番号の次から振る", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, GRAPH_FILE_NAME),
      JSON.stringify({
        schema: 1,
        rev: 4,
        nextLinkId: 1,
        graph: {
          paused: false,
          nodes: [
            { key: A, x: 0, y: 0 },
            { key: B, x: 0, y: 0 },
          ],
          links: [
            { id: "l5", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null },
          ],
        },
      }),
    );
    const store = await loaded(dir);
    const g = await store.update(4, [{ op: "add_link", kind: "supervise", from: B, to: A }], "c1");
    expect(g.links.map((l) => l.id)).toEqual(["l5", "l6"]);
  });

  it("markLocalStale は手元のノードだけを無効にして保存する（別のマシンのノードはそのまま）。無ければ保存しない", async () => {
    const dir = await tempDir();
    const empty = await loaded(dir);
    expect(await empty.markLocalStale()).toBe(0);
    expect(empty.get().rev).toBe(0);
    await empty.update(0, build, "c1");
    const store = await loaded(dir);
    expect(await store.markLocalStale()).toBe(2);
    const reread = await loaded(dir);
    expect(reread.get().nodes).toEqual([
      { key: A, x: 0, y: 0, stale: true },
      { key: B, x: 240, y: 0, stale: true },
      { key: R, x: 480, y: 0 },
    ]);
    // 既に無効なら数えない・保存しない
    expect(await reread.markLocalStale()).toBe(0);
    expect(reread.get().rev).toBe(2);
    // 選び直すと無効の印が外れる
    const g = await reread.update(2, [{ op: "rekey_node", key: A, newKey: "local:p5" }], "c1");
    expect(g.nodes[0]).toEqual({ key: "local:p5", x: 0, y: 0 });
  });

  it("変化の無い pause・resume（既にその状態）は rev を進めず、知らせも保存もしない（g01 点検）", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    await store.update(0, build, "c1");
    await store.pause(undefined, "c1");
    await store.pause("l1", "c1");
    const seen: number[] = [];
    store.onChange((g) => seen.push(g.rev));
    const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    expect((await store.pause(undefined, "c2")).rev).toBe(3);
    expect((await store.pause("l1", "c2")).rev).toBe(3);
    await store.resume("l1", "c2");
    expect(store.get().rev).toBe(4);
    expect((await store.resume("l1", "c2")).rev).toBe(4); // 既に動いていて回数も 0
    await store.resume(undefined, "c2");
    expect((await store.resume(undefined, "c2")).rev).toBe(5);
    expect(seen).toEqual([4, 5]);
    expect(before).not.toBe(await readFile(join(dir, GRAPH_FILE_NAME), "utf8"));
    // 知らない線は変化が無くても not found
    await expect(store.pause("l9", "c1")).rejects.toBeInstanceOf(GraphLinkNotFoundError);
  });

  it("close は待ち行列の書き込みを待ち、その後の書き込みは断ってファイルを変えない（ロックを放した後に書かない。g01 点検）", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    const pending = store.update(0, build, "c1");
    await store.close();
    await expect(pending).resolves.toMatchObject({ rev: 1 });
    const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    await expect(
      store.update(1, [{ op: "move_node", key: A, x: 20, y: 20 }], "c1"),
    ).rejects.toBeInstanceOf(GraphStoreClosedError);
    await expect(store.pause(undefined, "c1")).rejects.toBeInstanceOf(GraphStoreClosedError);
    await expect(store.markLocalStale()).rejects.toBeInstanceOf(GraphStoreClosedError);
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(before);
    expect(store.get().rev).toBe(1);
  });

  it("flush は待ち行列の書き込みを待つ", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    void store.update(0, build, "c1");
    await store.flush();
    const raw = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as { rev: number };
    expect(raw.rev).toBe(1);
  });
});
