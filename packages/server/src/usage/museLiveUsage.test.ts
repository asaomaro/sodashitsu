import { expect, it, vi } from "vitest";
import { museAllowanceAccount, museViewUsage } from "./museLiveUsage.js";
import { MuseUsageAdapter } from "./museAdapter.js";
const sid = "12345678-abcd-ef01-2345-6789abcdef01";
it("uses MSP counted-once cumulative counters, independent context and cost provenance", () => {
  const events = [
    {
      method: "session/contextUsage",
      params: { usedTokens: 200, windowTokens: 1000, pressure: "warning" },
    },
    { method: "session/modelChanged", params: { modelId: "test-model" } },
    { method: "session/reasoningEffortChanged", params: { reasoningEffort: "high" } },
    {
      method: "session/tokenUsage",
      params: {
        usage: { inputTokens: 99999, cachedTokens: 99999 },
        cumulative: {
          promptTokens: 500,
          outputTokens: 50,
          totalTokens: 550,
          cacheReadTokens: 300,
          cacheWriteTokens: 20,
          cost: { usd: 0.1, partial: true },
        },
      },
    },
  ];
  expect(museViewUsage({ events }, null, 100)).toMatchObject({
    model: "test-model",
    reasoningEffort: "high",
    tokens: {
      basis: "cumulative",
      input: 180,
      cacheRead: 300,
      cacheWrite: 20,
      output: 50,
      total: 550,
    },
    contextTokens: 200,
    contextUsedPct: 20,
    contextRemainingTokens: 800,
    costUsd: 0.1,
    costEstimated: true,
    costPartial: true,
  });
  expect(museViewUsage({ events: [] }, null, 100)).toBeNull();
});
it("does not fabricate Muse allowance and preserves over-quota/reset timestamps", () => {
  expect(museAllowanceAccount({ schemaVersion: 1, allowance: null }, "root", 100)).toBeNull();
  const result = museAllowanceAccount(
    {
      schemaVersion: 1,
      allowance: {
        tier: "Pro",
        asOfMs: 1793700000000,
        window: { usedPercent: 108, resetsAtMs: 1793700000099, windowDurationMins: 300 },
        weekly: { usedPercent: 50, resetsAtMs: 1793700000200 },
      },
    },
    "root",
    1793700000100,
  );
  expect(result).toMatchObject({
    plan: "Pro",
    asOf: 1793700000000,
    windows: [
      { usedPct: 108, stale: true, resetsAt: 1793700000099 },
      { usedPct: 50, stale: false },
    ],
  });
});
it("coalesces Muse host reads, ignores foreign-session events and retries after TTL", async () => {
  let now = 100;
  const query = vi.fn(async () => ({
    events: [
      {
        method: "session/contextUsage",
        params: { sessionId: sid, usedTokens: 80, windowTokens: 100 },
      },
      { method: "session/modelChanged", params: { sessionId: "foreign", modelId: "SECRET" } },
    ],
  }));
  const a = new MuseUsageAdapter(
    { dataHome: "/nonexistent-soda-test" },
    query as any,
    async () => null,
    () => now,
  );
  const source = { paneId: "p", sessionId: sid, transcriptPath: undefined };
  await Promise.all([a.usageFor(source), a.usageFor(source)]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(await a.usageFor(source)).toMatchObject({ model: null, contextTokens: 80 });
  now += 30001;
  await a.usageFor(source);
  expect(query).toHaveBeenCalledTimes(2);
  a.close();
  expect(await a.usageFor(source)).toBeNull();
  expect(await a.accounts()).toEqual([]);
});

it("preserves native approvalMode and standing effort as session observations without poll timestamps", () => {
  const value = museViewUsage({ events: [
    { method: "session/approvalModeChanged", params: { mode: "onRequest", source: "approvalReconfigure" } },
    { method: "session/reasoningEffortChanged", params: { reasoningEffort: "high" } },
  ] }, null, 999);
  expect(value?.executionSettings).toEqual({ approvalMode: { value: "onRequest", source: "muse-events", basis: "session" }, reasoningEffort: { value: "high", source: "muse-events", basis: "session" } });
  expect(value?.executionSettings?.approvalPolicy).toBeUndefined();
});

it("clears an unsupported newer native mode instead of keeping an older approval mode", () => {
 const value = museViewUsage({ events: [{ method: "session/approvalModeChanged", params: { mode: "onRequest" } }, { method: "session/approvalModeChanged", params: { mode: "futureMode" } }] }, null, 100);
 expect(value?.executionSettings?.approvalMode).toBeUndefined();
});
