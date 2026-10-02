import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, readdir, rm } from "node:fs/promises";
import { platform as osPlatform } from "node:os";
import { join, resolve } from "node:path";
import { sanitizeFileName } from "@sodashitsu/protocol";

/** 置いておく時間（クリップボードの画像と同じ 24 時間）。 */
export const DROP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** 置いておく数の上限。 */
export const DROP_MAX_ENTRIES = 200;
/** 置いておく合計の大きさの上限。 */
export const DROP_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
/** 書くとき以外にも後片付けをする間隔（起動時と、この間隔ごと）。 */
export const DROP_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
/** ドロップしたファイルを置くディレクトリの名前（状態ディレクトリの下）。 */
export const DROP_DIR_NAME = "dropped-files";

/** このストアが作る、ファイル 1 つごとのディレクトリの名前（これに合わないものは後片付けで触らない）。 */
export const DROP_ENTRY_NAME_RE = /^soda-drop-\d{8}T\d{6}Z-[0-9a-f]{16}$/;

export class FileStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStoreError";
  }
}

export interface FileStoreOptions {
  /** 置くディレクトリ（`<状態ディレクトリ>/dropped-files`）。親は既にあるものとする。 */
  dir: string;
  now?: () => number;
  maxAgeMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
  random?: (bytes: number) => Buffer;
  platform?: NodeJS.Platform;
  /** 持ち主の確かめに使う uid（POSIX）。既定は `process.getuid()`。 */
  uid?: number | undefined;
}

/** 書いている途中のファイル。`finish` か `abort` のどちらかで終える。 */
export interface FileWriter {
  /** 置く先の絶対パス。 */
  readonly path: string;
  write(data: Uint8Array): Promise<void>;
  /** 書き終える。パスを返す。 */
  finish(): Promise<string>;
  /** やめる（書きかけとそのディレクトリを消す）。失敗は無視する。 */
  abort(): Promise<void>;
}

function timestamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * ブラウザからドロップされたファイルを置く（`@sodashitsu/protocol` の `file.ts`）。`ImageStore` と同じ守り方——ディレクトリは 0700 で作り、
 * 作った後に lstat で「シンボリックリンクでないディレクトリ・自分の持ち物」を確かめる。元の名前を保つため、ファイルごとに推測できない名前の
 * ディレクトリ（`soda-drop-<時刻>-<乱数>`）を作り、その中に `sanitizeFileName` で直した名前で `wx`・0600 で書く（大きいので受け取りながら書く）。
 * 24 時間より古いもの・数と合計の上限を超えた古いものを、書き終えるたびと定期的に消す。
 */
export class FileStore {
  readonly dir: string;
  private readonly now: () => number;
  private readonly maxAgeMs: number;
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number;
  private readonly random: (bytes: number) => Buffer;
  private readonly platform: NodeJS.Platform;
  private readonly uid: number | undefined;
  /** 書いている途中のディレクトリ（後片付けで消さない）。 */
  private readonly writing = new Set<string>();

  constructor(opts: FileStoreOptions) {
    this.dir = resolve(opts.dir);
    this.now = opts.now ?? Date.now;
    this.maxAgeMs = opts.maxAgeMs ?? DROP_MAX_AGE_MS;
    this.maxEntries = opts.maxEntries ?? DROP_MAX_ENTRIES;
    this.maxTotalBytes = opts.maxTotalBytes ?? DROP_MAX_TOTAL_BYTES;
    this.random = opts.random ?? randomBytes;
    this.platform = opts.platform ?? osPlatform();
    this.uid = "uid" in opts ? opts.uid : process.getuid?.();
  }

  /** `name`（ブラウザが送った名前）のファイルを作って書き始める。作れなければ `FileStoreError`。 */
  async create(name: string): Promise<FileWriter> {
    await this.ensureDir();
    const fileName = sanitizeFileName(name);
    for (let attempt = 0; attempt < 3; attempt++) {
      const entry = `soda-drop-${timestamp(this.now())}-${this.random(8).toString("hex")}`;
      const entryDir = join(this.dir, entry);
      try {
        await mkdir(entryDir, { mode: 0o700 });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw new FileStoreError(`cannot create ${entryDir}: ${String(err)}`);
      }
      this.writing.add(entry);
      const path = join(entryDir, fileName);
      let handle;
      try {
        handle = await open(path, "wx", 0o600);
      } catch (err) {
        this.writing.delete(entry);
        await rm(entryDir, { recursive: true, force: true }).catch(() => undefined);
        throw new FileStoreError(`cannot create ${path}: ${String(err)}`);
      }
      let closed = false;
      const close = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        await handle.close();
      };
      return {
        path,
        write: async (data) => {
          try {
            await handle.writeFile(data);
          } catch (err) {
            throw new FileStoreError(`cannot write ${path}: ${String(err)}`);
          }
        },
        finish: async () => {
          try {
            await close();
          } catch (err) {
            this.writing.delete(entry);
            await rm(entryDir, { recursive: true, force: true }).catch(() => undefined);
            throw new FileStoreError(`cannot write ${path}: ${String(err)}`);
          }
          this.writing.delete(entry);
          await this.prune(entry);
          return path;
        },
        abort: async () => {
          await close().catch(() => undefined);
          this.writing.delete(entry);
          await rm(entryDir, { recursive: true, force: true }).catch(() => undefined);
        },
      };
    }
    throw new FileStoreError("cannot allocate a unique directory name");
  }

  /**
   * 後片付け。名前の規則に合う（シンボリックリンクでない）ディレクトリだけを見て、24 時間より古いものを消し、残りの新しい順で数・合計の上限を
   * 超えた分を古いものから消す（`keep` は今書いたもの、書いている途中のものも消さない）。失敗は無視する。
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
      if (!DROP_ENTRY_NAME_RE.test(name) || this.writing.has(name)) continue;
      const entryDir = join(this.dir, name);
      let st;
      try {
        st = await lstat(entryDir);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (name !== keep && now - st.mtimeMs > this.maxAgeMs) {
        await rm(entryDir, { recursive: true, force: true }).catch(() => undefined);
        continue;
      }
      alive.push({ name, mtime: st.mtimeMs, size: await entrySize(entryDir) });
    }
    alive.sort((a, b) => (a.name === keep ? -1 : b.name === keep ? 1 : b.mtime - a.mtime || (a.name < b.name ? 1 : -1)));
    let count = 0;
    let total = 0;
    for (const e of alive) {
      count++;
      total += e.size;
      if (e.name !== keep && (count > this.maxEntries || total > this.maxTotalBytes)) {
        await rm(join(this.dir, e.name), { recursive: true, force: true }).catch(() => undefined);
        count--;
        total -= e.size;
      }
    }
  }

  /** 後片付けを今と `intervalMs` ごとに行う（`composeServer` の `listen` で始め、`close` で止める）。 */
  startSweeping(intervalMs: number = DROP_SWEEP_INTERVAL_MS): { stop(): void } {
    void this.prune();
    const timer = setInterval(() => void this.prune(), intervalMs);
    timer.unref();
    return { stop: () => clearInterval(timer) };
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.dir, { mode: 0o700 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw new FileStoreError(`cannot create ${this.dir}: ${String(err)}`);
    }
    let st;
    try {
      st = await lstat(this.dir);
    } catch (err) {
      throw new FileStoreError(`cannot stat ${this.dir}: ${String(err)}`);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) throw new FileStoreError(`${this.dir} is not a directory`);
    if (this.platform === "win32") return;
    if (this.uid !== undefined && st.uid !== this.uid) throw new FileStoreError(`${this.dir} is owned by uid ${st.uid}, not ${this.uid}`);
    if ((st.mode & 0o077) !== 0) {
      try {
        await chmod(this.dir, 0o700);
      } catch (err) {
        throw new FileStoreError(`cannot chmod ${this.dir}: ${String(err)}`);
      }
    }
  }
}

/** ディレクトリの直下の通常のファイルの合計の大きさ（読めなければ 0）。 */
async function entrySize(entryDir: string): Promise<number> {
  let total = 0;
  try {
    for (const name of await readdir(entryDir)) {
      const st = await lstat(join(entryDir, name)).catch(() => null);
      if (st?.isFile()) total += st.size;
    }
  } catch {
    // 読めないものは 0 として数える
  }
  return total;
}
