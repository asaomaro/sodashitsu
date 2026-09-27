import { homedir } from "node:os";
import { type WorktreeCreateResult, type WorktreeListResult, RpcError, defaultCheckoutPath } from "@sodashitsu/protocol";
import type { GitRunner } from "../infra/GitRunner.js";
import { isUsableDir as defaultIsUsableDir } from "../session/newCwd.js";
import type { SessionService } from "../session/SessionService.js";
import type { Logger } from "../log/Logger.js";
import { generatedBranchSlug, parseWorktreeListPorcelain, repoNameFromGitCommonDir, resolveCommonDir } from "./worktree.js";

const GIT_TIMEOUT_MS = 10_000; // `worktree add` は大きな repo だと数秒かかる

/**
 * worktree の一覧・作成・削除（一覧・作成は 20260920-git-worktree-actions。
 * 削除は 20260924-worktree-remove で追加）。
 */
export interface WorktreeService {
  list(workspaceId: string): Promise<WorktreeListResult>;
  create(workspaceId: string, branch: string): Promise<WorktreeCreateResult>;
  remove(workspaceId: string, path: string, force: boolean): Promise<void>;
}

/** 作成先の根。herdr は `~/.herdr/worktrees`。`/` 区切りに正規化して返す（web がそのまま連結する）。 */
export function defaultWorktreeRoot(home = homedir()): string {
  return `${home.replace(/\\/g, "/").replace(/\/+$/, "")}/.sodashitsu/worktrees`;
}

/**
 * git の失敗を**種類に分ける**。生の診断は利用者に見せない（D107）ので、ここで code に畳む。
 * **`LC_ALL=C` で英語に固定してある**前提（`GitRunner`）。
 * **理由は stderr の 1 行目ではない**——`git worktree add` は失敗時も 1 行目が
 * `Preparing worktree (...)` なので、`fatal:` / `error:` の行を探す。
 */
export function classifyWorktreeError(
  stderr: string,
): "worktree_branch_in_use" | "worktree_path_exists" | "worktree_no_commits" | "worktree_invalid_branch" | "worktree_failed" {
  const line = stderr.split("\n").find((l) => /^(fatal|error):/.test(l.trim())) ?? "";
  if (/is already used by worktree at/.test(line)) return "worktree_branch_in_use";
  if (/already exists/.test(line)) return "worktree_path_exists";
  // コミットが 1 つも無い repo。`--git-common-dir` は成功するので、ここまで来て初めて分かる
  // （`Workspace.git` は `rev-parse --abbrev-ref HEAD` で落ちるためメニューには項目が出ないが、
  //  `prefix+G` は D3 の方針どおり常に効くので、この経路で理由を届ける必要がある）。
  if (/invalid reference: HEAD/.test(line)) return "worktree_no_commits";
  // ダイアログは空白以外を何でも確定でき、プレビューは空白を `-` に畳んだもっともらしいパスを見せるので、
  // **ここで分けないと「サーバのログを確かめてください」になり、名前を変えればよいと分からない**
  // （実測: `worktree add -b "foo bar"` → `fatal: 'foo bar' is not a valid branch name`）。
  if (/is not a valid branch name/.test(line)) return "worktree_invalid_branch";
  // 階層の衝突も「名前を変えればよい」種類（実測: `foo` があるとき `foo/bar` は
  // `fatal: cannot lock ref 'refs/heads/foo/bar': 'refs/heads/foo' exists; ...`）。
  // Git のブランチは refs のディレクトリなので、`foo` と `foo/bar` は同時に存在できない。
  if (/cannot lock ref .*exists; cannot create/.test(line)) return "worktree_invalid_branch";
  return "worktree_failed";
}

/**
 * `git worktree remove` の失敗を種類に分ける（`classifyWorktreeError` の `remove` 版。
 * 20260924-worktree-remove。design「依拠する既存の事実」で実機確認した文字列）。
 * `worktree_locked`（20260925-worktree-remove-locked）: `git worktree lock` 済みの対象は
 * `--force` を1回渡しても解決しない（git は `-f -f` を要求する）ため別の種類として分ける。
 * ロック済みかつ dirty でも、常にロックのエラーが先に（単独で）返ることを実機確認済み
 * （design「依拠する既存の事実」）——分岐の順序は判定結果を左右しない。
 */
export function classifyWorktreeRemoveError(
  stderr: string,
): "worktree_dirty" | "worktree_not_a_worktree" | "worktree_is_main" | "worktree_locked" | "worktree_failed" {
  const line = stderr.split("\n").find((l) => /^(fatal|error):/.test(l.trim())) ?? "";
  if (/cannot remove a locked working tree/.test(line)) return "worktree_locked";
  // untracked/modified なファイルが残っている・submodule を含む、のどちらも `--force` で解決する
  // 同じ種類として扱う（design「依拠する既存の事実」。herdr の分類と同じ）。
  if (/contains modified or untracked files/.test(line)) return "worktree_dirty";
  if (/working trees containing submodules cannot be moved or removed/.test(line)) return "worktree_dirty";
  if (/is not a working tree/.test(line)) return "worktree_not_a_worktree";
  if (/is a main working tree/.test(line)) return "worktree_is_main";
  return "worktree_failed";
}

export class DefaultWorktreeService implements WorktreeService {
  constructor(
    private readonly session: SessionService,
    private readonly git: GitRunner,
    private readonly log: Logger,
    private readonly root: string = defaultWorktreeRoot(),
    private readonly now: () => number = Date.now,
    private readonly isUsableDir: (path: string) => Promise<boolean> = defaultIsUsableDir,
  ) {}

  /**
   * git を走らせる。**`GitRunner` の reject（git が無い・時間切れ）も `RpcError` に包む**——
   * 包まないと `ControlSurface` が `internal` に潰し、利用者には「サーバの内部でエラー」としか出ない
   * （design「エラー処理 / 異常系」）。exit≠0 は reject ではないので、判断は呼ぶ側に返す。
   */
  private async run(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    try {
      return await this.git.run(cwd, args, GIT_TIMEOUT_MS);
    } catch (err) {
      this.log.warn("git could not be run", { cwd, args, err: String(err) });
      throw new RpcError("worktree_failed", `git could not be run: ${args[0] ?? ""}`);
    }
  }

  /**
   * workspace のいまの場所（最初の pane の場所）を引く——サイドバーの git の情報とメニューの出し分け（`ws.git`）と同じ場所
   * （20260926-workspace-label-follow-cwd の review ラウンド 1。herdr も worktree の操作は追従した git の情報から取る）。
   * いまの場所が使えない（最初の pane がいる worktree を消した直後等）なら開いた場所。`SessionService` の外なので `NotFoundError` には乗れず、自分で投げる。
   */
  private async cwdOf(workspaceId: string): Promise<string> {
    const cwd = this.session.identityCwdOf(workspaceId);
    const ws = this.session.getWorkspace(workspaceId);
    if (cwd === undefined || !ws) throw new RpcError("not_found", `workspace ${workspaceId} not found`);
    return cwd === ws.cwd || (await this.isUsableDir(cwd)) ? cwd : ws.cwd;
  }

  /**
   * リポジトリの名前を取る。ここが**「git リポジトリか」の判定も兼ねる**（`rev-parse` が落ちれば git ではない）。
   * `create` からも呼ぶので `list` とは分けてある——名前だけ要るときに一覧まで取らないため。
   */
  private async repoNameOf(cwd: string): Promise<string> {
    const common = await this.run(cwd, ["rev-parse", "--git-common-dir"]);
    if (common.code !== 0) throw new RpcError("not_a_git_repository", `not a git repository: ${cwd}`);
    // 直下で実行すると相対の `.git` が返るので、必ず cwd に対して解決する。
    return repoNameFromGitCommonDir(resolveCommonDir(cwd, common.stdout));
  }

  async list(workspaceId: string): Promise<WorktreeListResult> {
    const cwd = await this.cwdOf(workspaceId);
    const repoName = await this.repoNameOf(cwd);

    const listed = await this.run(cwd, ["worktree", "list", "--porcelain"]);
    if (listed.code !== 0) throw new RpcError("worktree_failed", "failed to list worktrees");

    return {
      worktreeRoot: this.root,
      repoName,
      suggestedBranch: generatedBranchSlug(this.now()),
      entries: parseWorktreeListPorcelain(listed.stdout),
    };
  }

  async create(workspaceId: string, branch: string): Promise<WorktreeCreateResult> {
    const cwd = await this.cwdOf(workspaceId);
    const repoName = await this.repoNameOf(cwd); // 名前だけ要るので一覧は取らない（git かどうかもここで分かる）
    const path = defaultCheckoutPath(this.root, repoName, branch);

    // `show-ref` の **exit 1 は「そのブランチが無い」で正常**。0 以外をまとめてエラーにしない。
    const ref = await this.run(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    const exists = ref.code === 0;
    const args = exists ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, "HEAD"];

    const added = await this.run(cwd, args);
    if (added.code !== 0) {
      const code = classifyWorktreeError(added.stderr);
      // 生の診断は**ログにだけ**残す（利用者には code から引いた日本語が出る）。
      this.log.warn("worktree add failed", { workspaceId, branch, path, code, stderr: added.stderr.trim() });
      throw new RpcError(code, `git worktree add failed (${code})`);
    }
    return { path: await this.recordedPath(path) };
  }

  /**
   * worktree checkout を消す（20260924-worktree-remove。design「振る舞いの詳細」）。
   * **`git worktree remove` を先に実行し、成功したときだけ開いている workspace を閉じる**——
   * 逆にすると、dirty で失敗した場合に動いているシェルを先に失う（design「設計方針」）。
   */
  async remove(workspaceId: string, path: string, force: boolean): Promise<void> {
    const cwd = await this.cwdOf(workspaceId);
    // `--force` を**2回**渡す（`-f -f`）——ロック済みの対象は1回では解決しない（実機確認。
    // design「依拠する既存の事実」。20260925-worktree-remove-locked）。ロックされていない
    // 通常の dirty worktree の削除にも副作用は無いことを実機確認済み。
    const args = ["worktree", "remove", ...(force ? ["--force", "--force"] : []), path];
    const removed = await this.run(cwd, args);
    if (removed.code !== 0) {
      const code = classifyWorktreeRemoveError(removed.stderr);
      this.log.warn("worktree remove failed", { workspaceId, path, force, code, stderr: removed.stderr.trim() });
      throw new RpcError(code, `git worktree remove failed (${code})`);
    }
    const openWorkspace = this.session.snapshot().workspaces.find((w) => w.cwd === path);
    if (openWorkspace) await this.session.closeWorkspace(openWorkspace.id);
  }

  /**
   * **git が実際に記録したパスを返す**（cross 点検の must）。`worktree add` に渡した文字列と、
   * `worktree list --porcelain` が返す文字列は**別物になりうる**——git は symlink を解決して記録するので、
   * `$HOME` の経路に symlink が 1 つでもあると食い違う（実測: `/tmp/l/wt1` で add → list は `/tmp/real/wt1`）。
   * web の「既に開いている」判定は `cwd` の完全一致なので（`ActionDispatcher.confirmWorktreeOpen`）、
   * ここで揃えておかないと**作った worktree を一覧から選ぶと 2 つ目の workspace ができる**。
   * 新しい worktree で `rev-parse --show-toplevel` を引くと `list` と同じ文字列が返る（実測で一致を確認）。
   */
  private async recordedPath(path: string): Promise<string> {
    // **`this.run` は使わない**——あれは reject を `RpcError` に変換して投げるので、時間切れ等で
    // 「worktree は作られているのに失敗しました」になってしまう（削除手段がこの work に無い）。
    // ここは add が成功した後なので、**引けなければ組み立てた文字列のまま返す**のが正しい。
    try {
      const top = await this.git.run(path, ["rev-parse", "--show-toplevel"], GIT_TIMEOUT_MS);
      if (top.code === 0 && top.stdout.trim()) return top.stdout.trim();
      // **無言で落とさない**——ここを通ると D5 の不変条件（create と list のパスが一致する）が
      // 痕跡なく劣化し、「一覧から選ぶと 2 つ目の workspace ができる」が静かに戻る。
      this.log.warn("could not read the recorded worktree path; falling back to the composed one", { path, code: top.code });
      return path;
    } catch (err) {
      this.log.warn("could not read the recorded worktree path; falling back to the composed one", { path, err: String(err) });
      return path;
    }
  }
}
