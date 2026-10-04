import type { AgentInfo } from "@sodashitsu/protocol";
import { paneNameOf, type AgentLookup, type SubagentTarget } from "@sodashitsu/client-core";
import { summaryPaneName, useMachinesStore } from "./machines.js";
import { useSessionStore } from "./session.js";

/**
 * サブエージェントの一覧の対象（`{machineId, paneId}`）から、エージェントの情報と pane の呼び名を引く（20261004-subagent-display）。
 * pane の ID はマシンをまたいで衝突するので、必ずマシンと一緒に引く。画面の接続が向いているマシン（`machines.selectedId`）のものは session のストアから、
 * そうでないものは別のマシンの要約（`SummaryPane.agent`）から。サイドバー・一覧のダイアログ・グラフが同じ引き方を使う。
 * pinia が有効なところ（コンポーネントの中・テストの `setActivePinia` の後）で呼ぶ。
 */
export const lookupAgent: AgentLookup = (target: SubagentTarget): AgentInfo | undefined => {
  const machines = useMachinesStore();
  if (target.machineId === machines.selectedId) return useSessionStore().panes.get(target.paneId)?.agent ?? undefined;
  return machines.summaries[target.machineId]?.panes[target.paneId]?.agent ?? undefined;
};

/** 一覧の題に使う pane の呼び名。pane が無ければ `pane <id>`。 */
export function lookupPaneName(target: SubagentTarget): string {
  const machines = useMachinesStore();
  if (target.machineId === machines.selectedId) {
    const pane = useSessionStore().panes.get(target.paneId);
    return pane ? paneNameOf(pane) : `pane ${target.paneId}`;
  }
  const entry = machines.summaries[target.machineId]?.panes[target.paneId];
  return entry ? summaryPaneName(target.paneId, entry) : `pane ${target.paneId}`;
}
