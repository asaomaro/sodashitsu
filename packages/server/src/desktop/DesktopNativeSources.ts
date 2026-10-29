import { createHash, randomUUID } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { openVerified, readRange } from "../agent/safeFile.js";
import { canonicalFolder } from "./desktopFilePaths.js";
import { inside } from "../work/files.js";

const MAX_BYTES = 100 * 1024 * 1024,
  MAX_ENTRIES = 1000,
  CHUNK = 65536;
export interface NativeSourceScope {
  owner: string;
  origin: string;
  gesture: string;
  generation: string;
}
export interface NativeSourceEntry {
  name: string;
  directory: boolean;
  bytes: number;
  sha256: string;
}
type Saved = {
  data?: Buffer;
  path: string;
  stamp: string;
  parents: ReadonlyArray<{ path: string; stamp: string }>;
  entry: NativeSourceEntry;
};
const stamp = (s: BigIntStats) =>
  `${s.dev}:${s.ino}:${s.birthtimeNs}:${s.mtimeNs}:${s.ctimeNs}:${s.size}:${s.nlink}`;
const directoryStamp = (s: BigIntStats) => `${s.dev}:${s.ino}:${s.birthtimeNs}`;
function name(value: string) {
  if (!value || value.length >= 260 || value.split("\\").length > 32)
    throw Error("ドラッグ転送の名前が上限を超えています");
  for (const part of value.split("\\"))
    if (
      !part ||
      /[\x00-\x1f\x7f-\x9f<>:"/|?*]/u.test(part) ||
      /[ .]$/.test(part) ||
      part === "." ||
      part === ".." ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part) ||
      /[\uD800-\uDFFF]/u.test(part)
    )
      throw Error("ドラッグ転送できないファイル名です");
}
const scopeKey = (s: NativeSourceScope) =>
  JSON.stringify([s.owner, s.origin, s.gesture, s.generation]);
function validateScope(s: NativeSourceScope) {
  for (const id of [s.owner, s.gesture, s.generation])
    if (
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) ||
      /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)
    )
      throw Error("ドラッグの識別子が不正です");
  const origin = new URL(s.origin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== s.origin)
    throw Error("ドラッグの接続元が不正です");
}
/** Internal B-side source lease. Paths come only from the trusted local Explorer adapter,
 * never from browser input. The host must supply the existing explicit file-grant fence.
 * No wire request or public API exposes this class until gesture/release authentication exists. */
export class DesktopNativeSources {
  readonly id = randomUUID();
  private dead = false;
  private active = false;
  private observed: number;
  private beatAt: number;
  private readonly born: number;
  private pending = 0;
  private requests = new Set<string>();
  private closing: Promise<void> | undefined;
  private waiters: Array<() => void> = [];
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private buffers = new Set<Buffer>();
  private constructor(
    private scope: string,
    private saved: Saved[],
    private authority: () => boolean,
    private clock: () => number,
  ) {
    this.born = this.observed = this.beatAt = clock();
    if (!Number.isFinite(this.born) || this.born < 0) throw Error("ドラッグの時計を確認できません");
    this.arm();
  }
  private arm() {
    clearTimeout(this.expiry);
    if (this.dead) return;
    const due = Math.min(
      this.born + 900000,
      this.beatAt + 5000,
      this.active ? Infinity : this.born + 1500,
    );
    this.expiry = setTimeout(
      () => {
        try {
          this.fence();
          this.arm();
        } catch {
          /* fence erased the expired snapshot */
        }
      },
      Math.max(1, due - this.observed),
    );
    this.expiry.unref();
  }
  private fence() {
    try {
      if (this.dead || !this.authority()) throw Error("ドラッグのファイル操作許可が終了しました");
      const now = this.clock();
      if (this.dead) throw Error("ドラッグは終了しました");
      if (
        !Number.isFinite(now) ||
        now < this.observed ||
        now - this.born >= 900000 ||
        now - this.beatAt >= 5000 ||
        (!this.active && now - this.born >= 1500)
      )
        throw Error("ドラッグの期限が終了しました");
      this.observed = now;
      return now;
    } catch (e) {
      this.cancel();
      throw e;
    }
  }
  static async create(
    root: string,
    paths: readonly string[],
    scope: NativeSourceScope,
    authority: () => boolean,
    clock: () => number = () => performance.now(),
  ) {
    validateScope(scope);
    if (paths.length === 0 || paths.length > MAX_ENTRIES || !authority())
      throw Error("ドラッグの選択を取得できません");
    const canonical = await canonicalFolder(root),
      saved: Saved[] = [],
      names = new Set<string>();
    let bytes = 0;
    const lease = new DesktopNativeSources(scopeKey(scope), saved, authority, clock);
    try {
      const visit = async (path: string, label: string): Promise<void> => {
        lease.fence();
        name(label);
        if (basename(path).includes("\\")) throw Error("転送できないファイル名です");
        const key = label.normalize("NFC").toUpperCase();
        if (names.has(key) || saved.length >= MAX_ENTRIES)
          throw Error("ドラッグの選択が重複しているか上限を超えています");
        names.add(key);
        const parents: Saved["parents"][number][] = [];
        let parent = dirname(path);
        for (;;) {
          if (!inside(canonical, parent)) throw Error("共有フォルダの外は転送できません");
          const st = await lstat(parent, { bigint: true });
          if (!st.isDirectory() || st.isSymbolicLink() || (await realpath(parent)) !== parent)
            throw Error("リンクを経由する転送はできません");
          parents.push({ path: parent, stamp: directoryStamp(st) });
          if (parent === canonical) break;
          parent = dirname(parent);
        }
        const st = await lstat(path, { bigint: true });
        if (
          st.isSymbolicLink() ||
          (await realpath(path)) !== path ||
          (!st.isDirectory() && (!st.isFile() || st.nlink !== 1n))
        )
          throw Error("通常のファイルとフォルダだけを転送できます");
        if (st.isDirectory()) {
          saved.push({
            path,
            stamp: directoryStamp(st),
            parents,
            entry: { name: label, directory: true, bytes: 0, sha256: "" },
          });
          // Bound enumeration before materializing an arbitrarily large directory.
          const dir = await opendir(path);
          try {
            for await (const child of dir) {
              lease.fence();
              await visit(join(path, child.name), label + "\\" + child.name);
            }
          } finally {
            await dir.close().catch(() => {});
          }
          await lease.verify(saved.find((s) => s.path === path)!);
        } else {
          const size = Number(st.size);
          if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES - bytes)
            throw Error("ドラッグ転送の容量上限を超えています");
          bytes += size;
          const file: Saved = {
            path,
            stamp: stamp(st),
            parents,
            entry: { name: label, directory: false, bytes: size, sha256: "" },
          };
          const opened = await openVerified(path);
          if (!opened) throw Error("ファイルを開けません");
          try {
            await lease.verify(file);
            if (stamp(await opened.fd.stat({ bigint: true })) !== file.stamp)
              throw Error("取得元の実体が変わりました");
            const hash = createHash("sha256"),
              snapshot = Buffer.alloc(size);
            file.data = snapshot;
            lease.buffers.add(snapshot);
            for (let at = 0; at < size; at += CHUNK) {
              lease.fence();
              const chunk = await readRange(opened.fd, at, Math.min(CHUNK, size - at));
              try {
                lease.fence();
                if (chunk.length !== Math.min(CHUNK, size - at))
                  throw Error("取得元が変わりました");
                hash.update(chunk);
                chunk.copy(snapshot, at);
              } finally {
                chunk.fill(0);
              }
            }
            await lease.verify(file);
            if (stamp(await opened.fd.stat({ bigint: true })) !== file.stamp)
              throw Error("取得元が変わりました");
            file.entry.sha256 = hash.digest("hex");
            saved.push(file);
          } catch (e) {
            file.data?.fill(0);
            throw e;
          } finally {
            await opened.fd.close();
          }
        }
      };
      for (const chosen of paths) {
        if (!isAbsolute(chosen) || chosen.length > 4096 || chosen.includes("\0"))
          throw Error("選択のパスが不正です");
        const path = resolve(chosen);
        if (
          path === canonical ||
          !inside(canonical, path) ||
          relative(canonical, path).split(sep).includes("..")
        )
          throw Error("共有フォルダ内を選択してください");
        await visit(path, basename(path));
      }
      lease.fence();
      return lease;
    } catch (e) {
      await lease.close();
      throw e;
    }
  }
  private async verify(file: Saved) {
    this.fence();
    for (const parent of file.parents) {
      const st = await lstat(parent.path, { bigint: true });
      if (
        !st.isDirectory() ||
        st.isSymbolicLink() ||
        directoryStamp(st) !== parent.stamp ||
        (await realpath(parent.path)) !== parent.path
      )
        throw Error("取得元のフォルダが変わりました");
    }
    const st = await lstat(file.path, { bigint: true });
    if (
      st.isSymbolicLink() ||
      (await realpath(file.path)) !== file.path ||
      (file.entry.directory
        ? !st.isDirectory() || directoryStamp(st) !== file.stamp
        : !st.isFile() || st.nlink !== 1n || stamp(st) !== file.stamp)
    )
      throw Error("取得元が変わりました");
    this.fence();
  }
  manifest(scope: NativeSourceScope): ReadonlyArray<NativeSourceEntry> {
    this.checkScope(scope);
    return this.saved.map((s) => ({ ...s.entry }));
  }
  activate(scope: NativeSourceScope) {
    this.checkScope(scope);
    if (this.active) throw Error("ドラッグは開始済みです");
    this.active = true;
    this.arm();
  }
  heartbeat(scope: NativeSourceScope) {
    this.checkScope(scope);
    this.beatAt = this.observed;
    this.arm();
  }
  private checkScope(scope: NativeSourceScope) {
    if (scopeKey(scope) !== this.scope) throw Error("別のドラッグには使えません");
    this.fence();
  }
  async read(
    scope: NativeSourceScope,
    request: string,
    index: number,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    this.checkScope(scope);
    if (
      !this.active ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(request) ||
      this.requests.has(request) ||
      this.requests.size >= 4096 ||
      this.pending >= 16 ||
      !Number.isInteger(index) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > CHUNK
    )
      throw Error("ドラッグの読み込み要求が不正です");
    const file = this.saved[index];
    if (
      !file ||
      file.entry.directory ||
      offset > file.entry.bytes ||
      length > file.entry.bytes - offset
    )
      throw Error("ドラッグの範囲が不正です");
    const started = this.observed;
    this.requests.add(request);
    this.pending++;
    let data: Buffer | undefined;
    try {
      await this.verify(file);
      if (!file.data) throw Error("取得元が終了しました");
      data = Buffer.from(file.data.subarray(offset, offset + length));
      await this.verify(file);
      if (this.fence() - started >= 5000) throw Error("ドラッグの読み込み期限が終了しました");
      return data;
    } catch (e) {
      data?.fill(0);
      this.cancel();
      throw e;
    } finally {
      if (--this.pending === 0) {
        for (const done of this.waiters.splice(0)) done();
      }
    }
  }
  private cancel() {
    this.dead = true;
    clearTimeout(this.expiry);
    for (const buffer of this.buffers) buffer.fill(0);
    this.buffers.clear();
    for (const file of this.saved) delete file.data;
  }
  close(): Promise<void> {
    this.cancel();
    return (this.closing ??= this.pending
      ? new Promise((resolve) => this.waiters.push(resolve))
      : Promise.resolve());
  }
}
