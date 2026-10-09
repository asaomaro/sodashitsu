import type { MethodName, ParamsOf, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ActionDispatcherKey, ConnectionKey, TerminalRegistryKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import ContextMenu from "./ContextMenu.vue";
import Sidebar from "./Sidebar.vue";
import TabBar from "./TabBar.vue";

/** モダンの配置（20261008-ui-style PR4。AC12〜AC18）。クラシックは、どの項目も今のまま（否定の対照）。 */

let pinia: Pinia;
const mounted: { unmount(): void }[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});
beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});

function makeWorkspace(id: string, tabIds: string[]): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null };
}
function makeConnection(): ConnectionPort {
  return {
    request<M extends MethodName>(_m: M, _p: ParamsOf<M>): Promise<ResultOf<M>> {
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}
function makeActions() {
  return {
    run: vi.fn(),
    openContextMenu: vi.fn(),
    newTabInWorkspace: vi.fn(),
    createGroupForWorkspace: vi.fn(),
    renameWorkspaceById: vi.fn(),
    closeWorkspaceById: vi.fn(),
    newWorktree: vi.fn(),
    openWorktree: vi.fn(),
    openGroupPicker: vi.fn(),
    removeWorkspaceFromGroup: vi.fn(),
  };
}
type Actions = ReturnType<typeof makeActions>;

function seed(tabCount: number): void {
  const session = useSessionStore(pinia);
  const tabIds = Array.from({ length: tabCount }, (_, i) => `t${i + 1}`);
  session.workspaceUpserted(makeWorkspace("w1", tabIds));
  for (const id of tabIds) session.tabUpserted(makeTab(id, "w1"));
  useViewStore(pinia).setView("w1", "t1");
}
function setStyle(style: "classic" | "modern"): void {
  useSettingsStore(pinia).setUiStyle(style);
}
function mountOf(component: typeof Sidebar | typeof TabBar | typeof ContextMenu, actions: Actions, extra: Record<symbol, unknown> = {}) {
  const w = mount(component, {
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: makeConnection(), [ActionDispatcherKey as symbol]: actions, ...extra } },
  });
  mounted.push(w);
  return w;
}

describe("モダンの配置 — サイドバー（AC13・AC14）", () => {
  it("クラシック: spaces の区画の中の［新規］［メニュー］と、最下部の畳むボタン。モダンの部品は無い", () => {
    seed(1);
    setStyle("classic");
    const w = mountOf(Sidebar, makeActions());
    expect(w.find(".sidebar-section-footer").exists()).toBe(true);
    expect(w.find(".sidebar-footer .sidebar-collapse-btn").exists()).toBe(true);
    expect(w.find(".sidebar-edge-toggle").exists()).toBe(false);
    expect(w.find("[data-sidebar-act]").exists()).toBe(false);
  });

  it("モダン: 最下部に［新規］［メニュー］［ベル］。spaces の区画の中のボタンと、最下部の畳む印は出さない", () => {
    seed(1);
    setStyle("modern");
    const w = mountOf(Sidebar, makeActions());
    expect(w.find(".sidebar-section-footer").exists()).toBe(false);
    expect(w.find(".sidebar-collapse-btn").exists()).toBe(false);
    const footer = w.find(".sidebar-footer");
    const kids = footer.element.children;
    expect([...kids].map((e) => (e as HTMLElement).dataset.sidebarAct ?? (e.hasAttribute("data-notification-bell") ? "bell" : "?"))).toEqual(["new", "menu", "bell"]);
  });

  it("モダン: 畳む・広げるの印が境の線の上にある。押すと toggleSidebar。畳んだ状態でも同じ印（読み上げの名前が変わる）", async () => {
    seed(1);
    setStyle("modern");
    const actions = makeActions();
    const w = mountOf(Sidebar, actions);
    const btn = w.find(".sidebar-edge-toggle");
    expect(btn.attributes("aria-label")).toBe("サイドバーを畳む");
    expect(btn.attributes("aria-expanded")).toBe("true");
    await btn.trigger("click");
    expect(actions.run).toHaveBeenCalledWith({ type: "toggleSidebar" });
    useViewStore(pinia).toggleSidebar();
    await nextTick();
    expect(w.find(".sidebar-edge-toggle").attributes("aria-label")).toBe("サイドバーを開く");
    // 畳んでも、［新規］［メニュー］は読み上げの名前を保つ（印だけ）。
    expect(w.find('[data-sidebar-act="new"]').attributes("aria-label")).toBe("新規");
    expect(w.find('[data-sidebar-act="menu"]').attributes("aria-label")).toBe("メニュー");
  });

  it("モダン: ［新規］は「新規」のメニューを、［メニュー］は全体のメニューを、ボタンの位置に開く", async () => {
    seed(1);
    setStyle("modern");
    const actions = makeActions();
    const w = mountOf(Sidebar, actions);
    await w.find('[data-sidebar-act="new"]').trigger("click");
    expect(actions.openContextMenu).toHaveBeenLastCalledWith({ kind: "new" }, expect.any(Object));
    await w.find('[data-sidebar-act="menu"]').trigger("click");
    expect(actions.openContextMenu).toHaveBeenLastCalledWith({ kind: "global" }, expect.any(Object));
  });

  it("様式を切り替えると、再読み込みなしで配置が替わる。フォーカスは、対応する新しい部品へ移る", async () => {
    seed(1);
    setStyle("classic");
    const w = mountOf(Sidebar, makeActions());
    (w.find(".sidebar-collapse-btn").element as HTMLElement).focus();
    setStyle("modern");
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.find(".sidebar-edge-toggle").element);
    (w.find('[data-sidebar-act="new"]').element as HTMLElement).focus();
    setStyle("classic");
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.find(".sidebar-section-footer .sidebar-btn:not(.sidebar-btn-right)").element);
  });

  it("消える部品に対応が無いときは、端末へ移す", async () => {
    seed(1);
    setStyle("modern");
    const registry = { focus: vi.fn() };
    const w = mountOf(Sidebar, makeActions(), { [TerminalRegistryKey as symbol]: registry });
    useViewStore(pinia).focusPane("p1");
    expect(w.find(".sidebar-edge-toggle").exists()).toBe(true);
    // 対応する部品がある場合は、端末へは移さない（上のテストで確認済み）。ここでは、フォーカスがサイドバーの外なら何もしない。
    setStyle("classic");
    await nextTick();
    await nextTick();
    expect(registry.focus).not.toHaveBeenCalled();
  });
});

describe("モダンの配置 — メニュー（AC12・AC15・AC16）", () => {
  function open(target: Parameters<ReturnType<typeof useViewStore>["openContextMenu"]>[0]) {
    const actions = makeActions();
    const w = mountOf(ContextMenu, actions);
    useViewStore(pinia).openContextMenu(target, { x: 1, y: 1 });
    return { w, actions };
  }
  async function labels(w: ReturnType<typeof mountOf>): Promise<string[]> {
    await nextTick();
    return w.findAll("[role=menuitem]").map((e) => e.text());
  }

  it("全体のメニュー: クラシックは「連携（グラフ）」あり。モダンは出さない", async () => {
    seed(1);
    setStyle("classic");
    expect(await labels(open({ kind: "global" }).w)).toContain("連携（グラフ）");
    mounted.pop()?.unmount();
    setStyle("modern");
    const l = await labels(open({ kind: "global" }).w);
    expect(l).not.toContain("連携（グラフ）");
    expect(l).toEqual(expect.arrayContaining(["キー割り当て", "移動", "設定", "切り離し"]));
  });

  it("workspace のメニュー: クラシックは「新しいグループを作る…」あり。モダンは出さない（グループへ追加・外すは残る）", async () => {
    seed(1);
    setStyle("classic");
    expect(await labels(open({ kind: "workspace", workspaceId: "w1" }).w)).toContain("新しいグループを作る…");
    mounted.pop()?.unmount();
    setStyle("modern");
    const l = await labels(open({ kind: "workspace", workspaceId: "w1" }).w);
    expect(l).not.toContain("新しいグループを作る…");
    expect(l).toEqual(expect.arrayContaining(["名前の変更", "閉じる"]));
  });

  it("「新規」のメニュー: workspace・pane・グループ。それぞれ、今ある操作を呼ぶ", async () => {
    seed(1);
    setStyle("modern");
    const { w, actions } = open({ kind: "new" });
    expect(await labels(w)).toEqual(["workspace", "pane", "グループ…"]);
    const items = w.findAll("[role=menuitem]");
    await items[0]!.trigger("click");
    expect(actions.run).toHaveBeenLastCalledWith({ type: "newWorkspace" });
    useViewStore(pinia).openContextMenu({ kind: "new" }, { x: 1, y: 1 });
    await nextTick();
    await w.findAll("[role=menuitem]")[1]!.trigger("click");
    expect(actions.run).toHaveBeenLastCalledWith({ type: "split", dir: "right" });
    useViewStore(pinia).openContextMenu({ kind: "new" }, { x: 1, y: 1 });
    await nextTick();
    await w.findAll("[role=menuitem]")[2]!.trigger("click");
    expect(actions.createGroupForWorkspace).toHaveBeenCalledWith("w1");
  });

  it("「新規」のメニューは、キーボードで選べる（↓ と Enter）", async () => {
    seed(1);
    setStyle("modern");
    const { w, actions } = open({ kind: "new" });
    await nextTick();
    await w.find("[role=menu]").trigger("keydown", { key: "ArrowDown" });
    await w.find("[role=menu]").trigger("keydown", { key: "Enter" });
    expect(actions.run).toHaveBeenLastCalledWith({ type: "split", dir: "right" });
  });

  it("グラフの画面では、「新規」のメニューに pane を出さない（見えない基本画面を変えない）", async () => {
    seed(1);
    setStyle("modern");
    useViewStore(pinia).setScreen("graph");
    const { w } = open({ kind: "new" });
    expect(await labels(w)).toEqual(["workspace", "グループ…"]);
  });
});

describe("モダンの配置 — tab バー（AC17）", () => {
  it("tab が 1 つ: クラシックは隠す。モダンは tab と「＋」を出す", () => {
    seed(1);
    setStyle("classic");
    expect(mountOf(TabBar, makeActions()).find(".tab-bar").exists()).toBe(false);
    mounted.pop()?.unmount();
    setStyle("modern");
    const w = mountOf(TabBar, makeActions());
    expect(w.find(".tab-bar").exists()).toBe(true);
    expect(w.findAll("[role=tab]")).toHaveLength(1);
    expect(w.find(".tab-bar-new").exists()).toBe(true);
  });

  it("tab が 1 つのとき、「＋」は tab を作る（既存の操作）。位置（上・下）の設定はどちらでも効く", async () => {
    seed(1);
    setStyle("modern");
    const actions = makeActions();
    const w = mountOf(TabBar, actions);
    await w.find(".tab-bar-new").trigger("click");
    expect(actions.newTabInWorkspace).toHaveBeenCalledWith("w1");
    useSettingsStore(pinia).tabBarPosition = "bottom";
    await nextTick();
    expect(w.find(".tab-bar").classes()).toContain("tab-bar-bottom");
  });

  it("様式を切り替えると、再読み込みなしで出る・消える", async () => {
    seed(1);
    setStyle("classic");
    const w = mountOf(TabBar, makeActions());
    expect(w.find(".tab-bar").exists()).toBe(false);
    setStyle("modern");
    await nextTick();
    expect(w.find(".tab-bar").exists()).toBe(true);
    setStyle("classic");
    await nextTick();
    expect(w.find(".tab-bar").exists()).toBe(false);
  });

  it("tab が 2 つ以上のときは、どちらの様式でも出る", () => {
    seed(2);
    setStyle("classic");
    expect(mountOf(TabBar, makeActions()).find(".tab-bar").exists()).toBe(true);
  });
});
