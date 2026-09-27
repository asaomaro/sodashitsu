import { lstat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../configError.js";
import { askSocket } from "../handoff/handoffCommand.js";
import { handoffSocketPathFor } from "../handoff/HandoffSocket.js";
import {
  DEFAULT_SESSION_NAME,
  SessionDeleteError,
  findExactEntry,
  readSessionsDir,
  resolveSessionStateDir,
} from "../persist/namedSession.js";
import { STATE_DIR_LOCK_FILE, StateDirLock } from "../persist/StateDirLock.js";
import type { CommandIo } from "../sessionCommands.js";

/**
 * `soda session stop <name> [--state-dir D] [--json]`（herdr の `herdr session stop <name>`。20260927-session-stop の design「CLI」「振る舞いの詳細」）。
 * 動いている `soda serve` に、状態ディレクトリの制御の socket（`handoff.sock`・0600）で止める指示を送り、返事の pid が `soda.lock` の持ち主と
 * 一致することを確かめてから、持ち主が居なくなる（プロセスが終わる）まで待つ。**pid へシグナルは送らない**（pid の再利用で無関係なプロセスを止めうる）。
 * 終了コード: 0 止まった／1 断られた・繋げない・返事が無い・pid の不一致・時間切れ・別のホスト／2 名前の誤り・Windows（`--json` でなければ
 * `ConfigError` を投げ、main が案内つきで 2）／3 動いていない。
 */
export const SESSION_STOP_EXIT_NOT_RUNNING = 3;

export type SessionStopErrorCode =
  | "unsupported_platform"
  | "invalid_name"
  | "no_such_session"
  | "spelling"
  | "not_directory"
  | "not_running"
  | "other_host"
  | "unreachable"
  | "no_reply"
  | "bad_reply"
  | "older_server"
  | "refused_busy"
  | "refused_unsupported"
  | "pid_mismatch"
  | "timeout";

export interface SessionStopDeps {
  platform: NodeJS.Platform;
  /** 1 行を送り、1 行の答えを受け取る（繋げなければ投げる。`code` に `ENOENT`・`ECONNREFUSED`・時間切れは `ETIMEDOUT`）。 */
  ask(socketPath: string, line: string, timeoutMs: number): Promise<string>;
  /** ロックの持ち主（`StateDirLock.inspect`）。 */
  inspect(stateDir: string): Promise<{ pid: number; otherHost?: string } | undefined>;
  /** `sessions/` の中身（名前付き session の実エントリを探す）。無ければ空。 */
  readSessionsDir(base: string): Promise<Dirent[]>;
  lstat(path: string): Promise<unknown>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** 返事を待つ上限（ms。既定 5 秒）。 */
  replyTimeoutMs?: number;
  /** 止まるのを待つ上限（ms。既定 30 秒。decisions D4）。 */
  waitTimeoutMs?: number;
}

export const defaultSessionStopDeps = (): SessionStopDeps => ({
  platform: process.platform,
  ask: askSocket,
  inspect: (dir) => new StateDirLock(dir).inspect(),
  readSessionsDir,
  lstat: (path) => lstat(path),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});

const POLL_MS = 200;

/** 失敗を 1 つの形で持ち回る（テキストと `--json` の出し分けは最後に 1 か所で行う）。 */
class StopFailure extends Error {
  constructor(
    readonly code: SessionStopErrorCode,
    message: string,
    readonly exitCode: number,
    /** テキストのときの案内（`ConfigError` の hint。終了コード 2 のときだけ）。 */
    readonly hint?: string,
  ) {
    super(message);
  }
}

export async function runSessionStop(
  base: string,
  name: string,
  json: boolean,
  io: CommandIo,
  deps: SessionStopDeps = defaultSessionStopDeps(),
): Promise<number> {
  try {
    const stopped = await stopSession(base, name, deps);
    io.out(
      json ? JSON.stringify({ stopped: true, session: stopped }) : `soda: stopped session ${name}`,
    );
    return 0;
  } catch (err) {
    if (!(err instanceof StopFailure)) throw err;
    if (err.exitCode === 2 && !json) throw new ConfigError(err.message, err.hint ?? "");
    io.err(
      json
        ? JSON.stringify({ error: { code: err.code, message: err.message } })
        : `soda: ${err.message}`,
    );
    return err.exitCode;
  }
}

async function stopSession(
  base: string,
  name: string,
  deps: SessionStopDeps,
): Promise<{ name: string; default: boolean; stateDir: string; pid: number }> {
  // 1. Windows は非対応（制御の socket を置かない。decisions D2）。
  if (deps.platform === "win32") {
    throw new StopFailure(
      "unsupported_platform",
      "soda session stop is not supported on Windows",
      2,
      "soda session stop は Linux と macOS だけで使えます。Windows では soda serve を起動した窓で Ctrl+C を押して止めてください（docs/verification.md）。",
    );
  }
  // 2. 名前 → 状態ディレクトリ。名前付きは実エントリだけ（綴り違い・無い名前で別の session を止めない・何も作らない）。
  let dir: string;
  try {
    dir = resolveSessionStateDir(base, name);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    throw new StopFailure("invalid_name", err.message, 2, err.hint);
  }
  const isDefault = dir === base;
  if (!isDefault) {
    let entry: Dirent;
    try {
      entry = await findExactEntry(await deps.readSessionsDir(base), name, () => deps.lstat(dir));
    } catch (err) {
      if (!(err instanceof SessionDeleteError)) throw err;
      const hint = `soda session list で名前を確かめてください（既定の session は ${DEFAULT_SESSION_NAME}）。`;
      if (err.code === "spelling")
        throw new StopFailure(
          "spelling",
          `session ${name} does not match the exact session name; use the spelling shown by soda session list`,
          2,
          hint,
        );
      throw new StopFailure(
        "no_such_session",
        `no such session: ${name}`,
        2,
        `session ${name} はありません（${dir}）。${hint}`,
      );
    }
    if (!entry.isDirectory())
      throw new StopFailure(
        "not_directory",
        `${dir} is not a directory (a symbolic link etc.)`,
        2,
        "名前付き session の状態ディレクトリはディレクトリである必要があります。",
      );
  }
  const label = isDefault ? DEFAULT_SESSION_NAME : name;
  // 3. 動いているか（soda.lock の持ち主）。何も送らない・何も作らない。
  const holder = await deps.inspect(dir);
  if (holder === undefined)
    throw new StopFailure(
      "not_running",
      `session ${label} is not running`,
      SESSION_STOP_EXIT_NOT_RUNNING,
    );
  if (holder.otherHost !== undefined)
    throw new StopFailure(
      "other_host",
      `session ${label} runs on another host (${holder.otherHost}, pid ${holder.pid}); run soda session stop there`,
      1,
    );
  // 4. 止める指示を送る。
  const socketPath = handoffSocketPathFor(dir);
  let raw: string;
  try {
    raw = await deps.ask(socketPath, '{"op":"stop"}', deps.replyTimeoutMs ?? 5_000);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ETIMEDOUT")
      throw new StopFailure(
        "no_reply",
        `the server of session ${label} (pid ${holder.pid}) did not answer the stop request; it may be stopping — check with soda session list`,
        1,
      );
    // 繋げなかった間に止まり終えていれば、動いていない（AC7）。
    const again = await deps.inspect(dir);
    if (again === undefined)
      throw new StopFailure(
        "not_running",
        `session ${label} is not running`,
        SESSION_STOP_EXIT_NOT_RUNNING,
      );
    // 止まり終えた後に別の soda serve がロックを取った（動いているのは別のサーバ。止めたとも、動いていないとも言わない）。
    if (again.pid !== holder.pid)
      throw new StopFailure(
        "unreachable",
        `the server of session ${label} changed while stopping (pid ${holder.pid} → ${again.pid}); run soda session stop ${label} again to stop the new one`,
        1,
      );
    throw new StopFailure(
      "unreachable",
      `the running server of session ${label} (pid ${holder.pid}) did not accept a stop request (an older version, still starting, or already stopping): ${socketPath}` +
        (code !== undefined ? ` (${code})` : "") +
        `; if it keeps running, stop it with Ctrl+C in its terminal. If pid ${holder.pid} is not soda (the lock was left by a crashed soda and the pid was reused), remove ${join(dir, STATE_DIR_LOCK_FILE)}`,
      1,
    );
  }
  const reply = parseReply(raw);
  if (reply === undefined)
    throw new StopFailure(
      "bad_reply",
      `unexpected answer from the server: ${raw.slice(0, 200)}`,
      1,
    );
  if (reply.kind === "bad_request")
    throw new StopFailure(
      "older_server",
      `the running server of session ${label} (pid ${holder.pid}) is an older version that does not accept soda session stop; stop it with Ctrl+C in its terminal`,
      1,
    );
  if (reply.kind === "refused")
    throw new StopFailure(
      reply.reason === "busy" ? "refused_busy" : "refused_unsupported",
      reply.reason === "busy"
        ? `the server refused to stop (${reply.message}); try again after the handoff finishes`
        : `the server refused to stop (${reply.message})`,
      1,
    );
  if (reply.pid !== holder.pid)
    throw new StopFailure(
      "pid_mismatch",
      `the stop request was answered by pid ${reply.pid}, but ${dir} is locked by pid ${holder.pid}; not reporting it as stopped`,
      1,
    );
  // 5. 持ち主が居なくなるまで待つ（止まったかは soda.lock で見る。`soda session list` と同じ根拠）。
  const waitMs = deps.waitTimeoutMs ?? 30_000;
  const deadline = deps.now() + waitMs;
  for (;;) {
    const current = await deps.inspect(dir);
    if (current === undefined || current.pid !== holder.pid)
      return { name: label, default: isDefault, stateDir: dir, pid: holder.pid };
    if (deps.now() >= deadline) break;
    await deps.sleep(POLL_MS);
  }
  throw new StopFailure(
    "timeout",
    `the server of session ${label} (pid ${holder.pid}) accepted the stop request but has not exited within ${Math.round(waitMs / 1000)}s; check server.log in ${dir}`,
    1,
  );
}

type ParsedReply =
  | { kind: "ok"; pid: number }
  | { kind: "refused"; reason: "busy" | "unsupported"; message: string }
  | { kind: "bad_request" };

function parseReply(raw: string): ParsedReply | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as { ok?: unknown; pid?: unknown; reason?: unknown; message?: unknown };
  if (r.ok === true && typeof r.pid === "number" && Number.isInteger(r.pid))
    return { kind: "ok", pid: r.pid };
  if (r.ok === false) {
    if (r.reason === "bad_request") return { kind: "bad_request" };
    if ((r.reason === "busy" || r.reason === "unsupported") && typeof r.message === "string")
      return { kind: "refused", reason: r.reason, message: r.message };
  }
  return undefined;
}
