import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import { useUsageStore } from "../store/usage.js";
import UsageAnalytics from "./UsageAnalytics.vue";
it("does no account scan or model call until explicit action and keeps unknown model costs visible", async () => {
  const pinia = createPinia();
  const usage = useUsageStore(pinia);
  usage.setSnapshot({ panes: { p: { paneId: "p", kind: "codex", model: "last-only", tokens: { basis: "cumulative", total: 123 }, source: "rollout", updatedAt: 1 } }, accounts: [{ kind: "claude", accountKey: "a", label: "Claude", windows: [], source: "transcript", asOf: 1 }] });
  const request = vi.fn(async (method: string) => method === "agent.account_cost" ? { accountKey: "a", totalUsd: 10, sessions: 2, unpricedSessions: 1, byModel: [{ label: "不明", usd: 10, sessions: 2 }], byEffort: [], partial: true, asOf: 1 } : { text: "改善提案", kind: "codex", model: "", updatedAt: 1 });
  const w = mount(UsageAnalytics, { global: { plugins: [pinia], stubs: { UsageHistoryPanel: true,UsageInsightsPanel:true }, provide: { [ConnectionKey as symbol]: { request } } } });
  expect(request).not.toHaveBeenCalled();
  expect(w.text()).toContain("123");
  expect(w.text()).not.toContain("last-only");
  await w.get("[data-analytics-account]").setValue("a");
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  expect(w.get("[data-analytics-model]").text()).toContain("不明");
  expect(w.text()).toContain("一部の集計");
  await w.get("[data-generate-usage-report]").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenLastCalledWith("agent.usage_report", { settings: { kind: "codex", model: "" }, accountKey: "a" });
  expect(w.get("[data-usage-report]").text()).toBe("改善提案");
  w.unmount();
});
it("shows missing tokens as unknown instead of zero", () => {
  const pinia = createPinia();
  useUsageStore(pinia).setSnapshot({ panes: { p: { paneId: "p", kind: "bob", model: null, tokens: { basis: "cumulative" }, source: "bob-db", updatedAt: 1 } }, accounts: [] });
  const w = mount(UsageAnalytics, { global: { plugins: [pinia] } });
  expect(w.text()).toContain("取得分合計 —");
  expect(w.text()).toContain("トークン取得 0");
  w.unmount();
});

it("puts agent analysis on its own screen and pauses the chart reader",async()=>{
 const w=mount(UsageAnalytics,{attachTo:document.body,global:{plugins:[createPinia()],stubs:{UsageHistoryPanel:true,UsageInsightsPanel:{props:["active","layout"],template:'<div class="chart-stub" :data-active="active" :data-layout="layout" />'}}}});
 expect(w.get('[data-agent-analysis]').isVisible()).toBe(false);
 await w.get('.analysis-navigation button:last-child').trigger('click');
 expect(w.get('[data-agent-analysis]').isVisible()).toBe(true);expect(w.get('.chart-stub').attributes('data-active')).toBe('false');
 expect(w.get('[data-agent-analysis]').text()).toContain('直近会話の限定抜粋');
 await w.get('.analysis-navigation button:nth-child(2)').trigger('click');expect(w.get('[data-agent-analysis]').isVisible()).toBe(false);expect(w.get('.chart-stub').attributes('data-layout')).toBe('compare');w.unmount();
});
