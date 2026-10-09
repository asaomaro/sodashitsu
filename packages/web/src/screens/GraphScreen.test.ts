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

describe("GraphScreen: 並びを整える（確認のあいだに、ほかの更新が入ったとき。PR1e レビュー S2）", () => {
  it("衝突のあと、取り直した最新のグラフ（増えたノードを含む）で計算し直して送る", async () => {
    const { paneOf, graphOf, fakeGraphPort, rpcError } = await import("../components/graph/graphTestKit.js");
    const { useSessionStore } = await import("../store/session.js");
    const { useGraphStore } = await import("../store/graph.js");
    const session = useSessionStore(pinia);
    session.workspaces.set("w1", { id: "w1", label: "api", cwd: "/a", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null } as never);
    session.tabs.set("t1", { id: "t1", workspaceId: "w1", label: "1", layout: { type: "pane", paneId: "p1" } } as never);
    for (const id of ["p1", "p2", "p3"]) session.panes.set(id, paneOf(id, "t1"));
    session.layout = { top: [], groups: {}, ungrouped: ["w:w1"] } as never;
    const nodes = [
      { key: "local:p1", x: 100, y: 100 },
      { key: "local:p2", x: 900, y: 700 },
    ] as const satisfies readonly { key: `local:${string}`; x: number; y: number }[];
    const newer = graphOf({ rev: 3, nodes: [...nodes, { key: "local:p3", x: 500, y: 300 }] }); // 確認のあいだに、別のブラウザが p3 を足した
    let updates = 0;
    const fake = fakeGraphPort({
      "graph.get": () => newer,
      "graph.update": (params) => {
        updates++;
        if (updates === 1) throw rpcError("rev_conflict");
        return { ...newer, rev: 4 };
      },
    });
    const graph = useGraphStore(pinia);
    graph.bind(fake.port);
    graph.applyGraph(graphOf({ rev: 2, nodes: [...nodes] }), "fresh");
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    await wrapper.find(".graph-tidy").trigger("click");
    await flush();
    expect(wrapper.find(".graph-confirm").text()).toContain("2 個のノード"); // 確認を出した時点では 2 個
    await wrapper.find(".graph-confirm-ok").trigger("click");
    await flush();
    const sent = fake.calls.filter((c) => c.method === "graph.update");
    expect(sent).toHaveLength(2); // 1 回目は衝突
    const ops = (sent[1]!.params as { ops: { key: string }[] }).ops;
    expect(ops.map((o) => o.key).sort()).toEqual(["local:p1", "local:p2", "local:p3"]); // 2 回目は、増えたノードも含めて計算し直している
    wrapper.unmount();
  });
});

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

  it("題と「×」は出さない（戻るのは、切り替えの部品・prefix+a・Esc）。Esc 以外のキーでは閉じない（PR1e AC-L2）", async () => {
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    await wrapper.find(".graph-view").trigger("keydown", { key: "a" });
    expect(view.screen).toBe("graph");
    expect(wrapper.find(".graph-close").exists()).toBe(false);
    expect(wrapper.find(".graph-title").exists()).toBe(false);
    await wrapper.find(".graph-view").trigger("keydown", { key: "Escape" });
    expect(view.screen).toBe("base");
    wrapper.unmount();
  });

  it("ツールバー: 左に「線を結ぶ」「並びを整える」「そのほか」、右に探す・拡大縮小・「全体を表示」。個別の一時停止・履歴・載せるボタンは無い（そのほかのメニューへ）", async () => {
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    const labels = wrapper.findAll(".graph-toolbar > .graph-tool").map((b) => b.text());
    expect(labels).toEqual(["線を結ぶ", "並びを整える", "そのほか ▾", "−", "＋", "全体を表示"]);
    expect(wrapper.find(".graph-find-input").exists()).toBe(true);
    for (const cls of [".graph-pause-all", ".graph-history", ".graph-add-panes"]) expect(wrapper.find(cls).exists(), cls).toBe(false);
    expect(wrapper.find(".graph-paused-badge").exists()).toBe(false);
    wrapper.unmount();
  });

  it("「そのほか」は ContextMenu（graphMore）を開く。一時停止の間は、ツールバーに札と［再開］が出る", async () => {
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    const graph = (await import("../store/graph.js")).useGraphStore(pinia);
    graph.applyGraph({ rev: 1, paused: false, nodes: [], links: [] }, "fresh");
    await flush();
    await wrapper.find(".graph-more").trigger("click");
    expect(view.contextMenu?.target).toEqual({ kind: "graphMore" });
    graph.applyGraph({ rev: 2, paused: true, nodes: [], links: [] }, "event");
    await flush();
    expect(wrapper.find(".graph-paused-badge").text()).toContain("一時停止中");
    expect(wrapper.find(".graph-resume").text()).toBe("再開");
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

  it("端末の窓の層は GraphCanvas の兄弟（.graph-view の外）に置く。窓の中の Esc・prefix をグラフの根の keydown が食わないため（X3）", async () => {
    const { wrapper, view } = mountScreen();
    view.setScreen("graph");
    await flush();
    expect(wrapper.find("[data-graph-terminal-layer]").exists()).toBe(true);
    expect(wrapper.find(".graph-view [data-graph-terminal-layer]").exists()).toBe(false);
    wrapper.unmount();
  });
});
