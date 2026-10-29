import { constants } from "node:fs";
import { z } from "zod";
import { lstat, realpath, open, link, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash, randomUUID, type Hash } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  RpcError,
  WORK_FILE_CHUNK_BYTES,
  WORK_FILE_MAX_BYTES,
  type WorkFileRequest,
  type WorkFileResult,
} from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";
import { directoryGuard, folderIdentity, inside } from "./files.js";

const Identity = z
  .string()
  .regex(/^\d+:\d+:\d+$/)
  .max(128);
export const FileTransferSnapshot = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    path: z.string().min(1).max(4096),
    temporary: z.string().regex(/^\.soda-transfer-[a-f0-9-]{36}$/),
    rootIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    parentIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    fileIdentity: Identity,
    bytes: z.number().int().min(0).max(WORK_FILE_MAX_BYTES),
    offset: z.number().int().min(0).max(WORK_FILE_MAX_BYTES),
    prefixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine((s) => s.offset <= s.bytes && s.temporary === `.soda-transfer-${s.id}`);
export type FileTransferSnapshot = z.infer<typeof FileTransferSnapshot>;
const identity = (s: { dev: bigint; ino: bigint; birthtimeNs: bigint }) =>
  `${s.dev}:${s.ino}:${s.birthtimeNs}`;
async function snapshotPaths(root: string, raw: FileTransferSnapshot) {
  const s = FileTransferSnapshot.parse(raw);
  if (/^(?:[\\/]|[A-Za-z]:)/.test(s.path) || s.path.split(/[\\/]/).includes(".."))
    throw Error("保存された転送先が不正です");
  const path = resolve(root, s.path),
    parent = await realpath(dirname(path));
  if (
    parent !== dirname(path) ||
    !inside(root, parent) ||
    (await realpath(root)) !== root ||
    (await folderIdentity(root)) !== s.rootIdentity ||
    (await folderIdentity(parent)) !== s.parentIdentity
  )
    throw Error("再開先の実体が変更されました");
  const check = await directoryGuard(parent);
  return { s, path, parent, temporary: join(parent, s.temporary), check };
}
export const FileTransferSourceSnapshot = z
  .object({
    version: z.literal(1),
    path: z.string().min(1).max(4096),
    rootIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    parentIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    fileIdentity: Identity,
    bytes: z.number().int().min(0).max(WORK_FILE_MAX_BYTES),
    mtimeNs: z.string().regex(/^\d+$/).max(32),
    ctimeNs: z.string().regex(/^\d+$/).max(32),
  })
  .strict();
export type FileTransferSourceSnapshot = z.infer<typeof FileTransferSourceSnapshot>;
type Entry = {
  owner: string;
  root: string;
  path: string;
  temporary?: string;
  fd: FileHandle;
  bytes: number;
  offset: number;
  hash: Hash;
  check: () => Promise<void>;
  timer: ReturnType<typeof setTimeout>;
};
/** Internal checkpoint suspension: authority ended before IO; keep the unpublished stream. */
export class FileTransferInterrupted extends Error {}
/** Bounded binary streams. Only a verified, complete file is published, without replacing an existing destination. */
export class FileTransfer {
  constructor(private readonly retainInterrupted = false) {}
  private entries = new Map<string, Entry>();
  private expiryPaused = false;
  pauseExpiry() {
    this.expiryPaused = true;
    for (const e of this.entries.values()) clearTimeout(e.timer);
  }
  private queue: Promise<unknown> = Promise.resolve();
  run(
    owner: string,
    root: string,
    request: WorkFileRequest,
    guard: () => Promise<void> = async () => {},
    local = false,
    fence: () => void = () => {},
  ): Promise<WorkFileResult> {
    const next = this.queue.then(() => this.perform(owner, root, request, guard, local, fence));
    this.queue = next.catch(() => {});
    return next;
  }
  private async drop(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    clearTimeout(e.timer);
    const original = e.temporary
      ? await e.fd.stat({ bigint: true }).catch(() => undefined)
      : undefined;
    await e.fd.close().catch(() => {});
    if (e.temporary && original)
      await e
        .check()
        .then(async () => {
          const named = await lstat(e.temporary!, { bigint: true });
          if (named.isFile() && !named.isSymbolicLink() && identity(named) === identity(original))
            await unlink(e.temporary!);
        })
        .catch(() => {});
  }
  async close() {
    await this.queue;
    for (const id of this.entries.keys()) await this.drop(id);
  }
  /** Durably acknowledge only the exact unpublished file owned by this stream. */
  checkpoint(owner: string, root: string, id: string): Promise<FileTransferSnapshot> {
    const result = this.queue.then(async () => {
      const e = this.entries.get(id);
      if (!e || e.owner !== owner || e.root !== root || !e.temporary)
        throw Error("保存対象の転送がありません");
      await e.check();
      await e.fd.sync();
      const st = await e.fd.stat({ bigint: true }),
        named = await lstat(e.temporary, { bigint: true });
      if (
        !st.isFile() ||
        !named.isFile() ||
        named.isSymbolicLink() ||
        st.nlink !== 1n ||
        named.nlink !== 1n ||
        identity(st) !== identity(named) ||
        st.size !== BigInt(e.offset)
      )
        throw Error("転送用ファイルが変更されました");
      return FileTransferSnapshot.parse({
        version: 1,
        id,
        path: relative(root, e.path),
        temporary: basename(e.temporary),
        rootIdentity: await folderIdentity(root),
        parentIdentity: await folderIdentity(dirname(e.path)),
        fileIdentity: identity(st),
        bytes: e.bytes,
        offset: e.offset,
        prefixSha256: e.hash.copy().digest("hex"),
      });
    });
    this.queue = result.catch(() => {});
    return result;
  }
  sourceSnapshot(owner: string, root: string, id: string): Promise<FileTransferSourceSnapshot> {
    const result = this.queue.then(async () => {
      const e = this.entries.get(id);
      if (!e || e.owner !== owner || e.root !== root || e.temporary)
        throw Error("再開対象の取得元がありません");
      await e.check();
      const st = await e.fd.stat({ bigint: true }),
        named = await lstat(e.path, { bigint: true });
      if (
        !st.isFile() ||
        !named.isFile() ||
        named.isSymbolicLink() ||
        st.nlink !== 1n ||
        named.nlink !== 1n ||
        identity(st) !== identity(named)
      )
        throw Error("取得元の実体が変更されました");
      const value = FileTransferSourceSnapshot.parse({
        version: 1,
        path: relative(root, e.path),
        rootIdentity: await folderIdentity(root),
        parentIdentity: await folderIdentity(dirname(e.path)),
        fileIdentity: identity(st),
        bytes: e.bytes,
        mtimeNs: st.mtimeNs.toString(),
        ctimeNs: st.ctimeNs.toString(),
      });
      await e.check();
      return value;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  /** Close descriptors without unlinking a previously persisted unpublished file. */
  suspend(): Promise<void> {
    const result = this.queue.then(async () => {
      const results = await Promise.allSettled(
        [...this.entries].map(async ([id, e]) => {
          this.entries.delete(id);
          clearTimeout(e.timer);
          await e.fd.close();
        }),
      );
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed.length)
        throw new AggregateError(
          failed.map((r) => r.reason),
          "Transfer descriptor shutdown failed",
        );
    });
    this.queue = result.catch(() => {});
    return result;
  }
  restore(
    owner: string,
    root: string,
    raw: FileTransferSnapshot,
    guard: () => Promise<void>,
    fence: () => void,
  ): Promise<WorkFileResult> {
    const result = this.queue.then(async () => {
      if (this.entries.size >= 40) throw Error("転送の上限です");
      const { s, path, temporary, check } = await snapshotPaths(root, raw);
      if (this.entries.has(s.id)) throw Error("復元済みの転送です");
      await guard();
      const before = await lstat(temporary, { bigint: true });
      if (
        !before.isFile() ||
        before.isSymbolicLink() ||
        before.nlink !== 1n ||
        identity(before) !== s.fileIdentity
      )
        throw Error("保存された転送ファイルが変更されました");
      const fd = await open(
        temporary,
        constants.O_RDWR |
          (process.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK),
      );
      let adopted = false;
      try {
        const hash = createHash("sha256"),
          st = await fd.stat({ bigint: true });
        if (
          !st.isFile() ||
          st.nlink !== 1n ||
          identity(st) !== s.fileIdentity ||
          st.size < BigInt(s.offset) ||
          st.size > BigInt(s.bytes)
        )
          throw Error("保存済み転送の位置が不正です");
        for (let at = 0; at < s.offset; at += WORK_FILE_CHUNK_BYTES) {
          await guard();
          const data = await readRange(fd, at, Math.min(WORK_FILE_CHUNK_BYTES, s.offset - at));
          if (data.length !== Math.min(WORK_FILE_CHUNK_BYTES, s.offset - at))
            throw Error("保存済み転送が短くなりました");
          hash.update(data);
        }
        if (hash.copy().digest("hex") !== s.prefixSha256)
          throw Error("保存済み転送のSHA-256が一致しません");
        await snapshotPaths(root, s);
        await check();
        await guard();
        const current = await lstat(temporary, { bigint: true }),
          actual = await fd.stat({ bigint: true });
        if (
          current.isSymbolicLink() ||
          !current.isFile() ||
          current.nlink !== 1n ||
          actual.nlink !== 1n ||
          identity(current) !== s.fileIdentity ||
          identity(actual) !== s.fileIdentity ||
          actual.size !== st.size ||
          actual.mtimeNs !== st.mtimeNs ||
          actual.ctimeNs !== st.ctimeNs
        )
          throw Error("復元中に転送ファイルが変更されました");
        fence();
        await fd.truncate(s.offset);
        await fd.sync();
        await check();
        await guard();
        fence();
        const timer = setTimeout(() => {
          if (!this.expiryPaused)
            void this.run(owner, root, { action: "abort", id: s.id }).catch(() => {});
        }, 60000);
        timer.unref();
        this.entries.set(s.id, {
          owner,
          root,
          path,
          temporary,
          fd,
          bytes: s.bytes,
          offset: s.offset,
          hash,
          check,
          timer,
        });
        adopted = true;
        return { id: s.id, bytes: s.bytes, offset: s.offset };
      } finally {
        if (!adopted) await fd.close();
      }
    });
    this.queue = result.catch(() => {});
    return result;
  }
  /** Reconcile a durable finish intent after link/unlink but before receipt ACK.
   * A matching name/hash alone is insufficient: the original inode must match. */
  static async published(
    root: string,
    raw: FileTransferSnapshot,
    sha256: string,
    guard: () => Promise<void>,
    fence: () => void,
  ): Promise<WorkFileResult | undefined> {
    const { s, path, temporary, check } = await snapshotPaths(root, raw);
    if (s.offset !== s.bytes || s.prefixSha256 !== sha256)
      throw Error("完了記録のSHA-256が不正です");
    let named;
    try {
      named = await lstat(path, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (
      !named.isFile() ||
      named.isSymbolicLink() ||
      identity(named) !== s.fileIdentity ||
      named.size !== BigInt(s.bytes) ||
      named.nlink < 1n ||
      named.nlink > 2n
    )
      throw Error("保存先の実体が変更されました");
    if (named.nlink === 2n) {
      const temp = await lstat(temporary, { bigint: true });
      if (temp.isSymbolicLink() || !temp.isFile() || identity(temp) !== s.fileIdentity)
        throw Error("保存先のリンクが変更されました");
    }
    const fd = await open(
      path,
      constants.O_RDONLY |
        (process.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK),
    );
    try {
      const st = await fd.stat({ bigint: true });
      if (
        !st.isFile() ||
        st.nlink < 1n ||
        st.nlink > 2n ||
        identity(st) !== s.fileIdentity ||
        st.size !== BigInt(s.bytes)
      )
        throw Error("保存先が変更されました");
      const hash = createHash("sha256");
      for (let at = 0; at < s.bytes; at += WORK_FILE_CHUNK_BYTES) {
        await guard();
        const data = await readRange(fd, at, Math.min(WORK_FILE_CHUNK_BYTES, s.bytes - at));
        if (data.length !== Math.min(WORK_FILE_CHUNK_BYTES, s.bytes - at))
          throw Error("保存先が短くなりました");
        hash.update(data);
      }
      if (hash.digest("hex") !== sha256) throw Error("保存先のSHA-256が一致しません");
      await snapshotPaths(root, s);
      await check();
      await guard();
      const after = await fd.stat({ bigint: true }),
        final = await lstat(path, { bigint: true });
      if (
        identity(final) !== s.fileIdentity ||
        final.isSymbolicLink() ||
        after.size !== st.size ||
        after.mtimeNs !== st.mtimeNs ||
        after.ctimeNs !== st.ctimeNs
      )
        throw Error("完了確認中に保存先が変更されました");
      fence();
      if (after.nlink === 2n) {
        const temp = await lstat(temporary, { bigint: true });
        if (
          temp.isSymbolicLink() ||
          !temp.isFile() ||
          identity(temp) !== s.fileIdentity ||
          temp.nlink !== 2n
        )
          throw Error("完了確認中に一時ファイルが変更されました");
        await check();
        await guard();
        fence();
        await unlink(temporary);
        const clean = await fd.stat({ bigint: true });
        if (clean.nlink !== 1n) throw Error("保存先の一時リンクを解放できません");
      }
      return { destination: path, bytes: s.bytes, sha256 };
    } finally {
      await fd.close();
    }
  }
  /** Cleanup only a sealed record's original generated temporary identity. */
  static async discard(root: string, raw: FileTransferSnapshot): Promise<void> {
    const { s, temporary, check } = await snapshotPaths(root, raw);
    let st;
    try {
      st = await lstat(temporary, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (
      !st.isFile() ||
      st.isSymbolicLink() ||
      identity(st) !== s.fileIdentity ||
      st.nlink < 1n ||
      st.nlink > 2n
    )
      throw Error("一時ファイルの実体が変更されました");
    await check();
    const current = await lstat(temporary, { bigint: true });
    if (current.isSymbolicLink() || identity(current) !== s.fileIdentity)
      throw Error("一時ファイルが変更されました");
    await unlink(temporary);
  }
  private async perform(
    owner: string,
    root: string,
    p: WorkFileRequest,
    guard: () => Promise<void>,
    local: boolean,
    fence: () => void,
  ): Promise<WorkFileResult> {
    await guard();
    fence();
    if (p.action === "check") return {};
    if (p.action === "read_start" || p.action === "write_start") {
      if (this.entries.size >= 40) throw new RpcError("server_busy", "転送の上限です");
      if (!local && (/^(?:[\\/]|[A-Za-z]:)/.test(p.path) || p.path.split(/[\\/]/).includes("..")))
        throw new RpcError("invalid_params", "接続先PJ内の相対パスを指定してください");
      const path = resolve(root, p.path),
        parent = await realpath(dirname(path));
      if ((!local && !inside(root, parent)) || parent !== dirname(path))
        throw new RpcError("invalid_params", "リンクを経由する転送はできません");
      const check = await directoryGuard(parent),
        id = randomUUID();
      let fd: FileHandle | undefined, temporary: string | undefined;
      try {
        let bytes: number;
        if (p.action === "read_start") {
          const before = await lstat(path);
          if (before.isSymbolicLink())
            throw new RpcError("invalid_params", "リンクは転送できません");
          const opened = await openVerified(path);
          if (!opened) throw new RpcError("invalid_params", "通常のファイルだけ転送できます");
          fd = opened.fd;
          bytes = opened.st.size;
          if (
            before.dev !== opened.st.dev ||
            before.ino !== opened.st.ino ||
            bytes > WORK_FILE_MAX_BYTES
          )
            throw new RpcError("invalid_params", "転送元が変わったか、100MiBを超えています");
          const original = opened.st,
            parentCheck = check;
          const sourceCheck = async () => {
            await parentCheck();
            const st = await fd!.stat(),
              named = await lstat(path);
            if (
              st.size !== original.size ||
              st.mtimeMs !== original.mtimeMs ||
              st.ctimeMs !== original.ctimeMs ||
              named.isSymbolicLink() ||
              named.dev !== original.dev ||
              named.ino !== original.ino
            )
              throw new RpcError("invalid_params", "転送中に元ファイルが変更されました");
          };
          await sourceCheck();
          await guard();
          const timer = setTimeout(() => {
            if (!this.expiryPaused)
              void this.run(owner, root, { action: "abort", id }).catch(() => {});
          }, 60000);
          timer.unref();
          this.entries.set(id, {
            owner,
            root,
            path,
            fd,
            bytes,
            offset: 0,
            hash: createHash("sha256"),
            check: sourceCheck,
            timer,
          });
        } else {
          // Early feedback only; link() at commit is the atomic no-overwrite check.
          try {
            await lstat(path);
            throw new RpcError(
              "invalid_params",
              "保存先が既に存在します。別の名前を指定してください",
            );
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
          bytes = p.bytes;
          temporary = join(parent, `.soda-transfer-${id}`);
          fd = await open(
            temporary,
            constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
            0o600,
          );
          await check();
          await guard();
          const timer = setTimeout(() => {
            if (!this.expiryPaused)
              void this.run(owner, root, { action: "abort", id }).catch(() => {});
          }, 60000);
          timer.unref();
          this.entries.set(id, {
            owner,
            root,
            path,
            temporary,
            fd,
            bytes,
            offset: 0,
            hash: createHash("sha256"),
            check,
            timer,
          });
        }
        return { id, bytes };
      } catch (e) {
        await fd?.close().catch(() => {});
        if (temporary)
          await check()
            .then(() => unlink(temporary!))
            .catch(() => {});
        throw e;
      }
    }
    const e = this.entries.get(p.id);
    if (!e || e.owner !== owner || e.root !== root)
      throw new RpcError("not_found", "転送が終了したか、接続が変わりました");
    if (p.action === "abort") {
      await this.drop(p.id);
      return {};
    }
    try {
      e.timer.refresh();
      await e.check();
      await guard();
      if (p.action === "status") return { bytes: e.bytes, offset: e.offset };
      if (p.action === "finish") {
        if (!e.temporary || e.offset !== e.bytes || e.hash.copy().digest("hex") !== p.sha256)
          throw new RpcError("invalid_params", "転送サイズまたはSHA-256が一致しません");
        await e.fd.sync();
        await e.check();
        await guard();
        const original = await e.fd.stat(),
          named = await lstat(e.temporary);
        if (
          !named.isFile() ||
          named.isSymbolicLink() ||
          named.nlink !== 1 ||
          named.dev !== original.dev ||
          named.ino !== original.ino ||
          original.size !== e.bytes
        )
          throw new RpcError("invalid_params", "転送用ファイルが変更されました");
        const actual = createHash("sha256");
        for (let offset = 0; offset < e.bytes; offset += WORK_FILE_CHUNK_BYTES)
          actual.update(
            await readRange(e.fd, offset, Math.min(WORK_FILE_CHUNK_BYTES, e.bytes - offset)),
          );
        if (actual.digest("hex") !== p.sha256)
          throw new RpcError("invalid_params", "保存前のSHA-256が一致しません");
        await e.check();
        await guard();
        const current = await lstat(e.temporary),
          final = await e.fd.stat();
        if (
          !current.isFile() ||
          current.isSymbolicLink() ||
          current.nlink !== 1 ||
          current.dev !== original.dev ||
          current.ino !== original.ino ||
          final.size !== original.size ||
          final.mtimeMs !== original.mtimeMs ||
          final.ctimeMs !== original.ctimeMs
        )
          throw new RpcError("invalid_params", "保存前にファイルが変更されました");
        fence(); // No await between the final authority check and OS publication.
        await link(e.temporary, e.path); // Never overwrite, including a concurrent destination or symlink.
        const published = await lstat(e.path);
        if (
          !published.isFile() ||
          published.isSymbolicLink() ||
          published.dev !== original.dev ||
          published.ino !== original.ino
        )
          throw new RpcError("invalid_params", "保存先が変更されました");
        const result = { destination: e.path, bytes: e.bytes, sha256: p.sha256 };
        await this.drop(p.id);
        return result;
      }
      if (p.offset !== e.offset) throw new RpcError("invalid_params", "転送位置が一致しません");
      if (p.action === "read") {
        if (e.temporary) throw new RpcError("invalid_params", "読み取り転送ではありません");
        const data = await readRange(
          e.fd,
          e.offset,
          Math.min(WORK_FILE_CHUNK_BYTES, e.bytes - e.offset),
        );
        if (!data.length && e.offset < e.bytes)
          throw new RpcError("invalid_params", "転送元が短くなりました");
        await e.check();
        await guard();
        e.hash.update(data);
        e.offset += data.length;
        const done = e.offset === e.bytes;
        const result = {
          data: data.toString("base64"),
          offset: e.offset,
          done,
          ...(done ? { sha256: e.hash.digest("hex") } : {}),
        };
        if (done) await this.drop(p.id);
        return result;
      }
      if (!e.temporary) throw new RpcError("invalid_params", "書き込み転送ではありません");
      const data = Buffer.from(p.data, "base64");
      if (
        data.toString("base64") !== p.data ||
        data.length > WORK_FILE_CHUNK_BYTES ||
        !data.length ||
        e.offset + data.length > e.bytes
      )
        throw new RpcError("invalid_params", "転送データが不正です");
      let written = 0;
      while (written < data.length) {
        const part = await e.fd.write(data, written, data.length - written, e.offset + written);
        if (part.bytesWritten <= 0) throw Error("転送データを書き込めません");
        written += part.bytesWritten;
      }
      e.hash.update(data);
      e.offset += data.length;
      return { offset: e.offset };
    } catch (error) {
      if (!this.retainInterrupted || !(error instanceof FileTransferInterrupted))
        await this.drop(p.id);
      throw error;
    }
  }
}

export async function copyWorkFile(
  source: (p: WorkFileRequest) => Promise<WorkFileResult>,
  destination: (p: WorkFileRequest) => Promise<WorkFileResult>,
  sourcePath: string,
  destinationPath: string,
) {
  let readId: string | undefined, writeId: string | undefined;
  try {
    const from = await source({ action: "read_start", path: sourcePath });
    readId = from.id;
    if (!readId || from.bytes === undefined) throw Error("Invalid transfer source");
    const to = await destination({
      action: "write_start",
      path: destinationPath,
      bytes: from.bytes,
    });
    writeId = to.id;
    if (!writeId) throw Error("Invalid transfer destination");
    let offset = 0;
    for (;;) {
      const part = await source({ action: "read", id: readId, offset });
      const data = Buffer.from(part.data ?? "", "base64");
      if (
        data.toString("base64") !== part.data ||
        data.length > WORK_FILE_CHUNK_BYTES ||
        part.offset !== offset + data.length ||
        part.offset > from.bytes ||
        (!part.done && !data.length)
      )
        throw Error("Invalid transfer chunk");
      if (data.length) {
        const saved = await destination({ action: "write", id: writeId, offset, data: part.data! });
        if (saved.offset !== part.offset) throw Error("Invalid transfer offset");
      }
      offset = part.offset;
      if (part.done) {
        if (offset !== from.bytes || !part.sha256) throw Error("Incomplete transfer");
        return await destination({ action: "finish", id: writeId, sha256: part.sha256 });
      }
    }
  } finally {
    if (readId) await source({ action: "abort", id: readId }).catch(() => {});
    if (writeId) await destination({ action: "abort", id: writeId }).catch(() => {});
  }
}
