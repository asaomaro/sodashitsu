import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { AgentInfo, SessionSnapshot } from "@sodashitsu/protocol";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH } from "@sodashitsu/client-core";
import { ConnectionKey, MachineSwitcherKey, TerminalRegistryKey } from "../../injection.js";
import { useGraphStore } from "../../store/graph.js";
import { useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";
import { useViewStore } from "../../store/view.js";
import GraphView from "./GraphView.vue";
import { agentOf, fakeGraphPort, graphOf, paneOf } from "./graphTestKit.js";

// 20261004-subagent-display。グラフのノードの件数のボタンと、グラフの中の一覧（SubagentPanel）。
let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 1, panX: 0, panY: 0 }));
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => vi.restoreAllMocks());

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};
const subs = (n: number, type = "Explore") => ({ count: n, items: Array.from({ length: Math.min(n, 64) }, (_, i) => ({ id: `s${i}`, type, description: `説明${i}`, startedAt: Date.now() })) });
const pointer = (type: string): PointerEvent => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: 5, clientY: 5 });
const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

async function open(opts: { p1?: AgentInfo["subagents"]; p2?: AgentInfo["subagents"]; nodes?: string[] } = {}) {
  const registry = { focus: vi.fn() };
  const conn = { request: vi.fn(async () => ({})) };
  const switcher = { switchTo: vi.fn(async () => true) };
  const wrapper = mount(GraphView, {
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [TerminalRegistryKey as symbol]: registry, [ConnectionKey as symbol]: conn, [MachineSwitcherKey as symbol]: switcher } },
  });
  const view = useViewStore(pinia);
  const session = useSessionStore(pinia);
  session.tabs.set("t1", { id: "t1", workspaceId: "w1" } as never);
  session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("working", opts.p1 ? { subagents: opts.p1 } : {}) }));
  session.panes.set("p2", paneOf("p2", "t1", { label: "reviewer", agent: agentOf("idle", { instanceId: "i2", ...(opts.p2 ? { subagents: opts.p2 } : {}) }) }));
  const store = useGraphStore(pinia);
  const fake = fakeGraphPort({});
  store.bind(fake.port);
  store.applyGraph(graphOf(opts.nodes ? { nodes: opts.nodes.map((k, i) => ({ key: k as never, x: i * 300, y: 0 })) } : {}), "fresh");
  view.openGraph();
  await flush();
  return { wrapper, view, session, store, fake, registry };
}
const btn = (w: ReturnType<typeof mount>, k: string) => w.find(`[data-node-key="${k}"] [data-subagents-button]`);

describe("グラフのノードの件数のボタン", () => {
  it("1 件以上のときだけ出る（数・読み上げの名前つき）。ノードの大きさは変えない。tabindex は -1", async () => {
    const { wrapper } = await open({ p1: subs(3), p2: subs(0) });
    const b = btn(wrapper, "local:p1");
    expect(b.exists()).toBe(true);
    expect(b.text()).toBe("3");
    expect(b.attributes("aria-label")).toBe("impl のサブエージェント 3 件を表示");
    expect(b.attributes("tabindex")).toBe("-1");
    expect(btn(wrapper, "local:p2").exists()).toBe(false); // 0 件
    const styles = ["local:p1", "local:p2"].map((k) => wrapper.get(`[data-node-key="${k}"]`).attributes("style") ?? "");
    for (const s of styles) {
      expect(s).toContain(`width: ${GRAPH_NODE_WIDTH}px`);
      expect(s).toContain(`height: ${GRAPH_NODE_HEIGHT}px`);
    }
    expect(wrapper.get('[data-node-key="local:p1"]').attributes("aria-label")).toContain("サブエージェント 3 件");
    wrapper.unmount();
  });

  it("項目が無い（分からない）ノード・エージェントの居ないノードにも出さない", async () => {
    const { wrapper, session } = await open({});
    expect(btn(wrapper, "local:p1").exists()).toBe(false);
    session.panes.set("p2", paneOf("p2", "t1", { agent: null }));
    await flush();
    expect(wrapper.find("[data-subagents-button]").exists()).toBe(false);
    wrapper.unmount();
  });

  it("押すとグラフの中のパネルが開く。ノードの選択・ドラッグ・線の作成・pane への移動を始めない", async () => {
    // 開いた直後は先頭のノード（p1）が選ばれているので、件数のボタンは 2 番目のノード（p2）で試す。
    const { wrapper, store, view, fake, registry } = await open({ p2: subs(2) });
    expect(wrapper.find('[data-node-key="local:p2"]').classes()).not.toContain("graph-node-selected");
    const b = btn(wrapper, "local:p2");
    b.element.dispatchEvent(pointer("pointerdown"));
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: 90, clientY: 90 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 90, clientY: 90 }));
    await b.trigger("click");
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(true);
    expect(store.dragPositions.size).toBe(0);
    expect(wrapper.find('[data-node-key="local:p2"]').classes()).not.toContain("graph-node-selected");
    expect(wrapper.find(".graph-connect-banner").exists()).toBe(false);
    expect(fake.calls).toEqual([]); // move_node・add_link を送らない
    expect(view.graphOpen).toBe(true); // pane へ移ってグラフを閉じない
    expect(registry.focus).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("グラフの中の一覧（SubagentPanel）", () => {
  it("題（pane の呼び名）と各行を出し、一覧の領域へフォーカスが移る。view.dialogContext は使わない", async () => {
    const { wrapper, view } = await open({ p1: subs(2) });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    expect(wrapper.get(".subagent-panel-heading").text()).toBe("サブエージェント — impl");
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(2);
    expect(wrapper.get(".subagent-list-desc").text()).toBe("説明0");
    expect(document.activeElement).toBe(wrapper.get(".subagent-list").element);
    expect(view.dialogContext).toBeNull();
    wrapper.unmount();
  });

  it("キー s: ノードを選んでいるとき、件数が 1 以上なら開く。0 件では何もしない", async () => {
    const { wrapper } = await open({ p1: subs(2), p2: subs(0) });
    const n1 = wrapper.get('[data-node-key="local:p1"]').element as HTMLElement;
    n1.focus();
    n1.dispatchEvent(key("s"));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(true);
    wrapper.get(".subagent-panel-close").trigger("click");
    await flush();
    const n2 = wrapper.get('[data-node-key="local:p2"]').element as HTMLElement;
    n2.focus();
    n2.dispatchEvent(key("s"));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  it("s は既存のノードのキー（c・r・Enter・矢印・Delete）と重ならない（c は接続モード・Enter は pane へのまま）", async () => {
    const { wrapper, view } = await open({ p1: subs(2) });
    const n1 = wrapper.get('[data-node-key="local:p1"]').element as HTMLElement;
    n1.focus();
    n1.dispatchEvent(key("c"));
    await flush();
    expect(wrapper.find(".graph-connect-banner").exists()).toBe(true);
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
    expect(view).toBeDefined();
  });

  it("Esc は 1 段ずつ: まずパネルを閉じてノードへフォーカスが戻り、グラフ画面は閉じない。次の Esc で選択 → 画面", async () => {
    const { wrapper, view } = await open({ p1: subs(2) });
    const n1 = wrapper.get('[data-node-key="local:p1"]').element as HTMLElement;
    n1.focus();
    n1.dispatchEvent(key("s"));
    await flush();
    wrapper.get(".subagent-panel").element.dispatchEvent(key("Escape"));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    expect(view.graphOpen).toBe(true);
    expect(document.activeElement).toBe(n1);
    // 画面全体の Esc でも、パネルが先に閉じる
    n1.dispatchEvent(key("s"));
    await flush();
    wrapper.get(".graph-view").element.dispatchEvent(key("Escape"));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });

  it("［×］でも閉じて、ノードへフォーカスが戻る", async () => {
    const { wrapper } = await open({ p1: subs(2) });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    await wrapper.get(".subagent-panel-close").trigger("click");
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    expect(document.activeElement?.getAttribute("data-node-key")).toBe("local:p1");
    wrapper.unmount();
  });

  it("対象のエージェントが居なくなったら閉じる。入れ替わっても閉じる。同じ instanceId の更新では閉じない", async () => {
    const { wrapper, session } = await open({ p1: subs(2) });
    const reopen = async () => {
      if (!wrapper.find(".subagent-panel").exists()) {
        session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("working", { subagents: subs(2) }) }));
        await flush();
        await btn(wrapper, "local:p1").trigger("click");
        await flush();
      }
    };
    await reopen();
    session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("idle", { subagents: subs(1) }) }));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(true);
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(1); // 開いている間の更新が映る
    session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("working", { instanceId: "other", subagents: subs(1) }) }));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    await reopen();
    expect(wrapper.find(".subagent-panel").exists()).toBe(true);
    session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: null }));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  it("パネルの上のキー・ホイールを、グラフ画面（ズーム・パン）へ渡さない", async () => {
    const { wrapper } = await open({ p1: subs(2) });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    const root = wrapper.get(".graph-view").element;
    const seen: string[] = [];
    root.addEventListener("keydown", (e) => seen.push(`key:${(e as KeyboardEvent).key}`));
    root.addEventListener("wheel", () => seen.push("wheel"));
    const list = wrapper.get(".subagent-list").element;
    for (const k of ["ArrowDown", "+", "1"]) list.dispatchEvent(key(k));
    list.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 }));
    expect(seen).toEqual([]);
    wrapper.unmount();
  });

  it("パネルを開いたまま別のノードの件数のボタンを押すと、そのノードの一覧に切り替わる（閉じない）。一覧の領域へフォーカスが移る", async () => {
    const { wrapper } = await open({ p1: subs(1, "A"), p2: subs(3, "B") });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    expect(wrapper.get(".subagent-panel-heading").text()).toBe("サブエージェント — impl");
    await btn(wrapper, "local:p2").trigger("click");
    await flush();
    expect(wrapper.findAll(".subagent-panel")).toHaveLength(1);
    expect(wrapper.get(".subagent-panel-heading").text()).toBe("サブエージェント — reviewer");
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(3);
    expect(document.activeElement).toBe(wrapper.get(".subagent-list").element);
    wrapper.unmount();
  });

  it("対象のノードがグラフから外れたら（pane とエージェントが残っていても）閉じる", async () => {
    const { wrapper, store } = await open({ p1: subs(2) });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    store.applyGraph(graphOf({ rev: 2, nodes: [{ key: "local:p2" as never, x: 300, y: 0 }] }), "fresh");
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
  });

  it("グラフ画面を閉じたら、パネルも閉じる（開き直しても開いたままにならない）", async () => {
    const { wrapper, view } = await open({ p1: subs(2) });
    await btn(wrapper, "local:p1").trigger("click");
    await flush();
    view.closeGraph();
    await flush();
    view.openGraph();
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("別のマシンのノード・モバイル・古いサーバ", () => {
  const remoteSnap = (a: AgentInfo): SessionSnapshot =>
    ({
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "remote" },
      workspaces: [{ id: "w9", label: "w9", cwd: "/", tabIds: ["t9"], activeTabId: "t9", groupId: null, git: null, autoLabel: false }],
      tabs: [{ id: "t9", workspaceId: "w9", label: "t", layout: { type: "pane", paneId: "p9" }, focusedPaneId: "p9", zoomedPaneId: null, sizeOwnerClientId: null }],
      panes: [paneOf("p9", "t9", { label: "remote-pane", agent: a })],
    }) as unknown as SessionSnapshot;

  it("別のマシンのノードは、そのマシンの要約から件数を引く（pane の ID が手元と同じでも取り違えない）", async () => {
    // 手元の p1 は 2 件、別のマシン m2 の p1（同じ ID）は 5 件。
    const M = "a".repeat(32);
    const { wrapper } = await open({ p1: subs(2), nodes: ["local:p1", `${M}:p1`] });
    const machines = useMachinesStore(pinia);
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }] as never);
    const snap = remoteSnap(agentOf("idle", { instanceId: "r1", subagents: subs(5) }));
    (snap as unknown as { panes: unknown[] }).panes = [paneOf("p1", "t9", { label: "remote-p1", agent: agentOf("idle", { instanceId: "r1", subagents: subs(5) }) })];
    machines.applySummarySnapshot(M, snap);
    await flush();
    expect(btn(wrapper, "local:p1").text()).toBe("2");
    expect(btn(wrapper, `${M}:p1`).text()).toBe("5");
    await btn(wrapper, `${M}:p1`).trigger("click");
    await flush();
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(5);
    expect(wrapper.get(".subagent-panel-heading").text()).toBe("サブエージェント — remote-p1");
    wrapper.unmount();
  });

  it("別のマシンのノードのエージェントが古いサーバのもの（subagents の項目が無い）なら、ボタンを出さず、ノードの DOM はボタンの有無だけが違う", async () => {
    const M = "d".repeat(32);
    const { wrapper } = await open({ nodes: ["local:p1", `${M}:p1`] });
    const machines = useMachinesStore(pinia);
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }] as never);
    const withSubs = (extra: Partial<AgentInfo>) => {
      const snap = remoteSnap(agentOf("idle", { instanceId: "r1", ...extra }));
      (snap as unknown as { panes: unknown[] }).panes = [paneOf("p1", "t9", { label: "remote-p1", agent: agentOf("idle", { instanceId: "r1", ...extra }) })];
      machines.applySummarySnapshot(M, snap);
    };
    withSubs({});
    await flush();
    expect(wrapper.find(`[data-node-key="${M}:p1"] [data-subagents-button]`).exists()).toBe(false);
    const oldHtml = wrapper.get(`[data-node-key="${M}:p1"]`).html();
    withSubs({ subagents: subs(3) });
    await flush();
    const newHtml = wrapper.get(`[data-node-key="${M}:p1"]`).html();
    const stripButton = (h: string) => h.replace(/<button[^>]*data-subagents-button[\s\S]*?<\/button>/, "").replace("・サブエージェント 3 件", "");
    // Vue の注釈（`<!--v-if-->`・テンプレートの注釈）は描かれ方に効かないので除く。
    const norm = (h: string) => h.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><");
    expect(norm(stripButton(newHtml))).toBe(norm(oldHtml));
    wrapper.unmount();
  });

  it("モバイルの読み取り専用のグラフ: 数だけを出し（ボタンではない）、押しても s でも開かない", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const { wrapper } = await open({ p1: subs(4) });
    expect(wrapper.find("[data-subagents-button]").exists()).toBe(false);
    const stat = wrapper.get('[data-node-key="local:p1"] .graph-node-subagents-static');
    expect(stat.text()).toBe("4");
    expect(stat.element.tagName).toBe("SPAN");
    await stat.trigger("click");
    const n1 = wrapper.get('[data-node-key="local:p1"]').element as HTMLElement;
    n1.focus();
    n1.dispatchEvent(key("s"));
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(false);
    wrapper.unmount();
  });
});
