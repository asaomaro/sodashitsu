import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { RpcError } from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";

export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function folderIdentity(root: string): Promise<string> {
  const st = await lstat(root);
  return digest(JSON.stringify([st.dev, st.ino, st.birthtimeMs]));
}
export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
export async function textFile(file: string, limit = 262144): Promise<string> {
  const checkParent = await directoryGuard(dirname(file));
  const before = await lstat(file), canonical = await realpath(file);
  if (before.isSymbolicLink() || !before.isFile()) throw new RpcError("invalid_params", "リンクや通常でないファイルは読み込めません");
  const opened = await openVerified(file);
  if (!opened) throw new RpcError("invalid_params", "通常のファイルだけを読み込めます");
  try {
    await checkParent();
    const after = await lstat(file);
    if (after.isSymbolicLink() || before.dev !== opened.st.dev || before.ino !== opened.st.ino || after.dev !== opened.st.dev || after.ino !== opened.st.ino || (await realpath(file)) !== canonical)
      throw new RpcError("invalid_params", "ファイルの場所が変更されました");
    if (opened.st.size > limit) throw new RpcError("invalid_params", "ファイルの読み込み上限を超えています");
    const bytes = await readRange(opened.fd, 0, limit + 1);
    await checkParent();
    if (bytes.length > limit || bytes.includes(0)) throw new RpcError("invalid_params", "テキストの読み込み上限を超えています");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { await opened.fd.close(); }
}
export async function directoryGuard(dir: string): Promise<() => Promise<void>> {
  const original = await lstat(dir);
  const check = async () => {
    const now = await lstat(dir);
    if (!now.isDirectory() || now.isSymbolicLink() || now.dev !== original.dev || now.ino !== original.ino || (await realpath(dir)) !== dir)
      throw new RpcError("invalid_params", "保存先の実体が変更されました");
  };
  await check(); return check;
}
/** Create only server-chosen descendants; never follow a directory symlink. */
export async function privateDirs(root: string, parts: readonly string[]): Promise<string> {
  let dir = await realpath(root);
  for (const part of parts) {
    if (!/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === "..") throw new Error("invalid private directory");
    dir = join(dir, part);
    await mkdir(dir, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; });
    const st = await lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink() || (await realpath(dir)) !== dir)
      throw new RpcError("invalid_params", "保存先がリンクに置き換えられています");
  }
  return dir;
}
export async function createExclusive(file: string, content: string): Promise<void> {
  const check = await directoryGuard(dirname(file));
  await check();
  const fd = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  let written = false;
  try { await check(); await fd.writeFile(content, "utf8"); await check(); written = true; }
  finally { await fd.close(); if (!written) await check().then(() => unlink(file)).catch(() => {}); }
}
