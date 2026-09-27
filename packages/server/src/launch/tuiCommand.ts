import type { ParsedArgs } from "../cliArgs.js";
import { findOrStart, LaunchError, type FindOrStartDeps } from "./findOrStart.js";
import type { TuiEntry } from "./tuiTarget.js";

/**
 * 引数なしの `soda`（20260927-cli-mode）。`findOrStart` で繋ぎ先を用意し、端末版の入口（`entry`）へ渡す。断る事情（入れ子・別のホスト・起動の失敗・
 * 準備完了にならない）は案内つきの終了コード 1。`main.ts` は読み込むと起動するので、振り分けの本体をここへ分けた（`sessionCommands.ts` と同じ）。
 */
export async function runTuiCommand(
  parsed: ParsedArgs,
  entry: TuiEntry,
  io: { err(line: string): void; help(): void },
  proc: {
    /** 標準入力と標準出力がどちらも端末か。端末版は端末の中でしか動かない。 */
    isTty: boolean;
    env: NodeJS.ProcessEnv;
    cwd: string;
    platform: NodeJS.Platform;
    execPath: string;
    execArgv: readonly string[];
    mainPath: string;
  },
  deps: FindOrStartDeps = {},
): Promise<number> {
  // 端末でなければ（パイプ・リダイレクト・CI）**サーバを起動する前に**断る。以前は引数なしの soda は help を出して終わるだけだったので、スクリプトから
  // 呼んでいた場合に裏でサーバが立ち上がらないようにする（02 の review）。`--session`・`--state-dir` を付けた形も同じ扱い。
  if (!proc.isTty) {
    io.err(
      "soda: the terminal UI needs a terminal (stdin and stdout must be a TTY); showing help instead",
    );
    io.help();
    return 2;
  }
  let target;
  try {
    target = await findOrStart(
      {
        serve: parsed.serve,
        allowNested: parsed.allowNested === true,
        env: proc.env,
        cwd: proc.cwd,
        platform: proc.platform,
        execPath: proc.execPath,
        execArgv: proc.execArgv,
        mainPath: proc.mainPath,
      },
      deps,
    );
  } catch (err) {
    if (!(err instanceof LaunchError)) throw err;
    io.err(`soda: ${err.message}`);
    io.err(err.hint);
    return err.exitCode;
  }
  return entry(target);
}
