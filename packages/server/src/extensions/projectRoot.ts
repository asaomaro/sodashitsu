import { realpath as fsRealpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { EXTENSION_PATH_MAX, hasForbiddenChars } from "@sodashitsu/protocol";
import { defaultWorkspaceLabelDeps, findGitRoot, type WorkspaceLabelDeps } from "../session/workspaceLabel.js";

/**
 * プロジェクトの根（20261007-ext-host PR3）。workspace を開いた場所から、git の worktree ごとの根の**実体のパス**を返す。
 * **git のコマンドは呼ばない**（`findGitRoot` は `.git` をたどるだけ。リポジトリの設定の `core.fsmonitor` などで、開いただけで何かが動かないように。S1）。
 * たどり方は `findGitRoot` のまま（`workspaceLabel` の規則と食い違うと、根がずれる）。
 * **時間の上限はここに置かない**: `null` は「git の外（か、根として扱えないパス）」だけを表す。上限と時間切れの扱いは、呼ぶ側（`ExtensionHost`）の 1 か所。
 */

export interface ProjectRootDeps {
  label: WorkspaceLabelDeps;
  realpath: (path: string) => Promise<string>;
}

export const defaultProjectRootDeps: ProjectRootDeps = {
  label: defaultWorkspaceLabelDeps,
  realpath: (p) => fsRealpath(p),
};

/**
 * `cwd`（`Workspace.cwd`。開いた場所。`Pane.cwd` は使わない——pane の中のプログラムが `cd` するだけで根が変わってしまう）から根を引く。
 * 絶対パス・1024 文字以下・禁止する文字（`command` と同じ。承認の画面で正しく見せられない）を含まないものだけ。満たさなければ `null`。
 * 読めない（`ENOENT` 以外の誤り）ときは投げる（呼ぶ側が「今回は引けなかった」として扱い、覚えない）。
 */
export async function resolveProjectRoot(cwd: string, deps: Partial<ProjectRootDeps> = {}): Promise<string | null> {
  const d = { ...defaultProjectRootDeps, ...deps };
  const gitRoot = await findGitRoot(cwd, d.label);
  if (gitRoot === null) return null;
  let real: string;
  try {
    real = await d.realpath(gitRoot);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw err;
  }
  if (!isAbsolute(real) || real.length > EXTENSION_PATH_MAX || hasForbiddenChars(real)) return null;
  return real;
}
