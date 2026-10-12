import { expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GitHistoryGraph from "./GitHistoryGraph.vue";
it("draws branch and merge connectors with commit nodes and emits the selected full SHA", () => {
  const sha = "a".repeat(40),
    other = "b".repeat(40);
  const w = mount(GitHistoryGraph, {
    props: { history: `* ${sha} merge (HEAD)\n|\\\n| * ${other} branch\n|/` },
  });
  expect(w.findAll("circle")).toHaveLength(2);
  expect(w.findAll("path").length).toBeGreaterThan(2);
  expect(w.text()).toContain("merge (HEAD)");
  w.findAll("button")[1]!.trigger("click");
  expect(w.emitted("select")?.[0]?.[0]).toContain(other);
  w.unmount();
});
