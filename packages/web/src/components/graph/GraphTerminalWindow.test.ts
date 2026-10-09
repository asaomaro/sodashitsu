import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { FileTransferKey, GraphTerminalControllerKey, TerminalRegistryKey } from "../../injection.js";
import { useGraphTerminalsStore } from "../../store/graphTerminals.js";
import { useViewStore } from "../../store/view.js";
import GraphTerminalLayer from "./GraphTerminalLayer.vue";

let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountLayer(extra: Record<symbol, unknown> = {}) {
  const controller = { close: vi.fn(), openInBase: vi.fn(), takeover: vi.fn(async () => undefined), noteBodyResized: vi.fn(), pin: vi.fn(), raise: vi.fn(), ensureSelected: vi.fn() };
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
const win = (w: ReturnType<typeof mountLayer>["wrapper"], paneId: string) => w.find(`[data-graph-terminal-window][data-pane-id="${paneId}"]`);

describe("GraphTerminalLayer / GraphTerminalWindow", () => {
  it("窓が無いときは何も出さない", async () => {
    const { wrapper } = mountLayer();
    expect(wrapper.find("[data-graph-terminal-window]").exists()).toBe(false);
    expect(wrapper.find("[data-graph-terminal-layer]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("窓を足すと出て、本体の箱を store に渡す。外すと窓が消える。3 つまで並べられる（重なりの順は z-index）", async () => {
    const { wrapper, store } = mountLayer();
    const a = store.add("p1");
    store.add("p2");
    store.add("p3");
    await flush();
    expect(wrapper.findAll("[data-graph-terminal-window]")).toHaveLength(3);
    expect(store.find("p1")!.container).toBe(win(wrapper, "p1").find("[data-graph-terminal-mount]").element);
    const z = (id: string): number => Number((win(wrapper, id).element as HTMLElement).style.zIndex);
    expect(z("p3")).toBeGreaterThan(z("p2"));
    store.raise(a.key);
    await flush();
    expect(z("p1")).toBeGreaterThan(z("p3"));
    store.remove("p2");
    await flush();
    expect(wrapper.findAll("[data-graph-terminal-window]")).toHaveLength(2);
    wrapper.unmount();
  });

  it("［×］は close(paneId, node)、［基本画面で開く］は openInBase(paneId)、［留める］は pin を呼ぶ。留めた窓は押した状態（aria-pressed）", async () => {
    const { wrapper, store, controller } = mountLayer();
    store.add("p1");
    await flush();
    const w = win(wrapper, "p1");
    await w.find("[data-graph-terminal-close]").trigger("click");
    expect(controller.close).toHaveBeenCalledWith("p1", "node");
    await w.find("[data-graph-terminal-open-base]").trigger("click");
    expect(controller.openInBase).toHaveBeenCalledWith("p1");
    expect(w.find("[data-graph-terminal-pin]").attributes("aria-pressed")).toBe("false");
    await w.find("[data-graph-terminal-pin]").trigger("click");
    expect(controller.pin).toHaveBeenCalledWith("p1", true);
    store.setPinned("p1", true);
    await flush();
    expect(win(wrapper, "p1").find("[data-graph-terminal-pin]").attributes("aria-pressed")).toBe("true");
    wrapper.unmount();
  });

  it("窓を押す・フォーカスが入ると、前へ出して、その pane を選ぶ（窓ごと）", async () => {
    const { wrapper, store, controller } = mountLayer();
    store.add("p1");
    store.add("p2");
    await flush();
    await win(wrapper, "p1").trigger("pointerdown");
    expect(controller.raise).toHaveBeenCalledWith("p1");
    await win(wrapper, "p2").trigger("focusin");
    expect(controller.raise).toHaveBeenCalledWith("p2");
    expect(controller.ensureSelected).not.toHaveBeenCalled(); // 見出しのボタンなどのフォーカスでは、選び直さない（フォーカスが端末へ移ってしまう）
    const ta = document.createElement("textarea");
    ta.className = "xterm-helper-textarea";
    win(wrapper, "p2").find(".gtw-mount").element.appendChild(ta);
    await win(wrapper, "p2").find(".gtw-mount textarea").trigger("focusin");
    expect(controller.ensureSelected).toHaveBeenCalledWith("p2");
    wrapper.unmount();
  });

  it("別のクライアントが直結しているとき（taken）は、その窓だけ端末の箱を隠して［引き取って開く］・［閉じる］を出す", async () => {
    const { wrapper, store, controller } = mountLayer();
    store.add("p1");
    store.add("p2");
    store.setStatus("p1", "taken", { takenBy: "x" });
    await flush();
    expect(win(wrapper, "p1").find("[data-graph-terminal-taken]").exists()).toBe(true);
    expect(win(wrapper, "p2").find("[data-graph-terminal-taken]").exists()).toBe(false);
    expect((win(wrapper, "p1").find("[data-graph-terminal-mount]").element as HTMLElement).style.display).toBe("none");
    await win(wrapper, "p1").find("[data-graph-terminal-takeover]").trigger("click");
    expect(controller.takeover).toHaveBeenCalledWith("p1");
    wrapper.unmount();
  });

  it("失敗の理由を出す。下の行には桁 × 行が出る", async () => {
    const { wrapper, store } = mountLayer();
    store.add("p1");
    store.setStatus("p1", "failed", { failure: "起動できませんでした" });
    store.setSize("p1", 100, 30);
    await flush();
    const w = win(wrapper, "p1");
    expect(w.find("[data-graph-terminal-failed]").text()).toContain("起動できませんでした");
    expect(w.find("[data-graph-terminal-size]").text()).toBe("100 × 30");
    expect(w.find(".gtw-keys").text()).toContain("キーは、この pane に届く");
    wrapper.unmount();
  });

  it("8 つの縁と角のつかむ場所がある（右下の角は data-graph-terminal-corner）。見出しのつかむ場所はフォーカスを受ける", async () => {
    const { wrapper, store } = mountLayer();
    store.add("p1");
    await flush();
    const w = win(wrapper, "p1");
    expect(w.findAll("[data-graph-terminal-handle]")).toHaveLength(8);
    expect(w.find("[data-graph-terminal-handle='se']").attributes("data-graph-terminal-corner")).toBeDefined();
    expect(w.find("[data-graph-terminal-grip]").attributes("tabindex")).toBe("0");
    wrapper.unmount();
  });

  it("見出しのつかむ場所で矢印キー: 窓が動いて、位置と大きさが記憶に入る。Alt+矢印で大きさ。端末の本体では矢印は何もしない", async () => {
    const { wrapper, store } = mountLayer();
    const layer = wrapper.find("[data-graph-terminal-layer]").element as HTMLElement;
    Object.defineProperty(layer, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(layer, "clientHeight", { configurable: true, value: 700 });
    store.add("p1");
    await flush();
    const grip = win(wrapper, "p1").find("[data-graph-terminal-grip]");
    await wrapper.find("[data-graph-terminal-layer]").trigger("pointerdown");
    const before = store.find("p1")!.shownRect!;
    await grip.trigger("keydown", { key: "ArrowLeft" });
    const moved = store.find("p1")!.rect!;
    expect(moved.x).toBe(Math.max(0, before.x - 16));
    expect(store.memory.geometry["p1"]).toBeDefined();
    await grip.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
    expect(store.find("p1")!.rect!.x).toBeLessThanOrEqual(moved.x);
    const r1 = store.find("p1")!.rect!;
    await grip.trigger("keydown", { key: "ArrowRight", altKey: true });
    const r2 = store.find("p1")!.rect!;
    expect(r2.x).toBe(r1.x);
    expect(r2.w).toBeGreaterThanOrEqual(r1.w);
    const before2 = JSON.stringify(store.find("p1")!.rect);
    await win(wrapper, "p1").find(".gtw-body").trigger("keydown", { key: "ArrowLeft" });
    expect(JSON.stringify(store.find("p1")!.rect)).toBe(before2);
    wrapper.unmount();
  });

  it("本体を押すと、その pane を選ぶ（view.focusPane）。ファイルのドラッグは受け、attached でないときは受けない", async () => {
    const drop = vi.fn();
    const { wrapper, store } = mountLayer({ [FileTransferKey as symbol]: { drop } });
    const view = useViewStore(pinia);
    const focus = vi.spyOn(view, "focusPane");
    store.add("p1");
    store.setStatus("p1", "attached");
    await flush();
    const body = win(wrapper, "p1").find(".gtw-body");
    await body.trigger("mousedown");
    expect(focus).toHaveBeenCalledWith("p1");
    const over = new Event("dragover", { cancelable: true, bubbles: true }) as DragEvent;
    Object.defineProperty(over, "dataTransfer", { value: { types: ["Files"], files: [], items: [], dropEffect: "none" } });
    body.element.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    store.setStatus("p1", "taken");
    await flush();
    const over2 = new Event("dragover", { cancelable: true, bubbles: true }) as DragEvent;
    Object.defineProperty(over2, "dataTransfer", { value: { types: ["Files"], files: [], items: [], dropEffect: "none" } });
    body.element.dispatchEvent(over2);
    expect(over2.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("覚えた位置があれば、その位置と大きさ（桁と行）で開く（ノードの隣ではない・線は出さない）", async () => {
    const { wrapper, store } = mountLayer();
    const layer = wrapper.find("[data-graph-terminal-layer]").element as HTMLElement;
    Object.defineProperty(layer, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(layer, "clientHeight", { configurable: true, value: 700 });
    store.remember("p1", { fx: 0, fy: 0, cols: 60, rows: 20 });
    store.add("p1", { anchor: { x: 500, y: 300, w: 200, h: 80 } });
    await flush();
    const r = store.find("p1")!.shownRect!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBeLessThan(700); // 60 桁ぶん
    expect(wrapper.find("[data-graph-terminal-link]").exists()).toBe(false);
    wrapper.unmount();
  });

  const sized = (wrapper: ReturnType<typeof mountLayer>["wrapper"], w: number, h: number) => {
    const layer = wrapper.find("[data-graph-terminal-layer]").element as HTMLElement;
    Object.defineProperty(layer, "clientWidth", { configurable: true, value: w });
    Object.defineProperty(layer, "clientHeight", { configurable: true, value: h });
  };

  it("最初の大きさは、領域の幅の 70%・高さの 80%。最小は 80×24 ぶん、最大は領域から余白 24px ずつを引いた大きさ", async () => {
    const { wrapper, store } = mountLayer();
    sized(wrapper, 1400, 900);
    store.add("p1");
    await flush();
    let r = store.find("p1")!.shownRect!;
    expect(r.w).toBe(980);
    expect(r.h).toBe(720);
    wrapper.unmount();
    // 狭い領域: 70% は 80 桁に満たないので 80×24 ぶん（9×18 のセル＋枠）。最大（領域 − 48px）を超えない
    const narrow = mountLayer();
    sized(narrow.wrapper, 640, 400);
    narrow.wrapper.vm.$forceUpdate();
    narrow.store.add("p2");
    await flush();
    r = narrow.store.find("p2")!.shownRect!;
    expect(r.w).toBeLessThanOrEqual(640 - 48);
    expect(r.h).toBeLessThanOrEqual(400 - 48);
    expect(r.w).toBeGreaterThan(640 * 0.7 - 1);
    narrow.wrapper.unmount();
  });

  it("押したノードの隣に収まるなら隣（右 → 左 → 下 → 上）。どの側にも収まらないときは、領域の中央（点線は出ない）", async () => {
    const { wrapper, store } = mountLayer();
    sized(wrapper, 1400, 900);
    // origin は層の左上（テストでは 0,0）。ノードが左端: 右に 980 幅は収まる
    store.add("left", { anchor: { x: 0, y: 100, w: 200, h: 80 } });
    await flush();
    expect(store.find("left")!.shownRect!.x).toBe(216);
    // ノードが中央: どの側にも 980×720 は収まらない → 中央（(1400-980)/2, (900-720)/2）
    store.remove("left");
    store.add("mid", { anchor: { x: 600, y: 400, w: 200, h: 80 } });
    await flush();
    const r = store.find("mid")!.shownRect!;
    expect(r.x).toBe(210);
    expect(r.y).toBe(90);
    wrapper.unmount();
  });
});
