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

it("keeps Antigravity reported costs, effort and amount-only quota without fictitious percentages",async()=>{
 const a=new AntigravityUsageAdapter(()=>200000);
 a.note({paneId:"p",sessionId:"s",costUsd:0.4,costEstimated:true,reasoningEffort:"high",plan:"Pro",balances:[{label:"credits",remaining:123,resetsAt:100}]});
 expect(await a.usageFor({paneId:"p",sessionId:"s",transcriptPath:undefined})).toMatchObject({costUsd:0.4,costEstimated:true,reasoningEffort:"high",tokens:{basis:"context"}});
 expect((await a.accounts())[0]).toMatchObject({plan:"Pro",windows:[],balances:[{label:"credits",remaining:123,resetsAt:100000,stale:true}]});a.close();
});
it("Copilot native cumulative counters and credits remain separate from current context",async()=>{
 const a=new AntigravityUsageAdapter(()=>123,{},"copilot");
 a.note({paneId:"p",sessionId:"12345678-abcd-ef01-2345-6789abcdef01",cumulativeTokens:{input:300,output:50,cacheRead:200,total:550},contextTokens:40,contextRemainingTokens:960,contextWindowSize:1000,creditsAic:0,premiumRequests:2});
 expect(await a.usageFor({paneId:"p",sessionId:"12345678-abcd-ef01-2345-6789abcdef01",transcriptPath:undefined})).toMatchObject({tokens:{basis:"cumulative",total:550},contextTokens:40,contextRemainingTokens:960,credits:{amount:0,unit:"aic"},premiumRequests:2});a.close();
});
