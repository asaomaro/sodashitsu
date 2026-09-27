import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PREFS_MAX_BYTES } from "@sodashitsu/protocol";
import { makeTempDir } from "./atomicFile.js";
import { PREFS_FILE_NAME, PrefsStore, PrefsTooLargeError } from "./PrefsStore.js";

// 20260927-cli-mode の T2：共有の設定の保存（prefs.json・rev・浅いマージ・上限）。
describe("PrefsStore", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  async function tempDir(): Promise<string> {
    const d = await makeTempDir("soda-prefs-");
    dirs.push(d);
    return d;
  }

  it("無ければ空・rev 0", async () => {
    const store = new PrefsStore(await tempDir());
    expect(await store.load()).toBe("missing");
    expect(store.get()).toEqual({ prefs: {}, rev: 0 });
  });

  it("項目ごとに上書き（浅いマージ）し、保存のたびに rev を +1。項目の中身は丸ごと置き換える", async () => {
    const dir = await tempDir();
    const store = new PrefsStore(dir);
    await store.load();
    expect(
      await store.set({ theme: "dracula", keys: { prefix: "ctrl+a", bindings: { a: 1 } } }, "c1"),
    ).toEqual({
      prefs: { theme: "dracula", keys: { prefix: "ctrl+a", bindings: { a: 1 } } },
      rev: 1,
    });
    expect(await store.set({ keys: { prefix: "ctrl+b" } }, "c1")).toEqual({
      prefs: { theme: "dracula", keys: { prefix: "ctrl+b" } },
      rev: 2,
    });
  });

  it("保存した値と rev は作り直しても読める（再起動後の復元）。ファイルは 0600", async () => {
    const dir = await tempDir();
    const a = new PrefsStore(dir);
    await a.load();
    await a.set({ theme: "nord", unknownFuture: [1, 2] }, "c1");
    const b = new PrefsStore(dir);
    expect(await b.load()).toBe("ok");
    expect(b.get()).toEqual({ prefs: { theme: "nord", unknownFuture: [1, 2] }, rev: 1 });
    if (process.platform !== "win32")
      expect((await stat(join(dir, PREFS_FILE_NAME))).mode & 0o777).toBe(0o600);
  });

  it("壊れたファイルは退避して空から始める", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, PREFS_FILE_NAME), "{not json");
    const store = new PrefsStore(dir);
    const r = await store.load();
    expect(typeof r).toBe("object");
    expect(store.get()).toEqual({ prefs: {}, rev: 0 });
    expect((await readdir(join(dir, "prefs-backups"))).length).toBe(1);
  });

  it("保存した後の全体が上限を超えるなら PrefsTooLargeError で、保存も rev も変えない", async () => {
    const dir = await tempDir();
    const store = new PrefsStore(dir);
    await store.load();
    await store.set({ a: "x".repeat(PREFS_MAX_BYTES / 2) }, "c1");
    const before = await readFile(join(dir, PREFS_FILE_NAME), "utf8");
    await expect(store.set({ b: "y".repeat(PREFS_MAX_BYTES / 2) }, "c1")).rejects.toBeInstanceOf(
      PrefsTooLargeError,
    );
    expect(store.get().rev).toBe(1);
    expect(await readFile(join(dir, PREFS_FILE_NAME), "utf8")).toBe(before);
  });

  it("保存できた変更を onChange で知らせる（保存した接続の id つき）。同時の set は順に並ぶ", async () => {
    const store = new PrefsStore(await tempDir());
    await store.load();
    const seen: { rev: number; by: string }[] = [];
    store.onChange((s, by) => seen.push({ rev: s.rev, by }));
    const [r1, r2] = await Promise.all([store.set({ a: 1 }, "c1"), store.set({ b: 2 }, "c2")]);
    expect(r1.rev).toBe(1);
    expect(r2).toEqual({ prefs: { a: 1, b: 2 }, rev: 2 });
    expect(seen).toEqual([
      { rev: 1, by: "c1" },
      { rev: 2, by: "c2" },
    ]);
  });

  it("ファイルの __proto__ の項目でプロトタイプを差し替えない", async () => {
    const dir = await tempDir();
    await writeFile(
      join(dir, PREFS_FILE_NAME),
      '{"schema":1,"rev":4,"prefs":{"__proto__":{"polluted":1},"theme":"x"}}',
    );
    const store = new PrefsStore(dir);
    await store.load();
    const { prefs, rev } = store.get();
    expect(rev).toBe(4);
    expect(Object.keys(prefs)).toEqual(["theme"]);
    expect((prefs as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
