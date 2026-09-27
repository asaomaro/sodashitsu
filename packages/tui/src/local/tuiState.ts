import { readFileSync } from "node:fs";
import { chmod, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * 端末版の手元の状態（20260927-cli-mode の design「local/tuiState.ts」。`<state>/tui-state.json`）。今のサイドバーの幅と折りたたみ
 * （共有の設定 `tui.sidebarCols` より優先）。読み書きはここだけ。
 */
export interface TuiState {
  sidebarCols?: number;
  sidebarCollapsed?: boolean;
  /**
   * 色の出し方（`truecolor`・`256`。無ければ外側の端末から判定）。**端末ごとの項目**なので共有の設定に置かない——同じ利用者でも端末によって対応が違う
   * （03 の review）。環境変数 `SODA_TRUECOLOR` がこれより優先する。
   */
  colorMode?: "truecolor" | "256";
}

export const TUI_STATE_FILE = "tui-state.json";

/** 読めない・壊れているときは空（既定へ落とす）。起動時に 1 回だけ読むので同期で読む。 */
export function readTuiState(stateDir: string): TuiState {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(stateDir, TUI_STATE_FILE), "utf8"));
    if (typeof raw !== "object" || raw === null) return {};
    const r = raw as Record<string, unknown>;
    const out: TuiState = {};
    if (
      typeof r["sidebarCols"] === "number" &&
      Number.isInteger(r["sidebarCols"]) &&
      r["sidebarCols"] > 0
    )
      out.sidebarCols = r["sidebarCols"];
    if (typeof r["sidebarCollapsed"] === "boolean") out.sidebarCollapsed = r["sidebarCollapsed"];
    if (r["colorMode"] === "truecolor" || r["colorMode"] === "256") out.colorMode = r["colorMode"];
    return out;
  } catch {
    return {};
  }
}

/** 原子的に書く（一時ファイル → rename。0600）。失敗は呼び出し側で握りつぶしてよい（次の起動で既定に戻るだけ）。 */
export async function writeTuiState(stateDir: string, state: TuiState): Promise<void> {
  const file = join(stateDir, TUI_STATE_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, file);
}
