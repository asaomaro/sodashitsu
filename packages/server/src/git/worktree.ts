import { basename, dirname, resolve } from "node:path";
import type { WorktreeEntry } from "@sodashitsu/protocol";

/**
 * worktree の名前とパスの規則（20260920-git-worktree-actions）。
 *
 * herdr（`da6bcd5`）の `src/worktree.rs` を TypeScript へ移したもの（Apache-2.0。`NOTICE` を参照）:
 * - `generatedBranchSlug` ← `generated_branch_slug`（`:21-32`）
 * - `parseWorktreeListPorcelain` ← `parse_worktree_list_porcelain`（`:425-492`）
 *
 * **ブランチ名 → パスの規則（`branchToPathSlug` / `defaultCheckoutPath`）は `@sodashitsu/protocol` にある**
 * ——web も同じ規則でプレビューを出すため。
 */

const ADJECTIVES = ["brave", "calm", "clear", "green", "lucky", "quiet", "rapid", "silver"] as const;
const NOUNS = ["river", "cloud", "field", "forest", "harbor", "meadow", "stone", "valley"] as const;
/** ブランチ名の頭。herdr と同じにして、同じ名前で作られるようにする。 */
export const WORKTREE_PREFIX = "worktree";

/** `worktree/<形容詞>-<名詞>-<4 桁 hex>`。herdr の実値と一致する（seed=0 → `worktree/brave-river-0000`）。 */
export function generatedBranchSlug(seed: number): string {
  const s = Math.abs(Math.trunc(seed));
  const adjective = ADJECTIVES[s % ADJECTIVES.length]!;
  const noun = NOUNS[Math.floor(s / ADJECTIVES.length) % NOUNS.length]!;
  const suffix = (s & 0xffff).toString(16).padStart(4, "0");
  return `${WORKTREE_PREFIX}/${adjective}-${noun}-${suffix}`;
}

/**
 * `git worktree list --porcelain` を読む。**空行で 1 エントリが確定**する。
 * **bare と prunable は落とす**（開けないものを一覧に出さない）。`prunable` は値が付くので**前方一致**。
 */
export function parseWorktreeListPorcelain(stdout: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  let skip = false; // bare か prunable

  const finish = (): void => {
    if (path !== null && !skip) out.push({ path, branch });
    path = null;
    branch = null;
    skip = false;
  };

  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line === "") {
      finish();
      continue;
    }
    if (line.startsWith("worktree ")) {
      finish(); // 空行が無いまま次が始まっても取りこぼさない
      path = line.slice("worktree ".length);
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "bare" || line.startsWith("prunable")) {
      skip = true;
    }
    // `detached` は branch を null のままにするだけなので、何もしない。
  }
  finish();
  return out;
}

/**
 * `git rev-parse --git-common-dir` の結果からリポジトリの名前を取る。
 *
 * **渡すのは絶対パス**。この値は**リポジトリの直下で実行すると相対の `.git` になる**ので、
 * 呼ぶ側で `cwd` に対して解決しておくこと（しないと名前が `.` になる）。
 */
export function repoNameFromGitCommonDir(absCommonDir: string): string {
  const normalized = absCommonDir.replace(/[/\\]+$/, "");
  const base = basename(normalized);
  const name = base === ".git" ? basename(dirname(normalized)) : base.replace(/\.git$/, "");
  return name === "" || name === "." || name === ".." ? "repo" : name;
}

/** `cwd` に対して `--git-common-dir` の値を絶対化する。 */
export function resolveCommonDir(cwd: string, commonDir: string): string {
  return resolve(cwd, commonDir.trim());
}
