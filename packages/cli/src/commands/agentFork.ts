import type { AgentForkProgress, AgentForkResult, ForkNoteStatus } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import { resolveAgentTarget } from "../agentTarget.js";
import { printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure } from "../wsClient.js";
import { EventFeed } from "./agent.js";

/**
 * `sodactl agent fork`（20261009-agent-fork の T5）。会話を引き継いだエージェントを、同じフォルダの新しい pane か、新しい worktree に起こす。
 * 送るのは「どの pane」「同じフォルダか、新しい worktree（ブランチ名）か」「最初の知らせを送るか」だけ（会話の id・コマンドは送らない。サーバが引く）。
 * 既定は最後まで待つ（サーバの `agent.fork_progress` が `done`／`failed` になるまで）。`--no-wait` は、起動のコマンドを打ち込んだところで返す。
 */
type AgentForkCmd = Extract<Command, { kind: "agent-fork" }>;

/** 最初の知らせの待ち（サーバは 10 分）に、検知の分を足した、待つ上限の既定。 */
export const FORK_WAIT_DEFAULT_MS = 11 * 60_000;

export interface ForkOutcome extends AgentForkResult {
  /** 待ったときの最後の段階（`--no-wait` では `launched`）。 */
  stage: AgentForkProgress["stage"];
}

const NOTE_LABEL: Record<ForkNoteStatus, string> = {
  off: "送らない",
  skipped: "送れませんでした",
  pending: "まだ送っていません",
  sent: "送りました",
  timed_out: "待ちが切れました（送っていません）",
};

export function formatFork(o: ForkOutcome): string {
  const where = o.worktreePath ? `新しい worktree ${o.worktreePath}` : "同じフォルダ";
  const note = o.target === "worktree" ? ` / 最初の知らせ: ${NOTE_LABEL[o.noteStatus]}${o.noteReason ? `（${o.noteReason}）` : ""}` : "";
  return `forked: pane ${o.paneId}（名前 ${o.name}、${where}）${note}`;
}

export async function runAgentFork(cmd: AgentForkCmd, store: SessionStore): Promise<void> {
  const outcome = await withSession(cmd.opts, store, async (client): Promise<ForkOutcome> => {
    const events = new EventFeed();
    const hello = await client.hello(events.push);
    const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
    const sourcePaneId = target.paneId;
    const progress: AgentForkProgress[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    events.drain((evt) => {
      if (evt.event === "agent.fork_progress" && evt.data.sourcePaneId === sourcePaneId) {
        progress.push(evt.data);
        wake?.();
      }
    });
    client.onClose(() => {
      closed = true;
      wake?.();
    });
    const result = await client.request("agent.fork", {
      paneId: sourcePaneId,
      target: cmd.worktree === undefined ? { kind: "same" } : { kind: "worktree", branch: cmd.worktree },
      ...(cmd.worktree !== undefined && !cmd.note ? { note: false } : {}),
    });
    const mine = (): AgentForkProgress[] => progress.filter((p) => p.paneId === result.paneId);
    if (!cmd.wait) return { ...result, stage: "launched" };
    const deadline = Date.now() + (cmd.timeoutMs ?? FORK_WAIT_DEFAULT_MS);
    for (;;) {
      const all = mine();
      const last = all.at(-1);
      const finished = all.find((p) => p.stage === "done" || p.stage === "failed");
      if (finished) {
        const final = [...all].reverse().find((p) => p.noteStatus !== undefined);
        const merged: ForkOutcome = {
          ...result,
          stage: finished.stage,
          ...(final?.noteStatus !== undefined ? { noteStatus: final.noteStatus } : {}),
          ...(final?.noteReason !== undefined ? { noteReason: final.noteReason } : {}),
        };
        if (finished.stage === "failed") {
          throw new RpcFailure(finished.code ?? "fork_failed", `${finished.message ?? "fork failed"}（pane ${result.paneId}${finished.created?.worktreePath ? `、worktree ${finished.created.worktreePath}` : ""} は残してあります）`);
        }
        return merged;
      }
      if (closed) throw new RpcFailure("connection_closed", "server closed the connection while waiting for the fork");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new RpcFailure("timeout", `timed out waiting for the fork to finish（pane ${result.paneId}。最後の段階: ${last?.stage ?? "launched"}）`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, remaining);
        wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      wake = null;
    }
  });
  if (cmd.json) printJson(outcome);
  else printLine(formatFork(outcome));
}
