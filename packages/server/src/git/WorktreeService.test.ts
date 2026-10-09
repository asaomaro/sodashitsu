import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Workspace } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import type { SessionService } from "../session/SessionService.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { ChildProcessGitRunner } from "../infra/GitRunner.js";
import { DefaultWorktreeService, classifyWorktreeError, classifyWorktreeRemoveError, defaultWorktreeRoot } from "./WorktreeService.js";

const git = new ChildProcessGitRunner();
async function runGit(cwd: string, args: string[]): Promise<void> {
  const r = await git.run(cwd, args, 10_000);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

/**
 * `identityCwdOf`・`getWorkspace`（一覧・作成用。いまの場所と開いた場所——20260926-workspace-label-follow-cwd）に加え、20260924-worktree-remove から `snapshot`（cwd→workspace
 * の逆引き）・`closeWorkspace`（実際には閉じず、呼ばれた id を記録するだけ）も持つ代役
 * （git の振る舞いに集中するため）。`openWorkspaces` は「今開いている workspace」として
 * `snapshot().workspaces` に載せる。
 */
function sessionWith(cwd: string | null, openWorkspaces: Workspace[] = []): SessionService & { closedWorkspaceIds: string[] } {
  const closedWorkspaceIds: string[] = [];
  return {
    identityCwdOf: (): string | undefined => (cwd === null ? undefined : cwd),
    getWorkspace: (): Workspace | undefined => (cwd === null ? undefined : ({ cwd } as Workspace)),
    snapshot: () => ({ workspaces: openWorkspaces }),
    closeWorkspace: async (id: string) => {
      closedWorkspaceIds.push(id);
    },
    closedWorkspaceIds,
  } as unknown as SessionService & { closedWorkspaceIds: string[] };
}

describe("DefaultWorktreeService（本物の git を使う。既存の GitInfoPoller.test.ts と同じ流儀）", () => {
  let repo: string;
  let root: string;

  beforeEach(async () => {
    repo = await makeTempDir("soda-worktree-repo-");
    root = await makeTempDir("soda-worktree-root-");
    await runGit(repo, ["init", "-b", "main"]);
    await runGit(repo, ["config", "user.email", "t@example.com"]);
    await runGit(repo, ["config", "user.name", "t"]);
    await runGit(repo, ["commit", "-q", "--allow-empty", "-m", "init"]);
  });

  function make(cwd: string | null = repo): DefaultWorktreeService {
    return new DefaultWorktreeService(sessionWith(cwd), git, new MemoryLogger(), root, () => 0);
  }

  it("inspectForFork：リポジトリの根・作成先・既存のブランチ・コミットしていない変更の数（20261009-agent-fork）", async () => {
    await mkdir(join(repo, "sub"), { recursive: true });
    await writeFile(join(repo, "sub", "a.txt"), "x");
    await writeFile(join(repo, "b.txt"), "y");
    const out = await make().inspectForFork(join(repo, "sub"), "feature/x"); // サブフォルダからでも根を返す
    expect(out.repoRoot).toBe(await realpath(repo));
    expect(out.dirtyCount).toBe(2); // 未追跡の 2 つ（sub/ は 1 行にまとまる）
    expect(out.branchExists).toBe(false);
    expect(out.targetPath).toBe(`${root}/${out.repoName}/feature-x`);
    await runGit(repo, ["branch", "feature/y"]);
    expect((await make().inspectForFork(repo, "feature/y")).branchExists).toBe(true);
    const noBranch = await make().inspectForFork(repo);
    expect(noBranch).toMatchObject({ branchExists: null, targetPath: null });
  });

  it("inspectForFork：git のリポジトリでなければ not_a_git_repository", async () => {
    const plain = await makeTempDir("soda-worktree-plain-");
    await expect(make().inspectForFork(plain)).rejects.toMatchObject({ code: "not_a_git_repository" });
  });

  it("create に fromDir を渡すと、workspace の場所ではなく、そのリポジトリの HEAD から切る", async () => {
    const other = await makeTempDir("soda-worktree-other-");
    await runGit(other, ["init", "-b", "main"]);
    await runGit(other, ["config", "user.email", "t@example.com"]);
    await runGit(other, ["config", "user.name", "t"]);
    await runGit(other, ["commit", "-q", "--allow-empty", "-m", "other-init"]);
    const created = await make(repo).create("w1", "from-other", other); // workspace は repo にあるが、元は other
    const list = await make(other).list("w1");
    expect(list.entries.map((e) => e.branch)).toContain("from-other");
    expect(created.path).toContain("from-other");
  });

  it("list：リポジトリ名と候補のブランチ名を返し、自分自身を一覧に載せる", async () => {
    const out = await make().list("w1");
    expect(out.repoName).not.toBe("."); // 直下で実行すると `--git-common-dir` は相対の `.git`。絶対化していないとこうなる
    expect(out.suggestedBranch).toBe("worktree/brave-river-0000"); // seed=0
    expect(out.worktreeRoot).toBe(root);
    expect(out.entries.map((e) => e.branch)).toEqual(["main"]);
  });

  // 20260926-workspace-label-follow-cwd（review ラウンド 1）：開いた場所ではなく、最初の pane のいまの場所（サイドバーの git の情報と同じ）で git を走らせる。
  it("list・create は workspace のいまの場所（identityCwdOf）のリポジトリで行う（開いた場所ではない）", async () => {
    const plain = await makeTempDir("soda-worktree-plain-");
    const session = {
      getWorkspace: (): Workspace => ({ cwd: plain }) as Workspace, // 開いた場所は git の外
      identityCwdOf: (): string => repo, // 最初の pane はリポジトリへ移った
      snapshot: () => ({ workspaces: [] }),
    } as unknown as SessionService;
    const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);
    expect((await svc.list("w1")).entries.map((e) => e.branch)).toEqual(["main"]);
    await expect(svc.create("w1", "feature/y")).resolves.toMatchObject({ path: expect.stringContaining("feature-y") });
  });

  // 最初の pane がいる worktree をその workspace のメニューから消した直後、web は一覧を開き直す——消えた場所では git を起こせない（T6 の点検）。
  it("いまの場所が消えていれば、開いた場所のリポジトリで行う", async () => {
    const session = {
      getWorkspace: (): Workspace => ({ cwd: repo }) as Workspace,
      identityCwdOf: (): string => join(root, "gone"),
      snapshot: () => ({ workspaces: [] }),
    } as unknown as SessionService;
    const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);
    expect((await svc.list("w1")).entries.map((e) => e.branch)).toEqual(["main"]);
  });

  it("create：新しいブランチで worktree ができ、一覧に増える", async () => {
    const created = await make().create("w1", "feature/x");
    expect(created.path).toBe(`${root}/${(await make().list("w1")).repoName}/feature-x`);
    const after = await make().list("w1");
    expect(after.entries.map((e) => e.branch).sort()).toEqual(["feature/x", "main"]);
  });

  it("create：既にあるブランチでも作れる（-b を付けない）", async () => {
    await runGit(repo, ["branch", "existing"]);
    const created = await make().create("w1", "existing");
    expect(created.path).toContain("/existing");
  });

  // ここが AC7 の核心：ケースごとに**別のコード**になる。文言は web が code から引く。
  // 実測（git 2.43）：**同じブランチを 2 回**作ると、git は「ブランチが使用中」ではなく
  // **「パスが既にある」**を返す——作成先がブランチ名から決まるので、先にパスがぶつかるため。
  it("create：同じブランチを 2 回なら worktree_path_exists（パスが先にぶつかる）", async () => {
    await make().create("w1", "dup");
    await expect(make().create("w1", "dup")).rejects.toMatchObject({ code: "worktree_path_exists" });
  });

  // ブランチだけが別の場所で使われていて、作成先は空いている場合。
  it("create：そのブランチが別の場所で使われていれば worktree_branch_in_use", async () => {
    const elsewhere = join(await makeTempDir("soda-worktree-else-"), "co");
    await runGit(repo, ["worktree", "add", "-q", "-b", "taken", elsewhere, "HEAD"]);
    await expect(make().create("w1", "taken")).rejects.toMatchObject({ code: "worktree_branch_in_use" });
  });

  // 実測：**空のディレクトリへは成功する**（git が許す）ので、中身のあるディレクトリで確かめる。
  it("create：作成先に中身のあるディレクトリがあれば worktree_path_exists", async () => {
    const repoName = (await make().list("w1")).repoName;
    const dir = join(root, repoName, "occupied");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "f"), "x");
    await expect(make().create("w1", "occupied")).rejects.toMatchObject({ code: "worktree_path_exists" });
  });

  it("git でないディレクトリなら not_a_git_repository", async () => {
    const plain = await makeTempDir("soda-worktree-plain-");
    await expect(make(plain).list("w1")).rejects.toMatchObject({ code: "not_a_git_repository" });
  });

  it("workspace が無ければ not_found", async () => {
    await expect(make(null).list("missing")).rejects.toBeInstanceOf(RpcError);
    await expect(make(null).list("missing")).rejects.toMatchObject({ code: "not_found" });
  });

  // cross 点検の must。**git は記録するパスの symlink を解決する**ので、`worktree add` に渡した文字列と
  // `worktree list --porcelain` が返す文字列は食い違いうる。web の「既に開いている」判定は cwd の完全一致
  // （`ActionDispatcher.confirmWorktreeOpen`）なので、ここが揃っていないと**作った worktree を一覧から
  // 選ぶと同じ場所に 2 つ目の workspace ができる**（AC6 が防ごうとした事象そのもの）。
  it("create：返すパスは、git が実際に記録したもの（root が symlink 経由でも一覧と一致する。AC6）", async () => {
    const real = await makeTempDir("soda-worktree-real-");
    const link = join(await makeTempDir("soda-worktree-link-"), "root");
    await symlink(real, link);
    const svc = new DefaultWorktreeService(sessionWith(repo), git, new MemoryLogger(), link, () => 0);

    const created = await svc.create("w1", "via-link");
    const listed = (await svc.list("w1")).entries.find((e) => e.branch === "via-link");
    expect(listed, "作ったものが一覧に出ている").toBeDefined();
    expect(created.path, "create の戻り値が list と同じ文字列").toBe(listed!.path);
    expect(created.path).toContain(real); // symlink 側ではなく解決後
  });

  // `--git-common-dir` は成功するので、ここまで来ないと分からない（メニューの出し分けとは判定が違う）。
  it("create：コミットが 1 つも無い repo なら worktree_no_commits", async () => {
    const empty = await makeTempDir("soda-worktree-empty-");
    await runGit(empty, ["init", "-b", "main"]);
    await expect(make(empty).create("w1", "x")).rejects.toMatchObject({ code: "worktree_no_commits" });
  });

  // ダイアログは空白入りを素通しし、プレビューは `-` に畳んだもっともらしいパスを見せるので、
  // ここで分けないと「サーバのログを確かめてください」になり、名前を変えればよいと分からない。
  it("create：Git が受け付けないブランチ名なら worktree_invalid_branch", async () => {
    await expect(make().create("w1", "foo bar")).rejects.toMatchObject({ code: "worktree_invalid_branch" });
  });

  // Git のブランチは refs のディレクトリなので `foo` と `foo/bar` は同時に存在できない。
  // これも「名前を変えればよい」種類なので、catch-all に落とさない。
  it("create：既存ブランチと階層が衝突する名前も worktree_invalid_branch", async () => {
    await runGit(repo, ["branch", "foo"]);
    await expect(make().create("w1", "foo/bar")).rejects.toMatchObject({ code: "worktree_invalid_branch" });
  });

  // `recordedPath` は add が**成功した後**に呼ばれる。ここで投げると、worktree は作られているのに
  // 「失敗しました」になり、削除手段がこの work に無いので片付けられなくなる。
  it("create：記録パスを引けなくても、作成自体は失敗にしない（組み立てた文字列で返す）", async () => {
    const flaky = {
      run: (cwd: string, args: string[], ms: number) =>
        args[0] === "rev-parse" && args[1] === "--show-toplevel"
          ? Promise.reject(new Error("timeout"))
          : git.run(cwd, args, ms),
    };
    const svc = new DefaultWorktreeService(sessionWith(repo), flaky, new MemoryLogger(), root, () => 0);
    const created = await svc.create("w1", "flaky");
    expect(created.path).toBe(`${root}/${(await make().list("w1")).repoName}/flaky`);
  });

  // `GitRunner` が reject する経路（git が無い・時間切れ）。包まないと `ControlSurface` が `internal` に潰し、
  // 利用者には「サーバの内部でエラー」としか出ない（design「エラー処理 / 異常系」）。
  it("git を起動できなければ、素の Error ではなく RpcError(worktree_failed) にする", async () => {
    const broken = { run: () => Promise.reject(new Error("spawn git ENOENT")) };
    const svc = new DefaultWorktreeService(sessionWith(repo), broken, new MemoryLogger(), root, () => 0);
    await expect(svc.list("w1")).rejects.toBeInstanceOf(RpcError);
    await expect(svc.list("w1")).rejects.toMatchObject({ code: "worktree_failed" });
  });

  // 20260924-worktree-remove。
  describe("remove", () => {
    it("成功すると、その worktree は一覧から消える。開いている workspace は無いので closeWorkspace は呼ばない", async () => {
      const created = await make().create("w1", "feature/x");
      const session = sessionWith(repo); // openWorkspaces 無し
      const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);

      await svc.remove("w1", created.path, false);

      const after = await make().list("w1");
      expect(after.entries.map((e) => e.branch)).not.toContain("feature/x");
      expect(session.closedWorkspaceIds).toEqual([]);
    });

    it("開いている workspace の cwd と一致すれば、成功後にその workspace を閉じる（AC5・AC10）", async () => {
      const created = await make().create("w1", "feature/y");
      const session = sessionWith(repo, [{ id: "w9", cwd: created.path } as Workspace]);
      const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);

      await svc.remove("w1", created.path, false);

      expect(session.closedWorkspaceIds).toEqual(["w9"]);
    });

    // taskcheck の must 指摘：design の最重要の安全策（git worktree remove を先に実行し、
    // 成功したときだけ close する）を、削除対象が実際に開いている workspace と一致する状況で
    // 直接確かめる——一致する候補が無いと、close 呼び出しの順序を壊しても検出できない。
    it("開いている workspace と一致していても、dirty で失敗すれば closeWorkspace は呼ばない（design の最重要の安全策）", async () => {
      const created = await make().create("w1", "feature/dirty");
      await writeFile(join(created.path, "untracked.txt"), "x");
      const session = sessionWith(repo, [{ id: "w9", cwd: created.path } as Workspace]);
      const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);

      await expect(svc.remove("w1", created.path, false)).rejects.toMatchObject({ code: "worktree_dirty" });

      const after = await make().list("w1");
      expect(after.entries.map((e) => e.branch)).toContain("feature/dirty"); // 消えていない
      expect(session.closedWorkspaceIds).toEqual([]); // 先に close していない
    });

    it("dirty でも --force を付ければ削除できる（AC7・AC8）", async () => {
      const created = await make().create("w1", "feature/force");
      await writeFile(join(created.path, "untracked.txt"), "x");
      const session = sessionWith(repo, [{ id: "w9", cwd: created.path } as Workspace]);
      const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);

      await svc.remove("w1", created.path, true);

      const after = await make().list("w1");
      expect(after.entries.map((e) => e.branch)).not.toContain("feature/force");
      expect(session.closedWorkspaceIds).toEqual(["w9"]); // dirty 経路でも、成功すれば同じく閉じる
    });

    // 20260925-worktree-remove-locked。`git worktree lock` した本物の worktree で確認する
    // （既存の describe("remove", ...) の流儀と同じ）。
    it("ロック済みだと worktree_locked で失敗する（force 無し。AC1）", async () => {
      const created = await make().create("w1", "feature/locked");
      await runGit(repo, ["worktree", "lock", created.path]);
      const svc = new DefaultWorktreeService(sessionWith(repo), git, new MemoryLogger(), root, () => 0);

      await expect(svc.remove("w1", created.path, false)).rejects.toMatchObject({ code: "worktree_locked" });

      const after = await make().list("w1");
      expect(after.entries.map((e) => e.branch)).toContain("feature/locked"); // 消えていない
    });

    it("ロック済み（かつ dirty）でも --force で削除できる（AC3）", async () => {
      const created = await make().create("w1", "feature/locked-dirty");
      await writeFile(join(created.path, "untracked.txt"), "x");
      await runGit(repo, ["worktree", "lock", created.path]);
      const session = sessionWith(repo, [{ id: "w9", cwd: created.path } as Workspace]);
      const svc = new DefaultWorktreeService(session, git, new MemoryLogger(), root, () => 0);

      await svc.remove("w1", created.path, true);

      const after = await make().list("w1");
      expect(after.entries.map((e) => e.branch)).not.toContain("feature/locked-dirty");
      expect(session.closedWorkspaceIds).toEqual(["w9"]);
    });

    it("既に worktree でない対象は worktree_not_a_worktree（AC9）", async () => {
      const notAWorktree = await makeTempDir("soda-worktree-not-a-worktree-");
      const svc = new DefaultWorktreeService(sessionWith(repo), git, new MemoryLogger(), root, () => 0);
      await expect(svc.remove("w1", notAWorktree, false)).rejects.toMatchObject({ code: "worktree_not_a_worktree" });
    });

    it("main working tree（clone した元のディレクトリ）は削除できない: worktree_is_main", async () => {
      const svc = new DefaultWorktreeService(sessionWith(repo), git, new MemoryLogger(), root, () => 0);
      await expect(svc.remove("w1", repo, false)).rejects.toMatchObject({ code: "worktree_is_main" });
    });

    it("workspace が無ければ not_found（cwdOf と同じ経路）", async () => {
      const svc = new DefaultWorktreeService(sessionWith(null), git, new MemoryLogger(), root, () => 0);
      await expect(svc.remove("missing", "/anywhere", false)).rejects.toMatchObject({ code: "not_found" });
    });
  });
});

describe("classifyWorktreeError", () => {
  // `git worktree add` は**失敗時も 1 行目が進行の表示**。理由は `fatal:` の行にある。
  it("1 行目の Preparing worktree に釣られず、fatal: の行を見る", () => {
    const stderr = "Preparing worktree (new branch 'x')\nfatal: 'x' is already used by worktree at '/w/x'\n";
    expect(classifyWorktreeError(stderr)).toBe("worktree_branch_in_use");
  });

  it("パスが既にある", () => {
    expect(classifyWorktreeError("Preparing worktree\nfatal: '/w/x' already exists\n")).toBe("worktree_path_exists");
  });

  it("コミットが 1 つも無い repo", () => {
    expect(classifyWorktreeError("Preparing worktree\nfatal: invalid reference: HEAD\n")).toBe("worktree_no_commits");
  });

  it("Git が受け付けないブランチ名", () => {
    expect(classifyWorktreeError("Preparing worktree\nfatal: 'foo bar' is not a valid branch name\n")).toBe("worktree_invalid_branch");
  });

  it("既存ブランチとの階層の衝突", () => {
    const stderr = "Preparing worktree\nfatal: cannot lock ref 'refs/heads/foo/bar': 'refs/heads/foo' exists; cannot create 'refs/heads/foo/bar'\n";
    expect(classifyWorktreeError(stderr)).toBe("worktree_invalid_branch");
  });

  it("知らない理由は worktree_failed", () => {
    expect(classifyWorktreeError("fatal: something else\n")).toBe("worktree_failed");
  });
});

// 20260924-worktree-remove。文字列は design.md「依拠する既存の事実」参照
// （dirty・not_a_working_tree・main working tree はこのリポジトリの git 2.43 で実測済み）。
describe("classifyWorktreeRemoveError", () => {
  it("未コミットの変更が残っている（実測）", () => {
    const stderr = "fatal: '../wt1' contains modified or untracked files, use --force to delete it\n";
    expect(classifyWorktreeRemoveError(stderr)).toBe("worktree_dirty");
  });

  // **未検証**（herdr のソースにのみ確認がある文字列。このリポジトリに submodule が無く実機未検証。
  // design.md「実現性 / リスク」参照）。
  it("submodule を含む場合も dirty と同じ扱い（--force で解決するため。未検証・herdr 由来の文字列）", () => {
    const stderr = "fatal: working trees containing submodules cannot be moved or removed\n";
    expect(classifyWorktreeRemoveError(stderr)).toBe("worktree_dirty");
  });

  // 20260925-worktree-remove-locked。文字列は design.md「依拠する既存の事実」の実機確認
  // （git 2.43.0）参照。
  it("ロック済み（reason 付き）", () => {
    const stderr = "fatal: cannot remove a locked working tree, lock reason: test lock\nuse 'remove -f -f' to override or unlock first\n";
    expect(classifyWorktreeRemoveError(stderr)).toBe("worktree_locked");
  });

  it("ロック済み（reason 無し）", () => {
    const stderr = "fatal: cannot remove a locked working tree;\nuse 'remove -f -f' to override or unlock first\n";
    expect(classifyWorktreeRemoveError(stderr)).toBe("worktree_locked");
  });

  it("既に worktree でない", () => {
    expect(classifyWorktreeRemoveError("fatal: '../does-not-exist' is not a working tree\n")).toBe("worktree_not_a_worktree");
  });

  it("main working tree", () => {
    expect(classifyWorktreeRemoveError("fatal: '.' is a main working tree\n")).toBe("worktree_is_main");
  });

  it("知らない理由は worktree_failed", () => {
    expect(classifyWorktreeRemoveError("fatal: something else\n")).toBe("worktree_failed");
  });
});

describe("defaultWorktreeRoot", () => {
  it("ホームの下の .sodashitsu/worktrees を / 区切りで返す", () => {
    expect(defaultWorktreeRoot("/home/me")).toBe("/home/me/.sodashitsu/worktrees");
    expect(defaultWorktreeRoot("C:\\Users\\me")).toBe("C:/Users/me/.sodashitsu/worktrees");
  });
});
