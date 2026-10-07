import type { AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAgentIntegrationsStore } from "./agentIntegrations.js";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("useAgentIntegrationsStore", () => {
  it("starts with no status (fetched explicitly, not part of client.hello)", () => {
    expect(useAgentIntegrationsStore(pinia).status).toBeNull();
  });

  it("setStatus replaces the status", () => {
    const notInstalled = { cliDetected: false, installed: false };
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: {
        claude: { cliDetected: true, installed: false },
        codex: notInstalled,
        cursor: notInstalled,
        copilot: notInstalled,
        devin: notInstalled,
        droid: notInstalled,
        grok: notInstalled,
        qwen: notInstalled,
        qodercli: notInstalled,
      },
    };
    const store = useAgentIntegrationsStore(pinia);
    store.setStatus(status);
    expect(store.status).toEqual(status);
  });
});
