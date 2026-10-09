import { RpcError, type AgentInfo, type Pane } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import type { ForkSourceInfo } from "../git/WorktreeService.js";
import { AgentForkRunner } from "./AgentForkRunner.js";

const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const agent: AgentInfo = { instanceId: "i1", kind: "claude", label: "c", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0 };
const pane = (over: Partial<Pane> = {}): Pane =>
  ({ id: "p1", tabId: "t1", label: null, cwd: "/repo/sub", shell: "", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent, agentSession: { kind: "claude", sessionId: ID, reportedAt: 1 }, ...over }) as Pane;
const info = (over: Partial<ForkSourceInfo> = {}): ForkSourceInfo => ({ repoRoot: "/repo", repoName: "repo", suggestedBranch: "worktree/x", branchExists: null, targetPath: null, dirtyCount: 0, ...over });

function make(p: Pane | undefined, inspect: (dir: string, branch?: string) => Promise<ForkSourceInfo>, platform: NodeJS.Platform = "linux") {
  const calls: unknown[] = [];
  const runner = new AgentForkRunner({
    session: { getPane: () => p },
    worktrees: { inspectForFork: async (d, b) => (calls.push([d, b]), inspect(d, b)) },
    platform,
  });
  return { runner, calls };
}

describe("AgentForkRunner.preview（読み取りだけ）", () => {
  it("fork できる pane: 元のフォルダ（リポジトリの根）・作成先・ブランチの有無・変更の数・会話の id の先頭 8 文字", async () => {
    const { runner, calls } = make(pane(), async () => info({ branchExists: true, targetPath: "/wt/repo/b", dirtyCount: 3 }));
    const r = await runner.preview({ paneId: "p1", branch: "b" });
    expect(r).toMatchObject({ available: true, worktreeAvailable: true, sourceDir: "/repo", targetPath: "/wt/repo/b", branchExists: true, dirtyCount: 3, sessionHead: "3e81f9a7", noteUnsafe: false });
    expect(calls).toEqual([["/repo/sub", "b"]]); // pane の cwd から引く
    expect(JSON.stringify(r)).not.toContain(ID); // 会話の id の全体は返さない
  });
  it("fork できない理由を返し、git には触れない", async () => {
    for (const [p, reason] of [
      [undefined, "pane_not_found"],
      [pane({ agent: null }), "no_agent"],
      [pane({ agentSession: null }), "no_session_id"],
      [pane({ agentSession: { kind: "claude", sessionId: "../x", reportedAt: 1 } }), "bad_session_id"],
      [pane({ shell: "/usr/bin/fish" }), "unsupported_shell"],
    ] as const) {
      const { runner, calls } = make(p, async () => info());
      const r = await runner.preview({ paneId: "p1" });
      expect(r, reason).toMatchObject({ available: false, reason, worktreeAvailable: false });
      if (reason !== "unsupported_shell") expect(calls).toEqual([]);
    }
  });
  it("Windows のサーバは unsupported_shell", async () => {
    const { runner } = make(pane(), async () => info(), "win32");
    expect(await runner.preview({ paneId: "p1" })).toMatchObject({ available: false, reason: "unsupported_shell" });
  });
  it("git のリポジトリでなければ、同じフォルダの fork はできるが worktree はできない（理由つき）", async () => {
    const { runner } = make(pane(), async () => {
      throw new RpcError("not_a_git_repository", "x");
    });
    expect(await runner.preview({ paneId: "p1", branch: "b" })).toMatchObject({ available: true, worktreeAvailable: false, worktreeReason: "not_a_git_repository" });
  });
  it("パスに制御文字があれば、最初の知らせは送れない（noteUnsafe）", async () => {
    const { runner } = make(pane(), async () => info({ repoRoot: "/re\npo", targetPath: "/wt/ok" }));
    expect(await runner.preview({ paneId: "p1", branch: "b" })).toMatchObject({ noteUnsafe: true });
  });
});
