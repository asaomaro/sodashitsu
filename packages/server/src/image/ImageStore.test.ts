import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_FILE_NAME_RE, IMAGE_MAX_AGE_MS, ImageStore, ImageStoreError } from "./ImageStore.js";

const posix = process.platform !== "win32";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("ImageStore（20260927-clipboard-image-paste）", () => {
  let root: string;
  let dir: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wtm-imgstore-"));
    dir = join(root, "clipboard-images");
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("同じバイト列を、推測できない名前で書いて絶対パスを返す", async () => {
    const store = new ImageStore({ dir, now: () => Date.UTC(2026, 8, 27, 10, 11, 12) });
    const path = await store.save("image/png", PNG);
    expect(path.startsWith(dir + "/") || path.startsWith(dir + "\\")).toBe(true);
    const name = path.slice(dir.length + 1);
    expect(name).toMatch(IMAGE_FILE_NAME_RE);
    expect(name).toMatch(/^wtm-image-20260927T101112Z-[0-9a-f]{16}\.png$/);
    expect(new Uint8Array(await readFile(path))).toEqual(PNG);
    const other = await store.save("image/jpeg", PNG);
    expect(other).not.toBe(path);
    expect(other.endsWith(".jpg")).toBe(true);
  });

  it.runIf(posix)("ディレクトリは 0700・ファイルは 0600", async () => {
    const path = await new ImageStore({ dir }).save("image/png", PNG);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it.runIf(posix)("既にあるディレクトリの権限が緩ければ 0700 に絞る", async () => {
    await mkdir(dir, { mode: 0o755 });
    await chmod(dir, 0o755);
    await new ImageStore({ dir }).save("image/png", PNG);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
  });

  it.runIf(posix)("ディレクトリの代わりにシンボリックリンクがあれば書かない", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, dir, "dir");
    await expect(new ImageStore({ dir }).save("image/png", PNG)).rejects.toBeInstanceOf(
      ImageStoreError,
    );
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it("ディレクトリの代わりに通常のファイルがあれば書かない", async () => {
    await writeFile(dir, "x");
    await expect(new ImageStore({ dir }).save("image/png", PNG)).rejects.toBeInstanceOf(
      ImageStoreError,
    );
  });

  it.runIf(posix)("持ち主が自分でなければ書かない", async () => {
    const me = process.getuid!();
    await expect(new ImageStore({ dir, uid: me + 1 }).save("image/png", PNG)).rejects.toThrow(
      /owned by uid/,
    );
    expect(await readdir(dir)).toEqual([]);
  });

  it("同じ名前が既にあれば上書きせず別の名前で書く（wx）", async () => {
    const seq = [Buffer.alloc(8, 0xaa), Buffer.alloc(8, 0xaa), Buffer.alloc(8, 0xbb)];
    const store = new ImageStore({ dir, now: () => 0, random: () => seq.shift()! });
    const first = await store.save("image/png", PNG);
    const second = await store.save("image/png", new Uint8Array([9, 9]));
    expect(second).not.toBe(first);
    expect(second).toContain("bbbbbbbbbbbbbbbb");
    expect(new Uint8Array(await readFile(first))).toEqual(PNG); // 最初のものは上書きされていない
  });

  it("同じ名前が 3 回続けば諦める", async () => {
    const store = new ImageStore({ dir, now: () => 0, random: () => Buffer.alloc(8, 0xcc) });
    await store.save("image/png", PNG);
    await expect(store.save("image/png", PNG)).rejects.toThrow(/unique/);
  });

  it("24 時間より古いファイルは次に書いたときに消える（名前の規則に合わないものは触らない）", async () => {
    const now = Date.UTC(2026, 8, 27);
    const store = new ImageStore({ dir, now: () => now });
    const old = await store.save("image/png", PNG);
    const stranger = join(dir, "notes.txt");
    await writeFile(stranger, "keep");
    const t = (now - 24 * 60 * 60 * 1000 - 1000) / 1000;
    await utimes(old, t, t);
    await utimes(stranger, t, t);
    const fresh = await store.save("image/png", PNG);
    expect(await exists(old)).toBe(false);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(stranger)).toBe(true);
  });

  it("今書いたものは、時計のずれで 24 時間より古く見えても消さない", async () => {
    // 注入した時計を実時計より 48 時間進める＝今書いたファイルの mtime（実時計）が 24 時間より前に見える。
    const store = new ImageStore({ dir, now: () => Date.now() + 2 * IMAGE_MAX_AGE_MS });
    const path = await store.save("image/png", PNG);
    expect(await exists(path)).toBe(true);
  });

  it("24 時間ちょうどまでは残す", async () => {
    const now = Date.UTC(2026, 8, 27);
    const store = new ImageStore({ dir, now: () => now });
    const kept = await store.save("image/png", PNG);
    const t = (now - IMAGE_MAX_AGE_MS) / 1000;
    await utimes(kept, t, t);
    await store.save("image/png", PNG);
    expect(await exists(kept)).toBe(true);
  });

  it("数の上限を超えたら古いものから消す（今書いたものは消さない）", async () => {
    let now = Date.UTC(2026, 8, 27);
    const store = new ImageStore({ dir, now: () => now, maxFiles: 2 });
    const paths: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await store.save("image/png", PNG);
      const t = (now - (10 - i) * 1000) / 1000; // 古い順に mtime を並べる
      await utimes(p, t, t);
      paths.push(p);
      now += 1;
    }
    expect(await exists(paths[0]!)).toBe(false);
    expect(await exists(paths[1]!)).toBe(true);
    expect(await exists(paths[2]!)).toBe(true);
  });

  it("今書いたものは数に数えた上で先頭に置く（mtime が未来の既存のファイルがあっても、そちらを消す）", async () => {
    const now = Date.UTC(2026, 8, 27);
    const store = new ImageStore({ dir, now: () => now, maxFiles: 1 });
    const future = await store.save("image/png", PNG);
    const t = (Date.now() + IMAGE_MAX_AGE_MS) / 1000; // 実時計より未来
    await utimes(future, t, t);
    const fresh = await store.save("image/png", PNG);
    expect(await exists(fresh)).toBe(true);
    expect(await exists(future)).toBe(false);
  });

  it("合計の上限を超えたら古いものから消す。今書いたものが 1 つで上限を超えても消さない", async () => {
    let now = Date.UTC(2026, 8, 27);
    const store = new ImageStore({ dir, now: () => now, maxTotalBytes: 20 });
    const a = await store.save("image/png", new Uint8Array(8));
    await utimes(a, (now - 5000) / 1000, (now - 5000) / 1000);
    now += 1;
    const b = await store.save("image/png", new Uint8Array(8));
    expect(await exists(a)).toBe(true); // 16 ≤ 20
    await utimes(b, (now - 3000) / 1000, (now - 3000) / 1000);
    now += 1;
    const c = await store.save("image/png", new Uint8Array(30));
    expect(await exists(c)).toBe(true);
    expect(await exists(a)).toBe(false);
    expect(await exists(b)).toBe(false);
  });

  it("startSweeping は今と間隔ごとに後片付けをし、stop で止まる", () => {
    vi.useFakeTimers();
    try {
      const store = new ImageStore({ dir });
      const prune = vi.spyOn(store, "prune").mockResolvedValue();
      const sweeper = store.startSweeping(1000);
      expect(prune).toHaveBeenCalledTimes(1); // 起動時
      vi.advanceTimersByTime(1000);
      expect(prune).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(prune).toHaveBeenCalledTimes(3);
      sweeper.stop();
      vi.advanceTimersByTime(5000);
      expect(prune).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it.runIf(posix)("後片付けはリンク・ディレクトリを消さない", async () => {
    const store = new ImageStore({ dir, maxFiles: 1 });
    await store.save("image/png", PNG);
    const linkName = join(dir, "wtm-image-20000101T000000Z-0000000000000000.png");
    const target = join(root, "target.png");
    await writeFile(target, "t");
    await symlink(target, linkName);
    await store.save("image/png", PNG);
    expect((await lstat(linkName)).isSymbolicLink()).toBe(true);
    expect(await exists(target)).toBe(true);
  });
});

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
