import type { SessionSnapshot } from "@wtm/protocol";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seenKeyFor, useSeenStore, SEEN_STORAGE_KEY } from "./seen.js";
import { useSessionStore } from "./session.js";
import { StoreAdapter } from "./StoreAdapter.js";
import { storedViewKeyFor, useViewStore } from "./view.js";

/** マシンの切り替えの土台（20260927-multi-host-machines の T11）: 表示の記憶・既読の鍵をマシンごとに分け、状態を捨てる口。 */
let pinia: Pinia;
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
  useViewStore(pinia).setMachineScope("local"); // 表示の記憶のキーはモジュールの状態——前のテストの失敗で漏らさない
});

const snap = (ws: string, tab: string, pane: string): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname: "h" },
  workspaces: [
    {
      id: ws,
      label: ws,
      cwd: "/",
      tabIds: [tab],
      activeTabId: tab,
      groupId: null,
      git: null,
      autoLabel: false,
    },
  ],
  tabs: [
    {
      id: tab,
      workspaceId: ws,
      label: tab,
      layout: { type: "pane", paneId: pane },
      focusedPaneId: pane,
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    },
  ],
  panes: [],
  groups: [],
  focus: { workspaceId: ws, tabId: tab, paneId: pane },
  limits: { scrollbackLines: 5000 },
});

describe("表示の記憶のマシンごとの分け方", () => {
  it("ローカルは今までのキー、ほかのマシンは別のキー。rememberView・forgetStoredView は今のスコープだけ", () => {
    expect(storedViewKeyFor("local")).toBe("wtm.view.v1");
    expect(storedViewKeyFor("abc")).toBe("wtm.view.v1:abc");
    const view = useViewStore(pinia);
    view.setView("w1", "t1"); // ローカル
    view.setMachineScope("abc");
    view.rememberView("w5", "t9");
    expect(JSON.parse(sessionStorage.getItem("wtm.view.v1")!)).toEqual({
      workspaceId: "w1",
      tabId: "t1",
    });
    expect(JSON.parse(sessionStorage.getItem("wtm.view.v1:abc")!)).toEqual({
      workspaceId: "w5",
      tabId: "t9",
    });
    view.forgetStoredView();
    expect(sessionStorage.getItem("wtm.view.v1:abc")).toBeNull();
    expect(sessionStorage.getItem("wtm.view.v1")).not.toBeNull();
    view.setMachineScope("local");
  });

  it("切り替えの後の restoreView は、そのマシンの記憶（無ければサーバの focus）を使い、前のマシンの w1/t1 を使わない", () => {
    const view = useViewStore(pinia);
    const session = useSessionStore(pinia);
    view.setMachineScope("local");
    view.setView("w1", "t1");
    view.setMachineScope("m2");
    view.resetForMachineSwitch();
    session.clear();
    const adapter = new StoreAdapter({
      pinia,
      onAuthRequired: () => undefined,
      onConnectionState: () => undefined,
    });
    // m2 にも w1/t1 がある（id の衝突）が、記憶は m2 のキーには無い → サーバの focus（w1/t1 ではなく w7/t7）
    const s = snap("w7", "t7", "p7");
    s.workspaces.push({
      id: "w1",
      label: "other",
      cwd: "/",
      tabIds: ["t1"],
      activeTabId: "t1",
      groupId: null,
      git: null,
      autoLabel: false,
    });
    s.tabs.push({
      id: "t1",
      workspaceId: "w1",
      label: "t1",
      layout: { type: "pane", paneId: "p1" },
      focusedPaneId: "p1",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    });
    adapter.applySnapshot(s, "c");
    expect([view.workspaceId, view.tabId]).toEqual(["w7", "t7"]);
    view.setMachineScope("local");
  });

  it("行から切り替えた（target を覚えた）後の snapshot で、その workspace・tab と、その tab の focus の pane に焦点が移る（AC-I4 の前半。端末への DOM のフォーカスは TerminalPane がこの焦点で行う＝TerminalPane.test の「マウント時に既に focus 対象なら term.focus()」）", () => {
    const view = useViewStore(pinia);
    const session = useSessionStore(pinia);
    view.setView("w1", "t1");
    view.focusPane("p1");
    // MachineSwitcher の手順 3〜4 と同じ順
    view.setMachineScope("m9");
    view.rememberView("w2", "t2");
    view.resetForMachineSwitch();
    session.clear();
    const s = snap("w1", "t1", "p1"); // サーバの focus は w1 だが、行で選んだ w2 を表示する
    s.workspaces.push({
      id: "w2",
      label: "w2",
      cwd: "/",
      tabIds: ["t2"],
      activeTabId: "t2",
      groupId: null,
      git: null,
      autoLabel: false,
    });
    s.tabs.push({
      id: "t2",
      workspaceId: "w2",
      label: "t2",
      layout: { type: "pane", paneId: "p5" },
      focusedPaneId: "p5",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    });
    new StoreAdapter({
      pinia,
      onAuthRequired: () => undefined,
      onConnectionState: () => undefined,
    }).applySnapshot(s, "c");
    expect([view.workspaceId, view.tabId, view.focusedPaneId]).toEqual(["w2", "t2", "p5"]);
  });

  it("resetForMachineSwitch は表示・焦点・ダイアログ・メニュー・navigate の選択を捨てる", () => {
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    view.focusPane("p1");
    view.setOpenDialog("rename");
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    view.setNavigateSelection("w1");
    view.resetForMachineSwitch();
    expect([
      view.workspaceId,
      view.tabId,
      view.focusedPaneId,
      view.openDialog,
      view.contextMenu,
      view.navigateSelection,
    ]).toEqual([null, null, null, null, null, null]);
  });
});

describe("既読の鍵のマシンごとの分け方", () => {
  it("ローカルは instanceId のまま（今までの保存と互換）、ほかは m:<id>:<instanceId>", () => {
    const seen = useSeenStore(pinia);
    seen.markSeen("a1", 3);
    seen.setScope("m2");
    expect(seen.getSeenSeq("a1", 0)).toBe(0); // m2 の a1 はローカルの a1 と別
    seen.markSeen("a1", 7);
    expect(seen.getSeenSeqIn("local", "a1", 0)).toBe(3);
    expect(seen.getSeenSeqIn("m2", "a1", 0)).toBe(7);
    expect(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY)!)).toEqual({
      a1: 3,
      [seenKeyFor("m2", "a1")]: 7,
    });
    seen.setScope("local");
    expect(seen.getSeenSeq("a1", 0)).toBe(3);
  });
});

describe("session.clear・StoreAdapter", () => {
  it("clear は workspace・tab・pane・focus を捨てる", () => {
    const session = useSessionStore(pinia);
    session.applySnapshot(snap("w1", "t1", "p1"), "c");
    session.clear();
    expect([session.workspaces.size, session.tabs.size, session.focus]).toEqual([0, 0, null]);
  });

  it("resetBaseline の後の snapshot は初回（first=true）。machine.changed は onMachinesChanged へ", () => {
    const applied: boolean[] = [];
    const machines = vi.fn();
    const adapter = new StoreAdapter({
      pinia,
      onAuthRequired: () => undefined,
      onConnectionState: () => undefined,
      onSnapshotApplied: (_p, first) => applied.push(first),
      onMachinesChanged: machines,
    });
    adapter.applySnapshot(snap("w1", "t1", "p1"), "c");
    adapter.applySnapshot(snap("w1", "t1", "p1"), "c");
    adapter.resetBaseline();
    adapter.applySnapshot(snap("w1", "t1", "p1"), "c");
    expect(applied).toEqual([true, false, true]);
    adapter.applyEvent({
      event: "machine.changed",
      data: { machines: [{ id: "x", label: "X", state: "online", message: null }] },
    });
    expect(machines).toHaveBeenCalledWith([
      { id: "x", label: "X", state: "online", message: null },
    ]);
  });
});
