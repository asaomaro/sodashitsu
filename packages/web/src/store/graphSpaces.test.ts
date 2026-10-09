import type { Graph, NodeKey } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { graphOf, paneOf } from "../components/graph/graphTestKit.js";
import { GRAPH_FLASH_MS, useGraphSpacesStore } from "./graphSpaces.js";
import { useGraphStore } from "./graph.js";
import { useSessionStore } from "./session.js";
import { useViewStore } from "./view.js";

// 20261008-graph-first の PR1c T11a：空間・囲いの画面の側の状態。
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
});

/** w1（グループ g1）の pane p1・p2、w2（グループなし）の pane p3。 */
function seed(): void {
  const session = useSessionStore();
  session.groups.set("g1", { id: "g1", label: "開発", collapsed: false } as never);
  session.workspaces.set("w1", { id: "w1", label: "alpha", cwd: "/a", tabIds: ["t1"], activeTabId: "t1", groupId: "g1", git: null } as never);
  session.workspaces.set("w2", { id: "w2", label: "beta", cwd: "/b", tabIds: ["t2"], activeTabId: "t2", groupId: null, git: null } as never);
  session.tabs.set("t1", { id: "t1", workspaceId: "w1", label: "1", layout: { type: "pane", paneId: "p1" } } as never);
  session.tabs.set("t2", { id: "t2", workspaceId: "w2", label: "1", layout: { type: "pane", paneId: "p3" } } as never);
  session.panes.set("p1", paneOf("p1", "t1"));
  session.panes.set("p2", paneOf("p2", "t1"));
  session.panes.set("p3", paneOf("p3", "t2"));
  session.layout = { top: ["g:g1"], groups: { g1: ["w:w1"] }, ungrouped: ["w:w2"] } as never;
}
function applyGraph(g: Partial<Graph> = {}): void {
  useGraphStore().applyGraph(
    graphOf({
      nodes: [
        { key: "local:p1" as NodeKey, x: 20, y: 60 },
        { key: "local:p2" as NodeKey, x: 260, y: 60 },
        { key: "local:p3" as NodeKey, x: 1000, y: 60 },
      ],
      links: [],
      ...g,
    }),
    "fresh",
  );
}

describe("graphSpaces（空間の一覧・表示中の空間）", () => {
  it("グループごとの空間と「グループなし」が、サイドバーの順に並び、数が付く。2 つ以上なら見出しの並びを出す", () => {
    seed();
    applyGraph();
    const s = useGraphSpacesStore();
    expect(s.spaces.map((x) => [x.id, x.label, x.count])).toEqual([
      ["g:g1", "開発", 1],
      ["u", "グループなし", 1],
    ]);
    expect(s.showBar).toBe(true);
  });

  it("グループが無い（「グループなし」だけ）なら、見出しの並びを出さない", () => {
    seed();
    useSessionStore().groups.clear();
    useSessionStore().workspaces.get("w1")!.groupId = null;
    useSessionStore().layout = { top: [], groups: {}, ungrouped: ["w:w1", "w:w2"] } as never;
    applyGraph();
    expect(useGraphSpacesStore().showBar).toBe(false);
  });

  it("表示中の空間: 既定は選んでいる workspace のある空間。選ぶと覚える。消えた空間は覚えていても使わない", () => {
    seed();
    applyGraph();
    const view = useViewStore();
    const s = useGraphSpacesStore();
    view.setView("w2", "t2");
    expect(s.currentId).toBe("u");
    view.setView("w1", "t1");
    expect(s.currentId).toBe("g:g1");
    s.setCurrent("u");
    expect(s.currentId).toBe("u");
    expect(localStorage.getItem("soda.graphSpace.v1")).toBe('"u"');
    s.setCurrent("g:gone");
    expect(s.currentId).toBe("g:g1"); // 無い空間は選んでいる workspace のある空間へ
  });

  it("表示するノードは、表示中の空間のものだけ", () => {
    seed();
    applyGraph();
    const s = useGraphSpacesStore();
    s.setCurrent("g:g1");
    expect([s.isShown("local:p1"), s.isShown("local:p2"), s.isShown("local:p3")]).toEqual([true, true, false]);
    s.setCurrent("u");
    expect([s.isShown("local:p1"), s.isShown("local:p3")]).toEqual([false, true]);
  });

  it("どの囲いにも属さないノード（pane の無い無効なノード）は、「グループなし」の空間に出る（消えて外せなくならない）", () => {
    seed();
    applyGraph({
      nodes: [
        { key: "local:p1" as NodeKey, x: 20, y: 60 },
        { key: "local:gone" as NodeKey, x: 600, y: 60 },
      ],
    });
    const s = useGraphSpacesStore();
    expect(s.spaceOfNode.get("local:gone")).toBe("u");
    s.setCurrent("u");
    expect(s.isShown("local:gone")).toBe(true);
  });

  it("構成が導けないとき（別のマシンを向いている）は、空間も囲いも無く、全部のノードを出す", () => {
    applyGraph();
    const s = useGraphSpacesStore();
    // 手元のセッションが無い扱い: graph store が構成を返さない
    vi.spyOn(useGraphStore(), "layoutStructure").mockReturnValue(null);
    expect(s.spaces).toEqual([]);
    expect(s.showBar).toBe(false);
    expect(s.frames).toEqual([]);
    expect(s.isShown("local:p1")).toBe(true);
  });
});

describe("graphSpaces（囲いごと動いたことを知らせる）", () => {
  /** w1 の p1・p2 が (dx, dy) だけ動く。`withNew` なら、w1 に pane p4 のノードが足されている（置き場所の計算による移動）。 */
  const moved = (dx: number, dy: number, o: { withNew?: boolean; skip?: string[]; rev?: number } = {}) =>
    graphOf({
      rev: o.rev ?? 5,
      nodes: [
        { key: "local:p1" as NodeKey, x: 20 + (o.skip?.includes("p1") ? 0 : dx), y: 60 + (o.skip?.includes("p1") ? 0 : dy) },
        { key: "local:p2" as NodeKey, x: 260 + dx, y: 60 + dy },
        { key: "local:p3" as NodeKey, x: 1000, y: 60 },
        ...(o.withNew ? [{ key: "local:p4" as NodeKey, x: 500 + dx, y: 60 + dy }] : []),
      ],
    });
  const addP4 = (): void => {
    useSessionStore().panes.set("p4", paneOf("p4", "t1"));
  };

  it("囲いのもともとのノードが全部同じ量だけ動き、その囲いにノードが増えたら、その囲いを強調する（自分の操作が無いとき）", async () => {
    seed();
    applyGraph();
    addP4();
    const s = useGraphSpacesStore();
    useGraphStore().applyGraph(moved(0, 480, { withNew: true }), "event");
    await Promise.resolve();
    expect(s.flashId).toBe("w1");
  });

  it("ノードが増えていない移動（他の人の囲いのドラッグ・1 ノードだけの workspace の移動）は、強調しない", async () => {
    seed();
    applyGraph();
    const s = useGraphSpacesStore();
    useGraphStore().applyGraph(moved(0, 480), "event"); // 増えていない（他の人が囲いをドラッグした）
    await Promise.resolve();
    expect(s.flashId).toBeNull();
    const g = useGraphStore();
    g.applyGraph(
      graphOf({ rev: 6, nodes: [{ key: "local:p1" as NodeKey, x: 20, y: 60 }, { key: "local:p2" as NodeKey, x: 260, y: 60 }, { key: "local:p3" as NodeKey, x: 1100, y: 300 }] }),
      "event",
    ); // 1 ノードだけの workspace（w2）の移動
    await Promise.resolve();
    expect(s.flashId).toBeNull();
  });

  it("自分の操作（ドラッグ中・送信中）の結果・一部だけが動いたとき・動いていないときも、強調しない", async () => {
    seed();
    applyGraph();
    addP4();
    const g = useGraphStore();
    const s = useGraphSpacesStore();
    g.pendingPositions = new Map([["local:p1", { x: 20, y: 540 }]]);
    g.applyGraph(moved(0, 480, { withNew: true }), "event");
    await Promise.resolve();
    expect(s.flashId).toBeNull();
    g.pendingPositions = new Map();
    g.applyGraph(moved(0, 960, { withNew: true, skip: ["p1"], rev: 6 }), "event"); // p1 だけ動かない＝まとめての移動ではない
    await Promise.resolve();
    expect(s.flashId).toBeNull();
  });
});

describe("graphSpaces（囲い・強調・動かす依頼・表示の記憶）", () => {
  it("囲いは表示中の空間のものだけ。見出しの情報（名前・フォルダ・tab）が引ける", () => {
    seed();
    applyGraph();
    const s = useGraphSpacesStore();
    s.setCurrent("g:g1");
    expect(s.frames.map((f) => f.id)).toEqual(["w1"]);
    expect(s.infoMap.get("w1")).toMatchObject({ title: "alpha", folder: "a", tabs: [{ id: "t1", label: "1", active: true }] });
  });

  it("tab の強調は、同じタグをもう一度で戻り、別のタグで付け替わる", () => {
    const s = useGraphSpacesStore();
    s.toggleEmphasis("w1", "t1");
    expect(s.emphasis).toEqual({ workspaceId: "w1", tabId: "t1" });
    s.toggleEmphasis("w1", "t2");
    expect(s.emphasis).toEqual({ workspaceId: "w1", tabId: "t2" });
    s.toggleEmphasis("w1", "t2");
    expect(s.emphasis).toBeNull();
  });

  it("移った先の囲いは 1.5 秒強く出て、消える", () => {
    vi.useFakeTimers();
    const s = useGraphSpacesStore();
    s.flash("w1");
    expect(s.flashId).toBe("w1");
    vi.advanceTimersByTime(GRAPH_FLASH_MS - 1);
    expect(s.flashId).toBe("w1");
    vi.advanceTimersByTime(2);
    expect(s.flashId).toBeNull();
  });

  it("動かす依頼は、押すたびに進む（同じ行を押しても）", () => {
    const s = useGraphSpacesStore();
    const a = s.revealSeq;
    s.requestReveal({ kind: "workspace", workspaceId: "w1" });
    s.requestReveal({ kind: "workspace", workspaceId: "w1" });
    expect(s.revealSeq).toBe(a + 2);
    expect(s.revealTarget).toEqual({ kind: "workspace", workspaceId: "w1" });
  });

  it("空間ごとの表示を覚える。記憶が 1 つも無いときだけ、前の版の 1 つの表示を使う", () => {
    localStorage.setItem("soda.graphView.v1", JSON.stringify({ zoom: 0.5, panX: 10, panY: 20 }));
    const s = useGraphSpacesStore();
    expect(s.loadViewport("u")).toEqual({ zoom: 0.5, panX: 10, panY: 20 }); // 前の版の表示
    s.saveViewport("u", { zoom: 1, panX: 1, panY: 2 });
    expect(s.loadViewport("u")).toEqual({ zoom: 1, panX: 1, panY: 2 });
    expect(s.loadViewport("g:g1")).toBeNull(); // 記憶ができたら、前の版の表示は使わない
  });

  it("壊れた記憶は使わない", () => {
    localStorage.setItem("soda.graphViewports.v1", JSON.stringify({ u: { zoom: "x" } }));
    expect(useGraphSpacesStore().loadViewport("u")).toBeNull();
    localStorage.setItem("soda.graphViewports.v1", "not json");
    expect(useGraphSpacesStore().loadViewport("u")).toBeNull();
  });
});
