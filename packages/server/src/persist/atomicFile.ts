import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * 一時ファイルに書いてから rename する原子的な書き込み（architecture.md「persist/SessionFile・AuthFile」）。
 * 権限は 0600（Windows では効かないので、呼び出し側が保存場所（%LOCALAPPDATA% 等）で代える。design「永続化の形式」）。
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpDir = await mkdtemp(join(dir, ".tmp-"));
  const tmpPath = join(tmpDir, "write");
  try {
    await writeFile(tmpPath, contents, "utf8");
    if (platform() !== "win32") {
      await chmod(tmpPath, 0o600);
    }
    await rename(tmpPath, filePath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type ReadResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "missing" }
  | { kind: "corrupt"; backupPath: string };

/**
 * 壊れたファイルは `<dir>/<name>-backups/<timestamp>.json` へ退避してから、最新 3 件だけ残す。
 * `parse` が投げたら壊れているとみなす。
 */
export async function readFileWithBackup<T>(
  filePath: string,
  backupsDir: string,
  parse: (raw: string) => T,
): Promise<ReadResult<T>> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { kind: "missing" };
    throw err;
  }
  try {
    return { kind: "ok", data: parse(raw) };
  } catch {
    const backupPath = await backupCorruptFile(filePath, backupsDir, raw);
    return { kind: "corrupt", backupPath };
  }
}

/** 移行の前の控えのファイル名の先頭。`pruneOldBackups`（最新 3 件を残す）の対象にしない。 */
export const PRE_MIGRATION_PREFIX = "pre-migration-";

export async function backupCorruptFile(filePath: string, backupsDir: string, raw: string): Promise<string> {
  await mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupsDir, `${stamp}.json`);
  await writeFile(backupPath, raw, "utf8");
  await pruneOldBackups(backupsDir, 3);
  return backupPath;
}

async function pruneOldBackups(backupsDir: string, keep: number): Promise<void> {
  // 移行の前の控え（`pre-migration-` で始まる名前）は入れ替えの対象にしない（失敗した起動をくり返しても、元のファイルの控えを消さない）。
  const entries = (await readdir(backupsDir)).filter((n) => !n.startsWith(PRE_MIGRATION_PREFIX)).sort(); // ISO 風のファイル名なので辞書順 = 時系列
  const toRemove = entries.slice(0, Math.max(0, entries.length - keep));
  await Promise.all(toRemove.map((name) => rm(join(backupsDir, name)).catch(() => undefined)));
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "ENOENT";
}

/** テスト用: OS の一時ディレクトリ配下に隔離されたディレクトリを作る。 */
export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}
