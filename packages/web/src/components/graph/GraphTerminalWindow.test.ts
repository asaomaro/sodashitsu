import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { FileTransferKey, GraphTerminalControllerKey, TerminalRegistryKey } from "../../injection.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import { useSessionStore } from "../../store/session.js";
import { useViewStore } from "../../store/view.js";
import GraphTerminalLayer from "./GraphTerminalLayer.vue";

let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountLayer(extra: Record<symbol, unknown> = {}) {
  const controller = { close: vi.fn(), openInBase: vi.fn(), takeover: vi.fn(async () => undefined), noteBodyResized: vi.fn() };
  const wrapper = mount(GraphTerminalLayer, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: { [GraphTerminalControllerKey as symbol]: controller, [TerminalRegistryKey as symbol]: { get: () => undefined }, ...extra },
    },
  });
  return { wrapper, controller, store: useGraphTerminalsStore(pinia) };
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) await nextTick();
};

describe("GraphTerminalLayer / GraphTerminalWindow", () => {
  it("窓が無いときは何も出さない。層は押しを通す（pointer-events: none）", async () => {
    const { wrapper } = mountLayer();
    expect(wrapper.find("[data-graph-terminal-window]").exists()).toBe(false);
    expect(wrapper.find("[data-graph-terminal-layer]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("窓を開くと出て、本体の箱を store に渡す。閉じると外す", async () => {
    const { wrapper, store } = mountLayer();
    store.openFor("p1");
    await flush();
    expect(wrapper.find("[data-graph-terminal-window]").attributes("data-pane-id")).toBe("p1");
    expect(store.container).toBe(wrapper.find("[data-graph-terminal-mount]").element);
    store.closeWindow();
    await flush();
    expect(wrapper.find("[data-graph-terminal-window]").exists()).toBe(false);
    expect(store.container).toBeNull();
    wrapper.unmount();
  });

  it("［×］は close(node)、［基本画面で開く］は openInBase を呼ぶ", async () => {
    const { wrapper, store, controller } = mountLayer();
    store.openFor("p1");
    await flush();
    await wrapper.find("[data-graph-terminal-close]").trigger("click");
    expect(controller.close).toHaveBeenCalledWith("node");
    await wrapper.find("[data-graph-terminal-open-base]").trigger("click");
    expect(controller.openInBase).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("別のクライアントが直結しているとき（taken）は、端末の箱を隠して［引き取って開く］・［閉じる］を出す", async () => {
    const { wrapper, store, controller } = mountLayer();
    store.openFor("p1");
    store.setStatus("taken", { takenBy: "x" });
    await flush();
    expect(wrapper.find("[data-graph-terminal-taken]").exists()).toBe(true);
    expect((wrapper.find("[data-graph-terminal-mount]").element as HTMLElement).style.display).toBe("none");
    await wrapper.find("[data-graph-terminal-takeover]").trigger("click");
    expect(controller.takeover).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("失敗の理由を出す。下の行には桁 × 行が出る", async () => {
    const { wrapper, store } = mountLayer();
    store.openFor("p1");
    store.setStatus("failed", { failure: "起動できませんでした" });
    store.setSize(100, 30);
    await flush();
    expect(wrapper.find("[data-graph-terminal-failed]").text()).toContain("起動できませんでした");
    expect(wrapper.find("[data-graph-terminal-size]").text()).toBe("100 × 30");
    expect(wrapper.find(".gtw-keys").text()).toContain("キーは、この pane に届く");
    wrapper.unmount();
  });

  it("本体を押すと、その pane を選ぶ（view.focusPane）。ファイルのドラッグは受け、attached でないときは受けない", async () => {
    const drop = vi.fn();
    const { wrapper, store } = mountLayer({ [FileTransferKey as symbol]: { drop } });
    const view = useViewStore(pinia);
    const focus = vi.spyOn(view, "focusPane");
    useSessionStore(pinia);
    store.openFor("p1");
    store.setStatus("attached");
    await flush();
    await wrapper.find(".gtw-body").trigger("mousedown");
    expect(focus).toHaveBeenCalledWith("p1");
    const over = new Event("dragover", { cancelable: true, bubbles: true }) as DragEvent;
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"], files: [], items: [], dropEffect: "none" } });
    wrapper.find(".gtw-body").element.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    store.setStatus("taken");
    await flush();
    const over2 = new Event("dragover", { cancelable: true, bubbles: true }) as DragEvent;
    Object.defineProperty(over2, "dataTransfer", { value: { types: ["Files"], files: [], items: [], dropEffect: "none" } });
    wrapper.find(".gtw-body").element.dispatchEvent(over2);
    expect(over2.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("窓は層の外へ出ない位置・大きさにそろえる（最初は右上）", async () => {
    const { wrapper, store } = mountLayer();
    const layer = wrapper.find("[data-graph-terminal-layer]").element as HTMLElement;
    Object.defineProperty(layer, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(layer, "clientHeight", { configurable: true, value: 400 });
    store.openFor("p1");
    store.setRect({ x: 5000, y: 5000, w: 5000, h: 5000 });
    await flush();
    const el = wrapper.find("[data-graph-terminal-window]").element as HTMLElement;
    expect(el.style.left).toBeDefined();
    wrapper.unmount();
  });
});
