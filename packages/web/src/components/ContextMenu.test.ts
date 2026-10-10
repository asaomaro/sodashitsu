import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, TerminalRegistryKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import ContextMenu from "./ContextMenu.vue";

let pinia: Pinia;

beforeEach(() => {
  // view ストアは初期化時に `soda.prefs.v1`（localStorage）を読む。消さないと
  // 同じワーカーで先に走ったファイルの選択が持ち越される（20260920-sidebar-tabbar-controls）。
  localStorage.clear();
  pinia = createPinia();
});

function makeActions() {
  return {
    renamePaneById: vi.fn(),
    clearPaneName: vi.fn(),
    splitPane: vi.fn(),
    zoomPane: vi.fn(),
    setRightClickTarget: vi.fn(),
    pasteIntoPane: vi.fn(),
    closePaneById: vi.fn(),
    swapWithFocused: vi.fn(),
    newTabInWorkspace: vi.fn(),
    renameTabById: vi.fn(),
    closeTabById: vi.fn(),
    renameWorkspaceById: vi.fn(),
    closeWorkspaceById: vi.fn(),
    run: vi.fn(),
    newWorktree: vi.fn(),
    openWorktree: vi.fn(),
    // 20260923-workspace-grouping。
    createGroupForWorkspace: vi.fn(),
    openGroupPicker: vi.fn(),
    removeWorkspaceFromGroup: vi.fn(),
    moveGroupBy: vi.fn(),
    moveUngroupedBy: vi.fn(),
    renameGroupById: vi.fn(),
    deleteGroupById: vi.fn(),
  };
}

function makePane(id: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}
function makeTab(id: string, workspaceId: string): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null };
}
function makeWorkspace(id: string, overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: "/", tabIds: [], activeTabId: "", groupId: null, git: null, autoLabel: false, ...overrides };
}

function mountMenu(actions: ReturnType<typeof makeActions>, registry?: { focus: (paneId: string) => void }) {
  return mount(ContextMenu, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, ...(registry ? { [TerminalRegistryKey as symbol]: registry } : {}) } },
    attachTo: document.body,
  });
}

describe("ContextMenu — pane", () => {
  it("名前が無ければ「名前の消去」を出さない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: null }));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    const labels = wrapper.findAll("li").map((li) => li.text());
    expect(labels).not.toContain("名前の消去");
  });

  it("名前があれば「名前の消去」を出す", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: "my pane" }));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toContain("名前の消去");
  });

  it("フォーカス中の pane との入れ替えは出さない（D69。プロトコルの制約）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1"));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text()).join("")).not.toContain("入れ替え");
  });

  // 20260927-cli-mode（design D-7。herdr の「Swap with focused pane」）。D69 の当時は方式が無かったが、今は `pane.swap_with` がある。
  it("焦点の pane 以外の、同じ tab の pane のメニューには「焦点の pane と入れ替え」を出し、選ぶとその paneId で swapWithFocused を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1"));
    session.paneUpserted(makePane("p2"));
    view.focusPane("p1");
    view.openContextMenu({ kind: "pane", paneId: "p2" }, { x: 0, y: 0 });
    const actions = makeActions();
    const wrapper = mountMenu(actions);
    const item = wrapper.findAll("li").find((li) => li.text() === "焦点の pane と入れ替え");
    expect(item).toBeDefined();
    await item!.trigger("click");
    expect(actions.swapWithFocused).toHaveBeenCalledWith("p2");
  });

  it("焦点の pane そのもの・別の tab の pane のメニューには出さない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1"));
    session.paneUpserted(makePane("p3", { tabId: "t2" }));
    view.focusPane("p1");
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    expect(mountMenu(makeActions()).findAll("li").map((li) => li.text())).not.toContain("焦点の pane と入れ替え");
    view.openContextMenu({ kind: "pane", paneId: "p3" }, { x: 0, y: 0 });
    expect(mountMenu(makeActions()).findAll("li").map((li) => li.text())).not.toContain("焦点の pane と入れ替え");
  });

  it("項目をクリックすると対応する ActionDispatcher のメソッドを、指定した paneId で呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: "x" }));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const actions = makeActions();
    const wrapper = mountMenu(actions);
    const items = wrapper.findAll("li");
    await items[0]!.trigger("click"); // 名前の変更
    expect(actions.renamePaneById).toHaveBeenCalledWith("p1");
  });

  it("右クリックの宛先の切替は現在の値に応じてラベルと引数が変わる", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { rightClick: "herdr" }));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toContain("右クリックを pane に送る");
  });

  it("クリックするとメニューを閉じる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: "x" }));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    await wrapper.findAll("li")[0]!.trigger("click");
    expect(view.contextMenu).toBeNull();
  });
});

describe("ContextMenu — tab", () => {
  it("新規・名前の変更・閉じるの 3 項目", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted(makeTab("t1", "w1"));
    view.openContextMenu({ kind: "tab", tabId: "t1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["新規", "名前の変更", "閉じる"]);
  });

  it("「新規」はその tab の workspace を対象にする", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted(makeTab("t1", "w9"));
    view.openContextMenu({ kind: "tab", tabId: "t1" }, { x: 0, y: 0 });
    const actions = makeActions();
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[0]!.trigger("click");
    expect(actions.newTabInWorkspace).toHaveBeenCalledWith("w9");
  });
});

describe("ContextMenu — workspace", () => {
  // 20260920-git-worktree-actions：git かどうかで 2 パターンになった（以前は常に 2 項目固定）。
  // 20260923-workspace-grouping：「新しいグループを作る…」は常に出る（herdr に前例が無い独自拡張）。
  it("git リポジトリでなければ、名前の変更・閉じる・新しいグループを作る…の 3 項目だけ（AC8）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1")); // git: null
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "新しいグループを作る…"]);
  });

  it("git リポジトリなら worktree の 2 項目が増える（AC1・AC8）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false } }));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "新しい worktree", "worktree を開く…", "新しいグループを作る…"]);
  });

  it("worktree の項目は、それぞれの入口を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const actions = makeActions();
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false } }));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[2]!.trigger("click");
    expect(actions.newWorktree).toHaveBeenCalledWith("w1");

    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const reopened = mountMenu(actions);
    await reopened.findAll("li")[3]!.trigger("click");
    expect(actions.openWorktree).toHaveBeenCalledWith("w1");
  });

  // 20260923-workspace-grouping。
  it("グループに未所属なら「新しいグループを作る…」を呼び、グループが1件以上あれば「グループへ追加…」も出る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const actions = makeActions();
    session.workspaceUpserted(makeWorkspace("w1"));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    const labels = wrapper.findAll("li").map((li) => li.text());
    // design「画面」：所属なし →「グループへ追加…」「新しいグループを作る…」の順。
    expect(labels).toEqual(["名前の変更", "閉じる", "グループへ追加…", "新しいグループを作る…"]);
    await wrapper.findAll("li")[3]!.trigger("click");
    expect(actions.createGroupForWorkspace).toHaveBeenCalledWith("w1");
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const reopened = mountMenu(actions);
    await reopened.findAll("li")[2]!.trigger("click");
    expect(actions.openGroupPicker).toHaveBeenCalledWith("w1");
  });

  it("グループに所属していれば「別のグループへ移す…」「グループから外す」「新しいグループを作る…」を出す（移し先が他に無ければ「移す」は出さない）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const actions = makeActions();
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "グループから外す", "新しいグループを作る…"]);
    await wrapper.findAll("li")[2]!.trigger("click");
    expect(actions.removeWorkspaceFromGroup).toHaveBeenCalledWith("w1");

    session.groupUpserted({ id: "g2", label: "frontend", collapsed: false });
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const withOther = mountMenu(actions);
    expect(withOther.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "別のグループへ移す…", "グループから外す", "新しいグループを作る…"]);
    await withOther.findAll("li")[2]!.trigger("click");
    expect(actions.openGroupPicker).toHaveBeenCalledWith("w1");
  });

  // 子の行でも項目全体に働く：所属は本体（`layout` の `r:`）で決まり、子の `groupId` には頼らない。
  it("worktree の子の行でも、項目（リポジトリ）の所属で出し分ける", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
    session.workspaceUpserted(makeWorkspace("w1", { git: git(false), groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { git: git(true), groupId: null }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.layoutChanged({ top: ["g:g1"], groups: { g1: ["r:/r/.git"] }, ungrouped: [] });
    view.openContextMenu({ kind: "workspace", workspaceId: "w2" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "新しい worktree", "worktree を開く…", "グループから外す", "新しいグループを作る…"]);
  });

  it("グループが0件なら「グループへ追加…」は出ない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "新しいグループを作る…"]);
  });
});

describe("ContextMenu — 「グループなし」の項目の出入り（追補 01 B）", () => {
  const layoutWithUngrouped = () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["w:w1"] });
  };
  it("「グループなし」の項目は「グループへ追加…」「新しいグループを作る…」（「外す」「移す」は出ない）", () => {
    layoutWithUngrouped();
    useViewStore(pinia).openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    expect(mountMenu(makeActions()).findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "グループへ追加…", "新しいグループを作る…"]);
  });
  it("グループの中の項目は「グループから外す」を出す（移し先が他に無ければ「移す」は出ない）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.groupUpserted({ id: "g1", label: "a", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:w1"] }, ungrouped: [] });
    useViewStore(pinia).openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    expect(mountMenu(makeActions()).findAll("li").map((li) => li.text())).toEqual(["名前の変更", "閉じる", "グループから外す", "新しいグループを作る…"]);
  });
});

describe("ContextMenu — 「グループなし」の見出し（追補 01 B）", () => {
  it("layout を持つサーバでは「上へ移動」「下へ移動」だけ（名前の変更・グループを削除は出ない）。それぞれの入口を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const actions = makeActions();
    session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: [] });
    view.openContextMenu({ kind: "ungrouped" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["上へ移動", "下へ移動"]);
    await wrapper.findAll("li")[0]!.trigger("click");
    expect(actions.moveUngroupedBy).toHaveBeenCalledWith("previous");
    view.openContextMenu({ kind: "ungrouped" }, { x: 0, y: 0 });
    await mountMenu(actions).findAll("li")[1]!.trigger("click");
    expect(actions.moveUngroupedBy).toHaveBeenCalledWith("next");
  });

  it("layout の無い古いサーバでは項目を出さない", () => {
    useViewStore(pinia).openContextMenu({ kind: "ungrouped" }, { x: 0, y: 0 });
    expect(mountMenu(makeActions()).findAll("li")).toEqual([]);
  });
});

// 20260923-workspace-grouping：グループのヘッダー行専用のメニュー（herdr に前例が無い独自拡張）。
describe("ContextMenu — group", () => {
  it("layout を持つサーバでは名前の変更・上へ移動・下へ移動・グループを削除を出し、それぞれの入口を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const actions = makeActions();
    session.layoutChanged({ top: ["g:g1"], groups: { g1: [] }, ungrouped: [] });
    view.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "上へ移動", "下へ移動", "グループを削除"]);
    await wrapper.findAll("li")[0]!.trigger("click");
    expect(actions.renameGroupById).toHaveBeenCalledWith("g1");
    view.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    await mountMenu(actions).findAll("li")[1]!.trigger("click");
    expect(actions.moveGroupBy).toHaveBeenCalledWith("g1", "previous");
    view.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    await mountMenu(actions).findAll("li")[2]!.trigger("click");
    expect(actions.moveGroupBy).toHaveBeenCalledWith("g1", "next");
    view.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    await mountMenu(actions).findAll("li")[3]!.trigger("click");
    expect(actions.deleteGroupById).toHaveBeenCalledWith("g1");
  });

  it("layout の無い古いサーバでは「上へ移動」「下へ移動」を出さない", () => {
    const view = useViewStore(pinia);
    view.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["名前の変更", "グループを削除"]);
  });
});

// 20260920-sidebar-tabbar-controls の AC4：サイドバーの「メニュー」から開く、どこにも属さない全体の操作。
describe("ContextMenu — global", () => {
  // 「設定」は 20260920-agent-notifications で「通知の設定」として足し、20260921-herdr-settings-gaps で設定全体に広げた。
  // **切り離しは最後のまま**（押し間違えると接続が切れるので、`ContextMenu.vue` のコメントがそう定めている）。
  it("キー割り当て・移動・連携（グラフ）・ダッシュボード・設定・切り離しを、この順で出す", () => {
    const view = useViewStore(pinia);
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["キー割り当て", "移動", "連携（グラフ）", "ダッシュボード", "設定", "切り離し"]);
  });

  it("「設定」を選ぶと、キー操作と同じ action が渡る", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[4]!.trigger("click");
    expect(actions.run).toHaveBeenCalledWith({ type: "settings" });
  });

  it("「ダッシュボード」を選ぶと、ダッシュボードの画面へ切り替わる（20261010-agent-usage PR3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[3]!.trigger("click");
    expect(view.screen).toBe("dashboard");
    expect(actions.run).not.toHaveBeenCalled();
  });

  it("「連携（グラフ）」を選ぶと、キーの open_graph と同じ action が渡る（20260927-agent-graph）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[2]!.trigger("click");
    expect(actions.run).toHaveBeenCalledWith({ type: "openGraph" });
  });

  it("選ぶと、キー操作と同じ action が `run` に渡る", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.findAll("li")[1]!.trigger("click"); // 「移動」
    expect(actions.run).toHaveBeenCalledWith({ type: "goto" });
  });

  it("Esc で閉じたときは何も実行しない（AC-I2）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    const wrapper = mountMenu(actions);
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
    expect(actions.run).not.toHaveBeenCalled();
    expect(view.contextMenu).toBeNull();
  });
});

describe("ContextMenu — キーボード（APG の Menu）", () => {
  it("Esc で閉じる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
    expect(view.contextMenu).toBeNull();
  });

  it("矢印キーで選択を動かし、Enter で実行する", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const actions = makeActions();
    const wrapper = mountMenu(actions);
    const menu = wrapper.get('[role="menu"]');
    await menu.trigger("keydown", { key: "ArrowDown" }); // 名前の変更 → 閉じる
    await menu.trigger("keydown", { key: "Enter" });
    expect(actions.closeWorkspaceById).toHaveBeenCalledWith("w1");
  });

  it("外側のクリックで閉じる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    mountMenu(makeActions());
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(view.contextMenu).toBeNull();
  });

  // 20260925-sidebar-keyboard-menu review round1 must（decisions D4）: onKeydown が
  // stopPropagation() を呼ばないと、navigate モード中にメニューを開いた状態で矢印キー・
  // Space・Escape を押したとき、メニュー内の処理と同時に main.ts の window レベルの
  // keydown listener（KeyRouter/NavigateMode）へも同じキーが二重配送され、navigateSelection
  // が意図せず動く・openMenu action が再発火する実害があった。
  it("矢印キーは window まで二重配送されない（メニューを開いたまま。PaneFrame.vue と同じ stopPropagation）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    const menu = wrapper.get('[role="menu"]');
    const onWindowKeydown = vi.fn();
    window.addEventListener("keydown", onWindowKeydown);
    try {
      await menu.trigger("keydown", { key: "ArrowDown" });
      await menu.trigger("keydown", { key: "ArrowUp" });
    } finally {
      window.removeEventListener("keydown", onWindowKeydown);
    }
    expect(onWindowKeydown).not.toHaveBeenCalled();
    expect(view.contextMenu).not.toBeNull(); // 矢印キーでは閉じない（前提の確認）
  });

  it("Escape・Enter で閉じるキーも window まで二重配送されない", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    const wrapper = mountMenu(makeActions());
    const onWindowKeydown = vi.fn();
    window.addEventListener("keydown", onWindowKeydown);
    try {
      await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
      expect(view.contextMenu).toBeNull();

      view.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
      await wrapper.vm.$nextTick();
      await wrapper.get('[role="menu"]').trigger("keydown", { key: "Enter" });
    } finally {
      window.removeEventListener("keydown", onWindowKeydown);
    }
    expect(onWindowKeydown).not.toHaveBeenCalled();
  });
});

describe("ContextMenu — 閉じたときのフォーカスの戻し先（APG の Menu。D110）", () => {
  /** メニューを開く前にフォーカスしていた要素（右クリックした端末・キーボードで開いた pane の枠の代わり）。 */
  function focusInvoker(): HTMLButtonElement {
    const invoker = document.createElement("button");
    invoker.textContent = "invoker";
    document.body.appendChild(invoker);
    invoker.focus();
    return invoker;
  }

  async function openPaneMenu(): Promise<{ wrapper: ReturnType<typeof mountMenu>; actions: ReturnType<typeof makeActions>; invoker: HTMLButtonElement; registry: { focus: ReturnType<typeof vi.fn> } }> {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1"));
    const actions = makeActions();
    const registry = { focus: vi.fn() };
    const wrapper = mountMenu(actions, registry);
    const invoker = focusInvoker();
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[role="menu"]').element)); // 開くとメニューへ移る
    return { wrapper, actions, invoker, registry };
  }

  it("Esc で閉じると、開く前にフォーカスしていた要素へ戻す", async () => {
    const { wrapper, invoker } = await openPaneMenu();
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
    expect(useViewStore(pinia).contextMenu).toBeNull();
    expect(document.activeElement).toBe(invoker);
    wrapper.unmount();
    invoker.remove();
  });

  it("項目を選ぶと、開く前の要素へ戻してから実行する（フォーカスを移す項目は、その後に移し直せる）", async () => {
    const { wrapper, actions, invoker } = await openPaneMenu();
    let focusedWhenRun: Element | null = null;
    actions.zoomPane.mockImplementation(() => {
      focusedWhenRun = document.activeElement;
    });
    await wrapper.findAll("li").find((li) => li.text() === "拡大表示")!.trigger("click");
    expect(actions.zoomPane).toHaveBeenCalledWith("p1");
    expect(focusedWhenRun).toBe(invoker);
    expect(document.activeElement).toBe(invoker);
    wrapper.unmount();
    invoker.remove();
  });

  it("外側のクリックで閉じたときは戻さない（フォーカスはクリックした先へ移る）", async () => {
    const { wrapper, invoker } = await openPaneMenu();
    const menuEl = wrapper.get('[role="menu"]').element;
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(useViewStore(pinia).contextMenu).toBeNull();
    expect(document.activeElement).not.toBe(invoker);
    expect(menuEl.isConnected).toBe(false);
    wrapper.unmount();
    invoker.remove();
  });

  it("戻す先が文書から外れていれば（閉じた pane の端末等）、選ばれている pane の端末へフォーカスする（独立点検 #4）", async () => {
    const { wrapper, invoker, registry } = await openPaneMenu();
    useViewStore(pinia).focusPane("p7");
    invoker.remove();
    const focus = vi.spyOn(invoker, "focus");
    await wrapper.get('[role="menu"]').trigger("keydown", { key: "Escape" });
    expect(focus).not.toHaveBeenCalled();
    expect(registry.focus).toHaveBeenCalledWith("p7");
    wrapper.unmount();
  });
});

describe("ContextMenu — 表示の面（20261008-display-layout）", () => {
  const face = (id: string, over: Record<string, unknown> = {}) => ({ id, paneId: "p1", name: id, kind: "panel", format: "text", title: id, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over }) as never;
  const labels = (w: ReturnType<typeof mountMenu>): string[] => w.findAll("li").map((li) => li.text());

  it("pane のメニューに、面があるときだけ「表示のメニュー…」が出て、選ぶと面の一覧のメニューが同じ位置に開く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1"));
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 5, y: 6 });
    expect(labels(mountMenu(makeActions()))).not.toContain("表示のメニュー…");
    document.body.innerHTML = "";
    useDisplayStore(pinia).upsert(face("a"));
    const w = mountMenu(makeActions());
    const item = w.findAll("li").find((li) => li.text() === "表示のメニュー…");
    expect(item).toBeDefined();
    await item!.trigger("click");
    expect(view.contextMenu).toEqual({ target: { kind: "displays", paneId: "p1" }, at: { x: 5, y: 6 } });
  });

  it("面の一覧: 面ごとに「<種類> <名前> — <置き場所>・<状態>」。選ぶとその面のメニュー。自動でたたまれた面は「出せない」", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    d.upsert(face("a"));
    d.upsert(face("b", { kind: "band", edge: "bottom" }));
    d.upsert(face("c"));
    d.setFaceCollapsed(face("a"), true);
    d.setLayoutSnapshot("p1", { auto: ["c"], floatArea: null });
    view.openContextMenu({ kind: "displays", paneId: "p1" }, { x: 1, y: 2 });
    const w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["パネル a — 右・たたんでいる", "帯 b — 下・開いている", "パネル c — 右・出せない"]);
    await w.findAll("li")[1]!.trigger("click");
    expect(view.contextMenu?.target).toEqual({ kind: "display", id: "b" });
    expect(view.contextMenu?.at).toEqual({ x: 1, y: 2 });
  });

  it("面のメニュー（パネル）: たたむ／開く・閉じる。記憶が無ければ「指定に戻す」は出ない。たたむと記憶が書かれる", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    const a = face("a");
    d.upsert(a);
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    let w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["たたむ", "左に置く", "上に置く", "下に置く", "この表示を閉じる"]); // 右にある面: 今と違う側だけ
    await w.findAll("li")[0]!.trigger("click");
    await Promise.resolve();
    expect(d.effectiveOf(a).collapsed).toBe(true);
    document.body.innerHTML = "";
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["開く", "左に置く", "上に置く", "下に置く", "プログラムの指定に戻す", "この表示を閉じる"]);
  });

  it("面のメニュー（パネル）: 「左に置く」を選ぶと、移った先で開いて出る（たたんでいた面も）。同じ名前の記憶にも書く。その側に出た面は「左に置く」が消える", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    const a = face("a");
    d.upsert(a);
    d.setFaceCollapsed(a, true);
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    let w = mountMenu(makeActions());
    await w.findAll("li").find((li) => li.text() === "左に置く")!.trigger("click");
    await Promise.resolve();
    expect(d.effectiveOf(a)).toMatchObject({ dock: "left", collapsed: false });
    expect(d.activeBySide.get("p1|left")).toBe("a");
    expect(d.layoutPrefs.names["panel|a"]).toEqual({ dock: "left" });
    document.body.innerHTML = "";
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["たたむ", "右に置く", "上に置く", "下に置く", "プログラムの指定に戻す", "この表示を閉じる"]);
  });

  it("面のメニュー（パネル）: 窓の動ける領域があるときだけ「浮いた窓にする」が出る。選ぶと開いて出て、記憶に矩形が書かれる。窓になった面には「キーで動かす」「キーで大きさを変える」が出る", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    const a = face("a");
    d.upsert(a);
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    expect(labels(mountMenu(makeActions()))).not.toContain("浮いた窓にする"); // 領域が分からない間は出さない
    document.body.innerHTML = "";
    d.setLayoutSnapshot("p1", { auto: [], floatArea: { w: 800, h: 500 } });
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    let w = mountMenu(makeActions());
    expect(labels(w)).toContain("浮いた窓にする");
    await w.findAll("li").find((li) => li.text() === "浮いた窓にする")!.trigger("click");
    await Promise.resolve();
    await Promise.resolve();
    expect(d.effectiveOf(a)).toMatchObject({ dock: "float", collapsed: false });
    expect(d.faceRectOf(a)).toBeDefined();
    expect(d.layoutPrefs.names["panel|a"]).toEqual({ dock: "float" });
    document.body.innerHTML = "";
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["たたむ", "右に置く", "左に置く", "上に置く", "下に置く", "キーで動かす", "キーで大きさを変える", "プログラムの指定に戻す", "この表示を閉じる"]);
    await w.findAll("li").find((li) => li.text() === "キーで動かす")!.trigger("click");
    await Promise.resolve();
    expect(d.floatKeyMode).toEqual({ id: "a", paneId: "p1", mode: "move" });
  });

  it("面のメニュー（パネル）: たたんだ窓は、窓の動ける領域が無い間は「開く」を出さない", () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    const a = face("a", { dock: "float" });
    d.upsert(a);
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    expect(labels(mountMenu(makeActions()))).not.toContain("開く");
    document.body.innerHTML = "";
    d.setLayoutSnapshot("p1", { auto: [], floatArea: { w: 800, h: 500 } });
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    expect(labels(mountMenu(makeActions()))).toContain("開く");
  });

  it("面のメニュー（帯）: 今と違う側だけ「上に置く／下に置く」。選ぶと移った先で開き、同じ名前の記憶にも書く。指定に戻すで消える", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    const b = face("bar", { kind: "band", collapsed: true });
    d.upsert(b);
    view.openContextMenu({ kind: "display", id: "bar" }, { x: 0, y: 0 });
    let w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["開く", "下に置く", "この表示を閉じる"]);
    await w.findAll("li").find((li) => li.text() === "下に置く")!.trigger("click");
    await Promise.resolve();
    expect(d.effectiveOf(b)).toEqual({ dock: null, edge: "bottom", collapsed: false });
    expect(d.layoutPrefs.names["band|bar"]).toEqual({ edge: "bottom" });
    document.body.innerHTML = "";
    view.openContextMenu({ kind: "display", id: "bar" }, { x: 0, y: 0 });
    w = mountMenu(makeActions());
    expect(labels(w)).toEqual(["たたむ", "上に置く", "プログラムの指定に戻す", "この表示を閉じる"]);
    await w.findAll("li").find((li) => li.text() === "プログラムの指定に戻す")!.trigger("click");
    await Promise.resolve();
    expect(d.effectiveOf(b)).toEqual({ dock: null, edge: "top", collapsed: true });
  });

  it("「この表示を閉じる」は dismiss。Enter・Space の繰り返しは実行しない。フォーカスを取らない部品の押下は、開く前の場所へ戻してから閉じる", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    d.upsert(face("a"));
    const registry = { focus: vi.fn() };
    view.openContextMenu({ kind: "display", id: "a" }, { x: 0, y: 0 });
    const w = mountMenu(makeActions(), registry);
    const ev = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true });
    w.get('[role="menu"]').element.dispatchEvent(ev);
    expect(d.layoutPrefs.faces["p1|panel|a"]).toBeUndefined(); // 先頭の「たたむ」が実行されない
    const keep = document.createElement("button");
    keep.setAttribute("data-display-keepfocus", "");
    document.body.appendChild(keep);
    view.focusPane("p9");
    keep.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(view.contextMenu).toBeNull();
    expect(registry.focus).toHaveBeenCalledWith("p9"); // 戻し先が無い → 選ばれている pane の端末
  });

  it("画面の下からはみ出さない位置へずらす", async () => {
    const d = useDisplayStore(pinia);
    const view = useViewStore(pinia);
    d.upsert(face("a"));
    view.openContextMenu({ kind: "display", id: "a" }, { x: 10, y: window.innerHeight - 2 });
    const w = mountMenu(makeActions());
    await Promise.resolve();
    await w.vm.$nextTick();
    // happy-dom は箱を測らない（0）。測れない環境では位置を変えない
    expect((w.get("ul").element as HTMLElement).style.top).toBe(`${window.innerHeight - 2}px`);
  });
});
