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
import GraphView from "./GraphDialog.vue"; // 1 列の画面の入れ物（デスクトップの画面は GraphScreen.test.ts）
import GraphSubagentLayer from "./GraphSubagentLayer.vue";
import { agentOf, fakeGraphPort, graphOf, paneOf } from "./graphTestKit.js";

// 20261008-graph-first PR6b。グラフの小さなサブエージェントのノード（GraphSubagentLayer）。
let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 1, panX: 0, panY: 0 }));
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const tick = async (ms: number): Promise<void> => {
  vi.advanceTimersByTime(ms);
  await flush();
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};
const subs = (n: number, type = "Explore", extra: (i: number) => Record<string, unknown> = () => ({})) => ({
  count: n,
  items: Array.from({ length: Math.min(n, 64) }, (_, i) => ({
    id: `s${i}`,
    type,
    description: `説明${i}`,
    startedAt: Date.now() + i,
    ...extra(i),
  })),
});
const pointer = (type: string): PointerEvent =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 0,
    clientX: 5,
    clientY: 5,
  });
const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

async function open(
  opts: { p1?: AgentInfo["subagents"]; p2?: AgentInfo["subagents"]; nodes?: string[] } = {},
) {
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
  const view = useViewStore(pinia);
  view.setMobileViewport(true); // 重ねるダイアログ（1 列の画面）
  const session = useSessionStore(pinia);
  session.tabs.set("t1", { id: "t1", workspaceId: "w1" } as never);
  session.panes.set(
    "p1",
    paneOf("p1", "t1", {
      label: "impl",
      agent: agentOf("working", opts.p1 ? { subagents: opts.p1 } : {}),
    }),
  );
  session.panes.set(
    "p2",
    paneOf("p2", "t1", {
      label: "reviewer",
      agent: agentOf("idle", { instanceId: "i2", ...(opts.p2 ? { subagents: opts.p2 } : {}) }),
    }),
  );
  const store = useGraphStore(pinia);
  const fake = fakeGraphPort({});
  store.bind(fake.port);
  store.applyGraph(
    graphOf(
      opts.nodes
        ? { nodes: opts.nodes.map((k, i) => ({ key: k as never, x: i * 300, y: 0 })) }
        : {},
    ),
    "fresh",
  );
  view.openGraph();
  await flush();
  return { wrapper, view, session, store, fake, registry };
}
const rows = (w: ReturnType<typeof mount>) => w.findAll("button[data-subagent-id]");
const info = (items: unknown[], count = items.length) =>
  ({ key: "local:p1", name: "impl", exists: true, agent: { subagents: { count, items } } }) as never;
const sub = (id: string, startedAt: number, extra: Record<string, unknown> = {}) => ({ id, type: "Explore", description: `説明 ${id}`, startedAt, ...extra });

describe("小さなサブエージェントのノード（層の単体）", () => {
  const mountLayer = (infoValue: unknown, x = 100, y = 40) =>
    mount(GraphSubagentLayer, {
      attachTo: document.body,
      props: { nodes: [{ key: "local:p1", x, y }], infos: new Map([["local:p1", infoValue as never]]) },
    });

  it("現れて 2 秒たつまでは出さない。2 秒たてば、親の右下に出る（種類・説明・経過・読み上げの名前）", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const w = mountLayer(info([sub("a", Date.now(), { background: true })]));
    expect(rows(w)).toHaveLength(0);
    await tick(1500);
    expect(rows(w)).toHaveLength(0);
    await tick(1000);
    const r = rows(w);
    expect(r).toHaveLength(1);
    expect(r[0]!.text()).toContain("Explore");
    expect(r[0]!.text()).toContain("説明 a");
    expect(r[0]!.text()).toContain("bg");
    expect(r[0]!.text()).toContain("2秒");
    expect(r[0]!.attributes("aria-label")).toContain("サブエージェント Explore・説明 a・経過 2秒・バックグラウンド");
    // 親 (100,40) の右端 300 + 間隔 20、下の縁 120 − 14
    expect(r[0]!.attributes("style")).toContain("left: 320px");
    expect(r[0]!.attributes("style")).toContain("top: 106px");
    expect(r[0]!.attributes("tabindex")).toBe("-1");
    expect(r[0]!.attributes("title")).toBe(r[0]!.attributes("aria-label")); // 切れた種類・説明を、ホバーで読める
    w.unmount();
  });

  it("親が動くと付いて動く（位置は親の座標から導く）", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const w = mountLayer(info([sub("a", Date.now())]));
    await tick(2500);
    await w.setProps({ nodes: [{ key: "local:p1", x: 400, y: 200 }] });
    expect(rows(w)[0]!.attributes("style")).toContain("left: 620px");
    expect(rows(w)[0]!.attributes("style")).toContain("top: 266px");
    w.unmount();
  });

  it("6 個まで出し、残りは「ほか n 件」の 1 枚（64 件を超える分も数える）。押すと open を出す", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const items = Array.from({ length: 9 }, (_, i) => sub(`s${i}`, Date.now() + i));
    const w = mountLayer(info(items, 12));
    await tick(2500);
    expect(rows(w)).toHaveLength(6);
    const more = w.get("[data-subagent-more]");
    expect(more.text()).toBe("ほか 6 件"); // 見えない 3 件 + 配られない 3 件
    await more.trigger("click");
    expect(w.emitted("open")).toEqual([["local:p1"]]);
    w.unmount();
  });

  it("入れ子: 子は字下げされ、枝（保存しない線）が子の数だけ引かれる", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const t = Date.now();
    const w = mountLayer(info([sub("a", t), sub("b", t + 1, { parentId: "a", depth: 2 }), sub("c", t + 2, { parentId: "b", depth: 3 })]));
    await tick(2500);
    const lefts = rows(w).map((r) => /left: (\d+)px/.exec(r.attributes("style")!)![1]);
    expect(lefts).toEqual(["320", "334", "348"]);
    expect(w.findAll("path.graph-subagent-branch")).toHaveLength(3);
    w.unmount();
  });

  it("終わったものは 1 秒かけて消える（消える途中は押せない印）。すぐ終わるもの（2 秒未満）は出さない", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const t = Date.now();
    const w = mountLayer(info([sub("a", t), sub("quick", t)]));
    await tick(1000);
    await w.setProps({ infos: new Map([["local:p1", info([sub("a", t)])]]) }); // quick は 1 秒で終わった
    await tick(1500);
    expect(rows(w).map((r) => r.attributes("data-subagent-id"))).toEqual(["a"]);
    await w.setProps({ infos: new Map([["local:p1", info([])]]) });
    expect(rows(w)[0]!.classes()).toContain("graph-subagent-leaving");
    await tick(500);
    expect(rows(w)).toHaveLength(1);
    await tick(600);
    expect(rows(w)).toHaveLength(0);
    w.unmount();
  });

  it("prefers-reduced-motion では、消えるときも残さず、すぐ消す", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    const w = mountLayer(info([sub("a", Date.now())]));
    await tick(2500);
    expect(rows(w)).toHaveLength(1);
    await w.setProps({ infos: new Map([["local:p1", info([])]]) });
    expect(rows(w)).toHaveLength(0);
    w.unmount();
  });

  it("切れたマシン（exists が true でない）・エージェントの居ない親には出さない。何も無ければ層ごと描かない", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const w = mountLayer({ key: "local:p1", name: "x", exists: null, agent: { subagents: { count: 1, items: [sub("a", Date.now())] } } });
    await tick(3000);
    expect(rows(w)).toHaveLength(0);
    expect(w.find("[data-graph-subagents]").exists()).toBe(false);
    w.unmount();
  });

  it("キー: focusFirst で最初へ、↓ ↑ で移る、Esc・← で leave。Enter はボタンの押下（open）", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const t = Date.now();
    const w = mountLayer(info([sub("a", t), sub("b", t + 1)]));
    await tick(2500);
    const exposed = w.vm as unknown as { focusFirst(k: string): boolean; hasRows(k: string): boolean };
    expect(exposed.hasRows("local:p1")).toBe(true);
    expect(exposed.focusFirst("local:p1")).toBe(true);
    expect((document.activeElement as HTMLElement).dataset["subagentId"]).toBe("a");
    document.activeElement!.dispatchEvent(key("ArrowDown"));
    expect((document.activeElement as HTMLElement).dataset["subagentId"]).toBe("b");
    document.activeElement!.dispatchEvent(key("ArrowUp"));
    expect((document.activeElement as HTMLElement).dataset["subagentId"]).toBe("a");
    document.activeElement!.dispatchEvent(key("Escape"));
    document.activeElement!.dispatchEvent(key("ArrowLeft"));
    expect(w.emitted("leave")).toEqual([["local:p1"], ["local:p1"]]);
    expect(exposed.focusFirst("local:none")).toBe(false);
    w.unmount();
  });
});

describe("グラフの画面の中の小さなサブエージェントのノード", () => {
  it("親のノードの `d` で最初の小さなノードへ、Esc で親へ戻る。押すと一覧のパネルが開く。親のノードの数・保存には触れない", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const { wrapper, fake } = await open({ p1: subs(3) });
    await tick(2500);
    await tick(5); // Vue は、ハンドラを付けた時刻より前のイベントを無視する（偽の時計が止まったままだと、押した操作が届かない）
    expect(rows(wrapper)).toHaveLength(3);
    const node = wrapper.get('[data-node-key="local:p1"]');
    (node.element as HTMLElement).focus();
    node.element.dispatchEvent(key("d"));
    expect((document.activeElement as HTMLElement).dataset["subagentId"]).toBe("s0");
    document.activeElement!.dispatchEvent(key("Escape"));
    await flush();
    expect(document.activeElement).toBe(node.element);
    await rows(wrapper)[0]!.trigger("click");
    await flush();
    expect(wrapper.find(".subagent-panel").exists()).toBe(true);
    // 描くだけ: サーバのグラフを書き換える操作を出さない。
    expect(fake.calls.filter((c) => c.method.startsWith("graph.update"))).toEqual([]);
    wrapper.unmount();
  });

  it("サブエージェントが無い・件数だけ（項目なし）のノードの `d` は何もしない", async () => {
    const { wrapper } = await open({});
    const node = wrapper.get('[data-node-key="local:p1"]');
    (node.element as HTMLElement).focus();
    node.element.dispatchEvent(key("d"));
    expect(document.activeElement).toBe(node.element);
    expect(wrapper.find("[data-graph-subagents]").exists()).toBe(false);
    wrapper.unmount();
  });
});

// 性能（PR1c の GraphView.perf.test.ts と同じ見方）: pane 16・サブエージェント 60 個（4 つの親に 15 個ずつ）が出入りをくり返す。happy-dom での目安で、固まっていないことの粗い確かめ。
describe("サブエージェント 60 個の出入りの描画の時間", () => {
  it("20 回入れ替えても、固まらない。小さなノードは親ごとに 6 個＋「ほか」までしか描かない", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    const t0 = Date.now();
    const generation = (g: number) =>
      new Map(
        [1, 2, 3, 4].map((p) => [
          `local:p${p}`,
          {
            key: `local:p${p}`,
            name: `agent-${p}`,
            exists: true,
            agent: {
              subagents: {
                count: 15,
                items: Array.from({ length: 15 }, (_, i) => ({
                  id: `g${g}-p${p}-${i}`,
                  type: "Explore",
                  description: `説明 ${g}-${i}`,
                  startedAt: t0 + i,
                  ...(i % 5 === 4 ? { parentId: `g${g}-p${p}-${i - 1}`, depth: 2 } : {}),
                })),
              },
            },
          } as never,
        ]),
      );
    const nodes = [1, 2, 3, 4].map((p) => ({ key: `local:p${p}`, x: (p - 1) * 300, y: 0 }));
    const w = mount(GraphSubagentLayer, { attachTo: document.body, props: { nodes, infos: generation(0) } });
    await tick(2500);
    expect(rows(w)).toHaveLength(24);
    expect(w.findAll("[data-subagent-more]")).toHaveLength(4);
    const t1 = performance.now();
    for (let g = 1; g <= 20; g++) {
      await w.setProps({ infos: generation(g) });
      await tick(600);
    }
    const ms = performance.now() - t1;
    (globalThis as unknown as { process: { stdout: { write(s: string): void } } }).process.stdout.write(
      `[graph-perf] ${JSON.stringify({ case: "web-subagent-churn", env: "happy-dom", subagents: 60, generations: 20, totalMs: Math.round(ms), limitMs: 10_000 })}\n`,
    );
    expect(ms).toBeLessThan(10_000);
    expect(rows(w).length).toBeLessThanOrEqual(24 + 24); // 消える途中のもの（1 秒）を含めても、親ごと 6 個ずつまで
    w.unmount();
  }, 30_000);
});
