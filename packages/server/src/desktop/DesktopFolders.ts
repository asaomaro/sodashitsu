import { lstat, mkdir, rmdir, opendir, realpath, mkdtemp, open, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Zip, ZipPassThrough } from "fflate";
import {
  DesktopFolderManifest,
  DesktopFolderName,
  DesktopFolderPath,
  DESKTOP_FOLDER_MAX_BYTES,
  DESKTOP_FOLDER_MAX_ENTRIES,
  type DesktopFolderRequest,
  type DesktopFileResult,
} from "@sodashitsu/protocol";
import {
  FileTransfer,
  FileTransferInterrupted,
  type FileTransferSnapshot,
  type FileTransferSourceSnapshot,
} from "../work/FileTransfer.js";
import { folderIdentity } from "../work/files.js";
import {
  DesktopFolderSnapshot,
  directorySnapshot,
  verifyDirectory,
  folderPath,
  fileSnapshot,
  verifyFolderSource,
  openFolderSource,
  type FolderDirectorySnapshot,
} from "./DesktopFolderSnapshot.js";
import { directoryGuard, inside } from "../work/files.js";
import { readRange } from "../agent/safeFile.js";
import { canonicalFolder } from "./desktopFilePaths.js";
type Result = NonNullable<DesktopFileResult["result"]>;
type FileState = {
  bytes: number;
  offset: number;
  done: boolean;
  stream?: string | undefined;
  temporary?: FileTransferSnapshot | undefined;
  sha256?: string | undefined;
  committing?: boolean | undefined;
  source?: FileTransferSourceSnapshot | undefined;
};
type Job = {
  id: string;
  upload: boolean;
  root?: string;
  rootCheck?: () => Promise<void>;
  created: Array<{ path: string; check: () => Promise<void> }>;
  dirs: Map<string, () => Promise<void>>;
  files: Map<string, FileState>;
  bytes: number;
  offset: number;
  done: number;
  transfer: FileTransfer;
  owner: string;
  cancelled: boolean;
  expires: number;
  timer: ReturnType<typeof setTimeout>;
  scratch?: string;
  scratchCheck?: () => Promise<void>;
  archive?: string;
  fd?: FileHandle;
  sha256?: string;
  completed?: Result;
  snapshot?: () => Promise<void>;
  sourcePath?: string;
  sourceDirectories?: FolderDirectorySnapshot[];
  sourceFiles?: FileTransferSourceSnapshot[];
};
/** A group owns its streams and empty directories, never completed/user files. */
export class DesktopFolders {
  private jobs = new Map<string, Job>();
  private seen = new Set<string>();
  private cancelled = new Set<string>();
  private dead = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private root: string,
    private resumable = false,
    private scratchRoot?: string,
    private beforePublish?: (snapshot: DesktopFolderSnapshot) => Promise<void>,
  ) {}
  private expiryPaused = false;
  private cleanups = new Set<Promise<void>>();
  private scheduleCleanup(jobs: Job[]) {
    const work = this.queue.then(async () => {
      const results = await Promise.allSettled(jobs.map((j) => this.cleanup(j)));
      for (const r of results) if (r.status === "rejected") throw r.reason;
    });
    this.cleanups.add(work);
    void work.finally(() => this.cleanups.delete(work)).catch(() => {});
  }
  pauseExpiry() {
    this.expiryPaused = true;
    for (const j of this.jobs.values()) {
      clearTimeout(j.timer);
      j.transfer.pauseExpiry();
    }
  }
  async keepAlive() {
    if (this.expiryPaused) return;
    for (const j of this.jobs.values()) {
      this.fence(j);
      for (const f of j.files.values())
        if (f.stream) await j.transfer.run(j.owner, j.root!, { action: "status", id: f.stream });
    }
  }
  async inspect(id: string) {
    const j = this.jobs.get(id);
    if (!j) throw Error("再開記録が終了しました");
    this.fence(j);
    await j.snapshot?.();
    for (const check of j.dirs.values()) await check();
    this.touch(j);
    return this.state(j, true);
  }
  private state(j: Job, files = false): Result {
    return {
      id: j.id,
      bytes: j.bytes,
      offset: j.offset,
      entriesDone: j.done,
      ...(j.sha256 ? { sha256: j.sha256 } : {}),
      ...(j.upload && files
        ? {
            folderFiles: [...j.files].map(([path, f]) => ({
              path,
              offset: f.offset,
              done: f.done,
            })),
          }
        : {}),
      ...j.completed,
    };
  }
  async seek(id: string, offset: number) {
    const j = this.jobs.get(id);
    if (!j || j.upload || offset > j.bytes || (offset !== j.bytes && offset % 65536 !== 0))
      throw Error("再開位置が不正です");
    j.offset = offset;
  }
  cancel(id: string): boolean {
    if (this.cancelled.size >= 4096) {
      this.dead = true;
      for (const job of this.jobs.values()) job.cancelled = true;
      this.scheduleCleanup([...this.jobs.values()]);
      return true;
    }
    this.cancelled.add(id);
    const j = this.jobs.get(id);
    if (!j) return true;
    j.cancelled = true;
    clearTimeout(j.timer);
    this.scheduleCleanup([j]);
    return true;
  }
  cancelAll() {
    for (const j of this.jobs.values()) this.cancel(j.id);
  }
  async clear() {
    this.cancelAll();
    await this.queue;
    const results = await Promise.allSettled([
      ...this.cleanups,
      ...[...this.jobs.values()].map((j) => this.cleanup(j)),
    ]);
    for (const r of results) if (r.status === "rejected") throw r.reason;
  }
  async close() {
    this.dead = true;
    await this.clear();
  }
  private fence(j: Job) {
    if (this.dead && this.resumable)
      throw new FileTransferInterrupted("フォルダ転送を引き継ぎ中です");
    if (this.dead || this.jobs.get(j.id) !== j || j.cancelled || performance.now() >= j.expires)
      throw Error("フォルダ転送が終了しました");
  }
  private touch(j: Job) {
    j.expires = performance.now() + (this.resumable ? 900000 : 60000);
    clearTimeout(j.timer);
    j.timer = setTimeout(
      () => {
        if (!this.expiryPaused) this.cancel(j.id);
      },
      this.resumable ? 900000 : 60000,
    );
    j.timer.unref();
  }
  private async cleanup(j: Job, success = false) {
    if (this.jobs.get(j.id) !== j) return;
    this.jobs.delete(j.id);
    clearTimeout(j.timer);
    const closed = await Promise.allSettled([
      j.transfer.close(),
      (async () => {
        const archiveIdentity = await j.fd?.stat({ bigint: true }).catch(() => undefined);
        await j.fd?.close();
        if (j.archive && archiveIdentity && j.scratchCheck)
          await j
            .scratchCheck()
            .then(async () => {
              const named = await lstat(j.archive!, { bigint: true });
              if (
                named.isFile() &&
                !named.isSymbolicLink() &&
                named.dev === archiveIdentity.dev &&
                named.ino === archiveIdentity.ino &&
                named.birthtimeNs === archiveIdentity.birthtimeNs
              )
                await unlink(j.archive!);
            })
            .catch(() => {});
        if (j.scratch && j.scratchCheck)
          await j
            .scratchCheck()
            .then(() => rmdir(j.scratch!))
            .catch(() => {});
      })(),
    ]);
    if (!success && !j.completed)
      for (const dir of [...j.created].reverse())
        await dir
          .check()
          .then(() => rmdir(dir.path))
          .catch(() => {});
    for (const result of closed) if (result.status === "rejected") throw result.reason;
  }
  async checkpoint(id: string): Promise<DesktopFolderSnapshot> {
    await this.queue;
    const j = this.jobs.get(id);
    if (!j) throw Error("フォルダの再開記録が終了しました");
    return this.checkpointNow(j);
  }
  private async checkpointNow(j: Job): Promise<DesktopFolderSnapshot> {
    this.fence(j);
    await j.snapshot?.();
    const approvedIdentity = await folderIdentity(this.root);
    if (j.upload) {
      if (!j.root) throw Error("フォルダの準備が完了していません");
      const directories: FolderDirectorySnapshot[] = [];
      for (const d of j.created) {
        await d.check();
        directories.push(await directorySnapshot(j.root, d.path));
      }
      const files = [];
      for (const [path, f] of j.files) {
        if (f.stream) f.temporary = await j.transfer.checkpoint(j.owner, j.root, f.stream);
        files.push({
          path,
          bytes: f.bytes,
          offset: f.offset,
          done: f.done,
          temporary: f.temporary,
          sha256: f.sha256,
          committing: f.committing,
          source: f.source,
        });
      }
      return DesktopFolderSnapshot.parse({
        version: 1,
        id: j.id,
        upload: true,
        approvedIdentity,
        destination: relative(this.root, j.root).split("\\").join("/"),
        directories,
        files,
        bytes: j.bytes,
        offset: j.offset,
        complete: !!j.completed,
      });
    }
    if (!this.scratchRoot || !j.scratch || !j.sourcePath || !j.sha256)
      throw Error("ZIPの準備が完了していません");
    await j.fd!.sync();
    return DesktopFolderSnapshot.parse({
      version: 1,
      id: j.id,
      upload: false,
      approvedIdentity,
      directories: [],
      files: [],
      bytes: j.bytes,
      offset: j.offset,
      complete: false,
      download: {
        source: j.sourcePath,
        directories: j.sourceDirectories,
        files: j.sourceFiles,
        scratch: basename(j.scratch),
        scratchIdentity: await folderIdentity(j.scratch),
        archive: await fileSnapshot(j.scratch, "folder.zip"),
        sha256: j.sha256,
      },
    });
  }
  suspend(): Promise<void> {
    this.pauseExpiry();
    this.dead = true;
    return this.queue.then(async () => {
      this.dead = true;
      const results = await Promise.allSettled([
        ...this.cleanups,
        ...[...this.jobs.values()].map(async (j) => {
          this.jobs.delete(j.id);
          clearTimeout(j.timer);
          const result = await Promise.allSettled([j.transfer.suspend(), j.fd?.close()]);
          for (const r of result) if (r.status === "rejected") throw r.reason;
        }),
      ]);
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed.length)
        throw new AggregateError(
          failed.map((r) => r.reason),
          "Folder descriptor shutdown failed",
        );
    });
  }
  restore(raw: DesktopFolderSnapshot, guard: () => Promise<void>, fence: () => void) {
    const operation = this.queue.then(() => this.restoreNow(raw, guard, fence));
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async restoreNow(
    raw: DesktopFolderSnapshot,
    guard: () => Promise<void>,
    fence: () => void,
  ) {
    const s = DesktopFolderSnapshot.parse(raw);
    await guard();
    if (this.dead || this.jobs.size || (await folderIdentity(this.root)) !== s.approvedIdentity)
      throw Error("共有フォルダの実体が変更されました");
    const j: Job = {
      id: s.id,
      upload: s.upload,
      created: [],
      dirs: new Map(),
      files: new Map(),
      bytes: s.bytes,
      offset: s.offset,
      done: 0,
      transfer: new FileTransfer(true),
      owner: randomUUID(),
      cancelled: false,
      expires: performance.now() + 900000,
      timer: undefined as any,
    };
    try {
      if (s.upload) {
        j.root = await folderPath(this.root, s.destination!);
        for (const d of s.directories) {
          const path = await verifyDirectory(j.root, d),
            check = await directoryGuard(path);
          j.created.push({ path, check });
          j.dirs.set(d.path, check);
        }
        j.rootCheck = j.dirs.get("")!;
        for (const f of s.files) {
          await guard();
          const file: FileState = { ...f };
          if (f.done || f.committing) {
            const published = await FileTransfer.published(
              j.root,
              f.temporary!,
              f.sha256!,
              guard,
              fence,
            );
            if (published) {
              if (f.source) {
                const source = await verifyFolderSource(j.root, f.source, undefined, guard, fence);
                await source.fd.close();
              }
              file.done = true;
              file.committing = false;
              file.source = await fileSnapshot(j.root, f.path);
            } else if (f.done) throw Error("保存済みファイルが見つかりません");
          }
          if (!file.done && f.temporary) {
            const restored = await j.transfer.restore(j.owner, j.root, f.temporary, guard, fence);
            file.stream = restored.id;
          }
          if (file.done) {
            j.done++;
            const saved = file.source!;
            const previous = j.snapshot;
            j.snapshot = async () => {
              await previous?.();
              const source = await verifyFolderSource(j.root!, saved);
              await source.fd.close();
            };
          }
          j.files.set(f.path, file);
        }
        if (s.complete) j.completed = { done: true, destination: j.root };
      } else {
        const d = s.download!;
        if (!this.scratchRoot) throw Error("ZIPの保存場所が利用できません");
        const source = await folderPath(this.root, d.source);
        j.sourcePath = d.source;
        j.sourceDirectories = d.directories;
        j.sourceFiles = d.files;
        const verify = async (authority: () => Promise<void> = async () => {}) => {
          for (const dir of d.directories) {
            await authority();
            await verifyDirectory(source, dir);
          }
          for (const saved of d.files) {
            await authority();
            const file = await verifyFolderSource(source, saved);
            await file.fd.close();
          }
        };
        await verify(guard);
        const scratch = await folderPath(this.scratchRoot, d.scratch);
        if ((await folderIdentity(scratch)) !== d.scratchIdentity)
          throw Error("ZIPの保存先が変更されました");
        const archive = await verifyFolderSource(scratch, d.archive, d.sha256, guard, fence);
        j.fd = archive.fd;
        j.scratch = scratch;
        j.scratchCheck = await directoryGuard(scratch);
        j.archive = join(scratch, "folder.zip");
        j.sha256 = d.sha256;
        j.snapshot = async () => {
          await verify();
          await archive.verify();
        };
      }
      await guard();
      fence();
      if (this.dead || this.expiryPaused || this.jobs.size)
        throw new FileTransferInterrupted("フォルダの復元が終了しました");
      this.jobs.set(j.id, j);
      this.touch(j);
      return this.state(j, true);
    } catch (error) {
      await Promise.allSettled([j.transfer.suspend(), j.fd?.close()]);
      throw error;
    }
  }
  static async discard(root: string, raw: DesktopFolderSnapshot, scratchRoot?: string) {
    const s = DesktopFolderSnapshot.parse(raw);
    if ((await folderIdentity(root)) !== s.approvedIdentity) return;
    if (s.upload) {
      if (s.complete) return;
      const destination = await folderPath(root, s.destination!);
      for (const d of s.directories) await verifyDirectory(destination, d);
      for (const f of s.files)
        if (f.temporary) await FileTransfer.discard(destination, f.temporary).catch(() => {});
      for (const d of [...s.directories].sort(
        (a, b) => (b.path ? b.path.split("/").length : 0) - (a.path ? a.path.split("/").length : 0),
      )) {
        const path = await verifyDirectory(destination, d);
        await rmdir(path).catch((error) => {
          if (!["ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? ""))
            throw error;
        });
      }
    } else if (scratchRoot) {
      const d = s.download!,
        scratch = await folderPath(scratchRoot, d.scratch);
      if ((await folderIdentity(scratch)) !== d.scratchIdentity) return;
      const file = await verifyFolderSource(scratch, d.archive);
      await file.fd.close();
      await unlink(join(scratch, "folder.zip"));
      await rmdir(scratch);
    }
  }

  private async location(part: string) {
    if (isAbsolute(part) || /^[A-Za-z]:/.test(part) || part.split(/[\\/]/).includes(".."))
      throw Error("共有フォルダ内の相対パスを指定してください");
    const target = await canonicalFolder(resolve(this.root, part));
    if (!inside(this.root, target)) throw Error("共有フォルダの外には移動できません");
    return target;
  }
  run(
    p: DesktopFolderRequest,
    outerGuard: () => Promise<void>,
    outerFence: () => void,
  ): Promise<Result> {
    const operation = this.queue.then(() => this.perform(p, outerGuard, outerFence));
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async perform(
    p: DesktopFolderRequest,
    outerGuard: () => Promise<void>,
    outerFence: () => void,
  ): Promise<Result> {
    await outerGuard();
    if (this.dead) throw Error("フォルダ転送の接続が終了しました");
    const start = p.action === "folder_upload_start" || p.action === "folder_download_start";
    let j: Job | undefined;
    if (start) {
      if (this.jobs.size >= 2) throw Error("同時に準備できるフォルダは2件までです");
      if (this.seen.size >= 4096 || this.seen.has(p.id) || this.cancelled.has(p.id))
        throw Error("フォルダ転送のIDが失効しました。再接続してください");
      const id = p.id;
      this.seen.add(id);
      j = {
        id,
        upload: p.action === "folder_upload_start",
        created: [],
        dirs: new Map(),
        files: new Map(),
        bytes: 0,
        offset: 0,
        done: 0,
        transfer: new FileTransfer(this.resumable),
        owner: randomUUID(),
        cancelled: false,
        expires: performance.now() + (this.resumable ? 900000 : 60000),
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
      };
      this.jobs.set(id, j);
      this.touch(j);
    } else j = this.jobs.get(p.id);
    if (!j) throw Error("フォルダ転送が終了しました");
    const job = j;
    const fence = () => {
      outerFence();
      this.fence(job);
    };
    const guard = async () => {
      fence();
      await outerGuard();
      if (job.rootCheck) await job.rootCheck();
      fence();
    };
    const result = (extra: Result = {}): Result => ({
      id: job.id,
      bytes: job.bytes,
      offset: job.offset,
      entriesDone: job.done,
      ...(this.resumable ? this.state(job) : {}),
      ...extra,
    });
    try {
      await guard();
      this.touch(job);
      if (job.completed) return result();
      if (p.action === "folder_upload_start") {
        const parent = await this.location(p.parent),
          checkParent = await directoryGuard(parent),
          destination = join(parent, p.name);
        const create = async (path: string, key: string) => {
          await guard();
          await checkParent();
          fence();
          try {
            await mkdir(path, { mode: 0o700 });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "EEXIST")
              throw Error("同名のフォルダまたはファイルがあります。保存名を変えてください");
            throw e;
          }
          this.touch(job);
          const canonical = await canonicalFolder(path),
            check = await directoryGuard(canonical);
          job.created.push({ path: canonical, check });
          job.dirs.set(key, check);
          await guard();
          return canonical;
        };
        job.root = await create(destination, "");
        job.rootCheck = job.dirs.get("")!;
        const dirs = p.entries
          .filter((e) => e.directory)
          .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
        for (const entry of dirs) {
          const parentKey = entry.path.split("/").slice(0, -1).join("/");
          await job.dirs.get(parentKey)!();
          await create(resolve(job.root, entry.path), entry.path);
        }
        for (const entry of p.entries)
          if (!entry.directory) {
            job.files.set(entry.path, { bytes: entry.bytes, offset: 0, done: false });
            job.bytes += entry.bytes;
          }
        return result({ destination: job.root });
      }
      if (p.action === "folder_download_start") {
        const source = await this.location(p.path);
        job.sourcePath = p.path;
        job.sourceDirectories = [];
        job.sourceFiles = [];
        if (source === this.root) throw Error("共有フォルダ内の対象フォルダを選択してください");
        const name = DesktopFolderName.parse(basename(source));
        const entries: DesktopFolderManifest = [],
          checks: Array<() => Promise<void>> = [];
        let bytes = 0;
        const walk = async (path: string, prefix: string) => {
          await guard();
          job.sourceDirectories!.push(await directorySnapshot(source, path, true));
          const before = await lstat(path),
            check = await directoryGuard(path);
          checks.push(async () => {
            await check();
            const now = await lstat(path);
            if (now.mtimeMs !== before.mtimeMs || now.ctimeMs !== before.ctimeMs)
              throw Error("取得中にフォルダの内容が変更されました");
          });
          const dir = await opendir(path);
          for await (const entry of dir) {
            await guard();
            this.touch(job);
            const rel = DesktopFolderPath.parse(prefix ? prefix + "/" + entry.name : entry.name),
              file = join(path, entry.name),
              st = await lstat(file);
            if (
              st.isSymbolicLink() ||
              (!st.isDirectory() && !st.isFile()) ||
              (st.isFile() && st.nlink !== 1)
            )
              throw Error("リンクや通常でないファイルを含むフォルダは取得できません");
            if (entries.length >= DESKTOP_FOLDER_MAX_ENTRIES)
              throw Error("フォルダは1000項目までです");
            if (st.isDirectory()) {
              entries.push({ path: rel, directory: true });
              await walk(await canonicalFolder(file), rel);
            } else {
              checks.push(async () => {
                const now = await lstat(file);
                if (
                  !now.isFile() ||
                  now.isSymbolicLink() ||
                  now.nlink !== 1 ||
                  now.dev !== st.dev ||
                  now.ino !== st.ino ||
                  now.size !== st.size ||
                  now.mtimeMs !== st.mtimeMs ||
                  now.ctimeMs !== st.ctimeMs
                )
                  throw Error("取得中にファイルの内容が変更されました");
              });
              bytes += st.size;
              if (bytes > DESKTOP_FOLDER_MAX_BYTES) throw Error("フォルダは合計100MiBまでです");
              entries.push({ path: rel, directory: false, bytes: st.size });
            }
          }
        };
        await walk(source, "");
        DesktopFolderManifest.parse(entries);
        for (const check of checks) await check();
        await guard();
        job.scratch = await realpath(
          await mkdtemp(
            join(this.scratchRoot ?? tmpdir(), this.scratchRoot ? ".folder-" : "soda-folder-"),
          ),
        );
        job.scratchCheck = await directoryGuard(job.scratch);
        job.archive = join(job.scratch, "folder.zip");
        job.fd = await open(job.archive, "wx+", 0o600);
        const output: Uint8Array[] = [],
          hash = createHash("sha256");
        let size = 0;
        const zip = new Zip((err, data) => {
          if (err) throw err;
          output.push(data);
        });
        const flush = async () => {
          for (const chunk of output.splice(0)) {
            await guard();
            this.touch(job);
            size += chunk.length;
            if (size > DESKTOP_FOLDER_MAX_BYTES) throw Error("ZIPは合計100MiBまでです");
            hash.update(chunk);
            await job.fd!.writeFile(chunk);
            await guard();
          }
        };
        const addDir = (path: string) => {
          const entry = new ZipPassThrough(path + "/");
          zip.add(entry);
          entry.push(new Uint8Array(), true);
        };
        addDir(name);
        await flush();
        for (const entry of entries) {
          await guard();
          if (entry.directory) {
            addDir(name + "/" + entry.path);
            await flush();
            continue;
          }
          const opened = await job.transfer.run(
            job.owner,
            source,
            { action: "read_start", path: entry.path },
            guard,
            false,
            fence,
          );
          if (opened.bytes !== entry.bytes) throw Error("取得元が変更されました");
          if (this.scratchRoot)
            job.sourceFiles!.push(await job.transfer.sourceSnapshot(job.owner, source, opened.id!));
          const stream = new ZipPassThrough(name + "/" + entry.path);
          zip.add(stream);
          let offset = 0;
          for (;;) {
            const r = await job.transfer.run(
              job.owner,
              source,
              { action: "read", id: opened.id!, offset },
              guard,
              false,
              fence,
            );
            offset = r.offset!;
            stream.push(Buffer.from(r.data!, "base64"), r.done);
            await flush();
            if (r.done) break;
          }
        }
        zip.end();
        await flush();
        for (const check of checks) await check();
        await guard();
        await job.fd.sync();
        await guard();
        job.bytes = size;
        job.sha256 = hash.digest("hex");
        job.snapshot = async () => {
          for (const check of checks) await check();
        };
        return result({ sha256: job.sha256 });
      }
      if (p.action === "folder_write" || p.action === "folder_file_finish") {
        if (!job.upload) throw Error("送信用フォルダではありません");
        const file = job.files.get(p.path);
        if (!file || file.done) throw Error("転送対象にないか、既に保存済みです");
        const parentKey = p.path.split("/").slice(0, -1).join("/");
        await job.dirs.get(parentKey)!();
        await guard();
        if (!file.stream) {
          const r = await job.transfer.run(
            job.owner,
            job.root!,
            { action: "write_start", path: p.path, bytes: file.bytes },
            guard,
            false,
            fence,
          );
          file.stream = r.id;
        }
        if (p.action === "folder_write") {
          const r = await job.transfer.run(
            job.owner,
            job.root!,
            { action: "write", id: file.stream!, offset: p.offset, data: p.data },
            guard,
            false,
            fence,
          );
          job.offset += r.offset! - file.offset;
          file.offset = r.offset!;
        } else {
          if (this.beforePublish) {
            file.sha256 = p.sha256;
            file.committing = true;
            await this.beforePublish(await this.checkpointNow(job));
            await guard();
          }
          await job.transfer.run(
            job.owner,
            job.root!,
            { action: "finish", id: file.stream!, sha256: p.sha256 },
            guard,
            false,
            fence,
          );
          if (this.resumable) {
            const target = join(job.root!, p.path),
              stat = await lstat(target);
            const previous = job.snapshot;
            job.snapshot = async () => {
              await previous?.();
              const now = await lstat(target);
              if (
                !now.isFile() ||
                now.isSymbolicLink() ||
                now.nlink !== 1 ||
                now.dev !== stat.dev ||
                now.ino !== stat.ino ||
                now.size !== stat.size ||
                now.mtimeMs !== stat.mtimeMs ||
                now.ctimeMs !== stat.ctimeMs
              )
                throw Error("保存済みファイルが変更されました");
            };
          }
          if (this.scratchRoot) {
            file.sha256 = p.sha256;
            file.source = await fileSnapshot(job.root!, p.path);
            file.committing = false;
          }
          file.done = true;
          file.stream = undefined;
          job.done++;
        }
        await guard();
        return result();
      }
      if (p.action === "folder_read") {
        if (job.upload || !job.fd || p.offset !== job.offset)
          throw Error("受信の転送位置が一致しません");
        const data = await readRange(job.fd, job.offset, Math.min(65536, job.bytes - job.offset));
        await guard();
        job.offset += data.length;
        const done = job.offset === job.bytes,
          r = result({ data: data.toString("base64"), done, sha256: job.sha256! });
        if (done) {
          await job.snapshot?.();
          if (!this.resumable) await this.cleanup(job, true);
        }
        return r;
      }
      if (p.action === "folder_finish") {
        if (!job.upload || [...job.files.values()].some((f) => !f.done))
          throw Error("未完了のファイルがあります");
        for (const check of job.dirs.values()) await check();
        await guard();
        const r = result({ done: true, destination: job.root! });
        if (this.resumable) job.completed = r;
        else await this.cleanup(job, true);
        return r;
      }
      if (p.action === "folder_abort") {
        await this.cleanup(job);
        return {};
      }
      // Keep each open partial file alive while paused; the group's idle TTL is finite.
      for (const file of job.files.values())
        if (file.stream)
          await job.transfer.run(
            job.owner,
            job.root!,
            { action: "status", id: file.stream },
            guard,
            false,
            fence,
          );
      return result();
    } catch (e) {
      if (!(this.resumable && e instanceof FileTransferInterrupted)) await this.cleanup(job);
      throw e;
    }
  }
}
