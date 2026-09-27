import { connect as netConnect } from "node:net";
import { ConfigError, sessionFromEnvNote } from "../config.js";
import { resolveSessionStateDir } from "../persist/namedSession.js";
import { StateDirLock } from "../persist/StateDirLock.js";
import { type CommandIo, isDirectory } from "../sessionCommands.js";
import type { HandoffReply, HandoffStatus } from "./HandoffController.js";
import { handoffSocketPathFor } from "./HandoffSocket.js";

/**
 * `soda handoff [--state-dir D] [--session NAME]`（20260926-live-handoff。design「`soda handoff`」）。動いている `soda serve` に、pane の
 * プロセスを止めずにディスク上の soda へ入れ替わるよう指示し、入れ替わった新しいサーバの答えを待って結果を表示する。
 * 終了コード: 0 成功（全 pane を引き継いだ）／1 失敗（拒否・確認の失敗・時間切れ・一部を引き継げなかった・別のホスト・受け口に繋げない）／
 * 2 指定の誤り・非対応（`ConfigError` を投げる。main が 2 にする）／3 サーバが動いていない。
 */
export const HANDOFF_EXIT_NOT_RUNNING = 3;

export interface HandoffCommandDeps {
  platform: NodeJS.Platform;
  /** 1 行を送り、1 行の答えを受け取る（繋げなければ投げる。`code` に `ENOENT`・`ECONNREFUSED` 等）。 */
  ask(socketPath: string, line: string, timeoutMs: number): Promise<string>;
  /** ロックの持ち主（`StateDirLock.inspect`）。 */
  inspect(stateDir: string): Promise<{ pid: number; otherHost?: string } | undefined>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** 返事を待つ上限（preflight を含む）と、入れ替わった新しいサーバの答えを待つ上限（ms）。 */
  replyTimeoutMs?: number;
  completeTimeoutMs?: number;
}

export const defaultHandoffCommandDeps = (): HandoffCommandDeps => ({
  platform: process.platform,
  ask: askSocket,
  inspect: (dir) => new StateDirLock(dir).inspect(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});

/** 1 行を送って 1 行の答えを読む（答えの前に閉じられたら投げる）。 */
export function askSocket(socketPath: string, line: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = netConnect(socketPath);
    let buf = "";
    let done = false;
    const finish = (err: Error | undefined, value?: string): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      if (err) reject(err);
      else resolve(value!);
    };
    const timer = setTimeout(
      () =>
        finish(Object.assign(new Error("timed out waiting for the server"), { code: "ETIMEDOUT" })),
      timeoutMs,
    );
    sock.setEncoding("utf8");
    sock.on("connect", () => sock.write(`${line}\n`));
    sock.on("data", (c: string) => {
      buf += c;
      const nl = buf.indexOf("\n");
      if (nl >= 0) finish(undefined, buf.slice(0, nl));
    });
    sock.on("error", (err) => finish(err));
    sock.on("close", () =>
      finish(
        Object.assign(new Error("the server closed the connection without answering"), {
          code: "ECONNRESET",
        }),
      ),
    );
  });
}

export async function runHandoff(
  base: string,
  session: string | undefined,
  io: CommandIo,
  sessionSource?: "flag" | "env",
  deps: HandoffCommandDeps = defaultHandoffCommandDeps(),
): Promise<number> {
  if (deps.platform === "win32") {
    throw new ConfigError(
      "soda handoff is not supported on Windows",
      "更新時の引き継ぎ（live handoff）は Linux と macOS だけで使えます（docs/verification.md）。",
    );
  }
  const dir = resolveSessionStateDir(base, session);
  const fromEnv = sessionSource === "env" && dir !== base ? session : undefined;
  if (dir !== base && !(await isDirectory(dir))) {
    throw new ConfigError(
      `no such session: ${session}`,
      `session ${session} はありません（${dir}）。soda session list で名前を確かめてください。` +
        (fromEnv !== undefined ? sessionFromEnvNote(fromEnv) : ""),
    );
  }
  const holder = await deps.inspect(dir);
  if (holder === undefined) {
    io.err(`soda: no soda serve is running for ${dir}`);
    return HANDOFF_EXIT_NOT_RUNNING;
  }
  if (holder.otherHost !== undefined) {
    io.err(
      `soda: the soda serve for ${dir} runs on another host (${holder.otherHost}, pid ${holder.pid}); run soda handoff there`,
    );
    return 1;
  }
  const socketPath = handoffSocketPathFor(dir);
  let reply: HandoffReply;
  try {
    reply = JSON.parse(
      await deps.ask(socketPath, '{"op":"handoff"}', deps.replyTimeoutMs ?? 150_000),
    ) as HandoffReply;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ECONNREFUSED") {
      io.err(
        `soda: the running server (pid ${holder.pid}) does not accept a handoff (an older version, or still starting): ${socketPath}`,
      );
    } else {
      io.err(`soda: handoff request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return 1;
  }
  if (!reply.ok) {
    if (reply.reason === "unsupported")
      throw new ConfigError(
        `the server cannot hand off: ${reply.message}`,
        "更新時の引き継ぎ（live handoff）は Linux と macOS の Node.js 24 以降で使えます。",
      );
    io.err(`soda: handoff refused (${reply.reason}): ${reply.message}`);
    // 止まる途中（`soda session stop`・Ctrl+C）の断りでは「動き続ける」とは言わない（20260927-session-stop）。
    io.err(
      reply.reason === "stopping"
        ? "soda: the server is shutting down; start it again with soda serve instead of handing off"
        : "soda: the server keeps running as before",
    );
    return 1;
  }
  io.out(`soda: handing off ${reply.panes} pane(s) of pid ${holder.pid} to the soda on disk…`);

  // 新しいサーバが待ち受け直して、同じ id の結果を答えるまで待つ。
  const deadline = deps.now() + (deps.completeTimeoutMs ?? 60_000);
  while (deps.now() < deadline) {
    await deps.sleep(200);
    let status: HandoffStatus;
    try {
      status = JSON.parse(await deps.ask(socketPath, '{"op":"status"}', 2_000)) as HandoffStatus;
    } catch {
      continue; // 入れ替わりの途中（まだ待ち受けていない・古い socket の残り）
    }
    const last = status.lastHandoff;
    if (last === null || last.id !== reply.id) continue;
    if (last.error !== undefined) {
      io.err(`soda: handoff failed after it was accepted: ${last.error}`);
      io.err("soda: the server keeps running as before");
      return 1;
    }
    if (last.dropped > 0) {
      io.err(
        `soda: handoff finished, but ${last.dropped} pane(s) could not be kept (see server.log); ${last.adopted} pane(s) kept`,
      );
      return 1;
    }
    io.out(`soda: handoff complete: ${last.adopted} pane(s) kept running`);
    return 0;
  }
  io.err(
    `soda: the new server did not report the handoff within ${Math.round((deps.completeTimeoutMs ?? 60_000) / 1000)}s; check server.log in ${dir}`,
  );
  return 1;
}
