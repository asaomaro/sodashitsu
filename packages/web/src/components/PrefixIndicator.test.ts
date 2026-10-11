import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useViewStore } from "../store/view.js";
import PrefixIndicator from "./PrefixIndicator.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

describe("PrefixIndicator", () => {
  it("prefix を待っている間だけ PREFIX の帯を出す", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(PrefixIndicator, { global: { plugins: [pinia] } });
    expect(wrapper.find(".prefix-indicator").exists()).toBe(false);

    view.onModeChange("prefix");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".prefix-indicator").exists()).toBe(true);
    expect(wrapper.text()).toContain("数字: タブ");

    view.onModeChange("terminal");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".prefix-indicator").exists()).toBe(false);
  });
});
