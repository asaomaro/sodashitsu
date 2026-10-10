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
    status: async (kind) => ({
      cliDetected: true,
      installed: true,
      needsUpdate: updated[kind] ?? false,
    }),
    install: async (kind) => {
      updated = { ...updated, [kind]: false };
      return { ok: true, message: null };
    },
    uninstall: async () => ({ ok: true, message: null }),
  };
  const file = {
    load: async () => ({ kind: "missing" }),
    save: async () => undefined,
  } as unknown as IntegrationFile;
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
    expect(
      (changed as { data: { agents: { claude: { needsUpdate?: boolean } } } }).data.agents.claude
        .needsUpdate,
    ).toBe(false);
  });
});

// 20261010-agent-usage PR2 の指摘 5: 「まだ報告がありません」（silent）は、検出の後に動いた（working になった）ことのある Claude Code だけが対象。
describe("DefaultAgentIntegrationService — statusLine の silent", () => {
  async function silentOf(health: { lastReportAt?: number; since?: number; workedAt?: number }, now: number, state: "installed" | "none" = "installed"): Promise<boolean | undefined> {
    const installer: AgentIntegrationInstaller = {
      status: async () => ({ cliDetected: true, installed: true, needsUpdate: false }),
      install: async () => ({ ok: true, message: null }),
      uninstall: async () => ({ ok: true, message: null }),
    };
    const file = { load: async () => ({ kind: "missing" }), save: async () => undefined } as unknown as IntegrationFile;
    const service = await DefaultAgentIntegrationService.load(installer, file, new EventBus(), {
      statusLine: { status: async () => ({ state }), install: async () => ({ ok: true, message: null }), uninstall: async () => ({ ok: true, message: null }) },
      health: {
        lastReportAt: () => health.lastReportAt,
        claudeRunningSince: () => health.since,
        claudeWorkedSince: () => health.workedAt,
      },
      now: () => now,
    });
    return (await service.status()).statusLine?.silent;
  }
  const T = 1_000_000;

  it("検出されて 2 分以上たっても、動いたことが無い（待っているだけ）なら、出さない", async () => {
    expect(await silentOf({ since: T }, T + 10 * 60_000)).toBeUndefined();
  });
  it("動いてから 2 分たち、検出の後の報告が無ければ出す", async () => {
    expect(await silentOf({ since: T, workedAt: T + 5_000 }, T + 5_000 + 120_000)).toBe(true);
  });
  it("動いてから 2 分たっていなければ、出さない", async () => {
    expect(await silentOf({ since: T, workedAt: T + 5_000 }, T + 5_000 + 119_000)).toBeUndefined();
  });
  it("検出の後に報告があれば、出さない", async () => {
    expect(await silentOf({ since: T, workedAt: T + 5_000, lastReportAt: T + 6_000 }, T + 10 * 60_000)).toBeUndefined();
  });
  it("導入していなければ、出さない", async () => {
    expect(await silentOf({ since: T, workedAt: T + 5_000 }, T + 10 * 60_000, "none")).toBeUndefined();
  });
});
