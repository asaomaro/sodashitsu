import { describe, expect, it } from "vitest";
import { AntigravityUsageAdapter } from "./antigravityAdapter.js";

describe("AntigravityUsageAdapter", () => {
  it("requires the verified current session and keeps absent values absent", async () => {
    const a = new AntigravityUsageAdapter(() => 100);
    a.note({ paneId: "p", sessionId: "s", model: "Gemini", contextUsedPct: 14, contextWindowSize: 100000,
      inputTokens: 100, cacheReadTokens: 30, contextTokens: 130 });
    expect(await a.usageFor({ paneId: "p", sessionId: "other", transcriptPath: undefined })).toBeNull();
    expect(await a.usageFor({ paneId: "p", sessionId: "s", transcriptPath: undefined })).toEqual({
      model: "Gemini", tokens: { basis: "context", input: 100, cacheRead: 30 }, contextTokens: 130,
      contextUsedPct: 14, contextWindowTokens: 100000, source: "statusline", updatedAt: 100,
    });
    a.forget("p");
    expect(await a.usageFor({ paneId: "p", sessionId: "s", transcriptPath: undefined })).toBeNull();
  });
  it("preserves quota units, reset times and stale status without inventing costs", async () => {
    const a = new AntigravityUsageAdapter(() => 200000);
    a.note({ paneId: "p", sessionId: "s", quota: [{ label: "gemini-weekly", usedPct: 6.22, resetsAt: 100 }] });
    expect(await a.accounts()).toEqual([{
      kind: "agy", accountKey: expect.any(String), label: "Antigravity CLI", source: "statusline", asOf: 200000,
      windows: [{ label: "gemini-weekly", usedPct: 6.22, resetsAt: 100000, stale: true }],
    }]);
    a.close();
    a.note({ paneId: "p", sessionId: "s", quota: [{ label: "x", usedPct: 0 }] });
    expect(await a.accounts()).toEqual([]);
  });
});
