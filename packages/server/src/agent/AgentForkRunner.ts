import {
  AGENT_START_DEFAULT_TIMEOUT_MS,
  RpcError,
  type AgentForkParams,
  type AgentForkPreviewParams,
  type AgentForkPreviewResult,
  type AgentForkProgress,
  type AgentForkResult,
  type AgentInfo,
  type ForkCreated,
  type ForkNoteStatus,
  type ForkUnavailableReason,
} from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { ForkSourceInfo, WorktreeService } from "../git/WorktreeService.js";
import type { Logger } from "../log/Logger.js";
import type { SessionService } from "../session/SessionService.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import { AGENT_PROMPT_SUBMIT_DELAY_MS, pastePayload } from "./agentInput.js";
import { OTHER_SHELLS, shellNameOf } from "./agentStart.js";
import { checkForkable, forkArgs, forkNameCandidates, forkNoteText, isSafeNotePath } from "./agentFork.js";
import type { AgentStarter } from "./AgentStarter.js";
import { detectedAgent, handsFree, waitForAgent, waitForShellReady } from "./agentWait.js";

/**
 * エージェントの fork の、1 回ごとの手順と待ち（20261009-agent-fork の A1）。元の pane の会話の id は、**サーバが pane の記録から引く**
 * （クライアントから受け取らない。AC5）。`fork` は、起動のコマンドを打ち込むところまでを前で行って**新しい pane の id を返し**、その後の
 * 検知・手が空くのを待つこと・最初の知らせは裏で続けて、進み具合を `agent.fork_progress` のできごとで配る。
 */
export interface AgentForkRunnerDeps {
  session: Pick<SessionService, "getPane" | "getTab" | "splitPane" | "createWorkspace" | "closePane" | "assertAgentNameAvailable">;
  worktrees: Pick<WorktreeService, "inspectForFork" | "create">;
  terminals: Pick<TerminalManager, "get">;
  starter: Pick<AgentStarter, "start" | "isShellAvailable">;
  bus: Pick<EventBus, "subscribe" | "publish">;
  logger: Logger;
  /** 新しい pane のノードに、fork の注記を書く（T4）。書けたら true。無ければ書かない。 */
  annotate?: (newPaneId: string, sourcePaneId: string) => Promise<boolean>;
  platform?: NodeJS.Platform;
  /** 待ちの長さ（テストで縮める）。 */
  timing?: Partial<ForkTiming>;
}

export interface ForkTiming {
  /** 検知を待つ上限。 */
  detectMs: number;
  /** 最初の知らせを送る予定のとき、手が空くのを待つ上限（A8。10 分）。 */
  noteWaitMs: number;
  /** 知らせを送らないとき、進み具合のために手が空くのを待つ上限。 */
  readyWaitMs: number;
  /** 手が空いたと見えてから、まだ空いているか見直すまでの間。 */
  settleMs: number;
  /** 新しい pane のシェルの入力待ちの上限（A2。5 秒）。 */
  shellMaxMs: number;
  shellQuietMs: number;
  shellMinWaitMs: number;
}
const DEFAULT_TIMING: ForkTiming = {
  detectMs: AGENT_START_DEFAULT_TIMEOUT_MS,
  noteWaitMs: 10 * 60_000,
  readyWaitMs: 2 * 60_000,
  settleMs: 800,
  shellMaxMs: 5000,
  shellQuietMs: 300,
  shellMinWaitMs: 2000,
};

export interface ForkHooks {
  /** 新しい pane ができた直後（操作したクライアントの大きさで始めるため）。 */
  onPaneCreated?: (paneId: string) => void;
}

const SOURCE_AGENT_CHANGED = "元の pane のエージェントが、入れ替わった（または居なくなった）ため、止めました";

export class AgentForkRunner {
  private readonly platform: NodeJS.Platform;
  private readonly timing: ForkTiming;
  /** fork の手順の前半が進行中の、元の pane（二重押しを弾く。S6）。 */
  private readonly inProgress = new Set<string>();
  private readonly aborter = new AbortController();

  constructor(protected readonly deps: AgentForkRunnerDeps) {
    this.platform = deps.platform ?? process.platform;
    this.timing = { ...DEFAULT_TIMING, ...deps.timing };
  }

  /** 裏の続き（検知・手が空くのを待つこと・知らせ）をやめる。サーバが止まるとき。 */
  close(): void {
    this.aborter.abort();
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

  private progress(p: AgentForkProgress): void {
    this.deps.bus.publish({ event: "agent.fork_progress", data: p });
  }

  /**
   * fork する。失敗したら `RpcError`（`fork_unavailable`・`fork_branch_exists`・`fork_shell_not_ready`・`fork_in_progress`・`fork_failed`、
   * worktree の作成の失敗はその code）。作ったもの（pane・workspace・worktree）は、起動の前に失敗した同じフォルダの pane 以外は残し、
   * 何が残ったかをメッセージと `agent.fork_progress`（`failed`）に載せる（A11）。
   */
  async fork(params: AgentForkParams, hooks: ForkHooks = {}): Promise<AgentForkResult> {
    const { paneId: sourcePaneId } = params;
    if (this.inProgress.has(sourcePaneId)) throw new RpcError("fork_in_progress", `a fork of pane ${sourcePaneId} is already in progress`);
    this.inProgress.add(sourcePaneId);
    try {
      return await this.forkLocked(params, hooks);
    } finally {
      this.inProgress.delete(sourcePaneId);
    }
  }

  private async forkLocked(params: AgentForkParams, hooks: ForkHooks): Promise<AgentForkResult> {
    const { session } = this.deps;
    const sourcePaneId = params.paneId;
    // 1. 確かめ（preview を信用せず、必ずやり直す）。何も作らない。
    const source = session.getPane(sourcePaneId);
    const forkable = checkForkable(source);
    if (!forkable.ok) throw new RpcError("fork_unavailable", `${forkable.reason}: this agent cannot be forked`);
    if (this.shellUnsupported(forkable.pane.shell)) throw new RpcError("fork_unavailable", "unsupported_shell: this pane's shell cannot start an agent");
    const { sessionId, agent: sourceAgent, pane } = forkable;
    const sourceInstance = sourceAgent.instanceId;
    const worktree = params.target.kind === "worktree" ? params.target : null;
    let info: ForkSourceInfo | null = null;
    if (worktree) {
      info = await this.deps.worktrees.inspectForFork(pane.cwd, worktree.branch); // git のリポジトリでなければ not_a_git_repository
      if (info.branchExists === true) throw new RpcError("fork_branch_exists", `branch ${worktree.branch} already exists`);
    }
    const name = this.chooseName(sourceAgent.name, sourcePaneId);
    // 最初の知らせ（worktree のときだけ。送らない選択・送れないパスの形）。
    let noteStatus: ForkNoteStatus = "off";
    let noteReason: string | undefined;
    let noteText: string | null = null;
    if (worktree && info && params.note !== false) {
      const target = info.targetPath;
      if (target === null || !isSafeNotePath(target) || !isSafeNotePath(info.repoRoot)) {
        noteStatus = "skipped";
        noteReason = "フォルダのパスに制御文字・改行などが含まれるため、最初の知らせは送れません";
      } else {
        noteStatus = "pending";
        // 注記に書く「作業フォルダ」は、git が記録した実パス（`create` の結果）に差し替える（下）。ここでは仮に作成先を入れる。
      }
    }

    // 2. 行き先を作る。
    const created: ForkCreated = {};
    let newPaneId: string;
    let workspaceId: string;
    if (!worktree) {
      const direction = pane.cols >= pane.rows * 2 ? "right" : "down"; // 広いほうの辺（セルは縦長なので、列は行の 2 倍で比べる）。A9
      let split;
      try {
        split = await session.splitPane(sourcePaneId, direction, undefined, { policy: "follow" });
      } catch (err) {
        throw this.failure(err, "pane を足せませんでした", created);
      }
      newPaneId = split.pane.id;
      created.paneId = newPaneId;
      if (split.cwdFallback) {
        await session.closePane(newPaneId).catch(() => undefined);
        throw new RpcError("fork_failed", "元の pane の場所を引き継げなかったため、止めました（新しい pane は閉じました）");
      }
      workspaceId = session.getTab(split.pane.tabId)?.workspaceId ?? "";
    } else {
      const sourceWorkspaceId = session.getTab(pane.tabId)?.workspaceId;
      if (!sourceWorkspaceId) throw new RpcError("fork_failed", `workspace of pane ${sourcePaneId} not found`);
      let wt;
      try {
        wt = await this.deps.worktrees.create(sourceWorkspaceId, worktree.branch, info!.repoRoot);
      } catch (err) {
        throw this.failure(err, "worktree を作れませんでした", created);
      }
      created.worktreePath = wt.path;
      let ws;
      try {
        ws = await session.createWorkspace(wt.path, worktree.branch);
      } catch (err) {
        throw this.failure(err, `workspace を開けませんでした。worktree は残っています（${wt.path}）`, created);
      }
      newPaneId = ws.pane.id;
      workspaceId = ws.workspace.id;
      created.workspaceId = workspaceId;
      created.paneId = newPaneId;
      if (noteStatus === "pending") {
        if (!isSafeNotePath(wt.path)) {
          noteStatus = "skipped";
          noteReason = "フォルダのパスに制御文字・改行などが含まれるため、最初の知らせは送れません";
        } else {
          noteText = forkNoteText(wt.path, info!.repoRoot);
        }
      }
    }
    hooks.onPaneCreated?.(newPaneId);
    this.progress({ sourcePaneId, paneId: newPaneId, stage: "pane_created", created });

    // 3. 新しい pane のシェルが、入力を受けられるのを待つ（A2）。切れたら pane は残す。
    const host = this.deps.terminals.get(newPaneId);
    const ready = host
      ? await waitForShellReady(host, () => this.deps.starter.isShellAvailable(newPaneId), {
          quietMs: this.timing.shellQuietMs,
          maxMs: this.timing.shellMaxMs,
          minWaitMs: this.timing.shellMinWaitMs,
        })
      : false;
    if (!ready) {
      const err = new RpcError("fork_shell_not_ready", `the shell of the new pane did not become ready (pane ${newPaneId} is left open)`);
      this.progress({ sourcePaneId, paneId: newPaneId, stage: "failed", code: err.code, message: err.message, created });
      throw err;
    }

    // 4. 起動の直前に、元のエージェントが同じままか確かめる。
    if (session.getPane(sourcePaneId)?.agent?.instanceId !== sourceInstance) {
      await this.discardIfSame(!worktree, newPaneId);
      throw this.stopped(SOURCE_AGENT_CHANGED, created, !worktree, sourcePaneId, newPaneId);
    }

    // 5. 起動。固定の表の実行ファイルと、既存の引用の関数だけを使う（`--resume <id> --fork-session`）。
    let usedName = name;
    try {
      usedName = await this.start(newPaneId, name, sourceAgent.name, sourcePaneId, sessionId);
    } catch (err) {
      await this.discardIfSame(!worktree, newPaneId);
      throw this.stopped(`起動のコマンドを打ち込めませんでした（${err instanceof RpcError ? err.code : "error"}）`, created, !worktree, sourcePaneId, newPaneId);
    }
    let annotated = false;
    try {
      annotated = (await this.deps.annotate?.(newPaneId, sourcePaneId)) ?? false;
    } catch (err) {
      this.deps.logger.warn("agent.fork: annotate failed", { error: String(err) });
    }
    this.progress({ sourcePaneId, paneId: newPaneId, stage: "launched", noteStatus, ...(noteReason ? { noteReason } : {}), created });
    void this.continueInBackground({ sourcePaneId, newPaneId, created, noteText, noteStatus }).catch((err) => {
      this.deps.logger.warn("agent.fork: background failed", { error: String(err) });
    });
    return {
      paneId: newPaneId,
      workspaceId,
      name: usedName,
      target: worktree ? "worktree" : "same",
      ...(created.worktreePath ? { worktreePath: created.worktreePath } : {}),
      noteStatus,
      ...(noteReason ? { noteReason } : {}),
      annotated,
    };
  }

  /** 名前の候補のうち、いま空いているもの。 */
  private chooseName(sourceName: string | undefined, sourcePaneId: string): string {
    for (const c of forkNameCandidates(sourceName, sourcePaneId)) {
      try {
        this.deps.session.assertAgentNameAvailable(c, null);
        return c;
      } catch {
        /* 使われている。次の候補 */
      }
    }
    throw new RpcError("fork_failed", "no free agent name for the forked agent");
  }

  /** 起動のコマンドを打ち込む。名前が取り合いで取られたときだけ、次の候補で 3 回までやり直す。 */
  private async start(newPaneId: string, firstName: string, sourceName: string | undefined, sourcePaneId: string, sessionId: string): Promise<string> {
    let name = firstName;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.deps.starter.start({ name, kind: "claude", paneId: newPaneId, args: forkArgs(sessionId) }, undefined, { skipInterrupt: true });
        return name;
      } catch (err) {
        if (!(err instanceof RpcError) || err.code !== "agent_name_taken" || attempt >= 2) throw err;
        name = this.chooseName(sourceName, sourcePaneId);
      }
    }
  }

  private async discardIfSame(same: boolean, paneId: string): Promise<void> {
    if (same) await this.deps.session.closePane(paneId).catch(() => undefined);
  }

  private stopped(message: string, created: ForkCreated, closedNewPane: boolean, sourcePaneId: string, newPaneId: string): RpcError {
    const remain = closedNewPane ? "新しい pane は閉じました" : `作ったものは残してあります（${describeCreated(created)}）`;
    const err = new RpcError("fork_failed", `${message}。${remain}`);
    this.progress({ sourcePaneId, ...(closedNewPane ? {} : { paneId: newPaneId }), stage: "failed", code: err.code, message: err.message, created: closedNewPane ? {} : created });
    return err;
  }

  private failure(err: unknown, what: string, created: ForkCreated): RpcError {
    const remain = Object.keys(created).length > 0 ? `作ったものは残してあります（${describeCreated(created)}）` : "何も作っていません";
    if (err instanceof RpcError) return new RpcError(err.code, `${what}: ${err.message}。${remain}`);
    return new RpcError("fork_failed", `${what}。${remain}`);
  }

  /** 検知 → 手が空く → 最初の知らせ。応答の後に裏で続け、進み具合をできごとで配る。 */
  private async continueInBackground(ctx: { sourcePaneId: string; newPaneId: string; created: ForkCreated; noteText: string | null; noteStatus: ForkNoteStatus }): Promise<void> {
    const { sourcePaneId, newPaneId, created } = ctx;
    let noteStatus = ctx.noteStatus;
    let noteReason: string | undefined;
    const emit = (stage: AgentForkProgress["stage"], extra: Partial<AgentForkProgress> = {}): void =>
      this.progress({ sourcePaneId, paneId: newPaneId, stage, noteStatus, ...(noteReason ? { noteReason } : {}), created, ...extra });
    const waitDeps = {
      bus: this.deps.bus,
      agentOf: (id: string): AgentInfo | null | undefined => {
        const p = this.deps.session.getPane(id);
        return p ? p.agent : undefined;
      },
    };
    const signal = this.aborter.signal;
    // 検知。
    const detected = await waitForAgent(waitDeps, newPaneId, detectedAgent("claude"), this.timing.detectMs, signal);
    if (!detected.ok) {
      if (detected.reason === "aborted") return;
      const message = detected.reason === "pane_closed" ? "新しい pane が閉じられました" : this.launchFailureReason(newPaneId);
      if (noteStatus === "pending") {
        noteStatus = "skipped";
        noteReason = "エージェントが起動しなかったため、送っていません";
      }
      emit("failed", { code: "fork_failed", message });
      return;
    }
    if (detected.value.kind === "kind_mismatch") {
      if (noteStatus === "pending") {
        noteStatus = "skipped";
        noteReason = "起動したのが Claude Code ではなかったため、送っていません";
      }
      emit("failed", { code: "fork_failed", message: `Claude Code ではない ${detected.value.found} が検出されました` });
      return;
    }
    const instanceId = detected.value.agent.instanceId;
    emit("detected");
    // 手が空くのを待つ。blocked（初めてのフォルダの信頼の確認など）の間は、知らせを送らず、待ち続ける（A8）。
    const wantNote = noteStatus === "pending" && ctx.noteText !== null;
    for (;;) {
      const free = await waitForAgent(
        waitDeps,
        newPaneId,
        handsFree(instanceId, (blocked) => {
          if (wantNote) {
            noteReason = blocked ? "エージェントが、確認を待っています（答えると、最初の知らせを送ります）" : undefined;
            emit("note");
          }
        }),
        wantNote ? this.timing.noteWaitMs : this.timing.readyWaitMs,
        signal,
      );
      if (!free.ok) {
        if (free.reason === "aborted") return;
        if (wantNote && noteStatus === "pending") {
          noteStatus = free.reason === "timeout" ? "timed_out" : "skipped";
          noteReason = free.reason === "timeout" ? "10 分待っても手が空かなかったため、送っていません" : "pane が閉じられたため、送っていません";
        }
        emit(free.reason === "pane_closed" ? "failed" : "done", free.reason === "pane_closed" ? { code: "fork_failed", message: "新しい pane が閉じられました" } : {});
        return;
      }
      if (free.value.kind === "gone") {
        if (wantNote) {
          noteStatus = "skipped";
          noteReason = "エージェントが入れ替わった（終了した）ため、送っていません";
        }
        emit("done");
        return;
      }
      // 手が空いたように見えても、読み込みの途中かもしれない。少し置いて、まだ空いているか見直す。
      await new Promise((r) => setTimeout(r, this.timing.settleMs));
      if (signal.aborted) return;
      const again = this.deps.session.getPane(newPaneId)?.agent;
      if (!again || again.instanceId !== instanceId) continue;
      if (again.state !== "idle") continue;
      break;
    }
    emit("ready");
    if (wantNote && ctx.noteText !== null) {
      try {
        await this.sendNote(newPaneId, instanceId, ctx.noteText);
        noteStatus = "sent";
        noteReason = undefined;
      } catch (err) {
        noteStatus = "skipped";
        noteReason = `送れませんでした（${err instanceof RpcError ? err.code : "error"}）`;
      }
      emit("note");
    }
    emit("done");
  }

  /** `agent.prompt` と同じ書き込み（貼り付けの印つきで本文を送り、遅れて Enter）。blocked・別のエージェントには送らない。 */
  private async sendNote(paneId: string, instanceId: string, text: string): Promise<void> {
    const host = this.deps.terminals.get(paneId);
    if (!host) throw new RpcError("agent_not_found", `pane not found: ${paneId}`);
    await host.writeModal({
      build: (modes) => {
        const now = this.deps.session.getPane(paneId)?.agent ?? null;
        if (now === null || now.instanceId !== instanceId) throw new RpcError("agent_not_found", "agent is no longer running");
        if (now.state === "blocked") throw new RpcError("agent_blocked", "agent is blocked");
        return [pastePayload(text, modes.bracketedPaste), "\r"];
      },
      delayMs: AGENT_PROMPT_SUBMIT_DELAY_MS,
    });
  }

  /** 打ち込んだのにエージェントが検出されなかったとき、画面の末尾から理由を拾う（A11・S6）。 */
  private launchFailureReason(paneId: string): string {
    const tail = (this.deps.terminals.get(paneId)?.mirror.plainText() ?? "").slice(-4000);
    if (/No conversation found/i.test(tail)) return "会話の記録が見つかりません（Claude Code の設定の場所〔CLAUDE_CONFIG_DIR〕が違う可能性があります）";
    if (/unknown option|unrecognized option|Unknown argument/i.test(tail)) return "この Claude Code は、会話の fork（--fork-session）に対応していない版のようです";
    if (/command not found/i.test(tail)) return "claude コマンドが見つかりません";
    return "エージェントが検出されませんでした（画面を確かめてください）";
  }
}

function describeCreated(c: ForkCreated): string {
  return [c.worktreePath ? `worktree ${c.worktreePath}` : null, c.workspaceId ? `workspace ${c.workspaceId}` : null, c.paneId ? `pane ${c.paneId}` : null].filter((x) => x !== null).join("、");
}
