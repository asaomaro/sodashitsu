import { describe, expect, it } from "vitest";
import { generatedBranchSlug, parseWorktreeListPorcelain, repoNameFromGitCommonDir, resolveCommonDir } from "./worktree.js";

// 期待値は herdr（`da6bcd5`）自身のテストの実値（`src/worktree.rs:580-582`・`:585-628`）。
describe("generatedBranchSlug", () => {
  it("herdr と同じ名前を作る", () => {
    expect(generatedBranchSlug(0)).toBe("worktree/brave-river-0000");
    expect(generatedBranchSlug(9)).toBe("worktree/calm-cloud-0009");
  });

  it("seed が大きくても 4 桁の hex に収まる", () => {
    expect(generatedBranchSlug(0x1_0000)).toMatch(/^worktree\/[a-z]+-[a-z]+-0000$/);
  });
});

describe("parseWorktreeListPorcelain", () => {
  it("path と branch を読み、refs/heads/ を落とす", () => {
    const out = parseWorktreeListPorcelain(["worktree /repo", "HEAD abc", "branch refs/heads/main", ""].join("\n"));
    expect(out).toEqual([{ path: "/repo", branch: "main" }]);
  });

  it("detached は branch が null", () => {
    const out = parseWorktreeListPorcelain(["worktree /w", "HEAD abc", "detached", ""].join("\n"));
    expect(out).toEqual([{ path: "/w", branch: null }]);
  });

  // 開けないものを一覧に出さない（AC4）。
  it("bare は落とす", () => {
    const out = parseWorktreeListPorcelain(["worktree /origin.git", "bare", "", "worktree /w", "branch refs/heads/x", ""].join("\n"));
    expect(out).toEqual([{ path: "/w", branch: "x" }]);
  });

  it("prunable は値が付いていても落とす（前方一致）", () => {
    const out = parseWorktreeListPorcelain(["worktree /gone", "prunable gitdir file points to non-existent location", "", "worktree /w", "branch refs/heads/x", ""].join("\n"));
    expect(out).toEqual([{ path: "/w", branch: "x" }]);
  });

  it("末尾に空行が無くても最後のエントリを取りこぼさない", () => {
    const out = parseWorktreeListPorcelain(["worktree /a", "branch refs/heads/a", "", "worktree /b", "branch refs/heads/b"].join("\n"));
    expect(out.map((e) => e.path)).toEqual(["/a", "/b"]);
  });
});

describe("repoNameFromGitCommonDir", () => {
  it(".git ならその親の名前", () => {
    expect(repoNameFromGitCommonDir("/home/me/soda/.git")).toBe("soda");
  });

  it("bare（<名前>.git）なら .git を落とした名前", () => {
    expect(repoNameFromGitCommonDir("/srv/repos/soda.git")).toBe("soda");
  });

  // 直下で実行すると `--git-common-dir` は相対の `.git` を返す。絶対化しないと名前が `.` になる。
  it("相対のまま渡すと名前が取れないので、resolveCommonDir で絶対化する", () => {
    expect(repoNameFromGitCommonDir(".git")).toBe("repo"); // 絶対化を忘れた場合の保険
    expect(repoNameFromGitCommonDir(resolveCommonDir("/home/me/soda", ".git"))).toBe("soda");
  });
});
