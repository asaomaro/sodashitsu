import { constants } from "node:fs";
import { lstat, realpath, open, link, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { createHash, randomUUID, type Hash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { RpcError, WORK_FILE_CHUNK_BYTES, WORK_FILE_MAX_BYTES, type WorkFileRequest, type WorkFileResult } from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";
import { directoryGuard, inside } from "./files.js";

type Entry = { owner: string; root: string; path: string; temporary?: string; fd: FileHandle; bytes: number; offset: number; hash: Hash; check: () => Promise<void>; timer: ReturnType<typeof setTimeout> };
/** Bounded binary streams. Only a verified, complete file is published, without replacing an existing destination. */
export class FileTransfer {
  private entries = new Map<string, Entry>();
  private queue: Promise<unknown> = Promise.resolve();
  run(owner: string, root: string, request: WorkFileRequest, guard: () => Promise<void> = async () => {}, local = false, fence:()=>void=()=>{}): Promise<WorkFileResult> {
    const next = this.queue.then(() => this.perform(owner, root, request, guard, local, fence));
    this.queue = next.catch(() => {}); return next;
  }
  private async drop(id: string) {
    const e = this.entries.get(id); if (!e) return;
    this.entries.delete(id); clearTimeout(e.timer);
    await e.fd.close().catch(() => {});
    if (e.temporary) await e.check().then(() => unlink(e.temporary!)).catch(() => {});
  }
  async close() { await this.queue; for (const id of this.entries.keys()) await this.drop(id); }
  private async perform(owner: string, root: string, p: WorkFileRequest, guard: () => Promise<void>, local: boolean, fence:()=>void): Promise<WorkFileResult> {
    await guard();fence();
    if (p.action === "check") return {};
    if (p.action === "read_start" || p.action === "write_start") {
      if (this.entries.size >= 40) throw new RpcError("server_busy", "転送の上限です");
      if (!local && (/^(?:[\\/]|[A-Za-z]:)/.test(p.path) || p.path.split(/[\\/]/).includes(".."))) throw new RpcError("invalid_params", "接続先PJ内の相対パスを指定してください");
      const path = resolve(root, p.path), parent = await realpath(dirname(path));
      if ((!local && !inside(root, parent)) || parent !== dirname(path)) throw new RpcError("invalid_params", "リンクを経由する転送はできません");
      const check = await directoryGuard(parent), id = randomUUID();
      let fd: FileHandle | undefined, temporary: string | undefined;
      try {
        let bytes: number;
        if (p.action === "read_start") {
          const before = await lstat(path);
          if (before.isSymbolicLink()) throw new RpcError("invalid_params", "リンクは転送できません");
          const opened = await openVerified(path);
          if (!opened) throw new RpcError("invalid_params", "通常のファイルだけ転送できます");
          fd = opened.fd; bytes = opened.st.size;
          if (before.dev !== opened.st.dev || before.ino !== opened.st.ino || bytes > WORK_FILE_MAX_BYTES) throw new RpcError("invalid_params", "転送元が変わったか、100MiBを超えています");
          const original = opened.st, parentCheck = check;
          const sourceCheck = async () => {
            await parentCheck(); const st = await fd!.stat(), named = await lstat(path);
            if (st.size !== original.size || st.mtimeMs !== original.mtimeMs || st.ctimeMs !== original.ctimeMs || named.isSymbolicLink() || named.dev !== original.dev || named.ino !== original.ino) throw new RpcError("invalid_params", "転送中に元ファイルが変更されました");
          };
          await sourceCheck(); await guard();
          const timer = setTimeout(() => void this.run(owner, root, { action: "abort", id }).catch(() => {}), 60000); timer.unref();
          this.entries.set(id, { owner, root, path, fd, bytes, offset: 0, hash: createHash("sha256"), check: sourceCheck, timer });
        } else {
          // Early feedback only; link() at commit is the atomic no-overwrite check.
          try { await lstat(path); throw new RpcError("invalid_params", "保存先が既に存在します。別の名前を指定してください"); }
          catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
          bytes = p.bytes; temporary = join(parent, `.soda-transfer-${id}`);
          fd = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600);
          await check(); await guard();
          const timer = setTimeout(() => void this.run(owner, root, { action: "abort", id }).catch(() => {}), 60000); timer.unref();
          this.entries.set(id, { owner, root, path, temporary, fd, bytes, offset: 0, hash: createHash("sha256"), check, timer });
        }
        return { id, bytes };
      } catch (e) { await fd?.close().catch(() => {}); if (temporary) await check().then(() => unlink(temporary!)).catch(() => {}); throw e; }
    }
    const e = this.entries.get(p.id);
    if (!e || e.owner !== owner || e.root !== root) throw new RpcError("not_found", "転送が終了したか、接続が変わりました");
    if (p.action === "abort") { await this.drop(p.id); return {}; }
    try {
      e.timer.refresh(); await e.check(); await guard();
      if (p.action === "status") return {bytes:e.bytes,offset:e.offset};
      if (p.action === "finish") {
        if (!e.temporary || e.offset !== e.bytes || e.hash.digest("hex") !== p.sha256) throw new RpcError("invalid_params", "転送サイズまたはSHA-256が一致しません");
        await e.fd.sync(); await e.check(); await guard();
        const original = await e.fd.stat(), named = await lstat(e.temporary);
        if (!named.isFile() || named.isSymbolicLink() || named.nlink !== 1 || named.dev !== original.dev || named.ino !== original.ino || original.size !== e.bytes) throw new RpcError("invalid_params", "転送用ファイルが変更されました");
        const actual = createHash("sha256");
        for (let offset = 0; offset < e.bytes; offset += WORK_FILE_CHUNK_BYTES) actual.update(await readRange(e.fd, offset, Math.min(WORK_FILE_CHUNK_BYTES, e.bytes - offset)));
        if (actual.digest("hex") !== p.sha256) throw new RpcError("invalid_params", "保存前のSHA-256が一致しません");
        await e.check(); await guard();
        const current = await lstat(e.temporary), final = await e.fd.stat();
        if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || current.dev !== original.dev || current.ino !== original.ino || final.size !== original.size || final.mtimeMs !== original.mtimeMs || final.ctimeMs !== original.ctimeMs) throw new RpcError("invalid_params", "保存前にファイルが変更されました");
        fence(); // No await between the final authority check and OS publication.
        await link(e.temporary, e.path); // Never overwrite, including a concurrent destination or symlink.
        const published = await lstat(e.path);
        if (!published.isFile() || published.isSymbolicLink() || published.dev !== original.dev || published.ino !== original.ino) throw new RpcError("invalid_params", "保存先が変更されました");
        const result = { destination: e.path, bytes: e.bytes, sha256: p.sha256 };
        await this.drop(p.id); return result;
      }
      if (p.offset !== e.offset) throw new RpcError("invalid_params", "転送位置が一致しません");
      if (p.action === "read") {
        if (e.temporary) throw new RpcError("invalid_params", "読み取り転送ではありません");
        const data = await readRange(e.fd, e.offset, Math.min(WORK_FILE_CHUNK_BYTES, e.bytes - e.offset));
        if (!data.length && e.offset < e.bytes) throw new RpcError("invalid_params", "転送元が短くなりました");
        await e.check(); await guard(); e.hash.update(data); e.offset += data.length;
        const done = e.offset === e.bytes;
        const result = { data: data.toString("base64"), offset: e.offset, done, ...(done ? { sha256: e.hash.digest("hex") } : {}) };
        if (done) await this.drop(p.id); return result;
      }
      if (!e.temporary) throw new RpcError("invalid_params", "書き込み転送ではありません");
      const data = Buffer.from(p.data, "base64");
      if (data.toString("base64") !== p.data || data.length > WORK_FILE_CHUNK_BYTES || !data.length || e.offset + data.length > e.bytes) throw new RpcError("invalid_params", "転送データが不正です");
      await e.fd.writeFile(data); e.hash.update(data); e.offset += data.length;
      return { offset: e.offset };
    } catch (error) { await this.drop(p.id); throw error; }
  }
}

export async function copyWorkFile(source: (p: WorkFileRequest) => Promise<WorkFileResult>, destination: (p: WorkFileRequest) => Promise<WorkFileResult>, sourcePath: string, destinationPath: string) {
  let readId: string | undefined, writeId: string | undefined;
  try {
    const from = await source({ action: "read_start", path: sourcePath }); readId = from.id;
    if (!readId || from.bytes === undefined) throw Error("Invalid transfer source");
    const to = await destination({ action: "write_start", path: destinationPath, bytes: from.bytes }); writeId = to.id;
    if (!writeId) throw Error("Invalid transfer destination");
    let offset = 0;
    for (;;) {
      const part = await source({ action: "read", id: readId, offset });
      const data = Buffer.from(part.data ?? "", "base64");
      if (data.toString("base64") !== part.data || data.length > WORK_FILE_CHUNK_BYTES || part.offset !== offset + data.length || part.offset > from.bytes || (!part.done && !data.length)) throw Error("Invalid transfer chunk");
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
