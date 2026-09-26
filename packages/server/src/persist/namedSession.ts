import type { Dirent } from "node:fs";
import { lstat, readdir, rename, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import type { ServerSessionEntry } from "@wtm/protocol";
import { ConfigError } from "../configError.js";
import { readServeRecord, type ServeRecord } from "./ServeRecordFile.js";
import { StateDirInUseError, StateDirLock } from "./StateDirLock.js";

/**
 * 名前付き session（herdr の `--session <name>`。20260926-named-session）。既定の session は既定の状態ディレクトリそのもの、
 * 名前付きは `<既定の状態ディレクトリ>/sessions/<name>/`（herdr の `config_dir/sessions/<name>` と同じ形）。
 */
export const DEFAULT_SESSION_NAME = "default";
export const SESSIONS_DIR = "sessions";
export const MAX_SESSION_NAME_BYTES = 64;

export const SESSION_NAME_RULE =
  "session の名前は 1〜64 文字の ASCII の英数字と . _ - だけで、. / .. ・先頭の - ・末尾の . ・Windows の予約名（con・nul・com1 等）は使えません。";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** 規則に合わなければ理由を返す（合えば `undefined`。`default` は合う）。herdr の `validate_name` に先頭の `-`・末尾の `.`・Windows の予約名の禁止を足した（decisions D2）。 */
export function sessionNameProblem(name: string): string | undefined {
  if (name.length === 0) return "名前が空です";
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return "使えない文字を含みます";
  if (name.length > MAX_SESSION_NAME_BYTES) return `${MAX_SESSION_NAME_BYTES} 文字を超えています`;
  if (name === "." || name === "..") return ". と .. は使えません";
  if (name.startsWith("-")) return "先頭に - は使えません";
  if (name.endsWith(".")) return "末尾に . は使えません";
  if (WINDOWS_RESERVED.test(name.split(".")[0]!)) return "Windows の予約名です";
  return undefined;
}

function assertSessionName(name: string): void {
  const problem = sessionNameProblem(name);
  if (problem !== undefined)
    throw new ConfigError(
      `invalid session name: ${JSON.stringify(name)} (${problem})`,
      SESSION_NAME_RULE,
    );
}

/** 名前が無い・`default` なら `base`（既定の session）。規則外なら `ConfigError`（終了コード 2。何も作らない）。 */
export function resolveSessionStateDir(base: string, name: string | undefined): string {
  if (name === undefined || name === DEFAULT_SESSION_NAME) return base;
  assertSessionName(name);
  return join(base, SESSIONS_DIR, name);
}

export interface SessionEntry {
  name: string;
  default: boolean;
  running: boolean;
  /** running のときだけ（`wtm.lock` の持ち主）。 */
  pid?: number;
  /** 持ち主が別のホストのときだけ。 */
  host?: string;
  stateDir: string;
}

async function entryFor(name: string, stateDir: string, isDefault: boolean): Promise<SessionEntry> {
  const holder = await new StateDirLock(stateDir).inspect().catch(() => undefined);
  const entry: SessionEntry = { name, default: isDefault, running: holder !== undefined, stateDir };
  if (holder !== undefined) {
    entry.pid = holder.pid;
    if (holder.otherHost !== undefined) entry.host = holder.otherHost;
  }
  return entry;
}

async function readSessionsDir(base: string): Promise<Dirent[]> {
  try {
    return await readdir(join(base, SESSIONS_DIR), { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** 既定を先頭に、名前付きを名前順に。`sessions/` の下の、規則に合う名前のディレクトリだけ（シンボリックリンク・ファイルは除く）。 */
export async function listSessions(base: string): Promise<SessionEntry[]> {
  const names = (await readSessionsDir(base))
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name !== DEFAULT_SESSION_NAME &&
        sessionNameProblem(d.name) === undefined,
    )
    .map((d) => d.name)
    .sort();
  const entries = [await entryFor(DEFAULT_SESSION_NAME, base, true)];
  for (const name of names)
    entries.push(await entryFor(name, join(base, SESSIONS_DIR, name), false));
  return entries;
}

/**
 * `server.sessions`（20260926-named-session-ui の design「一覧」）。`listSessions` の各項目に、いま繋いでいる session か（`current`）と、
 * 開くための情報（`endpoint`）を付ける。`endpoint` は、動いていて（ロックの持ち主がこのホスト）、起動の記録（`serve.json`）の pid と
 * ホスト名がロックの持ち主と一致するときだけ——前の起動の記録・記録を書かない古い版の起動・`wtm token reset` がロックを持っている間を
 * 取り違えない。**状態ディレクトリのパス・pid・ホスト名は返さない**（AC5）。
 */
export async function listServerSessions(
  root: string,
  currentSessionName: string | undefined,
  readRecord: (stateDir: string) => Promise<ServeRecord | undefined> = readServeRecord,
  thisHost: string = hostname(),
): Promise<ServerSessionEntry[]> {
  const out: ServerSessionEntry[] = [];
  for (const entry of await listSessions(root)) {
    const current = entry.default
      ? currentSessionName === undefined
      : entry.name === currentSessionName;
    const item: ServerSessionEntry = {
      name: entry.name,
      default: entry.default,
      running: entry.running,
      current,
    };
    if (entry.running && entry.host === undefined && entry.pid !== undefined) {
      const record = await readRecord(entry.stateDir);
      if (record !== undefined && record.pid === entry.pid && record.hostname === thisHost) {
        item.endpoint = { port: record.port, https: record.https, host: record.host };
      }
    }
    out.push(item);
  }
  return out;
}

export type SessionDeleteErrorCode =
  "default" | "not-found" | "spelling" | "not-directory" | "running" | "remove-failed";

export class SessionDeleteError extends Error {
  constructor(
    readonly code: SessionDeleteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionDeleteError";
  }
}

/**
 * 名前と完全に一致するエントリを探す（herdr の `exact_session_dir_for_delete`）。無ければ、大文字小文字を区別しない FS で
 * 別の綴りが当たる（`lstat` が成功する）なら `spelling`、当たらなければ `not-found`。
 */
export async function findExactEntry(
  entries: readonly Dirent[],
  name: string,
  lstatPath: () => Promise<unknown>,
): Promise<Dirent> {
  const exact = entries.find((d) => d.name === name);
  if (exact !== undefined) return exact;
  try {
    await lstatPath();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT")
      throw new SessionDeleteError("not-found", `session ${name} はありません`);
    throw err;
  }
  throw new SessionDeleteError(
    "spelling",
    `session ${name} は実際の名前と綴りが一致しません。wtm session list が表示する綴りで指定してください`,
  );
}

/** 動いていない名前付き session の状態ディレクトリを丸ごと消す。ロックを取ってから消す（その間の起動は wtm.lock で止まる）。 */
export async function deleteSession(base: string, name: string): Promise<SessionEntry> {
  if (name === DEFAULT_SESSION_NAME)
    throw new SessionDeleteError("default", "既定の session（default）は消せません");
  assertSessionName(name);
  const sessionsDir = join(base, SESSIONS_DIR);
  const dir = join(sessionsDir, name);
  const entry = await findExactEntry(await readSessionsDir(base), name, () => lstat(dir));
  if (!entry.isDirectory()) {
    throw new SessionDeleteError(
      "not-directory",
      `${dir} はディレクトリではない（シンボリックリンク等）ので消しません`,
    );
  }
  const lock = new StateDirLock(dir);
  try {
    await lock.acquire();
  } catch (err) {
    if (err instanceof StateDirInUseError) {
      const who =
        err.otherHost !== undefined ? `pid ${err.pid} on ${err.otherHost}` : `pid ${err.pid}`;
      // 落ちて残ったロック（別のホスト・作り直したコンテナ・pid の再利用）もここに来るので、wtm serve の案内と同じく消し方を添える
      const stale =
        err.otherHost !== undefined
          ? `ロックは別のホスト（または別のコンテナ）${err.otherHost} のもので、その生死はここからは確かめられません。そちらで wtm が動いていなければ ${err.lockPath} を消してからやり直してください`
          : `pid ${err.pid} が wtm でなければ（前の wtm が落ちた後に pid が再利用された）、${err.lockPath} を消してからやり直してください`;
      throw new SessionDeleteError(
        "running",
        `session ${name} は動いています（${who}）。止めてから消してください。${stale}`,
      );
    }
    throw err;
  }
  // ロックを持ったまま、規則に合わない（一覧に出ない・--session で選べない）名前へ移してから消す。rm は中身を順に消すので、
  // その場で消すと wtm.lock が先に消えた後に起動した wtm がロックを取れてしまう。
  const doomed = join(sessionsDir, `${name}~deleting-${process.pid}-${Date.now()}`);
  try {
    await rename(dir, doomed);
  } catch (err) {
    await lock.release();
    throw new SessionDeleteError("remove-failed", `${dir} を消せませんでした: ${String(err)}`);
  }
  try {
    await rm(doomed, { recursive: true });
  } catch (err) {
    throw new SessionDeleteError(
      "remove-failed",
      `${doomed} を消しきれませんでした（一部だけ消えていることがあります。手で消してください）: ${String(err)}`,
    );
  } finally {
    await lock.release();
  }
  return { name, default: false, running: false, stateDir: dir };
}
