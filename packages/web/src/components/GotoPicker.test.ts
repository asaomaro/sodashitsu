import type { AgentInfo, MethodName, Pane, ParamsOf, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import GotoPicker from "./GotoPicker.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});

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

function makeWorkspace(id: string, tabIds: string[], overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false, ...overrides };
}
function makeTab(id: string, workspaceId: string, paneId: string, overrides: Partial<Tab> = {}): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId }, focusedPaneId: paneId, zoomedPaneId: null, sizeOwnerClientId: null, ...overrides };
}
function makePane(id: string, tabId: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId, label: null, cwd: `/work/${id}`, shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "claude", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
}

function mountPicker(conn: ConnectionPort) {
  return mount(GotoPicker, { global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: conn } }, attachTo: document.body });
}

/** 1 workspace(w1) - 1 tab(t1) - 1 pane(p1) の最小構成を作る。 */
function seedMinimal(session: ReturnType<typeof useSessionStore>) {
  session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
  session.tabUpserted(makeTab("t1", "w1", "p1"));
  session.paneUpserted(makePane("p1", "t1"));
}

async function open(view: ReturnType<typeof useViewStore>, wrapper: ReturnType<typeof mountPicker>) {
  view.openDialogWithContext({ kind: "goto" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
}

describe("GotoPicker — 木の表示", () => {
  it("最初から全展開（workspace → tab → pane）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    const labels = wrapper.findAll(".goto-picker-label").map((el) => el.text());
    // p1 は label/agent/title のどれも無いので「pane N」にフォールバックする。
    expect(labels).toEqual(["w1", "t1", "pane 1"]);
  });

  it("1 ホスト固定なので machine の段は無い（D56 の訂正 7）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    expect(wrapper.text()).not.toMatch(/machine/i);
  });

  it("pane の名前は label → agent.label → title → 「pane N」の順にフォールバックする", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { title: "vim" }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    expect(wrapper.findAll(".goto-picker-label").at(-1)!.text()).toBe("vim");
  });
});

// 20260921-herdr-settings-gaps の D2：状態の印は `StateIcon`（字形と読み上げの名前まで見る）。
describe("GotoPicker — 状態の印", () => {
  it("エージェントの居る pane の印は字形と読み上げの名前を持つ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { agent: makeAgent({ state: "blocked" }) }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    const icon = wrapper.find('.goto-picker-state[data-state="blocked"]');
    expect(icon.text()).toBe("×");
    expect(icon.attributes("role")).toBe("img");
    expect(icon.attributes("aria-label")).toBe("入力待ち");
  });
});

describe("GotoPicker — 文字の絞り込み", () => {
  it("名前・cwd・tab の名前・workspace のブランチで絞り込む", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"], { git: { branch: "feature-x", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false } }));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { cwd: "/work/p1" }));
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    session.paneUpserted(makePane("p2", "t2", { cwd: "/work/p2" }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    await wrapper.get("input").setValue("feature-x");
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1"]);
  });

  it("名前（agent rename）の付いたエージェントの pane は、名前でもエージェントの種類の表示名でも引ける（20260926-agent-start-rename）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { agent: makeAgent({ label: "Claude Code", name: "reviewer" }) }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    for (const query of ["reviewer", "claude"]) {
      await wrapper.get("input").setValue(query);
      expect(wrapper.findAll(".goto-picker-label").map((el) => el.text()), query).toEqual(["w1", "t1", "reviewer"]);
    }
  });

  it("絞り込み中は一致した枝だけを自動展開する（折りたたんでいても出す）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { title: "target-pane" }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    // Space で畳む
    await wrapper.get("dialog").trigger("keydown", { key: " " });
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1"]);
    await wrapper.get("input").setValue("target-pane");
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1", "t1", "target-pane"]);
  });
});

describe("GotoPicker — 状態の絞り込み（b/w/i/d・a）", () => {
  it("b/w/i/d で状態を絞り込み、a で解除する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { agent: makeAgent({ state: "blocked" }) }));
    session.tabUpserted(makeTab("t2", "w1", "p2"));
    session.paneUpserted(makePane("p2", "t2", { agent: makeAgent({ instanceId: "a2", state: "working" }) }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);

    await wrapper.get("dialog").trigger("keydown", { key: "b" });
    // p1 の名前は label が無いので agent.label（"claude"）にフォールバックする。
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1", "t1", "claude"]);

    await wrapper.get("dialog").trigger("keydown", { key: "a" });
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1", "t1", "claude", "t2", "claude"]);
  });

  it("Backspace は状態の絞り込みだけを消す", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { agent: makeAgent({ state: "blocked" }) }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("keydown", { key: "b" });
    expect(wrapper.findAll(".goto-picker-label")).toHaveLength(3);
    await wrapper.get("dialog").trigger("keydown", { key: "Backspace" });
    expect(wrapper.findAll(".goto-picker-label")).toHaveLength(3); // 元々絞り込み後も一致していたので変化なし、だが filter は外れている
    const badge = wrapper.find(".goto-picker-filter-badge");
    expect(badge.exists()).toBe(false);
  });

  it("/ で検索欄に入ると状態の絞り込みは消える", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1", { agent: makeAgent({ state: "blocked" }) }));
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("keydown", { key: "b" });
    expect(wrapper.find(".goto-picker-filter-badge").exists()).toBe(true);
    await wrapper.get("dialog").trigger("keydown", { key: "/" });
    expect(wrapper.find(".goto-picker-filter-badge").exists()).toBe(false);
  });
});

describe("GotoPicker — キーボード移動と確定", () => {
  it("j/k で選択を動かし、Enter で移動する（pane.focus を送り、閉じる）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1"));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await open(view, wrapper);

    await wrapper.get("dialog").trigger("keydown", { key: "j" }); // w1 → t1
    await wrapper.get("dialog").trigger("keydown", { key: "j" }); // t1 → p1
    await wrapper.get("dialog").trigger("keydown", { key: "Enter" });

    expect(view.dialogContext).toBeNull();
    expect(view.focusedPaneId).toBe("p1");
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p1" }]]);
  });

  it("行のクリックでその対象へ移動する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1"));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await open(view, wrapper);
    await wrapper.findAll(".goto-picker-row")[1]!.trigger("click"); // t1 の行
    expect(conn.requests).toEqual([["tab.focus", { tabId: "t1" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("Space は選択中の行が workspace のときだけ折りたたみを切り替える", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    expect(wrapper.findAll(".goto-picker-label")).toHaveLength(3);
    await wrapper.get("dialog").trigger("keydown", { key: " " }); // 選択は w1（先頭）
    expect(wrapper.findAll(".goto-picker-label").map((el) => el.text())).toEqual(["w1"]);
  });

  it("Home/End（G）で先頭・末尾へ移動する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted(makePane("p1", "t1"));
    const conn = makeConnection();
    const wrapper = mountPicker(conn);
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("keydown", { key: "G" });
    await wrapper.get("dialog").trigger("keydown", { key: "Enter" });
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p1" }]]);
  });
});

describe("GotoPicker — Esc・外側クリック", () => {
  it("絞り込み中の Esc は検索欄から離れるだけで、絞り込みの内容は保持する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    const input = wrapper.get("input");
    await input.setValue("xyz-no-match");
    (input.element as HTMLInputElement).focus();
    await wrapper.get("dialog").trigger("keydown", { key: "Escape" });
    expect((input.element as HTMLInputElement).value).toBe("xyz-no-match"); // 消えない（HelpDialog と違う。D76）
    expect(view.dialogContext).not.toBeNull();
  });

  it("絞り込んでいないときの Esc は閉じる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("keydown", { key: "Escape" });
    expect(view.dialogContext).toBeNull();
  });

  it("外側のクリックで閉じる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    seedMinimal(session);
    const wrapper = mountPicker(makeConnection());
    await open(view, wrapper);
    await wrapper.get("dialog").trigger("click");
    expect(view.dialogContext).toBeNull();
  });
});
