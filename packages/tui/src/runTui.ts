import { processIo } from "./app/processIo.js";
import { TuiApp } from "./app/TuiApp.js";
import type { TuiIo, TuiTarget } from "./types.js";

/**
 * 端末版の入口（20260927-cli-mode の architecture「インターフェース / データモデル」）。`TuiApp` を作って走らせ、終了コードを返す。
 * `io` は外側の端末とプロセスの差し替え（テスト用）。省略すれば本物の stdin/stdout/シグナル。
 */
export function runTui(target: TuiTarget, io: TuiIo = processIo()): Promise<number> {
  return new TuiApp(target, io).run();
}
