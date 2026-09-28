import type { DisplayState } from "@sodashitsu/protocol";
import { STATE_PRIORITY } from "./agentState.js";
import type { AgentSort } from "../prefs/types.js";

export interface AgentOrderEntry {
  paneId: string;
  state: DisplayState | null;
  since: number;
}

/**
 * agent が検出された pane の表示順（純関数。20260923-missing-keybinding-actions）。`Sidebar.vue` の
 * `agents` computed と `ActionDispatcher`（`previous_agent`/`next_agent`/`focus_agent`）が共有する——
 * 利用者が画面で見る順と操作の対象順を構造的に一致させるため（design decisions D4）。
 */
export function orderedAgentPaneIds(entries: AgentOrderEntry[], sort: AgentSort): string[] {
  // `grouped`（既定）は並べ替えない——渡された順（サーバが返す workspace 順 → tab 順 → pane 順）が
  // そのままグループになる（herdr と同じ。research F3）。
  if (sort === "grouped") return entries.map((e) => e.paneId);
  // `priority`：状態優先度→直近の変化順（`since` 降順）。`sort` は安定なので、両方同点なら渡された順が残る。
  return [...entries]
    .sort((a, b) => {
      const byState = STATE_PRIORITY[b.state ?? "unknown"] - STATE_PRIORITY[a.state ?? "unknown"];
      return byState !== 0 ? byState : b.since - a.since;
    })
    .map((e) => e.paneId);
}
