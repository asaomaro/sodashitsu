import { mkdir, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { DROP_ENTRY_NAME_RE, FileStore, FileStoreError, type FileStoreOptions } from "./FileStore.js";

describe("FileStore", () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) await fn();
  });

  async function setup(opts: Partial<FileStoreOptions> = {}) {
    const root = await makeTempDir("soda-file-store-");
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const dir = join(root, "dropped-files");
    return { root, dir, store: new FileStore({ dir, ...opts }) };
  }

  async function put(store: FileStore, name: string, ...parts: string[]): Promise<string> {
    const w = await store.create(name);
    for (const p of parts) await w.write(Buffer.from(p));
    return w.finish();
  }

  it("分けて書いた中身が、元の名前のまま推測できない名前のディレクトリの中に置かれる", async () => {
    const { dir, store } = await setup();
    const path = await put(store, "my report.txt", "hello ", "world");
    expect(basename(path)).toBe("my report.txt");
    expect(dirname(dirname(path))).toBe(dir);
    expect(basename(dirname(path))).toMatch(DROP_ENTRY_NAME_RE);
    expect(await readFile(path, "utf8")).toBe("hello world");
  });

  it.skipIf(process.platform === "win32")("ディレクトリは 0700、ファイルは 0600", async () => {
    const { dir, store } = await setup();
    const path = await put(store, "a.txt", "x");
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("名前はサーバが直す（置き場所の外へ書かない）", async () => {
    const { root, store } = await setup();
    const path = await put(store, "../../../escape.txt", "x");
    expect(basename(path)).toBe("escape.txt");
    expect(await readdir(root)).toEqual(["dropped-files"]);
  });

  it("同じ名前を続けて置いても、別のディレクトリに置かれて上書きしない", async () => {
    const { store } = await setup();
    const a = await put(store, "a.txt", "1");
    const b = await put(store, "a.txt", "2");
    expect(a).not.toBe(b);
    expect(await readFile(a, "utf8")).toBe("1");
    expect(await readFile(b, "utf8")).toBe("2");
  });

  it("abort は書きかけとそのディレクトリを消す", async () => {
    const { dir, store } = await setup();
    const w = await store.create("a.txt");
    await w.write(Buffer.from("partial"));
    await w.abort();
    expect(await readdir(dir)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("置き場所がシンボリックリンクなら書かない", async () => {
    const { root, dir, store } = await setup();
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, dir);
    await expect(store.create("a.txt")).rejects.toBeInstanceOf(FileStoreError);
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it("24 時間より古いものを消す（規則に合わない名前・書いている途中のものは触らない）", async () => {
    let now = Date.UTC(2026, 9, 2, 0, 0, 0);
    const { dir, store } = await setup({ now: () => now });
    const old = await put(store, "old.txt", "x");
    const past = new Date(now - 25 * 60 * 60 * 1000);
    await utimes(dirname(old), past, past);
    await mkdir(join(dir, "keep-me"));
    await writeFile(join(dir, "keep-me", "f"), "x");
    await utimes(join(dir, "keep-me"), past, past);
    now += 1000;
    const writing = await store.create("writing.txt");
    await utimes(dirname(writing.path), past, past);
    now += 1000;
    const fresh = await put(store, "fresh.txt", "y");
    const names = await readdir(dir);
    expect(names).toContain("keep-me");
    expect(names).toContain(basename(dirname(writing.path)));
    expect(names).toContain(basename(dirname(fresh)));
    expect(names).not.toContain(basename(dirname(old)));
    await writing.abort();
  });

  it("数・合計の上限を超えたら古いものから消す（今書いたものは残す）", async () => {
    let now = Date.UTC(2026, 9, 2, 0, 0, 0);
    const { dir, store } = await setup({ now: () => now, maxEntries: 2, maxTotalBytes: 10 });
    const paths: string[] = [];
    for (const [i, body] of ["aaa", "bbb", "ccc"].entries()) {
      now += 1000;
      const p = await put(store, `${i}.txt`, body);
      const t = new Date(now);
      await utimes(dirname(p), t, t);
      paths.push(p);
    }
    await store.prune();
    expect((await readdir(dir)).sort()).toEqual([basename(dirname(paths[1]!)), basename(dirname(paths[2]!))].sort());
    now += 1000;
    const big = await put(store, "big.txt", "0123456789ab"); // 合計の上限を 1 つで超える
    expect(await readdir(dir)).toEqual([basename(dirname(big))]);
  });
});
