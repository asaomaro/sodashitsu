import { describe, expect, it } from "vitest";
import type { GitInfo, Workspace } from "@sodashitsu/protocol";
import { paneMoveBlock, paneMoveBlockMessage } from "./paneMoveScope.js";

type Ws = Pick<Workspace, "id" | "cwd" | "git"> & Partial<Pick<Workspace, "groupId" | "representative">>;

function git(over: Partial<GitInfo> & { worktreeKey?: string | null }): GitInfo {
  return { repoKey: "/repo/.git", isLinkedWorktree: false, branch: "main", ...over } as unknown as GitInfo;
}
function ws(id: string, cwd: string, g: GitInfo | null, extra: Partial<Ws> = {}): Ws {
  return { id, cwd, git: g, ...extra };
}

const both = [false, true];

describe.each(both)("paneMoveBlock (lenient=%s)", (lenient) => {
  const o = { lenient };

  it("(1) 同じ id は git・cwd が何でも null", () => {
    expect(paneMoveBlock(ws("a", "/x", null), ws("a", "/y", git({ worktreeKey: "k" })), o)).toBeNull();
  });

  it("(2) 両方に同じ worktreeKey → null（representative・cwd が違っても）", () => {
    const a = ws("a", "/r", git({ worktreeKey: "/r/.git" }), { representative: true });
    const b = ws("b", "/r/sub", git({ worktreeKey: "/r/.git" }), { representative: false });
    expect(paneMoveBlock(a, b, o)).toBeNull();
    expect(paneMoveBlock(b, a, o)).toBeNull();
  });

  it("(3) 違う worktreeKey → different_worktree（repoKey が同じでも・cwd が同じでも）", () => {
    const a = ws("a", "/r", git({ worktreeKey: "/r/.git" }));
    const b = ws("b", "/r-wt", git({ worktreeKey: "/r/.git/worktrees/wt", isLinkedWorktree: true }));
    expect(paneMoveBlock(a, b, o)).toBe("different_worktree");
    const c = ws("c", "/r", git({ worktreeKey: "/r/.git/worktrees/wt", isLinkedWorktree: true }));
    expect(paneMoveBlock(a, c, o)).toBe("different_worktree");
  });

  it("(4) 両方 git: null は cwd で比べる（末尾の / は無視・根は同じ）", () => {
    expect(paneMoveBlock(ws("a", "/a", null), ws("b", "/a", null), o)).toBeNull();
    expect(paneMoveBlock(ws("a", "/a", null), ws("b", "/b", null), o)).toBe("different_worktree");
    expect(paneMoveBlock(ws("a", "/a", null), ws("b", "/a/", null), o)).toBeNull();
    expect(paneMoveBlock(ws("a", "/", null), ws("b", "/", null), o)).toBeNull();
    // Windows の区切り（末尾だけ落とす。大文字小文字は比べない）。
    expect(paneMoveBlock(ws("a", "C:\\a\\", null), ws("b", "C:\\a", null), o)).toBeNull();
    expect(paneMoveBlock(ws("a", "C:\\a", null), ws("b", "C:\\b", null), o)).toBe("different_worktree");
    expect(paneMoveBlock(ws("a", "C:\\a", null), ws("b", "c:\\a", null), o)).toBe("different_worktree");
  });

  it("(5) 片方に worktreeKey、片方が git: null → different_worktree（cwd が同じでも・両方の向き）", () => {
    const a = ws("a", "/a", git({ worktreeKey: "/a/.git" }));
    const b = ws("b", "/a", null);
    expect(paneMoveBlock(a, b, o)).toBe("different_worktree");
    expect(paneMoveBlock(b, a, o)).toBe("different_worktree");
  });

  it("(7) groupId が違っても結果は変わらない・文言は空でない", () => {
    const a = ws("a", "/r", git({ worktreeKey: "k" }), { groupId: "g1" });
    const b = ws("b", "/r", git({ worktreeKey: "k" }), { groupId: "g2" });
    expect(paneMoveBlock(a, b, o)).toBeNull();
    expect(paneMoveBlockMessage("different_worktree").length).toBeGreaterThan(0);
  });
});

describe("paneMoveBlock: worktreeKey の無い git（古いサーバ・古い保存）", () => {
  const noKeys = [
    ["項目が無い", git({})],
    ["null", git({ worktreeKey: null })],
  ] as const;
  for (const [label, g] of noKeys) {
    it(`(6) ${label}: lenient → null、なし → different_worktree`, () => {
      const a = ws("a", "/a", g);
      for (const other of [ws("b", "/b", null), ws("c", "/c", git({ worktreeKey: "k" })), ws("d", "/d", g)]) {
        expect(paneMoveBlock(a, other, { lenient: true })).toBeNull();
        expect(paneMoveBlock(other, a, { lenient: true })).toBeNull();
        expect(paneMoveBlock(a, other)).toBe("different_worktree");
        expect(paneMoveBlock(other, a, {})).toBe("different_worktree");
      }
    });
  }
});
