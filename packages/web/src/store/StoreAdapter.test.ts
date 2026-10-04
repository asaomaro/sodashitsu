import type { AgentInfo, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "@sodashitsu/client-core";
import { useCommandsStore } from "./commands.js";
import { useSessionStore } from "./session.js";
import { StoreAdapter } from "./StoreAdapter.js";
import { useViewStore } from "./view.js";

let pinia: Pinia;

beforeEach(() => {
  sessionStorage.clear(); // restoreView が内部で読み書きするため（applySnapshot のテスト間の汚染を防ぐ）
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

function makeAdapter(overrides: Partial<ConstructorParameters<typeof StoreAdapter>[0]> = {}) {
  const onAuthRequired = vi.fn();
  const onConnectionState = vi.fn();
  const adapter = new StoreAdapter({ pinia, onAuthRequired, onConnectionState, ...overrides });
  return { adapter, onAuthRequired, onConnectionState };
}

describe("StoreAdapter", () => {
  it("applySnapshot は session ストアへ反映する", () => {
    const { adapter } = makeAdapter();
    adapter.applySnapshot(
      {
        protocol: 1,
        serverVersion: "test",
        host: { os: "linux", windowsBuild: null, hostname: "h" },
        workspaces: [makeWorkspace("w1")],
        tabs: [],
        panes: [],
        groups: [],
        focus: null,
        limits: { scrollbackLines: 5000 },
      },
      "c1",
    );
    expect(useSessionStore(pinia).workspaces.has("w1")).toBe(true);
    expect(useSessionStore(pinia).clientId).toBe("c1");
  });

  it("applySnapshot は view.restoreView も呼ぶ（T26。前回のタブが無ければサーバの focus に従う）", () => {
    const { adapter } = makeAdapter();
    adapter.applySnapshot(
      {
        protocol: 1,
        serverVersion: "test",
        host: { os: "linux", windowsBuild: null, hostname: "h" },
        workspaces: [makeWorkspace("w1")],
        tabs: [makeTab("t1", "w1")],
        panes: [makePane("p1", "t1")],
        groups: [],
        focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
        limits: { scrollbackLines: 5000 },
      },
      "c1",
    );
    const view = useViewStore(pinia);
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
  });

  it("sessionStorage に前回の tab があれば、その tab の focusedPaneId へフォーカスする（review で発見した不具合の回帰テスト：" +
    "F5 で再読み込みしても手でクリックし直さずにキーボード操作を再開できる。AC-I3）", () => {
    // 1 回目：applySnapshot が restoreView 経由で sessionStorage に w1/t1 を書く（サーバの focus に従って）。
    const { adapter } = makeAdapter();
    adapter.applySnapshot(
      {
        protocol: 1,
        serverVersion: "test",
        host: { os: "linux", windowsBuild: null, hostname: "h" },
        workspaces: [makeWorkspace("w1")],
        tabs: [makeTab("t1", "w1")],
        panes: [makePane("p1", "t1")],
        groups: [],
        focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
        limits: { scrollbackLines: 5000 },
      },
      "c1",
    );

    // 2 回目（ページの再読み込みを模す）：新しい pinia（＝新しい view ストア）で、同じ sessionStorage を読む。
    // サーバの focus はあえて別の tab（w2/t2）にして、「前回の tab（w1/t1）が優先される」ことも確かめる。
    const pinia2 = createPinia();
    const adapter2 = new StoreAdapter({ pinia: pinia2, onAuthRequired: vi.fn(), onConnectionState: vi.fn() });
    adapter2.applySnapshot(
      {
        protocol: 1,
        serverVersion: "test",
        host: { os: "linux", windowsBuild: null, hostname: "h" },
        workspaces: [makeWorkspace("w1"), makeWorkspace("w2")],
        tabs: [makeTab("t1", "w1"), makeTab("t2", "w2")],
        panes: [makePane("p1", "t1"), makePane("p2", "t2")],
        groups: [],
        focus: { workspaceId: "w2", tabId: "t2", paneId: "p2" },
        limits: { scrollbackLines: 5000 },
      },
      "c2",
    );
    const view2 = useViewStore(pinia2);
    expect(view2.workspaceId).toBe("w1"); // 前回の tab（サーバの focus の w2 ではない）
    expect(view2.tabId).toBe("t1");
    expect(view2.focusedPaneId).toBe("p1"); // その tab の focusedPaneId（不具合修正前は null のままだった）
  });

  it.each([
    ["workspace.created", { workspace: makeWorkspace("w1") }],
    ["workspace.updated", { workspace: makeWorkspace("w1") }],
  ] as const)("%s は workspaceUpserted を呼ぶ", (event, data) => {
    const { adapter } = makeAdapter();
    adapter.applyEvent({ event, data } as never);
    expect(useSessionStore(pinia).workspaces.has("w1")).toBe(true);
  });

  it("workspace.closed", () => {
    const { adapter } = makeAdapter();
    useSessionStore(pinia).workspaceUpserted(makeWorkspace("w1"));
    adapter.applyEvent({ event: "workspace.closed", data: { workspaceId: "w1" } });
    expect(useSessionStore(pinia).workspaces.has("w1")).toBe(false);
  });

  // 20260923-workspace-grouping（decisions.md D5）。
  it("workspace.order_changed reorders the session store's workspaces map", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.workspaceUpserted(makeWorkspace("w2"));
    adapter.applyEvent({ event: "workspace.order_changed", data: { workspaceIds: ["w2", "w1"] } });
    expect([...session.workspaces.keys()]).toEqual(["w2", "w1"]);
  });

  it.each([
    ["group.created", { group: { id: "g1", label: "backend", collapsed: false } }],
    ["group.updated", { group: { id: "g1", label: "backend", collapsed: false } }],
  ] as const)("%s は groupUpserted を呼ぶ", (event, data) => {
    const { adapter } = makeAdapter();
    adapter.applyEvent({ event, data } as never);
    expect(useSessionStore(pinia).groups.has("g1")).toBe(true);
  });

  it("group.deleted", () => {
    const { adapter } = makeAdapter();
    useSessionStore(pinia).groupUpserted({ id: "g1", label: "backend", collapsed: false });
    adapter.applyEvent({ event: "group.deleted", data: { groupId: "g1" } });
    expect(useSessionStore(pinia).groups.has("g1")).toBe(false);
  });

  it("tab.created/updated/layout.updated/closed", () => {
    const { adapter } = makeAdapter();
    adapter.applyEvent({ event: "tab.created", data: { tab: makeTab("t1", "w1") } });
    expect(useSessionStore(pinia).tabs.has("t1")).toBe(true);
    adapter.applyEvent({ event: "layout.updated", data: { tab: makeTab("t1", "w1") } });
    expect(useSessionStore(pinia).tabs.has("t1")).toBe(true);
    adapter.applyEvent({ event: "tab.closed", data: { tabId: "t1" } });
    expect(useSessionStore(pinia).tabs.has("t1")).toBe(false);
  });

  it("pane.created/updated/closed", () => {
    const { adapter } = makeAdapter();
    adapter.applyEvent({ event: "pane.created", data: { pane: makePane("p1", "t1") } });
    expect(useSessionStore(pinia).panes.has("p1")).toBe(true);
    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    expect(useSessionStore(pinia).panes.has("p1")).toBe(false);
  });

  it("表示中の pane が閉じられたら、残りの pane へ焦点を移す（D97）", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } }, focusedPaneId: "p2" });
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p2");
    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    expect(view.focusedPaneId).toBe("p1");
  });

  // 20260925-pane-replace-focus-hint。decisions.md D5（.aidev/works/20260924-pane-dnd-split-move）
  // の再現：レイアウトの DFS順は [p_other, p_hint]——ヒントが無ければ p_other が選ばれてしまう。
  it("pane.closed の successorPaneId があれば、DFS-first-leaf より優先してそちらへ焦点を移す（AC6）", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p_other" }, b: { type: "pane", paneId: "p_hint" } }, focusedPaneId: "p_hint" });
    session.paneUpserted(makePane("p_other", "t1"));
    session.paneUpserted(makePane("p_hint", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p_target"); // replacePane で消える直前の pane にローカルで focus していた状態を模す

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p_target", successorPaneId: "p_hint" } });

    expect(view.focusedPaneId).toBe("p_hint"); // p_other（DFS順の最初）ではなく、ヒントが指す方
  });

  // taskcheck の should 指摘（T5 round1）：ヒントが「使い捨て」であること（次の無関係な
  // pane.closed に引き継がれないこと）を直接確認するテストが無かった。
  it("successorHint は使い捨て——次の無関係な pane.closed には引き継がれない（design「設計方針」）", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p_other" }, b: { type: "pane", paneId: "p_hint" } }, focusedPaneId: "p_hint" });
    session.paneUpserted(makePane("p_other", "t1"));
    session.paneUpserted(makePane("p_hint", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p_target");

    // 1回目：ヒント付き。p_hint が採用される（前のテストと同じ）。
    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p_target", successorPaneId: "p_hint" } });
    expect(view.focusedPaneId).toBe("p_hint");

    // 2回目：無関係な pane（p_third。session に存在しない＝既に死んでいる想定）がローカルの
    // focus だったとして、ヒント無しの pane.closed が届く。p_other/p_hint はどちらもまだ
    // 生きているので、ヒント無しなら DFS順どおり p_other が選ばれるはず——1回目の
    // "p_hint" が誤って使い回されると、ここで p_hint が選ばれてしまう。
    view.focusPane("p_third");
    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p_third" } });
    expect(view.focusedPaneId).toBe("p_other"); // p_hint（前回のヒントの使い回し）ではない
  });

  it("表示中の tab が閉じられたら残りの tab を、workspace が閉じられたら残りの workspace を表示する（D97）", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1", "t2"], activeTabId: "t2" });
    session.workspaceUpserted({ ...makeWorkspace("w9"), tabIds: ["t9"], activeTabId: "t9" });
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted({ ...makeTab("t2", "w1"), layout: { type: "pane", paneId: "p2" }, focusedPaneId: "p2" });
    session.tabUpserted({ ...makeTab("t9", "w9"), layout: { type: "pane", paneId: "p9" }, focusedPaneId: "p9" });
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t2"));
    session.paneUpserted(makePane("p9", "t9"));
    view.setView("w1", "t2");
    view.focusPane("p2");

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    adapter.applyEvent({ event: "tab.closed", data: { tabId: "t2" } });
    expect([view.workspaceId, view.tabId, view.focusedPaneId]).toEqual(["w1", "t1", "p1"]);

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    adapter.applyEvent({ event: "tab.closed", data: { tabId: "t1" } });
    adapter.applyEvent({ event: "workspace.closed", data: { workspaceId: "w1" } });
    expect([view.workspaceId, view.tabId, view.focusedPaneId]).toEqual(["w9", "t9", "p9"]);
  });

  it("ダイアログを開いている間に焦点の pane が閉じられても、焦点は動かさず（ダイアログからフォーカスを奪わない）、閉じたときの戻り先だけを差し替える（D97・独立点検の指摘）", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } }, focusedPaneId: "p2" });
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p2");
    view.openDialogWithContext({ kind: "help" });

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    expect(view.focusedPaneId).toBe("p2"); // ダイアログを開いている間は焦点を動かさない
    view.closeDialog();
    expect(view.focusedPaneId).toBe("p1"); // 閉じたら、残りの pane へ戻る
  });

  it("グラフ画面（20260927-agent-graph）を開いている間も同じく、焦点は動かさず閉じたときの戻り先だけを差し替える", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } }, focusedPaneId: "p2" });
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p2");
    view.openGraph();

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    expect(view.focusedPaneId).toBe("p2"); // グラフ画面を開いている間は焦点を動かさない
    expect(view.preGraphFocusPaneId).toBe("p1");
    view.closeGraph();
    expect(view.focusedPaneId).toBe("p1"); // 閉じたら、残りの pane へ戻る
  });

  it("質問のフォーム（20261002-sodactl-ask）を開いている間も同じく、焦点は動かさず閉じたときの戻り先だけを差し替える。ask イベントはコールバックへ渡す", () => {
    const asks: string[] = [];
    const { adapter } = makeAdapter({ onAskEvent: (e) => void asks.push(e.event) });
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1"), tabIds: ["t1"], activeTabId: "t1" });
    session.tabUpserted({ ...makeTab("t1", "w1"), layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } }, focusedPaneId: "p2" });
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p2");
    view.setAskOpen(true);

    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p2" } });
    expect(view.focusedPaneId).toBe("p2"); // 質問のフォームを開いている間は焦点を動かさない
    expect(view.preAskFocusPaneId).toBe("p1");
    view.setAskOpen(false);
    expect(view.focusedPaneId).toBe("p1"); // 閉じたら、残りの pane へ戻る

    adapter.applyEvent({ event: "ask.opened", data: { askId: "a", paneId: "p1" } });
    adapter.applyEvent({ event: "ask.closed", data: { askId: "a", paneId: "p1" } });
    expect(asks).toEqual(["ask.opened", "ask.closed"]);
  });

  it("pane.agent_status_changed / pane.size_changed", () => {
    const { adapter } = makeAdapter();
    useSessionStore(pinia).paneUpserted(makePane("p1", "t1"));
    adapter.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "p1", agent: null } });
    adapter.applyEvent({ event: "pane.size_changed", data: { paneId: "p1", cols: 100, rows: 30 } });
    expect(useSessionStore(pinia).panes.get("p1")).toMatchObject({ cols: 100, rows: 30 });
  });

  it("agent_integration.changed は注入した onAgentIntegrationChanged へ（20260923-agent-session-resume。省略時は例外を投げない）", () => {
    const onAgentIntegrationChanged = vi.fn();
    const { adapter } = makeAdapter({ onAgentIntegrationChanged });
    const notInstalled = { cliDetected: false, installed: false } as const;
    const status = {
      autoResumeEnabled: false,
      agents: {
        claude: { cliDetected: true, installed: true },
        codex: notInstalled,
        cursor: notInstalled,
        copilot: notInstalled,
        devin: notInstalled,
        droid: notInstalled,
        grok: notInstalled,
        qwen: notInstalled,
      },
    } as const;
    adapter.applyEvent({ event: "agent_integration.changed", data: status });
    expect(onAgentIntegrationChanged).toHaveBeenCalledWith(status);

    const { adapter: withoutCallback } = makeAdapter();
    expect(() => withoutCallback.applyEvent({ event: "agent_integration.changed", data: status })).not.toThrow();
  });

  it("prefs.changed は注入した onPrefsChanged へ（20260927-cli-mode。省略時は例外を投げない）", () => {
    const onPrefsChanged = vi.fn();
    const data = { prefs: { theme: "nord" as const }, rev: 3, byClientId: "c2" };
    makeAdapter({ onPrefsChanged }).adapter.applyEvent({ event: "prefs.changed", data });
    expect(onPrefsChanged).toHaveBeenCalledWith(data);
    expect(() => makeAdapter().adapter.applyEvent({ event: "prefs.changed", data })).not.toThrow();
  });

  it("graph.changed・graph.fired は注入した onGraphEvent へ（20260927-agent-graph。省略時は例外を投げない）", () => {
    const onGraphEvent = vi.fn();
    const changed = { event: "graph.changed" as const, data: { graph: { rev: 1, paused: false, nodes: [], links: [] }, byClientId: null } };
    const fired = { event: "graph.fired" as const, data: { run: { linkId: "l1", at: 1, result: "sent" as const } } };
    const { adapter } = makeAdapter({ onGraphEvent });
    adapter.applyEvent(changed);
    adapter.applyEvent(fired);
    expect(onGraphEvent.mock.calls).toEqual([[changed], [fired]]);
    expect(() => makeAdapter().adapter.applyEvent(changed)).not.toThrow();
  });

  it("command.updated は独自コマンドの一覧を置き換え、command.popup_closed は閉じた控えに残す（20260927-custom-command-keys の AC15）", () => {
    const { adapter } = makeAdapter();
    const commands = useCommandsStore(pinia);
    adapter.applyEvent({ event: "command.updated", data: { commands: [{ id: "git", type: "popup" }], problem: null } });
    expect(commands.catalog).toEqual([{ id: "git", type: "popup" }]);
    adapter.applyEvent({ event: "command.updated", data: { commands: [], problem: "commands.json: x" } });
    expect(commands.catalog).toEqual([]);
    expect(commands.problem).toBe("commands.json: x");
    const seq = commands.closedSeq;
    adapter.applyEvent({ event: "command.popup_closed", data: { popupId: "p9", exitCode: 2 } });
    expect(commands.closedSeq).toBe(seq + 1);
    expect(commands.takeClosed("p9")).toEqual({ closed: true, exitCode: 2 });
    expect(commands.takeClosed("p9")).toEqual({ closed: false });
  });

  it("session.focus_changed", () => {
    const { adapter } = makeAdapter();
    adapter.applyEvent({ event: "session.focus_changed", data: { focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" } } });
    expect(useSessionStore(pinia).focus).toEqual({ workspaceId: "w1", tabId: "t1", paneId: "p1" });
  });

  it("pane.exited は注入した onPaneExited へ（省略時は例外を投げない）", () => {
    const onPaneExited = vi.fn();
    const { adapter } = makeAdapter({ onPaneExited });
    adapter.applyEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } });
    expect(onPaneExited).toHaveBeenCalledWith("p1", 0);

    const { adapter: adapter2 } = makeAdapter();
    expect(() => adapter2.applyEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } })).not.toThrow();
  });

  it("client.error は注入した onClientError へ", () => {
    const onClientError = vi.fn();
    const { adapter } = makeAdapter({ onClientError });
    adapter.applyEvent({ event: "client.error", data: { code: "invalid_params", message: "bad" } });
    expect(onClientError).toHaveBeenCalledWith("invalid_params", "bad");
  });

  it("onOriginRejectSuspected は注入したコールバックを呼ぶ。省いていても例外を投げない（D107）", () => {
    const onOriginRejectSuspected = vi.fn();
    const adapter = new StoreAdapter({ pinia, onAuthRequired: vi.fn(), onConnectionState: vi.fn(), onOriginRejectSuspected });
    adapter.onOriginRejectSuspected(true);
    adapter.onOriginRejectSuspected(false);
    expect(onOriginRejectSuspected.mock.calls).toEqual([[true], [false]]);
    expect(() => makeAdapter().adapter.onOriginRejectSuspected(true)).not.toThrow();
  });

  it("onAuthRequired / onConnectionState は注入したコールバックをそのまま呼ぶ", () => {
    const { adapter, onAuthRequired, onConnectionState } = makeAdapter();
    adapter.onAuthRequired();
    expect(onAuthRequired).toHaveBeenCalled();
    const state: ConnectionState = "reconnecting";
    adapter.onConnectionState(state);
    expect(onConnectionState).toHaveBeenCalledWith("reconnecting");
  });
});

// 20260920-agent-notifications：通知が「変化」を知るための 3 つの注入口。
describe("StoreAdapter — 通知への注入口", () => {
  // キャストを使わない（既存の `store/seen.test.ts` 等と同じ流儀）——`as` で押し込むと、
  // protocol に必須項目が増えてもテストが型で気づけない。
  function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
    return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 1, completionSeq: 0, serverSeenSeq: 0, ...overrides };
  }
  function snapshot(panes: Pane[]) {
    return {
      protocol: 1 as const,
      serverVersion: "test",
      host: { os: "linux" as const, windowsBuild: null, hostname: "h" },
      workspaces: [makeWorkspace("w1")],
      tabs: [makeTab("t1", "w1")],
      panes,
      groups: [],
      focus: null,
      limits: { scrollbackLines: 5000 },
    };
  }

  // **前の値はここでしか取れない**（session は履歴を持たない）。ここが壊れると「変わった」が判定できない。
  it("onAgentChanged には、更新前の本物の値が prev として渡る", () => {
    const onAgentChanged = vi.fn();
    const { adapter } = makeAdapter({ onAgentChanged });
    const session = useSessionStore(pinia);
    session.paneUpserted({ ...makePane("p1", "t1"), agent: makeAgent({ state: "working", since: 1 }) });

    adapter.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "p1", agent: makeAgent({ state: "blocked", since: 2 }) } });

    expect(onAgentChanged).toHaveBeenCalledOnce();
    const [paneId, prev, next] = onAgentChanged.mock.calls[0]!;
    expect(paneId).toBe("p1");
    expect(prev).toMatchObject({ state: "working", since: 1 });
    expect(next).toMatchObject({ state: "blocked", since: 2 });
    // 渡した後のストアは新しい値になっている（読む順番が逆だと prev が next と同じになる）。
    expect(session.panes.get("p1")?.agent).toMatchObject({ state: "blocked" });
  });

  it("初めて見る pane では prev が null", () => {
    const onAgentChanged = vi.fn();
    const { adapter } = makeAdapter({ onAgentChanged });
    adapter.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "unknown", agent: makeAgent() } });
    expect(onAgentChanged.mock.calls[0]![1]).toBeNull();
  });

  it("エージェントが消えたときは next が null", () => {
    const onAgentChanged = vi.fn();
    const { adapter } = makeAdapter({ onAgentChanged });
    const session = useSessionStore(pinia);
    session.paneUpserted({ ...makePane("p1", "t1"), agent: makeAgent() });
    adapter.applyEvent({ event: "pane.agent_status_changed", data: { paneId: "p1", agent: null } });
    expect(onAgentChanged.mock.calls[0]![2]).toBeNull();
  });

  // **AC14**：初回は基準線、再接続は「まだ知らせていないもの」だけ。ここが常に true/false だと一斉に出る。
  it("onSnapshotApplied の first は、初回だけ true", () => {
    const onSnapshotApplied = vi.fn();
    const { adapter } = makeAdapter({ onSnapshotApplied });
    const pane = { ...makePane("p1", "t1"), agent: makeAgent({ state: "blocked" }) };

    adapter.applySnapshot(snapshot([pane]), "c1");
    expect(onSnapshotApplied.mock.calls[0]![1], "初回は基準線").toBe(true);
    expect(onSnapshotApplied.mock.calls[0]![0]).toEqual([{ paneId: "p1", agent: pane.agent }]);

    adapter.applySnapshot(snapshot([pane]), "c1"); // 再接続
    expect(onSnapshotApplied.mock.calls[1]![1], "2 回目からは false").toBe(false);
  });

  it("onPaneClosed は pane.closed で呼ばれる（pane.exited とは別）", () => {
    const onPaneClosed = vi.fn();
    const onPaneExited = vi.fn();
    const { adapter } = makeAdapter({ onPaneClosed, onPaneExited });
    adapter.applyEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } });
    expect(onPaneClosed).not.toHaveBeenCalled();
    adapter.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    expect(onPaneClosed).toHaveBeenCalledWith("p1");
  });

  it("注入口を省いても動く（既存の呼び出し元を壊さない）", () => {
    const { adapter } = makeAdapter();
    expect(() => adapter.applySnapshot(snapshot([]), "c1")).not.toThrow();
    expect(() => adapter.applyEvent({ event: "pane.closed", data: { paneId: "p1" } })).not.toThrow();
  });

  // 20261004-group-worktree-items：サイドバーのレイアウトはスナップショットとイベントで届く。無ければ（古いサーバ）null。
  it("applySnapshot は layout を保持し、sidebar.layout_changed で差し替わる。layout の無いスナップショットでは null に戻る", () => {
    const { adapter } = makeAdapter();
    const session = useSessionStore(pinia);
    const base = { protocol: 1 as const, serverVersion: "test", host: { os: "linux" as const, windowsBuild: null, hostname: "h" }, workspaces: [makeWorkspace("w1")], tabs: [], panes: [], groups: [], focus: null, limits: { scrollbackLines: 5000 } };
    adapter.applySnapshot({ ...base, layout: { top: ["w:w1"], groups: {}, ungrouped: [] } }, "c1");
    expect(session.layout).toEqual({ top: ["w:w1"], groups: {}, ungrouped: [] });
    expect(session.hasServerLayout).toBe(true);
    adapter.applyEvent({ event: "sidebar.layout_changed", data: { layout: { top: ["g:g1"], groups: { g1: ["w:w1"] }, ungrouped: [] } } });
    expect(session.layout).toEqual({ top: ["g:g1"], groups: { g1: ["w:w1"] }, ungrouped: [] });
    adapter.applySnapshot(base, "c1"); // layout の無い古いサーバ
    expect(session.layout).toBeNull();
    expect(session.hasServerLayout).toBe(false);
    // 描画に使うレイアウトは layoutFromLegacy で導く。
    expect(session.effectiveLayout).toEqual({ top: ["w:w1"], groups: {}, ungrouped: [] });
  });
});
