import type { LayoutNode, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { repairView, type SessionLike, type ViewTarget } from "./viewRepair.js";

function ws(id: string, tabIds: string[], activeTabId = tabIds[0] ?? ""): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId, groupId: null, git: null, autoLabel: false };
}
function tab(id: string, workspaceId: string, layout: LayoutNode, focusedPaneId: string): Tab {
  return { id, workspaceId, label: id, layout, focusedPaneId, zoomedPaneId: null, sizeOwnerClientId: null };
}
function pane(id: string, tabId: string): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null };
}
function session(workspaces: Workspace[], tabs: Tab[], panes: Pane[]): SessionLike & { panes: Map<string, Pane>; tabs: Map<string, Tab>; workspaces: Map<string, Workspace> } {
  return {
    workspaces: new Map(workspaces.map((w) => [w.id, w])),
    tabs: new Map(tabs.map((t) => [t.id, t])),
    panes: new Map(panes.map((p) => [p.id, p])),
  };
}
const leaf = (paneId: string): LayoutNode => ({ type: "pane", paneId });
const two = (a: string, b: string): LayoutNode => ({ type: "split", id: "s1", dir: "right", ratio: 0.5, a: leaf(a), b: leaf(b) });
const lShape = (a: string, b: string, c: string): LayoutNode => ({ type: "split", id: "s1", dir: "right", ratio: 0.5, a: leaf(a), b: { type: "split", id: "s2", dir: "down", ratio: 0.5, a: leaf(b), b: leaf(c) } });
/** repairView を「適用する」（null なら今のまま）。イベントの列を順に流す検証に使う。 */
const apply = (cur: ViewTarget, s: SessionLike): ViewTarget => repairView(cur, s) ?? cur;

describe("repairView（D97）", () => {
  it("表示中のものが全て残っていれば null（何もしない）", () => {
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", leaf("p1"), "p1")], [pane("p1", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s)).toBeNull();
  });

  it("焦点の pane が閉じられたら、同じ tab のレイアウト木の最初の葉へ（レイアウト木がまだ古くても、実在する葉から選ぶ）", () => {
    // pane.closed が届いた直後：p2 は消えたが、tab のレイアウト木と focusedPaneId はまだ p2 を含む。
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", two("p1", "p2"), "p2")], [pane("p1", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p2" }, s)).toEqual({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" });
  });

  it("クライアントの tab.focusedPaneId が古くても使わず、サーバと同じく最初の葉を選ぶ（独立点検の指摘）", () => {
    // p1｜（p2/p3）で p3 を作った後（tab.focusedPaneId=p3 のまま）、クライアントで p2 へ移ってから p2 を閉じた。
    // サーバは「閉じたのが焦点の pane なら最初の葉」＝ p1 を選ぶ。
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", lShape("p1", "p2", "p3"), "p3")], [pane("p1", "t1"), pane("p3", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p2" }, s)?.focusedPaneId).toBe("p1");
  });

  it("表示中の tab が閉じられたら、残りの tab の先頭へ（クライアントの activeTabId が古くても使わない。独立点検の指摘）", () => {
    // [t1,t2,t3] で最後に作った t3 が activeTabId のまま、t1 へ移ってから t1 を閉じた。サーバは残りの先頭 t2 を選ぶ。
    const s = session(
      [ws("w1", ["t1", "t2", "t3"], "t3")],
      [tab("t2", "w1", leaf("p2"), "p2"), tab("t3", "w1", leaf("p3"), "p3")],
      [pane("p2", "t2"), pane("p3", "t3")],
    );
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s)).toEqual({ workspaceId: "w1", tabId: "t2", focusedPaneId: "p2" });
  });

  it("表示中の workspace が閉じられたら、残りの workspace の先頭へ（その workspace の最後に見ていた tab・pane）", () => {
    const s = session(
      [ws("w2", ["t2"]), ws("w3", ["t3"])],
      [tab("t2", "w2", leaf("p2"), "p2"), tab("t3", "w3", leaf("p3"), "p3")],
      [pane("p2", "t2"), pane("p3", "t3")],
    );
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s)).toEqual({ workspaceId: "w2", tabId: "t2", focusedPaneId: "p2" });
  });

  it("tab が 2 つある workspace を閉じる連鎖（pane.closed が全部先・tab.closed が後）の途中で、中身の無い tab を選ばない（独立点検の指摘）", () => {
    const s = session(
      [ws("w1", ["t1", "t2"]), ws("w2", ["t9"])],
      [tab("t1", "w1", leaf("p1"), "p1"), tab("t2", "w1", leaf("p2"), "p2"), tab("t9", "w2", leaf("p9"), "p9")],
      [pane("p1", "t1"), pane("p2", "t2"), pane("p9", "t9")],
    );
    let view: ViewTarget = { workspaceId: "w1", tabId: "t2", focusedPaneId: "p2" };
    const seen: ViewTarget[] = [];
    const showsLivePane: boolean[] = [];
    const step = (mutate: () => void) => {
      mutate();
      view = apply(view, s);
      seen.push(view);
      showsLivePane.push(!!view.focusedPaneId && s.panes.get(view.focusedPaneId)?.tabId === view.tabId); // その時点で判定する
    };
    step(() => s.panes.delete("p1"));
    step(() => s.panes.delete("p2"));
    step(() => s.tabs.delete("t1"));
    step(() => s.tabs.delete("t2"));
    step(() => s.workspaces.delete("w1"));
    // どの時点でも、表示している tab には生きている pane があり、焦点はそれを指している。
    expect(showsLivePane).toEqual([true, true, true, true, true]);
    expect(view).toEqual({ workspaceId: "w2", tabId: "t9", focusedPaneId: "p9" });
    expect(seen.some((v) => v.tabId === "t1")).toBe(false);
  });

  // 20260925-pane-replace-focus-hint。decisions.md D5（.aidev/works/20260924-pane-dnd-split-move）
  // の再現ケース：replacePane 後のレイアウトが {a: 別pane, b: 後継pane} になり、DFS順だと
  // 別pane（p_other）が選ばれてしまうが、successorHint（後継pane）を渡すとそちらが優先される。
  it("successorHint が生きていれば、DFS-first-leaf より優先して採用する（AC4。D5 の再現）", () => {
    // レイアウトの DFS順は [p_other, p_hint]——ヒント無しなら p_other が選ばれてしまう。
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", two("p_other", "p_hint"), "p_hint")], [pane("p_other", "t1"), pane("p_hint", "t1")]);
    // p_removed（replacePane で消えた targetPaneId）に focus していたクライアントを模す。
    const result = repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p_removed" }, s, "p_hint");
    expect(result?.focusedPaneId).toBe("p_hint");
  });

  it("successorHint が指す pane も既に存在しなければ、既存の DFS-first-leaf にフォールバックする（AC5）", () => {
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", two("p1", "p2"), "p2")], [pane("p1", "t1")]);
    const result = repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p2" }, s, "p-nonexistent");
    expect(result?.focusedPaneId).toBe("p1"); // 既存の DFS-first-leaf のまま
  });

  it("successorHint が無くても、既存の DFS-first-leaf のまま動作する（回帰）", () => {
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", two("p1", "p2"), "p2")], [pane("p1", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p2" }, s)?.focusedPaneId).toBe("p1");
  });

  it("今の focus 先がまだ生きていれば、successorHint があっても無視する（AC4 は焦点が消えた場合だけ）", () => {
    const s = session([ws("w1", ["t1"])], [tab("t1", "w1", two("p1", "p2"), "p2")], [pane("p1", "t1"), pane("p2", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s, "p2")).toBeNull(); // 何も変わらない
  });

  it("別の tab へ移る場合、successorHint は無視する（別 tab の分岐には適用しない）", () => {
    // 自分の tab（t1）自体が閉じられ、別の tab（t2）へ移る場面。t2 の focusedPaneId は p9 で
    // 生きているので、たとえ successorHint に別の値を渡しても t2 側では参照されない。
    const s = session([ws("w1", ["t1", "t2"])], [tab("t2", "w1", leaf("p9"), "p9")], [pane("p9", "t2")]);
    const result = repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s, "p9-decoy");
    expect(result).toEqual({ workspaceId: "w1", tabId: "t2", focusedPaneId: "p9" });
  });

  it("別の tab の pane が閉じられても、自分の表示は動かさない", () => {
    const s = session([ws("w1", ["t1", "t2"])], [tab("t1", "w1", leaf("p1"), "p1"), tab("t2", "w1", leaf("p9"), "p9")], [pane("p1", "t1")]);
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, s)).toBeNull();
  });

  it("表示できるものが無い間（最後の workspace を閉じてサーバが作り直すまで）は何もしない", () => {
    expect(repairView({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" }, session([], [], []))).toBeNull();
  });
});
