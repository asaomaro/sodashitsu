import {
  RpcError,
  type AgentForkPreviewParams,
  type AgentForkPreviewResult,
  type ForkUnavailableReason,
} from "@sodashitsu/protocol";
import type { WorktreeService } from "../git/WorktreeService.js";
import type { SessionService } from "../session/SessionService.js";
import { checkForkable, isSafeNotePath } from "./agentFork.js";
import { OTHER_SHELLS, shellNameOf } from "./agentStart.js";

/**
 * エージェントの fork の、1 回ごとの手順と待ち（20261009-agent-fork の A1）。このファイルは、読み取りだけの `preview` から始める。
 * 元の pane の会話の id は、**サーバが pane の記録から引く**（クライアントから受け取らない。AC5）。
 */
export interface AgentForkRunnerDeps {
  session: Pick<SessionService, "getPane">;
  worktrees: Pick<WorktreeService, "inspectForFork">;
  platform?: NodeJS.Platform;
}

export class AgentForkRunner {
  private readonly platform: NodeJS.Platform;

  constructor(protected readonly deps: AgentForkRunnerDeps) {
    this.platform = deps.platform ?? process.platform;
  }

  /** 元の pane のシェルが、起動に使えない種類（fish・pwsh など）か、Windows のサーバか。作る前に断るための確かめ（S5）。 */
  protected shellUnsupported(shell: string): boolean {
    if (this.platform === "win32") return true;
    return shell !== "" && OTHER_SHELLS.has(shellNameOf(shell));
  }

  /** `agent.fork` と同じ確かめを、何も作らずにやる（表示用。`agent.fork` は必ずやり直す。R7）。 */
  async preview(params: AgentForkPreviewParams): Promise<AgentForkPreviewResult> {
    const pane = this.deps.session.getPane(params.paneId);
    const forkable = checkForkable(pane);
    let reason: ForkUnavailableReason | undefined = forkable.ok ? undefined : forkable.reason;
    if (forkable.ok && this.shellUnsupported(forkable.pane.shell)) reason = "unsupported_shell";
    const base: AgentForkPreviewResult = {
      available: reason === undefined,
      ...(reason !== undefined ? { reason } : {}),
      ...(forkable.ok ? { sessionHead: forkable.sessionId.slice(0, 8) } : {}),
      worktreeAvailable: false,
      sourceDir: null,
      targetPath: null,
      suggestedBranch: null,
      branchExists: null,
      dirtyCount: null,
      noteUnsafe: false,
    };
    if (!pane || !forkable.ok) return base;
    try {
      const info = await this.deps.worktrees.inspectForFork(pane.cwd, params.branch);
      return {
        ...base,
        worktreeAvailable: reason === undefined,
        sourceDir: info.repoRoot,
        targetPath: info.targetPath,
        suggestedBranch: info.suggestedBranch,
        branchExists: info.branchExists,
        dirtyCount: info.dirtyCount,
        noteUnsafe: !isSafeNotePath(info.repoRoot) || (info.targetPath !== null && !isSafeNotePath(info.targetPath)),
      };
    } catch (err) {
      if (err instanceof RpcError) {
        const worktreeReason = err.code === "not_a_git_repository" ? ("not_a_git_repository" as const) : ("worktree_failed" as const);
        return { ...base, sourceDir: pane.cwd, worktreeReason };
      }
      throw err;
    }
  }
}
