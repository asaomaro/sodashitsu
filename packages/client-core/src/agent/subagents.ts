import type { AgentInfo } from "@sodashitsu/protocol";

/**
 * エージェントが動かしているサブエージェントの表示に使う共有の部品（20261004-subagent-display）。web・tui が同じ文言・同じ引き方を使う。
 */

/** どのエージェントか。pane の ID はマシンをまたいで衝突するので、マシンと一緒に持つ（手元は `local`）。 */
export interface SubagentTarget {
  machineId: string;
  paneId: string;
}

/**
 * `{machineId, paneId}` からエージェントの情報を引く関数の型。実体は画面ごとに作る（web は選んでいるマシンなら session のストア、
 * そうでなければ別のマシンの要約から。tui は今の接続の model から）。居なければ undefined。
 */
export type AgentLookup = (target: SubagentTarget) => AgentInfo | undefined;

/**
 * 経過時間の文言。`startedAt`（サーバの時計）と画面の時計の差なので、時計がずれて負になれば 0 秒にする。
 * 60 秒未満は秒、60 分未満は分、それ以上は時間（切り捨て）。
 */
export function formatSubagentElapsed(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間`;
}

/** 一覧に出しきれない（`items` は先頭 64 件まで）件数。 */
export function subagentsHiddenCount(subagents: NonNullable<AgentInfo["subagents"]>): number {
  return Math.max(0, subagents.count - subagents.items.length);
}

/** 一覧の末尾の「ほか n 件」。出しきれていれば文言、そうでなければ null。 */
export function subagentsMoreLabel(subagents: NonNullable<AgentInfo["subagents"]>): string | null {
  const hidden = subagentsHiddenCount(subagents);
  return hidden > 0 ? `ほか ${hidden} 件` : null;
}
