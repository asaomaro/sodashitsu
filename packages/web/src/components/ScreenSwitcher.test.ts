import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { it, expect } from "vitest";
import ScreenSwitcher from "./ScreenSwitcher.vue";
import { useViewStore } from "../store/view.js";
it("keeps three primary screens and moves secondary screens into a separately named menu", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const w = mount(ScreenSwitcher, { global: { plugins: [pinia], stubs: { Teleport: true } } });
  expect(w.findAll("[data-screen-id]").map((b) => b.attributes("data-screen-id"))).toEqual([
    "base",
    "graph",
    "dashboard",
  ]);
  expect(w.find("[data-screen-more]").text()).toContain("その他");
  await w.find("[data-screen-more]").trigger("click");
  expect(w.find("nav").text()).toContain("セッション履歴");
  await w.find('[data-screen-id="history"]').trigger("click");
  expect(useViewStore(pinia).screen).toBe("history");
  expect(w.find("[data-screen-more]").text()).toContain("セッション履歴");
  expect(w.find("nav").exists()).toBe(false);
  w.unmount();
});
