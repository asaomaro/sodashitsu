import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { TerminalRegistryKey } from "../../injection.js";
import { useGraphStore } from "../../store/graph.js";
import { useSessionStore } from "../../store/session.js";
import { useViewStore } from "../../store/view.js";
import GraphView from "./GraphView.vue";
import { agentOf, fakeGraphPort, graphOf, paneOf, triggerLink } from "./graphTestKit.js";

// 20260927-agent-graph の T4：グラフ画面の枠（開閉）。03-web-graph で中身（ノード・線・パン/ズーム・ドラッグ）を足した。
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
  it("ネイティブの <dialog> を showModal で開く（背面を inert にして、Tab で背面の端末へ出られない。g01 点検）", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { wrapper, view } = mountView();
    view.openGraph();
    await nextTick();
    await nextTick();
    const root = wrapper.find(".graph-view");
    expect(root.element.tagName).toBe("DIALOG");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect((root.element as HTMLDialogElement).open).toBe(true);
    // ブラウザの Esc（cancel）でも閉じる（既定の閉じ方は止めて、store 経由で閉じる）
    const cancel = new Event("cancel", { cancelable: true });
    root.element.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(view.graphOpen).toBe(false);
    await nextTick();
    await nextTick();
    expect((root.element as HTMLDialogElement).open).toBe(false);
    showModal.mockRestore();
    wrapper.unmount();
  });

  it("graphOpen の間だけ全画面の dialog を開いて中身を出し、ノードが無ければ自身へフォーカスする", async () => {
    const { wrapper, view } = mountView();
    expect((wrapper.find(".graph-view").element as HTMLDialogElement).open).toBe(false);
    expect(wrapper.find(".graph-toolbar").exists()).toBe(false);
    view.openGraph();
    await nextTick();
    await nextTick();
    const root = wrapper.find(".graph-view");
    expect((root.element as HTMLDialogElement).open).toBe(true);
    expect(wrapper.find(".graph-toolbar").exists()).toBe(true);
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
    expect((wrapper.find(".graph-view").element as HTMLDialogElement).open).toBe(false);
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

function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 0,
    ...init,
  });
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};

/** 手元の p1（impl・作業中）・p2（reviewer）を載せ、p1→p2 のトリガ・p1 の監督役 p2 を結んだグラフで開く。 */
async function openWithGraph(extra: Parameters<typeof graphOf>[0] = {}) {
  const t = mountView();
  const session = useSessionStore(pinia);
  session.tabs.set("t1", { id: "t1", workspaceId: "w1" } as never);
  session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("working") }));
  session.panes.set("p2", paneOf("p2", "t1", { label: "reviewer" }));
  const store = useGraphStore(pinia);
  const fake = fakeGraphPort({
    "graph.update": (p) => graphOf({ rev: (p as { baseRev: number }).baseRev + 1 }),
  });
  store.bind(fake.port);
  store.applyGraph(
    graphOf({
      links: [
        triggerLink("l1", "local:p1", "local:p2"),
        {
          id: "l2",
          kind: "supervise",
          from: "local:p1",
          to: "local:p2",
          limit: 10,
          count: 0,
          paused: null,
        },
      ],
      ...extra,
    }),
    "fresh",
  );
  t.view.openGraph();
  await flush();
  return { ...t, store, fake };
}

describe("GraphView（ノードと線。03 T2）", () => {
  it("載せた pane をノードとして呼び名・マシン・エージェント・状態とともに描く", async () => {
    const { wrapper } = await openWithGraph();
    const nodes = wrapper.findAll(".graph-node");
    expect(nodes.map((n) => n.attributes("data-node-key"))).toEqual(["local:p1", "local:p2"]);
    const n1 = nodes[0]!;
    expect(n1.find(".graph-node-name").text()).toBe("impl");
    expect(n1.find(".graph-node-machine").text()).toBe("ローカル");
    expect(n1.find(".graph-node-agent-name").text()).toBe("Claude Code");
    expect(n1.find("[data-state]").attributes("data-state")).toBe("working");
    expect(n1.attributes("role")).toBe("group");
    expect(n1.attributes("aria-roledescription")).toBe("ノード");
    expect(n1.attributes("aria-label")).toContain("出る線 2 本・入る線 0 本");
    wrapper.unmount();
  });

  it("線は種類ごとに線種と印が違い（色に頼らない）、中点のチップにラベル・回数/上限を出す。監督は監督役→配下の向きで描く", async () => {
    const { wrapper } = await openWithGraph();
    const trig = wrapper.find('[data-link-id="l1"]');
    const sup = wrapper.find('[data-link-id="l2"]');
    expect(trig.classes()).toContain("graph-edge-trigger");
    expect(trig.classes()).toContain("graph-edge-heavy"); // 受け渡しあり
    expect(sup.classes()).toContain("graph-edge-supervise");
    // 監督: 監督役（p2、右）から配下（p1、左）へ——始点が右
    const supD = sup.find(".graph-edge-line").attributes("d")!;
    const trigD = trig.find(".graph-edge-line").attributes("d")!;
    const startX = (d: string) => Number(d.split(" ")[1]);
    expect(startX(supD)).toBeGreaterThan(startX(trigD));
    expect(wrapper.find('[data-link-chip="l1"]').text()).toBe("完了→ 0/10");
    expect(wrapper.find('[data-link-chip="l2"]').text()).toBe("監督 0/10");
    expect(wrapper.find('[data-link-chip="l1"]').attributes("aria-label")).toBe(
      "トリガ: impl → reviewer（完了したとき）・実行 0/10・有効",
    );
    wrapper.unmount();
  });

  it("一時停止・上限・無効（pane が無い）は文字の印を併記する", async () => {
    const { wrapper, store } = await openWithGraph({
      nodes: [
        { key: "local:p1", x: 0, y: 0 },
        { key: "local:p2", x: 300, y: 0 },
        { key: "local:p9", x: 0, y: 200 },
      ],
      links: [
        triggerLink("l1", "local:p1", "local:p2", { paused: "limit", count: 10 }),
        triggerLink("l3", "local:p1", "local:p9", { paused: "user" }),
      ],
    });
    expect(wrapper.find('[data-link-chip="l1"]').text()).toBe("完了→ 10/10 ⏸ 上限");
    expect(wrapper.find('[data-link-chip="l3"]').text()).toBe("完了→ 0/10 ⏸ ⚠");
    expect(wrapper.find('[data-link-id="l3"]').classes()).toContain("graph-edge-invalid");
    expect(wrapper.find('[data-node-key="local:p9"]').text()).toContain("⚠ 無効");
    store.applyGraph(
      graphOf({ rev: 9, paused: true, links: [triggerLink("l1", "local:p1", "local:p2")] }),
      "event",
    );
    await flush();
    expect(wrapper.find('[data-link-chip="l1"]').text()).toBe("完了→ 0/10 ⏸ 全体");
    expect(wrapper.find('[data-link-id="l1"]').classes()).toContain("graph-edge-paused");
    wrapper.unmount();
  });

  it("graph.fired で線が光り、チップに直前の結果の印が出る", async () => {
    const { wrapper, store } = await openWithGraph();
    store.applyFired({ linkId: "l1", at: 1, result: "sent" });
    await flush();
    expect(wrapper.find('[data-link-id="l1"]').classes()).toContain("graph-edge-fired");
    expect(wrapper.find('[data-link-chip="l1"]').text()).toBe("完了→ 0/10 ✓");
    wrapper.unmount();
  });

  it("ノードのドラッグは 4px から動き、20px に吸着し、離したら move_node を送る（Alt で吸着を外す）", async () => {
    const { wrapper, store, fake } = await openWithGraph();
    const node = wrapper.find('[data-node-key="local:p2"]').element;
    node.dispatchEvent(pointer("pointerdown", { clientX: 100, clientY: 100 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 102, clientY: 101 }));
    expect(store.dragPositions.size).toBe(0); // 閾値の内側
    window.dispatchEvent(pointer("pointermove", { clientX: 133, clientY: 109 }));
    expect(store.dragPositions.get("local:p2")).toEqual({ x: 340, y: 0 });
    // ドラッグ中はサーバの値で上書きしない
    store.applyGraph(graphOf({ rev: 5 }), "event");
    await flush();
    expect((wrapper.find('[data-node-key="local:p2"]').element as HTMLElement).style.left).toBe(
      "340px",
    );
    window.dispatchEvent(pointer("pointerup", { clientX: 137, clientY: 111, altKey: true }));
    await flush();
    expect(fake.calls.at(-1)).toEqual({
      method: "graph.update",
      params: { baseRev: 5, ops: [{ op: "move_node", key: "local:p2", x: 337, y: 11 }] },
    });
    wrapper.unmount();
  });

  it("ドラッグ中の Esc はドラッグだけを取り消し（元の位置・何も送らない）、グラフ画面は閉じない", async () => {
    const { wrapper, store, fake, view } = await openWithGraph();
    const node = wrapper.find('[data-node-key="local:p1"]').element;
    node.dispatchEvent(pointer("pointerdown", { clientX: 0, clientY: 0 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 60, clientY: 60 }));
    expect(store.dragPositions.size).toBe(1);
    node.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(store.dragPositions.size).toBe(0);
    window.dispatchEvent(pointer("pointerup", { clientX: 60, clientY: 60 }));
    await flush();
    expect(fake.calls).toHaveLength(0);
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });

  it("背景のドラッグでパン、何も無い所のクリックで選択を外す", async () => {
    const { wrapper } = await openWithGraph();
    const canvas = wrapper.find(".graph-canvas").element;
    const world = wrapper.find(".graph-world").element as HTMLElement;
    const before = world.style.transform;
    canvas.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 60, clientY: 30 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 60, clientY: 30 }));
    await flush();
    expect(world.style.transform).not.toBe(before);
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    expect(wrapper.find('[data-link-chip="l1"]').classes()).toContain("graph-chip-selected");
    canvas.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 10, clientY: 10 }));
    await flush();
    expect(wrapper.find('[data-link-chip="l1"]').classes()).not.toContain("graph-chip-selected");
    wrapper.unmount();
  });

  it("ホイールはページをスクロールさせずにパン、Ctrl＋ホイールはズーム（AC-I5）", async () => {
    const { wrapper } = await openWithGraph();
    const canvas = wrapper.find(".graph-canvas").element;
    const zoom = () => wrapper.find(".graph-zoom").text();
    const z0 = zoom();
    const w1 = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
    canvas.dispatchEvent(w1);
    expect(w1.defaultPrevented).toBe(true);
    await flush();
    expect(zoom()).toBe(z0);
    const w2 = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    Object.defineProperty(w2, "ctrlKey", { value: true }); // happy-dom の WheelEvent は修飾キーを持たない
    canvas.dispatchEvent(w2);
    expect(w2.defaultPrevented).toBe(true);
    await flush();
    expect(zoom()).not.toBe(z0);
    wrapper.unmount();
  });

  it("1 で全体表示、+・- で拡大縮小、0 で 100%", async () => {
    const { wrapper } = await openWithGraph();
    const root = wrapper.find(".graph-view");
    await root.trigger("keydown", { key: "0" });
    expect(wrapper.find(".graph-zoom").text()).toBe("100%");
    await root.trigger("keydown", { key: "+" });
    expect(wrapper.find(".graph-zoom").text()).toBe("120%");
    await root.trigger("keydown", { key: "-" });
    expect(wrapper.find(".graph-zoom").text()).toBe("100%");
    await root.trigger("keydown", { key: "1" });
    expect(wrapper.find(".graph-zoom").text()).toBe("100%"); // 2 つのノードは等倍で収まる（全体表示は 1 を超えない）
    wrapper.unmount();
  });

  it("開いたら直前の pane のノードへ、載っていなければ先頭のノードへフォーカスする（AC-I4）", async () => {
    const t = mountView();
    t.view.focusPane("p2");
    const store = useGraphStore(pinia);
    store.applyGraph(graphOf(), "fresh");
    t.view.openGraph();
    await flush();
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    t.view.closeGraph();
    await flush();
    t.view.focusPane("p5");
    t.view.openGraph();
    await flush();
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p1");
    t.wrapper.unmount();
  });

  it("グラフがまだ無ければ読み込み、届いてからノードへフォーカスする", async () => {
    const t = mountView();
    t.view.focusPane("p2");
    const store = useGraphStore(pinia);
    const fake = fakeGraphPort({ "graph.get": () => graphOf() });
    store.bind(fake.port);
    t.view.openGraph();
    await flush();
    await flush();
    expect(fake.calls[0]!.method).toBe("graph.get");
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    t.wrapper.unmount();
  });

  it("Esc は選択を外し、もう一度で閉じる", async () => {
    const { wrapper, view } = await openWithGraph();
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    const root = wrapper.find(".graph-view");
    await root.trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(true);
    expect(wrapper.find(".graph-chip-selected").exists()).toBe(false);
    await root.trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(false);
    wrapper.unmount();
  });
});
