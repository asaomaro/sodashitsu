import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useGraphStore } from "../../store/graph.js";
import { useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";
import RekeyPicker from "./RekeyPicker.vue";
import { graphOf, paneOf } from "./graphTestKit.js";

// 20260927-agent-graph の 04（g04 点検）：選び直しの候補（同じマシンの pane・別のマシンを見ている間・未接続）。
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

const M = "a".repeat(32);
const snapWith = (panes: ReturnType<typeof paneOf>[]) => ({
  protocol: 1 as const,
  serverVersion: "t",
  host: { os: "linux" as const, windowsBuild: null, hostname: "h" },
  workspaces: [],
  tabs: [],
  panes,
  groups: [],
  focus: null,
  limits: { scrollbackLines: 5000 },
});

function setup() {
  const machines = useMachinesStore();
  machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
  machines.select(M);
  // 画面は M を向いている（M の p1・p2）。手元の要約にも p1・p3
  const session = useSessionStore();
  session.panes.set("p1", paneOf("p1", "t1", { label: "remote-one" }));
  session.panes.set("p2", paneOf("p2", "t1", { label: "remote-two" }));
  machines.applySummarySnapshot(
    "local",
    snapWith([paneOf("p1", "t1"), paneOf("p3", "t1", { label: "local-three" })]),
  );
  useGraphStore().applyGraph(
    graphOf({
      nodes: [
        { key: "local:p9", x: 0, y: 0 },
        { key: `${M}:p8`, x: 0, y: 100 },
        { key: `${M}:p1`, x: 0, y: 200 },
      ],
    }),
    "fresh",
  );
  return machines;
}
const keys = (w: ReturnType<typeof mount>) =>
  w.findAll("[data-rekey-key]").map((r) => r.attributes("data-rekey-key"));

describe("RekeyPicker", () => {
  it("別のマシンを見ている間、手元のノードの候補は手元の要約から、別のマシンのノードの候補は session から（同じ pane id でもマシンを取り違えない）", async () => {
    setup();
    const local = mount(RekeyPicker, { props: { nodeKey: "local:p9" }, attachTo: document.body });
    await nextTick();
    expect(keys(local)).toEqual(["local:p1", "local:p3"]);
    local.unmount();
    const remote = mount(RekeyPicker, { props: { nodeKey: `${M}:p8` }, attachTo: document.body });
    await nextTick();
    expect(keys(remote)).toEqual([`${M}:p2`]); // M:p1 は載っている
    remote.unmount();
  });

  it("繋がっていないマシンの候補は選べない（最後の要約の pane を印なしに出さない）", async () => {
    const machines = setup();
    machines.setSummaryConnected("local", false);
    const w = mount(RekeyPicker, { props: { nodeKey: "local:p9" }, attachTo: document.body });
    await nextTick();
    const inputs = w.findAll<HTMLInputElement>("[data-rekey-key]");
    expect(inputs.map((i) => i.element.disabled)).toEqual([true, true]);
    expect(w.text()).toContain("未接続");
    expect(w.text()).toContain("繋がっていないので選べません");
    await w.find(".rekey-picker-apply").trigger("click");
    expect(w.emitted("pick")).toBeUndefined();
    w.unmount();
  });
});
