import { describe, expect, it } from "vitest";
import type { AgentIntegrationKind, ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import type { IntegrationFile } from "../persist/IntegrationFile.js";
import type { AgentIntegrationInstaller } from "./AgentIntegrationInstaller.js";
import { DefaultAgentIntegrationService } from "./AgentIntegrationService.js";

// 20261004-subagent-display: 導入の状態の `needsUpdate` を、画面（status）と変更の知らせ（agent_integration.changed）の両方に載せる。

function makeService(needsUpdate: Partial<Record<AgentIntegrationKind, boolean>>) {
  let updated = needsUpdate;
  const installer: AgentIntegrationInstaller = {
    status: async (kind) => ({ cliDetected: true, installed: true, needsUpdate: updated[kind] ?? false }),
    install: async (kind) => {
      updated = { ...updated, [kind]: false };
      return { ok: true, message: null };
    },
    uninstall: async () => ({ ok: true, message: null }),
  };
  const file = { load: async () => ({ kind: "missing" }), save: async () => undefined } as unknown as IntegrationFile;
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  return { service: DefaultAgentIntegrationService.load(installer, file, bus), events };
}

describe("DefaultAgentIntegrationService — needsUpdate", () => {
  it("status に各 kind の needsUpdate を載せる", async () => {
    const { service } = makeService({ claude: true });
    const status = await (await service).status();
    expect(status.agents.claude).toMatchObject({ installed: true, needsUpdate: true });
    expect(status.agents.codex).toMatchObject({ installed: true, needsUpdate: false });
  });

  it("更新（install）の後の agent_integration.changed に、直った needsUpdate が載る", async () => {
    const { service, events } = makeService({ claude: true });
    await (await service).install("claude");
    const changed = events.find((e) => e.event === "agent_integration.changed");
    expect(changed).toBeDefined();
    expect((changed as { data: { agents: { claude: { needsUpdate?: boolean } } } }).data.agents.claude.needsUpdate).toBe(false);
  });
});
