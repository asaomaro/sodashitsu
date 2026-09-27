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
  io: { err(line: string): void },
  proc: {
    env: NodeJS.ProcessEnv;
    cwd: string;
    platform: NodeJS.Platform;
    execPath: string;
    execArgv: readonly string[];
    mainPath: string;
  },
  deps: FindOrStartDeps = {},
): Promise<number> {
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
