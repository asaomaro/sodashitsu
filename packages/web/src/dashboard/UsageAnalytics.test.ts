import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import { useUsageStore } from "../store/usage.js";
import UsageAnalytics from "./UsageAnalytics.vue";
it("keeps account reads and model execution explicit while sharing selected costs with the report", async () => {
  const pinia = createPinia();
  useUsageStore(pinia).setSnapshot({
    panes: {},
    accounts: [
      {
        kind: "claude",
        accountKey: "a",
        label: "Claude",
        windows: [],
        source: "transcript",
        asOf: 1,
      },
    ],
  });
  const request = vi.fn(async (method: string) =>
    method === "agent.account_cost"
      ? {
          accountKey: "a",
          totalUsd: 10,
          sessions: 2,
          unpricedSessions: 1,
          byModel: [{ label: "不明", usd: 10, sessions: 2 }],
          byEffort: [],
          partial: true,
          asOf: 1,
        }
      : { text: "改善提案", kind: "codex", model: "", updatedAt: 1 },
  );
  const w = mount(UsageAnalytics, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: { UsageInsightsPanel: true },
      provide: { [ConnectionKey as symbol]: { request } },
    },
  });
  expect(request).not.toHaveBeenCalled();
  expect(w.find(".legacy-analysis").exists()).toBe(false);
  expect(w.find("[data-usage-history]").exists()).toBe(false);
  await w.get(".analysis-navigation button:nth-child(2)").trigger("click");
  await w.get("[data-analytics-account]").setValue("a");
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  expect(w.get("[data-analytics-model]").text()).toContain("不明");
  expect(w.text()).toContain("一部の集計");
  await w.get(".analysis-navigation button:last-child").trigger("click");
  expect(w.get("[data-account-cost]").isVisible()).toBe(false);
  await w.get("[data-generate-usage-report]").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenLastCalledWith("agent.usage_report", {
    settings: { kind: "codex", model: "" },
    accountKey: "a",
  });
  expect(w.get("[data-usage-report]").text()).toContain("改善提案");
  w.unmount();
});
it("separates the agent report screen and pauses the chart reader", async () => {
  const w = mount(UsageAnalytics, {
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
      stubs: {
        UsageInsightsPanel: {
          props: ["active", "layout"],
          template: '<div class="chart-stub" :data-active="active" :data-layout="layout"/>',
        },
      },
    },
  });
  expect(w.get("[data-agent-analysis]").isVisible()).toBe(false);
  await w.get(".analysis-navigation button:last-child").trigger("click");
  expect(w.get("[data-agent-analysis]").isVisible()).toBe(true);
  expect(w.get(".chart-stub").attributes("data-active")).toBe("false");
  expect(w.text()).toContain("直近会話の限定抜粋");
  expect(w.find("[data-account-cost]").isVisible()).toBe(false);
  await w.get(".analysis-navigation button:nth-child(2)").trigger("click");
  expect(w.get(".chart-stub").attributes("data-layout")).toBe("compare");
  expect(w.get("[data-account-cost]").isVisible()).toBe(true);
  w.unmount();
});
