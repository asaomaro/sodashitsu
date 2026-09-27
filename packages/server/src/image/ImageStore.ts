import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { platform as osPlatform } from "node:os";
import { join, resolve } from "node:path";
import { imageExtension, type ImageMimeType } from "@wtm/protocol";

/** 置いておく時間（herdr の `STAGED_CLIPBOARD_IMAGE_MAX_AGE` と同じ 24 時間）。 */
export const IMAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 置いておく数の上限（decisions D7）。 */
export const IMAGE_MAX_FILES = 100;
/** 置いておく合計の大きさの上限（decisions D7）。 */
export const IMAGE_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** 書くとき以外にも後片付けをする間隔（起動時と、この間隔ごと。貼らなくなっても古い画像を残さない。review ラウンド 1）。 */
export const IMAGE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** 画像を置くディレクトリの名前（状態ディレクトリの下。decisions D5）。 */
export const IMAGE_DIR_NAME = "clipboard-images";

/** このストアが作るファイルの名前（これに合わないものは後片付けで触らない）。 */
export const IMAGE_FILE_NAME_RE = /^wtm-image-\d{8}T\d{6}Z-[0-9a-f]{16}\.(png|jpg|gif|webp)$/;

export class ImageStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageStoreError";
  }
}

export interface ImageStoreOptions {
  /** 画像を置くディレクトリ（`<状態ディレクトリ>/clipboard-images`）。親は既にあるものとする。 */
  dir: string;
  now?: () => number;
  maxAgeMs?: number;
  maxFiles?: number;
  maxTotalBytes?: number;
  /** 名前の乱数（テストで差し替える）。 */
  random?: (bytes: number) => Buffer;
  platform?: NodeJS.Platform;
  /** 持ち主の確かめに使う uid（POSIX）。既定は `process.getuid()`。 */
  uid?: number | undefined;
}

function timestamp(ms: number): string {
  // 2026-09-27T10:11:12.345Z → 20260927T101112Z
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * クリップボードの画像を置く（20260927-clipboard-image-paste。herdr の `server/clipboard_image.rs` の `stage` 相当）。
 * ディレクトリは 0700 で作り、作った後に lstat で「シンボリックリンクでないディレクトリ・自分の持ち物」を確かめる（`--state-dir` を他人も書ける場所に
 * されても、先回りで作られたディレクトリ・リンクに書かない。decisions D5）。ファイルは推測できない名前で `wx`（既存なら書かない）・0600 で新しく作る。
 * 書くたびに、24 時間より古いもの・数と合計の上限を超えた古いものを消す（切断では消さない。D5）。
 */
export class ImageStore {
  readonly dir: string;
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly maxFiles: number;
  private readonly maxTotalBytes: number;
  private readonly random: (bytes: number) => Buffer;
  private readonly platform: NodeJS.Platform;
  private readonly uid: number | undefined;

  constructor(opts: ImageStoreOptions) {
    this.dir = resolve(opts.dir);
    this.now = opts.now ?? Date.now;
    this.maxAgeMs = opts.maxAgeMs ?? IMAGE_MAX_AGE_MS;
    this.maxFiles = opts.maxFiles ?? IMAGE_MAX_FILES;
    this.maxTotalBytes = opts.maxTotalBytes ?? IMAGE_MAX_TOTAL_BYTES;
    this.random = opts.random ?? randomBytes;
    this.platform = opts.platform ?? osPlatform();
    this.uid = "uid" in opts ? opts.uid : process.getuid?.();
  }

  /** 画像を書いて絶対パスを返す。書けなければ `ImageStoreError`（書きかけは消す）。 */
  async save(mime: ImageMimeType, data: Uint8Array): Promise<string> {
    await this.ensureDir();
    const ext = imageExtension(mime);
    for (let attempt = 0; attempt < 3; attempt++) {
      const name = `wtm-image-${timestamp(this.now())}-${this.random(8).toString("hex")}.${ext}`;
      const path = join(this.dir, name);
      let handle;
      try {
        handle = await open(path, "wx", 0o600);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw new ImageStoreError(`cannot create ${path}: ${String(err)}`);
      }
      try {
        await handle.writeFile(data);
        await handle.close();
      } catch (err) {
        await handle.close().catch(() => undefined);
        await unlink(path).catch(() => undefined);
        throw new ImageStoreError(`cannot write ${path}: ${String(err)}`);
      }
      await this.prune(name);
      return path;
    }
    throw new ImageStoreError("cannot allocate a unique image file name");
  }

  /**
   * 後片付け。名前の規則に合う通常のファイルだけを見て、24 時間より古いものを消し、残りの新しい順で数・合計の上限を超えた分を古いものから消す
   * （`keep` は今書いたもの。消さない）。失敗は無視する。
   */
  async prune(keep?: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return;
    }
    const now = this.now();
    const alive: { name: string; mtime: number; size: number }[] = [];
    for (const name of names) {
      if (!IMAGE_FILE_NAME_RE.test(name)) continue;
      let st;
      try {
        st = await lstat(join(this.dir, name));
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (name !== keep && now - st.mtimeMs > this.maxAgeMs) {
        await unlink(join(this.dir, name)).catch(() => undefined);
        continue;
      }
      alive.push({ name, mtime: st.mtimeMs, size: st.size });
    }
    // 新しい順（同じ時刻なら名前の逆順）。今書いたものは先頭に置く（数・合計に数えるが消さない）。
    alive.sort((a, b) =>
      a.name === keep ? -1 : b.name === keep ? 1 : b.mtime - a.mtime || (a.name < b.name ? 1 : -1),
    );
    let count = 0;
    let total = 0;
    for (const f of alive) {
      count++;
      total += f.size;
      if (f.name !== keep && (count > this.maxFiles || total > this.maxTotalBytes)) {
        await unlink(join(this.dir, f.name)).catch(() => undefined);
        count--;
        total -= f.size;
      }
    }
  }

  /**
   * 後片付けを今と `intervalMs` ごとに行う（`composeServer` の `listen`〔状態ディレクトリのロックを取った後〕で始め、`close` で止める）。
   * 画像を一度も貼っていない（ディレクトリが無い）なら何もしない。
   */
  startSweeping(intervalMs: number = IMAGE_SWEEP_INTERVAL_MS): { stop(): void } {
    void this.prune();
    const timer = setInterval(() => void this.prune(), intervalMs);
    timer.unref();
    return { stop: () => clearInterval(timer) };
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.dir, { mode: 0o700 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST")
        throw new ImageStoreError(`cannot create ${this.dir}: ${String(err)}`);
    }
    let st;
    try {
      st = await lstat(this.dir);
    } catch (err) {
      throw new ImageStoreError(`cannot stat ${this.dir}: ${String(err)}`);
    }
    if (st.isSymbolicLink() || !st.isDirectory())
      throw new ImageStoreError(`${this.dir} is not a directory`);
    if (this.platform === "win32") return;
    if (this.uid !== undefined && st.uid !== this.uid)
      throw new ImageStoreError(`${this.dir} is owned by uid ${st.uid}, not ${this.uid}`);
    if ((st.mode & 0o077) !== 0) {
      try {
        await chmod(this.dir, 0o700);
      } catch (err) {
        throw new ImageStoreError(`cannot chmod ${this.dir}: ${String(err)}`);
      }
    }
  }
}
