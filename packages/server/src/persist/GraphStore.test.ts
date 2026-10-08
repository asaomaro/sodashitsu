import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UUID_RE, type Graph, type GraphOp, type NodeKey } from "@sodashitsu/protocol";
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

// 20260927-agent-graph の T3：グラフの保存（graph.json・rev・壊れたファイル）。
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
    // 線の id は決まった順（l1・l2…）を差し込む（既定の UUID は別の試験で確かめる）。
    let n = 0;
    const store = new GraphStore(dir ?? (await tempDir()), undefined, () => `l${++n}`);
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

  it("既定の線の id は UUID で、消した線の id も再起動をまたいで使い回さない", async () => {
    const dir = await tempDir();
    const a = new GraphStore(dir);
    await a.load();
    const g1 = await a.update(0, build, "c1");
    const first = g1.links[0]!.id;
    expect(first).toMatch(UUID_RE);
    await a.update(1, [{ op: "remove_link", id: first }], "c1");
    const b = new GraphStore(dir);
    await b.load();
    const g = await b.update(2, [{ op: "add_link", kind: "supervise", from: A, to: B }], "c1");
    expect(g.links).toHaveLength(1);
    expect(g.links[0]!.id).toMatch(UUID_RE);
    expect(g.links[0]!.id).not.toBe(first);
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
      "schema が違う（知らない版。2 は新しい版の形）",
      JSON.stringify({
        schema: 3,
        rev: 1,
        graph: { paused: false, nodes: [], links: [] },
      }),
    ],
    [
      "形が違う",
      JSON.stringify({
        schema: 1,
        rev: 1,
        graph: { paused: "no", nodes: [], links: [] },
      }),
    ],
    [
      "意味の検証に落ちる（端の無い線）",
      JSON.stringify({
        schema: 1,
        rev: 1,
        graph: {
          paused: false,
          nodes: [],
          links: [
            { id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null },
          ],
        },
      }),
    ],
    [
      "線の id が重なる（01 のレビュー ラウンド 1）",
      JSON.stringify({
        schema: 1,
        rev: 1,
        graph: {
          paused: false,
          nodes: [
            { key: A, x: 0, y: 0 },
            { key: B, x: 0, y: 0 },
          ],
          links: [
            { id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 0, paused: null },
            { id: "l1", kind: "supervise", from: B, to: A, limit: 10, count: 0, paused: null },
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
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(before);
    expect(store.get().rev).toBe(1);
  });

  it("recordRun は回数を 1 増やし、上限に達したら paused: limit にする（サーバの変更なので byClientId は null）。線が無ければ何もしない", async () => {
    const store = await loaded();
    await store.update(0, [...build, { op: "update_link", id: "l1", limit: 2 }], "c1");
    const seen: (string | null)[] = [];
    store.onChange((_g, by) => seen.push(by));
    expect(await store.recordRun("l1")).toEqual({ limitReached: false });
    expect(store.get().links[0]).toMatchObject({ count: 1, paused: null });
    expect(await store.recordRun("l1")).toEqual({ limitReached: true });
    expect(store.get().links[0]).toMatchObject({ count: 2, paused: "limit" });
    expect(seen).toEqual([null, null]);
    const rev = store.get().rev;
    expect(await store.recordRun("l9")).toBeNull();
    expect(store.get().rev).toBe(rev);
    // 利用者が止めていた線でも数える（送っている間に止めた）。上限に届かなければ paused は変えない
    await store.update(rev, [{ op: "update_link", id: "l1", limit: 10 }], "c1");
    await store.resume("l1", "c1"); // 回数は 0 に戻る
    await store.pause("l1", "c1");
    await store.recordRun("l1");
    expect(store.get().links[0]).toMatchObject({ count: 1, paused: "user" });
  });

  it("recordRun は rev を上げない（回数は rev の対象外。他の画面の graph.update を rev_conflict にしない）が、保存して知らせる（g02 点検）", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    await store.update(0, build, "c1");
    const seen: [number, number][] = [];
    store.onChange((g) => seen.push([g.rev, g.links[0]!.count]));
    await store.recordRun("l1");
    expect(store.get().rev).toBe(1);
    expect(seen).toEqual([[1, 1]]);
    // 回数を数えた後でも、同じ rev を見ていた画面の変更は通る
    await expect(
      store.update(1, [{ op: "move_node", key: A, x: 20, y: 0 }], "c2"),
    ).resolves.toMatchObject({ rev: 2 });
    expect((await loaded(dir)).get().links[0]!.count).toBe(1);
  });

  it("recordRun は利用者の一時停止を上限の一時停止で上書きしない（送っている途中に止められた。g02 点検）", async () => {
    const store = await loaded();
    await store.update(0, [...build, { op: "update_link", id: "l1", limit: 1 }], "c1");
    await store.pause("l1", "c1");
    expect(await store.recordRun("l1")).toEqual({ limitReached: true });
    expect(store.get().links[0]).toMatchObject({ count: 1, paused: "user" });
  });

  it("flush は待ち行列の書き込みを待つ", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    void store.update(0, build, "c1");
    await store.flush();
    const raw = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as { rev: number };
    expect(raw.rev).toBe(1);
  });

  // --- 保存の schema 1 → 2（20261008-graph-first の T6） ---------------------------------

  const v1File = (schema: number): string =>
    `${JSON.stringify(
      {
        schema,
        rev: 7,
        graph: {
          paused: false,
          nodes: [
            { key: A, x: 0, y: 0 },
            { key: B, x: 240, y: 0 },
          ],
          links: [
            {
              id: "l1",
              kind: "supervise",
              from: B,
              to: A,
              limit: 10,
              count: 4,
              paused: null,
            },
          ],
        },
        savedAt: "2026-10-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`;

  it("schema 1 のファイルは読める。移行の前に必ず控えを graph-backups/ に書き、元のファイルは変えない", async () => {
    const dir = await tempDir();
    const original = v1File(1);
    await writeFile(join(dir, GRAPH_FILE_NAME), original);
    const store = new GraphStore(dir);
    expect(await store.load()).toBe("ok");
    expect(store.migrationPending).toBe(true);
    expect(store.get().rev).toBe(7);
    // 控え: 元のファイルと同じ中身が 1 つ。元のファイルは読み込みだけでは変わらない（途中で落ちても元のファイルが残る）。
    const backups = await readdir(join(dir, "graph-backups"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(dir, "graph-backups", backups[0]!), "utf8")).toBe(original);
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(original);
  });

  it("移行の間の保存は schema 1 のまま（落ちても古い版で読める形が残る）。completeMigration で schema 2 になり、rev は進まない", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, GRAPH_FILE_NAME), v1File(1));
    const store = new GraphStore(dir);
    await store.load();
    await store.update(7, [{ op: "move_node", key: B, x: 480, y: 0 }], "graph");
    const mid = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as {
      schema: number;
      rev: number;
    };
    expect(mid).toMatchObject({ schema: 1, rev: 8 });
    expect(store.migrationPending).toBe(true);
    await store.completeMigration();
    expect(store.migrationPending).toBe(false);
    const done = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as {
      schema: number;
      rev: number;
      graph: { links: { count: number }[] };
    };
    expect(done).toMatchObject({ schema: 2, rev: 8 });
    expect(done.graph.links[0]!.count).toBe(4); // 線は触らない
    // 以後の保存は schema 2
    await store.update(8, [{ op: "move_node", key: B, x: 240, y: 0 }], "c1");
    expect(JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8"))).toMatchObject({
      schema: 2,
      rev: 9,
    });
  });

  it("schema 2 のファイルは移行しない（控えも書かない）。2 回目の起動で何も変わらない", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, GRAPH_FILE_NAME), v1File(1));
    const first = new GraphStore(dir);
    await first.load();
    await first.completeMigration();
    const written = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    const second = new GraphStore(dir);
    expect(await second.load()).toBe("ok");
    expect(second.migrationPending).toBe(false);
    await second.completeMigration(); // 何もしない
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(written);
    expect(await readdir(join(dir, "graph-backups"))).toHaveLength(1); // 最初の移行の控えだけ
  });

  it("古い版（schema 1 しか読まない）は、schema 2 のファイルを壊れたファイルとして退避して空で起動する——その形を固定する", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, GRAPH_FILE_NAME), v1File(1));
    const store = new GraphStore(dir);
    await store.load();
    await store.completeMigration();
    const file = JSON.parse(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")) as {
      schema: unknown;
    };
    // 古い版の読み込みの条件は `schema === 1`（それ以外は "unknown schema" で退避）。新しい版が書くファイルはそれに当てはまらない。
    expect(file.schema).toBe(2);
    expect(file.schema === 1).toBe(false);
    // 否定の対照: 新しい版でも、知らない schema は退避して空から始める（同じ仕組み）。
    const dir2 = await tempDir();
    await writeFile(join(dir2, GRAPH_FILE_NAME), v1File(3));
    const other = new GraphStore(dir2);
    const r = await other.load();
    expect(typeof r === "object" && "corrupt" in r).toBe(true);
    expect(other.get()).toEqual({ rev: 0, paused: false, nodes: [], links: [] });
    expect(other.migrationPending).toBe(false);
  });

  // --- PR1a レビュー指摘 1・3（座標の範囲・移行の控え） ---------------------------------

  it("保存の形を満たさない（座標が範囲の外）グラフは書かない。ファイルも状態も変わらない（読めないファイルを作らない）", async () => {
    const dir = await tempDir();
    const store = await loaded(dir);
    await store.update(0, build, "c1");
    const before = await readFile(join(dir, GRAPH_FILE_NAME), "utf8");
    await expect(
      store.update(1, [{ op: "move_node", key: A, x: 2_080_540, y: 0 }], "graph"),
    ).rejects.toBeInstanceOf(GraphInvalidError);
    expect(await readFile(join(dir, GRAPH_FILE_NAME), "utf8")).toBe(before);
    expect(store.get().nodes[0]).toEqual({ key: A, x: 0, y: 0 });
    expect(store.get().rev).toBe(1);
  });

  it("読み込み: 座標が範囲の外でも壊れたファイルにせず、範囲の中へ寄せて読む（線を失わせない）", async () => {
    const dir = await tempDir();
    const raw = JSON.stringify({
      schema: 2,
      rev: 4,
      graph: {
        paused: false,
        nodes: [
          { key: A, x: 2_080_540, y: -3_000_000 },
          { key: B, x: 240, y: 0 },
        ],
        links: [{ id: "l1", kind: "supervise", from: A, to: B, limit: 10, count: 2, paused: null }],
      },
      savedAt: "2026-10-01T00:00:00.000Z",
    });
    await writeFile(join(dir, GRAPH_FILE_NAME), raw);
    const store = new GraphStore(dir);
    expect(await store.load()).toBe("ok");
    expect(store.get().nodes[0]).toEqual({ key: A, x: 1_000_000, y: -1_000_000 });
    expect(store.get().links).toHaveLength(1);
    expect(store.get().rev).toBe(4);
    // 否定の対照: 座標が数でない（形が違う）ファイルは、これまでどおり壊れたファイル
    const dir2 = await tempDir();
    await writeFile(join(dir2, GRAPH_FILE_NAME), raw.replace("2080540", '"far"'));
    expect(typeof (await new GraphStore(dir2).load())).toBe("object");
  });

  it("移行の前の控えは pre-migration- の別の名前で書き、最新 3 件の入れ替えで消えない。同じ中身は増やさない", async () => {
    const dir = await tempDir();
    const original = v1FileForBackup();
    await writeFile(join(dir, GRAPH_FILE_NAME), original);
    // 移行が終わらない起動を 5 回くり返す（同じ元のファイル）。
    for (let i = 0; i < 5; i++) {
      const s = new GraphStore(dir);
      await s.load();
    }
    let names = await readdir(join(dir, "graph-backups"));
    expect(names.filter((n) => n.startsWith("pre-migration-"))).toHaveLength(1);
    // 壊れたファイルの退避（最新 3 件）が何度あっても、移行の前の控えは残る。
    for (let i = 0; i < 6; i++) {
      await writeFile(join(dir, GRAPH_FILE_NAME), `{broken ${i}`);
      await new GraphStore(dir).load();
      await new Promise((r) => setTimeout(r, 5));
    }
    names = await readdir(join(dir, "graph-backups"));
    const pre = names.filter((n) => n.startsWith("pre-migration-"));
    expect(pre).toHaveLength(1);
    expect(await readFile(join(dir, "graph-backups", pre[0]!), "utf8")).toBe(original);
    expect(names.filter((n) => !n.startsWith("pre-migration-")).length).toBeLessThanOrEqual(3);
  });
});

function v1FileForBackup(): string {
  return `${JSON.stringify({ schema: 1, rev: 7, graph: { paused: false, nodes: [{ key: "local:p1", x: 0, y: 0 }], links: [] }, savedAt: "2026-10-01T00:00:00.000Z" }, null, 2)}\n`;
}
