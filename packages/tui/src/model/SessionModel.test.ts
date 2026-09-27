import { describe, expect, it, vi } from "vitest";
import { agent, leaf, pane, snapshot, split, tab, workspace } from "../testing/fixtures.js";
import { SessionModel } from "./SessionModel.js";

describe("SessionModel: snapshot とイベントの適用（web の StoreAdapter と同じ規則）", () => {
  it("snapshot でサーバの焦点を表示する。再接続の snapshot では生きている表示をそのまま残す", () => {
    const m = new SessionModel();
    m.applySnapshot(snapshot(), "c1");
    expect(m.viewTarget()).toEqual({ workspaceId: "w1", tabId: "t1", focusedPaneId: "p1" });
    expect(m.clientId).toBe("c1");
    m.focusPane("p3");
    m.applySnapshot(snapshot(), "c2");
    expect(m.viewTarget()).toEqual({ workspaceId: "w2", tabId: "t2", focusedPaneId: "p3" });
    expect(m.clientId).toBe("c2");
  });

  it("サーバの焦点が無い snapshot は先頭の workspace を表示する", () => {
    const m = new SessionModel();
    m.applySnapshot(snapshot({ focus: null }), "c1");
    expect(m.workspaceId).toBe("w1");
    expect(m.focusedPaneId).toBe("p1");
  });

  it("構造のイベント（workspace・tab・pane・group）を反映し、変更を知らせる", () => {
    const m = new SessionModel();
    m.applySnapshot(snapshot(), "c1");
    const changed = vi.fn();
    m.onChange(changed);
    m.applyEvent({ event: "workspace.created", data: { workspace: workspace("w3", ["t3"]) } });
    m.applyEvent({ event: "tab.created", data: { tab: tab("t3", "w3", leaf("p4")) } });
    m.applyEvent({ event: "pane.created", data: { pane: pane("p4", "t3") } });
    m.applyEvent({
      event: "group.created",
      data: { group: { id: "g1", label: "G", collapsed: false } },
    });
    expect([...m.workspaces.keys()]).toEqual(["w1", "w2", "w3"]);
    expect(m.panes.has("p4")).toBe(true);
    expect(m.groups.get("g1")?.label).toBe("G");
    m.applyEvent({ event: "workspace.order_changed", data: { workspaceIds: ["w3", "w1"] } });
    expect([...m.workspaces.keys()]).toEqual(["w3", "w1", "w2"]);
    m.applyEvent({ event: "group.deleted", data: { groupId: "g1" } });
    expect(m.groups.size).toBe(0);
    expect(changed).toHaveBeenCalledTimes(6);
  });

  it("layout.updated・pane.size_changed・session.focus_changed を反映する（表示の焦点はサーバの焦点に従わない）", () => {
    const m = new SessionModel();
    m.applySnapshot(snapshot(), "c1");
    const t = tab("t1", "w1", split("down", leaf("p1"), leaf("p2")));
    m.applyEvent({ event: "layout.updated", data: { tab: t } });
    expect(m.tabs.get("t1")?.layout).toEqual(t.layout);
    m.applyEvent({ event: "pane.size_changed", data: { paneId: "p2", cols: 33, rows: 11 } });
    expect(m.panes.get("p2")).toMatchObject({ cols: 33, rows: 11 });
    m.applyEvent({
      event: "session.focus_changed",
      data: { focus: { workspaceId: "w2", tabId: "t2", paneId: "p3" } },
    });
    expect(m.focus?.paneId).toBe("p3");
    expect(m.focusedPaneId).toBe("p1");
  });

  it("焦点の pane が閉じたら後継（successorPaneId）へ、無ければ木の最初の葉へ移る", () => {
    const m = new SessionModel();
    const closed = vi.fn();
    const m2 = new SessionModel({ onPaneClosed: closed });
    m.applySnapshot(snapshot(), "c1");
    m.focusPane("p1");
    m.applyEvent({ event: "tab.updated", data: { tab: tab("t1", "w1", leaf("p2")) } });
    m.applyEvent({ event: "pane.closed", data: { paneId: "p1", successorPaneId: "p2" } });
    expect(m.focusedPaneId).toBe("p2");
    expect(m.lastFocusedPaneId).toBe("p1");

    m2.applySnapshot(snapshot(), "c1");
    m2.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    expect(closed).toHaveBeenCalledWith("p1");
    expect(m2.focusedPaneId).toBe("p2");
  });

  it("表示中の workspace が閉じたら残りの先頭へ移る", () => {
    const m = new SessionModel();
    m.applySnapshot(snapshot(), "c1");
    m.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    m.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    m.applyEvent({ event: "tab.closed", data: { tabId: "t1" } });
    m.applyEvent({ event: "workspace.closed", data: { workspaceId: "w1" } });
    expect(m.viewTarget()).toEqual({ workspaceId: "w2", tabId: "t2", focusedPaneId: "p3" });
  });

  it("エージェントの状態の変化は前の値つきで知らせ、done は手元の既読から導く（AC10）", () => {
    const changed = vi.fn();
    const m = new SessionModel({ onAgentChanged: changed });
    m.applySnapshot(snapshot(), "c1");
    const working = agent({ state: "working", completionSeq: 0 });
    m.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "p3", agent: working } });
    expect(changed).toHaveBeenLastCalledWith("p3", null, working);
    const idle = agent({ state: "idle", completionSeq: 1, serverSeenSeq: 0 });
    m.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "p3", agent: idle } });
    expect(changed).toHaveBeenLastCalledWith("p3", working, idle);
    expect(m.displayStateOf(m.panes.get("p3")!)).toBe("done");
    expect(m.workspaceState("w2")).toBe("done");

    // 見えていない・フォーカスの無い pane は既読にしない。
    expect(m.sweepSeen((id) => id === "p3", false)).toBe(false);
    expect(m.sweepSeen((id) => id === "p1", true)).toBe(false);
    expect(m.displayStateOf(m.panes.get("p3")!)).toBe("done");
    // 見えていてフォーカスがあれば既読（2 度目は何も変えない）。
    expect(m.sweepSeen((id) => id === "p3", true)).toBe(true);
    expect(m.sweepSeen((id) => id === "p3", true)).toBe(false);
    expect(m.displayStateOf(m.panes.get("p3")!)).toBe("idle");
  });

  it("prefs.changed・client.error・pane.exited はフックへ", () => {
    const hooks = { onPrefsChanged: vi.fn(), onClientError: vi.fn(), onPaneExited: vi.fn() };
    const m = new SessionModel(hooks);
    m.applySnapshot(snapshot(), "c1");
    m.applyEvent({
      event: "prefs.changed",
      data: { prefs: { theme: "nord" }, rev: 3, byClientId: "x" },
    });
    m.applyEvent({ event: "client.error", data: { code: "input_queue_full", message: "m" } });
    m.applyEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 2 } });
    expect(hooks.onPrefsChanged).toHaveBeenCalledWith({
      prefs: { theme: "nord" },
      rev: 3,
      byClientId: "x",
    });
    expect(hooks.onClientError).toHaveBeenCalledWith("input_queue_full", "m");
    expect(hooks.onPaneExited).toHaveBeenCalledWith("p1", 2);
  });

  it("サイズ権限は tab の sizeOwnerClientId と自分の clientId で決まる", () => {
    const m = new SessionModel();
    m.applySnapshot(
      snapshot({
        tabs: [
          tab("t1", "w1", leaf("p1"), { sizeOwnerClientId: "c1" }),
          tab("t2", "w2", leaf("p3")),
        ],
      }),
      "c1",
    );
    expect(m.hasSizeAuthority("t1")).toBe(true);
    expect(m.hasSizeAuthority("t2")).toBe(false);
  });
});
