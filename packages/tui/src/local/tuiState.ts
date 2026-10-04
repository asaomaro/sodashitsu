import { existsSync, readFileSync } from "node:fs";
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
  /** サイドバーの spaces の区画の行数（区切りのドラッグで変えた値）。 */
  sidebarSpacesRows?: number;
  /** サイドバーの畳んでいる区画（畳んでいる区画だけを持つ。20261004-ui-interaction-polish）。 */
  sidebarSectionsCollapsed?: { spaces?: true; agents?: true };
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
    const spaces = r["sidebarSpacesRows"];
    if (typeof spaces === "number" && Number.isInteger(spaces) && spaces > 0)
      out.sidebarSpacesRows = spaces;
    // 値が `true` のキーだけを採る（壊れた値は開いた状態）。
    const folded = r["sidebarSectionsCollapsed"];
    if (typeof folded === "object" && folded !== null && !Array.isArray(folded)) {
      const f = folded as Record<string, unknown>;
      const keep: { spaces?: true; agents?: true } = {};
      if (f["spaces"] === true) keep.spaces = true;
      if (f["agents"] === true) keep.agents = true;
      if (keep.spaces || keep.agents) out.sidebarSectionsCollapsed = keep;
    }
    return out;
  } catch {
    return {};
  }
}

/** `tui-state.json` があるか（この状態ディレクトリで端末版を前にも使った痕跡。はじめの案内を既存の利用者に出さない）。 */
export function tuiStateExists(stateDir: string): boolean {
  return existsSync(join(stateDir, TUI_STATE_FILE));
}

/** 原子的に書く（一時ファイル → rename。0600）。失敗は呼び出し側で握りつぶしてよい（次の起動で既定に戻るだけ）。 */
export async function writeTuiState(stateDir: string, state: TuiState): Promise<void> {
  const file = join(stateDir, TUI_STATE_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600).catch(() => undefined);
  await rename(tmp, file);
}
