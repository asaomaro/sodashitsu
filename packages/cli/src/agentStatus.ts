import type { AgentInfo, AgentState } from "@sodashitsu/protocol";
import { stripAnsi } from "./ansiStrip.js";

/**
 * `sodactl agent` の判定（20260926-agent-automation-api design.md「`agentStatus.ts`」）。
 * 状態の名前は herdr の `agent_status`（`done` を含む 5 値）に揃える。
 */

export type AgentStatus = "working" | "blocked" | "idle" | "done" | "unknown";

export const AGENT_STATUSES: readonly AgentStatus[] = [
  "working",
  "blocked",
  "idle",
  "done",
  "unknown",
];

/** herdr の `agent_wait_statuses`（`src/api/wait.rs`）と同じ既定。`unknown` は明示したときだけ一致させる。 */
export const DEFAULT_UNTIL: readonly AgentStatus[] = ["idle", "done", "blocked"];

/**
 * `packages/web/src/store/seen.ts` の `displayStateFor` に、既読としてサーバの `serverSeenSeq` を渡した場合と同じ規則
 * （cli は web に依存しないので複製している。規則を変えるときは両方を揃える）。
 */
export function statusOf(agent: AgentInfo): AgentStatus {
  if (agent.state === "idle" && agent.completionSeq > agent.serverSeenSeq) return "done";
  return agent.state;
}

export function resolveUntil(until: readonly AgentStatus[]): readonly AgentStatus[] {
  return until.length > 0 ? until : DEFAULT_UNTIL;
}

export interface AgentLocation {
  paneId: string;
  tabId: string;
  workspaceId: string | null;
}

/** サブエージェント 1 件の出力（項目の有無を揺らさない。分からない値は null）。 */
export interface SubagentView {
  id: string;
  type: string | null;
  description: string | null;
  background: boolean | null;
  startedAt: number;
  /** 入れ子のとき、起動した側のサブエージェントの id。メインが起動したもの・分からないものは null（20261008-graph-first PR6）。 */
  parentId: string | null;
  /** 深さ（メインが起動したもの = 1）。分からなければ null。 */
  depth: number | null;
}

export interface AgentView {
  paneId: string;
  /** `agent rename` で付けた名前（無ければ null。20260926-agent-start-rename）。 */
  name: string | null;
  workspaceId: string | null;
  tabId: string;
  status: AgentStatus;
  kind: string;
  label: string;
  state: AgentState;
  instanceId: string;
  completionSeq: number;
  serverSeenSeq: number;
  since: number;
  verified: boolean;
  /**
   * 動かしているサブエージェント（20261004-subagent-display）。フックの報告を受けていない（古いサーバ・導入していない・Claude Code 以外）なら null＝分からない。
   * 報告を受けていれば `{count, items}`（0 件なら `count: 0`）。`items` は起動した順で最大 64 件、`count` は実際の数。
   */
  subagents: { count: number; items: SubagentView[] } | null;
}

/** `AgentInfo.subagents` を出力の形に写す。無ければ null。項目の有無を揺らさず、分からないものは null で埋める。 */
export function subagentsViewOf(subagents: AgentInfo["subagents"]): AgentView["subagents"] {
  if (!subagents) return null;
  return {
    count: subagents.count,
    items: subagents.items.map((s) => ({
      id: s.id,
      type: s.type ?? null,
      description: s.description ?? null,
      background: s.background ?? null,
      startedAt: s.startedAt,
      parentId: s.parentId ?? null,
      depth: s.depth ?? null,
    })),
  };
}

export function toAgentView(loc: AgentLocation, agent: AgentInfo): AgentView {
  return {
    paneId: loc.paneId,
    name: agent.name ?? null,
    workspaceId: loc.workspaceId,
    tabId: loc.tabId,
    status: statusOf(agent),
    kind: agent.kind,
    label: agent.label,
    state: agent.state,
    instanceId: agent.instanceId,
    completionSeq: agent.completionSeq,
    serverSeenSeq: agent.serverSeenSeq,
    since: agent.since,
    verified: agent.verified,
    subagents: subagentsViewOf(agent.subagents),
  };
}

export type WaitVerdict = "match" | "gone" | "pending";

/** 待ち始めのエージェント（`expectedInstanceId`）が居なくなった・入れ替わったら `gone`。 */
export function judgeWait(
  expectedInstanceId: string,
  current: AgentInfo | null,
  until: readonly AgentStatus[],
): WaitVerdict {
  if (current === null || current.instanceId !== expectedInstanceId) return "gone";
  return until.includes(statusOf(current)) ? "match" : "pending";
}

/** herdr の `AGENT_PROMPT_EFFECT_TIMEOUT_MS`（`src/api/wait.rs:20`）。送信後に活動（working/blocked）を観測するまでの上限。 */
export const PROMPT_EFFECT_TIMEOUT_MS = 5000;

/**
 * `agent prompt --wait` の判定（20260926-agent-prompt-send-keys design.md「cli」）。送信を始めた後に `working`/`blocked` を
 * 一度でも観測する（活動の確認）までは `until` に一致しても返さず、観測した後は `until` のどれかで一致する。時計は持たない。
 */
export class PromptWait {
  private activity: boolean;

  constructor(
    private readonly expectedInstanceId: string,
    private readonly until: readonly AgentStatus[],
    activityObserved: boolean,
  ) {
    this.activity = activityObserved;
  }

  get activityObserved(): boolean {
    return this.activity;
  }

  observe(current: AgentInfo | null): WaitVerdict {
    if (current === null || current.instanceId !== this.expectedInstanceId) return "gone";
    const status = statusOf(current);
    if (!this.activity && (status === "working" || status === "blocked")) this.activity = true;
    return this.activity && this.until.includes(status) ? "match" : "pending";
  }
}

const ALT_SCREEN_ENTER = "\u001B[?1049h";

/**
 * alternate screen が有効な pane の SNAPSHOT は「通常画面（スクロールバック込み）」の直後に改行を挟まず
 * `ESC[?1049h` と alt screen の中身が続く（`@xterm/addon-serialize` の出力）。今の画面として後ろだけを返す。
 */
export function currentScreen(raw: string): string {
  const i = raw.lastIndexOf(ALT_SCREEN_ENTER);
  return i < 0 ? raw : raw.slice(i + ALT_SCREEN_ENTER.length);
}

/** 末尾の空行（ANSI を除いて空白だけの行）を捨ててから、最後の `n` 行を返す。 */
export function lastLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && stripAnsi(lines[lines.length - 1]!).trim() === "") lines.pop();
  return lines.slice(-n).join("\n");
}
