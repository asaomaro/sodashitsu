import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentInfo, NodeKey } from "@sodashitsu/protocol";
import type { GraphNodeInfo } from "../../store/graph.js";
import GraphNode from "./GraphNode.vue";
import { nodeText, pathTail } from "./nodeText.js";
import { agentOf } from "./graphTestKit.js";

// 20261008-graph-first の PR1e T17a（AC-L1）：ノードの 2 行。
const info = (extra: Partial<GraphNodeInfo> = {}): GraphNodeInfo => ({
  key: "local:p1" as NodeKey,
  machine: "local",
  paneId: "p1",
  local: true,
  machineLabel: "ローカル",
  name: "user@host: ~/work/repo",
  agent: null,
  state: null,
  exists: true,
  location: { workspaceId: "w1", tabId: "t1" },
  label: null,
  cwd: "/home/u/work/repo",
  ...extra,
});

describe("nodeText（ノードの 2 行の文字）", () => {
  it("エージェント: 付けた名前 → pane の名前 → 種類の名前。2 行目は種類と状態の語。pane の題は出さない", () => {
    const a = agentOf("working", { name: "layout-impl", label: "Claude Code" });
    expect(nodeText(info({ agent: a, state: "working" }))).toMatchObject({ name: "layout-impl", kind: "Claude Code", state: "作業中", machine: null });
    expect(nodeText(info({ agent: agentOf("working"), state: "working", label: "実装" })).name).toBe("実装");
    expect(nodeText(info({ agent: agentOf("working"), state: "working" })).name).toBe("Claude Code");
  });

  it("状態の語は、サイドバーと同じ（入力待ち・完了・待機中）。状態が分からない（未接続）ときは語を出さない", () => {
    const a = agentOf("idle");
    expect(nodeText(info({ agent: a, state: "blocked" })).state).toBe("入力待ち");
    expect(nodeText(info({ agent: a, state: "done" })).state).toBe("完了");
    expect(nodeText(info({ agent: a, state: "idle" })).state).toBe("待機中");
    expect(nodeText(info({ agent: a, state: null })).state).toBeNull();
  });

  it("シェル: 1 行目は pane の名前（無ければ場所の末尾）。2 行目は「シェル ・ 場所の末尾」（1 行目と同じなら「シェル」だけ）", () => {
    expect(nodeText(info({ label: "build" }))).toMatchObject({ name: "build", kind: "シェル", place: "repo" });
    expect(nodeText(info())).toMatchObject({ name: "repo", kind: "シェル", place: null });
    expect(nodeText(info({ cwd: null })).name).toBe("user@host: ~/work/repo"); // 場所が分からなければ呼び名
  });

  it("別のマシンの pane: 呼び名のまま・2 行目の頭にマシンの名前", () => {
    const t = nodeText(info({ local: false, machine: "m1", machineLabel: "box", name: "pane p7", cwd: null }));
    expect(t).toMatchObject({ name: "pane p7", machine: "box", kind: "シェル" });
  });

  it("pathTail", () => {
    expect(pathTail("/a/b/")).toBe("b");
    expect(pathTail("/")).toBeNull();
    expect(pathTail(null)).toBeNull();
    expect(pathTail("C:\\x\\y")).toBe("y");
  });
});

describe("GraphNode（中身）", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const mountNode = (i: GraphNodeInfo, extra: Record<string, unknown> = {}) =>
    mount(GraphNode, { props: { info: i, x: 0, y: 0, selected: false, tabbable: true, outCount: 0, inCount: 0, ...extra } });

  it("エージェント: 状態の印・名前・2 行目（種類 ・ 状態の語）・tab のタグ。長い名前は title に全文", () => {
    const a: AgentInfo = agentOf("working", { name: "とても長い名前".repeat(6), label: "Claude Code" });
    const w = mountNode(info({ agent: a, state: "working" }), { tabLabel: "実装" });
    expect(w.find(".graph-node-state").attributes("data-state")).toBe("working");
    expect(w.find(".graph-node-shell").exists()).toBe(false);
    expect(w.find(".graph-node-name").attributes("title")).toBe("とても長い名前".repeat(6));
    expect(w.find(".graph-node-sub").text()).toContain("Claude Code");
    expect(w.find(".graph-node-state-text").text()).toBe("作業中");
    expect(w.find("[data-node-tab]").text()).toBe("実装");
    expect(w.classes()).not.toContain("graph-node-approval");
  });

  it("承認待ち（入力待ち）: 枠・2 行目の色のクラス。状態の語も出る。無効・未接続では付けない", () => {
    const a = agentOf("blocked");
    const w = mountNode(info({ agent: a, state: "blocked" }));
    expect(w.classes()).toContain("graph-node-approval");
    expect(w.find(".graph-node-state-text").text()).toBe("入力待ち");
    expect(mountNode(info({ agent: a, state: "blocked", exists: false })).classes()).not.toContain("graph-node-approval");
  });

  it("シェル: 丸ではなく小さな四角。サブエージェントの件数は 2 行目の右に残る。別のマシンは頭にマシン名。未接続の表示・pane へのボタン・線を結ぶ丸も残る", () => {
    const w = mountNode(info({ label: "build" }));
    expect(w.find(".graph-node-shell").exists()).toBe(true);
    expect(w.find(".graph-node-state").exists()).toBe(false);
    expect(w.find(".graph-node-goto").exists()).toBe(true);
    expect(w.find(".graph-node-handle").exists()).toBe(true);
    const a = agentOf("working", { subagents: { count: 3, items: [] } });
    const w2 = mountNode(info({ agent: a, state: "working" }));
    expect(w2.find(".graph-node-sub [data-subagents-button]").text()).toBe("3");
    const w3 = mountNode(info({ local: false, machine: "m1", machineLabel: "box", name: "pane p7", exists: null }));
    expect(w3.find(".graph-node-sub .graph-node-machine").text()).toBe("box");
    expect(w3.find(".graph-node-warn").text()).toBe("未接続");
  });

  it("読み上げのラベルは、呼び名・マシン・エージェント・状態を保つ", () => {
    const a = agentOf("working", { name: "layout-impl" });
    const label = mountNode(info({ name: "impl", agent: a, state: "working" })).attributes("aria-label")!;
    expect(label).toContain("impl");
    expect(label).toContain("ローカル");
    expect(label).toContain("作業中");
  });
});
