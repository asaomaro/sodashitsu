import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  autoWorkspaceLabel,
  defaultWorkspaceLabelDeps,
  findGitRoot,
  folderLabel,
  gitConfigValue,
  type WorkspaceLabelDeps,
} from "./workspaceLabel.js";

/** 偽のファイルシステム。値が文字列ならファイル（中身）、`null` ならディレクトリ。親のディレクトリは自動で足す。 */
function fakeFs(entries: Record<string, string | null>, home = "/home/u"): WorkspaceLabelDeps {
  const all = new Map<string, string | null>();
  for (const [p, v] of Object.entries(entries)) {
    all.set(p, v);
    for (let d = posix.dirname(p); !all.has(d); d = posix.dirname(d)) {
      all.set(d, null);
      if (d === "/") break;
    }
  }
  // OS と同じく `..` を畳んで引く（呼ぶ側が字面の cwd を resolve しないと、根が `/r/a/..` のまま返る——を捕まえるため）。
  const at = (p: string) => all.get(posix.normalize(p));
  const has = (p: string) => all.has(posix.normalize(p));
  return {
    stat: async (p) => (has(p) ? { isDirectory: at(p) === null, isFile: at(p) !== null } : null),
    readFile: async (p) => {
      const v = at(p);
      return typeof v === "string" ? v : null;
    },
    home: () => home,
    path: posix,
  };
}

const repo = { "/r/.git/HEAD": "ref: refs/heads/main\n", "/r/a/b/file.txt": "x" };

afterEach(() => {
  vi.useRealTimers();
});

describe("folderLabel（herdr の fallback_label_from_cwd）", () => {
  it("ホームは ~、そうでなければ末尾の名前、それも無ければパスそのもの", () => {
    expect(folderLabel("/home/u", "/home/u", posix)).toBe("~");
    expect(folderLabel("/home/u/", "/home/u", posix)).toBe("~");
    expect(folderLabel("/srv/app/", "/home/u", posix)).toBe("app");
    expect(folderLabel("/", "/home/u", posix)).toBe("/");
    expect(folderLabel("/home/u/x", "", posix), "ホームが分からなくても末尾の名前").toBe("x");
  });

  // Windows の CI は無いので `path.win32` を渡して確かめる（design「ドメイン固有の考慮」）。
  it("Windows の形：ドライブの根はパスそのもの、ホームは大小を問わず ~", () => {
    expect(folderLabel("C:\\", "C:\\Users\\u", win32)).toBe("C:\\");
    expect(folderLabel("c:\\users\\u", "C:\\Users\\u", win32)).toBe("~");
    expect(folderLabel("C:\\Users\\u\\repo", "C:\\Users\\u", win32)).toBe("repo");
    expect(folderLabel("/home/U", "/home/u", posix), "POSIX は大小を区別する").toBe("U");
  });
});

describe("gitConfigValue（herdr の read_git_config_value）", () => {
  it("節とキーは大小を問わず、値の後ろの注記を捨てる", () => {
    const text =
      '# c\n[core]\n\trepositoryformatversion = 0\n\tBare = TRUE ; 注記\n[remote "origin"]\n\tbare = false\n';
    expect(gitConfigValue(text, "core", "bare")).toBe("TRUE");
    expect(gitConfigValue("[Core]\nbare=true#x\n", "core", "bare"), "空白の無い # は値の一部").toBe(
      "true#x",
    );
    expect(gitConfigValue("[core]\nfilemode = true\n", "core", "bare")).toBeNull();
    expect(
      gitConfigValue('[remote "origin"]\nbare = true\n', "core", "bare"),
      "引用符つきの節は見ない",
    ).toBeNull();
  });

  // herdr の `simple_git_config_section` は引用符つき・閉じていない見出しを節の区切りとみなさず、前の節のまま読み進める。
  it("引用符つき・閉じていない見出しは素通りし、前の節のまま（herdr と同じ）", () => {
    expect(gitConfigValue('[core]\n[remote "x"]\nbare = true\n', "core", "bare")).toBe("true");
    expect(gitConfigValue("[core]\n[broken\nbare = true\n", "core", "bare")).toBe("true");
    expect(gitConfigValue("[user]\n[core\nbare = true\n", "core", "bare")).toBeNull();
  });
});

describe("findGitRoot（herdr の git_repo_root）", () => {
  it("サブディレクトリから親へたどって、.git に HEAD がある階層を返す", async () => {
    expect(await findGitRoot("/r/a/b", fakeFs(repo))).toBe("/r");
    expect(await findGitRoot("/r/a/b/file.txt", fakeFs(repo)), "ファイルなら親から").toBe("/r");
    expect(await findGitRoot("/r", fakeFs(repo))).toBe("/r");
  });

  it("中に HEAD の無い .git は根にしない", async () => {
    expect(await findGitRoot("/r/a", fakeFs({ "/r/.git/objects/x": "", "/r/a/f": "" }))).toBeNull();
  });

  it(".git がファイルなら gitdir: をたどる（worktree は絶対、submodule は相対）", async () => {
    const fs = fakeFs({
      ...repo,
      "/r/.git/worktrees/wt/HEAD": "ref: refs/heads/feat\n",
      "/wt/.git": "gitdir: /r/.git/worktrees/wt\n",
      "/wt/src/f": "",
      "/r/.git/modules/sub/HEAD": "ref: refs/heads/main\n",
      "/r/sub/.git": "  gitdir:   ../.git/modules/sub  \n",
      "/r/sub/lib/f": "",
    });
    expect(await findGitRoot("/wt/src", fs)).toBe("/wt");
    expect(await findGitRoot("/r/sub/lib", fs)).toBe("/r/sub");
  });

  it("gitdir: で始まらない .git ファイルの階層は根にせず、親へ進む", async () => {
    expect(
      await findGitRoot(
        "/r/x/y",
        fakeFs({ ...repo, "/r/x/.git": "not a pointer", "/r/x/y/f": "" }),
      ),
    ).toBe("/r");
  });

  it("bare の形（HEAD・objects・refs）でなければ、core.bare = true でも根にしない", async () => {
    expect(
      await findGitRoot(
        "/b/x",
        fakeFs({ "/b/HEAD": "ref: x\n", "/b/config": "[core]\nbare = true\n", "/b/x/f": "" }),
      ),
    ).toBeNull();
  });

  it("core.bare の値は大小を問わない", async () => {
    const bare = { "/b/HEAD": "ref: refs/heads/main\n", "/b/objects/x": "", "/b/refs/heads/x": "" };
    expect(
      await findGitRoot("/b/refs", fakeFs({ ...bare, "/b/config": "[core]\n\tbare = TRUE\n" })),
    ).toBe("/b");
  });

  it("字面に .. を含む場所は畳んでからたどる（根が /r/a/.. のまま返らない）", async () => {
    expect(await findGitRoot("/r/a/..", fakeFs(repo))).toBe("/r");
    expect(await autoWorkspaceLabel("/r/a/..", fakeFs(repo))).toBe("r");
  });

  it("bare のリポジトリ（core.bare = true）はその場所自身が根。bare = false の形は根にしない", async () => {
    const bare = { "/b/HEAD": "ref: refs/heads/main\n", "/b/objects/x": "", "/b/refs/heads/x": "" };
    expect(
      await findGitRoot("/b/refs", fakeFs({ ...bare, "/b/config": "[core]\n\tbare = true\n" })),
    ).toBe("/b");
    expect(
      await findGitRoot("/b/refs", fakeFs({ ...bare, "/b/config": "[core]\n\tbare = false\n" })),
    ).toBeNull();
  });

  it(".git の中（hooks）で開いても、主の根を返す", async () => {
    const fs = fakeFs({
      ...repo,
      "/r/.git/objects/x": "",
      "/r/.git/refs/heads/main": "",
      "/r/.git/config": "[core]\n\tbare = false\n",
      "/r/.git/hooks/pre-commit": "",
    });
    expect(await findGitRoot("/r/.git/hooks", fs)).toBe("/r");
  });

  it("無い場所からでも親へたどる。git がどこにも無ければ null", async () => {
    expect(await findGitRoot("/r/gone/deeper", fakeFs(repo))).toBe("/r");
    expect(await findGitRoot("/plain/dir", fakeFs({ "/plain/dir/f": "" }))).toBeNull();
  });
});

describe("autoWorkspaceLabel", () => {
  it("根があれば根の名前、無ければフォルダ名の規則", async () => {
    expect(await autoWorkspaceLabel("/r/a/b", fakeFs(repo))).toBe("r");
    expect(await autoWorkspaceLabel("/plain/dir", fakeFs({ "/plain/dir/f": "" }))).toBe("dir");
    expect(await autoWorkspaceLabel("/home/u", fakeFs({ "/home/u/f": "" }))).toBe("~");
  });

  it("根が / のときは、根の名前（空）ではなくフォルダ名の規則", async () => {
    expect(
      await autoWorkspaceLabel("/srv/app", fakeFs({ "/.git/HEAD": "ref: x\n", "/srv/app/f": "" })),
    ).toBe("app");
  });

  it("根を探すのが上限（200ms）を超えたら、フォルダ名の規則にする。上限の前には決まらない", async () => {
    vi.useFakeTimers();
    const deps: WorkspaceLabelDeps = { ...fakeFs(repo), stat: () => new Promise(() => undefined) };
    const pending = autoWorkspaceLabel("/r/a/b", deps);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(199);
    expect(settled, "上限の前には決まらない").toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("b");
  });

  // 待つのをやめても出した stat は取り消されない。上限の後に親へ stat を出し続けると、応答しない fs では libuv のスレッドを塞ぐ数が増える。
  it("上限を超えたら、それ以上 fs に問い合わせず、onTimeout を 1 度呼ぶ", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    let timeouts = 0;
    const base = fakeFs(repo);
    const deps: WorkspaceLabelDeps = {
      ...base,
      stat: (p) => {
        calls.push(p);
        // 最初の 1 つだけ上限（200ms）より遅れて返る——返った後に親へたどり続けるかを見る（永遠に返らないと、たどりが進まず見分けられない）。
        if (calls.length > 1) return base.stat(p);
        return new Promise((resolve) => setTimeout(() => void base.stat(p).then(resolve), 500));
      },
      onTimeout: () => timeouts++,
    };
    const pending = autoWorkspaceLabel("/r/a/b", deps);
    await vi.advanceTimersByTimeAsync(200);
    expect(await pending).toBe("b");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls, "止まった 1 つの後は問い合わせない").toEqual(["/r/a/b"]);
    expect(timeouts).toBe(1);
  });

  it("上限より先に決まったら、上限のタイマーを残さない", async () => {
    vi.useFakeTimers();
    expect(await autoWorkspaceLabel("/r/a/b", fakeFs(repo))).toBe("r");
    expect(vi.getTimerCount()).toBe(0);
  });

  // 作成を失敗させない——`home()` が投げても（`os.homedir()` は HOME も passwd も無いと投げる）、最後はパスの末尾の名前。
  it("fs やホームが投げても投げず、パスの末尾の名前かパスそのものを返す", async () => {
    const throwing: WorkspaceLabelDeps = {
      stat: () => {
        throw new Error("sync");
      },
      readFile: async () => null,
      home: () => {
        throw new Error("no home");
      },
      path: posix,
    };
    expect(await autoWorkspaceLabel("/srv/app", throwing)).toBe("app");
    expect(await autoWorkspaceLabel("/", throwing)).toBe("/");
  });
});

// 本物のファイルシステムで、AC1〜AC3 の 3 通りを確かめる（git のコマンドは前提を作るためだけに使う。規則は使わない）。
describe("本物の一時ディレクトリ", () => {
  const run = promisify(execFile);
  let base = "";
  afterEach(async () => {
    if (base) await rm(base, { recursive: true, force: true });
    base = "";
  });
  const git = (cwd: string, ...args: string[]) =>
    run("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd });

  it("git のリポジトリのサブディレクトリ・worktree のサブディレクトリ・git の無いフォルダ", async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "soda-label-")));
    const repoDir = join(base, "my-repo");
    await mkdir(join(repoDir, "src", "deep"), { recursive: true });
    await git(repoDir, "init", "-q", "-b", "main");
    await git(repoDir, "commit", "-q", "--allow-empty", "-m", "init");
    await git(repoDir, "worktree", "add", "-q", join(base, "feat-wt"));
    await mkdir(join(base, "feat-wt", "pkg"), { recursive: true });
    await mkdir(join(base, "plain", "sub"), { recursive: true });

    const deps = defaultWorkspaceLabelDeps;
    expect(await findGitRoot(join(repoDir, "src", "deep"), deps)).toBe(repoDir);
    expect(await autoWorkspaceLabel(join(repoDir, "src", "deep"), deps)).toBe("my-repo");
    expect(
      await findGitRoot(join(base, "feat-wt", "pkg"), deps),
      "worktree はその worktree の根",
    ).toBe(join(base, "feat-wt"));
    expect(await autoWorkspaceLabel(join(base, "feat-wt", "pkg"), deps)).toBe("feat-wt");
    expect(await findGitRoot(join(base, "plain", "sub"), deps)).toBeNull();
    expect(await autoWorkspaceLabel(join(base, "plain", "sub"), deps)).toBe("sub");
  });
});
