import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { Graph, GraphLink, NodeKey } from "@sodashitsu/protocol";
import { ConnectionKey, MachineSwitcherKey, TerminalRegistryKey } from "../../injection.js";
import { useGraphStore } from "../../store/graph.js";
import { useSessionStore } from "../../store/session.js";
import { useViewStore } from "../../store/view.js";
import GraphView from "./GraphView.vue";
import { agentOf, fakeGraphPort, paneOf, triggerLink } from "./graphTestKit.js";

/**
 * 20260927-agent-graph の 05 T5（AC17）：pane 16 個・線 32 本のグラフ画面の描画の時間（happy-dom での目安）。実物のブラウザの時間ではないので、
 * 閾値は「固まっていない」ことの粗い確かめ（3 秒）にとどめ、測った値は `[graph-perf]` の行で標準出力へ出して記録する。
 */

const PANES = 16;
const LIMIT_MS = 3000;

function bigGraph(rev: number, dx = 0): Graph {
  const key = (i: number) => `local:p${i + 1}` as NodeKey;
  const links: GraphLink[] = [];
  for (let i = 0; i < PANES; i++) {
    links.push(triggerLink(`l${i * 2 + 1}`, key(i), key((i + 1) % PANES)));
    links.push(
      triggerLink(`l${i * 2 + 2}`, key(i), key((i + 2) % PANES), {
        trigger: { on: "blocked", prompt: "見て", output: null, whenBusy: "skip" },
      }),
    );
  }
  return {
    rev,
    paused: false,
    nodes: Array.from({ length: PANES }, (_, i) => ({
      key: key(i),
      x: (i % 4) * 260 + dx,
      y: Math.floor(i / 4) * 140,
    })),
    links,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await nextTick();
}

describe("GraphView の描画の時間（pane 16・線 32。AC17）", () => {
  it("開いて描く・全ノードを動かした変更を描き直す、を測る", async () => {
    localStorage.clear();
    const pinia = createPinia();
    setActivePinia(pinia);
    const wrapper = mount(GraphView, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        provide: {
          [TerminalRegistryKey as symbol]: { focus: vi.fn() },
          [ConnectionKey as symbol]: { request: vi.fn(async () => ({})) },
          [MachineSwitcherKey as symbol]: { switchTo: vi.fn(async () => true) },
        },
      },
    });
    const session = useSessionStore(pinia);
    session.tabs.set("t1", { id: "t1", workspaceId: "w1" } as never);
    for (let i = 1; i <= PANES; i++) {
      session.panes.set(
        `p${i}`,
        paneOf(`p${i}`, "t1", {
          label: `agent-${i}`,
          agent: agentOf(i % 3 === 0 ? "working" : "idle"),
        }),
      );
    }
    const store = useGraphStore(pinia);
    store.bind(fakeGraphPort().port);
    store.applyGraph(bigGraph(1), "fresh");

    const t0 = performance.now();
    useViewStore(pinia).openGraph();
    await settle();
    const openMs = performance.now() - t0;
    expect(wrapper.findAll(".graph-node")).toHaveLength(PANES);
    expect(wrapper.findAll(".graph-edge")).toHaveLength(PANES * 2);

    // 他のブラウザ・sodactl の変更（graph.changed）で全ノードが動いた、を描き直す。
    const t1 = performance.now();
    store.applyGraph(bigGraph(2, 40), "event");
    await settle();
    const rerenderMs = performance.now() - t1;
    expect(wrapper.find('[data-node-key="local:p1"]').attributes("style")).toContain("40px");

    process.stdout.write(
      `[graph-perf] ${JSON.stringify({ case: "web-render", env: "happy-dom", panes: PANES, links: PANES * 2, openMs: Math.round(openMs), rerenderMs: Math.round(rerenderMs), limitMs: LIMIT_MS })}\n`,
    );
    expect(openMs).toBeLessThan(LIMIT_MS);
    expect(rerenderMs).toBeLessThan(LIMIT_MS);
    wrapper.unmount();
  }, 30_000);
});
