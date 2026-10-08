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
// 20261008-graph-first：手元の pane は出さない（手元のすべての pane のノードはサーバが持つ）。別のマシンの pane だけを載せる・外す。
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
        { key: "local:p9", x: 0, y: 100 },
        { key: `${"a".repeat(32)}:p4`, x: 0, y: 200 },
      ],
    }),
    "fresh",
  );
}

describe("PaneChecklist", () => {
  it("手元の pane は出さない（開いている手元の pane のノードも出さない）。閉じた手元の pane のノードと、一覧に無い別のマシンのノードは「そのほか」で外せる", async () => {
    seed();
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())).toEqual(["そのほか（載っているノード）"]);
    const boxes = w.findAll<HTMLInputElement>("input[type=checkbox]");
    // local:p1（開いている手元の pane）・local:p2・local:p3 は出ない。
    expect(boxes.map((b) => [b.attributes("data-pane-key"), b.element.checked])).toEqual([
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
    await w.find('[data-pane-key="local:p9"]').setValue(false);
    await w.find(".pane-checklist-apply").trigger("click");
    expect(w.emitted("apply")![0]![0]).toEqual({ add: [], remove: ["local:p9"] });
    w.unmount();
    const w2 = mount(PaneChecklist, { attachTo: document.body });
    await w2.find(".pane-checklist-apply").trigger("click");
    expect(w2.emitted("apply")).toBeUndefined();
    expect(w2.emitted("close")).toHaveLength(1);
    await w2.find(`[data-pane-key="${"a".repeat(32)}:p4"]`).setValue(false);
    await w2.find(".pane-checklist").trigger("keydown", { key: "Escape" });
    expect(w2.emitted("close")).toHaveLength(2);
    expect(w2.emitted("apply")).toBeUndefined();
    w2.unmount();
  });

  it("絞り込み", async () => {
    seed();
    const w = mount(PaneChecklist, { attachTo: document.body });
    await w.find(".pane-checklist-filter").setValue("p9");
    expect(w.findAll(".pane-checklist-row").map((r) => r.text())).toEqual([
      "pane p9無効（pane がありません）",
    ]);
    w.unmount();
  });

  it("別のマシンを見ている間も、手元の pane（軽い接続の要約にあるもの）は出さない", async () => {
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
    expect(w.findAll(".pane-checklist-row").map((r) => r.text())).toEqual([]);
    expect(w.find("input[type=checkbox]").exists()).toBe(false);
    w.unmount();
  });
});

describe("PaneChecklist（開いた時点の写しと比べる。レビュー R6）", () => {
  it("開いている間に他で足された・外されたノードを、適用で巻き戻さない（自分が変えた分だけを渡す）", async () => {
    seed();
    const M = "a".repeat(32);
    const machines = useMachinesStore();
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.applySummarySnapshot(M, {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [{ id: "w1", label: "infra", tabIds: ["t1"] } as never],
      tabs: [{ id: "t1", workspaceId: "w1" } as never],
      panes: [paneOf("p4", "t1"), paneOf("p5", "t1")],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    });
    const w = mount(PaneChecklist, { attachTo: document.body });
    await w.find(`[data-pane-key="${M}:p5"]`).setValue(true);
    // 他の画面が p4 を外し、手元の p3 のノードを足した（自分は p4 を外していないので、巻き戻しも外しもしない）
    useGraphStore().applyGraph(
      graphOf({
        rev: 5,
        nodes: [
          { key: "local:p3", x: 0, y: 0 },
          { key: "local:p9", x: 0, y: 100 },
        ],
      }),
      "event",
    );
    await nextTick();
    await w.find(".pane-checklist-apply").trigger("click");
    expect(w.emitted("apply")![0]![0]).toEqual({ add: [`${M}:p5`], remove: [] });
    w.unmount();
  });
});

describe("PaneChecklist（別のマシンの節。04 T4）", () => {
  const M = "a".repeat(32);
  const N = "c".repeat(32);
  function remoteSnap() {
    return {
      protocol: 1 as const,
      serverVersion: "t",
      host: { os: "linux" as const, windowsBuild: null, hostname: "h" },
      workspaces: [{ id: "w1", label: "infra", tabIds: ["t1"] } as never],
      tabs: [{ id: "t1", workspaceId: "w1" } as never],
      panes: [
        paneOf("p4", "t1", { title: "vim" }),
        paneOf("p5", "t1", { agent: agentOf("idle", { name: "rev" }) }),
      ],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    };
  }

  it("登録したマシンの pane を「マシン / workspace」の節に呼び名つきで出し、載せる・外すができる。繋がっていないマシンはそう書く", async () => {
    seed();
    const machines = useMachinesStore();
    machines.setMachines([
      { id: M, label: "box", state: "online", message: null },
      { id: N, label: "far", state: "reconnecting", message: null },
    ]);
    machines.applySummarySnapshot(M, remoteSnap());
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())).toEqual([
      "box / infra",
      "そのほか（載っているノード）",
    ]);
    const remoteRows = w
      .findAll(".pane-checklist-row")
      .filter((r) => r.find("input").attributes("data-pane-key")!.startsWith(M));
    expect(remoteRows.map((r) => [r.find("input").attributes("data-pane-key"), r.text()])).toEqual([
      [`${M}:p4`, "vim"],
      [`${M}:p5`, "revClaude Code"],
    ]);
    expect((remoteRows[0]!.find("input").element as HTMLInputElement).checked).toBe(true); // 載っている
    expect(w.text()).toContain("far: 繋がっていないので pane を出せません。");
    await w.find(`[data-pane-key="${M}:p5"]`).setValue(true);
    await w.find(`[data-pane-key="${M}:p4"]`).setValue(false);
    await w.find(".pane-checklist-apply").trigger("click");
    expect(w.emitted("apply")![0]![0]).toEqual({ add: [`${M}:p5`], remove: [`${M}:p4`] });
    w.unmount();
  });

  it("切れた後は最後の要約を（未接続）の印つきで出す", async () => {
    seed();
    const machines = useMachinesStore();
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.applySummarySnapshot(M, remoteSnap());
    machines.setSummaryConnected(M, false);
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())).toContain("box / infra（未接続）");
    w.unmount();
  });
});

describe("PaneChecklist（別のマシンを見ている間・未接続。g04 点検）", () => {
  const M = "a".repeat(32);
  const snapWith = (panes: ReturnType<typeof paneOf>[]) => ({
    protocol: 1 as const,
    serverVersion: "t",
    host: { os: "linux" as const, windowsBuild: null, hostname: "h" },
    workspaces: [{ id: "w1", label: "api", tabIds: ["t1"] } as never],
    tabs: [{ id: "t1", workspaceId: "w1" } as never],
    panes,
    groups: [],
    focus: null,
    limits: { scrollbackLines: 5000 },
  });

  it("別のマシンを見ている間: そのマシンの節は session から。手元の pane は出さない（要約にあっても）", async () => {
    const machines = useMachinesStore();
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.select(M);
    const session = useSessionStore();
    session.workspaceUpserted({ id: "w1", label: "infra", tabIds: ["t1"] } as never);
    session.panes.set("p1", paneOf("p1", "t1", { label: "remote-one" }));
    machines.applySummarySnapshot("local", snapWith([paneOf("p1", "t1", { label: "local-one" })]));
    useGraphStore().applyGraph(graphOf({ nodes: [{ key: `${M}:p1`, x: 0, y: 0 }] }), "fresh");
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())).toEqual(["box / infra"]);
    const rows = w
      .findAll(".pane-checklist-row")
      .map((r) => [
        r.find("input").attributes("data-pane-key"),
        r.find("span").text(),
        (r.find("input").element as HTMLInputElement).checked,
      ]);
    expect(rows).toEqual([[`${M}:p1`, "remote-one", true]]);
    w.unmount();
  });

  it("画面が向いているマシンが切れたら節に（未接続）。切り替えの途中（session が空）は無効と出さず、繋がっていないと書く", async () => {
    const machines = useMachinesStore();
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.select(M);
    const session = useSessionStore();
    session.workspaceUpserted({ id: "w1", label: "infra", tabIds: ["t1"] } as never);
    session.panes.set("p5", paneOf("p5", "t1"));
    const { useViewStore } = await import("../../store/view.js");
    useViewStore().onConnectionState("reconnecting");
    useGraphStore().applyGraph(graphOf({ nodes: [{ key: `${M}:p5`, x: 0, y: 0 }] }), "fresh");
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w.findAll("legend").map((l) => l.text())[0]).toBe("box / infra（未接続）");
    w.unmount();

    // 別のマシンへ切り替えの途中（session が空・connecting）
    session.clear();
    session.workspaces.clear();
    useViewStore().onConnectionState("connecting");
    const w2 = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    expect(w2.text()).toContain("box: 繋がっていないので pane を出せません。");
    expect(w2.text()).toContain("box（未接続）");
    expect(w2.text()).not.toContain("無効");
    // 手元は対象でない（「ローカル: 繋がっていない」とは出さない）
    expect(w2.text()).not.toContain("ローカル: 繋がっていない");
    w2.unmount();
  });
});

describe("PaneChecklist（切れたマシンの古い要約。04 レビュー R1）", () => {
  it("切れたマシンの pane は載せられない（載っているものは外せる）", async () => {
    seed();
    const M = "a".repeat(32);
    const machines = useMachinesStore();
    machines.setMachines([{ id: M, label: "box", state: "online", message: null }]);
    machines.applySummarySnapshot(M, {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [{ id: "w1", label: "infra", tabIds: ["t1"] } as never],
      tabs: [{ id: "t1", workspaceId: "w1" } as never],
      panes: [paneOf("p4", "t1"), paneOf("p5", "t1")],
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    });
    machines.setSummaryConnected(M, false);
    const w = mount(PaneChecklist, { attachTo: document.body });
    await nextTick();
    const box = (k: string) => w.find<HTMLInputElement>(`[data-pane-key="${k}"]`).element;
    expect(box(`${M}:p4`).disabled).toBe(false); // 載っている（外せる）
    expect(box(`${M}:p5`).disabled).toBe(true);
    w.unmount();
  });
});
