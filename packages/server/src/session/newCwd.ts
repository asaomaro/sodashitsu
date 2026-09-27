import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import type { NewCwd, Pane, PaneId } from "@sodashitsu/protocol";
import type { ProcessInspector } from "../platform/ProcessInspector.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import { withTimeout } from "./withTimeout.js";

/**
 * 新しい workspace・tab・分割を開く場所を決める（20260921-new-terminal-cwd。herdr の `terminal.new_cwd`）。
 * **規則はこの 1 か所**（design D6）——`SessionService` の 3 つの作成はここを呼ぶだけ。
 *
 * 方針 → 候補 → 検証 → 代わり、の順:
 * 1. 候補: `follow` は元の pane の「いまの場所」を**その時点で読み直す**（前面プロセスの cwd を上限つきで、無ければ OSC 7。読めなければ
 *    記録された `Pane.cwd`。design D2・D4・decisions D9）。`home`・`current`・`path` はその場所（`path` は `~` を展開し、絶対パスでなければ使えない）。
 * 2. 候補が使える（ディレクトリで入れる）なら それ。
 * 3. 使えない・候補が無いなら、操作ごとの 1 段目の代わり（呼ぶ側が渡す。以前と同じ場所）、それも使えなければサーバを起動した場所（design D3）。
 *    **`fellBack` は `follow` 以外のときだけ立てる**（「引き継ぐ」は利用者の操作の誤りではないので知らせない。design D9）。
 */

/** 「いまの場所」を読み直すのにかける時間の上限（design D2）。超えたら「読めない」として記録された場所に落ちる。 */
export const LIVE_CWD_TIMEOUT_MS = 200;

export interface NewCwdDeps {
  /** 元の pane の前面プロセスの cwd。読めなければ null。reject してもよい（null として扱う）。**上限はこれにだけ掛ける**。 */
  liveCwd: (paneId: PaneId) => Promise<string | null>;
  /**
   * 元の pane のシェルが OSC 7 で知らせた場所（無ければ null）。同期で読めるので上限に掛けず、前面プロセスの cwd が無い・上限を
   * 超えた・reject したときに**待った後で**読む（decisions D9）。
   */
  hintCwd: (paneId: PaneId) => string | null;
  /** 元の pane の記録された場所（`Pane.cwd`）。**pane が無ければ undefined**（＝元の pane が無い）。 */
  recordedCwd: (paneId: PaneId) => string | undefined;
  home: () => string;
  /** サーバを起動した場所（`composeServer` の `defaultCwd` と同じ値）。代わりの 2 段目。 */
  currentDir: string;
  isUsableDir: (path: string) => Promise<boolean>;
  liveCwdTimeoutMs?: number;
}

/**
 * `~` と `~/…`・`~\…` だけを展開する。`~user` は展開しない（相対パスのままなので、`resolveNewCwd` が必ず使えない場所にする）。
 * 区切りはそのままつなぐ（Windows の `C:\Users\u/work` のような混在も、使える場所として通る）。
 */
export function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/") || path.startsWith("~\\")) return home + path.slice(1);
  return path;
}

/**
 * 方針から場所を決める。`fallback` は操作ごとの 1 段目の代わり（workspace はサーバを起動した場所、tab はその workspace の場所、
 * 分割は元の pane の記録された場所）。
 */
export async function resolveNewCwd(
  req: NewCwd,
  sourcePaneId: PaneId | undefined,
  fallback: string,
  deps: NewCwdDeps,
): Promise<{ cwd: string; fellBack: boolean }> {
  const candidate = await candidateFor(req, sourcePaneId, deps);
  if (candidate !== null && (await deps.isUsableDir(candidate))) {
    return { cwd: candidate, fellBack: false };
  }
  const fellBack = req.policy !== "follow";
  // 1 段目の代わりも検証する——分割の「引き継ぐ」で `cd` した先が消されたとき、`source.cwd` は同じ消えた場所
  // （監視が追従させている）。
  if (await deps.isUsableDir(fallback)) return { cwd: fallback, fellBack };
  return { cwd: deps.currentDir, fellBack };
}

async function candidateFor(
  req: NewCwd,
  sourcePaneId: PaneId | undefined,
  deps: NewCwdDeps,
): Promise<string | null> {
  switch (req.policy) {
    case "follow": {
      if (sourcePaneId === undefined) return null;
      const recorded = deps.recordedCwd(sourcePaneId);
      if (recorded === undefined) return null; // 元の pane が無い → 以前と同じ場所（AC5）
      const live = await liveCwdWithin(sourcePaneId, deps);
      // OSC 7 は待った後に読む——調べている間に届いた分も拾う。上限を超えても捨てない（Windows は前面の cwd を読めないのに、
      // プロセスの走査は待たされる。decisions D9）。どちらも無ければ記録された場所（design D4）。
      return live ?? deps.hintCwd(sourcePaneId) ?? recorded;
    }
    case "home":
      return deps.home();
    case "current":
      return deps.currentDir;
    case "path": {
      const expanded = expandHome(req.path, deps.home());
      // 相対パスはサーバのプロセスの cwd から解決され、`Workspace.cwd` に相対のまま入ってしまう（git の情報・worktree・復元が使う）。
      // 絶対パスは正規化する——`~/` の末尾の `/` や `..` を残すと、worktree が既に開いているかの完全一致の比較と食い違う。
      return isAbsolute(expanded) ? resolve(expanded) : null;
    }
  }
}

/**
 * 上限つきで読み直す。**上限を超えた・reject した**ら null（作成を失敗させない——Windows の部品が読めないと `foreground()` は reject する）。
 * 待ち方は `withTimeout`（名前を決める処理と共通。20260921-workspace-auto-label の review ラウンド 1）。
 */
function liveCwdWithin(paneId: PaneId, deps: NewCwdDeps): Promise<string | null> {
  return withTimeout(() => deps.liveCwd(paneId), deps.liveCwdTimeoutMs ?? LIVE_CWD_TIMEOUT_MS);
}

/** ディレクトリで、入れる（`chdir` に要る検索＝実行の権限がある）か。どこかで失敗したら false。 */
export async function isUsableDir(path: string): Promise<boolean> {
  try {
    const st = await stat(path);
    if (!st.isDirectory()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * 本番の deps を組み立てる（`composeServer` が呼ぶ）。**元の pane の `TerminalHost` を引き、その pid で `foreground()` を呼ぶ**——
 * エージェントの監視が `Pane.cwd` を決める規則（`AgentMonitor` の `leader?.cwd ?? host.mirror.cwdHint()`）と同じで、違いはその時点で読むことだけ。
 * いちばん外側のシェルの cwd は読まない（入れ子のシェルでは `cd` の前のまま。design D2）。
 */
export function makeNewCwdDeps(o: {
  terminals: Pick<TerminalManager, "get">;
  inspector: Pick<ProcessInspector, "foreground">;
  getPane: (paneId: PaneId) => Pane | undefined;
  currentDir: string;
  home?: () => string;
  isUsableDir?: (path: string) => Promise<boolean>;
}): NewCwdDeps {
  return {
    liveCwd: async (paneId) => {
      const host = o.terminals.get(paneId);
      if (!host) return null;
      const fg = await o.inspector.foreground(host.pid).catch(() => null);
      return fg?.cwd ?? null;
    },
    hintCwd: (paneId) => o.terminals.get(paneId)?.mirror.cwdHint() ?? null,
    recordedCwd: (paneId) => o.getPane(paneId)?.cwd,
    home: o.home ?? homedir,
    currentDir: o.currentDir,
    isUsableDir: o.isUsableDir ?? isUsableDir,
  };
}
