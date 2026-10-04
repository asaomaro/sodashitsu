import { describe, expect, it } from "vitest";
import { NotFoundError, SessionModel, type GitJudgement, type NewPaneInit } from "./SessionModel.js";
import * as Layout from "./LayoutTree.js";
import type { GitInfo } from "@sodashitsu/protocol";

const init: NewPaneInit = { cwd: "/home/u", shell: "/bin/bash", cols: 80, rows: 24 };

describe("SessionModel — creation", () => {
  it("creates a workspace with its first tab and pane", () => {
    const model = new SessionModel();
    const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
    expect(workspace.id).toBe("w1");
    expect(tab.id).toBe("t1");
    expect(pane.id).toBe("p1");
    expect(workspace.tabIds).toEqual(["t1"]);
    expect(workspace.activeTabId).toBe("t1");
    expect(tab.focusedPaneId).toBe("p1");
    expect(tab.layout).toEqual({ type: "pane", paneId: "p1" });
    expect(model.getFocus()).toEqual({ workspaceId: "w1", tabId: "t1", paneId: "p1" });
  });

  it("allocates ids that keep increasing across workspaces", () => {
    const model = new SessionModel();
    model.createWorkspace("/a", "a", init);
    const second = model.createWorkspace("/b", "b", init);
    expect(second.workspace.id).toBe("w2");
    expect(second.tab.id).toBe("t2");
    expect(second.pane.id).toBe("p2");
  });

  it("creates a tab inside a workspace and focuses it", () => {
    const model = new SessionModel();
    const { workspace } = model.createWorkspace("/home/u", "api", init);
    const { tab, pane } = model.createTab(workspace.id, "logs", init);
    expect(tab.workspaceId).toBe(workspace.id);
    expect(model.getWorkspace(workspace.id)?.tabIds).toEqual(["t1", tab.id]);
    expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(tab.id);
    expect(model.getFocus()?.paneId).toBe(pane.id);
  });

  it("throws NotFoundError for an unknown workspace id", () => {
    const model = new SessionModel();
    expect(() => model.createTab("w99", "x", init)).toThrow(NotFoundError);
  });
});

describe("SessionModel — split / close panes", () => {
  it("splits a pane and tracks both panes in the tab layout", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const newPaneId = model.reserveNextPaneId();
    const { pane: newPane } = model.splitPane(pane.id, "right", undefined, newPaneId, init);
    const updatedTab = model.getTab(tab.id)!;
    expect(updatedTab.layout).toEqual({
      type: "split",
      id: "s1",
      dir: "right",
      ratio: 0.5,
      a: { type: "pane", paneId: pane.id },
      b: { type: "pane", paneId: newPane.id },
    });
    expect(updatedTab.focusedPaneId).toBe(newPane.id); // 新しい pane にフォーカスが移る
  });

  it("closing one of two panes collapses the split without closing the tab", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const newPaneId = model.reserveNextPaneId();
    const { pane: newPane } = model.splitPane(pane.id, "right", undefined, newPaneId, init);

    const result = model.closePane(newPane.id);
    expect(result).toEqual({ removedPaneIds: [newPane.id], removedTabIds: [], closedWorkspaceId: null });
    expect(model.getTab(tab.id)?.layout).toEqual({ type: "pane", paneId: pane.id });
    expect(model.getTab(tab.id)?.focusedPaneId).toBe(pane.id); // 消えた方にフォーカスがあったので移る
    expect(model.getPane(newPane.id)).toBeUndefined();
  });

  describe("closePane の後継の希望（20260926-edit-scrollback）", () => {
    function threePanes() {
      const model = new SessionModel();
      const { tab, pane: p1 } = model.createWorkspace("/home/u", "api", init);
      const { pane: p2 } = model.splitPane(p1.id, "right", undefined, model.reserveNextPaneId(), init);
      const { pane: p3 } = model.splitPane(p2.id, "right", undefined, model.reserveNextPaneId(), init);
      return { model, tab, p1: p1.id, p2: p2.id, p3: p3.id };
    }

    it("閉じた pane が焦点なら、残っている希望の pane を焦点にし successorPaneId に入れる（最初の葉ではなく）", () => {
      const { model, tab, p1, p2, p3 } = threePanes();
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p3);
      const result = model.closePane(p3, p2);
      expect(result).toEqual({ removedPaneIds: [p3], removedTabIds: [], closedWorkspaceId: null, successorPaneId: p2 });
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p2);
      expect(model.getFocus()?.paneId).toBe(p2);
      expect(Layout.leaves(model.getTab(tab.id)!.layout)[0]).toBe(p1); // 既定なら p1 になるところ
    });

    it("閉じた pane が焦点でなければ焦点は動かさないが、successorPaneId は入れる（別のブラウザの後継の手がかり）", () => {
      const { model, tab, p1, p2, p3 } = threePanes();
      model.focusPane(p1);
      const result = model.closePane(p3, p2);
      expect(result.successorPaneId).toBe(p2);
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p1);
    });

    it("希望の pane がその tab に無ければ、既定（最初の葉）で successorPaneId は付けない", () => {
      const { model, tab, p1, p2, p3 } = threePanes();
      model.closePane(p2);
      const result = model.closePane(p3, p2);
      expect(result).toEqual({ removedPaneIds: [p3], removedTabIds: [], closedWorkspaceId: null });
      expect(Object.hasOwn(result, "successorPaneId")).toBe(false); // toEqual は undefined の値とキー無しを区別しない
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p1);
    });

    it("tab ごと閉じる連鎖では希望を無視する", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
      const other = model.createTab(workspace.id, "second", init);
      const result = model.closePane(pane.id, other.pane.id);
      expect(result.successorPaneId).toBeUndefined();
    });
  });

  it("closing the last pane in a tab closes the tab too, without double-counting", () => {
    const model = new SessionModel();
    const { tab, pane, workspace } = model.createWorkspace("/home/u", "api", init);
    model.createTab(workspace.id, "second", init); // 2 つ目の tab を作っておく（workspace は残る）

    const result = model.closePane(pane.id);
    expect(result.removedPaneIds).toEqual([pane.id]); // 二重カウントしない
    expect(result.removedTabIds).toEqual([tab.id]);
    expect(result.closedWorkspaceId).toBeNull();
    expect(model.getTab(tab.id)).toBeUndefined();
    expect(model.getWorkspace(workspace.id)?.tabIds).not.toContain(tab.id);
  });

  it("closing the last pane in the last tab closes the workspace (D18 cascade)", () => {
    const model = new SessionModel();
    const { pane, tab, workspace } = model.createWorkspace("/home/u", "api", init);
    const result = model.closePane(pane.id);
    expect(result.removedPaneIds).toEqual([pane.id]);
    expect(result.removedTabIds).toEqual([tab.id]);
    expect(result.closedWorkspaceId).toBe(workspace.id);
    expect(model.getWorkspace(workspace.id)).toBeUndefined();
    expect(model.isEmpty()).toBe(true);
  });

  it("does not auto-create a workspace on its own when the last one closes (D24 is SessionService's job)", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    model.closePane(pane.id);
    expect(model.isEmpty()).toBe(true); // SessionModel はここで止まる。自動作成は SessionService.closePane が行う
  });

  it("closing a whole tab removes all of its panes", () => {
    const model = new SessionModel();
    const { tab, pane, workspace } = model.createWorkspace("/home/u", "api", init);
    const newPaneId = model.reserveNextPaneId();
    model.splitPane(pane.id, "right", undefined, newPaneId, init);
    model.createTab(workspace.id, "second", init); // avoid cascading to workspace close

    const result = model.closeTab(tab.id);
    expect(result.removedPaneIds.sort()).toEqual([pane.id, newPaneId].sort());
    expect(model.getPane(pane.id)).toBeUndefined();
    expect(model.getPane(newPaneId)).toBeUndefined();
  });
});

describe("SessionModel — focus / navigation", () => {
  it("focusPane updates tab.focusedPaneId, workspace.activeTabId, and session focus", () => {
    const model = new SessionModel();
    const { workspace, pane: p1 } = model.createWorkspace("/home/u", "api", init);
    const { tab: t2, pane: p2 } = model.createTab(workspace.id, "logs", init);
    model.focusTab(model.getWorkspace(workspace.id)!.tabIds[0]!); // 戻って t1 を選ぶ
    model.focusPane(p2.id);
    expect(model.getTab(t2.id)?.focusedPaneId).toBe(p2.id);
    expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(t2.id);
    expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: t2.id, paneId: p2.id });
    void p1;
  });

  it("focusDirection moves to the neighbor and swapPane exchanges positions", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const newPaneId = model.reserveNextPaneId();
    const { pane: right } = model.splitPane(pane.id, "right", undefined, newPaneId, init);

    const moved = model.focusDirection(right.id, "left");
    expect(moved).toBe(pane.id);
    expect(model.getTab(tab.id)?.focusedPaneId).toBe(pane.id);

    const swappedWith = model.swapPane(pane.id, "right");
    expect(swappedWith).toBe(right.id);
    expect(model.getTab(tab.id)?.layout).toMatchObject({
      a: { paneId: right.id },
      b: { paneId: pane.id },
    });
  });

  // 20260923-pane-name-dnd-swap：任意の2つの pane を入れ替える（ドラッグでの入れ替え用。隣接不要）。
  describe("swapPaneWith", () => {
    it("同一 tab の2つの pane を入れ替える（隣接していなくてもよい）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      const { pane: right } = model.splitPane(pane.id, "right", undefined, p2, init);
      const p3 = model.reserveNextPaneId();
      model.splitPane(right.id, "down", undefined, p3, init);

      const ok = model.swapPaneWith(pane.id, p3);

      expect(ok).toBe(true);
      const layout = model.getTab(tab.id)?.layout;
      // a 側の葉が入れ替わっている（元は pane.id、今は p3）。
      expect(layout).toMatchObject({ a: { paneId: p3 } });
    });

    it("同じ pane 同士では何もしない", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getTab(tab.id)?.layout;

      expect(model.swapPaneWith(pane.id, pane.id)).toBe(false);
      expect(model.getTab(tab.id)?.layout).toEqual(before);
    });

    it("別 tab の pane とは入れ替えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const { pane: otherTabPane } = model.createWorkspace("/home/u", "other", init);

      expect(model.swapPaneWith(pane.id, otherTabPane.id)).toBe(false);
    });

    it("存在しない pane（相手側）とは入れ替えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);

      expect(model.swapPaneWith(pane.id, "p-nonexistent")).toBe(false);
    });

    // 20260925-pane-move-global-focus。「入れ替え前から既に paneId が focus だった」ケースでは
    // 更新が実際に起きたのか区別できないため、swap 前に**別の pane**へ明示的に focus を移してから、
    // その pane（otherPaneId 側）と入れ替えることで、focus が paneId（第1引数）へ動くことを確認する。
    it("成功すると、グローバル focus が入れ替えを要求した pane（paneId）を指す（AC1）", () => {
      const model = new SessionModel();
      const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);
      model.focusPane(pane.id); // focus を otherPaneId 側（pane.id）へ明示的に移しておく
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: pane.id });

      // p2（focus されていない側）を paneId 側に渡して入れ替える。
      const ok = model.swapPaneWith(p2, pane.id);

      expect(ok).toBe(true);
      // paneId（第1引数。ここでは p2）が新しい focus 先——otherPaneId（pane.id。直前まで focus）ではない。
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: p2 });
    });

    it("失敗（同じ pane 同士）では、グローバル focus を変えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getFocus();

      model.swapPaneWith(pane.id, pane.id);

      expect(model.getFocus()).toEqual(before);
    });
  });

  // 20260924-pane-dnd-split-move：ドラッグでの分割（縁へドロップ）。
  describe("moveToEdge", () => {
    it("縁が right/bottom なら既存の split と同じ並びになる（target=a, new=b）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);

      const ok = model.moveToEdge(p2, pane.id, "right");

      expect(ok).toBe(true);
      expect(model.getTab(tab.id)?.layout).toMatchObject({ dir: "right", a: { paneId: pane.id }, b: { paneId: p2 } });
    });

    it("縁が left/top なら a/b が入れ替わる（new=a, target=b）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);

      // p2 を pane の上端へ移す（元は右隣。now 上）。
      const ok = model.moveToEdge(p2, pane.id, "top");

      expect(ok).toBe(true);
      expect(model.getTab(tab.id)?.layout).toMatchObject({ dir: "down", a: { paneId: p2 }, b: { paneId: pane.id } });
    });

    it("元あった場所の split は畳まれる（3枚の木で確認）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      const { pane: right } = model.splitPane(pane.id, "right", undefined, p2, init);
      const p3 = model.reserveNextPaneId();
      model.splitPane(right.id, "down", undefined, p3, init);
      // layout: right(pane, down(p2, p3))

      model.moveToEdge(p3, pane.id, "left");

      // p3 を消した後の (p2, p3) split は p2 だけに畳まれる。トップレベルの split（s1）自体は残り、
      // その a 側（元は pane 単体だった場所）が「pane の左に p3」という新しい split に置き換わる。
      expect(model.getTab(tab.id)?.layout).toEqual({
        type: "split",
        id: expect.any(String),
        dir: "right",
        ratio: 0.5,
        a: {
          type: "split",
          id: expect.any(String),
          dir: "right",
          ratio: 0.5,
          a: { type: "pane", paneId: p3 },
          b: { type: "pane", paneId: pane.id },
        },
        b: { type: "pane", paneId: p2 },
      });
    });

    it("自分自身の縁へは何もしない", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getTab(tab.id)?.layout;

      expect(model.moveToEdge(pane.id, pane.id, "right")).toBe(false);
      expect(model.getTab(tab.id)?.layout).toEqual(before);
    });

    // 20260925-pane-move-global-focus。taskcheck の should 指摘：swapPaneWith には失敗パスで
    // focus が変わらないことを確認するテストがあったが、moveToEdge には対称なテストが無かった
    // （T1 taskcheck round1）。
    it("失敗（自分自身の縁）では、グローバル focus を変えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getFocus();

      model.moveToEdge(pane.id, pane.id, "right");

      expect(model.getFocus()).toEqual(before);
    });

    it("別 tab の pane へは動かさない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const { pane: otherTabPane } = model.createWorkspace("/home/u", "other", init);

      expect(model.moveToEdge(pane.id, otherTabPane.id, "right")).toBe(false);
    });

    // 20260925-pane-move-global-focus。swapPaneWith と同じ理由で、事前に別の pane へ focus を
    // 移してから確認する（さもないと「元々 paneId が focus だった」ケースと区別できない）。
    it("成功すると、グローバル focus が動かした pane（paneId）を指す（AC2）", () => {
      const model = new SessionModel();
      const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);
      model.focusPane(pane.id); // focus を targetPaneId 側（pane.id）へ明示的に移しておく
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: pane.id });

      const ok = model.moveToEdge(p2, pane.id, "top");

      expect(ok).toBe(true);
      // paneId（第1引数。ここでは p2）が新しい focus 先——targetPaneId（pane.id）ではない。
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: p2 });
    });
  });

  // 20260924-pane-dnd-split-move：ドラッグでの分割解除（中央へドロップ）。research.md F5。
  describe("replacePane", () => {
    it("ドロップ先を閉じ、ドラッグした pane がその位置とスペースを引き継ぐ", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      const { pane: right } = model.splitPane(pane.id, "right", undefined, p2, init);
      const p3 = model.reserveNextPaneId();
      model.splitPane(right.id, "down", undefined, p3, init);
      // layout: right(pane, down(p2, p3))

      const result = model.replacePane(pane.id, p3);

      expect(result?.removedPaneIds).toEqual([p3]);
      // pane が p3 の旧位置（down split の b 側）を引き継ぎ、p2 が隣に残る。
      // pane の旧位置（右分割の a 側）は畳まれ、p2 が昇格する。
      expect(model.getTab(tab.id)?.layout).toEqual({
        type: "split",
        id: expect.any(String),
        dir: "down",
        ratio: 0.5,
        a: { type: "pane", paneId: p2 },
        b: { type: "pane", paneId: pane.id },
      });
      expect(model.getPane(p3)).toBeUndefined(); // レイアウトからだけでなく pane 一覧からも消える
    });

    // 20260925-pane-replace-focus-hint。
    it("戻り値の successorPaneId は生存した pane（ドラッグした pane）を指す（AC2）", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);

      const result = model.replacePane(pane.id, p2);

      expect(result?.successorPaneId).toBe(pane.id); // p2（削除される側）ではなく pane.id（生存）
    });

    it("両側で split が畳まれる（2 pane だけの tab でも成立する。research.md F5）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);

      const result = model.replacePane(pane.id, p2);

      expect(result?.removedPaneIds).toEqual([p2]);
      expect(model.getTab(tab.id)?.layout).toEqual({ type: "pane", paneId: pane.id });
    });

    it("ドロップ先が focus 中だったら、生き残った pane に focus が移る", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init); // splitPane は新しい pane (p2) を focus する
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p2);

      model.replacePane(pane.id, p2);

      expect(model.getTab(tab.id)?.focusedPaneId).toBe(pane.id);
    });

    it("ドロップ先が zoom 中でも zoom を解除する（closePane と同じ。D100）", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);
      model.zoomPane(p2, "on");

      model.replacePane(pane.id, p2);

      expect(model.getTab(tab.id)?.zoomedPaneId).toBeNull();
    });

    it("自分自身では何もしない", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getTab(tab.id)?.layout;

      expect(model.replacePane(pane.id, pane.id)).toBeNull();
      expect(model.getTab(tab.id)?.layout).toEqual(before);
    });

    // 20260925-pane-move-global-focus。cross-task check の should 指摘：swapPaneWith・
    // moveToEdge には失敗パスで focus が変わらないことを確認するテストがあったが、
    // replacePane・moveToTab・moveToNewTab には対称なテストが無かった（cross round1）。
    it("失敗（自分自身）では、グローバル focus を変えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getFocus();

      model.replacePane(pane.id, pane.id);

      expect(model.getFocus()).toEqual(before);
    });

    it("別 tab の pane とは何もしない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const { pane: otherTabPane } = model.createWorkspace("/home/u", "other", init);

      expect(model.replacePane(pane.id, otherTabPane.id)).toBeNull();
    });

    // 20260925-pane-move-global-focus。
    it("ドロップ先が focus 中だったとき、グローバル focus も生き残った pane（paneId）を指す（AC3）", () => {
      const model = new SessionModel();
      const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init); // splitPane は p2 を focus する
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: p2 });

      model.replacePane(pane.id, p2);

      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: pane.id });
    });

    // 既存の条件付き setFocus（削除された pane が tab のローカル focus だった場合のみ）から
    // 無条件呼び出しへ変えたことの本体——ここが taskcheck の負の確認の対象（decisions.md D2）。
    // 削除対象（targetPaneId）が tab のローカル focus ではない第3の pane を用意し、
    // 「救済」条件（`tab.focusedPaneId === targetPaneId`）に当たらないケースを作る。
    it("ドロップ先が tab のローカル focus 中でなくても、グローバル focus は生き残った pane（paneId）を指す（AC3）", () => {
      const model = new SessionModel();
      const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      const { pane: right } = model.splitPane(pane.id, "right", undefined, p2, init);
      const p3 = model.reserveNextPaneId();
      model.splitPane(right.id, "down", undefined, p3, init); // layout: right(pane, down(p2, p3))
      model.focusPane(p3); // tab のローカル focus を第3の pane（p3）へ
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p3);

      // pane（生存）が p2（削除対象。tab のローカル focus ではない）を置き換える。
      const ok = model.replacePane(pane.id, p2);

      expect(ok).not.toBeNull();
      // tab のローカル focus は変わらない（`tab.focusedPaneId`（p3）は `targetPaneId`（p2）
      // ではないため、既存の「救済」条件には当たらない——旧実装ではここで setFocus が
      // 一度も呼ばれなかった）。
      expect(model.getTab(tab.id)?.focusedPaneId).toBe(p3);
      // それでもグローバル focus は生き残った pane（paneId）を指す（無条件呼び出しに変えた効果）。
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: tab.id, paneId: pane.id });
    });
  });

  // 20260924-pane-move-cross-tab：ドラッグで tab バーの tab へ移動。
  describe("moveToTab", () => {
    it("対象 tab の focus 中の pane の右へ split で加わる", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
      const { tab: otherTab, pane: otherPane } = model.createTab(workspace.id, "logs", init);

      const ok = model.moveToTab(pane.id, otherTab.id);

      expect(ok).toBe(true);
      expect(model.getTab(otherTab.id)?.layout).toMatchObject({ dir: "right", a: { paneId: otherPane.id }, b: { paneId: pane.id } });
      expect(model.getPane(pane.id)?.tabId).toBe(otherTab.id); // pane.tabId が書き換わる
      expect(model.getTab(otherTab.id)?.focusedPaneId).toBe(pane.id); // AC8: 移動先で focus される
    });

    it("移動元の tab に他の pane が残っていれば、そこの split は畳まれるだけで tab 自体は残る", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);
      const { tab: otherTab } = model.createTab(workspace.id, "logs", init);

      model.moveToTab(p2, otherTab.id);

      expect(model.getTab(sourceTab.id)?.layout).toEqual({ type: "pane", paneId: pane.id });
      expect(model.getWorkspace(workspace.id)?.tabIds).toContain(sourceTab.id); // tab 自体は残る
    });

    it("移動元の tab が空になったら自動的に閉じる（pane は消えない）", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      const { tab: otherTab } = model.createTab(workspace.id, "logs", init);

      const ok = model.moveToTab(pane.id, otherTab.id);

      expect(ok).toBe(true);
      expect(model.getTab(sourceTab.id)).toBeUndefined(); // 空になった tab は閉じる
      expect(model.getWorkspace(workspace.id)?.tabIds).not.toContain(sourceTab.id);
      expect(model.getPane(pane.id)).toBeDefined(); // pane 自体は消えない（closeTabInternal の落とし穴の回帰）
      expect(model.getPane(pane.id)?.tabId).toBe(otherTab.id);
    });

    it("自分自身の tab へは何もしない", () => {
      const model = new SessionModel();
      const { tab, pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getTab(tab.id)?.layout;

      expect(model.moveToTab(pane.id, tab.id)).toBe(false);
      expect(model.getTab(tab.id)?.layout).toEqual(before);
    });

    // 20260925-pane-move-global-focus。cross-task check の should 指摘（cross round1）。
    it("失敗（自分自身の tab）では、グローバル focus を変えない", () => {
      const model = new SessionModel();
      const { pane, tab } = model.createWorkspace("/home/u", "api", init);
      const before = model.getFocus();

      model.moveToTab(pane.id, tab.id);

      expect(model.getFocus()).toEqual(before);
    });

    it("存在しない tab へは何もしない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);

      expect(model.moveToTab(pane.id, "t-nonexistent")).toBe(false);
    });

    it("移動先 tab の zoom は解除される（D100）", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
      const { tab: otherTab, pane: otherPane } = model.createTab(workspace.id, "logs", init);
      model.zoomPane(otherPane.id, "on");

      model.moveToTab(pane.id, otherTab.id);

      expect(model.getTab(otherTab.id)?.zoomedPaneId).toBeNull();
    });

    // 20260925-pane-move-global-focus。
    it("成功すると、グローバル focus が移動先の tab・pane を指す（AC4）", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
      const { tab: otherTab } = model.createTab(workspace.id, "logs", init);

      const ok = model.moveToTab(pane.id, otherTab.id);

      expect(ok).toBe(true);
      expect(model.getFocus()).toEqual({ workspaceId: workspace.id, tabId: otherTab.id, paneId: pane.id });
    });

    // design「依拠する既存の事実」の実機確認どおり: 移動元 tab が移動元 workspace の
    // activeTabId だった状態で空になり closeEmptyTabShell が発火しても、その内部の「救済」
    // （移動元側の新しい active tab へ setFocus）に上書きされず、移動先を指したままであること
    // を確認する（AC4）。
    it("移動元 tab が移動元 workspace の active tab のまま空になり自動的に閉じても、グローバル focus は移動先を指す（AC4）", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      model.createTab(workspace.id, "logs", init); // 移動元 workspace が cascade で消えないようにしておく
      model.focusTab(sourceTab.id); // otherTab の作成で active が移っているので、sourceTab を再び active に戻す
      const { tab: otherWsTab, workspace: otherWs } = model.createWorkspace("/home/u/other", "other", init);
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(sourceTab.id);

      const ok = model.moveToTab(pane.id, otherWsTab.id);

      expect(ok).toBe(true);
      expect(model.getTab(sourceTab.id)).toBeUndefined(); // 空になった移動元 tab は閉じる（closeEmptyTabShell 発火）
      expect(model.getFocus()).toEqual({ workspaceId: otherWs.id, tabId: otherWsTab.id, paneId: pane.id });
    });
  });

  // 20260924-pane-move-cross-tab：ドラッグでサイドバーの workspace 行へ移動。
  describe("moveToNewTab", () => {
    it("対象 workspace に新しい tab を作り、pane を運ぶ", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const { workspace: otherWs } = model.createWorkspace("/home/u", "other", init);

      const result = model.moveToNewTab(pane.id, otherWs.id);

      expect(result).not.toBeNull();
      expect(result?.tab.workspaceId).toBe(otherWs.id);
      expect(result?.tab.layout).toEqual({ type: "pane", paneId: pane.id });
      expect(model.getPane(pane.id)?.tabId).toBe(result?.tab.id);
      expect(model.getWorkspace(otherWs.id)?.tabIds).toContain(result?.tab.id);
      expect(model.getWorkspace(otherWs.id)?.activeTabId).toBe(result?.tab.id); // 新しい tab を表示中にする
    });

    it("移動元の tab が空になったら自動的に閉じる（pane は消えない。移動元 workspace には他の tab を残しておく）", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      model.createTab(workspace.id, "logs", init); // 移動元 workspace が cascade で消えないようにしておく
      const { workspace: otherWs } = model.createWorkspace("/home/u", "other", init);

      model.moveToNewTab(pane.id, otherWs.id);

      expect(model.getTab(sourceTab.id)).toBeUndefined();
      expect(model.getWorkspace(workspace.id)?.tabIds).not.toContain(sourceTab.id);
      expect(model.getPane(pane.id)).toBeDefined();
    });

    it("同一 workspace への移動（新しい tab へ切り出す）も有効な操作として許容する", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
      const p2 = model.reserveNextPaneId();
      model.splitPane(pane.id, "right", undefined, p2, init);

      const result = model.moveToNewTab(p2, workspace.id);

      expect(result).not.toBeNull();
      expect(model.getWorkspace(workspace.id)?.tabIds.length).toBe(2); // 元の tab ＋ 新しい tab
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(result?.tab.id);
    });

    // taskcheck 指摘（should）：この work が存在する理由そのもの（research.md R1）に最も近い、
    // 「移動元 tab がその1枚だけの pane を失って空になり、かつ移動先が同じ workspace」という
    // 組み合わせが、上のテストでは（p2 が唯一の pane ではないため）実際には通っていなかった。
    it("同一 workspace 内で、移動元 tab がその1枚だけの pane を失っても正しく畳まれる（他の tab は残る）", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      // 移動元 workspace が cascade で消えないよう、あらかじめ他の tab を作っておく。
      model.createTab(workspace.id, "logs", init);

      const result = model.moveToNewTab(pane.id, workspace.id);

      expect(result).not.toBeNull();
      expect(model.getTab(sourceTab.id)).toBeUndefined(); // 空になった元の tab は閉じる
      expect(model.getWorkspace(workspace.id)?.tabIds).not.toContain(sourceTab.id);
      expect(model.getWorkspace(workspace.id)?.tabIds).toContain(result?.tab.id);
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(result?.tab.id); // 上書きされていない
      expect(model.getPane(pane.id)).toBeDefined();
      expect(model.getPane(pane.id)?.tabId).toBe(result?.tab.id);
    });

    it("存在しない workspace へは何もしない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);

      expect(model.moveToNewTab(pane.id, "w-nonexistent")).toBeNull();
    });

    // 20260925-pane-move-global-focus。cross-task check の should 指摘（cross round1）。
    it("失敗（存在しない workspace）では、グローバル focus を変えない", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const before = model.getFocus();

      model.moveToNewTab(pane.id, "w-nonexistent");

      expect(model.getFocus()).toEqual(before);
    });

    it("移動元の workspace も空になれば連鎖して閉じる（既存の D18 規則。closeTabInternal と同じ）", () => {
      const model = new SessionModel();
      const { workspace, pane } = model.createWorkspace("/home/u", "api", init); // tab 1つ・pane 1つだけ
      const { workspace: otherWs } = model.createWorkspace("/home/u", "other", init);

      model.moveToNewTab(pane.id, otherWs.id);

      expect(model.getWorkspace(workspace.id)).toBeUndefined();
    });

    // 20260925-pane-move-global-focus。
    it("成功すると、グローバル focus が移動先の新しい tab・pane を指す（AC5）", () => {
      const model = new SessionModel();
      const { pane } = model.createWorkspace("/home/u", "api", init);
      const { workspace: otherWs } = model.createWorkspace("/home/u", "other", init);

      const result = model.moveToNewTab(pane.id, otherWs.id);

      expect(result).not.toBeNull();
      expect(model.getFocus()).toEqual({ workspaceId: otherWs.id, tabId: result?.tab.id, paneId: pane.id });
    });

    // design「依拠する既存の事実」の実機確認どおりの再現: cross-workspace かつ移動元 tab が
    // 移動元 workspace の activeTabId だった状態で空になり closeEmptyTabShell が発火する
    // ケース。旧実装では setFocus（移動先）が closeEmptyTabShell より前に呼ばれていたため、
    // closeEmptyTabShell 内の「救済」（移動元側の新しい active tab へ setFocus）に上書き
    // されていた（decisions.md 参照）。
    it("移動元 tab が移動元 workspace の active tab のまま空になり自動的に閉じても、グローバル focus は移動先を指す（AC5）", () => {
      const model = new SessionModel();
      const { workspace, tab: sourceTab, pane } = model.createWorkspace("/home/u", "api", init);
      model.createTab(workspace.id, "logs", init); // 移動元 workspace が cascade で消えないようにしておく
      model.focusTab(sourceTab.id); // otherTab の作成で active が移っているので、sourceTab を再び active に戻す
      const { workspace: otherWs } = model.createWorkspace("/home/u/other", "other", init);
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(sourceTab.id);

      const result = model.moveToNewTab(pane.id, otherWs.id);

      expect(result).not.toBeNull();
      expect(model.getTab(sourceTab.id)).toBeUndefined(); // 空になった移動元 tab は閉じる（closeEmptyTabShell 発火）
      expect(model.getFocus()).toEqual({ workspaceId: otherWs.id, tabId: result?.tab.id, paneId: pane.id });
    });
  });

  it("cyclePane focuses the next pane in depth-first order, wrapping at the ends", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    const p2 = model.reserveNextPaneId();
    model.splitPane(pane.id, "right", undefined, p2, init);
    const next = model.cyclePane(pane.id, 1);
    expect(next).toBe(p2);
    const wrapped = model.cyclePane(p2, 1);
    expect(wrapped).toBe(pane.id);
  });

  it("zoomPane toggles the zoomed pane id", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    model.zoomPane(pane.id, "toggle");
    expect(model.getTab(tab.id)?.zoomedPaneId).toBe(pane.id);
    model.zoomPane(pane.id, "toggle");
    expect(model.getTab(tab.id)?.zoomedPaneId).toBeNull();
  });

  it("zoom 中に分割すると zoom を解除する（herdr の split_pane_with_runtime と同じ。D100）", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const p2 = model.reserveNextPaneId();
    model.splitPane(pane.id, "right", undefined, p2, init);
    model.zoomPane(pane.id, "on");
    const p3 = model.reserveNextPaneId();
    model.splitPane(pane.id, "down", undefined, p3, init);
    expect(model.getTab(tab.id)?.zoomedPaneId).toBeNull();
    expect(model.getTab(tab.id)?.focusedPaneId).toBe(p3);

    // zoom 中の pane とは別の pane を分割しても解除する。
    model.zoomPane(pane.id, "on");
    const p4 = model.reserveNextPaneId();
    model.splitPane(p2, "down", undefined, p4, init);
    expect(model.getTab(tab.id)?.zoomedPaneId).toBeNull();
  });

  it("zoom 中にどの pane を閉じても zoom を解除する（herdr の detach_pane と同じ。D100）", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const p2 = model.reserveNextPaneId();
    model.splitPane(pane.id, "right", undefined, p2, init);
    const p3 = model.reserveNextPaneId();
    model.splitPane(p2, "down", undefined, p3, init);
    model.zoomPane(pane.id, "on");
    model.closePane(p3); // zoom 中の pane とは別の pane を閉じた
    expect(model.getTab(tab.id)?.zoomedPaneId).toBeNull();
  });
});

describe("SessionModel — misc mutations", () => {
  it("setWorkspaceTokens / setPaneTokens は置き換えで更新し、null で項目ごと除く（20260927-sidebar-row-tokens）", () => {
    const model = new SessionModel();
    const { workspace, pane } = model.createWorkspace("/home/u", "api", init);
    const ws1 = model.setWorkspaceTokens(workspace.id, { a: "1" });
    expect(ws1).not.toBe(workspace);
    expect("tokens" in workspace).toBe(false); // 元のオブジェクトは変えない
    expect(model.getWorkspace(workspace.id)?.tokens).toEqual({ a: "1" });
    const ws2 = model.setWorkspaceTokens(workspace.id, null);
    expect("tokens" in ws2).toBe(false);
    expect(ws1.tokens).toEqual({ a: "1" });
    const p1 = model.setPaneTokens(pane.id, { b: "2" });
    expect(model.getPane(pane.id)?.tokens).toEqual({ b: "2" });
    expect("tokens" in model.setPaneTokens(pane.id, null)).toBe(false);
    expect(p1.tokens).toEqual({ b: "2" });
    expect(() => model.setWorkspaceTokens("w999", null)).toThrow(NotFoundError);
    expect(() => model.setPaneTokens("p999", null)).toThrow(NotFoundError);
  });

  it("renamePane / renameTab / renameWorkspace update the label", () => {
    const model = new SessionModel();
    const { workspace, tab, pane } = model.createWorkspace("/home/u", "api", init);
    model.renamePane(pane.id, "reviewer");
    model.renameTab(tab.id, "agents");
    model.renameWorkspace(workspace.id, "renamed", false);
    expect(model.getPane(pane.id)?.label).toBe("reviewer");
    expect(model.getTab(tab.id)?.label).toBe("agents");
    expect(model.getWorkspace(workspace.id)?.label).toBe("renamed");
  });

  // 20260923-missing-keybinding-actions（move_tab_previous/move_tab_next 相当）。
  describe("moveTab", () => {
    it("single tab: no-op (returns null)", () => {
      const model = new SessionModel();
      const { workspace, tab } = model.createWorkspace("/home/u", "api", init);
      expect(model.moveTab(tab.id, "next")).toBeNull();
      expect(model.getWorkspace(workspace.id)?.tabIds).toEqual([tab.id]);
    });

    it("swaps the target tab with its neighbor toward the front/back", () => {
      const model = new SessionModel();
      const { workspace, tab: t1 } = model.createWorkspace("/home/u", "api", init);
      const { tab: t2 } = model.createTab(workspace.id, "b", init);
      const { tab: t3 } = model.createTab(workspace.id, "c", init);
      expect(model.getWorkspace(workspace.id)?.tabIds).toEqual([t1.id, t2.id, t3.id]);

      const afterNext = model.moveTab(t2.id, "next");
      expect(afterNext?.tabIds).toEqual([t1.id, t3.id, t2.id]);

      const afterPrevious = model.moveTab(t2.id, "previous");
      expect(afterPrevious?.tabIds).toEqual([t1.id, t2.id, t3.id]);
    });

    it("wraps around at the ends (first tab 'previous' goes to the back, last tab 'next' goes to the front)", () => {
      const model = new SessionModel();
      const { workspace, tab: t1 } = model.createWorkspace("/home/u", "api", init);
      const { tab: t2 } = model.createTab(workspace.id, "b", init);
      const { tab: t3 } = model.createTab(workspace.id, "c", init);
      expect(model.getWorkspace(workspace.id)?.tabIds).toEqual([t1.id, t2.id, t3.id]);

      // 先頭の t1 を「前へ」→ 末尾へ（herdr の remove+insert と同じ。単純な隣接swapではない。decisions D10）。
      expect(model.moveTab(t1.id, "previous")?.tabIds).toEqual([t2.id, t3.id, t1.id]);
      // 末尾に移った t1 を「後ろへ」→ 先頭へ戻る（境界の巡回が対称であることの確認）。
      expect(model.moveTab(t1.id, "next")?.tabIds).toEqual([t1.id, t2.id, t3.id]);
    });

    it("does not change activeTabId (references are by id, not position)", () => {
      const model = new SessionModel();
      const { workspace, tab: t1 } = model.createWorkspace("/home/u", "api", init);
      model.createTab(workspace.id, "b", init); // activeTabId は新しい tab（createTab の既存の流儀）へ移る
      model.focusTab(t1.id); // activeTabId を t1 に戻してから確かめる
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(t1.id);
      model.moveTab(t1.id, "next");
      expect(model.getWorkspace(workspace.id)?.activeTabId).toBe(t1.id);
    });

    it("throws NotFoundError for an unknown tab id", () => {
      const model = new SessionModel();
      expect(() => model.moveTab("t99", "next")).toThrow(NotFoundError);
    });
  });

  // 20260923-workspace-grouping。
  describe("groups", () => {
    it("createGroup / renameGroup / toggleGroupCollapsed / deleteGroup", () => {
      const model = new SessionModel();
      const group = model.createGroup("backend");
      expect(group).toEqual({ id: "g1", label: "backend", collapsed: false });
      expect(model.listGroups()).toEqual([group]);

      const renamed = model.renameGroup(group.id, "frontend");
      expect(renamed.label).toBe("frontend");

      expect(model.toggleGroupCollapsed(group.id).collapsed).toBe(true);
      expect(model.toggleGroupCollapsed(group.id).collapsed).toBe(false); // もう一度で戻る

      model.deleteGroup(group.id);
      expect(model.getGroup(group.id)).toBeUndefined();
      expect(model.listGroups()).toEqual([]);
    });

    it("addToGroup / removeFromGroup set and clear Workspace.groupId", () => {
      const model = new SessionModel();
      const { workspace } = model.createWorkspace("/home/u", "api", init);
      const group = model.createGroup("backend");
      expect(model.addToGroup(workspace.id, group.id).groupId).toBe(group.id);
      expect(model.getWorkspace(workspace.id)?.groupId).toBe(group.id);
      expect(model.removeFromGroup(workspace.id).groupId).toBeNull();
      expect(model.getWorkspace(workspace.id)?.groupId).toBeNull();
    });

    it("deleteGroup clears groupId on every member, but leaves the workspace itself", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      const group = model.createGroup("backend");
      model.addToGroup(w1.id, group.id);
      model.addToGroup(w2.id, group.id);
      model.deleteGroup(group.id);
      expect(model.getWorkspace(w1.id)?.groupId).toBeNull();
      expect(model.getWorkspace(w2.id)?.groupId).toBeNull();
      expect(model.getWorkspace(w1.id)).not.toBeUndefined(); // workspace 自体は消えない
    });

    it("addToGroup/renameGroup/toggleGroupCollapsed/deleteGroup throw NotFoundError for an unknown group", () => {
      const model = new SessionModel();
      const { workspace } = model.createWorkspace("/home/u", "api", init);
      expect(() => model.addToGroup(workspace.id, "g99")).toThrow(NotFoundError);
      expect(() => model.renameGroup("g99", "x")).toThrow(NotFoundError);
      expect(() => model.toggleGroupCollapsed("g99")).toThrow(NotFoundError);
      expect(() => model.deleteGroup("g99")).toThrow(NotFoundError);
    });

    it("restoreGroup rebuilds a group with its saved id (no new id is allocated)", () => {
      const model = new SessionModel();
      model.restoreGroup({ id: "g7", label: "restored", collapsed: true });
      expect(model.getGroup("g7")).toEqual({ id: "g7", label: "restored", collapsed: true });
    });
  });

  // 20260923-workspace-grouping。20261004-group-worktree-items で、項目の `item.move_by` へ委ねる形（端で巡回しない）。
  describe("moveWorkspace", () => {
    it("single workspace: nothing moves (false)", () => {
      const model = new SessionModel();
      const { workspace } = model.createWorkspace("/home/u", "api", init);
      expect(model.moveWorkspace(workspace.id, "next")).toBe(false);
    });

    it("does not wrap around at the ends (false, order unchanged)", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      const { workspace: w3 } = model.createWorkspace("/c", "c", init);
      expect(model.moveWorkspace(w1.id, "previous")).toBe(false);
      expect(model.moveWorkspace(w3.id, "next")).toBe(false);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w1.id, w2.id, w3.id]);
    });

    it("swaps with the neighbour inside", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      const { workspace: w3 } = model.createWorkspace("/c", "c", init);
      expect(model.moveWorkspace(w2.id, "next")).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w1.id, w3.id, w2.id]);
    });

    it("throws NotFoundError for an unknown workspace id", () => {
      const model = new SessionModel();
      expect(() => model.moveWorkspace("w99", "next")).toThrow(NotFoundError);
    });
  });

  // 20260923-workspace-grouping（D&D。anchor 指定）。項目の動きへの読み替えの (a)(b)(c) は「item moves」の describe。
  describe("moveWorkspacesTo", () => {
    it("moves a single workspace before another (anchor)", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      const { workspace: w3 } = model.createWorkspace("/c", "c", init);
      expect(model.moveWorkspacesTo([w3.id], w1.id)).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w3.id, w1.id, w2.id]);
    });

    it("moves a block of items together, preserving their relative order", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      const { workspace: w3 } = model.createWorkspace("/c", "c", init);
      const { workspace: w4 } = model.createWorkspace("/d", "d", init);
      // w1・w3 を w4 の前へまとめて動かす → 相対順序（w1 の方が w3 より前）は保たれる。
      expect(model.moveWorkspacesTo([w3.id, w1.id], w4.id)).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w2.id, w1.id, w3.id, w4.id]);
    });

    it("null beforeWorkspaceId moves to the end", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      expect(model.moveWorkspacesTo([w1.id], null)).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w2.id, w1.id]);
    });

    it("returns false when beforeWorkspaceId is itself one of the ids being moved (no-op)", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      const { workspace: w2 } = model.createWorkspace("/b", "b", init);
      expect(model.moveWorkspacesTo([w1.id, w2.id], w2.id)).toBe(false);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([w1.id, w2.id]); // 変化していない
    });

    it("throws NotFoundError for an unknown id in workspaceIds or beforeWorkspaceId", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/a", "a", init);
      expect(() => model.moveWorkspacesTo(["w99"], w1.id)).toThrow(NotFoundError);
      expect(() => model.moveWorkspacesTo([w1.id], "w99")).toThrow(NotFoundError);
    });
  });

  // 20260923-workspace-grouping（一括クローズの対象を求める純粋な問い合わせ）。
  describe("linkedWorktreeGroupMembers", () => {
    it("returns the other linked-worktree ids sharing the same repoKey when id is the main checkout", () => {
      const model = new SessionModel();
      const { workspace: main } = model.createWorkspace("/repo", "main", init);
      const { workspace: wt1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      const { workspace: wt2 } = model.createWorkspace("/repo-wt2", "wt2", init);
      model.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      model.updateWorkspaceGit(wt1.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      model.updateWorkspaceGit(wt2.id, { kind: "git", git: { branch: "other", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      expect(new Set(model.linkedWorktreeGroupMembers(main.id))).toEqual(new Set([wt1.id, wt2.id]));
    });

    it("returns [] when id is itself a linked worktree (not the parent)", () => {
      const model = new SessionModel();
      const { workspace: wt1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      model.updateWorkspaceGit(wt1.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      expect(model.linkedWorktreeGroupMembers(wt1.id)).toEqual([]);
    });

    it("returns [] when the workspace has no git info at all", () => {
      const model = new SessionModel();
      const { workspace } = model.createWorkspace("/plain", "plain", init);
      expect(model.linkedWorktreeGroupMembers(workspace.id)).toEqual([]);
    });

    it("returns [] when the workspace is the main checkout of a repo with no linked worktrees", () => {
      const model = new SessionModel();
      const { workspace } = model.createWorkspace("/repo", "repo", init);
      model.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      expect(model.linkedWorktreeGroupMembers(workspace.id)).toEqual([]);
    });

    // cross-check の指摘：クライアント側 `workspaceGrouping.ts` の `autoGroupsOf` と同じ判定に
    // 揃える（以前はここだけ `groupId` を見ておらず、`ConfirmDialog` の表示件数とサーバが実際に
    // 閉じる件数が食い違っていた）。
    it("excludes workspaces that are in a manual group (手動グループ優先。decisions D2)", () => {
      const model = new SessionModel();
      const { workspace: main } = model.createWorkspace("/repo", "main", init);
      const { workspace: wt1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      const { workspace: wt2 } = model.createWorkspace("/repo-wt2", "wt2", init);
      model.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      model.updateWorkspaceGit(wt1.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      model.updateWorkspaceGit(wt2.id, { kind: "git", git: { branch: "other", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      const group = model.createGroup("backend");
      model.addToGroup(wt2.id, group.id); // 項目（リポジトリ）丸ごとグループへ入る（20261004-group-worktree-items）。T19 でこの関数ごと消える
      expect(model.linkedWorktreeGroupMembers(main.id)).toEqual([]); // 本体もグループに入ったので束ねない（古い判定のまま）
    });

    it("returns [] when the main checkout itself is in a manual group", () => {
      const model = new SessionModel();
      const { workspace: main } = model.createWorkspace("/repo", "main", init);
      const { workspace: wt1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      model.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      model.updateWorkspaceGit(wt1.id, { kind: "git", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      const group = model.createGroup("backend");
      model.addToGroup(main.id, group.id);
      expect(model.linkedWorktreeGroupMembers(main.id)).toEqual([]);
    });

    // GitInfoPoller の周期の谷間で本体がまだ見つからない（全員 isLinkedWorktree===true）ケース。
    // クライアント側の暫定親フォールバックと同じ判定をサーバ側でも行う（cross-check の指摘）。
    it("falls back to the first candidate as the tentative parent when no explicit main checkout is present", () => {
      const model = new SessionModel();
      const { workspace: w1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      const { workspace: w2 } = model.createWorkspace("/repo-wt2", "wt2", init);
      model.updateWorkspaceGit(w1.id, { kind: "git", git: { branch: "a", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      model.updateWorkspaceGit(w2.id, { kind: "git", git: { branch: "b", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      expect(model.linkedWorktreeGroupMembers(w1.id)).toEqual([w2.id]); // w1（先頭）が暫定的な親
      expect(model.linkedWorktreeGroupMembers(w2.id)).toEqual([]); // w2 は親ではない
    });

    // cross-check round2 の指摘：本体が手動グループに入っていて候補から外れているだけなら、
    // 「候補の中に本体が無い」を理由に別の linked worktree を暫定親にしてはいけない
    // （client 側 `autoGroupsOf` と同じガード。`main` 自身への問い合わせは既に別のテストで
    // カバー済み——ここでは `main` 以外〔候補に残る linked worktree 側〕への問い合わせを確かめる）。
    it("does not fall back to a tentative parent among linked worktrees when the real main checkout exists elsewhere (in a manual group)", () => {
      const model = new SessionModel();
      const { workspace: main } = model.createWorkspace("/repo", "main", init);
      const { workspace: wt1 } = model.createWorkspace("/repo-wt1", "wt1", init);
      const { workspace: wt2 } = model.createWorkspace("/repo-wt2", "wt2", init);
      model.updateWorkspaceGit(main.id, { kind: "git", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: false } });
      model.updateWorkspaceGit(wt1.id, { kind: "git", git: { branch: "a", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      model.updateWorkspaceGit(wt2.id, { kind: "git", git: { branch: "b", ahead: 0, behind: 0, repoKey: "/repo/.git", isLinkedWorktree: true } });
      const group = model.createGroup("backend");
      model.addToGroup(main.id, group.id); // 本体だけ手動グループに入る（wt1・wt2 は groupId===null のまま）
      // wt1・wt2 は候補に残るが、候補の中に本体が無い——本体は「実在するが候補から外れている」だけ
      // なので、wt1・wt2 のどちらかを暫定親にしてはいけない。
      expect(model.linkedWorktreeGroupMembers(wt1.id)).toEqual([]);
      expect(model.linkedWorktreeGroupMembers(wt2.id)).toEqual([]);
    });
  });

  // 20260921-workspace-auto-label：以前は workspace の名前に印が無く、どれも付けた名前と同じ扱いだった。
  it("autoLabel は作成・名前変更・復元で呼ぶ側が決めたとおりに入る", () => {
    const model = new SessionModel();
    const auto = model.createWorkspace("/r", "r", init, true).workspace;
    const named = model.createWorkspace("/s", "mine", init).workspace;
    expect([auto.autoLabel, named.autoLabel], "一括版の既定は付けた名前").toEqual([true, false]);
    expect(model.renameWorkspace(auto.id, "fixed", false).autoLabel).toBe(false);
    expect(model.renameWorkspace(named.id, "s", true)).toMatchObject({
      label: "s",
      autoLabel: true,
    });

    const restored = new SessionModel();
    const data = {
      id: "w9",
      label: "x",
      cwd: "/x",
      activeTabId: "t9",
      tabs: [
        {
          id: "t9",
          label: "1",
          focusedPaneId: "p9",
          zoomedPaneId: null,
          layout: { type: "pane" as const, paneId: "p9" },
          panes: [{ id: "p9", label: null, cwd: "/x", shell: "/bin/sh" }],
        },
      ],
    };
    restored.restoreWorkspace(data, true);
    expect(restored.getWorkspace("w9")?.autoLabel).toBe(true);
    const named2 = new SessionModel();
    named2.restoreWorkspace({ ...data, id: "w8" }, false);
    expect(named2.getWorkspace("w8")?.autoLabel, "付けた名前として復元").toBe(false);
  });

  it("setRightClick and updatePaneRuntime patch only the given fields", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    model.setRightClick(pane.id, "pane");
    expect(model.getPane(pane.id)?.rightClick).toBe("pane");

    model.updatePaneRuntime(pane.id, { busy: true });
    expect(model.getPane(pane.id)?.busy).toBe(true);
    expect(model.getPane(pane.id)?.cwd).toBe(init.cwd); // 触れていない欄は変わらない

    model.updatePaneRuntime(pane.id, { cwd: "/new/dir" });
    expect(model.getPane(pane.id)?.busy).toBe(true); // 前の busy は保たれる
    expect(model.getPane(pane.id)?.cwd).toBe("/new/dir");
  });

  it("updatePaneRuntime can explicitly clear the agent to null", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    const agent = {
      instanceId: "a1",
      kind: "claude",
      label: "Claude Code",
      state: "working" as const,
      completionSeq: 0,
      serverSeenSeq: 0,
      verified: true,
      since: Date.now(),
    };
    model.updatePaneRuntime(pane.id, { agent });
    expect(model.getPane(pane.id)?.agent).toEqual(agent);
    model.updatePaneRuntime(pane.id, { agent: null });
    expect(model.getPane(pane.id)?.agent).toBeNull();
  });

  it("markPaneFailed sets status and failure", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    model.markPaneFailed(pane.id, "shell not found");
    expect(model.getPane(pane.id)).toMatchObject({ status: "failed", failure: "shell not found" });
  });

  it("updateWorkspaceGit sets the git info", () => {
    const model = new SessionModel();
    const { workspace } = model.createWorkspace("/home/u", "api", init);
    model.updateWorkspaceGit(workspace.id, { kind: "git", git: { branch: "main", ahead: 1, behind: 0, repoKey: "/home/u/.git", isLinkedWorktree: false } });
    expect(model.getWorkspace(workspace.id)?.git).toEqual({ branch: "main", ahead: 1, behind: 0, repoKey: "/home/u/.git", isLinkedWorktree: false });
  });

  it("setSplitRatio and resizeByDirection change the layout ratio", () => {
    const model = new SessionModel();
    const { tab, pane } = model.createWorkspace("/home/u", "api", init);
    const p2 = model.reserveNextPaneId();
    model.splitPane(pane.id, "right", undefined, p2, init);
    const splitId = (model.getTab(tab.id)!.layout as { id: string }).id;
    model.setSplitRatio(tab.id, splitId, 0.8);
    expect(model.getTab(tab.id)?.layout).toMatchObject({ ratio: 0.8 });
    model.resizeByDirection(pane.id, "left", 0.1);
    const layout = model.getTab(tab.id)?.layout as { ratio: number };
    expect(layout.ratio).toBeCloseTo(0.7, 10);
  });

  it("setPaneSize updates cols/rows", () => {
    const model = new SessionModel();
    const { pane } = model.createWorkspace("/home/u", "api", init);
    model.setPaneSize(pane.id, 120, 40);
    expect(model.getPane(pane.id)).toMatchObject({ cols: 120, rows: 40 });
  });
});

describe("SessionModel — snapshot and id counters", () => {
  it("buildSnapshot reflects all workspaces/tabs/panes and the focus", () => {
    const model = new SessionModel();
    const { workspace } = model.createWorkspace("/home/u", "api", init);
    const snapshot = model.buildSnapshot("0.1.0", { os: "linux", windowsBuild: null, hostname: "h" }, { scrollbackLines: 5000 });
    expect(snapshot.protocol).toBe(1);
    expect(snapshot.workspaces.map((w) => w.id)).toEqual([workspace.id]);
    expect(snapshot.tabs.length).toBe(1);
    expect(snapshot.panes.length).toBe(1);
    expect(snapshot.focus).toEqual(model.getFocus());
  });

  it("setNextIdCounters lets restore continue numbering without collisions", () => {
    const model = new SessionModel();
    model.setNextIdCounters({ w: 5, t: 5, p: 5, s: 5, a: 5, g: 5 });
    const { workspace } = model.createWorkspace("/home/u", "api", init);
    expect(workspace.id).toBe("w5");
    expect(model.getNextIdCounters().w).toBe(6);
  });
});

// 20261004-group-worktree-items（サイドバーの項目の並び。T5）。
describe("SessionModel — sidebar layout", () => {
  const gitOf = (repoKey: string, isLinkedWorktree: boolean): GitInfo => ({ branch: "b", ahead: 0, behind: 0, repoKey, isLinkedWorktree });

  /** a・b が同じリポジトリ K（a が本体）、c が管理外。レイアウトは確定済み（`r:K` と `w:c` が一番上）。 */
  function repoModel(): { model: SessionModel; a: string; b: string; c: string } {
    const model = new SessionModel();
    const { workspace: a } = model.createWorkspace("/repo", "a", init);
    const { workspace: b } = model.createWorkspace("/repo-wt", "b", init);
    const { workspace: c } = model.createWorkspace("/plain", "c", init);
    model.updateWorkspaceGit(a.id, { kind: "git", git: gitOf("/repo/.git", false) });
    model.updateWorkspaceGit(b.id, { kind: "git", git: gitOf("/repo/.git", true) });
    return { model, a: a.id, b: b.id, c: c.id };
  }

  it("addToGroup on a workspace whose judgment arrived puts the repository item (r:) in the group, with no w:<id> left", () => {
    const model = new SessionModel();
    const { workspace: a } = model.createWorkspace("/a", "a", init);
    model.confirmLayout();
    const group = model.createGroup("g");
    model.updateWorkspaceGit(a.id, { kind: "git", git: gitOf("/a/.git", false) });
    model.addToGroup(a.id, group.id);
    expect(model.getLayout()).toEqual({ top: [`g:${group.id}`], groups: { [group.id]: ["r:/a/.git"] }, ungrouped: [] });
  });

  it("a new workspace goes to the end of the top level as w:<id>, and the snapshot carries the layout", () => {
    const model = new SessionModel();
    const { workspace: a } = model.createWorkspace("/a", "a", init);
    const { workspace: b } = model.createWorkspace("/b", "b", init);
    expect(model.getLayout()).toEqual({ top: [`w:${a.id}`, `w:${b.id}`], groups: {}, ungrouped: [] });
    const snapshot = model.buildSnapshot("0.1.0", { os: "linux", windowsBuild: null, hostname: "h" }, { scrollbackLines: 5000 });
    expect(snapshot.layout).toEqual(model.getLayout());
  });

  describe("a workspace that disappears leaves the layout through every path", () => {
    it("closeWorkspace", () => {
      const model = new SessionModel();
      const { workspace: a } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      model.takeChanges();
      model.closeWorkspace(a.id);
      expect(model.getLayout().top).toEqual([`w:${b.id}`]);
      expect(model.takeChanges()?.layout).toEqual({ top: [`w:${b.id}`], groups: {}, ungrouped: [] });
    });

    it("closeTab on the last tab", () => {
      const model = new SessionModel();
      const { workspace: a, tab } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      model.takeChanges();
      model.closeTab(tab.id);
      expect(model.getLayout().top).toEqual([`w:${b.id}`]);
      expect(model.getWorkspace(a.id)).toBeUndefined();
    });

    it("closePane on the last pane", () => {
      const model = new SessionModel();
      const { workspace: a, pane } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      model.takeChanges();
      model.closePane(pane.id);
      expect(model.getLayout().top).toEqual([`w:${b.id}`]);
      expect(model.getWorkspace(a.id)).toBeUndefined();
    });

    it("moveToTab that empties the source workspace", () => {
      const model = new SessionModel();
      const { workspace: a, pane } = model.createWorkspace("/a", "a", init);
      const { workspace: b, tab: bTab } = model.createWorkspace("/b", "b", init);
      model.takeChanges();
      model.moveToTab(pane.id, bTab.id);
      expect(model.getLayout().top).toEqual([`w:${b.id}`]);
      expect(model.getWorkspace(a.id)).toBeUndefined();
    });

    it("moveToNewTab that empties the source workspace", () => {
      const model = new SessionModel();
      const { workspace: a, pane } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      model.takeChanges();
      model.moveToNewTab(pane.id, b.id);
      expect(model.getLayout().top).toEqual([`w:${b.id}`]);
      expect(model.getWorkspace(a.id)).toBeUndefined();
    });

    it("a workspace inside a group leaves the group's list too", () => {
      const model = new SessionModel();
      const { workspace: a } = model.createWorkspace("/a", "a", init);
      const group = model.createGroup("g");
      model.addToGroup(a.id, group.id);
      expect(model.getLayout().groups[group.id]).toEqual([`w:${a.id}`]);
      model.closeWorkspace(a.id);
      expect(model.getLayout().groups[group.id]).toEqual([]);
      expect(model.getLayout().top).toEqual([`g:${group.id}`]);
    });

    it("a repository item stays until its last workspace is gone; repoGroups is kept", () => {
      const { model, a, b } = repoModel();
      const group = model.createGroup("g");
      model.addToGroup(a, group.id);
      expect(model.getLayout().groups[group.id]).toEqual(["r:/repo/.git"]);
      model.closeWorkspace(a);
      expect(model.getLayout().groups[group.id]).toEqual(["r:/repo/.git"]); // b が残っている
      model.closeWorkspace(b);
      expect(model.getLayout().groups[group.id]).toEqual([]);
      expect(model.getRepoGroups().get("/repo/.git")).toBe(group.id); // 開いていないリポジトリの所属は覚えておく
    });
  });

  describe("groups work on whole items", () => {
    it("createGroup appends the group to the end of the top level when there is no target", () => {
      const { model } = repoModel();
      const group = model.createGroup("g");
      expect(model.getLayout().top.at(-1)).toBe(`g:${group.id}`);
      expect(model.getLayout().groups[group.id]).toEqual([]);
    });

    it("createGroup with a top-level item target puts the group at its position and the item inside", () => {
      const { model, a, c } = repoModel();
      const group = model.createGroup("g", a);
      expect(model.getLayout()).toEqual({ top: [`g:${group.id}`, `w:${c}`], groups: { [group.id]: ["r:/repo/.git"] }, ungrouped: [] });
      expect(model.getRepoGroups().get("/repo/.git")).toBe(group.id);
    });

    it("createGroup with a target inside group G puts the new group right after G and moves the item", () => {
      const { model, a, c } = repoModel();
      const g1 = model.createGroup("g1", a);
      model.addToGroup(c, g1.id);
      const g2 = model.createGroup("g2", c);
      expect(model.getLayout()).toEqual({
        top: [`g:${g1.id}`, `g:${g2.id}`],
        groups: { [g1.id]: ["r:/repo/.git"], [g2.id]: [`w:${c}`] },
        ungrouped: [],
      });
      expect(model.getWorkspace(c)?.groupId).toBe(g2.id);
    });

    it("addToGroup moves the whole repository item: every member gets the group, and the flat order follows the layout", () => {
      const { model, a, b, c } = repoModel();
      const g = model.createGroup("g");
      model.addToGroup(c, g.id);
      model.addToGroup(b, g.id); // 子の workspace を指しても項目（リポジトリ）丸ごと
      expect(model.getLayout().groups[g.id]).toEqual([`w:${c}`, "r:/repo/.git"]);
      expect(model.getWorkspace(a)?.groupId).toBe(g.id);
      expect(model.getWorkspace(b)?.groupId).toBe(g.id);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([c, a, b]); // グループの中の順（本体が先頭）
    });

    it("addToGroup moves an item from one group to another", () => {
      const { model, a } = repoModel();
      const g1 = model.createGroup("g1", a);
      const g2 = model.createGroup("g2");
      model.addToGroup(a, g2.id);
      expect(model.getLayout().groups).toEqual({ [g1.id]: [], [g2.id]: ["r:/repo/.git"] });
      expect(model.getRepoGroups().get("/repo/.git")).toBe(g2.id);
    });

    it("removeFromGroup puts the item right after its group at the top level and clears the membership", () => {
      const { model, a, b, c } = repoModel();
      const g = model.createGroup("g", a);
      model.removeFromGroup(b); // 子を指しても項目全体
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`, "r:/repo/.git", `w:${c}`], groups: { [g.id]: [] }, ungrouped: [] });
      expect(model.getWorkspace(a)?.groupId).toBeNull();
      expect(model.getWorkspace(b)?.groupId).toBeNull();
      expect(model.getRepoGroups().has("/repo/.git")).toBe(false);
    });

    it("deleteGroup puts the items back where the group was, and drops the repoGroups rows for it", () => {
      const { model, a, c } = repoModel();
      const g = model.createGroup("g", a);
      model.addToGroup(c, g.id);
      model.deleteGroup(g.id);
      expect(model.getLayout()).toEqual({ top: ["r:/repo/.git", `w:${c}`], groups: {}, ungrouped: [] });
      expect(model.getRepoGroups().size).toBe(0);
      expect(model.getWorkspace(a)?.groupId).toBeNull();
      expect(model.getWorkspace(c)?.groupId).toBeNull();
    });

    it("createGroup with an unknown target throws NotFoundError and changes nothing", () => {
      const model = new SessionModel();
      expect(() => model.createGroup("g", "w99")).toThrow(NotFoundError);
      expect(model.listGroups()).toEqual([]);
    });
  });

  describe("takeChanges", () => {
    it("reports the workspaces whose group changed, the new layout and the new flat order — once", () => {
      const model = new SessionModel();
      const { workspace: a } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      const g = model.createGroup("g");
      model.takeChanges();
      model.addToGroup(b.id, g.id);
      const changes = model.takeChanges();
      expect(changes?.updated.map((w) => w.id)).toEqual([b.id]);
      expect(changes?.layout).toEqual({ top: [`w:${a.id}`, `g:${g.id}`], groups: { [g.id]: [`w:${b.id}`] }, ungrouped: [] });
      expect(model.takeChanges()).toBeNull(); // 取ったら消える
    });

    it("reports the flat order when the layout moves workspaces", () => {
      const model = new SessionModel();
      const { workspace: a } = model.createWorkspace("/a", "a", init);
      const { workspace: b } = model.createWorkspace("/b", "b", init);
      const g = model.createGroup("g", a.id);
      model.takeChanges();
      model.addToGroup(b.id, g.id);
      expect(model.takeChanges()?.order).toBeNull(); // [a, b] のまま
      model.removeFromGroup(a.id); // a はグループの直後へ出るので、グループに残る b の後ろに並ぶ
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([b.id, a.id]);
      expect(model.takeChanges()?.order).toEqual([b.id, a.id]);
    });

    it("is null when nothing changed, and does not count a created workspace as an update", () => {
      const model = new SessionModel();
      model.createWorkspace("/a", "a", init);
      const created = model.takeChanges();
      expect(created?.updated).toEqual([]);
      expect(created?.order).toBeNull();
      expect(model.takeChanges()).toBeNull();
    });
  });

  // design「レイアウトが変わる場面」の判定の行（T6）。
  describe("judgments are reflected in the layout", () => {
    const K = "/k/.git";
    const git = (repoKey: string | null, linked = false): GitJudgement => ({ kind: "git", git: gitOf(repoKey as string, linked) });
    const open = (model: SessionModel, name: string) => model.createWorkspace(`/${name}`, name, init).workspace;

    it("a judgment turns w:<id> into r:<repoKey> in the same place", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      const c = open(model, "c");
      model.updateWorkspaceGit(b.id, git(K));
      expect(model.getLayout()).toEqual({ top: [`w:${a.id}`, `r:${K}`, `w:${c.id}`], groups: {}, ungrouped: [] });
      expect(model.getWorkspace(b.id)?.groupId).toBeNull();
    });

    it("(3) a second workspace of the same repository joins the existing r:<repoKey>, and the Map order follows the item (body first)", () => {
      const model = new SessionModel();
      const wt = open(model, "wt");
      const other = open(model, "other");
      const body = open(model, "body");
      model.updateWorkspaceGit(wt.id, git(K, true));
      model.takeChanges();
      model.updateWorkspaceGit(body.id, git(K, false));
      expect(model.getLayout()).toEqual({ top: [`r:${K}`, `w:${other.id}`], groups: {}, ungrouped: [] });
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([body.id, wt.id, other.id]);
      expect(model.takeChanges()?.order).toEqual([body.id, wt.id, other.id]);
    });

    it("(2) a workspace in a group hands the repository over: repoGroups is set and the whole item moves to that group", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K, false)); // r:K は一番上
      const g = model.createGroup("g", b.id); // b は管理外のままグループへ
      model.updateWorkspaceGit(b.id, git(K, true));
      expect([...model.getRepoGroups()]).toEqual([[K, g.id]]);
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: [`r:${K}`] }, ungrouped: [] });
      expect(model.getWorkspace(a.id)?.groupId).toBe(g.id);
      expect(model.getWorkspace(b.id)?.groupId).toBe(g.id);
    });

    it("(2) without another member, w:<id> is replaced in place inside the group", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      const g = model.createGroup("g", a.id);
      model.addToGroup(b.id, g.id);
      model.updateWorkspaceGit(a.id, git(K));
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: [`r:${K}`, `w:${b.id}`] }, ungrouped: [] });
      expect([...model.getRepoGroups()]).toEqual([[K, g.id]]);
    });

    it("(1) repoGroups is looked at first: a new workspace of a remembered repository goes to its group (at the end when r:<repoKey> is absent)", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      model.updateWorkspaceGit(a.id, git(K));
      const g = model.createGroup("g", a.id);
      model.closeWorkspace(a.id); // r:K は消えるが repoGroups[K] は残る
      const x = open(model, "x");
      model.addToGroup(x.id, g.id);
      const b = open(model, "b");
      model.updateWorkspaceGit(b.id, git(K, true));
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: [`w:${x.id}`, `r:${K}`] }, ungrouped: [] });
      expect(model.getWorkspace(b.id)?.groupId).toBe(g.id);
    });

    it("(1) wins over the workspace's own groupId (the repository's group is the answer)", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K));
      const g1 = model.createGroup("g1", a.id);
      const g2 = model.createGroup("g2", b.id);
      model.updateWorkspaceGit(b.id, git(K, true));
      expect(model.getWorkspace(b.id)?.groupId).toBe(g1.id);
      expect(model.getLayout()).toEqual({ top: [`g:${g1.id}`, `g:${g2.id}`], groups: { [g1.id]: [`r:${K}`], [g2.id]: [] }, ungrouped: [] });
    });

    it.each([
      ["a first", 0],
      ["b first", 1],
    ])("the result does not depend on the order the judgments arrive (%s)", (_name, flip) => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      const g = model.createGroup("g", a.id);
      const order = flip === 0 ? [a, b] : [b, a];
      for (const w of order) model.updateWorkspaceGit(w.id, git(K, w.id === b.id));
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: [`r:${K}`] }, ungrouped: [] });
      expect(model.getWorkspace(a.id)?.groupId).toBe(g.id);
      expect(model.getWorkspace(b.id)?.groupId).toBe(g.id);
      expect([...model.getRepoGroups()]).toEqual([[K, g.id]]);
    });

    it("a changed judgment (R1 -> R2): leaves R1 (removed when empty, repoGroups kept) and, with nothing known about R2, goes right after the original top unit", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const c = open(model, "c");
      model.updateWorkspaceGit(a.id, git("/r1/.git"));
      const g = model.createGroup("g", a.id);
      model.updateWorkspaceGit(a.id, git("/r2/.git"));
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`, "r:/r2/.git", `w:${c.id}`], groups: { [g.id]: [] }, ungrouped: [] });
      expect(model.getRepoGroups().get("/r1/.git")).toBe(g.id);
      expect(model.getWorkspace(a.id)?.groupId).toBeNull();
    });

    it("a changed judgment: joins an existing r:R2, or follows repoGroups[R2]", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      const c = open(model, "c");
      model.updateWorkspaceGit(a.id, git("/r1/.git"));
      model.updateWorkspaceGit(b.id, git("/r2/.git"));
      model.updateWorkspaceGit(a.id, git("/r2/.git"));
      expect(model.getLayout().top).toEqual(["r:/r2/.git", `w:${c.id}`]);
      // R2 が記憶されたグループへ
      const g = model.createGroup("g", b.id);
      model.updateWorkspaceGit(c.id, git("/r3/.git"));
      model.updateWorkspaceGit(c.id, git("/r2/.git")); // 既にグループの中の r:R2 に加わる
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: ["r:/r2/.git"] }, ungrouped: [] });
      model.closeWorkspace(a.id);
      model.closeWorkspace(b.id);
      model.closeWorkspace(c.id);
      const d = open(model, "d");
      model.updateWorkspaceGit(d.id, git("/r4/.git"));
      model.updateWorkspaceGit(d.id, git("/r2/.git")); // r:R2 は無いが repoGroups[R2] = g
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: ["r:/r2/.git"] }, ungrouped: [] });
    });

    it("R1 stays while other members remain", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K));
      model.updateWorkspaceGit(b.id, git(K, true));
      model.updateWorkspaceGit(b.id, git("/other/.git"));
      expect(model.getLayout().top).toEqual([`r:${K}`, "r:/other/.git"]);
    });

    it("unmanaged (R1 -> none): w:<id> goes right after r:R1 in the same container, and groupId is that group", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K));
      model.updateWorkspaceGit(b.id, git(K, true));
      const g = model.createGroup("g", a.id);
      model.updateWorkspaceGit(b.id, { kind: "unmanaged" });
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`], groups: { [g.id]: [`r:${K}`, `w:${b.id}`] }, ungrouped: [] });
      expect(model.getWorkspace(b.id)).toMatchObject({ git: null, groupId: g.id });
      expect(model.getWorkspace(a.id)?.groupId).toBe(g.id);
    });

    it("unmanaged on the only member replaces r:R1 in place (repoGroups kept)", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K));
      const g = model.createGroup("g", a.id);
      model.updateWorkspaceGit(a.id, { kind: "unmanaged" });
      expect(model.getLayout()).toEqual({ top: [`g:${g.id}`, `w:${b.id}`], groups: { [g.id]: [`w:${a.id}`] }, ungrouped: [] });
      expect(model.getRepoGroups().get(K)).toBe(g.id);
    });

    it("unknown changes nothing: git, the layout and the pending changes stay", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      model.updateWorkspaceGit(a.id, git(K));
      model.takeChanges();
      const before = model.getLayout();
      expect(model.updateWorkspaceGit(a.id, { kind: "unknown" })).toBeNull();
      expect(model.getWorkspace(a.id)?.git?.repoKey).toBe(K);
      expect(model.getLayout()).toEqual(before);
      expect(model.takeChanges()).toBeNull();
    });

    it("isLinkedWorktree changing re-sorts the Map and reports the order, with the layout unchanged", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      const b = open(model, "b");
      model.updateWorkspaceGit(a.id, git(K, true));
      model.updateWorkspaceGit(b.id, git(K, true)); // 本体が無い: 開いた順
      model.takeChanges();
      model.updateWorkspaceGit(b.id, git(K, false)); // b が本体になる
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([b.id, a.id]);
      const changes = model.takeChanges();
      expect(changes?.order).toEqual([b.id, a.id]);
      expect(changes?.layout).toBeNull();
    });

    it("a branch-only change touches neither the layout nor the pending changes", () => {
      const model = new SessionModel();
      const a = open(model, "a");
      model.updateWorkspaceGit(a.id, git(K));
      model.takeChanges();
      model.updateWorkspaceGit(a.id, { kind: "git", git: { ...gitOf(K, false), branch: "other" } });
      expect(model.getWorkspace(a.id)?.git?.branch).toBe("other");
      expect(model.takeChanges()).toBeNull();
    });
  });

  describe("the provisional state (a restore without a layout)", () => {
    const wsData = (id: string, groupId?: string) =>
      ({
        id,
        label: id,
        cwd: "/x",
        activeTabId: `t-${id}`,
        ...(groupId ? { groupId } : {}),
        tabs: [{ id: `t-${id}`, label: "1", layout: { type: "pane" as const, paneId: `p-${id}` }, focusedPaneId: `p-${id}`, zoomedPaneId: null, panes: [{ id: `p-${id}`, label: null, cwd: "/x", shell: "sh" }] }],
      }) as never;

    it("derives the layout from the flat order and groupId until it is confirmed", () => {
      const model = new SessionModel();
      model.setNextIdCounters({ w: 3, t: 3, p: 3, s: 1, a: 1, g: 2 });
      model.restoreGroup({ id: "g1", label: "g", collapsed: false });
      model.restoreWorkspace(wsData("w1"), false);
      model.restoreWorkspace(wsData("w2", "g1"), false);
      expect(model.hasLayout()).toBe(false);
      expect(model.getLayout()).toEqual({ top: ["w:w1", "g:g1"], groups: { g1: ["w:w2"] }, ungrouped: [] });
      model.createWorkspace("/n", "n", init); // 仮の状態のまま作っても、導いた結果に入る
      expect(model.hasLayout()).toBe(false);
      expect(model.getLayout().top).toContain("w:w3");
    });

    it("confirmLayout fixes the derived layout once, and writes the repository memberships to repoGroups", () => {
      const model = new SessionModel();
      model.restoreGroup({ id: "g1", label: "g", collapsed: false });
      model.restoreWorkspace(wsData("w1", "g1"), false);
      model.updateWorkspaceGit("w1", { kind: "git", git: gitOf("/r/.git", false) });
      model.confirmLayout();
      expect(model.hasLayout()).toBe(true);
      expect(model.getLayout()).toEqual({ top: ["g:g1"], groups: { g1: ["r:/r/.git"] }, ungrouped: [] });
      expect([...model.getRepoGroups()]).toEqual([["/r/.git", "g1"]]);
      model.confirmLayout(); // 2 回目は何もしない
      expect(model.getLayout()).toEqual({ top: ["g:g1"], groups: { g1: ["r:/r/.git"] }, ungrouped: [] });
    });

    it("a mutating operation confirms first", () => {
      const model = new SessionModel();
      model.restoreWorkspace(wsData("w1"), false);
      const g = model.createGroup("new");
      expect(model.hasLayout()).toBe(true);
      expect(model.getLayout()).toEqual({ top: ["w:w1", `g:${g.id}`], groups: { [g.id]: [] }, ungrouped: [] });
    });

    it("in the provisional state the layout is not written, but the derived layout changes are reported", () => {
      const model = new SessionModel();
      model.restoreWorkspace(wsData("w1"), false);
      model.restoreWorkspace(wsData("w2"), false);
      model.updateWorkspaceGit("w1", { kind: "git", git: gitOf("/r/.git", false) });
      model.updateWorkspaceGit("w2", { kind: "git", git: gitOf("/r/.git", true) });
      expect(model.hasLayout()).toBe(false);
      expect(model.getRepoGroups().size).toBe(0);
      expect(model.getLayout()).toEqual({ top: [`r:/r/.git`], groups: {}, ungrouped: [] });
      expect(model.takeChanges()?.layout).toEqual({ top: [`r:/r/.git`], groups: {}, ungrouped: [] });
    });
  });
});

// 20261004-group-worktree-items（T8。項目の並べ替えと、古い `workspace.move_to` の読み替え）。
describe("SessionModel — item moves", () => {
  const gitOf = (repoKey: string, isLinkedWorktree: boolean): GitInfo => ({ branch: "b", ahead: 0, behind: 0, repoKey, isLinkedWorktree });

  /** a・b が同じリポジトリ K（a が本体）、c・d・e が管理外。一番上は `r:K`・`w:c`・`w:d`・`w:e`。 */
  function setup(): { model: SessionModel; a: string; b: string; c: string; d: string; e: string } {
    const model = new SessionModel();
    const { workspace: a } = model.createWorkspace("/repo", "a", init);
    const { workspace: b } = model.createWorkspace("/repo-wt", "b", init);
    const { workspace: c } = model.createWorkspace("/c", "c", init);
    const { workspace: d } = model.createWorkspace("/d", "d", init);
    const { workspace: e } = model.createWorkspace("/e", "e", init);
    model.updateWorkspaceGit(a.id, { kind: "git", git: gitOf("/repo/.git", false) });
    model.updateWorkspaceGit(b.id, { kind: "git", git: gitOf("/repo/.git", true) });
    model.confirmLayout();
    return { model, a: a.id, b: b.id, c: c.id, d: d.id, e: e.id };
  }
  const ws = (workspaceId: string): { kind: "workspace"; workspaceId: string } => ({ kind: "workspace", workspaceId });
  const grp = (groupId: string): { kind: "group"; groupId: string } => ({ kind: "group", groupId });

  describe("moveItem / moveItemBy", () => {
    it("a worktree-group child moves the whole repository item", () => {
      const { model, a, b, c, d, e } = setup();
      expect(model.moveItem(ws(b), ws(d))).toBe(true);
      expect(model.getLayout().top).toEqual([`w:${c}`, "r:/repo/.git", `w:${d}`, `w:${e}`]);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([c, a, b, d, e]);
    });

    it("null before moves to the end of the container", () => {
      const { model, a, b, c, d, e } = setup();
      expect(model.moveItem(ws(a), null)).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([c, d, e, a, b]);
    });

    it("moveItemBy moves one item and does not wrap at the ends (false, nothing changes)", () => {
      const { model, a, b, c, d, e } = setup();
      expect(model.moveItemBy(ws(b), "previous")).toBe(false); // 先頭
      expect(model.moveItemBy(ws(e), "next")).toBe(false); // 末尾
      expect(model.moveItemBy(ws(a), "next")).toBe(true);
      expect(model.listWorkspaces().map((w) => w.id)).toEqual([c, a, b, d, e]);
    });

    it("a group moves as one item at the top, and cannot cross containers", () => {
      const { model, c, d } = setup();
      const g = model.createGroup("G", c); // c の位置にグループを置いて c を中へ
      expect(model.getLayout()).toEqual({ top: ["r:/repo/.git", `g:${g.id}`, `w:${d}`, expect.any(String)], groups: { [g.id]: [`w:${c}`] }, ungrouped: [] });
      expect(model.moveItemBy(grp(g.id), "previous")).toBe(true);
      expect(model.getLayout().top[0]).toBe(`g:${g.id}`);
      expect(model.moveItem(ws(c), ws(d))).toBe(false); // グループの中 → 一番上の項目の前: 入れ物が違う
      expect(model.moveItem(grp(g.id), grp(g.id))).toBe(false); // 自分自身の前
    });

    it("an item in a group moves only inside the group", () => {
      const { model, c, d } = setup();
      const g = model.createGroup("G");
      model.addToGroup(c, g.id);
      model.addToGroup(d, g.id);
      expect(model.moveItemBy(ws(d), "previous")).toBe(true);
      expect(model.getLayout().groups[g.id]).toEqual([`w:${d}`, `w:${c}`]);
      expect(model.moveItemBy(ws(d), "previous")).toBe(false);
    });

    it("an unknown workspace or group is NotFoundError", () => {
      const { model, a } = setup();
      expect(() => model.moveItem(ws("w99"), null)).toThrow(NotFoundError);
      expect(() => model.moveItem(ws(a), ws("w99"))).toThrow(NotFoundError);
      expect(() => model.moveItemBy(grp("g99"), "next")).toThrow(NotFoundError);
    });

    it("a rejected move changes nothing, and takeChanges reports nothing", () => {
      const { model, e } = setup();
      model.takeChanges();
      expect(model.moveItemBy(ws(e), "next")).toBe(false);
      expect(model.takeChanges()).toBeNull();
    });
  });

  describe("moveWorkspacesTo reads an old request as an item move", () => {
    it("(a) the whole worktree group (all of its workspaces) moves as one item, anchored on a head workspace", () => {
      const { model, a, b, c, d, e } = setup();
      expect(model.moveWorkspacesTo([a, b], d)).toBe(true);
      expect(model.getLayout().top).toEqual([`w:${c}`, "r:/repo/.git", `w:${d}`, `w:${e}`]);
    });

    it("(a) a plain workspace moves before the head of a worktree group, and to the end with null", () => {
      const { model, a, c, d, e } = setup();
      expect(model.moveWorkspacesTo([e], a)).toBe(true);
      expect(model.getLayout().top).toEqual([`w:${e}`, "r:/repo/.git", `w:${c}`, `w:${d}`]);
      expect(model.moveWorkspacesTo([e], null)).toBe(true);
      expect(model.getLayout().top.at(-1)).toBe(`w:${e}`);
    });

    it("(a) inside a group, items move among themselves", () => {
      const { model, a, c } = setup();
      const g = model.createGroup("G");
      model.addToGroup(a, g.id);
      model.addToGroup(c, g.id);
      expect(model.moveWorkspacesTo([c], a)).toBe(true);
      expect(model.getLayout().groups[g.id]).toEqual([`w:${c}`, "r:/repo/.git"]);
    });

    it("(c) only a part of a worktree group, or a non-head child as the anchor, changes nothing", () => {
      const { model, a, b, d, e } = setup();
      const before = model.getLayout();
      expect(model.moveWorkspacesTo([b], d)).toBe(false); // 一部だけ
      expect(model.moveWorkspacesTo([a], e)).toBe(false);
      expect(model.moveWorkspacesTo([d], b)).toBe(false); // 子は項目の先頭ではない
      expect(model.getLayout()).toEqual(before);
    });

    it("(b) all the effective members of a group move the group, before the head of a top item, the first member of another group, or the end", () => {
      const { model, a, b, c, d, e } = setup();
      const g = model.createGroup("G");
      model.addToGroup(a, g.id);
      model.addToGroup(c, g.id); // G = [r:K, w:c]（実効のメンバーは a・b・c）
      const h = model.createGroup("H");
      model.addToGroup(e, h.id);
      expect(model.getLayout().top).toEqual([`w:${d}`, `g:${g.id}`, `g:${h.id}`]);

      expect(model.moveWorkspacesTo([c, b, a], null)).toBe(true);
      expect(model.getLayout().top).toEqual([`w:${d}`, `g:${h.id}`, `g:${g.id}`]);
      expect(model.moveWorkspacesTo([a, b, c], d)).toBe(true);
      expect(model.getLayout().top).toEqual([`g:${g.id}`, `w:${d}`, `g:${h.id}`]);
      expect(model.moveWorkspacesTo([a, b, c], e)).toBe(true); // H の先頭メンバー = グループ H の前
      expect(model.getLayout().top).toEqual([`w:${d}`, `g:${g.id}`, `g:${h.id}`]);
    });

    it("(c) the members of a group plus an outside workspace, or the anchor inside the moved group, change nothing", () => {
      const { model, a, b, c, d } = setup();
      const g = model.createGroup("G");
      model.addToGroup(a, g.id);
      model.addToGroup(c, g.id);
      const before = model.getLayout();
      expect(model.moveWorkspacesTo([a, b, c, d], null)).toBe(false); // 外の項目が混ざる
      expect(model.moveWorkspacesTo([a, b, c], c)).toBe(false); // 落とし先が動かす対象自身
      expect(model.moveWorkspacesTo([c], d)).toBe(false); // グループの中から外の項目の前（入れ物をまたぐ）
      expect(model.getLayout()).toEqual(before);
    });
  });
});
