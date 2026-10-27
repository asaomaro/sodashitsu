import { lstat, realpath } from "node:fs/promises";
import { resolve, parse, join, sep } from "node:path";
import { RpcError } from "@sodashitsu/protocol";
/** Windows 8.3/case spelling can differ from realpath without being a reparse point. */
export async function canonicalFolder(path: string): Promise<string> {
  const absolute = resolve(path),
    canonical = await realpath(absolute),
    before = await lstat(absolute);
  if (!before.isDirectory() || before.isSymbolicLink())
    throw new RpcError("invalid_params", "リンクを経由する共有フォルダは使えません");
  if (canonical !== absolute) {
    if (process.platform !== "win32")
      throw new RpcError("invalid_params", "リンクを経由する共有フォルダは使えません");
    const root = parse(absolute).root,
      snapshots = [];
    let current = root;
    for (const part of absolute.slice(root.length).split(sep)) {
      if (!part) continue;
      current = join(current, part);
      const st = await lstat(current);
      if (!st.isDirectory() || st.isSymbolicLink())
        throw new RpcError("invalid_params", "リンクを経由する共有フォルダは使えません");
      snapshots.push({ path: current, dev: st.dev, ino: st.ino });
    }
    for (const snapshot of snapshots) {
      const st = await lstat(snapshot.path);
      if (
        !st.isDirectory() ||
        st.isSymbolicLink() ||
        st.dev !== snapshot.dev ||
        st.ino !== snapshot.ino
      )
        throw new RpcError("invalid_params", "共有フォルダの実体が変更されました");
    }
  }
  const after = await lstat(canonical);
  if (
    !after.isDirectory() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  )
    throw new RpcError("invalid_params", "共有フォルダの実体が変更されました");
  return canonical;
}
