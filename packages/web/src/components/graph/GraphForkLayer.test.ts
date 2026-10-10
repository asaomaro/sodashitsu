import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GraphForkLayer from "./GraphForkLayer.vue";

const nodes = [
  { key: "local:a", x: 0, y: 0 },
  { key: "local:b", x: 400, y: 0, forkedFrom: "local:a" },
  { key: "local:c", x: 0, y: 300, forkedFrom: "local:z" }, // 元は別の空間
  { key: "local:d", x: 400, y: 300, forkedFrom: "local:gone" }, // 元は無くなった
];
const name = (k: string) => k.replace("local:", "名前-");

describe("GraphForkLayer（見るだけの fork の線。20261009-agent-fork PR2）", () => {
  it("両方が出ているときは線を引く。ほかは線ではなく、ノードの印と title", () => {
    const w = mount(GraphForkLayer, { props: { nodes, known: new Set(["local:a", "local:b", "local:c", "local:d", "local:z"]), nameOf: name } });
    const lines = w.findAll(".graph-fork-line");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.attributes("data-fork-from")).toBe("local:a");
    expect(lines[0]!.attributes("data-fork-to")).toBe("local:b");
    expect(lines[0]!.text()).toContain("fork");
    const marks = w.findAll(".graph-fork-mark");
    expect(marks).toHaveLength(2);
    expect(w.get('[data-fork-mark="local:c"]').attributes("title")).toBe("fork 元: 名前-z（別の空間にあります）");
    expect(w.get('[data-fork-mark="local:d"]').attributes("title")).toBe("fork 元: 名前-gone（無くなりました）");
  });
  it("線も印も、押せない（pointer-events: none の層。ボタン・リンクを持たない）", () => {
    const w = mount(GraphForkLayer, { props: { nodes, known: new Set<string>(), nameOf: name } });
    expect(w.find("button").exists()).toBe(false);
    expect(w.find("a").exists()).toBe(false);
    expect(w.find("[tabindex]").exists()).toBe(false);
  });
  it("fork の注記が無いノードだけなら、何も描かない", () => {
    const w = mount(GraphForkLayer, { props: { nodes: [{ key: "local:a", x: 0, y: 0 }], known: new Set<string>(), nameOf: name } });
    expect(w.find("line").exists()).toBe(false);
    expect(w.find(".graph-fork-mark").exists()).toBe(false);
  });
});
