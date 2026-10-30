import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

export const PNG_LIMIT = 8 * 1024 * 1024;
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    data.length < 33 ||
    data.length > PNG_LIMIT ||
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    data.readUInt32BE(8) !== 13 ||
    data.toString("ascii", 12, 16) !== "IHDR"
  )
    throw Error("8MiB以内のPNG画像を選んでください。");
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20);
  if (!width || !height || width > 3840 || height > 2160 || width * height > 3840 * 2160)
    throw Error("画像は3840×2160以内にしてください。必要な範囲を切り取ってください。");
  return { width, height };
}

/** Read only a bounded regular PNG, checking identity/change before handing data to a decoder. */
export async function readPng(path: string, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted();
  const before = await lstat(path);
  signal.throwIfAborted();
  if (!before.isFile() || before.isSymbolicLink() || !before.size || before.size > PNG_LIMIT)
    throw Error("8MiB以内の通常のPNGファイルを選んでください。");
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    signal.throwIfAborted();
    const stat = await file.stat();
    signal.throwIfAborted();
    const same = (other: typeof before) =>
      other.isFile() &&
      other.dev === before.dev &&
      other.ino === before.ino &&
      other.size === before.size &&
      other.mtimeMs === before.mtimeMs &&
      other.ctimeMs === before.ctimeMs;
    if (!same(stat)) throw Error("画像ファイルが変更されました。");
    const bytes = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const result = await file.read(bytes, used, bytes.length - used, null);
      signal.throwIfAborted();
      if (!result.bytesRead) break;
      used += result.bytesRead;
    }
    const after = await file.stat();
    signal.throwIfAborted();
    if (used !== stat.size || !same(after))
      throw Error("読み取り中に画像ファイルが変更されました。");
    const png = bytes.subarray(0, used);
    pngSize(png);
    return png;
  } finally {
    await file.close();
  }
}
