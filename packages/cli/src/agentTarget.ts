import type { AgentInfo, SessionSnapshot } from "@sodashitsu/protocol";
import { resolvePaneRef } from "./idRef.js";
import { RpcFailure } from "./wsClient.js";

/**
 * エージェントの対象の解決（20260926-agent-start-rename design「CLI の対象の解決」）。herdr の `resolve_agent_target`
 * （`src/app/terminal_targets.rs`）と同じく、pane ID でエージェントの居る pane を指していればそれ、無ければ名前で探す。
 */

export interface AgentPane {
  paneId: string;
  tabId: string;
  agent: AgentInfo;
}

export function resolveAgentTarget(snapshot: SessionSnapshot, target: string): AgentPane {
  const byId = snapshot.panes.find((p) => p.id === target);
  if (byId?.agent) return { paneId: byId.id, tabId: byId.tabId, agent: byId.agent };
  const named = snapshot.panes.filter((p) => p.agent?.name === target);
  if (named.length > 1) {
    throw new RpcFailure(
      "agent_target_ambiguous",
      `agent target ${target} is ambiguous; candidates: ${named.map((p) => p.id).join(", ")}`,
    );
  }
  const match = named[0];
  if (match?.agent) return { paneId: match.id, tabId: match.tabId, agent: match.agent };
  if (byId) throw new RpcFailure("agent_not_found", `no agent detected in pane: ${target}`);
  // 完全な id でも名前でもなければ、pane の id の先頭の部分（4 文字以上で一意）として引く。
  const byPrefix = resolvePaneRef(snapshot, target);
  const prefixed = snapshot.panes.find((p) => p.id === byPrefix);
  if (prefixed !== undefined && byPrefix !== target) {
    if (prefixed.agent)
      return { paneId: prefixed.id, tabId: prefixed.tabId, agent: prefixed.agent };
    throw new RpcFailure("agent_not_found", `no agent detected in pane: ${prefixed.id}`);
  }
  throw new RpcFailure("agent_not_found", `agent target not found: ${target}`);
}
