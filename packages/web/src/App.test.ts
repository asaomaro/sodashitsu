import type { MethodName, ParamsOf, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import { ActionDispatcher } from "./actions/ActionDispatcher.js";
import { ActionDispatcherKey, ConnectionKey, KeyInputControllerKey, NotificationControllerKey, TerminalRegistryKey, ViewSyncKey } from "./injection.js";
import { DesktopNotifier } from "./notify/DesktopNotifier.js";
import { NotificationController } from "./notify/NotificationController.js";
import { ToneSound } from "./notify/ToneSound.js";
import { KeyInputController } from "./keys/KeyInputController.js";
import { KeyRouter, type KeyRouterClock } from "@sodashitsu/client-core";
import { DEFAULT_KEYMAP } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "./store/session.js";
import { useSettingsStore } from "./store/settings.js";
import { useViewStore } from "./store/view.js";
import { MouseBridge } from "./term/MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "./term/RendererPool.js";
import { TerminalRegistry } from "./term/TerminalRegistry.js";
import { ViewSync } from "./term/ViewSync.js";

// App を丸ごと（xterm.js も）描く。負荷の下で最大 6.3 秒かかって既定の 5 秒で落ちた。上限はこのファイルにだけ効く（20260926-load-flaky-tests の D5）。
vi.setConfig({ testTimeout: 15_000 });

/**
 * App.vue の切り替え（T26）。main.ts の配線を模して、実物の KeyRouter・TerminalRegistry・ActionDispatcher を
 * 組み立てる（ActionDispatcher.test.ts の `makeDispatcher` と同じ手法）。
 */
let pinia: Pinia;

beforeEach(() => {
  // view ストアは初期化時に `soda.prefs.v1`（localStorage）を読む。消さないと
  // 同じワーカーで先に走ったファイルの選択が持ち越される（20260920-sidebar-tabbar-controls）。
  localStorage.clear();
  sessionStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

function makeConnection(): ConnectionPort {
  return {
    request<M extends MethodName>(_method: M, _params: ParamsOf<M>): Promise<ResultOf<M>> {
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

function realClock(): KeyRouterClock {
  return { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
}

class FakeWebglAddon implements WebglAddonLike {
  activate(): void {}
  dispose(): void {}
  onContextLoss(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

function makeProvide(conn: ConnectionPort) {
  const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
  const keys = new KeyInputController(router, conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  const registry = new TerminalRegistry({
    capacity: 100,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
  const actionDispatcher = new ActionDispatcher({ conn, pinia, registry, keys, notifications: { focusNext: () => undefined } });
  const view = useViewStore(pinia);
  keys.bind({ action: actionDispatcher, focus: actionDispatcher, mode: { onModeChange: (m) => view.onModeChange(m) } });
  const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000 });
  return {
    viewSync,
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: conn,
        [ActionDispatcherKey as symbol]: actionDispatcher,
        [TerminalRegistryKey as symbol]: registry,
        [ViewSyncKey as symbol]: viewSync,
        [KeyInputControllerKey as symbol]: keys,
        // 20260920-agent-notifications。`SettingsDialog`（旧 `NotificationSettingsDialog`）が inject を必須にしているので、
        // `main.ts` と同じものをここでも渡す（落とすとダイアログが throw して App が描けない）。
        [NotificationControllerKey as symbol]: new NotificationController({
          pinia,
          desktop: new DesktopNotifier(),
          sound: new ToneSound(),
          isPaneVisible: (paneId) => registry.isVisible(paneId),
        }),
      },
    },
  };
}

function makeWorkspace(id: string, tabIds: string[]): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string, paneId: string): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId }, focusedPaneId: paneId, zoomedPaneId: null, sizeOwnerClientId: null };
}

describe("App — 接続の状態での切り替え", () => {
  it("authRequired なら LoginView", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    view.onAuthRequired();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".login-view").exists()).toBe(true);
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });

  it("connectionState が detached なら DetachedView", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    view.onConnectionState("detached");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".detached-view").exists()).toBe(true);
    expect(wrapper.find(".app-shell").exists()).toBe(false);
  });

  it("ログイン画面の「接続中…」の間に接続の確認が 403（rejected）になったら、本体へ替えて理由を重ねて出す（D107：止めたままにしない）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    view.onAuthRequired();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".login-view").exists()).toBe(true);
    view.onConnectionState("connecting"); // ログインできて connect() した
    view.onConnectionState("rejected"); // /api/session が 403
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".login-view").exists()).toBe(false);
    expect(wrapper.find(".app-shell").exists()).toBe(true);
    expect(wrapper.find(".reconnect-overlay-command").text()).toBe(`--origin ${window.location.origin}`);
  });

  it("それ以外は本体（Sidebar・TabBar 等）を出す", () => {
    const wrapper = mount(App, makeProvide(makeConnection()));
    expect(wrapper.find(".app-shell").exists()).toBe(true);
    expect(wrapper.find(".sidebar").exists()).toBe(true);
    expect(wrapper.find(".tab-bar").exists()).toBe(true);
  });

  it("画面幅が 768px 未満なら MobileShell を出す（04-mobile T8。isMobileViewport）", () => {
    const spy = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    const wrapper = mount(App, makeProvide(makeConnection()));
    expect(wrapper.find(".mobile-shell").exists()).toBe(true);
    expect(wrapper.find(".sidebar").exists()).toBe(false);
    spy.mockRestore();
  });
});

describe("App — pane の描画", () => {
  it("現在の tab があれば PaneLayout 経由で TerminalPane を描く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
    view.setView("w1", "t1");
    const wrapper = mount(App, makeProvide(makeConnection()));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".xterm").exists()).toBe(true);
  });

  /** D110（design M7 の後半）：デスクトップは pane ごとに枠を描き、枠の右クリックは `rightClick: 'pane'` の pane でもメニューを開く。 */
  it("デスクトップは pane の枠を描き、枠の右クリックで（「pane に送る」にした pane でも）pane のメニューが開く", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "pane", agent: null, agentSession: null });
    view.setView("w1", "t1");
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    await wrapper.vm.$nextTick();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.element.parentElement!.contains(wrapper.get(".xterm").element)).toBe(true); // その pane の枠
    edge.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 3, clientY: 4 }));
    await wrapper.vm.$nextTick();
    expect(view.contextMenu).toEqual({ target: { kind: "pane", paneId: "p1" }, at: { x: 3, y: 4 } });
    expect(wrapper.get(".context-menu").text()).toContain("herdr のメニューを使う"); // 「pane に送る」を戻す項目
    wrapper.unmount();
  });

  it("モバイル（MobileShell）は pane の枠を描かない", async () => {
    // xterm.js も matchMedia（古い addListener）を使うので、それも持たせる。
    const spy = vi
      .spyOn(window, "matchMedia")
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() } as unknown as MediaQueryList);
    try {
      const session = useSessionStore(pinia);
      const view = useViewStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
      session.tabUpserted(makeTab("t1", "w1", "p1"));
      session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
      view.setView("w1", "t1");
      view.focusPane("p1"); // MobileShell はフォーカス中の pane を描く
      const wrapper = mount(App, makeProvide(makeConnection()));
      await wrapper.vm.$nextTick();
      expect(wrapper.find(".mobile-shell").exists()).toBe(true);
      expect(wrapper.find(".xterm").exists()).toBe(true);
      expect(wrapper.find(".pane-frame-edge").exists()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

// 20260922-appearance-settings-rest T4（design「インターフェース / データ構造」`PaneFrame.vue`／`Splitter.vue` 節）。
describe("App — pane の枠・隙間の太さの CSS 変数（AC9）", () => {
  it("`.app-shell` は既定で `--soda-pane-gap: 4px` を持つ", () => {
    const wrapper = mount(App, makeProvide(makeConnection()));
    expect(wrapper.get(".app-shell").attributes("style")).toContain("--soda-pane-gap: 4px");
  });

  it("`settings.paneFrameThickness` を変えると、リアクティブに変わる（ページの再読み込み不要）", async () => {
    const settings = useSettingsStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    settings.setPaneFrameThickness("thick");
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".app-shell").attributes("style")).toContain("--soda-pane-gap: 6px");
    settings.setPaneFrameThickness("thin");
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".app-shell").attributes("style")).toContain("--soda-pane-gap: 2px");
  });
});

// 20261008-ui-style T12a（D7）。様式ごとの太さの表を、`App.vue` の 1 か所で配る。
describe("App — 様式ごとの pane の隙間の太さ（20261008-ui-style）", () => {
  const gap = (w: ReturnType<typeof mount>) => w.get(".app-shell").attributes("style");
  it("クラシックは、今の値のまま（細い 2・既定 4・太い 6）。モダンは、4・8・12（仮置き）", async () => {
    const settings = useSettingsStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    const expected = { classic: { thin: 2, default: 4, thick: 6 }, modern: { thin: 4, default: 8, thick: 12 } } as const;
    for (const style of ["classic", "modern"] as const) {
      for (const t of ["thin", "default", "thick"] as const) {
        settings.setUiStyle(style);
        settings.setPaneFrameThickness(t);
        await wrapper.vm.$nextTick();
        expect(gap(wrapper), `${style}/${t}`).toContain(`--soda-pane-gap: ${expected[style][t]}px`);
      }
    }
  });

  it("様式を切り替えると、再読み込みなしで、太さの設定はそのまま、値だけが替わる", async () => {
    const settings = useSettingsStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    settings.setPaneFrameThickness("thick");
    settings.setUiStyle("modern");
    await wrapper.vm.$nextTick();
    expect(gap(wrapper)).toContain("--soda-pane-gap: 12px");
    expect(settings.paneFrameThickness).toBe("thick");
    settings.setUiStyle("classic");
    await wrapper.vm.$nextTick();
    expect(gap(wrapper)).toContain("--soda-pane-gap: 6px");
  });
});

// 20260922-tabbar-pane-appearance（PR #12 から取り込み）。
describe("App — pane 領域の外周の枠", () => {
  it("既定では `.app-panes-outer-borders` が付かず、`settings.paneOuterBorders` を有効にすると付く", async () => {
    const settings = useSettingsStore(pinia);
    const wrapper = mount(App, makeProvide(makeConnection()));
    expect(wrapper.get(".app-panes").classes()).not.toContain("app-panes-outer-borders");
    settings.setPaneOuterBorders(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".app-panes").classes()).toContain("app-panes-outer-borders");
  });
});

/**
 * D107（統合 review ラウンド1 で発見）：再接続の後に表示と購読を張り直す。main.ts の配線（`Connection.onOpened` →
 * `ViewSync.onConnectionOpened`）を模して、実物の ViewSync・TerminalRegistry・PaneLayout（root が付ける commit の関数）で確かめる。
 */
describe("App — 再接続の後の表示と購読の張り直し（D107）", () => {
  function makeRecordingConnection(): ConnectionPort & { requests: [MethodName, unknown][] } {
    const requests: [MethodName, unknown][] = [];
    return {
      requests,
      request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
        requests.push([method, params]);
        return Promise.resolve({} as ResultOf<M>);
      },
      sendInput: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      connect: vi.fn(),
    };
  }

  it("新しい接続の hello が通ったら、同じ表示でも client.view を送り直し、表示中の pane を購読し直す（xterm.js は作り直さない）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
    view.setView("w1", "t1");
    view.onConnectionState("open");
    const conn = makeRecordingConnection();
    const provide = makeProvide(conn);
    provide.viewSync.onConnectionOpened(); // 最初の接続の hello（main.ts が Connection.onOpened につなぐ）
    const wrapper = mount(App, provide);
    await wrapper.vm.$nextTick();
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);
    const xtermBefore = wrapper.find(".xterm").element;

    // 切断 → 再接続（本体は出たまま）。hello の snapshot は同じ構成。
    conn.requests.length = 0;
    provide.viewSync.onConnectionClosed(); // main.ts が Connection.onClosed につなぐ
    view.onConnectionState("reconnecting");
    await wrapper.vm.$nextTick();
    view.onConnectionState("open");
    provide.viewSync.onConnectionOpened(); // main.ts が Connection.onOpened につないでいる
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(conn.requests).toEqual([
      ["client.view", { workspaceId: "w1", tabId: "t1", visible: [expect.objectContaining({ paneId: "p1" })] }],
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 5000 }],
    ]);
    expect(wrapper.find(".xterm").element).toBe(xtermBefore);
  });

  it("切り離し画面の「再接続」：本体が hello より前に描かれて送れなかった分があっても、hello の後に送り直す", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
    view.setView("w1", "t1");
    view.onConnectionState("open");
    const conn = makeRecordingConnection();
    const provide = makeProvide(conn);
    provide.viewSync.onConnectionOpened(); // 最初の接続の hello（main.ts が Connection.onOpened につなぐ）
    const wrapper = mount(App, provide);
    await wrapper.vm.$nextTick();

    provide.viewSync.onConnectionClosed();
    view.onConnectionState("detached"); // prefix+q
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".detached-view").exists()).toBe(true);
    conn.requests.length = 0;
    view.onConnectionState("connecting"); // 「再接続」：本体が描き直されるが、hello はまだ（何も送らない。D107）
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".xterm").exists()).toBe(true);
    expect(conn.requests).toEqual([]);

    conn.requests.length = 0;
    view.onConnectionState("open");
    provide.viewSync.onConnectionOpened();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);
  });
});

// 20260926-settings-onboarding：はじめの案内を本体に置く（痕跡の無いブラウザで接続が open になると開く）。
describe("App — はじめの案内", () => {
  // happy-dom の navigator.webdriver は true（自動操作の扱い＝起動時の案内を出さない。D11）。it ごとに差し替え、失敗しても後続へ漏らさない。
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("本体に置かれ、痕跡の無いブラウザで接続が open になると開く", async () => {
    vi.spyOn(navigator, "webdriver", "get").mockReturnValue(false);
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    expect(wrapper.find(".onboarding-dialog").exists()).toBe(true);
    const view = useViewStore(pinia);
    view.onConnectionState("open");
    for (let i = 0; i < 4; i++) await wrapper.vm.$nextTick();
    expect(view.openDialog).toBe("onboarding");
    wrapper.unmount();
  });

  it("自動操作されているブラウザ（navigator.webdriver）では開かない（起動確認・E2E を遮らない。D11）", async () => {
    vi.spyOn(navigator, "webdriver", "get").mockReturnValue(true);
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    const view = useViewStore(pinia);
    view.onConnectionState("open");
    for (let i = 0; i < 4; i++) await wrapper.vm.$nextTick();
    expect(view.openDialog).toBeNull();
    wrapper.unmount();
  });
});

// 20260927-agent-graph（01 のレビュー ラウンド 1）：グラフ画面（`showModal()` の top layer）を開いている間も、トーストと再接続の表示が
// 画面の上に見えて押せる（dialog の中へ出す。decisions D4）。
describe("App — グラフ画面を開いている間のトースト・再接続の表示", () => {
  const flushTicks = async (w: { vm: { $nextTick(): Promise<void> } }) => {
    for (let i = 0; i < 4; i++) await w.vm.$nextTick();
  };
  const notInert = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) if (e.hasAttribute("inert")) return false;
    return true;
  };

  // 1 列の画面（重ねるダイアログ）。デスクトップのグラフは画面で、top layer ではない（下の describe）。
  let mediaSpy: ReturnType<typeof vi.spyOn> | null = null;
  beforeEach(() => {
    mediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() } as unknown as MediaQueryList);
    useViewStore(pinia).setMobileViewport(true);
  });
  afterEach(() => mediaSpy?.mockRestore());

  it("トーストと再接続の表示はグラフ画面の dialog の中に出て、inert ではない。閉じたら元の場所へ戻る", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    view.openGraph();
    await flushTicks(wrapper);
    const dialog = document.querySelector("dialog.graph-dialog")!;
    expect((dialog as HTMLDialogElement).open).toBe(true);
    view.toast("完了しました");
    view.onConnectionState("reconnecting");
    await flushTicks(wrapper);
    const toast = document.querySelector(".toast-list")!;
    const overlay = document.querySelector(".reconnect-overlay")!;
    expect(dialog.contains(toast)).toBe(true);
    expect(dialog.contains(overlay)).toBe(true);
    expect(toast.textContent).toContain("完了しました");
    expect(notInert(toast) && notInert(overlay)).toBe(true);
    view.closeGraph();
    await flushTicks(wrapper);
    expect(dialog.contains(document.querySelector(".toast-list"))).toBe(false);
    expect(document.querySelector(".toast-list")).not.toBeNull();
    wrapper.unmount();
  });

  it("グラフ画面を開いたままログインし直して本体が作り直されても、dialog を開き直す（開いた状態とキーの dialog モードが食い違わない）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    view.openGraph();
    await flushTicks(wrapper);
    view.onAuthRequired();
    await flushTicks(wrapper);
    expect(document.querySelector("dialog.graph-dialog")).toBeNull();
    view.onConnectionState("open");
    await flushTicks(wrapper);
    expect(view.graphVisible).toBe(true);
    expect((document.querySelector("dialog.graph-dialog") as HTMLDialogElement).open).toBe(true);
    wrapper.unmount();
  });
});

// 20261008-graph-first（PR1b）：デスクトップのグラフは主な領域の画面。基本画面は、大きさを保ったまま見えなくする（D11）。
describe("App — 画面の並び（デスクトップ）", () => {
  const flushTicks = async (w: { vm: { $nextTick(): Promise<void> } }) => {
    for (let i = 0; i < 4; i++) await w.vm.$nextTick();
  };
  function setupTab() {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.paneUpserted({ id: "p1", tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null });
    view.setView("w1", "t1");
    return view;
  }

  it("画面の一覧から作った 3 つの画面が主な領域にあり、はじめは基本画面だけが見えている（ほかは inert・visibility: hidden）", async () => {
    setupTab();
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    await flushTicks(wrapper);
    const base = wrapper.get('[data-screen="base"]');
    const graph = wrapper.get('[data-screen="graph"]');
    expect(base.attributes("inert")).toBeUndefined();
    expect(base.classes()).not.toContain("app-screen-hidden");
    expect(graph.attributes("inert")).toBeDefined();
    expect(graph.classes()).toContain("app-screen-hidden");
    const dashboard = wrapper.get('[data-screen="dashboard"]');
    expect(dashboard.attributes("inert")).toBeDefined();
    expect(dashboard.classes()).toContain("app-screen-hidden");
    expect(wrapper.find("[data-dashboard]").exists()).toBe(false); // 見えない間は中身を持たない
    expect(wrapper.findAll(".screen-switcher-btn").map((b) => b.text())).toEqual(["基本画面", "グラフ", "利用状況"]);
    wrapper.unmount();
  });

  it("グラフの画面に切り替えても、基本画面は描かれたまま（v-if・display: none で隠さない）で、inert と visibility: hidden で見えなくなる。サイドバーは残る", async () => {
    const view = setupTab();
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    await flushTicks(wrapper);
    expect(wrapper.find(".xterm").exists()).toBe(true);
    view.openGraph();
    await flushTicks(wrapper);
    const base = wrapper.get('[data-screen="base"]');
    expect(base.attributes("inert")).toBeDefined();
    expect(base.classes()).toContain("app-screen-hidden");
    expect((base.element as HTMLElement).style.display).toBe(""); // display: none（v-show）を使わない
    expect(wrapper.find(".xterm").exists()).toBe(true); // pane は描かれたまま
    expect(wrapper.get('[data-screen="graph"]').attributes("inert")).toBeUndefined();
    expect(wrapper.find(".graph-toolbar").exists()).toBe(true);
    expect(wrapper.find(".sidebar").exists()).toBe(true);
    expect(document.querySelector("dialog.graph-dialog")).toBeNull(); // デスクトップでは dialog を使わない
    // 切り替えの部品で戻れる
    await wrapper.get('[data-screen-id="base"]').trigger("click");
    await flushTicks(wrapper);
    expect(view.screen).toBe("base");
    expect(wrapper.get('[data-screen="base"]').attributes("inert")).toBeUndefined();
    wrapper.unmount();
  });

  it("ダッシュボードの画面（20261010-agent-usage PR3）: 基本画面は描かれたまま inert になり、切り替えの部品で入って戻れる。行を押すとその pane の基本画面へ移る", async () => {
    const view = setupTab();
    const session = useSessionStore(pinia);
    session.paneUpserted({
      id: "p1", tabId: "t1", label: null, cwd: "/work", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr",
      agent: { instanceId: "i1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: Date.now() - 60_000, name: "alpha" },
      agentSession: null,
    });
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    await flushTicks(wrapper);
    await wrapper.get('[data-screen-id="dashboard"]').trigger("click");
    await flushTicks(wrapper);
    expect(view.screen).toBe("dashboard");
    expect(view.dashboardVisible).toBe(true);
    const base = wrapper.get('[data-screen="base"]');
    expect(base.attributes("inert")).toBeDefined();
    expect(base.classes()).toContain("app-screen-hidden");
    expect(wrapper.find(".xterm").exists()).toBe(true); // pane は描かれたまま（PTY の大きさを保つ）
    expect(wrapper.get('[data-screen="dashboard"]').attributes("inert")).toBeUndefined();
    expect(document.querySelector("dialog.dashboard-dialog")).toBeNull(); // デスクトップでは dialog を使わない
    const row = wrapper.get('[data-dash-row="p1"]');
    expect(row.text()).toContain("alpha");
    expect(wrapper.get("[data-dash-no-accounts]").text()).toBe("まだ値がありません");
    await row.trigger("click");
    await flushTicks(wrapper);
    expect(view.screen).toBe("base");
    expect(view.focusedPaneId).toBe("p1");
    expect(wrapper.get('[data-screen="base"]').attributes("inert")).toBeUndefined();
    expect(wrapper.find("[data-dashboard]").exists()).toBe(false);
    // もう一度入って、Esc で戻る
    view.setScreen("dashboard");
    await flushTicks(wrapper);
    await wrapper.get("[data-dashboard]").trigger("keydown", { key: "Escape" });
    await flushTicks(wrapper);
    expect(view.screen).toBe("base");
    wrapper.unmount();
  });

  it("デスクトップのグラフの画面は top layer ではないので、トーストと再接続の表示は元の場所のまま", async () => {
    const view = setupTab();
    const wrapper = mount(App, { ...makeProvide(makeConnection()), attachTo: document.body });
    view.openGraph();
    await flushTicks(wrapper);
    view.toast("完了しました");
    await flushTicks(wrapper);
    expect(document.querySelector("dialog")?.contains(document.querySelector(".toast-list"))).not.toBe(true);
    expect(document.querySelector(".toast-list")).not.toBeNull();
    wrapper.unmount();
  });
});
