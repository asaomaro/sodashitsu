import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { TerminalRegistryKey } from "../../injection.js";
import { useViewStore } from "../../store/view.js";
import GraphView from "./GraphView.vue";

// 20260927-agent-graph の T4：グラフ画面の枠（開閉だけ。中身は 03-web-graph）。
let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountView() {
  const registry = { focus: vi.fn() };
  const wrapper = mount(GraphView, {
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [TerminalRegistryKey as symbol]: registry } },
  });
  return { wrapper, registry, view: useViewStore(pinia) };
}

describe("GraphView（枠）", () => {
  it("graphOpen の間だけ全画面の role=dialog を出し、開いたら自身へフォーカスする", async () => {
    const { wrapper, view } = mountView();
    expect(wrapper.find(".graph-view").exists()).toBe(false);
    view.openGraph();
    await nextTick();
    await nextTick();
    const root = wrapper.find(".graph-view");
    expect(root.attributes("role")).toBe("dialog");
    expect(root.attributes("aria-label")).toBe("連携（グラフ）");
    expect(document.activeElement).toBe(root.element);
    wrapper.unmount();
  });

  it("Esc で閉じ、開く前の pane の端末へフォーカスを戻す", async () => {
    const { wrapper, view, registry } = mountView();
    view.focusPane("p1");
    view.openGraph();
    await nextTick();
    await wrapper.find(".graph-view").trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(false);
    await nextTick();
    await nextTick();
    expect(registry.focus).toHaveBeenCalledWith("p1");
    expect(wrapper.find(".graph-view").exists()).toBe(false);
    wrapper.unmount();
  });

  it("閉じるボタンで閉じる。Esc 以外のキーでは閉じない", async () => {
    const { wrapper, view } = mountView();
    view.openGraph();
    await nextTick();
    await wrapper.find(".graph-view").trigger("keydown", { key: "a" });
    expect(view.graphOpen).toBe(true);
    await wrapper.find(".graph-close").trigger("click");
    expect(view.graphOpen).toBe(false);
    wrapper.unmount();
  });
});
