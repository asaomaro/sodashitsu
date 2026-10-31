import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
import { registerAgentMethods } from "./agent.js";
function fixture() {
  const usageReport = vi.fn(async (_settings: unknown, _data: unknown, _check?: unknown) => ({
    text: "report",
    kind: "codex",
    model: "",
    updatedAt: 1,
  }));
  const get = vi.fn(async () => ({
    panes: {
      p: {
        paneId: "secret-pane",
        kind: "claude",
        model: "last",
        source: "transcript",
        tokens: { basis: "transcript", input: 42 },
        updatedAt: 123,
        extra: "not-shared",
      },
    },
    accounts: [],
  }));
  const accountCost = vi.fn(async () => ({
    accountKey: "secret-key",
    totalUsd: 2,
    byModel: [{ label: "不明", usd: 2 }],
    partial: true,
    asOf: 99,
  }));
  const surface = new ControlSurface();
  registerAgentMethods(surface, {
    usage: { get, accountCost },
    summaries: { usageReport },
    session: {},
    terminals: {},
    sizeAuthority: {},
  } as unknown as MethodDeps);
  const call = (params: unknown) =>
    surface.invoke({ clientId: "c", sink: {} as never }, "agent.usage_report", params);
  return { call, get, accountCost, usageReport };
}
it("server builds bounded report source data without arbitrary client prompt, paths or pane identity", async () => {
  const f = fixture();
  expect(f.usageReport).not.toHaveBeenCalled();
  const response = await f.call({
    settings: { kind: "codex", model: "" },
    accountKey: "a",
    prompt: "untrusted instructions",
  });
  expect(response.ok).toBe(true);
  expect(f.accountCost).toHaveBeenCalledWith("a");
  const data = f.usageReport.mock.calls[0]?.[1] as unknown as { sessions: unknown[] };
  const serialized = JSON.stringify(data);
  expect(serialized).toContain('"input":42');
  expect(serialized).toContain('"source":"transcript"');
  expect(serialized).not.toContain("untrusted instructions");
  expect(serialized).not.toContain("secret-pane");
  expect(serialized).not.toContain("secret-key");
  expect(serialized).not.toContain("not-shared");
});
it("rejects invalid settings before reading or launching", async () => {
  const f = fixture();
  const response = await f.call({ settings: { kind: "codex", model: "--unsafe value" } });
  expect(response.ok).toBe(false);
  expect(f.get).not.toHaveBeenCalled();
  expect(f.usageReport).not.toHaveBeenCalled();
});
it("does not launch a model if authentication is revoked during data collection", async () => {
  const f = fixture();
  let authorized = true;
  f.get.mockImplementation(async () => {
    authorized = false;
    return { panes: {}, accounts: [] } as never;
  });
  // A cost result keeps the request nonempty, so the final auth guard is the reason it fails.
  const surface = new ControlSurface();
  registerAgentMethods(surface, {
    usage: { get: f.get, accountCost: f.accountCost },
    summaries: { usageReport: f.usageReport },
    session: {},
    terminals: {},
    sizeAuthority: {},
  } as unknown as MethodDeps);
  const response = await surface.invoke(
    { clientId: "c", sink: {} as never, connectionAuthorized: () => authorized },
    "agent.usage_report",
    { settings: { kind: "codex", model: "" }, accountKey: "a" },
  );
  expect(response).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  expect(f.usageReport).not.toHaveBeenCalled();
});
