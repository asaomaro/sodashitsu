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
import { FileTransfer } from "../work/FileTransfer.js";
import { directoryGuard, inside } from "../work/files.js";
import { readRange } from "../agent/safeFile.js";
import { canonicalFolder } from "./desktopFilePaths.js";
type Result = NonNullable<DesktopFileResult["result"]>;
type FileState = { bytes: number; offset: number; done: boolean; stream?: string | undefined };
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
  archive?: string;
  fd?: FileHandle;
  sha256?: string;
};
/** A group owns its streams and empty directories, never completed/user files. */
export class DesktopFolders {
  private jobs = new Map<string, Job>();
  private seen = new Set<string>();
  private cancelled = new Set<string>();
  private dead = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  cancel(id: string): boolean {
    if (this.cancelled.size >= 4096) {
      this.dead = true;
      for (const job of this.jobs.values()) job.cancelled = true;
      void this.queue.then(async () => {
        for (const job of [...this.jobs.values()]) await this.cleanup(job);
      });
      return true;
    }
    this.cancelled.add(id);
    const j = this.jobs.get(id);
    if (!j) return true;
    j.cancelled = true;
    clearTimeout(j.timer);
    void this.queue.then(() => this.cleanup(j)).catch(() => {});
    return true;
  }
  cancelAll() {
    for (const j of this.jobs.values()) this.cancel(j.id);
  }
  async clear() {
    this.cancelAll();
    await this.queue;
    for (const j of [...this.jobs.values()]) await this.cleanup(j);
  }
  async close() {
    this.dead = true;
    await this.clear();
  }
  private fence(j: Job) {
    if (this.dead || this.jobs.get(j.id) !== j || j.cancelled || performance.now() >= j.expires)
      throw Error("フォルダ転送が終了しました");
  }
  private touch(j: Job) {
    j.expires = performance.now() + 60000;
    clearTimeout(j.timer);
    j.timer = setTimeout(() => this.cancel(j.id), 60000);
    j.timer.unref();
  }
  private async cleanup(j: Job, success = false) {
    if (this.jobs.get(j.id) !== j) return;
    this.jobs.delete(j.id);
    clearTimeout(j.timer);
    await j.transfer.close();
    await j.fd?.close().catch(() => {});
    if (j.archive) await unlink(j.archive).catch(() => {});
    if (j.scratch) await rmdir(j.scratch).catch(() => {});
    if (!success)
      for (const dir of [...j.created].reverse())
        await dir
          .check()
          .then(() => rmdir(dir.path))
          .catch(() => {});
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
        transfer: new FileTransfer(),
        owner: randomUUID(),
        cancelled: false,
        expires: performance.now() + 60000,
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
      ...extra,
    });
    try {
      await guard();
      this.touch(job);
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
        if (source === this.root) throw Error("共有フォルダ内の対象フォルダを選択してください");
        const name = DesktopFolderName.parse(basename(source));
        const entries: DesktopFolderManifest = [],
          checks: Array<() => Promise<void>> = [];
        let bytes = 0;
        const walk = async (path: string, prefix: string) => {
          await guard();
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
        job.scratch = await realpath(await mkdtemp(join(tmpdir(), "soda-folder-")));
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
          await job.transfer.run(
            job.owner,
            job.root!,
            { action: "finish", id: file.stream!, sha256: p.sha256 },
            guard,
            false,
            fence,
          );
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
        if (done) await this.cleanup(job, true);
        return r;
      }
      if (p.action === "folder_finish") {
        if (!job.upload || [...job.files.values()].some((f) => !f.done))
          throw Error("未完了のファイルがあります");
        for (const check of job.dirs.values()) await check();
        await guard();
        const r = result({ done: true, destination: job.root! });
        await this.cleanup(job, true);
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
      await this.cleanup(job);
      throw e;
    }
  }
}
