import type { AgentInfo, MethodName, ParamsOf, Pane, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { readPrefs, useViewStore, writePrefs } from "../store/view.js";
import { useSettingsStore } from "../store/settings.js";
import Sidebar from "./Sidebar.vue";
import { currentVisibleWorkspaceIds } from "../store/sidebarTree.js";

let pinia: Pinia;

beforeEach(() => {
  // 並び順は localStorage に残る（20260920-sidebar-tabbar-controls）。消さないと前のテストの選択が持ち越される。
  localStorage.clear();
  pinia = createPinia();
});

function makeWorkspace(id: string, overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false, ...overrides };
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

// 20260923-workspace-grouping（D&D。`PaneFrame.test.ts` の `pointerEvent` と同じ形）。
function pointerEvent(type: string, opts: Partial<PointerEvent> & { clientX: number; clientY: number; pointerId?: number }) {
  return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...opts });
}
/** 動かさずに離す＝クリックとして扱われる（閾値未満）。 */
function clickRow(row: { element: Element }): void {
  row.element.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
  row.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 10 }));
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

function makeActions() {
  // 20260923-workspace-grouping。
  return { openContextMenu: vi.fn(), run: vi.fn(), toggleGroupCollapsed: vi.fn(), moveItemByDrag: vi.fn(), openSessionSwitcher: vi.fn() };
}

function mountSidebar(conn: ConnectionPort, actions?: Partial<ReturnType<typeof makeActions>>, opts: { attachTo?: boolean } = {}) {
  return mount(Sidebar, {
    // 20260925-focus-trapped-keybindings：keydown の window までの bubble を確認するテストは
    // 要素が document に attach されていないと届かない（`PaneFrame.test.ts` の `mountFrame` と同じ理由）。
    ...(opts.attachTo ? { attachTo: document.body } : {}),
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: conn,
        // 上書きは個別の関数だけ（未指定の関数は既定のモックのまま。呼ばれても落ちない）。
        [ActionDispatcherKey as symbol]: { ...makeActions(), ...actions },
      },
    },
  });
}

describe("Sidebar — spaces", () => {
  it("workspace の行に状態の印と名前を出す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "my-project" }));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ state: "blocked" })));
    const wrapper = mountSidebar(makeConnection());
    const row = wrapper.find(".sidebar-spaces .sidebar-row");
    expect(row.text()).toContain("my-project");
    expect(row.find(".sidebar-state-icon").attributes("data-state")).toBe("blocked");
  });

  // 20260921-herdr-settings-gaps の D2：状態の印は `StateIcon`。`data-state` だけでは以前の素の `<span>` でも通るので、
  // 字形と読み上げの名前まで見る（戻すと点すら描かれない——呼ぶ側の CSS は消してある）。
  it("状態の印は字形と読み上げの名前を持つ（StateIcon）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ state: "blocked" })));
    const icon = mountSidebar(makeConnection()).find('.sidebar-spaces .sidebar-state-icon[data-state="blocked"]');
    expect(icon.text()).toBe("×");
    expect(icon.attributes("role")).toBe("img");
    expect(icon.attributes("aria-label")).toBe("入力待ち");
  });

  it("git の ahead/behind が両方 0 なら 2 行目を出さない", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: null, isLinkedWorktree: false } }));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-row-line2").exists()).toBe(false);
  });

  it("git の ahead/behind のどちらかが 0 でなければ 2 行目にブランチと件数を出す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 2, behind: 1, repoKey: null, isLinkedWorktree: false } }));
    const wrapper = mountSidebar(makeConnection());
    const line2 = wrapper.find(".sidebar-row-line2");
    expect(line2.text()).toContain("main");
    expect(line2.text()).toContain("↑2");
    expect(line2.text()).toContain("↓1");
  });

  it("クリックで workspace の active tab へ切り替え、workspace.focus を送る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { activeTabId: "t1" }));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    const conn = makeConnection();
    const wrapper = mountSidebar(conn);
    clickRow(wrapper.find(".sidebar-spaces .sidebar-row"));
    await wrapper.vm.$nextTick();
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
    expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w1" }]]);
  });

  it("右クリックで UiPort.openContextMenu を呼ぶ（workspace 対象）", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    await wrapper.find(".sidebar-spaces .sidebar-row").trigger("contextmenu", { clientX: 5, clientY: 6 });
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w1" }, { x: 5, y: 6 });
  });

  // 20260925-sidebar-keyboard-menu（design「振る舞いの詳細」手順4）。navigateMenuRequested は
  // ActionDispatcher.navigate("openMenu") が立てる想定だが、ここでは store を直接操作して
  // Sidebar.vue の watch だけを検証する（右クリックのテストと同じ粒度）。
  it("navigateMenuRequested が立つと、選択中の行の位置で UiPort.openContextMenu を呼び、要求を消す", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.onModeChange("navigate");
    view.setNavigateSelection("w1");
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w1" }, { x: expect.any(Number), y: expect.any(Number) });
    expect(view.navigateMenuRequested).toBe(false); // 一度きりのトリガー（design「エラー処理 / 異常系」）
    expect(view.navigateSelection).toBe("w1"); // 選択は保持される（design「設計方針」）
  });

  it("navigateMenuRequested が立っても選択が無ければ何も呼ばない", async () => {
    const view = useViewStore(pinia);
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).not.toHaveBeenCalled();
    expect(view.navigateMenuRequested).toBe(false);
  });

  it("該当する行の DOM が見つからなければ {x:0,y:0} にフォールバックする（design「エラー処理 / 異常系」）", async () => {
    const view = useViewStore(pinia);
    // navigateSelection がサイドバーに存在しない workspace を指す異常系（通常は起きない。研究F2参照）。
    view.setNavigateSelection("does-not-exist");
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "does-not-exist" }, { x: 0, y: 0 });
  });

  // taskcheck T5 round1 の指摘: 前の3件は「終わった状態」しか見ておらず、design が明記する
  // 「DOM 処理より前に要求を消す」という順序（例外安全性）自体は検証できていなかった。
  // ここでは DOM 処理の最終呼び出し（openContextMenu）が実行される**その瞬間**に
  // navigateMenuRequested が既に false であることを、モックの中で直接確認する
  // （呼び出し順を入れ替えると red になる——実際に一時的に入れ替えて確認済み。decisions.md D1）。
  it("navigateMenuRequested は DOM 処理（openContextMenu の呼び出し）より前に消える", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.onModeChange("navigate");
    view.setNavigateSelection("w1");
    let requestedWhenCalled: boolean | null = null;
    const openContextMenu = vi.fn(() => {
      requestedWhenCalled = view.navigateMenuRequested;
    });
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).toHaveBeenCalledTimes(1);
    expect(requestedWhenCalled).toBe(false);
  });

  it("navigate モードで選択中の workspace に選択スタイルを付ける", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.onModeChange("navigate");
    view.setNavigateSelection("w1");
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-spaces .sidebar-row").classes()).toContain("sidebar-row-selected");
  });

  // 20261004-group-worktree-items T15：navigate の選択はグループの見出しの行にも付き、メニューは見出しの位置でグループのメニューを開く。
  it("navigate モードで見出しを選ぶと見出しの行に選択スタイルが付き、メニューの要求はグループのメニューを開く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.groupUpserted({ id: "g2", label: "空", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "g:g2"], groups: { g1: ["w:w1"], g2: [] }, ungrouped: [] });
    view.onModeChange("navigate");
    view.setNavigateSelection("group:g2");
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    const selected = wrapper.findAll(".sidebar-spaces .sidebar-row-selected");
    expect(selected).toHaveLength(1);
    expect(selected[0]!.attributes("data-workspace-row-key")).toBe("group:g2");
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "group", groupId: "g2" }, { x: expect.any(Number), y: expect.any(Number) });
    expect(view.navigateSelection).toBe("group:g2");
  });

  it("navigate モードで、別の画面で消されたグループの見出しが選択に残っていても、メニューは開かず選択を外す", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.layoutChanged({ top: ["g:g1"], groups: { g1: ["w:w1"] }, ungrouped: [] });
    view.onModeChange("navigate");
    view.setNavigateSelection("group:g1");
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    session.groupDeleted("g1");
    view.requestNavigateMenu();
    await wrapper.vm.$nextTick();
    expect(openContextMenu).not.toHaveBeenCalled();
    expect(view.navigateSelection).toBeNull();
  });

  // 20260920-ui-selection-visuals：以前は「表示中」を示す見た目が無く、navigate モード中のカーソルだけだった（AC1）。
  it("表示中の workspace の行に、モードに関係なく表示中のスタイルと aria-current を付ける", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.workspaceUpserted(makeWorkspace("w2"));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountSidebar(makeConnection());
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row");
    expect(rows[0]!.classes()).toContain("sidebar-row-current");
    expect(rows[0]!.attributes("aria-current")).toBe("true");
    // 表示中でない行には**属性ごと**付けない（`aria-current` は既定 false で、AT に露出してはいけない）。
    expect(rows[1]!.classes()).not.toContain("sidebar-row-current");
    expect(rows[1]!.attributes("aria-current")).toBeUndefined();
  });

  // AC2：表示中（面）と navigate のカーソル（線）は別の表し方なので、同じ行で重なっても両方読める。
  it("表示中かつ navigate で選択中の行には、2 つのクラスが同時に付く", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    view.onModeChange("navigate");
    view.setNavigateSelection("w1");
    const wrapper = mountSidebar(makeConnection());
    const classes = wrapper.find(".sidebar-spaces .sidebar-row").classes();
    expect(classes).toContain("sidebar-row-current");
    expect(classes).toContain("sidebar-row-selected");
  });

  // AC3：`↑n ↓n` は縮めると意味を失うので、縮ませない印を付ける（省略の対象はブランチ名だけ）。
  it("2 行目の ↑n ↓n に、縮ませない印（sidebar-git-counts）を付ける", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 2, behind: 1, repoKey: null, isLinkedWorktree: false } }));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-row-line2 .sidebar-git-counts").text()).toBe("↑2 ↓1");
  });
});

// 20260920-sidebar-tabbar-controls：マウスで触れる導線を足す（キー操作は変えず、同じ `run` を通す）。
describe("Sidebar — ボタン", () => {
  it("折りたたみのボタンは畳んでも出し、aria-expanded で状態を伝える（AC1・AC2）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountSidebar(makeConnection(), actions);
    const btn = wrapper.get(".sidebar-collapse-btn");
    expect(btn.attributes("aria-expanded")).toBe("true");
    await btn.trigger("click");
    expect(actions.run).toHaveBeenCalledWith({ type: "toggleSidebar" });

    view.toggleSidebar(); // 畳んだ状態でも押せないと戻れなくなる
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-collapse-btn").exists()).toBe(true);
    expect(wrapper.get(".sidebar-collapse-btn").attributes("aria-expanded")).toBe("false");
  });

  it("「新規」はキーの prefix+shift+N と同じ action を送る（AC3）", async () => {
    const actions = makeActions();
    const wrapper = mountSidebar(makeConnection(), actions);
    await wrapper.findAll(".sidebar-section-footer .sidebar-btn")[0]!.trigger("click");
    expect(actions.run).toHaveBeenCalledWith({ type: "newWorkspace" });
  });

  it("「メニュー」は global のメニューを開き、開いている間は aria-expanded が true（AC4）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountSidebar(makeConnection(), actions);
    const btn = wrapper.get(".sidebar-section-footer .sidebar-btn-right");
    expect(btn.attributes("aria-expanded")).toBe("false");
    await btn.trigger("click");
    expect(actions.openContextMenu).toHaveBeenCalledWith({ kind: "global" }, expect.anything());
    // 実際に開くのは `ActionDispatcher` なので、ここではストアを直接動かして表示を確かめる。
    view.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".sidebar-section-footer .sidebar-btn-right").attributes("aria-expanded")).toBe("true");
  });

  // 帯ごとに分けて確かめる。1 つの it にまとめると、片方の `v-if` を外しても
  // もう片方の失敗に隠れて素通りする（独立点検で実際にそうなっていた）。
  it("折りたたむと spaces のフッタが消える（AC11）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-section-footer").exists()).toBe(true);
    view.toggleSidebar();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-section-footer").exists()).toBe(false);
  });

  it("折りたたむと agents の見出しが消える（AC11）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-section-header").exists()).toBe(true);
    view.toggleSidebar();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-section-header").exists()).toBe(false);
  });

  it("折りたたんでも、折りたたみの帯は残り押せる（AC1・AC11）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountSidebar(makeConnection(), actions);
    view.toggleSidebar();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-footer").exists()).toBe(true);
    await wrapper.get(".sidebar-collapse-btn").trigger("click"); // 畳んだ状態からも戻せる
    expect(actions.run).toHaveBeenCalledWith({ type: "toggleSidebar" });
  });

  // AC7：herdr と同じく「順序名そのものがボタン」。表示が現在値で、押すと切り替わる。
  // `.sidebar-sort-btn` は agents・spaces（20260922-appearance-settings-rest T2）の両方にあるので、
  // `.sidebar-agents` の中に絞る（`.sidebar-spaces` 側は別の describe で確認する）。
  it("ソートのボタンは現在の並び順を表示し、押すと切り替わる（AC7）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountSidebar(makeConnection());
    const btn = wrapper.get(".sidebar-agents .sidebar-sort-btn");
    expect(btn.text()).toBe("グループ順"); // 内部の値（grouped / priority）はそのまま出さない
    await btn.trigger("click");
    expect(view.agentSort).toBe("priority");
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".sidebar-agents .sidebar-sort-btn").text()).toBe("優先度順");
    await wrapper.get(".sidebar-agents .sidebar-sort-btn").trigger("click");
    expect(view.agentSort).toBe("grouped");
  });
});

// 20260925-focus-trapped-keybindings。`onButtonKeydown`（`Sidebar.vue` 6箇所）が、無修飾の
// Enter/Space だけを window の keydown（`main.ts` 側の prefix・直接キー処理の経路）へ渡さない
// ことを、コピペの貼り忘れ検知のため対象6箇所**全て**で個別に確認する
// （`PaneFrame.test.ts:101-111` と同型。design「受け入れ基準との対応」AC1）。
describe("Sidebar — ボタンの keydown：無修飾の Enter/Space だけ window へ渡さない（AC1・AC2・AC3・AC5）", () => {
  // `attachTo: document.body` で mount した要素は自動では外れない（`PaneFrame.test.ts` と同じ後始末）。
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /**
   * 無修飾の Enter/Space は window の keydown へ渡さない。修飾付き（ctrl/alt）・他のキー
   * （Tab 等）は従来どおり渡す。いずれの場合も `ev.defaultPrevented` は false のまま
   * （ネイティブな活性化を妨げない＝AC3）。happy-dom は合成 keydown からのネイティブな
   * button activation を再現しないため（decisions.md D0）、`click` の実発火ではなく
   * `defaultPrevented` で確認する。
   */
  function expectStopsOnlyUnmodifiedEnterSpace(target: Element): void {
    const onWindowKeydown = vi.fn();
    window.addEventListener("keydown", onWindowKeydown);
    const dispatch = (init: KeyboardEventInit): boolean => {
      const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(dispatch({ key: "Enter" })).toBe(false);
    expect(dispatch({ key: " " })).toBe(false);
    expect(onWindowKeydown).not.toHaveBeenCalled(); // 無修飾の Enter/Space はここまで届いていない（AC1・AC2）
    expect(dispatch({ key: "Enter", ctrlKey: true })).toBe(false);
    expect(dispatch({ key: " ", altKey: true })).toBe(false);
    expect(dispatch({ key: "Tab" })).toBe(false);
    expect(dispatch({ key: "b", ctrlKey: true, metaKey: true })).toBe(false);
    window.removeEventListener("keydown", onWindowKeydown);
    expect(onWindowKeydown).toHaveBeenCalledTimes(4); // 修飾付き Enter/Space・Tab・他の修飾キーは渡す（AC5）
  }

  it("並び順（spaces）", () => {
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.get(".sidebar-spaces .sidebar-sort-btn").element);
  });

  it("グループ折りたたみ▸", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.get(".sidebar-group-toggle").element);
  });

  it("＋新規", () => {
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.findAll(".sidebar-section-footer .sidebar-btn")[0]!.element);
  });

  it("メニュー", () => {
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.get(".sidebar-section-footer .sidebar-btn-right").element);
  });

  it("並び順（agents）", () => {
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.get(".sidebar-agents .sidebar-sort-btn").element);
  });

  it("サイドバー折りたたみ«/»", () => {
    const wrapper = mountSidebar(makeConnection(), undefined, { attachTo: true });
    expectStopsOnlyUnmodifiedEnterSpace(wrapper.get(".sidebar-collapse-btn").element);
  });
});

// 20260922-appearance-settings-rest T2（design「振る舞いの詳細」US1）。agents の並び順（上）と同じ形。
describe("Sidebar — spaces の並び順（AC1〜AC3）", () => {
  it("ソートのボタンは現在の並び順を表示し、押すと切り替わる。spaces 区画の表示順も実際に変わる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "banana" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "apple" }));
    const wrapper = mountSidebar(makeConnection());
    const labelsInOrder = (): string[] =>
      wrapper.findAll(".sidebar-spaces .sidebar-label").map((w) => w.text());
    expect(labelsInOrder()).toEqual(["banana", "apple"]); // AC3：既定は開いた順（サーバから届いた順）

    const btn = wrapper.get(".sidebar-spaces .sidebar-sort-btn");
    expect(btn.text()).toBe("開いた順"); // 内部の値（opened / name）はそのまま出さない
    await btn.trigger("click");
    expect(view.workspaceSort).toBe("name"); // AC3：切り替えた値は保存される（store が読み戻すことは view.test.ts で確認済み）
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".sidebar-spaces .sidebar-sort-btn").text()).toBe("名前順");
    expect(labelsInOrder()).toEqual(["apple", "banana"]); // AC2：名前順（文字列比較）

    await wrapper.get(".sidebar-spaces .sidebar-sort-btn").trigger("click");
    expect(view.workspaceSort).toBe("opened");
    await wrapper.vm.$nextTick();
    expect(labelsInOrder()).toEqual(["banana", "apple"]); // 開いた順に戻る
  });
});

// AC7〜AC9：並び順。`grouped` は並べ替えない（サーバが返す順がそのままグループになる）。
describe("Sidebar — agents の並び順", () => {
  function seedThreeAgents(): void {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    // 挿入順は idle → blocked → working。since は idle が最新。
    session.paneUpserted(makePane("p-idle", "t1", makeAgent({ instanceId: "a1", state: "idle", since: 300 })));
    session.paneUpserted(makePane("p-blocked", "t1", makeAgent({ instanceId: "a2", state: "blocked", since: 100 })));
    session.paneUpserted(makePane("p-working", "t1", makeAgent({ instanceId: "a3", state: "working", since: 200 })));
  }

  it("grouped（既定）では並べ替えない（AC9）", () => {
    seedThreeAgents();
    const wrapper = mountSidebar(makeConnection());
    const states = wrapper.findAll(".sidebar-agents .sidebar-row .sidebar-state-icon").map((el) => el.attributes("data-state"));
    expect(states).toEqual(["idle", "blocked", "working"]);
  });

  it("priority では状態の優先度の降順に並ぶ（AC8）", async () => {
    seedThreeAgents();
    const view = useViewStore(pinia);
    view.toggleAgentSort();
    const wrapper = mountSidebar(makeConnection());
    await wrapper.vm.$nextTick();
    const states = wrapper.findAll(".sidebar-agents .sidebar-row .sidebar-state-icon").map((el) => el.attributes("data-state"));
    expect(states).toEqual(["blocked", "working", "idle"]);
  });

  it("priority で優先度が同じなら、状態が最近変わったものが上（AC8）", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    // 並びが見分けられるよう、エージェント名を別にする（2 行目に出る）。
    session.paneUpserted(makePane("p-old", "t1", makeAgent({ instanceId: "a1", label: "古いほう", state: "working", since: 100 })));
    session.paneUpserted(makePane("p-new", "t1", makeAgent({ instanceId: "a2", label: "新しいほう", state: "working", since: 900 })));
    const view = useViewStore(pinia);
    view.toggleAgentSort();
    const wrapper = mountSidebar(makeConnection());
    await wrapper.vm.$nextTick();
    const rows = wrapper.findAll(".sidebar-agents .sidebar-row");
    expect(rows.length).toBe(2);
    expect(rows[0]!.text()).toContain("新しいほう"); // 挿入順では「古いほう」が先
    expect(rows[1]!.text()).toContain("古いほう");
  });
});

describe("Sidebar — agents", () => {
  // AC1：agents 区画の行が指すのは pane なので、workspace の「表示中」は付けない。
  it("表示中の workspace に属する agents の行にも、表示中のスタイルは付かない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent()));
    view.setView("w1", "t1");
    const wrapper = mountSidebar(makeConnection());
    const row = wrapper.find(".sidebar-agents .sidebar-row");
    expect(row.classes()).not.toContain("sidebar-row-current");
    expect(row.attributes("aria-current")).toBeUndefined();
  });

  it("エージェントの行に状態・workspace・tab・エージェント名を出す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "proj" }));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ label: "Claude Code", state: "working" })));
    const wrapper = mountSidebar(makeConnection());
    const row = wrapper.find(".sidebar-agents .sidebar-row");
    expect(row.text()).toContain("proj");
    expect(row.text()).toContain("t1");
    expect(row.text()).toContain("Claude Code");
    expect(row.find(".sidebar-state-icon").attributes("data-state")).toBe("working");
  });

  it("agent rename で付けた名前があれば、エージェントの種類の表示名の前に出す（20260926-agent-start-rename AC13）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ label: "Claude Code", name: "reviewer" })));
    session.paneUpserted(makePane("p2", "t1", makeAgent({ instanceId: "a2", label: "Codex" })));
    const wrapper = mountSidebar(makeConnection());
    const lines = wrapper.findAll(".sidebar-agents .sidebar-row-line2").map((el) => el.findAll("span").map((s) => s.text()));
    expect(lines).toContainEqual(["reviewer", "Claude Code"]);
    expect(lines).toContainEqual(["Codex"]);
    expect(wrapper.findAll(".sidebar-agent-name")).toHaveLength(1);
  });

  it("verified が false なら「未検証」を出す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ verified: false })));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-unverified").exists()).toBe(true);
  });

  it("verified が true なら「未検証」を出さない", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent({ verified: true })));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-unverified").exists()).toBe(false);
  });

  it("エージェントの居ない pane は一覧に出さない", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", null));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.findAll(".sidebar-agents .sidebar-row")).toHaveLength(0);
  });

  it("クリックでその pane の tab へ切り替えてフォーカスし、pane.focus を送る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t2", "w1", "p9"));
    session.paneUpserted(makePane("p9", "t2", makeAgent()));
    const conn = makeConnection();
    const wrapper = mountSidebar(conn);
    await wrapper.find(".sidebar-agents .sidebar-row").trigger("click");
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t2");
    expect(view.focusedPaneId).toBe("p9");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p9" }]]);
  });
});

// 20261004-subagent-display。エージェントの行の 1 行目の右端に、サブエージェントの件数のボタン。
describe("Sidebar — サブエージェントの件数のボタン", () => {
  const subs = (n: number) => ({ count: n, items: Array.from({ length: Math.min(n, 64) }, (_, i) => ({ id: `s${i}`, startedAt: 0 })) });
  function setup(agent: AgentInfo) {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", agent));
    return session;
  }
  const btn = (w: ReturnType<typeof mountSidebar>) => w.find(".sidebar-agents .sidebar-subagent-btn");

  it("1 件以上のときだけ出る（分からない・0 件では出さない）", () => {
    setup(makeAgent());
    expect(btn(mountSidebar(makeConnection())).exists()).toBe(false);
    setup(makeAgent({ subagents: subs(0) }));
    expect(btn(mountSidebar(makeConnection())).exists()).toBe(false);
    setup(makeAgent({ subagents: subs(3) }));
    const b = btn(mountSidebar(makeConnection()));
    expect(b.exists()).toBe(true);
    expect(b.text()).toBe("3");
    expect(b.attributes("aria-label")).toBe("サブエージェント 3 件を表示");
  });

  it("1 行目（状態の印のある行）の中にあり、行の数を増やさない", () => {
    setup(makeAgent({ subagents: subs(2) }));
    const w = mountSidebar(makeConnection());
    expect(btn(w).element.closest(".sidebar-row-line1")).not.toBeNull();
    const rows = w.findAll(".sidebar-agents .sidebar-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.findAll(".sidebar-row-line1")).toHaveLength(1);
  });

  it("押すと、そのエージェントの一覧のダイアログを開く（選んでいるマシンの pane）。行の click・pointerdown へ伝えない", async () => {
    setup(makeAgent({ subagents: subs(2) }));
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const rowClick = vi.fn();
    const w = mountSidebar(conn);
    w.get(".sidebar-agents .sidebar-row").element.addEventListener("click", rowClick);
    const rowPointerdown = vi.fn();
    w.get(".sidebar-agents .sidebar-row").element.addEventListener("pointerdown", rowPointerdown);
    // 前提: 行の中のボタン以外の場所の pointerdown は、行まで届く（このテストの観測が効いている）。
    w.get(".sidebar-agents .sidebar-row-line1").element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    expect(rowPointerdown).toHaveBeenCalledTimes(1);
    rowPointerdown.mockClear();
    btn(w).element.dispatchEvent(pointerEvent("pointerdown", { clientX: 1, clientY: 1 }));
    await btn(w).trigger("click");
    expect(view.dialogContext).toEqual({ kind: "subagents", machineId: "local", paneId: "p1", opener: "button" });
    expect(rowClick).not.toHaveBeenCalled();
    expect(rowPointerdown).not.toHaveBeenCalled();
    expect(conn.requests).toEqual([]); // pane.focus を送らない（pane へ移らない）
    expect(view.focusedPaneId).not.toBe("p1");
  });

  it("別のマシンを選んでいるときは、そのマシンの対象として開く（machineId は選んでいるマシンの ID）", async () => {
    const M2 = "c".repeat(32);
    setup(makeAgent({ subagents: subs(2) }));
    const machines = useMachinesStore(pinia);
    machines.setMachines([{ id: M2, label: "box", state: "online", message: null }] as never);
    machines.select(M2);
    const w = mountSidebar(makeConnection());
    await btn(w).trigger("click");
    expect(useViewStore(pinia).dialogContext).toEqual({ kind: "subagents", machineId: M2, paneId: "p1", opener: "button" });
  });

  it("古いサーバ（subagents の項目が無い）のエージェントの行は、ボタンが無いだけで、ほかは変わらない", () => {
    setup(makeAgent());
    const w = mountSidebar(makeConnection());
    const row = w.get(".sidebar-agents .sidebar-row");
    expect(w.find(".sidebar-subagent-btn").exists()).toBe(false);
    expect(row.text()).toContain("Claude Code");
    expect(row.findAll(".sidebar-row-line1")).toHaveLength(1);
    // 行の DOM は、subagents のある行からボタンを除いたものと同じ（ほかの表示は変わらない）。
    const strip = (html: string) => html.replace(/<button[^>]*sidebar-subagent-btn[\s\S]*?<\/button>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/ data-v-[0-9a-f]+=""/g, "").replace(/>\s+</g, "><");
    const oldHtml = strip(row.html());
    pinia = createPinia();
    setup(makeAgent({ subagents: subs(2) }));
    const withButton = mountSidebar(makeConnection()).get(".sidebar-agents .sidebar-row");
    expect(withButton.find(".sidebar-subagent-btn").exists()).toBe(true);
    expect(strip(withButton.html())).toBe(oldHtml);
  });

  it("畳んだサイドバーでは出さない", () => {
    setup(makeAgent({ subagents: subs(2) }));
    useViewStore(pinia).sidebarCollapsed = true;
    expect(btn(mountSidebar(makeConnection())).exists()).toBe(false);
  });

  it("Enter・Space は window へ伝えない（ほかのボタンと同じ。クリックとして動く）", () => {
    setup(makeAgent({ subagents: subs(2) }));
    const w = mountSidebar(makeConnection(), undefined, { attachTo: true });
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener("keydown", onKey);
    btn(w).element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    btn(w).element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    window.removeEventListener("keydown", onKey);
    expect(seen).toEqual(["ArrowDown"]);
    w.unmount();
  });

  it("件数が変わると数字が変わり、0 件で消える", async () => {
    const session = setup(makeAgent({ subagents: subs(2) }));
    const w = mountSidebar(makeConnection());
    session.paneUpserted(makePane("p1", "t1", makeAgent({ subagents: subs(5) })));
    await nextTick();
    expect(btn(w).text()).toBe("5");
    session.paneUpserted(makePane("p1", "t1", makeAgent({ subagents: subs(0) })));
    await nextTick();
    expect(btn(w).exists()).toBe(false);
  });

  it("別のエージェントの行には、それぞれの件数が出る", () => {
    const session = setup(makeAgent({ subagents: subs(2) }));
    session.paneUpserted(makePane("p2", "t1", makeAgent({ instanceId: "a2", subagents: subs(7) })));
    const texts = mountSidebar(makeConnection()).findAll(".sidebar-agents .sidebar-subagent-btn").map((b) => b.text()).sort();
    expect(texts).toEqual(["2", "7"]);
  });
});

describe("Sidebar — 折りたたみ", () => {
  it("view.sidebarCollapsed のときラベル類を出さない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "proj" }));
    view.toggleSidebar();
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar").classes()).toContain("sidebar-collapsed");
    expect(wrapper.find(".sidebar-label").exists()).toBe(false);
  });
});

describe("Sidebar — 幅のドラッグとダブルクリックでの復元（D56 の訂正 11）", () => {
  it("ドラッグで幅が変わる", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    const wrapper = mountSidebar(makeConnection());
    const divider = wrapper.find(".sidebar-divider");
    await divider.trigger("pointerdown", { clientX: 240 });
    await divider.trigger("pointermove", { clientX: 300 });
    expect((wrapper.find(".sidebar").element as HTMLElement).style.width).toBe("300px");
  });

  it("ダブルクリック（350ms 以内の 2 回目の pointerdown）で既定幅へ戻す", async () => {
    vi.useFakeTimers();
    try {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1"));
      const wrapper = mountSidebar(makeConnection());
      const divider = wrapper.find(".sidebar-divider");
      await divider.trigger("pointerdown", { clientX: 240 });
      await divider.trigger("pointermove", { clientX: 300 });
      await divider.trigger("pointerup");
      await divider.trigger("pointerdown", { clientX: 300 }); // 2 回目（350ms 以内）
      expect((wrapper.find(".sidebar").element as HTMLElement).style.width).toBe("240px");
    } finally {
      vi.useRealTimers();
    }
  });
});

// 20260921-herdr-settings-gaps の AC1・AC-I5：幅は**ドラッグを終えたときに 1 回**保存する（途中では書かない）。
// E2E が通すのは `pointerup` の経路だけなので、ほかの終わり方はここで 1 つずつ固定する。
describe("Sidebar — 幅を覚える", () => {
  function setup() {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    const wrapper = mountSidebar(makeConnection());
    return { wrapper, divider: wrapper.find(".sidebar-divider") };
  }
  const saved = (): unknown => readPrefs()["sidebarWidth"];

  it("ドラッグの途中では保存しない", async () => {
    const { divider } = setup();
    await divider.trigger("pointerdown", { clientX: 240 });
    await divider.trigger("pointermove", { clientX: 300 });
    expect(saved()).toBeUndefined();
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])("%s でドラッグを終えると、見えている幅を保存する", async (ev) => {
    const { divider } = setup();
    await divider.trigger("pointerdown", { clientX: 240 });
    await divider.trigger("pointermove", { clientX: 300 });
    await divider.trigger(ev);
    expect(saved()).toBe(300);
  });

  it("終えた後の pointermove では幅も保存値も変わらない（pointerup の後の lostpointercapture でも 2 度書かない）", async () => {
    const { wrapper, divider } = setup();
    await divider.trigger("pointerdown", { clientX: 240 });
    await divider.trigger("pointermove", { clientX: 300 });
    await divider.trigger("pointerup");
    writePrefs({ sidebarWidth: 999 }); // 2 度目に書いたら上書きされて分かる印
    await divider.trigger("lostpointercapture");
    await divider.trigger("pointermove", { clientX: 200 });
    expect(saved()).toBe(999);
    expect((wrapper.find(".sidebar").element as HTMLElement).style.width).toBe("300px");
  });

  it("ダブルクリックで既定に戻したときも保存する", async () => {
    vi.useFakeTimers();
    try {
      const { divider } = setup();
      await divider.trigger("pointerdown", { clientX: 240 });
      await divider.trigger("pointermove", { clientX: 300 });
      await divider.trigger("pointerup");
      await divider.trigger("pointerdown", { clientX: 300 }); // 2 回目（350ms 以内）
      expect(saved()).toBe(240);
    } finally {
      vi.useRealTimers();
    }
  });

  // AC-I5：`showModal()` でポインタの捕捉がどうなるかは確かめた出所が無いので、こちらで終わらせる。
  it("ドラッグ中にダイアログが開いたら、その時点で終えて保存し、以後の pointermove を無視する", async () => {
    const { wrapper, divider } = setup();
    await divider.trigger("pointerdown", { clientX: 240 });
    await divider.trigger("pointermove", { clientX: 320 });
    useViewStore(pinia).openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    expect(saved()).toBe(320);
    await divider.trigger("pointermove", { clientX: 200 });
    expect((wrapper.find(".sidebar").element as HTMLElement).style.width, "終えた後は動かない").toBe("320px");
  });

  // 起点はストアの幅。既定の 240 から 1 回だけ動かすテストでは、起点を既定に固定する・累積で足す、の壊れ方を見分けられない。
  it("ドラッグの起点は保存された幅で、pointermove は起点からの移動量で決まる", async () => {
    writePrefs({ sidebarWidth: 280 });
    pinia = createPinia();
    const { wrapper, divider } = setup();
    await divider.trigger("pointerdown", { clientX: 100 });
    await divider.trigger("pointermove", { clientX: 120 });
    await divider.trigger("pointermove", { clientX: 150 });
    expect((wrapper.find(".sidebar").element as HTMLElement).style.width).toBe("330px");
  });

  it("畳んでいる間は、境目を動かしても幅も保存値も変わらない", async () => {
    const { wrapper, divider } = setup();
    useViewStore(pinia).toggleSidebar();
    await wrapper.vm.$nextTick();
    writePrefs({ sidebarWidth: 240 });
    await divider.trigger("pointerdown", { clientX: 40 });
    await divider.trigger("pointermove", { clientX: 140 });
    await divider.trigger("pointerup");
    expect(saved()).toBe(240);
    expect(useViewStore(pinia).sidebarWidth).toBe(240);
  });

  it("ドラッグしていないときにダイアログが開いても保存しない", async () => {
    const { wrapper } = setup();
    useViewStore(pinia).openDialogWithContext({ kind: "settings" });
    await wrapper.vm.$nextTick();
    expect(saved()).toBeUndefined();
  });

  it("保存された幅で開く（AC1）", () => {
    writePrefs({ sidebarWidth: 280 });
    pinia = createPinia(); // ストアは作る時点で読む
    const { wrapper } = setup();
    expect((wrapper.find(".sidebar").element as HTMLElement).style.width).toBe("280px");
  });
});

// 20260923-workspace-grouping（herdr に前例が無い独自拡張・worktree 自動グループ）。
describe("Sidebar — グループの表示", () => {
  function rowLabels(wrapper: ReturnType<typeof mountSidebar>): string[] {
    return wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.find(".sidebar-label").text());
  }
  function rowIndents(wrapper: ReturnType<typeof mountSidebar>): boolean[] {
    return wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.classes().includes("sidebar-row-indent"));
  }

  it("手動グループ：ヘッダー行（グループ名）＋インデントしたメンバー行", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "api", groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "worker", groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const wrapper = mountSidebar(makeConnection());
    // 本物のグループがあるので、末尾に「グループなし」の見出し（中は空）が付く（追補 01 B）。
    expect(rowLabels(wrapper)).toEqual(["backend", "api", "worker", "グループなし"]);
    expect(rowIndents(wrapper)).toEqual([false, true, true, false]);
  });

  it("worktree 自動グループ：本体の行が頭を兼ね、子だけインデントする（herdr と同じ並び）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "main", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "wt", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    const wrapper = mountSidebar(makeConnection());
    expect(rowLabels(wrapper)).toEqual(["main", "wt"]);
    expect(rowIndents(wrapper)).toEqual([false, true]);
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row")[0]!.find(".sidebar-group-toggle").exists()).toBe(true);
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row")[1]!.find(".sidebar-group-toggle").exists()).toBe(false);
  });

  it("手動グループが折りたたまれていればメンバー行を隠す", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "api", groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: true });
    const wrapper = mountSidebar(makeConnection());
    expect(rowLabels(wrapper)).toEqual(["backend", "グループなし"]);
  });

  it("折りたたみ中でも focus 中の workspace があればその行だけは見える（AC6）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "api", groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "worker", groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: true });
    view.setView("w2", "t1");
    const wrapper = mountSidebar(makeConnection());
    expect(rowLabels(wrapper)).toEqual(["backend", "worker", "グループなし"]);
  });

  // AC3（worktree 自動グループ版。上と同じ挙動を manual/auto の両方で確かめる——test 工程で見つけた
  // 抜け：`Sidebar.vue` の `visibleChildren` 分岐が auto グループにも専用で存在するのに、この
  // 挙動を確かめるテストが手動グループ側にしか無かった）。
  it("worktree 自動グループが折りたたまれていても、focus 中の子 workspace はその行だけ見える（AC3）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "main", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "wt", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    view.toggleAutoGroupCollapsed("/r/.git"); // 折りたたむ（ブラウザ側の状態）
    view.setView("w2", "t1"); // w2（子）に focus
    const wrapper = mountSidebar(makeConnection());
    expect(rowLabels(wrapper)).toEqual(["main", "wt"]); // 折りたたみ中でも focus 中の wt は見える
  });

  it("worktree 自動グループが折りたたまれていて focus 中の workspace が無ければ、本体の行だけになる", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "main", git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "wt", git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    view.toggleAutoGroupCollapsed("/r/.git");
    const wrapper = mountSidebar(makeConnection());
    expect(rowLabels(wrapper)).toEqual(["main"]);
  });

  it("折りたたみアイコンのクリック：手動グループは toggleGroupCollapsed を呼ぶ（サーバへ永続化。AC6）", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const toggleGroupCollapsed = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { toggleGroupCollapsed });
    await wrapper.get(".sidebar-group-toggle").trigger("click");
    expect(toggleGroupCollapsed).toHaveBeenCalledWith("g1");
  });

  it("折りたたみアイコンのクリック：worktree 自動グループはブラウザだけで完結する（RPC を呼ばない）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { git: { branch: "f", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    const toggleGroupCollapsed = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { toggleGroupCollapsed });
    await wrapper.get(".sidebar-group-toggle").trigger("click");
    expect(toggleGroupCollapsed).not.toHaveBeenCalled();
    expect(view.collapsedAutoGroups.has("/r/.git")).toBe(true);
  });

  it("手動グループのヘッダー行を右クリックすると group 対象で openContextMenu を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const openContextMenu = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { openContextMenu });
    await wrapper.get(".sidebar-spaces .sidebar-row").trigger("contextmenu", { clientX: 1, clientY: 2 });
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "group", groupId: "g1" }, { x: 1, y: 2 });
  });
});

describe("Sidebar — workspace 行の D&D（20260923-workspace-grouping）", () => {
  it("閾値未満の移動はドラッグにならず、離すとクリック（フォーカス）として扱う", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { activeTabId: "t1" }));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    const row = wrapper.get(".sidebar-spaces .sidebar-row").element;
    row.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    row.dispatchEvent(pointerEvent("pointermove", { clientX: 12, clientY: 10 })); // 2px。閾値(6px)未満
    row.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 10 }));
    await wrapper.vm.$nextTick();
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.workspaceId).toBe("w1"); // クリックとして扱われた
  });

  it("閾値を超えて動かし別の行の上で離すと moveItemByDrag(自分の項目, 相手の項目, 古いサーバ用の id) を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "a" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "b" }));
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement);
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(rows[1]!);
    rows[0]!.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    rows[0]!.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 40 })); // 30px。閾値を超える
    rows[0]!.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 40 }));
    expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w1" }, null, { workspaceIds: ["w1"], beforeWorkspaceId: "w2" }); // 下へ・最後の項目の上 → 末尾（before: null）
    elementFromPoint.mockRestore();
  });

  it("グループのヘッダー行をドラッグすると、そのグループの全メンバー id をまとめて動かす（AC9）", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement);
    // rows: [0]=グループヘッダー, [1]=w1, [2]=w2, [3]=「グループなし」の見出し, [4]=w3(other)
    // グループは、まとまりの列（グループ・「グループなし」）の中でだけ並べ替えられる。
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(rows[3]!);
    rows[0]!.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    rows[0]!.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 60 }));
    rows[0]!.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
    expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "group", groupId: "g1" }, null, { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w3" }); // 下へ・最後のまとまりの上 → 末尾
    elementFromPoint.mockRestore();
  });

  it("Esc で取り消し、moveItemByDrag を呼ばない", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.workspaceUpserted(makeWorkspace("w2"));
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement);
    // 離した位置に落とせる行がある状態にする（無いと Esc が効かなくても何も送られず、取り消しを確かめられない）。
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(rows[1]!);
    rows[0]!.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    rows[0]!.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 40 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    rows[0]!.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 40 }));
    expect(useViewStore(pinia).workspaceDrag).toBeNull();
    expect(moveItemByDrag).not.toHaveBeenCalled();
    elementFromPoint.mockRestore();
  });

  // タスク点検の指摘：ドロップ候補のハイライトは「ドラッグの発生源に含まれない、今ホバー中の行」
  // にだけ付く。以前は自分自身の `dragIds` と比べていて、原理的に一度も付かなかった（死んだ論理）。
  it("ドラッグ中に別の行の上へ来ると sidebar-row-drop-target が付き、ドラッグ元自身には付かない", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "a" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "b" }));
    const wrapper = mountSidebar(makeConnection());
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement);
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(rows[1]!);
    rows[0]!.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    rows[0]!.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 40 }));
    await wrapper.vm.$nextTick();
    expect(view.workspaceDrag?.overRowKey).toBe("w2");
    const rowsAfter = wrapper.findAll(".sidebar-spaces .sidebar-row");
    expect(rowsAfter[0]!.classes()).not.toContain("sidebar-row-drop-target"); // ドラッグ元自身
    expect(rowsAfter[1]!.classes()).toContain("sidebar-row-drop-target"); // ドロップ候補
    elementFromPoint.mockRestore();
  });

  // 20261004-group-worktree-items：落とせるのは同じ入れ物（一番上・同じグループの中）の項目の間だけ。
  // 掴んだ行・ホバーした行を使うテストの共通の動かし方。
  afterEach(() => vi.restoreAllMocks());
  function drag(wrapper: ReturnType<typeof mountSidebar>, fromKey: string, overKey: string | null, release = true): { overEl: HTMLElement | null } {
    const rowOf = (key: string) => wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement).find((e) => e.dataset.workspaceRowKey === key)!;
    const from = rowOf(fromKey);
    const overEl = overKey === null ? null : rowOf(overKey);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(overEl);
    from.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    from.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 60 }));
    if (release) from.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
    return { overEl };
  }

  function setUpGroupWithOther(): void {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "m1", groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "m2", groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
    session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:w1", "w:w2"] }, ungrouped: ["w:w3"] });
  }
  const CROSS_CONTAINER_MESSAGE = "同じグループの中、または同じ「グループなし」の中の項目の間でだけ並べ替えできます";

  it("「グループなし」の項目を、グループの中の行の上へ落とすことはできない（印が付き、離しても送らず知らせる）", async () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "w3", "w2", false);
    await wrapper.vm.$nextTick();
    const row = wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "w2")!;
    expect(row.classes()).toContain("sidebar-row-drop-invalid");
    expect(row.classes()).not.toContain("sidebar-row-drop-target");
    // ポインタは掴んだ行（w3）に捕捉されているので、pointerup は掴んだ行へ届く。
    wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "w3")!.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts.map((t) => t.message)).toContain(CROSS_CONTAINER_MESSAGE);
  });

  it("グループの中の項目を、「グループなし」の行の上へ落とすことはできない（送らず知らせる）", () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "w1", "w3");
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts.map((t) => t.message)).toContain(CROSS_CONTAINER_MESSAGE);
  });

  it("グループの中の項目は、同じグループの別の項目の前へ並べ替えられる（item.move 用の項目を渡す）", () => {
    setUpGroupWithOther();
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "w2", "w1");
    expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w2" }, { kind: "workspace", workspaceId: "w1" }, { workspaceIds: ["w2"], beforeWorkspaceId: "w1" });
  });

  describe("落とす位置は端末版と同じ（T30。上へなら落とした項目の前、下へなら次の前、末尾は null）", () => {
    const W = (id: string) => ({ kind: "workspace" as const, workspaceId: id });
    function setUpThree(): void {
      const session = useSessionStore(pinia);
      for (const id of ["w1", "w2", "w3", "w4"]) session.workspaceUpserted(makeWorkspace(id, { label: id }));
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:w1", "w:w2", "w:w3"] }, ungrouped: ["w:w4"] });
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    }
    it("下へ動かすと、落とした項目の次の項目の前（すぐ下の項目の上でも並びが変わる）", () => {
      setUpThree();
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w1", "w2");
      expect(moveItemByDrag).toHaveBeenCalledWith(W("w1"), W("w3"), expect.anything());
    });
    it("下へ動かして最後の項目の上へ落とすと、末尾（before: null）", () => {
      setUpThree();
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w1", "w3");
      expect(moveItemByDrag).toHaveBeenCalledWith(W("w1"), null, expect.anything());
    });
    it("上へ動かすと、落とした項目の前", () => {
      setUpThree();
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w3", "w1");
      expect(moveItemByDrag).toHaveBeenCalledWith(W("w3"), W("w1"), expect.anything());
    });
    it("畳んで見えない項目も次の項目として数える（worktree グループの子は親の項目の次へ）", () => {
      const session = useSessionStore(pinia);
      const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
      session.workspaceUpserted(makeWorkspace("w1", { label: "main", git: git(false) }));
      session.workspaceUpserted(makeWorkspace("w2", { label: "feat", git: git(true) }));
      session.workspaceUpserted(makeWorkspace("w3", { label: "x" }));
      session.workspaceUpserted(makeWorkspace("w4", { label: "y" }));
      session.layoutChanged({ top: ["r:/r/.git", "w:w3", "w:w4"], groups: {}, ungrouped: [] });
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w3", "w2"); // 子の行 = 親の worktree グループ（w1）。上へなので w1 の前
      drag(wrapper, "w2", "w3"); // worktree グループを下へ・w3 の上 → 次の w4 の前
      expect(moveItemByDrag).toHaveBeenNthCalledWith(1, W("w3"), W("w1"), expect.anything());
      expect(moveItemByDrag).toHaveBeenNthCalledWith(2, W("w1"), W("w4"), expect.anything());
    });
    it("古いサーバ（layout が無い）の workspace.move_to へ渡す落とし先は、今までどおり落とした項目の先頭の workspace（D22）", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1", { label: "a" }));
      session.workspaceUpserted(makeWorkspace("w2", { label: "b" }));
      session.workspaceUpserted(makeWorkspace("w3", { label: "c" }));
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w1", "w2");
      expect(moveItemByDrag).toHaveBeenCalledWith(W("w1"), W("w3"), { workspaceIds: ["w1"], beforeWorkspaceId: "w2" });
    });
  });

  it("グループを、別のグループの中の行の上へ落とすことはできない", () => {
    setUpGroupWithOther();
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w4", { label: "x4", groupId: "g2" }));
    session.groupUpserted({ id: "g2", label: "front", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "g:g2", "u"], groups: { g1: ["w:w1", "w:w2"], g2: ["w:w4"] }, ungrouped: ["w:w3"] });
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "group:g1", "w4");
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts).toHaveLength(1);
  });

  it("グループを、「グループなし」の中の行の上へ落とすことはできない（グループは見出しの間でだけ動く）", () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "group:g1", "w3");
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts.map((t) => t.message)).toEqual([CROSS_CONTAINER_MESSAGE]);
  });

  it("「グループなし」の見出しは掴める。ほかのグループの見出しの前へ落とすと、見出しの項目（{ kind: \"ungrouped\" }）を渡す", () => {
    setUpGroupWithOther();
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "ungrouped:", "group:g1");
    expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "ungrouped" }, { kind: "group", groupId: "g1" }, { workspaceIds: ["w3"], beforeWorkspaceId: "w1" });
  });

  it("掴んだ「グループなし」の中の行の上で離しても何も送らず、知らせない（自分の項目の上）", () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "ungrouped:", "w3");
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts).toHaveLength(0);
  });

  it("古いサーバ（layout が無い）では「グループなし」の見出しは掴めない（workspace.move_to では動かせない）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "m1", groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "ungrouped:", "group:g1", false);
    expect(view.workspaceDrag).toBeNull();
    wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "ungrouped:")!.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
    expect(moveItemByDrag).not.toHaveBeenCalled();
  });

  it("掴んだグループ自身の中の行の上で離しても何も送らず、知らせない（自分の項目の上）", () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "group:g1", "w2");
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts).toHaveLength(0);
  });

  it("行の外で離すと取り消し（送らず、知らせない）", () => {
    setUpGroupWithOther();
    const view = useViewStore(pinia);
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    drag(wrapper, "w3", null);
    expect(moveItemByDrag).not.toHaveBeenCalled();
    expect(view.toasts).toHaveLength(0);
  });

  it("離したあと、掴んだ行の workspace にフォーカスを残す（workspace.focus も送る）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "a", activeTabId: "t1" }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "b", activeTabId: "t2" }));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    view.setView("w2", "t2");
    const conn = makeConnection();
    const wrapper = mountSidebar(conn);
    drag(wrapper, "w1", "w2");
    expect(view.workspaceId).toBe("w1");
    expect(conn.requests).toContainEqual(["workspace.focus", { workspaceId: "w1" }]);
  });

  describe("古いサーバ（layout が無い）で、メンバーのいない空のグループ", () => {
    function setUpEmptyGroup(): void {
      const session = useSessionStore(pinia);
      session.groupUpserted({ id: "g1", label: "empty", collapsed: false });
      session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
    }

    it("その行の上は落とし先にならない（印を出さず、離しても送らず知らせない）", async () => {
      setUpEmptyGroup();
      const view = useViewStore(pinia);
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w3", "group:g1", false);
      await wrapper.vm.$nextTick();
      const row = wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "group:g1")!;
      expect(row.classes()).not.toContain("sidebar-row-drop-target");
      expect(row.classes()).not.toContain("sidebar-row-drop-invalid");
      wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "w3")!.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
      expect(moveItemByDrag).not.toHaveBeenCalled();
      expect(view.toasts).toHaveLength(0);
    });

    it("空のグループは掴めない（ドラッグが始まらず、workspaceIds: [] を送らない）", () => {
      setUpEmptyGroup();
      const view = useViewStore(pinia);
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "group:g1", "w3", false);
      expect(view.workspaceDrag).toBeNull();
      wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "group:g1")!.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
      expect(moveItemByDrag).not.toHaveBeenCalled();
    });
  });

  describe("worktree グループ（子を掴んでも動くのは worktree グループ全体）", () => {
    function setUpWorktree(): void {
      const session = useSessionStore(pinia);
      const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
      session.workspaceUpserted(makeWorkspace("w1", { label: "main", git: git(false) }));
      session.workspaceUpserted(makeWorkspace("w2", { label: "feat", git: git(true) }));
      session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
      session.layoutChanged({ top: ["r:/r/.git", "w:w3"], groups: {}, ungrouped: [] });
    }

    it("子の行を掴むと、worktree グループ（先頭の workspace で指す項目）と全メンバーの id が渡る", () => {
      setUpWorktree();
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w2", "w3");
      expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w1" }, null, { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w3" });
    });

    it("子の行の上へ落とすと、落とし先は親の worktree グループ（先頭の workspace）になる", () => {
      setUpWorktree();
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w3", "w2");
      expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w3" }, { kind: "workspace", workspaceId: "w1" }, { workspaceIds: ["w3"], beforeWorkspaceId: "w1" });
    });

    it("自分の worktree グループの別の行（先頭・子）の上で離しても何も送らず、知らせない", () => {
      setUpWorktree();
      const view = useViewStore(pinia);
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w2", "w1");
      expect(moveItemByDrag).not.toHaveBeenCalled();
      expect(view.toasts).toHaveLength(0);
    });
  });

  describe("名前順（design「並びと名前順」）", () => {
    it("グループどうしの並べ替えは受け付けず、送らずに「名前順では並べ替えできません」と知らせる", async () => {
      setUpGroupWithOther();
      const view = useViewStore(pinia);
      view.workspaceSort = "name";
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "group:g1", "ungrouped:", false);
      await wrapper.vm.$nextTick();
      const target = wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "ungrouped:")!;
      expect(target.classes()).toContain("sidebar-row-drop-invalid"); // 落とせない印
      wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === "group:g1")!.element.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
      expect(moveItemByDrag).not.toHaveBeenCalled();
      expect(view.toasts.map((t) => t.message)).toEqual(["名前順では並べ替えできません"]);
    });

    it("「グループなし」の中の項目の並べ替えも受け付けない（名前で決まるので、送っても変わらない）", () => {
      setUpGroupWithOther();
      useSessionStore(pinia).workspaceUpserted(makeWorkspace("w4", { label: "other2" }));
      useSessionStore(pinia).layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:w1", "w:w2"] }, ungrouped: ["w:w3", "w:w4"] });
      const view = useViewStore(pinia);
      view.workspaceSort = "name";
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w4", "w3");
      expect(moveItemByDrag).not.toHaveBeenCalled();
      expect(view.toasts.map((t) => t.message)).toEqual(["名前順では並べ替えできません"]);
    });

    it("グループの中の並べ替えは名前順でもできる", () => {
      setUpGroupWithOther();
      const view = useViewStore(pinia);
      view.workspaceSort = "name";
      const moveItemByDrag = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
      drag(wrapper, "w2", "w1");
      expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "workspace", workspaceId: "w2" }, { kind: "workspace", workspaceId: "w1" }, { workspaceIds: ["w2"], beforeWorkspaceId: "w1" });
      expect(view.toasts).toHaveLength(0);
    });
  });

  // タスク点検の指摘：トグルボタンの pointerdown/pointerup が行へ伝播すると、`onToggleCollapse` が
  // （ボタンの `@click.stop` 経由と合わせて）2 重に呼ばれる、または worktree 自動グループの頭では
  // 意図せず `focusWorkspace` が呼ばれてしまう。`.stop` で止めて 1 回だけにする。
  // **`.trigger("click")` だけでは再現しない**——実際のクリックは pointerdown→pointerup→click の
  // 順に、いずれも行まで**バブルする**（`.stop` がなければ）。行の pointerdown/pointerup ハンドラが
  // 動くところまで含めて確かめるため、3つとも明示的に発火させる。
  it("折りたたみアイコンのクリックは行のドラッグ/クリック処理を起動しない（二重発火の回帰）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const toggleGroupCollapsed = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { toggleGroupCollapsed });
    const toggle = wrapper.get(".sidebar-group-toggle").element;
    toggle.dispatchEvent(pointerEvent("pointerdown", { clientX: 5, clientY: 5 }));
    toggle.dispatchEvent(pointerEvent("pointerup", { clientX: 5, clientY: 5 }));
    await wrapper.get(".sidebar-group-toggle").trigger("click");
    expect(toggleGroupCollapsed).toHaveBeenCalledTimes(1); // 2 重に呼ばれない
    expect(view.workspaceId).toBeNull(); // 行のクリック（フォーカス）は起きていない
  });

  it("worktree 自動グループの頭の折りたたみアイコンをクリックしても focusWorkspace が呼ばれない（回帰）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { git: { branch: "f", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    const conn = makeConnection();
    const wrapper = mountSidebar(conn);
    const toggle = wrapper.get(".sidebar-group-toggle").element;
    toggle.dispatchEvent(pointerEvent("pointerdown", { clientX: 5, clientY: 5 }));
    toggle.dispatchEvent(pointerEvent("pointerup", { clientX: 5, clientY: 5 }));
    await wrapper.get(".sidebar-group-toggle").trigger("click");
    expect(view.workspaceId).toBeNull(); // フォーカスは動いていない
    expect(conn.requests.filter(([m]) => m === "workspace.focus")).toEqual([]);
  });

  // 右クリック（button=2）の pointerup が行のクリック扱いになり、見出しの折りたたみが切り替わる・workspace の行で
  // focusWorkspace が呼ばれる不具合の回帰。メニューは contextmenu で開く。左クリックは従来どおり。
  describe("左ボタン以外の押下は行のクリックにしない", () => {
    function pressRow(row: Element, button: number): void {
      row.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10, button }));
      row.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 10, button }));
    }
    it("グループの見出しを右クリックしても折りたたみが切り替わらない（左クリックは切り替わる）", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      const toggleGroupCollapsed = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { toggleGroupCollapsed });
      const head = wrapper.findAll(".sidebar-row")[0]!.element;
      pressRow(head, 2);
      pressRow(head, 1);
      expect(toggleGroupCollapsed).not.toHaveBeenCalled();
      pressRow(head, 0);
      expect(toggleGroupCollapsed).toHaveBeenCalledTimes(1);
    });
    it("通常の workspace の行を右クリックしても workspace が切り替わらない（左クリックは切り替わる）", () => {
      const session = useSessionStore(pinia);
      const view = useViewStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1"));
      session.tabUpserted(makeTab("t1", "w1"));
      const conn = makeConnection();
      const wrapper = mountSidebar(conn);
      const row = wrapper.get(".sidebar-spaces .sidebar-row").element;
      pressRow(row, 2);
      expect(view.workspaceId).toBeNull();
      expect(conn.requests).toEqual([]);
      pressRow(row, 0);
      expect(view.workspaceId).toBe("w1");
      expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w1" }]]);
    });
  });

  // タスク点検の指摘：ドロップ確定時は「ドラッグ開始時点のスナップショット」を使う。ドラッグ中に
  // グループ構成が変わっても（他クライアントの操作等）、実際に動かす対象がドラッグ開始時と変わらない。
  it("ドラッグ中にグループの構成が変わっても、開始時点のメンバー集合で移動する", async () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w2", { groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("w3", { label: "other" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const moveItemByDrag = vi.fn();
    const wrapper = mountSidebar(makeConnection(), { moveItemByDrag });
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.element as HTMLElement);
    // rows: [0]=グループヘッダー, [1]=w1, [2]=w2, [3]=「グループなし」の見出し, [4]=w3(other)
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(rows[3]!);
    rows[0]!.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    rows[0]!.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 60 }));
    // ドラッグの最中に w2 がグループから外れる（他クライアントの操作を模す）。
    session.workspaceUpserted({ ...session.workspaces.get("w2")!, groupId: null });
    await wrapper.vm.$nextTick();
    rows[0]!.dispatchEvent(pointerEvent("pointerup", { clientX: 10, clientY: 60 }));
    // 開始時点のメンバー（w1・w2 の両方）で移動する——ドロップ時点の最新の構成（w1 だけ）ではない。
    // 落とし先の「グループなし」の先頭は、w2 が加わった最新の構成の w2。
    expect(moveItemByDrag).toHaveBeenCalledWith({ kind: "group", groupId: "g1" }, null, { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w2" });
    elementFromPoint.mockRestore();
  });
});

// 20260924-pane-move-cross-tab（design「クライアント側: ドロップ先の拡張」AC7）。
describe("Sidebar — pane D&D のドロップ先（サイドバーの workspace 行）", () => {
  it("workspace を表す行には data-drop-workspace-id が付く", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    const wrapper = mountSidebar(makeConnection());
    const row = wrapper.get(".sidebar-spaces .sidebar-row");
    expect(row.attributes("data-drop-workspace-id")).toBe("w1");
  });

  it("手動グループのヘッダー行には付かないが、メンバー行には付く（特定の workspace を表す行とヘッダー行の混同を防ぐ）", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const wrapper = mountSidebar(makeConnection());
    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row");
    const header = rows[0]!;
    const member = rows[1]!;
    expect(header.attributes("data-drop-workspace-id")).toBeUndefined();
    expect(member.attributes("data-drop-workspace-id")).toBe("w1");
  });

  it("view.paneDrag.overWorkspaceId に一致する workspace 行だけドロップ候補のハイライトが付く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.workspaceUpserted(makeWorkspace("w2"));
    const wrapper = mountSidebar(makeConnection());

    view.startPaneDrag("p9");
    view.setPaneDragOverWorkspace("w2");
    await wrapper.vm.$nextTick();

    const rows = wrapper.findAll(".sidebar-spaces .sidebar-row");
    expect(rows[0]!.classes()).not.toContain("sidebar-row-pane-drop-target");
    expect(rows[1]!.classes()).toContain("sidebar-row-pane-drop-target");
  });

  it("ドラッグしていなければどの行にもハイライトが付かない", () => {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.get(".sidebar-spaces .sidebar-row").classes()).not.toContain("sidebar-row-pane-drop-target");
  });
});

/** 20260926-named-session-ui（AC2・AC17・AC-I1・AC-I3）。 */
describe("Sidebar — session のボタン", () => {
  const HOST = { os: "linux" as const, windowsBuild: null, hostname: "h" };

  it("名前付き session なら上端に session の名前のボタンを出し、押すと一覧を開く", async () => {
    const session = useSessionStore(pinia);
    session.host = { ...HOST, sessionName: "work" };
    const actions = { openSessionSwitcher: vi.fn() };
    const wrapper = mountSidebar(makeConnection(), actions);
    const btn = wrapper.get(".sidebar-session-btn");
    expect(btn.text()).toContain("session: work");
    expect(btn.attributes("aria-haspopup")).toBe("dialog");
    expect(btn.attributes("aria-label")).toBe("session: work（押すと session の一覧）");
    // 最上段（spaces より前）
    expect(wrapper.element.firstElementChild?.classList.contains("sidebar-session")).toBe(true);
    await btn.trigger("click");
    expect(actions.openSessionSwitcher).toHaveBeenCalledTimes(1);
  });

  it("既定の session は、名前付き session が無ければ出さず（今までどおり）、あれば default として出す", async () => {
    const session = useSessionStore(pinia);
    session.host = HOST;
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-session").exists()).toBe(false);
    session.setNamedSessionCount(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".sidebar-session-btn").text()).toContain("session: default");
  });

  it("折りたたみ中は文字を出さず、名前は aria-label と title に出す", async () => {
    const session = useSessionStore(pinia);
    session.host = { ...HOST, sessionName: "work" };
    useViewStore(pinia).toggleSidebar(); // localStorage は beforeEach で消してあるので、畳んだ状態になる
    expect(useViewStore(pinia).sidebarCollapsed).toBe(true);
    const wrapper = mountSidebar(makeConnection());
    const btn = wrapper.get(".sidebar-session-btn");
    expect(btn.text()).toBe("⇄");
    expect(btn.attributes("aria-label")).toContain("session: work");
    expect(btn.attributes("title")).toBe("session: work");
  });

  it("ボタンの Enter・Space は window のキーの経路へ二重に渡さない（ネイティブのクリックに任せる。AC-I3）", async () => {
    const session = useSessionStore(pinia);
    session.host = { ...HOST, sessionName: "work" };
    const wrapper = mountSidebar(makeConnection(), {}, { attachTo: true });
    const seen: string[] = [];
    const onWindow = (ev: KeyboardEvent): void => {
      seen.push(ev.key);
    };
    window.addEventListener("keydown", onWindow);
    try {
      const btn = wrapper.get(".sidebar-session-btn").element;
      for (const key of ["Enter", " "]) {
        const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        btn.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
      }
      expect(seen).toEqual([]);
    } finally {
      window.removeEventListener("keydown", onWindow);
      wrapper.unmount();
    }
  });
});

describe("Sidebar — 行の並びの設定と独自トークン（20260927-sidebar-row-tokens の AC9・AC12・AC13）", () => {
  it("設定した並びで描く: 行の順・トークンの順・独自トークン（workspace の値）。値の無いトークンと空になった行は消える", () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { label: "proj", tokens: { build: "green" } }));
    settings.setSidebarLayout("spaces", [[{ token: "$build" }, { token: "workspace" }], [{ token: "$missing" }], [{ token: "state_icon" }]]);
    const wrapper = mountSidebar(makeConnection());
    const row = wrapper.find(".sidebar-spaces .sidebar-row");
    const lines = row.findAll(".sidebar-row-line1, .sidebar-row-line2");
    expect(lines.map((l) => l.classes()[0])).toEqual(["sidebar-row-line1", "sidebar-row-line2"]);
    expect(lines[0]!.findAll("span").map((s) => s.text())).toEqual(["green", "proj"]);
    expect(lines[1]!.find(".sidebar-state-icon").exists()).toBe(true);
  });

  it("agents 行の $名前 は pane の値を読み、報告が変われば描き直す", async () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { tokens: { summary: "ws-value" } }));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted({ ...makePane("p1", "t1", makeAgent()), tokens: { summary: "reviewing" } });
    settings.setSidebarLayout("agents", [[{ token: "agent" }, { token: "$summary" }]]);
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-agents .sidebar-row-line1").text()).toBe("Claude Codereviewing");
    session.paneUpserted({ ...makePane("p1", "t1", makeAgent()), tokens: { summary: "done" } });
    await nextTick();
    expect(wrapper.find(".sidebar-agents .sidebar-row-line1").text()).toBe("Claude Codedone");
  });

  it("独自トークンの値の HTML は文字のまま描き、要素・属性を増やさない（AC9）", () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    const evil = '<img src=x onerror="alert(1)"></span><script>alert(2)</script>';
    session.workspaceUpserted(makeWorkspace("w1", { tokens: { x: evil } }));
    settings.setSidebarLayout("spaces", [[{ token: "$x" }]]);
    const wrapper = mountSidebar(makeConnection());
    const line = wrapper.find(".sidebar-spaces .sidebar-row-line1");
    expect(line.text()).toBe(evil);
    expect(line.findAll("img")).toHaveLength(0);
    expect(line.findAll("script")).toHaveLength(0);
    expect(line.element.children).toHaveLength(1);
  });

  it("constructor 等の名前はプロトタイプの値を描かない（報告されていなければ消える）", () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { tokens: { a: "1" } }));
    settings.setSidebarLayout("spaces", [[{ token: "$constructor" }, { token: "$toString" }, { token: "$a" }]]);
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-spaces .sidebar-row-line1").text()).toBe("1");
  });

  it("見た目は style に、条件で当たった見た目・hide が効く（AC13・AC14）", () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { tokens: { load: "90" } }));
    session.workspaceUpserted(makeWorkspace("w2", { tokens: { load: "ok" } }));
    settings.setSidebarLayout("spaces", [
      [
        { token: "workspace", bold: false, dim: true },
        { token: "$load", fg: "#ffffff", rules: [{ when: "gt", value: 80, fg: "#f55", bold: true }, { when: "equals", value: "ok", hide: true }] },
      ],
    ]);
    const wrapper = mountSidebar(makeConnection());
    const [r1, r2] = wrapper.findAll(".sidebar-spaces .sidebar-row");
    const spans1 = r1!.findAll(".sidebar-row-line1 > span");
    expect(spans1[0]!.attributes("style")).toContain("font-weight: normal");
    expect(spans1[0]!.attributes("style")).toContain("opacity: 0.75");
    expect(spans1[1]!.text()).toBe("90");
    expect(spans1[1]!.attributes("style")).toContain("font-weight: bold");
    expect(spans1[1]!.attributes("style")).toMatch(/color: (#f55|rgb\(255, 85, 85\))/);
    expect(r2!.findAll(".sidebar-row-line1 > span").map((s) => s.text())).toEqual(["w2"]);
  });

  it("行が 1 つも残らなければ状態の印と名前の代わりの行を出す。グループの頭の開閉ボタンは主の行の先頭（AC12）", () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    const git = { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false };
    session.workspaceUpserted(makeWorkspace("w1", { label: "repo", git }));
    session.workspaceUpserted(makeWorkspace("w2", { label: "wt", git: { ...git, isLinkedWorktree: true } }));
    settings.setSidebarLayout("spaces", [[{ token: "$missing" }]]);
    const wrapper = mountSidebar(makeConnection());
    const head = wrapper.find('[data-workspace-row-key="w1"] .sidebar-row-line1');
    expect(head.element.firstElementChild?.classList.contains("sidebar-group-toggle")).toBe(true);
    expect(head.find(".sidebar-state-icon").exists()).toBe(true);
    expect(head.find(".sidebar-label").text()).toBe("repo");
  });

  it("畳んだサイドバーは並びの設定に関わらず今までどおり（状態の印だけ）", async () => {
    const session = useSessionStore(pinia);
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { tokens: { build: "green" } }));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1", makeAgent()));
    settings.setSidebarLayout("spaces", [[{ token: "$build" }]]);
    settings.setSidebarLayout("agents", [[{ token: "agent" }]]);
    view.sidebarCollapsed = true;
    const wrapper = mountSidebar(makeConnection());
    await nextTick();
    for (const sel of [".sidebar-spaces .sidebar-row", ".sidebar-agents .sidebar-row"]) {
      const row = wrapper.find(sel);
      expect(row.findAll(".sidebar-row-line1")).toHaveLength(1);
      expect(row.find(".sidebar-row-line2").exists()).toBe(false);
      expect(row.text()).toBe(row.find(".sidebar-state-icon").text());
    }
  });
});

// 20261004-group-worktree-items：サーバが配るレイアウトの 3 段の描画。
describe("Sidebar — レイアウトの 3 段（グループ／worktree グループ／通常の行）", () => {
  const git = (linked: boolean, repoKey = "/r/.git") => ({ branch: "b", ahead: 0, behind: 0, repoKey, isLinkedWorktree: linked });
  function rows(wrapper: ReturnType<typeof mountSidebar>) {
    return wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => ({
      label: r.find(".sidebar-label").text(),
      depth: r.classes().includes("sidebar-row-depth-2") ? 2 : r.classes().includes("sidebar-row-indent") ? 1 : 0,
    }));
  }
  /** 開いた順は a, wt, main, plain。レイアウトは top: [g1, u]、g1: [a, r:/r/.git]、ungrouped: [plain]。 */
  function populate(layout: boolean) {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("a", { label: "a", groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("wt", { label: "wt", git: git(true), groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("main", { label: "main", git: git(false), groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("plain", { label: "plain" }));
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    if (layout) session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:a", "r:/r/.git"] }, ungrouped: ["w:plain"] });
    return session;
  }

  it("グループの中の worktree グループは字下げ 1（先頭）・2（子）。「グループなし」の中は字下げ 1。種類の印は見出し（「グループなし」には付けない）と worktree グループの行（先頭・子）だけ（読み上げ用の文言つき）", () => {
    populate(true);
    const wrapper = mountSidebar(makeConnection());
    expect(rows(wrapper)).toEqual([
      { label: "backend", depth: 0 },
      { label: "a", depth: 1 },
      { label: "main", depth: 1 },
      { label: "wt", depth: 2 },
      { label: "グループなし", depth: 0 },
      { label: "plain", depth: 1 },
    ]);
    const all = wrapper.findAll(".sidebar-spaces .sidebar-row");
    expect(all.map((r) => r.find(".sidebar-kind-text").exists() ? r.find(".sidebar-kind-text").text() : null)).toEqual(["グループ", null, "worktree グループ", "worktree グループ", null, null]);
    expect(all.map((r) => r.find(".sidebar-kind-icon svg").exists())).toEqual([true, false, true, true, false, false]);
  });

  it("畳んだサイドバーでは種類の印はアイコンだけ（文言は出さず、アイコン自身が読み上げの名前を持つ）", () => {
    populate(true);
    useViewStore(pinia).sidebarCollapsed = true;
    const wrapper = mountSidebar(makeConnection());
    expect(wrapper.find(".sidebar-kind-text").exists()).toBe(false);
    const icons = wrapper.findAll(".sidebar-kind-icon");
    expect(icons.map((i) => [i.attributes("role"), i.attributes("aria-label")])).toEqual([
      ["img", "グループ"],
      ["img", "worktree グループ"],
      ["img", "worktree グループ"],
    ]);
  });

  it("グループを畳むと、中の worktree グループも隠れ、今いる workspace の行だけ残る（子でも先頭でも）", () => {
    const session = populate(true);
    session.groupUpserted({ id: "g1", label: "backend", collapsed: true });
    const view = useViewStore(pinia);
    expect(rows(mountSidebar(makeConnection())).map((r) => r.label)).toEqual(["backend", "グループなし", "plain"]);
    view.setView("wt", "t1");
    expect(rows(mountSidebar(makeConnection())).map((r) => r.label)).toEqual(["backend", "wt", "グループなし", "plain"]);
    view.setView("main", "t1");
    expect(rows(mountSidebar(makeConnection())).map((r) => r.label)).toEqual(["backend", "main", "グループなし", "plain"]);
  });

  it("worktree グループだけ畳むと、先頭だけ残る（グループは開いたまま）。折りたたみのボタンの名前は種類ごと", async () => {
    populate(true);
    const view = useViewStore(pinia);
    view.toggleAutoGroupCollapsed("/r/.git");
    const wrapper = mountSidebar(makeConnection());
    expect(rows(wrapper).map((r) => r.label)).toEqual(["backend", "a", "main", "グループなし", "plain"]);
    expect(wrapper.findAll(".sidebar-group-toggle").map((b) => b.attributes("aria-label"))).toEqual(["グループを折りたたむ", "worktree グループを展開", "「グループなし」を折りたたむ"]);
  });

  it("layout が変わると（sidebar.layout_changed）描画の順も変わる", async () => {
    const session = populate(true);
    const wrapper = mountSidebar(makeConnection());
    session.layoutChanged({ top: ["u", "g:g1"], groups: { g1: ["r:/r/.git", "w:a"] }, ungrouped: ["w:plain"] });
    await nextTick();
    expect(rows(wrapper).map((r) => r.label)).toEqual(["グループなし", "plain", "backend", "main", "wt", "a"]);
  });

  it("layout の無い古いサーバでは layoutFromLegacy で導く（同じリポジトリは本体の所属 1 つにまとまる）", () => {
    populate(false);
    // 子の wt だけ所属が違っても、項目は本体の所属（g1）で 1 つに描く。
    useSessionStore(pinia).workspaceUpserted(makeWorkspace("wt", { label: "wt", git: git(true), groupId: null }));
    const wrapper = mountSidebar(makeConnection());
    // 位置は先頭の workspace の平らな順: g1 は a(0) の位置、plain は最後。
    expect(rows(wrapper)).toEqual([
      { label: "backend", depth: 0 },
      { label: "a", depth: 1 },
      { label: "main", depth: 1 },
      { label: "wt", depth: 2 },
      { label: "グループなし", depth: 0 },
      { label: "plain", depth: 1 },
    ]);
  });

  it("描画の行の順はキー操作が辿る順（currentVisibleWorkspaceIds）と同じ", () => {
    const session = populate(true);
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    const view = useViewStore(pinia);
    view.toggleAutoGroupCollapsed("/r/.git");
    view.setView("wt", "t1");
    const wrapper = mountSidebar(makeConnection());
    const rendered = wrapper.findAll(".sidebar-spaces .sidebar-row").flatMap((r) => (r.attributes("data-drop-workspace-id") ? [r.attributes("data-drop-workspace-id")!] : []));
    expect(rendered).toEqual(currentVisibleWorkspaceIds(session, view));
    expect(rendered).toEqual(["a", "main", "wt", "plain"]);
  });
});

// 追補 01 C（B3 の見た目）：グループの見出し・「グループなし」の見出し・worktree グループの木の線・ブランチ名・畳んだときの状態のまとめ。
describe("Sidebar — B3 の見た目（グループの見出し・「グループなし」・worktree グループ）", () => {
  const git = (linked: boolean, branch: string, repoKey = "/r/.git", worktreeKey: string | null = linked ? `${repoKey}/worktrees/x` : repoKey) => ({ branch, ahead: 0, behind: 0, repoKey, isLinkedWorktree: linked, worktreeKey });
  const rowByKey = (wrapper: ReturnType<typeof mountSidebar>, key: string) => wrapper.findAll(".sidebar-spaces .sidebar-row").find((r) => r.attributes("data-workspace-row-key") === key)!;
  const labels = (wrapper: ReturnType<typeof mountSidebar>) => wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.find(".sidebar-label").text());
  /** workspace に 1 つのエージェントの pane を付ける。 */
  function withAgent(id: string, state: AgentInfo["state"]): void {
    const session = useSessionStore(pinia);
    session.tabUpserted(makeTab(`t-${id}`, id, `p-${id}`));
    session.paneUpserted(makePane(`p-${id}`, `t-${id}`, makeAgent({ instanceId: `i-${id}`, state })));
  }
  /** 本体 main・worktree wt（作業中）・通常の plain。 */
  function worktreeSet(opts: { mainState?: AgentInfo["state"]; wtState?: AgentInfo["state"] } = {}) {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("main", { label: "main", activeTabId: "t-main", git: git(false, "main") }));
    session.workspaceUpserted(makeWorkspace("wt", { label: "wt", activeTabId: "t-wt", git: git(true, "feature/x") }));
    session.workspaceUpserted(makeWorkspace("plain", { label: "plain", activeTabId: "t-plain" }));
    withAgent("main", opts.mainState ?? "idle");
    withAgent("wt", opts.wtState ?? "working");
    return session;
  }
  const stateOf = (row: { find: (s: string) => { attributes: (n: string) => string | undefined } }) => row.find(".sidebar-state-icon").attributes("data-state");

  describe("「グループなし」の見出し", () => {
    it("本物のグループが 1 つも無ければ出さず、項目はそのまま並ぶ（字下げなし）", () => {
      const session = worktreeSet();
      session.layoutChanged({ top: ["u"], groups: {}, ungrouped: ["r:/r/.git", "w:plain"] });
      const wrapper = mountSidebar(makeConnection());
      expect(wrapper.find('[data-workspace-row-key="ungrouped:"]').exists()).toBe(false);
      expect(labels(wrapper)).toEqual(["main", "wt", "plain"]);
      expect(wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.classes().includes("sidebar-row-indent"))).toEqual([false, true, false]);
    });

    it("本物のグループがあれば出す。中の項目は 1 段字下げ。フォルダの印は付けず、数と状態のまとめがある", () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["r:/r/.git", "w:plain"] });
      const wrapper = mountSidebar(makeConnection());
      const head = rowByKey(wrapper, "ungrouped:");
      expect(labels(wrapper)).toEqual(["backend", "グループなし", "main", "wt", "plain"]);
      expect(head.find(".sidebar-label").text()).toBe("グループなし");
      expect(head.find(".sidebar-kind-icon").exists()).toBe(false);
      expect(head.find(".sidebar-group-count").text()).toBe("2"); // worktree グループは 1 つと数える
      expect(stateOf(head)).toBe("working"); // 中の全 pane のうち優先度の高い状態（worktree の作業中）
      expect(head.find(".sidebar-group-toggle").attributes("aria-label")).toBe("「グループなし」を折りたたむ");
      expect(rowByKey(wrapper, "main").classes()).toContain("sidebar-row-indent");
      expect(rowByKey(wrapper, "plain").classes()).toContain("sidebar-row-indent");
    });

    it("見出しの折りたたみの印を押すと共有の設定 ungroupedCollapsed を切り替えて保存し、中は今いる workspace の行だけになる", async () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["r:/r/.git", "w:plain"] });
      const view = useViewStore(pinia);
      view.setView("plain", "t1");
      const wrapper = mountSidebar(makeConnection());
      await rowByKey(wrapper, "ungrouped:").get(".sidebar-group-toggle").trigger("click");
      expect(view.ungroupedCollapsed).toBe(true);
      expect(readPrefs()["ungroupedCollapsed"]).toBe(true);
      expect(labels(wrapper)).toEqual(["backend", "グループなし", "plain"]);
      expect(rowByKey(wrapper, "ungrouped:").get(".sidebar-group-toggle").attributes("aria-label")).toBe("「グループなし」を展開");
      // 状態のまとめは畳んでいても出る（隠れた worktree の作業中が見える）。
      expect(stateOf(rowByKey(wrapper, "ungrouped:"))).toBe("working");
      await rowByKey(wrapper, "ungrouped:").get(".sidebar-group-toggle").trigger("click");
      expect(view.ungroupedCollapsed).toBe(false);
      expect(labels(wrapper)).toEqual(["backend", "グループなし", "main", "wt", "plain"]);
    });

    it("見出しの行をクリックしても畳む・広げる（押した印と同じ）", () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["w:plain"] });
      const view = useViewStore(pinia);
      const wrapper = mountSidebar(makeConnection());
      clickRow(rowByKey(wrapper, "ungrouped:"));
      expect(view.ungroupedCollapsed).toBe(true);
    });

    it("見出しの右クリックは「グループなし」のメニュー（上へ／下へ移動だけ。名前の変更・削除は ContextMenu に出ない）を開く", async () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["w:plain"] });
      const openContextMenu = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { openContextMenu });
      await rowByKey(wrapper, "ungrouped:").trigger("contextmenu", { clientX: 3, clientY: 4 });
      expect(openContextMenu).toHaveBeenCalledWith({ kind: "ungrouped" }, { x: 3, y: 4 });
    });
    it("layout の無い古いサーバでは、見出しの右クリックはメニューを開かない（出す項目が無い）", async () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      expect(session.hasServerLayout).toBe(false);
      const openContextMenu = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { openContextMenu });
      await rowByKey(wrapper, "ungrouped:").trigger("contextmenu");
      expect(openContextMenu).not.toHaveBeenCalled();
    });
    it("navigate の「メニューを開く」は、選んでいる「グループなし」の見出しの位置で「グループなし」のメニューを開く", async () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["w:plain"] });
      const view = useViewStore(pinia);
      view.onModeChange("navigate");
      view.setNavigateSelection("ungrouped:");
      const openContextMenu = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { openContextMenu });
      view.requestNavigateMenu();
      await wrapper.vm.$nextTick();
      expect(openContextMenu).toHaveBeenCalledWith({ kind: "ungrouped" }, { x: expect.any(Number), y: expect.any(Number) });
      expect(view.navigateSelection).toBe("ungrouped:");
    });
    it("見出しが出ていない（グループが無い）のに「グループなし」が選択に残っていたら、メニューは開かず選択を外す", async () => {
      worktreeSet();
      const view = useViewStore(pinia);
      view.onModeChange("navigate");
      view.setNavigateSelection("ungrouped:");
      const openContextMenu = vi.fn();
      const wrapper = mountSidebar(makeConnection(), { openContextMenu });
      view.requestNavigateMenu();
      await wrapper.vm.$nextTick();
      expect(openContextMenu).not.toHaveBeenCalled();
      expect(view.navigateSelection).toBeNull();
    });
    it("navigate の選択中の「グループなし」の見出しに選択の印が付く", () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: [] }, ungrouped: ["w:plain"] });
      const view = useViewStore(pinia);
      view.onModeChange("navigate");
      view.setNavigateSelection("ungrouped:");
      const wrapper = mountSidebar(makeConnection());
      expect(rowByKey(wrapper, "ungrouped:").classes()).toContain("sidebar-row-selected");
    });
    it("全部の項目がグループの中で「グループなし」が空でも、見出しは出す（数 0。動かせる・畳めるまとまりとして残す。D32）", () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["r:/r/.git", "w:plain"] }, ungrouped: [] });
      const wrapper = mountSidebar(makeConnection());
      expect(labels(wrapper)).toEqual(["backend", "main", "wt", "plain", "グループなし"]);
      expect(rowByKey(wrapper, "ungrouped:").find(".sidebar-group-count").text()).toBe("0");
    });
  });

  describe("畳んだサイドバー（view.sidebarCollapsed）の見出し", () => {
    it("見出しの状態アイコンは出るが、名前・横線・数・+n・ブランチ名は出ない", () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:plain"] }, ungrouped: ["r:/r/.git"] });
      const view = useViewStore(pinia);
      view.toggleAutoGroupCollapsed("/r/.git"); // 先頭の行に +n・ブランチ名が付く形（広いサイドバーなら）
      view.sidebarCollapsed = true;
      const wrapper = mountSidebar(makeConnection());
      expect(wrapper.findAll(".sidebar-spaces .sidebar-row")).toHaveLength(4); // backend・plain・グループなし・main
      for (const k of ["group:g1", "ungrouped:"]) expect(rowByKey(wrapper, k).find(".sidebar-state-icon").exists()).toBe(true);
      expect(stateOf(rowByKey(wrapper, "ungrouped:"))).toBe("working");
      expect(wrapper.find(".sidebar-label").exists()).toBe(false);
      expect(wrapper.find(".sidebar-group-rule").exists()).toBe(false);
      expect(wrapper.find(".sidebar-group-count").exists()).toBe(false);
      expect(wrapper.find(".sidebar-wt-plus").exists()).toBe(false);
      expect(wrapper.find(".sidebar-wt-branch").exists()).toBe(false);
    });
  });

  describe("グループの見出し", () => {
    it("広げていても畳んでいても、中の状態をまとめたアイコンと、中の項目の数（worktree グループは 1 つ）を出す", async () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["r:/r/.git", "w:plain"] }, ungrouped: [] });
      const wrapper = mountSidebar(makeConnection());
      expect(stateOf(rowByKey(wrapper, "group:g1"))).toBe("working");
      expect(rowByKey(wrapper, "group:g1").find(".sidebar-group-count").text()).toBe("2");
      session.groupUpserted({ id: "g1", label: "backend", collapsed: true });
      await nextTick();
      expect(stateOf(rowByKey(wrapper, "group:g1"))).toBe("working");
    });

    it("エージェントが居ない中身なら状態のまとめは空（none）。優先度の低い状態だけなら、その状態", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("a", { groupId: "g1", activeTabId: "t-a" }));
      session.workspaceUpserted(makeWorkspace("b", { groupId: "g2", activeTabId: "t-b" }));
      withAgent("b", "idle");
      session.groupUpserted({ id: "g1", label: "empty-ish", collapsed: false });
      session.groupUpserted({ id: "g2", label: "idle-only", collapsed: false });
      const wrapper = mountSidebar(makeConnection());
      expect(stateOf(rowByKey(wrapper, "group:g1"))).toBe("none");
      expect(stateOf(rowByKey(wrapper, "group:g2"))).toBe("idle");
    });

    it("見出しは名前・横線・数で、面や枠の印は付けない（グループの見出しの行に専用のクラス）", () => {
      const session = worktreeSet();
      session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
      session.layoutChanged({ top: ["g:g1", "u"], groups: { g1: ["w:plain"] }, ungrouped: [] });
      const wrapper = mountSidebar(makeConnection());
      const head = rowByKey(wrapper, "group:g1");
      expect(head.classes()).toContain("sidebar-row-group");
      expect(head.find(".sidebar-group-label").text()).toBe("backend");
      expect(head.find(".sidebar-group-rule").exists()).toBe(true);
      expect(rowByKey(wrapper, "plain").classes()).not.toContain("sidebar-row-group");
    });
  });

  describe("worktree グループ", () => {
    it("広げているときの先頭の行は本体の状態。+n は出さない", () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.layoutChanged({ top: ["u"], groups: {}, ungrouped: ["r:/r/.git", "w:plain"] });
      const wrapper = mountSidebar(makeConnection());
      expect(stateOf(rowByKey(wrapper, "main"))).toBe("idle");
      expect(rowByKey(wrapper, "main").find(".sidebar-wt-plus").exists()).toBe(false);
    });

    it("畳んでいるときの先頭の行は本体と worktree の全部をまとめた状態で、隠れている worktree の数を +n で添える", () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.layoutChanged({ top: ["u"], groups: {}, ungrouped: ["r:/r/.git", "w:plain"] });
      useViewStore(pinia).toggleAutoGroupCollapsed("/r/.git");
      const wrapper = mountSidebar(makeConnection());
      expect(stateOf(rowByKey(wrapper, "main"))).toBe("working");
      expect(rowByKey(wrapper, "main").find(".sidebar-wt-plus").text()).toBe("+1");
    });

    it("畳んでいて worktree を開いているときは、その行が見えているので +n に数えない（状態のまとめは全部のまま）", () => {
      const session = worktreeSet({ mainState: "idle", wtState: "working" });
      session.layoutChanged({ top: ["u"], groups: {}, ungrouped: ["r:/r/.git", "w:plain"] });
      const view = useViewStore(pinia);
      view.toggleAutoGroupCollapsed("/r/.git");
      view.setView("wt", "t1");
      const wrapper = mountSidebar(makeConnection());
      expect(labels(wrapper)).toEqual(["main", "wt", "plain"]);
      expect(rowByKey(wrapper, "main").find(".sidebar-wt-plus").exists()).toBe(false);
      expect(stateOf(rowByKey(wrapper, "main"))).toBe("working");
    });

    it("先頭と子に木の線のクラスを付け、最後の子だけ縦線が止まる印を持つ。通常の行には付けない", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("main", { git: git(false, "main") }));
      session.workspaceUpserted(makeWorkspace("wt1", { git: git(true, "f1", "/r/.git", "/r/.git/worktrees/1") }));
      session.workspaceUpserted(makeWorkspace("wt2", { git: git(true, "f2", "/r/.git", "/r/.git/worktrees/2") }));
      session.workspaceUpserted(makeWorkspace("plain"));
      const wrapper = mountSidebar(makeConnection());
      const cls = (k: string) => rowByKey(wrapper, k).classes();
      expect(cls("main")).not.toContain("sidebar-row-tree");
      expect(cls("wt1")).toContain("sidebar-row-tree");
      expect(cls("wt1")).not.toContain("sidebar-row-tree-last");
      expect(cls("wt2")).toContain("sidebar-row-tree");
      expect(cls("wt2")).toContain("sidebar-row-tree-last");
      expect(cls("plain")).not.toContain("sidebar-row-tree");
    });

    it("畳んでいて今いる子が最後でないときは、見えている子（今いる子）が最後として縦線を止める", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("main", { git: git(false, "main") }));
      session.workspaceUpserted(makeWorkspace("wt1", { git: git(true, "f1", "/r/.git", "/r/.git/worktrees/1") }));
      session.workspaceUpserted(makeWorkspace("wt2", { git: git(true, "f2", "/r/.git", "/r/.git/worktrees/2") }));
      const view = useViewStore(pinia);
      view.toggleAutoGroupCollapsed("/r/.git");
      view.setView("wt1", "t1");
      const wrapper = mountSidebar(makeConnection());
      expect(labels(wrapper)).toHaveLength(2); // main・wt1（wt2 は隠れている）
      expect(rowByKey(wrapper, "wt1").classes()).toContain("sidebar-row-tree-last");
    });

    it("先頭の行にも子の行にも worktree の印を出し、通常の行には出さない", () => {
      worktreeSet();
      const wrapper = mountSidebar(makeConnection());
      const hasIcon = (k: string) => rowByKey(wrapper, k).find('.sidebar-kind-icon[data-kind="worktreeGroup"]').exists();
      expect([hasIcon("main"), hasIcon("wt"), hasIcon("plain")]).toEqual([true, true, false]);
    });

    it("ブランチ名を worktree グループの行（先頭・子）の 1 行目の右に出す。通常の行には出さない", () => {
      worktreeSet();
      const wrapper = mountSidebar(makeConnection());
      const branch = (k: string) => (rowByKey(wrapper, k).find(".sidebar-row-line1 .sidebar-wt-branch").exists() ? rowByKey(wrapper, k).find(".sidebar-wt-branch").text() : null);
      expect([branch("main"), branch("wt"), branch("plain")]).toEqual(["main", "feature/x", null]);
    });

    it("行の並びの設定に git の項目が無くても出す（1 行目に branch・git があれば重ねない）", () => {
      worktreeSet();
      const settings = useSettingsStore(pinia);
      settings.setSidebarLayout("spaces", [[{ token: "state_icon" }, { token: "workspace" }]]);
      const wrapper = mountSidebar(makeConnection());
      expect(rowByKey(wrapper, "wt").find(".sidebar-wt-branch").text()).toBe("feature/x");
      settings.setSidebarLayout("spaces", [[{ token: "state_icon" }, { token: "workspace" }, { token: "branch" }]]);
      return nextTick().then(() => {
        expect(rowByKey(wrapper, "wt").find(".sidebar-wt-branch").exists()).toBe(false);
        settings.setSidebarLayout("spaces", [[{ token: "state_icon" }, { token: "workspace" }, { token: "git" }]]);
        return nextTick().then(() => expect(rowByKey(wrapper, "wt").find(".sidebar-wt-branch").exists()).toBe(false));
      });
    });

    it("1 行目に git の項目が無く 2 行目にあるだけなら、1 行目の右にブランチ名を出す（既定の並び）", () => {
      worktreeSet();
      const wrapper = mountSidebar(makeConnection());
      expect(rowByKey(wrapper, "wt").find(".sidebar-row-line1 .sidebar-wt-branch").exists()).toBe(true);
    });

    it("同じフォルダの 2 つ目の workspace（代表でない）は通常の行。worktree の印・木の線・ブランチ名は付かない", () => {
      const session = useSessionStore(pinia);
      session.workspaceUpserted(makeWorkspace("main", { git: git(false, "main") }));
      session.workspaceUpserted(makeWorkspace("wt", { git: git(true, "feature/x") }));
      session.workspaceUpserted(makeWorkspace("main2", { label: "main2", git: git(false, "main") })); // main と同じ worktreeKey
      const wrapper = mountSidebar(makeConnection());
      const row = rowByKey(wrapper, "main2");
      expect(row.find(".sidebar-kind-icon").exists()).toBe(false);
      expect(row.classes()).not.toContain("sidebar-row-tree");
      expect(row.find(".sidebar-wt-branch").exists()).toBe(false);
      expect(rowByKey(wrapper, "main").find(".sidebar-kind-icon").exists()).toBe(true);
      expect(rowByKey(wrapper, "wt").classes()).toContain("sidebar-row-tree");
    });
  });
});
