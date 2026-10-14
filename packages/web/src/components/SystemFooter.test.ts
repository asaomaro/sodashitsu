import { expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { ConnectionKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
import SystemFooter from "./SystemFooter.vue";
it("shows an unavailable state after successfully reading unsupported-only metrics", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.setSystemFooterSettings({ enabled: true, fields: ["load"] });
  useViewStore().connectionState = "open";
  const wrapper = mount(SystemFooter, {
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: {
          request: async () => ({
            sampledAt: 1,
            cpuPercent: null,
            memoryTotalBytes: 8,
            memoryAvailableBytes: 4,
            uptimeSeconds: 1,
            serverRssBytes: 1,
            hostname: "host",
            loadAverage: null,
          }),
        },
      },
    },
  });
  try {
    await nextTick();
    expect(wrapper.text()).toContain("選択した情報は利用できません");
    settings.setSystemFooterSettings({ enabled: false, fields: ["load"] });
    await nextTick();
    expect(wrapper.find("footer").exists()).toBe(false);
  } finally {
    wrapper.unmount();
    localStorage.clear();
  }
});

it("keeps the left settings button when every field is hidden", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.setSystemFooterSettings({ enabled: true, fields: [] });
  const wrapper = mount(SystemFooter, { global: { plugins: [pinia] } });
  try {
    await wrapper.get('button[aria-label="フッターの設定"]').trigger("click");
    expect(useViewStore().dialogContext?.kind).toBe("systemFooterSettings");
    expect(wrapper.find("footer").exists()).toBe(true);
  } finally {
    wrapper.unmount();
    localStorage.clear();
  }
});
