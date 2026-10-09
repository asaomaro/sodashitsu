import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ActionDispatcherKey, ConnectionKey, MachineSwitcherKey, TerminalRegistryKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import GraphScreen from "./GraphScreen.vue";

// 20261008-graph-first（PR1b）：デスクトップのグラフの画面（`<dialog>` を使わない入れ物）。
let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountScreen() {
  const registry = { focus: vi.fn() };
  const conn = { request: vi.fn(async () => ({})) };
  const switcher = { switchTo: vi.fn(async () => true) };
  const actions = { run: vi.fn() };
  const wrapper = mount(GraphScreen, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [TerminalRegistryKey as symbol]: registry,
        [ConnectionKey as symbol]: conn,
        [MachineSwitcherKey as symbol]: switcher,
        [ActionDispatcherKey as symbol]: actions,
      },
    },
  });
  return { wrapper, registry, actions, view: useViewStore(pinia) };
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};

describe("GraphScreen", () => {
  it("dialog を使わない。画面が graph の間だけ中身を出し、根にフォーカスを置く（ノードが無いとき）", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { wrapper, view } = mountScreen();
    expect(wrapper.find("dialog").exists()).toBe(false);
    expect(wrapper.find(".graph-toolbar").exists()).toBe(false);
    view.setScreen("graph");
    await flush();
    expect(wrapper.find(".graph-toolbar").exists()).toBe(true);
    expect(wrapper.find(".graph-view").attributes("role")).toBe("region");
    expect(document.activeElement).toBe(wrapper.find(".graph-view").element);
    expect(showModal).not.toHaveBeenCalled();
    showModal.mockRestore();
    wrapper.unmount();
  });

  it("Esc は 1 段ずつ。最後は基本画面へ切り替え、焦点の pane の端末へフォーカスを戻す（開く前の pane へ戻すのではなく、いまの焦点の pane）", async () => {
    const { wrapper, view, registry } = mountScreen();
    view.focusPane("p1");
    view.setScreen("graph");
    await flush();
    view.focusPane("p2"); // 画面のあいだにサイドバーで選び直した
    await wrapper.find(".graph-view").trigger("keydown", { key: "Escape" });
    expect(view.screen).toBe("base");
    await flush();
    expect(registry.focus).toHaveBeenCalledWith("p2");
    expect(view.focusedPaneId).toBe("p2");
    wrapper.unmount();
  });

  it("閉じるボタンで基本画面へ。Esc 以外のキーでは閉じない", async () => {
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    await wrapper.find(".graph-view").trigger("keydown", { key: "a" });
    expect(view.screen).toBe("graph");
    await wrapper.find(".graph-close").trigger("click");
    expect(view.screen).toBe("base");
    wrapper.unmount();
  });

  it("prefix の次が open_graph なら基本画面へ戻る。設定を開くキーは働き、ほかの prefix のキーは食う", async () => {
    const { wrapper, view, actions } = mountScreen();
    view.setScreen("graph");
    await flush();
    const root = wrapper.find(".graph-view");
    await root.trigger("keydown", { key: "b", ctrlKey: true }); // prefix（既定は Ctrl+B）
    await root.trigger("keydown", { key: "s" });
    expect(actions.run).toHaveBeenCalledWith(expect.objectContaining({ type: "settings" }));
    expect(view.screen).toBe("graph");
    await root.trigger("keydown", { key: "b", ctrlKey: true });
    await root.trigger("keydown", { key: "x" }); // 割り当てのある別のキー（ペインを閉じる）は食う
    expect(actions.run).toHaveBeenCalledTimes(1);
    await root.trigger("keydown", { key: "b", ctrlKey: true });
    await root.trigger("keydown", { key: "a" });
    expect(view.screen).toBe("base");
    wrapper.unmount();
  });
});
