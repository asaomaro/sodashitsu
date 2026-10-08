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

// 20261008-web-tab-dnd T2・T3。jsdom は getBoundingClientRect が全部 0・ポインタの捕捉も無いので、矩形を差し替える。
describe("TabBar — tab のドラッグでの並べ替え", () => {
  const TAB_W = 100;
  const N = 4;

  function pev(type: string, x: number, y = 15, extra: PointerEventInit = {}): PointerEvent {
    return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, clientX: x, clientY: y, button: 0, ...extra });
  }
  function clickEv(detail: number): MouseEvent {
    return new MouseEvent("click", { bubbles: true, cancelable: true, detail });
  }

  async function setup(opts: { registry?: { focus: ReturnType<typeof vi.fn> }; actions?: Parameters<typeof mountTabBar>[1] } = {}) {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const ids = Array.from({ length: N }, (_, i) => `t${i + 1}`);
    session.workspaceUpserted(makeWorkspace("w1", ids));
    ids.forEach((id, i) => session.tabUpserted(makeTab(id, "w1", { focusedPaneId: `p${i + 1}` })));
    view.setView("w1", "t1");
    view.focusPane("p1");
    const conn = makeConnection();
    const wrapper = mountTabBar(conn, opts.actions, opts.registry);
    const rootEl = wrapper.get(".tab-bar").element as HTMLElement;
    const rowEl = wrapper.get(".tab-bar-tabs").element as HTMLElement;
    const rect = (l: number, r: number): DOMRect => ({ left: l, right: r, top: 0, bottom: 30, width: r - l, height: 30, x: l, y: 0, toJSON: () => ({}) });
    vi.spyOn(rootEl, "getBoundingClientRect").mockReturnValue(rect(0, 600));
    vi.spyOn(rowEl, "getBoundingClientRect").mockReturnValue(rect(0, 500));
    const buttons = wrapper.findAll(".tab-bar-item").map((b) => b.element as HTMLElement);
    buttons.forEach((b, i) => vi.spyOn(b, "getBoundingClientRect").mockReturnValue(rect(i * TAB_W, (i + 1) * TAB_W)));
    return { session, view, conn, wrapper, rootEl, rowEl, buttons };
  }
  const moves = (conn: { requests: [MethodName, unknown][] }) => conn.requests.filter(([m]) => m === "tab.move").map(([, p]) => p);
  const focuses = (conn: { requests: [MethodName, unknown][] }) => conn.requests.filter(([m]) => m === "tab.focus");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("6px 未満で離しても tab.move は送らず、続く click で今までどおり切り替わる", async () => {
    const { conn, buttons, view } = await setup();
    buttons[1]!.dispatchEvent(pev("pointerdown", 150));
    buttons[1]!.dispatchEvent(pev("pointermove", 153));
    buttons[1]!.dispatchEvent(pev("pointerup", 153));
    buttons[1]!.dispatchEvent(clickEv(1));
    expect(moves(conn)).toEqual([]);
    expect(focuses(conn)).toHaveLength(1);
    expect(view.tabId).toBe("t2");
  });

  it("先頭の tab を最後の tab の右半分で離す → next を N-1 回、その後に tab.focus。端末へフォーカス", async () => {
    const registry = { focus: vi.fn() };
    const { conn, buttons, view, wrapper } = await setup({ registry });
    buttons[0]!.dispatchEvent(pev("pointerdown", 50));
    buttons[0]!.dispatchEvent(pev("pointermove", 200));
    buttons[0]!.dispatchEvent(pev("pointermove", 375));
    buttons[0]!.dispatchEvent(pev("pointerup", 375));
    expect(moves(conn)).toEqual(Array(N - 1).fill({ tabId: "t1", direction: "next" }));
    const names = conn.requests.map(([m]) => m);
    expect(names).toEqual([...Array(N - 1).fill("tab.move"), "tab.focus"]);
    expect(view.tabId).toBe("t1");
    await wrapper.vm.$nextTick();
    expect(registry.focus).toHaveBeenCalledWith(view.focusedPaneId);
  });

  it("最後の tab を先頭の左半分で離す → previous を N-1 回。隣へ 1 つ → 1 回", async () => {
    const a = await setup();
    a.buttons[3]!.dispatchEvent(pev("pointerdown", 350));
    a.buttons[3]!.dispatchEvent(pev("pointermove", 100));
    a.buttons[3]!.dispatchEvent(pev("pointermove", 10));
    a.buttons[3]!.dispatchEvent(pev("pointerup", 10));
    expect(moves(a.conn)).toEqual(Array(N - 1).fill({ tabId: "t4", direction: "previous" }));
    a.wrapper.unmount();
    const b = await setup();
    b.buttons[2]!.dispatchEvent(pev("pointerdown", 250));
    b.buttons[2]!.dispatchEvent(pev("pointermove", 200));
    b.buttons[2]!.dispatchEvent(pev("pointermove", 120));
    b.buttons[2]!.dispatchEvent(pev("pointerup", 120));
    expect(moves(b.conn)).toEqual([{ tabId: "t3", direction: "previous" }]);
  });

  it("ドラッグ中は dragging と線のクラスが 1 つだけ。順が変わらない位置と根の外では線が無い。離すと全部消える", async () => {
    const { wrapper, buttons } = await setup();
    const count = (cls: string) => wrapper.findAll(`.${cls}`).length;
    buttons[0]!.dispatchEvent(pev("pointerdown", 50));
    buttons[0]!.dispatchEvent(pev("pointermove", 200));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".tab-bar").classes()).toContain("tab-bar-dragging");
    expect(buttons[0]!.classList.contains("tab-bar-item-dragging")).toBe(true);
    expect(count("tab-bar-item-dragging")).toBe(1);
    expect(buttons[2]!.classList.contains("tab-bar-item-insert-before")).toBe(true); // x=200 は t2 の右半分 → スロット 2 ではなく…
    expect(count("tab-bar-item-insert-before") + count("tab-bar-item-insert-after")).toBe(1);
    // 自分の上・自分の前後の境目 → 線なし
    for (const x of [30, 90, 99]) {
      buttons[0]!.dispatchEvent(pev("pointermove", x));
      await wrapper.vm.$nextTick();
      expect(count("tab-bar-item-insert-before") + count("tab-bar-item-insert-after"), `x=${x}`).toBe(0);
    }
    // 根の外
    buttons[0]!.dispatchEvent(pev("pointermove", 300, 200));
    await wrapper.vm.$nextTick();
    expect(count("tab-bar-item-insert-before") + count("tab-bar-item-insert-after")).toBe(0);
    // 末尾の後 → after
    buttons[0]!.dispatchEvent(pev("pointermove", 450));
    await wrapper.vm.$nextTick();
    expect(buttons[3]!.classList.contains("tab-bar-item-insert-after")).toBe(true);
    buttons[0]!.dispatchEvent(pev("pointerup", 450));
    await wrapper.vm.$nextTick();
    expect(count("tab-bar-dragging")).toBe(0);
    expect(count("tab-bar-item-dragging")).toBe(0);
    expect(count("tab-bar-item-insert-before") + count("tab-bar-item-insert-after")).toBe(0);
  });

  it("Escape で取り消し、その後の pointerup と click では何も送らない。ドラッグ中だけキーを止める", async () => {
    const { conn, buttons, wrapper, view } = await setup();
    const onWindow = vi.fn();
    window.addEventListener("keydown", onWindow);
    const key = (k: string) => {
      const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(key("a")).toBe(false); // ドラッグ前は止めない
    expect(onWindow).toHaveBeenCalledTimes(1);
    buttons[1]!.dispatchEvent(pev("pointerdown", 150));
    buttons[1]!.dispatchEvent(pev("pointermove", 350));
    expect(key("a")).toBe(true);
    expect(onWindow).toHaveBeenCalledTimes(1); // window の bubble の聞き手に届かない
    expect(key("Escape")).toBe(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".tab-bar-dragging").exists()).toBe(false);
    buttons[1]!.dispatchEvent(pev("pointerup", 350));
    buttons[1]!.dispatchEvent(clickEv(1));
    expect(conn.requests).toEqual([]);
    expect(view.tabId).toBe("t1");
    expect(key("b")).toBe(false);
    expect(onWindow).toHaveBeenCalledTimes(2);
    window.removeEventListener("keydown", onWindow);
  });

  it("根の外・順が変わらない位置で離す・pointercancel・lostpointercapture → 何も送らず、フォーカスを端末へ戻す", async () => {
    const registry = { focus: vi.fn() };
    const { conn, buttons, wrapper, view } = await setup({ registry });
    const end = async (how: (b: HTMLElement) => void) => {
      buttons[1]!.focus();
      buttons[1]!.dispatchEvent(pev("pointerdown", 150));
      buttons[1]!.dispatchEvent(pev("pointermove", 350));
      registry.focus.mockClear();
      how(buttons[1]!);
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".tab-bar-dragging").exists()).toBe(false);
      expect(conn.requests).toEqual([]);
      expect(registry.focus).toHaveBeenCalledWith(view.focusedPaneId);
      const e = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    };
    await end((b) => b.dispatchEvent(pev("pointerup", 350, 300)));
    await end((b) => b.dispatchEvent(pev("pointerup", 120)));
    await end((b) => b.dispatchEvent(pev("pointercancel", 350)));
    await end((b) => b.dispatchEvent(pev("lostpointercapture", 350)));
  });

  it("右ボタン・中ボタン・touch の pointerdown からは始まらない", async () => {
    const { buttons, wrapper } = await setup();
    for (const init of [{ button: 2 }, { button: 1 }, { pointerType: "touch" }] as PointerEventInit[]) {
      buttons[0]!.dispatchEvent(pev("pointerdown", 50, 15, init));
      buttons[0]!.dispatchEvent(pev("pointermove", 300, 15, init));
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".tab-bar-dragging").exists(), JSON.stringify(init)).toBe(false);
      buttons[0]!.dispatchEvent(pev("pointerup", 300, 15, init));
    }
  });

  it("クリックの抑止: キーボードの click は捨てず、旗は残らず、ドラッグ直後の「＋」の click は無視する", async () => {
    // setTimeout だけ差し替える（performance.now まで偽物にすると Vue がイベントを捨てる）
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const newTabInWorkspace = vi.fn();
      const { conn, buttons, wrapper, view } = await setup({ actions: { openContextMenu: vi.fn(), run: vi.fn(), newTabInWorkspace } });
      // ドラッグ → 離す(順は変わる) → detail 0 の click は通る
      buttons[0]!.dispatchEvent(pev("pointerdown", 50));
      buttons[0]!.dispatchEvent(pev("pointermove", 450));
      buttons[0]!.dispatchEvent(pev("pointerup", 450));
      conn.requests.length = 0;
      buttons[1]!.dispatchEvent(clickEv(0));
      expect(view.tabId).toBe("t2");
      // 旗はタイマーで下りる
      vi.runAllTimers();
      buttons[2]!.dispatchEvent(clickEv(1));
      expect(view.tabId).toBe("t3");
      // ドラッグ → watch での取り消し（pointerup 無し）→ touch の pointerdown → click は通る
      buttons[0]!.dispatchEvent(pev("pointerdown", 50));
      buttons[0]!.dispatchEvent(pev("pointermove", 450));
      useViewStore(pinia).setOpenDialog("settings");
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".tab-bar-dragging").exists()).toBe(false);
      buttons[0]!.dispatchEvent(pev("pointerdown", 50, 15, { pointerType: "touch" }));
      buttons[1]!.dispatchEvent(clickEv(1));
      expect(view.tabId).toBe("t2");
      // ドラッグの直後に「＋」へ来た click
      buttons[0]!.dispatchEvent(pev("pointerdown", 50));
      buttons[0]!.dispatchEvent(pev("pointermove", 550));
      buttons[0]!.dispatchEvent(pev("pointerup", 550, 300));
      wrapper.get(".tab-bar-new").element.dispatchEvent(clickEv(1));
      expect(newTabInWorkspace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ドラッグ中の外からの変化: tab を消す・1 個にする・workspace を変える・ダイアログを開く → 取り消し。tab を足すだけなら続く", async () => {
    const registry = { focus: vi.fn() };
    const start = async () => {
      const s = await setup({ registry });
      s.buttons[1]!.dispatchEvent(pev("pointerdown", 150));
      s.buttons[1]!.dispatchEvent(pev("pointermove", 350));
      await s.wrapper.vm.$nextTick();
      expect(s.wrapper.find(".tab-bar-dragging").exists()).toBe(true);
      return s;
    };
    const expectCancelled = async (s: Awaited<ReturnType<typeof start>>) => {
      await s.wrapper.vm.$nextTick();
      expect(s.wrapper.find(".tab-bar-dragging").exists()).toBe(false);
      s.conn.requests.length = 0;
      s.buttons[1]!.dispatchEvent(pev("pointerup", 450));
      expect(s.conn.requests).toEqual([]);
      s.wrapper.unmount();
    };
    let s = await start();
    s.session.workspaceUpserted(makeWorkspace("w1", ["t1", "t3", "t4"]));
    await expectCancelled(s);
    s = await start();
    s.session.workspaceUpserted(makeWorkspace("w1", ["t2"]));
    await expectCancelled(s);
    s = await start();
    s.session.workspaceUpserted(makeWorkspace("w2", ["x1"]));
    s.session.tabUpserted(makeTab("x1", "w2"));
    s.view.setView("w2", "x1");
    await expectCancelled(s);
    s = await start();
    registry.focus.mockClear();
    s.view.setOpenDialog("settings");
    await s.wrapper.vm.$nextTick();
    expect(s.wrapper.find(".tab-bar-dragging").exists()).toBe(false);
    expect(registry.focus).not.toHaveBeenCalled();
    s.wrapper.unmount();
    // tab を 1 つ足すだけならドラッグは続く
    s = await start();
    s.session.tabUpserted(makeTab("t5", "w1"));
    s.session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2", "t3", "t4", "t5"]));
    await s.wrapper.vm.$nextTick();
    expect(s.wrapper.find(".tab-bar-dragging").exists()).toBe(true);
    s.buttons[1]!.dispatchEvent(pev("pointerup", 5));
    expect(moves(s.conn)).toEqual([{ tabId: "t2", direction: "previous" }]);
  });

  it("pane のドラッグ中は drop-target だけ付き、tab のドラッグ中は view.paneDrag が null のまま", async () => {
    const { wrapper, view, buttons } = await setup();
    view.startPaneDrag("p1");
    view.setPaneDragOverTab("t2");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".tab-bar-item-drop-target")).toHaveLength(1);
    expect(wrapper.find(".tab-bar-dragging").exists()).toBe(false);
    expect(wrapper.find(".tab-bar-item-dragging").exists()).toBe(false);
    expect(wrapper.find(".tab-bar-item-insert-before").exists()).toBe(false);
    view.endPaneDrag();
    buttons[0]!.dispatchEvent(pev("pointerdown", 50));
    buttons[0]!.dispatchEvent(pev("pointermove", 300));
    expect(view.paneDrag).toBeNull();
  });

  it("列があふれているとき、「＋」の上の x は見えている右端の tab の位置になる（隠れた tab の間にならない）", async () => {
    const { wrapper, buttons, conn } = await setup();
    // t3・t4 が列の右端(500)より右に隠れている想定: 列 0..300、t3 = 300..400、t4 = 400..500
    const rowEl = wrapper.get(".tab-bar-tabs").element as HTMLElement;
    (rowEl.getBoundingClientRect as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ left: 0, right: 300, top: 0, bottom: 30, width: 300, height: 30, x: 0, y: 0, toJSON: () => ({}) });
    buttons[0]!.dispatchEvent(pev("pointerdown", 50));
    buttons[0]!.dispatchEvent(pev("pointermove", 350)); // 列の右の外（「＋」の上）
    buttons[0]!.dispatchEvent(pev("pointerup", 350));
    // 丸めると x=300: t3 の左端 = t2 の右半分の後 → スロット 3 → t1 は index 2 へ → next ×2
    expect(moves(conn)).toEqual([
      { tabId: "t1", direction: "next" },
      { tabId: "t1", direction: "next" },
    ]);
  });
});

describe("TabBar — ドラッグ中の端での自動スクロール（20261008-web-tab-dnd T3）", () => {
  let frames: FrameRequestCallback[] = [];
  let cancelled = 0;
  beforeEach(() => {
    frames = [];
    cancelled = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {
      cancelled++;
      frames = [];
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const step = () => {
    const f = frames;
    frames = [];
    f.forEach((cb) => cb(0));
  };

  function setup(overflow: boolean) {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2", "t3"]));
    ["t1", "t2", "t3"].forEach((id) => session.tabUpserted(makeTab(id, "w1")));
    view.setView("w1", "t1");
    const wrapper = mountTabBar(makeConnection());
    const rootEl = wrapper.get(".tab-bar").element as HTMLElement;
    const rowEl = wrapper.get(".tab-bar-tabs").element as HTMLElement;
    const rect = (l: number, r: number): DOMRect => ({ left: l, right: r, top: 0, bottom: 30, width: r - l, height: 30, x: l, y: 0, toJSON: () => ({}) });
    vi.spyOn(rootEl, "getBoundingClientRect").mockReturnValue(rect(0, 600));
    vi.spyOn(rowEl, "getBoundingClientRect").mockReturnValue(rect(0, 500));
    Object.defineProperty(rowEl, "scrollWidth", { configurable: true, value: overflow ? 900 : 500 });
    Object.defineProperty(rowEl, "clientWidth", { configurable: true, value: 500 });
    let left = 0;
    Object.defineProperty(rowEl, "scrollLeft", { configurable: true, get: () => left, set: (v: number) => (left = v) });
    const btn = wrapper.findAll(".tab-bar-item")[0]!.element as HTMLElement;
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 50, clientY: 15, button: 0 }));
    const moveTo = (x: number) => btn.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: x, clientY: 15 }));
    return { btn, moveTo, rowEl, wrapper };
  }

  it("右端から 24px 未満にいると、フレームごとに scrollLeft が増える", () => {
    const { moveTo, rowEl } = setup(true);
    moveTo(490);
    step();
    expect(rowEl.scrollLeft).toBe(8);
    step();
    expect(rowEl.scrollLeft).toBe(16);
  });
  it("左端でも同様に減る（0 を下回らない扱いはブラウザ任せ）", () => {
    const { moveTo, rowEl } = setup(true);
    moveTo(300);
    rowEl.scrollLeft = 40;
    moveTo(5);
    step();
    expect(rowEl.scrollLeft).toBe(32);
  });
  it("中ほどでは変わらない", () => {
    const { moveTo, rowEl } = setup(true);
    moveTo(250);
    step();
    step();
    expect(rowEl.scrollLeft).toBe(0);
  });
  it("あふれていないときは変わらない", () => {
    const { moveTo, rowEl } = setup(false);
    moveTo(490);
    step();
    expect(rowEl.scrollLeft).toBe(0);
  });
  it("離した後・Escape の後は、フレームを進めても変わらない（rAF が止まる）", () => {
    for (const how of ["up", "esc"] as const) {
      const { btn, moveTo, rowEl, wrapper } = setup(true);
      moveTo(490);
      step();
      expect(rowEl.scrollLeft).toBe(8);
      const before = cancelled;
      if (how === "up") btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 490, clientY: 15 }));
      else document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(cancelled).toBeGreaterThan(before);
      step();
      step();
      expect(rowEl.scrollLeft).toBe(8);
      wrapper.unmount();
    }
  });
  it("アンマウントでも rAF を止める", () => {
    const { moveTo, wrapper } = setup(true);
    moveTo(490);
    const before = cancelled;
    wrapper.unmount();
    expect(cancelled).toBeGreaterThan(before);
  });
});
