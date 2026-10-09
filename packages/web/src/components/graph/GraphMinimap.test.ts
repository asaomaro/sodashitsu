import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GraphMinimap from "./GraphMinimap.vue";
import GraphFind from "./GraphFind.vue";
import type { FindItem } from "./findCandidates.js";

// 20261008-graph-first の PR1d：小さな地図・探すの部品。
const frames = [
  { id: "a", rect: { x: 0, y: 0, w: 400, h: 200 } },
  { id: "b", rect: { x: 800, y: 400, w: 400, h: 200 } },
];
const base = { frames, nodes: [], view: { x: 0, y: 0, w: 600, h: 300 }, selectedId: "b", collapsed: false };

describe("GraphMinimap", () => {
  it("囲いの四角と見える範囲の枠を描く。選んでいる囲いに印。読み上げは「地図。表示中の範囲」と囲いの数", () => {
    const w = mount(GraphMinimap, { props: base });
    expect(w.findAll(".graph-minimap-frame")).toHaveLength(2);
    expect(w.findAll(".graph-minimap-frame-selected")).toHaveLength(1);
    expect(w.find("[data-minimap-view]").exists()).toBe(true);
    expect(w.find("svg").attributes("aria-label")).toBe("地図。表示中の範囲。囲い 2 個");
  });

  it("押すと世界の座標の点を伝える（地図の左上は範囲の左上、中央は範囲の中央）。囲いが無くても出す", async () => {
    const w = mount(GraphMinimap, { props: base, attachTo: document.body });
    const svg = w.find("svg").element as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 176, height: 112, right: 176, bottom: 112, x: 0, y: 0, toJSON: () => ({}) });
    await w.find("svg").trigger("pointerdown", { clientX: 88, clientY: 56, button: 0, pointerId: 1 });
    const p = w.emitted("center")![0]![0] as { x: number; y: number };
    expect(p.x).toBeCloseTo(600, -1); // 範囲 0..1200 の中央
    expect(p.y).toBeCloseTo(300, -1); // 範囲 0..600 の中央
    const empty = mount(GraphMinimap, { props: { ...base, frames: [], nodes: [], view: { x: 0, y: 0, w: 100, h: 100 } } });
    expect(empty.find("svg").exists()).toBe(true);
    w.unmount();
  });

  it("たたんだときは地図を描かず、ボタンだけ。ボタンで切り替わりを伝える", async () => {
    const w = mount(GraphMinimap, { props: { ...base, collapsed: true } });
    expect(w.find("svg").exists()).toBe(false);
    await w.find(".graph-minimap-toggle").trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
  });
});

describe("GraphFind", () => {
  const items: FindItem[] = [
    { kind: "pane", target: "local:p1", label: "impl", sub: "開発 · alpha", haystack: ["impl", "alpha"] },
    { kind: "workspace", target: "w1", label: "alpha", sub: "開発", haystack: ["alpha"] },
  ];
  it("候補を上下で選び Enter で決める。変換中の Enter では決めない。Esc で離れる。キーはグラフへ渡さない", async () => {
    const w = mount(GraphFind, { props: { items } });
    const input = w.find("input");
    await input.setValue("alpha");
    await input.trigger("focus");
    expect(w.findAll("[role=option]")).toHaveLength(2);
    let reached = false;
    const parent = w.element.parentElement ?? document.body;
    parent.addEventListener("keydown", () => (reached = true));
    await input.trigger("keydown", { key: "Enter", isComposing: true });
    expect(w.emitted("choose")).toBeUndefined();
    await input.trigger("keydown", { key: "Enter", keyCode: 229 });
    expect(w.emitted("choose")).toBeUndefined();
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect((w.emitted("choose")![0]![0] as FindItem).label).toBe("impl"); // 先頭は workspace（名前の先頭一致）。↓ で 2 つ目
    await input.trigger("keydown", { key: "Escape" });
    expect(w.emitted("leave")).toHaveLength(1);
    expect(reached).toBe(false);
  });
});
