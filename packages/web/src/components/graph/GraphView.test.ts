import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ConnectionKey, MachineSwitcherKey, TerminalRegistryKey } from "../../injection.js";
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
  const conn = { request: vi.fn(async () => ({})) };
  const switcher = { switchTo: vi.fn(async () => true) };
  const wrapper = mount(GraphView, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [TerminalRegistryKey as symbol]: registry,
        [ConnectionKey as symbol]: conn,
        [MachineSwitcherKey as symbol]: switcher,
      },
    },
  });
  return { wrapper, registry, conn, switcher, view: useViewStore(pinia) };
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
    // 既定は内容を変えずに rev だけ進める（操作の中身は各試験が calls で確かめる）。
    "graph.update": (p) => ({ ...store.graph!, rev: (p as { baseRev: number }).baseRev + 1 }),
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
    await flush();
    expect(wrapper.find('[data-link-chip="l1"]').classes()).toContain("graph-chip-selected");
    // 1 回目はパネルを閉じる（外側のクリック）、2 回目で選択を外す
    for (let i = 0; i < 2; i++) {
      canvas.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
      window.dispatchEvent(pointer("pointerup", { clientX: 10, clientY: 10 }));
      await flush();
    }
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

  it("Esc は 1 段ずつ: パネル → 選択 → 画面", async () => {
    const { wrapper, view } = await openWithGraph();
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    const root = wrapper.find(".graph-view");
    await root.trigger("keydown", { key: "Escape" });
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(wrapper.find(".graph-chip-selected").exists()).toBe(true);
    await root.trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(true);
    expect(wrapper.find(".graph-chip-selected").exists()).toBe(false);
    await root.trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(false);
    wrapper.unmount();
  });
});

describe("GraphView（線の作成と設定・一時停止。03 T3）", () => {
  beforeEach(() => {
    // 等倍・原点の表示（画面の座標＝世界の座標）で始める（全体表示にしない）。
    localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 1, panX: 0, panY: 0 }));
  });

  it("ハンドルから別のノードへドラッグして離すと新しい線のパネル。保存で add_link を送り、新しい線のチップへフォーカス", async () => {
    const { wrapper, fake, store } = await openWithGraph({ links: [] });
    fake.handlers["graph.update"] = () =>
      graphOf({ rev: 2, links: [triggerLink("l7", "local:p1", "local:p2")] });
    const handle = wrapper.find('[data-node-key="local:p1"] .graph-node-handle').element;
    handle.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 40 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 340, clientY: 40 }));
    await flush();
    expect(wrapper.find(".graph-connecting").exists()).toBe(true);
    expect(wrapper.find('[data-node-key="local:p2"]').classes()).toContain("graph-node-drop");
    window.dispatchEvent(pointer("pointerup", { clientX: 350, clientY: 40 }));
    await flush();
    expect(wrapper.find(".graph-connecting").exists()).toBe(false);
    expect(wrapper.find(".link-panel-heading").text()).toBe("新しい線: impl → reviewer（トリガ）");
    expect(fake.calls).toHaveLength(0); // 保存するまで送らない
    await wrapper.find(".link-panel-save").trigger("click");
    await flush();
    expect(fake.calls[0]).toMatchObject({
      method: "graph.update",
      params: {
        baseRev: 1,
        ops: [{ op: "add_link", kind: "trigger", from: "local:p1", to: "local:p2", limit: 10 }],
      },
    });
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(store.links.map((l) => l.id)).toEqual(["l7"]);
    expect(document.activeElement?.getAttribute("data-link-chip")).toBe("l7");
    wrapper.unmount();
  });

  it("ハンドルのドラッグを空白・元のノードで離す、Esc で取り消すと線を作らない（AC-I2）", async () => {
    const { wrapper, view } = await openWithGraph({ links: [] });
    const handle = wrapper.find('[data-node-key="local:p1"] .graph-node-handle').element;
    handle.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 40 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 250, clientY: 300 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 250, clientY: 300 }));
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    handle.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 40 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 100, clientY: 40 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 100, clientY: 40 }));
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    handle.dispatchEvent(pointer("pointerdown", { clientX: 200, clientY: 40 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 340, clientY: 40 }));
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await flush();
    window.dispatchEvent(pointer("pointerup", { clientX: 340, clientY: 40 }));
    await flush();
    expect(wrapper.find(".graph-connecting").exists()).toBe(false);
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });

  it("キーだけで結ぶ: ノードで c → 先へフォーカス → Enter でパネル。接続モードの Esc は元のノードへ戻る", async () => {
    const { wrapper, view } = await openWithGraph({ links: [] });
    const n1 = wrapper.find('[data-node-key="local:p1"]');
    (n1.element as HTMLElement).focus();
    await n1.trigger("keydown", { key: "c" });
    await flush();
    expect(wrapper.find(".graph-connect-banner").exists()).toBe(true);
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    expect(wrapper.find(".graph-live").text()).toContain("結ぶ先のノードを選んでください");
    // Tab は候補の間で回る（元のノードは選べない）
    await wrapper.find('[data-node-key="local:p2"]').trigger("keydown", { key: "Tab" });
    await flush();
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    await wrapper.find(".graph-view").trigger("keydown", { key: "Escape" });
    await flush();
    expect(wrapper.find(".graph-connect-banner").exists()).toBe(false);
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p1");
    expect(view.graphOpen).toBe(true);
    await n1.trigger("keydown", { key: "c" });
    await flush();
    await wrapper.find('[data-node-key="local:p2"]').trigger("keydown", { key: "Enter" });
    await flush();
    expect(wrapper.find(".link-panel-heading").text()).toBe("新しい線: impl → reviewer（トリガ）");
    wrapper.unmount();
  });

  it("チップのクリックで設定を開き、上限を変えて保存すると update_link。パネルの Esc は閉じてその線へ戻る", async () => {
    const { wrapper, fake, view } = await openWithGraph();
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    expect(wrapper.find(".link-panel-heading").text()).toBe("線: impl → reviewer（トリガ）");
    await wrapper.find(".link-panel-limit").setValue(5);
    await wrapper.find(".link-panel-save").trigger("click");
    await flush();
    expect(fake.calls[0]).toMatchObject({
      method: "graph.update",
      params: { ops: [{ op: "update_link", id: "l1", limit: 5 }] },
    });
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    wrapper
      .find(".link-panel-limit")
      .element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(document.activeElement?.getAttribute("data-link-chip")).toBe("l1");
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });

  it("パネルを開いている間の外側のクリックは取り消し（変更が無ければ閉じる）で、パンもしない", async () => {
    const { wrapper } = await openWithGraph();
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    const world = wrapper.find(".graph-world").element as HTMLElement;
    const before = world.style.transform;
    wrapper
      .find(".graph-canvas")
      .element.dispatchEvent(pointer("pointerdown", { clientX: 5, clientY: 5 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 90, clientY: 90 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 90, clientY: 90 }));
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(world.style.transform).toBe(before);
    wrapper.unmount();
  });

  it("線の削除は確認を挟み（既定のフォーカスは取り消す）、取り消せば何も送らずチップへ戻り、確定で remove_link", async () => {
    const { wrapper, fake } = await openWithGraph();
    const chip = wrapper.find('[data-link-chip="l1"]');
    (chip.element as HTMLElement).focus();
    await chip.trigger("keydown", { key: "Delete" });
    await flush();
    expect(wrapper.find(".graph-confirm-message").text()).toBe(
      "線（トリガ: impl → reviewer）を削除しますか？",
    );
    expect(document.activeElement?.className).toBe("graph-confirm-cancel");
    await wrapper.find(".graph-confirm").trigger("keydown", { key: "Escape" });
    await flush();
    expect(wrapper.find(".graph-confirm").exists()).toBe(false);
    expect(fake.calls).toHaveLength(0);
    expect(document.activeElement?.getAttribute("data-link-chip")).toBe("l1");
    await chip.trigger("keydown", { key: "Backspace" });
    await flush();
    await wrapper.find(".graph-confirm-ok").trigger("click");
    await flush();
    expect(fake.calls[0]).toMatchObject({
      method: "graph.update",
      params: { ops: [{ op: "remove_link", id: "l1" }] },
    });
    wrapper.unmount();
  });

  it("ツールバーで全体の一時停止・再開、チップの p で線の一時停止・再開（AC12）", async () => {
    const { wrapper, fake, store } = await openWithGraph();
    fake.handlers["graph.pause"] = (p) =>
      (p as { linkId?: string }).linkId
        ? graphOf({
            rev: 3,
            links: [triggerLink("l1", "local:p1", "local:p2", { paused: "user" })],
          })
        : graphOf({ rev: 2, paused: true, links: store.links });
    fake.handlers["graph.resume"] = () =>
      graphOf({ rev: 4, links: [triggerLink("l1", "local:p1", "local:p2")] });
    const btn = wrapper.find(".graph-pause-all");
    expect(btn.text()).toBe("全体を一時停止");
    await btn.trigger("click");
    await flush();
    expect(fake.calls[0]).toEqual({ method: "graph.pause", params: {} });
    expect(btn.text()).toBe("全体を再開");
    expect(btn.attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".graph-paused-badge").exists()).toBe(true);
    await wrapper.find('[data-link-chip="l1"]').trigger("keydown", { key: "p" });
    await flush();
    expect(fake.calls[1]).toEqual({ method: "graph.pause", params: { linkId: "l1" } });
    expect(wrapper.find('[data-link-chip="l1"]').text()).toContain("⏸");
    await wrapper.find('[data-link-chip="l1"]').trigger("keydown", { key: "p" });
    await flush();
    expect(fake.calls[2]).toEqual({ method: "graph.resume", params: { linkId: "l1" } });
    wrapper.unmount();
  });
});

describe("GraphView（pane を載せる/外す・履歴・pane へ移動。03 T4）", () => {
  beforeEach(() => {
    localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 1, panX: 0, panY: 0 }));
  });

  function seedWorkspace(): void {
    const session = useSessionStore(pinia);
    session.workspaceUpserted({ id: "w1", label: "api", tabIds: ["t1"] } as never);
    session.panes.set("p3", paneOf("p3", "t1", { label: "fixer" }));
  }

  it("「pane を載せる」で選んで適用すると、外接矩形の右隣に add_node を送り、足したノードへフォーカス", async () => {
    const { wrapper, fake } = await openWithGraph();
    seedWorkspace();
    fake.handlers["graph.update"] = () =>
      graphOf({ rev: 2, nodes: [...graphOf().nodes, { key: "local:p3", x: 560, y: 0 }] });
    await wrapper.find(".graph-add-panes").trigger("click");
    await flush();
    expect(wrapper.find(".graph-add-panes").attributes("aria-expanded")).toBe("true");
    await wrapper.find('[data-pane-key="local:p3"]').setValue(true);
    await wrapper.find(".pane-checklist-apply").trigger("click");
    await flush();
    expect(fake.calls[0]).toEqual({
      method: "graph.update",
      params: { baseRev: 1, ops: [{ op: "add_node", key: "local:p3", x: 560, y: 0 }] },
    });
    expect(wrapper.find(".pane-checklist").exists()).toBe(false);
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p3");
    wrapper.unmount();
  });

  it("チェックリストで外すときは消える線の本数を書いて確かめる。取り消せば何も送らない。外側のクリックはチェックリストを閉じるだけ", async () => {
    const { wrapper, fake } = await openWithGraph();
    await wrapper.find(".graph-add-panes").trigger("click");
    await flush();
    wrapper
      .find(".graph-canvas")
      .element.dispatchEvent(pointer("pointerdown", { clientX: 700, clientY: 500 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 700, clientY: 500 }));
    await flush();
    expect(wrapper.find(".pane-checklist").exists()).toBe(false);
    await wrapper.find(".graph-add-panes").trigger("click");
    await flush();
    await wrapper.find('[data-pane-key="local:p1"]').setValue(false);
    await wrapper.find(".pane-checklist-apply").trigger("click");
    await flush();
    expect(wrapper.find(".graph-confirm-message").text()).toBe(
      "pane（impl）をグラフから外しますか？",
    );
    expect(wrapper.find(".graph-confirm-detail").text()).toContain("繋がる線 2 本も消えます");
    await wrapper.find(".graph-confirm-cancel").trigger("click");
    await flush();
    expect(fake.calls).toHaveLength(0);
    expect(document.activeElement?.className).toContain("graph-add-panes");
    wrapper.unmount();
  });

  it("ノードの Delete は確認のうえ remove_node（線も一緒に消える）", async () => {
    const { wrapper, fake } = await openWithGraph();
    const n = wrapper.find('[data-node-key="local:p2"]');
    await n.trigger("keydown", { key: "Delete" });
    await flush();
    expect(wrapper.find(".graph-confirm-message").text()).toBe(
      "pane（reviewer）をグラフから外しますか？",
    );
    await wrapper.find(".graph-confirm-ok").trigger("click");
    await flush();
    expect(fake.calls[0]).toMatchObject({
      params: { ops: [{ op: "remove_node", key: "local:p2" }] },
    });
    wrapper.unmount();
  });

  it("ノードの Enter・「pane へ」でグラフ画面を閉じてその pane へ移り、焦点はその pane（AC2・AC-I4）", async () => {
    const t = await openWithGraph();
    t.view.focusPane("p1");
    await t.wrapper.find('[data-node-key="local:p2"]').trigger("keydown", { key: "Enter" });
    await flush();
    expect(t.view.graphOpen).toBe(false);
    expect(t.view.focusedPaneId).toBe("p2");
    expect(t.view.tabId).toBe("t1");
    expect(t.conn.request).toHaveBeenCalledWith("pane.focus", { paneId: "p2" });
    expect(t.registry.focus).toHaveBeenLastCalledWith("p2");
    t.view.openGraph();
    await flush();
    await t.wrapper.find('[data-node-key="local:p1"] .graph-node-goto').trigger("click");
    await flush();
    expect(t.view.focusedPaneId).toBe("p1");
    t.wrapper.unmount();
  });

  it("別のマシンのノードはそのマシンへ切り替えて pane の tab を開く。pane が無ければ知らせるだけ", async () => {
    const M = "a".repeat(32);
    const t = await openWithGraph({
      nodes: [
        { key: "local:p1", x: 0, y: 0 },
        { key: `${M}:p7`, x: 300, y: 0 },
      ],
      links: [],
    });
    const machines = (await import("../../store/machines.js")).useMachinesStore(pinia);
    machines.applySummarySnapshot(M, {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [],
      tabs: [{ id: "t9", workspaceId: "w9" } as never],
      panes: [paneOf("p7", "t9")],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    });
    await flush();
    expect(t.wrapper.find(`[data-node-key="${M}:p7"] .graph-node-name`).text()).toBe("pane p7");
    await t.wrapper.find(`[data-node-key="${M}:p7"]`).trigger("keydown", { key: "Enter" });
    expect(t.switcher.switchTo).toHaveBeenCalledWith(M, { workspaceId: "w9", tabId: "t9" });
    t.view.openGraph();
    await flush();
    useSessionStore(pinia).panes.delete("p1");
    await flush();
    await t.wrapper.find('[data-node-key="local:p1"]').trigger("keydown", { key: "Enter" });
    expect(t.view.graphOpen).toBe(true);
    expect(t.view.toasts.at(-1)!.message).toBe("pane p1 の pane が見つかりません。");
    t.wrapper.unmount();
  });

  it("「履歴」で履歴を開き（graph.history）、パネルの「履歴」はその線に絞る。Esc で閉じてボタンへ戻る", async () => {
    const { wrapper, fake } = await openWithGraph();
    fake.handlers["graph.history"] = () => ({
      runs: [
        { linkId: "l1", at: 1, result: "sent" },
        { linkId: "l2", at: 2, result: "skipped", reason: "paused" },
      ],
    });
    await wrapper.find(".graph-history").trigger("click");
    await flush();
    expect(fake.calls.some((c) => c.method === "graph.history")).toBe(true);
    expect(wrapper.findAll(".history-row")).toHaveLength(2);
    await wrapper.find(".history-panel").trigger("keydown", { key: "Escape" });
    await flush();
    expect(wrapper.find(".history-panel").exists()).toBe(false);
    expect(document.activeElement?.className).toContain("graph-history");
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    await wrapper.find(".link-panel-history").trigger("click");
    await flush();
    expect(wrapper.findAll(".history-row")).toHaveLength(1);
    expect(wrapper.find(".link-panel").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("GraphView（キーボード・フォーカス・モバイル。03 T5）", () => {
  beforeEach(() => {
    localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 1, panX: 0, panY: 0 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const key = (k: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

  it("開いたのと同じ prefix＋キー（既定 Ctrl+B a）で閉じる。パネルの入力欄にいても閉じる", async () => {
    const { wrapper, view } = await openWithGraph();
    const node = wrapper.find('[data-node-key="local:p1"]').element;
    node.dispatchEvent(key("b", { ctrlKey: true }));
    const a = key("a");
    node.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(true);
    expect(view.graphOpen).toBe(false);
    view.openGraph();
    await flush();
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    const prompt = wrapper.find(".link-panel-prompt").element;
    prompt.dispatchEvent(key("b", { ctrlKey: true }));
    prompt.dispatchEvent(key("a"));
    expect(view.graphOpen).toBe(false);
    wrapper.unmount();
  });

  it("prefix の後のほかのキーは閉じずに食う（グラフの操作へ渡さない）。prefix の無い a は何もしない", async () => {
    const { wrapper, view } = await openWithGraph();
    const root = wrapper.find(".graph-view").element;
    const zoom = () => wrapper.find(".graph-zoom").text();
    root.dispatchEvent(key("b", { ctrlKey: true }));
    root.dispatchEvent(key("Control", { ctrlKey: true })); // 修飾キー単体は prefix を保つ
    root.dispatchEvent(key("+"));
    await flush();
    expect(zoom()).toBe("100%");
    expect(view.graphOpen).toBe(true);
    root.dispatchEvent(key("a"));
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });

  it("矢印でノードを 1 グリッド（Shift で 5）動かし、連打が止まって 300ms 後に送る", async () => {
    const { wrapper, fake, store } = await openWithGraph();
    vi.useFakeTimers();
    const n = wrapper.find('[data-node-key="local:p2"]').element;
    n.dispatchEvent(key("ArrowRight"));
    n.dispatchEvent(key("ArrowDown", { shiftKey: true }));
    expect(store.dragPositions.get("local:p2")).toEqual({ x: 320, y: 100 });
    vi.advanceTimersByTime(299);
    expect(fake.calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    await flush();
    expect(fake.calls[0]).toMatchObject({
      method: "graph.update",
      params: { ops: [{ op: "move_node", key: "local:p2", x: 320, y: 100 }] },
    });
    wrapper.unmount();
  });

  it("閉じると待っていた矢印の移動もすぐ送る", async () => {
    const { wrapper, fake, view } = await openWithGraph();
    wrapper.find('[data-node-key="local:p1"]').element.dispatchEvent(key("ArrowLeft"));
    view.closeGraph();
    await flush();
    expect(fake.calls[0]).toMatchObject({
      params: { ops: [{ op: "move_node", key: "local:p1", x: -20, y: 0 }] },
    });
    wrapper.unmount();
  });

  it("ノードの DOM の順はグラフの順のまま（並べ替えない）。Tab・Shift+Tab は読み順（上から、同じ高さなら左から）のノード → 線のチップ（g03 点検 T2・T5）", async () => {
    const { wrapper } = await openWithGraph({
      nodes: [
        { key: "local:p2", x: 300, y: 200 },
        { key: "local:p1", x: 0, y: 200 },
        { key: "local:p3", x: 500, y: 0 },
      ],
    });
    expect(wrapper.findAll(".graph-node").map((e) => e.attributes("data-node-key"))).toEqual([
      "local:p2",
      "local:p1",
      "local:p3",
    ]);
    const active = () =>
      document.activeElement?.getAttribute("data-node-key") ??
      document.activeElement?.getAttribute("data-link-chip");
    // 入口（tabindex=0）は選んでいるノード（無ければ読み順の先頭）の 1 つだけ
    (wrapper.find(".graph-view").element as HTMLElement).focus();
    await wrapper.find(".graph-canvas").trigger("pointerdown");
    const tabbable = () =>
      wrapper
        .findAll(".graph-node")
        .filter((n) => n.attributes("tabindex") === "0")
        .map((n) => n.attributes("data-node-key"));
    const n3 = wrapper.find('[data-node-key="local:p3"]');
    (n3.element as HTMLElement).focus();
    await flush();
    expect(tabbable()).toEqual(["local:p3"]);
    const seq: (string | undefined | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const el = document.activeElement as HTMLElement;
      el.dispatchEvent(key("Tab"));
      await flush();
      seq.push(active());
    }
    expect(seq).toEqual(["local:p1", "local:p2", "l1"]);
    // チップの先頭の Shift+Tab は読み順の最後のノードへ、ノードの Shift+Tab は読み順の前へ
    (document.activeElement as HTMLElement).dispatchEvent(key("Tab", { shiftKey: true }));
    await flush();
    expect(active()).toBe("local:p2");
    (document.activeElement as HTMLElement).dispatchEvent(key("Tab", { shiftKey: true }));
    await flush();
    expect(active()).toBe("local:p1");
    wrapper.unmount();
  });

  it("矢印で他のノードを越えても DOM が並べ替わらず、フォーカスがノードに残る（Esc で画面ごと閉じない。g03 点検 T5 must）", async () => {
    const { wrapper, view } = await openWithGraph({ links: [] });
    const n2 = wrapper.find('[data-node-key="local:p2"]');
    (n2.element as HTMLElement).focus();
    const before = wrapper.findAll(".graph-node").map((e) => e.attributes("data-node-key"));
    for (let i = 0; i < 3; i++) n2.element.dispatchEvent(key("ArrowUp"));
    n2.element.dispatchEvent(key("ArrowLeft", { shiftKey: true }));
    for (let i = 0; i < 4; i++) n2.element.dispatchEvent(key("ArrowLeft", { shiftKey: true }));
    await flush();
    expect(wrapper.findAll(".graph-node").map((e) => e.attributes("data-node-key"))).toEqual(
      before,
    );
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    await wrapper.find(".graph-view").trigger("keydown", { key: "Escape" });
    expect(view.graphOpen).toBe(true); // 1 段目は選択を外すだけ
    wrapper.unmount();
  });

  it("ドラッグで他のノードを越えてもフォーカスがノードに残る", async () => {
    const { wrapper } = await openWithGraph({ links: [] });
    const n2 = wrapper.find('[data-node-key="local:p2"]').element;
    n2.dispatchEvent(pointer("pointerdown", { clientX: 310, clientY: 10 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 10, clientY: -90 }));
    await flush();
    window.dispatchEvent(pointer("pointerup", { clientX: 10, clientY: -90 }));
    await flush();
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p2");
    wrapper.unmount();
  });

  function mockMobile(): void {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
  }

  it("モバイル: 編集の部品（ハンドル・pane を載せる・ドラッグ）を出さず、チップを押すと下からのシートで線の一時停止・再開", async () => {
    mockMobile();
    const { wrapper, fake, store } = await openWithGraph();
    expect(wrapper.find(".graph-node-handle").exists()).toBe(false);
    expect(wrapper.find(".graph-add-panes").exists()).toBe(false);
    expect(wrapper.find(".graph-pause-all").exists()).toBe(true);
    const node = wrapper.find('[data-node-key="local:p1"]').element;
    node.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10, pointerType: "touch" }));
    window.dispatchEvent(
      pointer("pointermove", { clientX: 80, clientY: 80, pointerType: "touch" }),
    );
    window.dispatchEvent(pointer("pointerup", { clientX: 80, clientY: 80, pointerType: "touch" }));
    await flush();
    expect(store.dragPositions.size).toBe(0); // ノードは動かず、背景のパン
    expect(fake.calls).toHaveLength(0);
    fake.handlers["graph.pause"] = () =>
      graphOf({ rev: 2, links: [triggerLink("l1", "local:p1", "local:p2", { paused: "user" })] });
    await wrapper.find('[data-link-chip="l1"]').trigger("click");
    await flush();
    expect(wrapper.find(".link-panel").exists()).toBe(false);
    expect(wrapper.find(".graph-sheet-title").text()).toBe("トリガ: impl → reviewer");
    await wrapper.find(".graph-sheet-pause").trigger("click");
    await flush();
    expect(fake.calls[0]).toEqual({ method: "graph.pause", params: { linkId: "l1" } });
    expect(wrapper.find(".graph-sheet-resume").exists()).toBe(true);
    await wrapper.find(".graph-sheet").trigger("keydown", { key: "Escape" });
    await flush();
    expect(wrapper.find(".graph-sheet").exists()).toBe(false);
    wrapper.unmount();
  });

  it("モバイル: ノードを押すと繋がる線ごとのシート。2 本指でピンチすると拡大する", async () => {
    mockMobile();
    const { wrapper } = await openWithGraph();
    const node = wrapper.find('[data-node-key="local:p2"]').element;
    node.dispatchEvent(pointer("pointerdown", { clientX: 310, clientY: 10, pointerType: "touch" }));
    node.dispatchEvent(pointer("pointerup", { clientX: 310, clientY: 10, pointerType: "touch" }));
    await flush();
    expect(wrapper.find(".graph-sheet-title").text()).toBe("reviewer（ローカル）");
    expect(wrapper.findAll(".graph-sheet-link")).toHaveLength(2);
    await wrapper.find(".graph-sheet-close").trigger("click");
    await flush();
    const canvas = wrapper.find(".graph-canvas").element;
    canvas.dispatchEvent(
      pointer("pointerdown", { pointerId: 1, clientX: 100, clientY: 100, pointerType: "touch" }),
    );
    canvas.dispatchEvent(
      pointer("pointerdown", { pointerId: 2, clientX: 200, clientY: 100, pointerType: "touch" }),
    );
    window.dispatchEvent(
      pointer("pointermove", { pointerId: 2, clientX: 300, clientY: 100, pointerType: "touch" }),
    );
    await flush();
    expect(wrapper.find(".graph-zoom").text()).toBe("200%");
    window.dispatchEvent(pointer("pointerup", { pointerId: 1, pointerType: "touch" }));
    window.dispatchEvent(pointer("pointerup", { pointerId: 2, pointerType: "touch" }));
    wrapper.unmount();
  });
});
