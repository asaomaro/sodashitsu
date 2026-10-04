import type { Pane, SessionSnapshot, Tab, Workspace } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./session.js";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});

function makeWorkspace(id: string): Workspace {
  return { id, label: id, cwd: "/", tabIds: [], activeTabId: "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null };
}
function makePane(id: string, tabId: string): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null };
}
function makeSnapshot(): SessionSnapshot {
  return {
    protocol: 1,
    serverVersion: "test",
    host: { os: "linux", windowsBuild: null, hostname: "h" },
    workspaces: [makeWorkspace("w1")],
    tabs: [makeTab("t1", "w1")],
    panes: [makePane("p1", "t1")],
    groups: [],
    focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    limits: { scrollbackLines: 5000 },
  };
}

describe("useSessionStore", () => {
  it("applySnapshot: 構造・フォーカス・limits・host・clientId を反映する", () => {
    const store = useSessionStore(pinia);
    store.applySnapshot(makeSnapshot(), "c1");
    expect(store.workspaces.get("w1")?.label).toBe("w1");
    expect(store.tabs.get("t1")?.workspaceId).toBe("w1");
    expect(store.panes.get("p1")?.tabId).toBe("t1");
    expect(store.focus).toEqual({ workspaceId: "w1", tabId: "t1", paneId: "p1" });
    expect(store.limits).toEqual({ scrollbackLines: 5000 });
    expect(store.host?.hostname).toBe("h");
    expect(store.clientId).toBe("c1");
  });

  it("applySnapshot: 2 回目は前の内容を完全に置き換える", () => {
    const store = useSessionStore(pinia);
    store.applySnapshot(makeSnapshot(), "c1");
    store.applySnapshot({ ...makeSnapshot(), workspaces: [] }, "c1");
    expect(store.workspaces.size).toBe(0);
  });

  // 20260923-workspace-grouping。
  it("applySnapshot: groups を反映する", () => {
    const store = useSessionStore(pinia);
    store.applySnapshot({ ...makeSnapshot(), groups: [{ id: "g1", label: "backend", collapsed: false }] }, "c1");
    expect(store.groups.get("g1")).toEqual({ id: "g1", label: "backend", collapsed: false });
  });

  it("hasSizeAuthority: 自分の clientId が Tab.sizeOwnerClientId と一致するときだけ true", () => {
    const store = useSessionStore(pinia);
    store.applySnapshot(makeSnapshot(), "c1");
    store.tabUpserted({ ...makeTab("t1", "w1"), sizeOwnerClientId: "c1" });
    expect(store.hasSizeAuthority("t1")).toBe(true);
    store.tabUpserted({ ...makeTab("t1", "w1"), sizeOwnerClientId: "c2" });
    expect(store.hasSizeAuthority("t1")).toBe(false);
    store.tabUpserted({ ...makeTab("t1", "w1"), sizeOwnerClientId: null });
    expect(store.hasSizeAuthority("t1")).toBe(false);
    expect(store.hasSizeAuthority("ghost")).toBe(false);
  });

  it("workspaceUpserted/Closed", () => {
    const store = useSessionStore(pinia);
    store.workspaceUpserted(makeWorkspace("w1"));
    expect(store.workspaces.has("w1")).toBe(true);
    store.workspaceClosed("w1");
    expect(store.workspaces.has("w1")).toBe(false);
  });

  // 20260923-workspace-grouping（decisions.md D5）。`Map.set` は既存キーの位置を動かさないので、
  // 並び替えは専用のミューテーションで表す。
  describe("workspacesReordered", () => {
    it("並び替える（挿入順＝反復順）", () => {
      const store = useSessionStore(pinia);
      store.workspaceUpserted(makeWorkspace("w1"));
      store.workspaceUpserted(makeWorkspace("w2"));
      store.workspaceUpserted(makeWorkspace("w3"));
      store.workspacesReordered(["w3", "w1", "w2"]);
      expect([...store.workspaces.keys()]).toEqual(["w3", "w1", "w2"]);
    });

    it("イベントに含まれないローカルの id は末尾に残す（防御的）", () => {
      const store = useSessionStore(pinia);
      store.workspaceUpserted(makeWorkspace("w1"));
      store.workspaceUpserted(makeWorkspace("w2"));
      store.workspaceUpserted(makeWorkspace("w3"));
      store.workspacesReordered(["w2"]); // w1・w3 は言及されていない
      expect([...store.workspaces.keys()]).toEqual(["w2", "w1", "w3"]);
    });

    it("ローカルにまだ無い id（イベントの競合）は無視する", () => {
      const store = useSessionStore(pinia);
      store.workspaceUpserted(makeWorkspace("w1"));
      store.workspacesReordered(["w1", "w99"]); // w99 はまだローカルに無い
      expect([...store.workspaces.keys()]).toEqual(["w1"]);
    });
  });

  it("groupUpserted/Deleted", () => {
    const store = useSessionStore(pinia);
    store.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    expect(store.groups.get("g1")).toEqual({ id: "g1", label: "backend", collapsed: false });
    store.groupUpserted({ id: "g1", label: "backend", collapsed: true }); // update（同じ id）
    expect(store.groups.get("g1")?.collapsed).toBe(true);
    store.groupDeleted("g1");
    expect(store.groups.has("g1")).toBe(false);
  });

  it("tabUpserted/Closed", () => {
    const store = useSessionStore(pinia);
    store.tabUpserted(makeTab("t1", "w1"));
    expect(store.tabs.has("t1")).toBe(true);
    store.tabClosed("t1");
    expect(store.tabs.has("t1")).toBe(false);
  });

  it("paneUpserted/Closed", () => {
    const store = useSessionStore(pinia);
    store.paneUpserted(makePane("p1", "t1"));
    expect(store.panes.has("p1")).toBe(true);
    store.paneClosed("p1");
    expect(store.panes.has("p1")).toBe(false);
  });

  it("paneAgentStatusChanged: 既存の pane にだけ反映する", () => {
    const store = useSessionStore(pinia);
    store.paneUpserted(makePane("p1", "t1"));
    const agent = { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working" as const, completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0 };
    store.paneAgentStatusChanged("p1", agent);
    expect(store.panes.get("p1")?.agent).toEqual(agent);
    store.paneAgentStatusChanged("ghost", agent); // 存在しない pane は無視（例外を投げない）
  });

  it("paneSizeChanged: cols/rows だけを更新する", () => {
    const store = useSessionStore(pinia);
    store.paneUpserted(makePane("p1", "t1"));
    store.paneSizeChanged("p1", 120, 40);
    expect(store.panes.get("p1")).toMatchObject({ cols: 120, rows: 40 });
  });

  it("sessionFocusChanged", () => {
    const store = useSessionStore(pinia);
    store.sessionFocusChanged({ workspaceId: "w1", tabId: "t1", paneId: "p1" });
    expect(store.focus).toEqual({ workspaceId: "w1", tabId: "t1", paneId: "p1" });
    store.sessionFocusChanged(null);
    expect(store.focus).toBeNull();
  });

  it("panesInWorkspace: tab を経由して workspace 配下の pane を集める", () => {
    const store = useSessionStore(pinia);
    store.tabUpserted(makeTab("t1", "w1"));
    store.tabUpserted(makeTab("t2", "w1"));
    store.tabUpserted(makeTab("t3", "w2"));
    store.paneUpserted(makePane("p1", "t1"));
    store.paneUpserted(makePane("p2", "t2"));
    store.paneUpserted(makePane("p3", "t3"));
    expect(store.panesInWorkspace("w1").map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(store.panesInWorkspace("w2").map((p) => p.id)).toEqual(["p3"]);
    expect(store.panesInWorkspace("ghost")).toEqual([]);
  });

  // 20261004-group-worktree-items：切断で clear() したら layout も null に戻る（古いサーバの layout を引きずらない）。
  it("clear は layout を null に戻す", () => {
    const store = useSessionStore(pinia);
    store.layoutChanged({ top: ["w:w1"], groups: {} });
    expect(store.hasServerLayout).toBe(true);
    store.clear();
    expect(store.layout).toBeNull();
    expect(store.hasServerLayout).toBe(false);
  });
});
