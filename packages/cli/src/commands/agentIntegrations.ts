import type { AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import { formatTable, printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { RpcFailure } from "../wsClient.js";
import { withSession } from "../withSession.js";

/**
 * `sodactl agent integrations [--json]`。設定の「エージェント連携」の状態（種類ごとの導入・実行ファイルの検出）を読む。読み取り専用。
 * 表の kind はサーバの結果のキーをそのまま並べる（CLI 側で種類を固定で持たない。サーバが種類を足せば、そのまま出る）。
 * `/ws` の経路だけ（`pane.sock` には載せない: 設定の状態であり、受け口に載せてよい条件の 2 つ目〔設定に触れない〕に合わない）。
 */
type AgentIntegrationsCmd = Extract<Command, { kind: "agent-integrations" }>;

export const INTEGRATIONS_UNSUPPORTED = "このサーバは agent integrations に対応していません（サーバが古い可能性があります。soda を更新してください）";

export function formatIntegrationsTable(result: AgentIntegrationStatusResult): string {
  const rows = Object.entries(result.agents).map(([kind, a]) => [
    kind,
    a.installed ? (a.needsUpdate === true ? "更新が必要" : "導入済み") : "未導入",
    a.cliDetected ? "あり" : "なし",
  ]);
  return formatTable(["kind", "導入", "実行ファイル"], rows);
}

export async function runAgentIntegrations(cmd: AgentIntegrationsCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    try {
      return await client.request("agent_integration.status", {});
    } catch (err) {
      // 知らない操作は `not_found`（`unknown method`）。古いサーバと分かる誤りにする（終了コードは非 0）。
      if (err instanceof RpcFailure && err.code === "not_found") throw new RpcFailure("not_found", INTEGRATIONS_UNSUPPORTED);
      throw err;
    }
  });
  if (cmd.json) printJson(result);
  else printLine(formatIntegrationsTable(result));
}
