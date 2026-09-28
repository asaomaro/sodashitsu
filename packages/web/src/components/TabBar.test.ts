import type { MethodName, ParamsOf, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, ConnectionKey, TerminalRegistryKey } from "../injection.js";
import type { Action } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import TabBar from "./TabBar.vue";

let pinia: Pinia;

beforeEach(() => {
  // view ストアは初期化時に `soda.prefs.v1`（localStorage）を読む。消さないと
  // 同じワーカーで先に走ったファイルの選択が持ち越される（20260920-sidebar-tabbar-controls）。
  localStorage.clear();
  pinia = createPinia();
});

function makeWorkspace(id: string, tabIds: string[]): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string, overrides: Partial<Tab> = {}): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null, ...overrides };
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

function mountTabBar(
  conn: ConnectionPort,
  actions?: { openContextMenu: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn>; newTabInWorkspace?: ReturnType<typeof vi.fn> },
  registry?: { focus: ReturnType<typeof vi.fn> },
) {
  return mount(TabBar, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: conn,
        [ActionDispatcherKey as symbol]: actions ?? { openContextMenu: vi.fn(), run: vi.fn(), newTabInWorkspace: vi.fn() },
        ...(registry ? { [TerminalRegistryKey as symbol]: registry } : {}),
      },
    },
  });
}

describe("TabBar", () => {
  it("現在の workspace の tabIds の順で並べる", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t2", "t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const labels = wrapper.findAll(".tab-bar-item").map((el) => el.find(".tab-bar-label").text());
    expect(labels).toEqual(["t2", "t1"]);
  });

  it("現在の tab に active クラスと aria-selected を付ける", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    // tab バーの自動非表示（20260922-appearance-settings-rest。AC4）は tab が1個のときだけなので、
    // この節（tab バーの中身の表示）を確かめるテストはどれも2個以上にする。
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const item = wrapper.get(".tab-bar-item");
    expect(item.classes()).toContain("tab-bar-item-active");
    expect(item.attributes("aria-selected")).toBe("true");
  });

  it("拡大中の tab には Z を出す", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1", { zoomedPaneId: "p1" }));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.find(".tab-bar-zoomed").text()).toBe("Z");
  });

  it("状態の印は出さない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.find(".sidebar-state-icon").exists()).toBe(false);
  });

  it("クリックで切り替え、tab.focus を送る", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1", { focusedPaneId: "p2" }));
    view.setView("w1", "t1");
    const conn = makeConnection();
    const wrapper = mountTabBar(conn);
    await wrapper.findAll(".tab-bar-item")[1]!.trigger("click");
    expect(view.tabId).toBe("t2");
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.requests).toEqual([["tab.focus", { tabId: "t2" }]]);
  });

  it("右クリックで tab を対象に openContextMenu を呼ぶ", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const openContextMenu = vi.fn();
    const wrapper = mountTabBar(makeConnection(), { openContextMenu, run: vi.fn() });
    await wrapper.get(".tab-bar-item").trigger("contextmenu", { clientX: 3, clientY: 4 });
    expect(openContextMenu).toHaveBeenCalledWith({ kind: "tab", tabId: "t1" }, { x: 3, y: 4 });
  });

  it("ホイールで tabDelta アクションを送る（D56 の訂正 11）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const run = vi.fn();
    const wrapper = mountTabBar(makeConnection(), { openContextMenu: vi.fn(), run });
    await wrapper.get(".tab-bar").trigger("wheel", { deltaY: 100 });
    expect(run).toHaveBeenCalledWith({ type: "tabDelta", delta: 1 } satisfies Action);
    await wrapper.get(".tab-bar").trigger("wheel", { deltaY: -100 });
    expect(run).toHaveBeenCalledWith({ type: "tabDelta", delta: -1 } satisfies Action);
  });
});

// 20260920-sidebar-tabbar-controls の AC6：これまで新しいタブを作る導線は prefix+c と
// 「タブの右クリック → 新規」だけで、後者はタブが 1 つも無いと対象ごと消えていた。
describe("TabBar — 新しいタブのボタン", () => {
  it("押すと、表示中の workspace を宛先に newTabInWorkspace を呼ぶ（名前入力を開くのは dispatcher の責務）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const newTabInWorkspace = vi.fn();
    const wrapper = mountTabBar(makeConnection(), { openContextMenu: vi.fn(), run: vi.fn(), newTabInWorkspace });
    await wrapper.get(".tab-bar-new").trigger("click");
    expect(newTabInWorkspace).toHaveBeenCalledWith("w1");
  });

  it("タブが 1 つも無くても押せる（右クリックの導線が消える場面こそ要る）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", []));
    view.setView("w1", "");
    const newTabInWorkspace = vi.fn();
    const wrapper = mountTabBar(makeConnection(), { openContextMenu: vi.fn(), run: vi.fn(), newTabInWorkspace });
    expect(wrapper.findAll(".tab-bar-item").length).toBe(0);
    const btn = wrapper.get(".tab-bar-new");
    expect(btn.attributes("disabled")).toBeUndefined();
    await btn.trigger("click");
    expect(newTabInWorkspace).toHaveBeenCalledWith("w1");
  });

  it("表示中の workspace が無いときは押せない", () => {
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.get(".tab-bar-new").attributes("disabled")).toBeDefined();
  });

  it("role=tablist が持つのは tab だけ（＋ はその外）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const list = wrapper.get('[role="tablist"]');
    expect(list.findAll(".tab-bar-new").length).toBe(0);
    expect(list.findAll('[role="tab"]').length).toBe(2);
  });

  // 20260925-focus-trapped-keybindings（AC4）。`Sidebar.test.ts` の
  // `expectStopsOnlyUnmodifiedEnterSpace` と同型（`PaneFrame.test.ts:101-111`）。
  it("keydown：無修飾の Enter/Space だけ window へ渡さない（AC4）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    // `tab-bar` 全体が `v-if="tabs.length !== 1"` で隠れる（自動非表示）ので、タブは2つにする。
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const target = wrapper.get(".tab-bar-new").element;
    const onWindowKeydown = vi.fn();
    window.addEventListener("keydown", onWindowKeydown);
    const dispatch = (init: KeyboardEventInit): boolean => {
      const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    expect(dispatch({ key: "Enter" })).toBe(false);
    expect(dispatch({ key: " " })).toBe(false);
    expect(onWindowKeydown).not.toHaveBeenCalled(); // 無修飾の Enter/Space はここまで届いていない
    expect(dispatch({ key: "Enter", ctrlKey: true })).toBe(false);
    expect(dispatch({ key: " ", altKey: true })).toBe(false);
    expect(dispatch({ key: "Tab" })).toBe(false);
    expect(dispatch({ key: "b", ctrlKey: true, metaKey: true })).toBe(false);
    window.removeEventListener("keydown", onWindowKeydown);
    expect(onWindowKeydown).toHaveBeenCalledTimes(4); // 修飾付き Enter/Space・Tab・他の修飾キーは渡す
  });
});

// 20260922-appearance-settings-rest T6（design「振る舞いの詳細」US2・US3）。
describe("TabBar — 自動非表示（AC4〜AC6・AC-I6）", () => {
  it("tab が1個のときは表示されない（AC4）", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.find(".tab-bar").exists()).toBe(false);
  });

  it("0個では表示（＋の導線）・1個では非表示、2個以上で表示に戻る（AC4・AC5）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", []));
    view.setView("w1", "");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.find(".tab-bar").exists(), "0個：表示（＋ の導線が要る）").toBe(true);

    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".tab-bar").exists(), "1個：非表示").toBe(false);

    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t2", "w1"));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".tab-bar").exists(), "2個：表示に戻る（新規 tab 作成の場合）").toBe(true);
  });

  it("非表示の間もフォーカスは失われず、選ばれている pane の端末へ戻る（AC-I6）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    view.focusPane("p1");
    const focus = vi.fn();
    const wrapper = mountTabBar(makeConnection(), undefined, { focus });
    (wrapper.get(".tab-bar-new").element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(wrapper.get(".tab-bar-new").element);

    // tab を1個に減らす（自動非表示。フォーカスしていた要素が DOM から消える）。
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    view.setView("w1", "t1");
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick(); // onBeforeUnmount 内の nextTick 分
    expect(wrapper.find(".tab-bar").exists()).toBe(false);
    expect(focus).toHaveBeenCalledWith("p1");
  });

  it("フォーカスが tab バーの外にあったときは、余計な focus を呼ばない", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const focus = vi.fn();
    const wrapper = mountTabBar(makeConnection(), undefined, { focus });
    // 何もフォーカスしない（body のまま）。
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("TabBar — 右端の日時エントリ（AC7・AC8。20260922-tabbar-pane-appearance。PR #12 から取り込み）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 9, 5, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** 既定（`tabBarRight` が空）では右端に何も出ない。設定で日時エントリを足すと出る（旧「現在時刻」を統合）。 */
  it("既定では右端の帯が無く、日時エントリを足すと HH:mm で出る（AC7）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.find(".tab-bar-right").exists(), "既定は空なので出ない").toBe(false);

    useSettingsStore(pinia).setTabBarRight([{ kind: "datetime", format: "time" }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".tab-bar-right").text()).toBe("09:05");
    expect(wrapper.get(".tab-bar-right").attributes("aria-hidden")).toBe("true"); // 装飾的な情報
  });

  it("時間が経つと表示が更新される。ページの再読み込みは要らない（AC8）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    useSettingsStore(pinia).setTabBarRight([{ kind: "datetime", format: "time" }]);
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.get(".tab-bar-right").text()).toBe("09:05");
    vi.setSystemTime(new Date(2026, 0, 1, 9, 6, 1));
    await vi.advanceTimersByTimeAsync(15_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".tab-bar-right").text()).toBe("09:06");
  });

  it("非表示（tab が1個）の間・日時エントリが無い間はタイマーを持たない。両方そろうと動き出す・どちらか欠けると止まる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    settings.setTabBarRight([{ kind: "datetime", format: "time" }]);
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const wrapper = mountTabBar(makeConnection());
    expect(setSpy, "1個（非表示）で mount：日時エントリがあってもタイマーを持たない").not.toHaveBeenCalled();

    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t2", "w1"));
    await wrapper.vm.$nextTick();
    expect(setSpy, "2個（表示）に増えると動き出す").toHaveBeenCalledTimes(1);
    expect(wrapper.find(".tab-bar-right").exists()).toBe(true);
    const clearCountAfterShow = clearSpy.mock.calls.length;

    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    await wrapper.vm.$nextTick();
    expect(clearSpy.mock.calls.length, "1個（非表示）に戻ると止める").toBeGreaterThan(clearCountAfterShow);
    expect(setSpy, "動いていたタイマーは1つだけのまま（増やし直さない）").toHaveBeenCalledTimes(1);

    wrapper.unmount();
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it("日時エントリを外すと、表示中でもタイマーを止める", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    settings.setTabBarRight([{ kind: "datetime", format: "time" }]);
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.get(".tab-bar-right").text()).toBe("09:05");
    const clearCountBefore = clearSpy.mock.calls.length;

    settings.setTabBarRight([]);
    await wrapper.vm.$nextTick();
    expect(clearSpy.mock.calls.length).toBeGreaterThan(clearCountBefore);
    expect(wrapper.find(".tab-bar-right").exists()).toBe(false);

    wrapper.unmount();
    clearSpy.mockRestore();
  });
});

describe("TabBar — 位置・右端のほかのエントリ（20260922-tabbar-pane-appearance。PR #12 から取り込み）", () => {
  it("既定は上（`tab-bar-top`・order 0）。設定で下に変えると `tab-bar-bottom`・order 1 になる", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.get(".tab-bar").classes()).toContain("tab-bar-top");
    expect((wrapper.get(".tab-bar").element as HTMLElement).style.order).toBe("0");

    settings.setTabBarPosition("bottom");
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".tab-bar").classes()).toContain("tab-bar-bottom");
    expect((wrapper.get(".tab-bar").element as HTMLElement).style.order).toBe("1");
  });

  it("ホスト名・固定文字列・拡大の状態のエントリを、区切り文字でつなげて出す", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const settings = useSettingsStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1", { zoomedPaneId: "p1" }));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    session.host = { os: "linux", windowsBuild: null, hostname: "myhost" };
    settings.setTabBarRight([{ kind: "zoom" }, { kind: "hostname" }, { kind: "text", text: "note" }]);
    settings.setTabBarRightSeparator(" | ");
    const wrapper = mountTabBar(makeConnection());
    expect(wrapper.get(".tab-bar-right").text()).toBe("Z | myhost | note");
  });
});

// 20260924-pane-move-cross-tab（design「クライアント側: ドロップ先の拡張」AC4）。
describe("TabBar — pane D&D のドロップ先", () => {
  it("各 tab に data-tab-id が付く", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const items = wrapper.findAll(".tab-bar-item");
    expect(items.map((el) => el.attributes("data-tab-id"))).toEqual(["t1", "t2"]);
  });

  it("view.paneDrag.overTabId に一致する tab だけドロップ候補のハイライトが付く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());

    view.startPaneDrag("p9");
    view.setPaneDragOverTab("t2");
    await wrapper.vm.$nextTick();

    const items = wrapper.findAll(".tab-bar-item");
    expect(items[0]!.classes()).not.toContain("tab-bar-item-drop-target");
    expect(items[1]!.classes()).toContain("tab-bar-item-drop-target");
  });

  it("ドラッグしていなければどの tab にもハイライトが付かない", () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.tabUpserted(makeTab("t2", "w1"));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    for (const item of wrapper.findAll(".tab-bar-item")) expect(item.classes()).not.toContain("tab-bar-item-drop-target");
  });
});
