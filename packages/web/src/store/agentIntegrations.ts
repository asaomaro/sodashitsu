import type { AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 公式フック連携（20260923-agent-session-resume）の導入状態・自動再開設定。**サーバ全体**の設定
 * （ブラウザごとではない）なので localStorage には持たない。`client.hello` のスナップショットには
 * 含まれない——`ActionDispatcher.refreshAgentIntegrationStatus()` が明示的に取得し、以降は
 * `agent_integration.changed` イベント（`StoreAdapter`）で更新され続ける。
 */
export const useAgentIntegrationsStore = defineStore("agentIntegrations", () => {
  const status = ref<AgentIntegrationStatusResult | null>(null);

  function setStatus(next: AgentIntegrationStatusResult): void {
    status.value = next;
  }

  return { status, setStatus };
});
