import type { AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { INTEGRATIONS_UNSUPPORTED, formatIntegrationsTable, runAgentIntegrations } from "./agentIntegrations.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", async (orig) => ({ ...(await orig<typeof import("../output.js")>()), printJson: vi.fn(), printLine: vi.fn() }));

import { printJson, printLine } from "../output.js";
import { withSession } from "../withSession.js";

const RESULT = {
  autoResumeEnabled: true,
  agents: {
    claude: { cliDetected: true, installed: true },
    codex: { cliDetected: true, installed: true, needsUpdate: true },
    zzz: { cliDetected: false, installed: false },
  },
} as unknown as AgentIntegrationStatusResult;

const base = { kind: "agent-integrations" as const, opts: { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false }, json: false };
const store = {} as SessionStore;

function harness(request: (method: string, params: unknown) => Promise<unknown>) {
  const requestFn = vi.fn(request);
  const client = { hello: vi.fn(async () => ({})), request: requestFn } as unknown as SodaClient;
  vi.mocked(withSession).mockImplementation(async (_o, _s, fn) => fn(client));
  return { request: requestFn, hello: client.hello as ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.mocked(printJson).mockReset();
  vi.mocked(printLine).mockReset();
});

describe("sodactl agent integrations", () => {
  it("表: サーバの結果のキーをそのまま並べる（固定の kind を持たない）", () => {
    const t = formatIntegrationsTable(RESULT);
    expect(t).toMatch(/claude\s+導入済み\s+あり/);
    expect(t).toMatch(/codex\s+更新が必要\s+あり/);
    expect(t).toMatch(/zzz\s+未導入\s+なし/);
  });
  it("既定は表。agent_integration.status を引数なしで呼ぶ", async () => {
    const h = harness(async () => RESULT);
    await runAgentIntegrations(base, store);
    expect(h.hello).toHaveBeenCalledTimes(1);
    expect(h.request).toHaveBeenCalledWith("agent_integration.status", {});
    expect(printLine).toHaveBeenCalledWith(formatIntegrationsTable(RESULT));
    expect(printJson).not.toHaveBeenCalled();
  });
  it("--json はサーバの結果をそのまま出す", async () => {
    harness(async () => RESULT);
    await runAgentIntegrations({ ...base, json: true }, store);
    expect(printJson).toHaveBeenCalledWith(RESULT);
    expect(printLine).not.toHaveBeenCalled();
  });
  it("古いサーバ（未知の操作）は分かる誤りで失敗する", async () => {
    harness(async () => {
      throw new RpcFailure("not_found", "unknown method: agent_integration.status");
    });
    await expect(runAgentIntegrations(base, store)).rejects.toMatchObject({ code: "not_found", message: INTEGRATIONS_UNSUPPORTED });
  });
  it("ほかの失敗はそのまま", async () => {
    harness(async () => {
      throw new RpcFailure("timeout", "t");
    });
    await expect(runAgentIntegrations(base, store)).rejects.toMatchObject({ code: "timeout" });
  });
});
