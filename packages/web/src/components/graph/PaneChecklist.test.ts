import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useGraphStore } from "../../store/graph.js";
import { useMachinesStore } from "../../store/machines.js";
import { useSessionStore } from "../../store/session.js";
import PaneChecklist from "./PaneChecklist.vue";
import { agentOf, graphOf, paneOf } from "./graphTestKit.js";

// 20260927-agent-graph の 03-web-graph T4：pane を載せる/外すチェックリスト。
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

function seed() {
  const session = useSessionStore();
  session.workspaceUpserted({ id: "w1", label: "api", tabIds: ["t1"] } as never);
  session.workspaceUpserted({ id: "w2", label: "web", tabIds: ["t2"] } as never);
  session.panes.set("p1", paneOf("p1", "t1", { label: "impl", agent: agentOf("idle") }));
  session.panes.set("p2", paneOf("p2", "t1", { label: "reviewer" }));
  session.panes.set("p3", paneOf("p3", "t2"));
  useGraphStore().applyGraph(
    graphOf({
      nodes: [
        { key: "local:p1", x: 0, y: 0 },
        { key: "local:p9", x: 0, y: 100, stale: true },
        { key: `${"a".repeat(32)}:p4`, x: 0, y: 200 },
      ],
    }),
    "fresh",
  );
}

describe("PaneChecklist", () => {
  it("手元の pane を workspace ごとに出し、載っているものに印。載っていて一覧に無いノードは「そのほか」", async () => {
    seed();
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())).toEqual([
      "api",
      "web",
      "そのほか（載っているノード）",
    ]);
    const boxes = w.findAll<HTMLInputElement>("input[type=checkbox]");
    expect(boxes.map((b) => [b.attributes("data-pane-key"), b.element.checked])).toEqual([
      ["local:p1", true],
      ["local:p2", false],
      ["local:p3", false],
      ["local:p9", true],
      [`${"a".repeat(32)}:p4`, true],
    ]);
    expect(w.text()).toContain("無効（pane がありません）");
    expect(w.text()).toContain("別のマシン");
    expect(document.activeElement?.className).toBe("pane-checklist-filter");
    w.unmount();
  });

  it("適用で足す/外すを渡す。変えずに適用・Esc・取り消しは何も変えずに閉じる", async () => {
    seed();
    const w = mount(PaneChecklist, { attachTo: document.body });
    await w.find('[data-pane-key="local:p2"]').setValue(true);
    await w.find('[data-pane-key="local:p9"]').setValue(false);
    await w.find(".pane-checklist-apply").trigger("click");
    expect(w.emitted("apply")![0]![0]).toEqual({ add: ["local:p2"], remove: ["local:p9"] });
    w.unmount();
    const w2 = mount(PaneChecklist, { attachTo: document.body });
    await w2.find(".pane-checklist-apply").trigger("click");
    expect(w2.emitted("apply")).toBeUndefined();
    expect(w2.emitted("close")).toHaveLength(1);
    await w2.find('[data-pane-key="local:p3"]').setValue(true);
    await w2.find(".pane-checklist").trigger("keydown", { key: "Escape" });
    expect(w2.emitted("close")).toHaveLength(2);
    expect(w2.emitted("apply")).toBeUndefined();
    w2.unmount();
  });

  it("絞り込み", async () => {
    seed();
    const w = mount(PaneChecklist, { attachTo: document.body });
    await w.find(".pane-checklist-filter").setValue("rev");
    expect(w.findAll(".pane-checklist-row").map((r) => r.text())).toEqual(["reviewer"]);
    w.unmount();
  });

  it("別のマシンを見ている間は、手元の軽い接続の要約から pane <id> で出す", async () => {
    const machines = useMachinesStore();
    const M = "b".repeat(32);
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.select(M);
    machines.applySummarySnapshot("local", {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [{ id: "w1", label: "api", tabIds: ["t1"] } as never],
      tabs: [{ id: "t1", workspaceId: "w1" } as never],
      panes: [paneOf("p5", "t1")],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    });
    useGraphStore().applyGraph(graphOf({ nodes: [] }), "fresh");
    const w = mount(PaneChecklist, { attachTo: document.body });
    expect(w.findAll(".pane-checklist-row").map((r) => r.text())).toEqual(["pane p5"]);
    expect(w.find("input[type=checkbox]").attributes("data-pane-key")).toBe("local:p5");
    w.unmount();
  });
});

describe("PaneChecklist（無効なノードと同じ番号の pane。g03 点検 T4）", () => {
  it("無効なノードと同じ鍵の今の pane の行は「載っている」と区別し、無効の注記を出す", async () => {
    const session = useSessionStore();
    session.workspaceUpserted({ id: "w1", label: "api", tabIds: ["t1"] } as never);
    session.panes.set("p1", paneOf("p1", "t1", { label: "impl" }));
    session.panes.set("p2", paneOf("p2", "t1", { label: "reviewer" }));
    useGraphStore().applyGraph(
      graphOf({
        nodes: [
          { key: "local:p1", x: 0, y: 0, stale: true },
          { key: "local:p2", x: 0, y: 100 },
        ],
      }),
      "fresh",
    );
    const w = mount(PaneChecklist, { attachTo: document.body });
    const rows = w.findAll(".pane-checklist-row");
    expect(rows[0]!.text()).toContain("無効");
    expect(rows[0]!.find(".pane-checklist-note").text()).toContain("前の pane のノード");
    expect(rows[1]!.find(".pane-checklist-note").exists()).toBe(false);
    w.unmount();
  });
});
