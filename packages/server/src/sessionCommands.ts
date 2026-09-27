import { stat } from "node:fs/promises";
import { ConfigError, defaultStateDir, sessionFromEnvNote, stateDirInUseError } from "./config.js";
import { DefaultAuthService } from "./auth/AuthService.js";
import { FsAuthFile } from "./persist/AuthFile.js";
import { StateDirInUseError, StateDirLock } from "./persist/StateDirLock.js";
import {
  deleteSession,
  listSessions,
  resolveSessionStateDir,
  sessionStopCommandFor,
  SessionDeleteError,
  type SessionEntry,
} from "./persist/namedSession.js";

/** `soda session …`・`soda token reset` の出力先（`main.ts` は読み込むと起動するので、テストのためここへ分けた。20260926-named-session）。 */
export interface CommandIo {
  out(line: string): void;
  err(line: string): void;
}

/** running のときだけ ` (pid N)`・別のホストなら ` (pid N on host)`。 */
function holderNote(e: SessionEntry): string {
  if (!e.running) return "";
  return e.host !== undefined ? ` (pid ${e.pid} on ${e.host})` : ` (pid ${e.pid})`;
}

/** `soda session list [--json]`（herdr の `session list` と同じ列の並び）。終了コード 0。読み取りの失敗は投げる（main が終了コード 1）。 */
export async function runSessionList(base: string, json: boolean, io: CommandIo): Promise<number> {
  const sessions = await listSessions(base);
  if (json) {
    io.out(JSON.stringify({ sessions }));
    return 0;
  }
  const width = Math.max(20, ...sessions.map((e) => e.name.length + 1));
  io.out(`${"name".padEnd(width)} ${"status".padEnd(8)} directory`);
  for (const e of sessions)
    io.out(
      `${e.name.padEnd(width)} ${(e.running ? "running" : "stopped").padEnd(8)} ${e.stateDir}${holderNote(e)}`,
    );
  return 0;
}

/** `soda session delete <name> [--json]`。拒否・失敗は終了コード 1。規則外の名前は ConfigError を投げる（main が終了コード 2）。 */
export async function runSessionDelete(
  base: string,
  name: string,
  json: boolean,
  io: CommandIo,
): Promise<number> {
  try {
    const session = await deleteSession(base, name, defaultStateDir());
    io.out(
      json
        ? JSON.stringify({ deleted: true, session })
        : `soda: deleted session ${name} (${session.stateDir})`,
    );
    return 0;
  } catch (err) {
    if (!(err instanceof SessionDeleteError)) throw err;
    io.err(
      json
        ? JSON.stringify({ error: { code: err.code, message: err.message } })
        : `soda: ${err.message}`,
    );
    return 1;
  }
}

/**
 * `soda token reset [--session NAME]`（D103。`main.ts` から移した）：`soda serve` と同じ状態ディレクトリのロック（`soda.lock`）を
 * 取ってから auth.json を書き換える。動いている `soda serve` は token とセッションをメモリに持ったまま auth.json を読み直さないので、
 * 動いている間に書き換えると新しい token を受け付けず、次のログイン等で auth.json を古い token に書き戻す。だから動いていれば断る
 * （終了コード 2）。
 */
export async function runTokenReset(
  base: string,
  session: string | undefined,
  io: CommandIo,
  /** 名前を `SODA_SESSION` から選んだか（案内にその旨を添える。20260926-named-session-ui）。 */
  sessionSource?: "flag" | "env",
): Promise<void> {
  const dir = resolveSessionStateDir(base, session);
  const fromEnv = sessionSource === "env" && dir !== base ? session : undefined;
  // 名前付き session は、在るものだけ（打ち間違えた名前で新しい session を作らない。作るのは soda serve --session）。
  if (dir !== base && !(await isDirectory(dir))) {
    throw new ConfigError(
      `no such session: ${session}`,
      `session ${session} はありません（${dir}）。soda session list で名前を確かめてください（名前付き session を作るのは soda serve --session ${session}）。` +
        (fromEnv !== undefined ? sessionFromEnvNote(fromEnv) : ""),
    );
  }
  const lock = new StateDirLock(dir);
  try {
    await lock.acquire();
  } catch (err) {
    if (err instanceof StateDirInUseError)
      throw stateDirInUseError(
        err,
        dir,
        "token-reset",
        fromEnv,
        sessionStopCommandFor(dir === base ? "default" : session!, base, defaultStateDir()),
      );
    throw err;
  }
  try {
    const auth = new DefaultAuthService(new FsAuthFile(dir));
    await auth.initialize();
    const token = await auth.resetToken();
    io.out(`soda: new token: ${token}`);
  } finally {
    await lock.release();
  }
}

/** 在るディレクトリか（`soda serve --session` と同じくシンボリックリンクは辿る）。無い以外の失敗（権限等）は投げる。 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      (err as NodeJS.ErrnoException).code === "ENOTDIR"
    )
      return false;
    throw err;
  }
}
