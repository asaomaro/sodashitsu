import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { closeSync, fstatSync } from "node:fs";
import * as nodePty from "node-pty";
import type { PreflightResult } from "./HandoffController.js";
import { HANDOFF_FORMAT_VERSION, HANDOFF_NONCE_ENV, isPtyMaster } from "./HandoffManifest.js";

/**
 * 引き継ぎの前の確認（preflight。20260926-live-handoff の decisions D5）。execve で入れ替わる前に、**同じ Node・ディスク上の新しい版**で
 * 次を確かめる: ① その Node の `process.execve` が close-on-exec の無い PTY の master を残す ② 新しい版が読み込めて `__handoff-preflight` を知っている
 * ③ 引き継ぎの形式の版が一致する。
 *
 * 1 段目（子）は node-pty で使い捨ての PTY を開き、自分自身を execve で 2 段目にする。2 段目はその番号の fd が、同じ `dev:ino`
 * （Linux では PTY の多重化装置 `/dev/ptmx` の装置ノード——master ならどれも同じ値）を指して開いたまま残って
 * いるかを見て、結果を 1 行の JSON で標準出力に書く。stdio で渡した pipe は子の Node では close-on-exec が付くので使えない（research F2.6）。
 */
export const PREFLIGHT_COMMAND = "__handoff-preflight";
export const DEFAULT_PREFLIGHT_TIMEOUT_MS = 20_000;

/** 2 段目の答え（標準出力の最後の行）。 */
export interface PreflightAnswer {
  ok: boolean;
  format: number;
  message?: string;
}

export interface RunPreflightOptions {
  /** 起動する Node（既定 `process.execPath`）。 */
  execPath?: string;
  /** Node の引数（既定 `process.execArgv`）。 */
  execArgv?: readonly string[];
  /** soda の入口（`dist/main.js`。既定 `process.argv[1]`）。 */
  entry?: string;
  timeoutMs?: number;
  spawn?: (command: string, args: readonly string[], env: NodeJS.ProcessEnv) => ChildProcess;
}

const MAX_OUTPUT = 64 * 1024;

/** 親（動いているサーバ）の側: 確認の子を起動し、答えを判定する。投げない。 */
export function runPreflight(opts: RunPreflightOptions = {}): Promise<PreflightResult> {
  const execPath = opts.execPath ?? process.execPath;
  const execArgv = opts.execArgv ?? process.execArgv;
  const entry = opts.entry ?? process.argv[1];
  if (entry === undefined)
    return Promise.resolve({
      ok: false,
      message: "cannot tell where soda was started from (process.argv[1])",
    });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PREFLIGHT_TIMEOUT_MS;
  const env = { ...process.env };
  delete env[HANDOFF_NONCE_ENV];
  const spawn =
    opts.spawn ??
    ((command, args, e) =>
      spawnChild(command, [...args], { env: e, stdio: ["ignore", "pipe", "pipe"] }));
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: PreflightResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child: ChildProcess;
    try {
      child = spawn(execPath, [...execArgv, entry, PREFLIGHT_COMMAND], env);
    } catch (err) {
      resolve({
        ok: false,
        message: `cannot start the handoff check: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    let out = "";
    let errOut = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      out = (out + c).slice(-MAX_OUTPUT); // 答えは最後の行なので末尾を残す
    });
    child.stderr?.on("data", (c: string) => {
      errOut = (errOut + c).slice(-MAX_OUTPUT);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({
        ok: false,
        message: `the handoff check of the new version did not finish within ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.on("error", (err) =>
      done({ ok: false, message: `cannot start the handoff check: ${err.message}` }),
    );
    child.on("close", (code, signal) => done(judgePreflight(code, signal, out, errOut)));
  });
}

/** 確認の子の終わり方と出力から判定する（単体テスト用に分けた）。 */
export function judgePreflight(
  code: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
): PreflightResult {
  const tail = stderr.trim().split("\n").slice(-3).join(" / ").slice(0, 500);
  if (code !== 0) {
    const how = code !== null ? `exit code ${code}` : `signal ${signal ?? "unknown"}`;
    return {
      ok: false,
      message: `the new version cannot be loaded or does not support live handoff (${how})${tail !== "" ? `: ${tail}` : ""}`,
    };
  }
  const answer = parseAnswer(stdout);
  if (answer === undefined)
    return {
      ok: false,
      message: "the new version did not answer the handoff check (it may not support live handoff)",
    };
  if (!answer.ok) return { ok: false, message: answer.message ?? "the handoff check failed" };
  if (answer.format !== HANDOFF_FORMAT_VERSION) {
    return {
      ok: false,
      message: `the handoff format differs (new version ${answer.format}, this server ${HANDOFF_FORMAT_VERSION})`,
    };
  }
  return { ok: true };
}

function parseAnswer(stdout: string): PreflightAnswer | undefined {
  const lines = stdout.trim().split("\n");
  const last = lines[lines.length - 1];
  if (last === undefined || last === "") return undefined;
  try {
    const v = JSON.parse(last) as Record<string, unknown>;
    if (
      typeof v !== "object" ||
      v === null ||
      typeof v["ok"] !== "boolean" ||
      typeof v["format"] !== "number"
    )
      return undefined;
    return {
      ok: v["ok"],
      format: v["format"],
      ...(typeof v["message"] === "string" ? { message: v["message"] } : {}),
    };
  } catch {
    return undefined;
  }
}

export interface PreflightStageDeps {
  write: (line: string) => void;
  platform: NodeJS.Platform;
  execve: ((file: string, args: string[], env: NodeJS.ProcessEnv) => void) | undefined;
}

const defaultStageDeps = (): PreflightStageDeps => ({
  write: (line) => process.stdout.write(`${line}\n`),
  platform: process.platform,
  execve:
    typeof process.execve === "function"
      ? (file, args, env) => process.execve!(file, args, env)
      : undefined,
});

/**
 * 子の側（`soda __handoff-preflight [--stage 2 --probe <fd>:<dev>:<ino>:<pid>]`）。1 段目は PTY を開いて自分を 2 段目に入れ替え、
 * 2 段目は fd が残ったかを答える。答えは標準出力の 1 行の JSON（終了コード 0）。
 */
export function runPreflightStage(
  args: { stage: 1 | 2; probe?: string | undefined },
  deps: PreflightStageDeps = defaultStageDeps(),
): void {
  const answer = (ok: boolean, message?: string): void =>
    deps.write(
      JSON.stringify({
        ok,
        format: HANDOFF_FORMAT_VERSION,
        ...(message !== undefined ? { message } : {}),
      }),
    );
  if (args.stage === 2) {
    answer(...checkProbe(args.probe ?? "", deps.platform));
    return;
  }
  if (deps.platform === "win32" || deps.execve === undefined) {
    answer(
      false,
      "process.execve is not available in this Node.js (needs >= 22.15 / 23.11, Linux or macOS)",
    );
    return;
  }
  let pty: nodePty.IPty;
  try {
    // 使い捨てのシェル。2 段目が終わらせるが、確認が途中で固まって親が子の Node だけを止めた場合（シェルは別のセッションにいる）にも、
    // 長く残らないよう確認の上限（20 秒）より短く自分で終わる。
    pty = nodePty.spawn("/bin/sh", ["-c", "sleep 15"], { cols: 80, rows: 24 });
  } catch (err) {
    answer(
      false,
      `cannot open a pty for the handoff check: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  const fd = (pty as unknown as { fd?: unknown }).fd;
  if (typeof fd !== "number") {
    pty.kill("SIGKILL");
    answer(false, "node-pty does not expose the pty master fd");
    return;
  }
  const entry = process.argv[1] ?? "";
  const execve = deps.execve;
  try {
    const st = fstatSync(fd);
    const probe = `${fd}:${st.dev}:${st.ino}:${pty.pid}`;
    execve(
      process.execPath,
      [
        process.execPath,
        ...process.execArgv,
        entry,
        PREFLIGHT_COMMAND,
        "--stage",
        "2",
        "--probe",
        probe,
      ],
      process.env,
    );
  } catch (err) {
    pty.kill("SIGKILL");
    answer(
      false,
      `the handoff check could not re-execute itself: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 2 段目: 1 段目が開いた PTY の master が、execve の後も同じもので残っているか。使い捨てのシェルは終わらせる。 */
export function checkProbe(
  probe: string,
  platform: NodeJS.Platform,
  close: (fd: number) => void = closeSync,
): [boolean, string?] {
  const m = /^(\d+):(\d+):(\d+):(\d+)$/.exec(probe);
  if (m === null) return [false, "malformed probe"];
  const [fd, dev, ino, pid] = [Number(m[1]), m[2]!, m[3]!, Number(m[4])];
  let same = false;
  try {
    const st = fstatSync(fd);
    same = String(st.dev) === dev && String(st.ino) === ino && isPtyMaster(fd, platform);
  } catch {
    same = false;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // 既に終わっている。
  }
  if (same) {
    try {
      close(fd);
    } catch {
      // 閉じられなくても答えは変わらない。
    }
  }
  return same
    ? [true]
    : [
        false,
        "this Node.js does not keep the pty open across process.execve, so live handoff would lose the panes",
      ];
}
