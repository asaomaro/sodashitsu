import type { AgentInfo, MethodName, ParamsOf, Pane, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import PanePicker from "./PanePicker.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});

function makeWorkspace(id: string, tabIds: string[] = []): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string, focusedPaneId = "p1"): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: focusedPaneId }, focusedPaneId, zoomedPaneId: null, sizeOwnerClientId: null };
}
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
}
function makePane(id: string, tabId: string, agent: AgentInfo | null = null): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent, agentSession: null };
}

function makeConnection(): ConnectionPort & { requests: [MethodName, unknown][] } {
  return {
    requests: [],
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

function mountPicker(conn: ConnectionPort) {
  return mount(PanePicker, { global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: conn } } });
}

describe("PanePicker — 表示", () => {
  it("workspace・tab・agent の一覧を出す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent()));
    const wrapper = mountPicker(makeConnection());
    expect(wrapper.find('[aria-label="spaces"]').text()).toContain("w1");
    expect(wrapper.find('[aria-label="spaces"]').text()).toContain("t1");
    expect(wrapper.find('[aria-label="agents"]').text()).toContain("Claude Code");
  });

  it("agent rename で付けた名前があれば、種類の表示名と一緒に出す（20260926-agent-start-rename）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ name: "reviewer" })));
    const wrapper = mountPicker(makeConnection());
    expect(wrapper.find('[aria-label="agents"] .pane-picker-label').text()).toBe("w1 / t1 — reviewer（Claude Code）");
  });
});

// 20260921-herdr-settings-gaps の D2：状態の印は `StateIcon`（字形と読み上げの名前まで見る）。
describe("PanePicker — 状態の印", () => {
  it("エージェントの行の印は字形と読み上げの名前を持つ", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ state: "blocked" })));
    const icon = mountPicker(makeConnection()).find('[aria-label="agents"] .pane-picker-state[data-state="blocked"]');
    expect(icon.text()).toBe("×");
    expect(icon.attributes("role")).toBe("img");
    expect(icon.attributes("aria-label")).toBe("入力待ち");
  });
});

describe("PanePicker — 選択", () => {
  it("workspace の行をタップすると workspace.focus を送り、view を更新して close を emit する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await wrapper.get(".pane-picker-row-workspace").trigger("click");
    expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w1" }]]);
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("tab の行をタップすると tab.focus を送る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await wrapper.get(".pane-picker-row-tab").trigger("click");
    expect(conn.requests).toEqual([["tab.focus", { tabId: "t1" }]]);
    expect(view.tabId).toBe("t1");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("agent の行をタップすると pane.focus を送る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent()));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await wrapper.get('[aria-label="agents"] button').trigger("click");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p1" }]]);
    expect(view.focusedPaneId).toBe("p1");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("閉じるボタンで close を emit する", async () => {
    const wrapper = mountPicker(makeConnection());
    await wrapper.get(".pane-picker-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("Esc で close を emit する（AC-I1。レビューで発見——当初は × ボタンでしか閉じられなかった）", async () => {
    const wrapper = mountPicker(makeConnection());
    await wrapper.get(".pane-picker").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});

describe("PanePicker — ダッシュボードの入口（20261010-agent-usage PR3 の AC4）", () => {
  it("［ダッシュボード］を押すと、ピッカーを閉じて、重ねるダイアログ（dialogContext）を開く", async () => {
    const view = useViewStore(pinia);
    view.setMobileViewport(true);
    const wrapper = mountPicker(makeConnection());
    await wrapper.get("[data-picker-dashboard]").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(view.dialogContext).toEqual({ kind: "dashboard" });
    expect(view.dashboardVisible).toBe(true);
  });
});
