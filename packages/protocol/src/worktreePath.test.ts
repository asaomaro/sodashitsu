import { describe, expect, it } from "vitest";
import { branchToPathSlug, defaultCheckoutPath } from "./worktreePath.js";

// 期待値は herdr（`da6bcd5`）自身のテストの実値をそのまま使う
// （`src/worktree.rs:631-641`・`:741-750`）。同じ場所に同じ名前で作られることがこの規則の狙い。
describe("branchToPathSlug", () => {
  it("英数字はそのまま小文字にする", () => {
    expect(branchToPathSlug("worktree/brave-river")).toBe("worktree-brave-river");
  });

  it("英数字以外の連続は - 1 個に畳む", () => {
    expect(branchToPathSlug("issue/137 Worktree Spaces")).toBe("issue-137-worktree-spaces");
    // **連続した区切り**を 1 個に畳むのがこの規則の要。畳まないと `a--b` になる。
    // （負の対照で分かった：上の 1 行だけでは区切りが連続しておらず、畳み込みを外しても通ってしまった）
    expect(branchToPathSlug("a//b")).toBe("a-b");
    expect(branchToPathSlug("x /- y")).toBe("x-y");
  });

  it("全て区切り文字なら worktree に落とす", () => {
    expect(branchToPathSlug("///")).toBe("worktree");
  });

  it("前後の - は落とす", () => {
    expect(branchToPathSlug("/feature/")).toBe("feature");
  });

  // この畳み込みが、入力で親ディレクトリへ抜けるのを防いでいる（作成先が根の外へ出ない）。
  it("`..` や絶対パスを入れても区切りにならない", () => {
    expect(branchToPathSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(branchToPathSlug("/tmp/x")).toBe("tmp-x");
  });
});

describe("defaultCheckoutPath", () => {
  it("<root>/<repo>/<slug> の順に組み立てる", () => {
    expect(defaultCheckoutPath("/home/me/.sodashitsu/worktrees", "soda", "worktree/brave-river")).toBe(
      "/home/me/.sodashitsu/worktrees/soda/worktree-brave-river",
    );
  });

  it("根の末尾の / は重ねない", () => {
    expect(defaultCheckoutPath("/root/", "r", "b")).toBe("/root/r/b");
  });
});
