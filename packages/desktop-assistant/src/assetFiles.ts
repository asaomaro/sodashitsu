import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
export async function assetDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("通常の素材フォルダを選んでください。");
}
export async function readAssetJson(
  path: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 1024 * 1024)
    throw Error("素材の一覧を読み込めません。");
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size !== before.size ||
      stat.ino !== before.ino ||
      stat.dev !== before.dev
    )
      throw Error("素材の一覧が変更されました。");
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      signal.throwIfAborted();
      const read = await file.read(bytes, used, bytes.length - used, null);
      if (!read.bytesRead) break;
      used += read.bytesRead;
    }
    const after = await file.stat();
    signal.throwIfAborted();
    if (
      used !== stat.size ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw Error("素材の一覧が変更されました。");
    const value: unknown = JSON.parse(bytes.subarray(0, used).toString("utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length > 256
    )
      throw Error("素材の一覧の形式を確認してください。");
    return value as Record<string, unknown>;
  } finally {
    await file.close();
  }
}
