import type { MethodName, ParamsOf, Pane, ResultOf, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey, KeyInputControllerKey, TerminalRegistryKey, ViewSyncKey } from "../injection.js";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, type KeyRouterClock } from "@sodashitsu/client-core";
import { DEFAULT_KEYMAP } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { MouseBridge } from "../term/MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "../term/RendererPool.js";
import { TerminalRegistry } from "../term/TerminalRegistry.js";
import { ViewSync } from "../term/ViewSync.js";
import MobileShell from "./MobileShell.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

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

function makeRegistry(conn: ConnectionPort): TerminalRegistry {
  const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
  const keys = new KeyInputController(router, conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  return new TerminalRegistry({
    capacity: 100,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
}

function makeWorkspace(id: string, tabIds: string[]): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false };
}
function makeTab(id: string, workspaceId: string, paneId: string): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId }, focusedPaneId: paneId, zoomedPaneId: null, sizeOwnerClientId: null };
}
function makePane(id: string, tabId: string): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null };
}

function seedAndMount() {
  const session = useSessionStore(pinia);
  const view = useViewStore(pinia);
  session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
  session.tabUpserted(makeTab("t1", "w1", "p1"));
  session.paneUpserted(makePane("p1", "t1"));
  view.setView("w1", "t1");
  view.focusPane("p1");

  const conn = makeConnection();
  const registry = makeRegistry(conn);
  // 実物の ViewSync（セルの寸法だけ固定。happy-dom にはレイアウトが無い）。hello が通るまで（`onConnectionOpened`）は何も送らない（D107）。
  const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 1000, getCellSize: () => CELL });
  const keys = { injectKey: vi.fn(), injectPrefix: vi.fn(), setPendingModifier: vi.fn() };
  const wrapper = mount(MobileShell, {
    global: {
      plugins: [pinia],
      provide: { [ConnectionKey as symbol]: conn, [TerminalRegistryKey as symbol]: registry, [ViewSyncKey as symbol]: viewSync, [KeyInputControllerKey as symbol]: keys },
    },
    attachTo: document.body,
  });
  return { session, view, conn, registry, viewSync, wrapper };
}

/** テストで固定するセルの寸法（`ViewSync` の `getCellSize`）。 */
const CELL = { width: 9, height: 18 };

describe("MobileShell — 表示", () => {
  it("上部バーに workspace/tab 名を出し、現在の pane を 1 つ表示する", () => {
    const { wrapper } = seedAndMount();
    expect(wrapper.get(".mobile-shell-title").text()).toBe("w1 / t1");
    expect(wrapper.find(".xterm").exists()).toBe(true);
  });

  it("visual viewport の高さを明示的な height にする（T7。ソフトキーボード対応）", () => {
    const { wrapper } = seedAndMount();
    expect(wrapper.get(".mobile-shell").attributes("style")).toContain(`height: ${window.innerHeight}px`);
  });
});

describe("MobileShell — ピッカー・キーボードの開閉", () => {
  it("タイトルをタップすると PanePicker を開き、close で閉じる", async () => {
    const { wrapper } = seedAndMount();
    expect(document.querySelector(".pane-picker")).toBeNull();
    await wrapper.get(".mobile-shell-title").trigger("click");
    expect(document.querySelector(".pane-picker")).not.toBeNull();
    await wrapper.get(".pane-picker-close").trigger("click");
    expect(document.querySelector(".pane-picker")).toBeNull();
  });

  it("キーボードボタンで ExtraKeys を出し入れする", async () => {
    const { wrapper } = seedAndMount();
    expect(document.querySelector(".extra-keys")).toBeNull();
    await wrapper.get(".mobile-shell-keyboard-btn").trigger("click");
    expect(document.querySelector(".extra-keys")).not.toBeNull();
    await wrapper.get(".mobile-shell-keyboard-btn").trigger("click");
    expect(document.querySelector(".extra-keys")).toBeNull();
  });

  it("「この端末に合わせる」で client.fit を送り、押した状態を表示する（T6）", async () => {
    const { conn, view, wrapper } = seedAndMount();
    view.onConnectionState("open"); // hello の通った接続がある（D108：無い間は送らない）
    const btn = wrapper.get(".mobile-shell-fit-btn");
    expect(btn.attributes("aria-pressed")).toBe("false");
    await btn.trigger("click");
    expect(conn.requests).toEqual([["client.fit", { enabled: true }]]);
    expect(btn.attributes("aria-pressed")).toBe("true");
  });
});

describe("MobileShell — タッチのスクロール", () => {
  it("pane の領域での縦スワイプが、現在表示中の pane の Terminal.scrollLines を呼ぶ", async () => {
    const { registry, wrapper } = seedAndMount();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick(); // TouchScroll の取り付け（flush: "post"）を待つ
    const term = registry.get("p1")?.term;
    expect(term).toBeDefined();
    const scrollSpy = vi.spyOn(term!, "scrollLines");

    const el = wrapper.get(".mobile-shell-pane").element;
    function touch(type: string, y: number) {
      const t = new Touch({ identifier: 1, target: el, clientX: 50, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], cancelable: true, bubbles: true }));
    }
    touch("touchstart", 300);
    touch("touchmove", 260); // 上方向へ 40px（閾値超え）。セルの高さの既定フォールバックは 18px なので複数行分動くはず
    touch("touchend", 260);

    expect(scrollSpy).toHaveBeenCalled();
  });
});

/** `ResizeObserver` の代わり（happy-dom には無い）。`fire()` で大きさの変化を知らせる。 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function stubRect(el: Element, width: number, height: number): void {
  (el as HTMLElement).getBoundingClientRect = () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;
}

/**
 * 04-mobile T9・D108（統合 review ラウンド1 で発見）：(b) `client.view` の大きさを縮小の枠の中の葉ではなく表示領域
 * （`.mobile-shell-pane`）で測り、表示領域の変化に追従させる。(a)「この端末に合わせる」を有効にしたまま繋ぎ直したら、新しい
 * 接続の最初の `client.view` の直後に `client.fit` を送り直す。実物の ViewSync・TerminalRegistry・PaneLayout で確かめる。
 */
describe("MobileShell — 表示領域で測る・繋ぎ直した後の fit（D108）", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
  });

  const views = (conn: ReturnType<typeof makeConnection>) => conn.requests.filter(([m]) => m === "client.view").map(([, p]) => (p as { visible: { paneId: string; cols: number; rows: number }[] }).visible);

  /** hello が通った状態にして、表示領域と葉の大きさを別々に当てる（葉は縮小の枠の中＝PTY の大きさ × scale）。 */
  async function openWith(area: { width: number; height: number }, leaf: { width: number; height: number }) {
    const mounted = seedAndMount();
    const { view, viewSync, wrapper } = mounted;
    stubRect(wrapper.get(".mobile-shell-pane").element, area.width, area.height);
    stubRect(wrapper.get(".pane-layout-leaf").element, leaf.width, leaf.height);
    view.onConnectionState("open");
    viewSync.onConnectionOpened(); // hello が通った → root の PaneLayout が今の表示で commit し直す
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    return mounted;
  }

  it("client.view は表示領域 ÷ セルの寸法を申告する（縮小の枠の中の葉は測らない）", async () => {
    const { conn } = await openWith({ width: 390, height: 600 }, { width: 390, height: 175 });
    expect(views(conn)).toEqual([[{ paneId: "p1", cols: 43, rows: 33 }]]); // 390/9=43.3、600/18=33.3（葉なら 43×9）
  });

  it("表示領域の大きさが変わったら 100ms に 1 回まで client.view を送り直す。PTY の大きさ（縮小の枠）が変わっても申告は変わらない（循環しない）", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { conn, session, wrapper } = await openWith({ width: 390, height: 600 }, { width: 390, height: 175 });
    await wrapper.get(".mobile-shell-fit-btn").trigger("click"); // fit 中（サイズ権限あり）
    const area = wrapper.get(".mobile-shell-pane").element;
    /** 表示領域の大きさの変化を、それを見ている全ての ResizeObserver に知らせる（実物と同じ）。 */
    const areaResized = (): void => FakeResizeObserver.instances.filter((o) => o.observed.has(area)).forEach((o) => o.fire());
    vi.useFakeTimers();

    // 回転（表示領域が 750×300 に）。続けて届いても 1 回にまとめる。
    stubRect(area, 750, 300);
    areaResized();
    areaResized();
    vi.advanceTimersByTime(99);
    expect(views(conn)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(views(conn)).toEqual([[{ paneId: "p1", cols: 43, rows: 33 }], [{ paneId: "p1", cols: 83, rows: 16 }]]);

    // サーバがその大きさに PTY を変えた：縮小の枠と葉の大きさが変わるが、表示領域は同じなので申告は変わらない。
    session.paneSizeChanged("p1", 83, 16);
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.get(".mobile-shell-pane-scale").attributes("style")).toContain(`width: ${83 * 9}px`);
    stubRect(wrapper.get(".pane-layout-leaf").element, 83 * 9, 16 * 18);
    areaResized();
    vi.advanceTimersByTime(1000);
    expect(views(conn)).toHaveLength(2);
  });

  it("「この端末に合わせる」を有効にしたまま繋ぎ直したら、client.view → client.fit → pane.subscribe の順に送り直す。押した表示のまま", async () => {
    const { conn, view, viewSync, wrapper } = await openWith({ width: 390, height: 600 }, { width: 390, height: 175 });
    await wrapper.get(".mobile-shell-fit-btn").trigger("click");
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe", "client.fit"]);

    conn.requests.length = 0;
    viewSync.onConnectionClosed(); // 切れた（main.ts が Connection.onClosed につなぐ）
    view.onConnectionState("reconnecting");
    await wrapper.vm.$nextTick();
    view.onConnectionState("open");
    viewSync.onConnectionOpened(); // 新しい接続の hello（サーバは fit:false で登録し直している）
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(conn.requests).toEqual([
      ["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 43, rows: 33 }] }],
      ["client.fit", { enabled: true }],
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 1000 }],
    ]);
    expect(wrapper.get(".mobile-shell-fit-btn").attributes("aria-pressed")).toBe("true");
  });

  it("切断中に押しても送らず、次の接続の最初の client.view の直後に送る（hello の前には送らない。D107）", async () => {
    const { conn, view, viewSync, wrapper } = await openWith({ width: 390, height: 600 }, { width: 390, height: 175 });
    conn.requests.length = 0;
    viewSync.onConnectionClosed();
    view.onConnectionState("reconnecting");
    await wrapper.get(".mobile-shell-fit-btn").trigger("click");
    expect(wrapper.get(".mobile-shell-fit-btn").attributes("aria-pressed")).toBe("true");
    expect(conn.requests).toEqual([]);

    view.onConnectionState("open");
    viewSync.onConnectionOpened();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "client.fit", "pane.subscribe"]);
  });
});

// 20260921-herdr-settings-gaps の AC13：モバイルはサイドバーも prefix キーも無いので、上部バーが唯一の入口。
describe("MobileShell — 設定への入口", () => {
  it("上部バーの「設定」のボタンで設定が開く", async () => {
    const { wrapper, view } = seedAndMount();
    await wrapper.vm.$nextTick();
    const btn = wrapper.get(".mobile-shell-settings-btn");
    // 絵文字（以前の 🔔）ではなく文字。**読み上げの名前を上書きする属性が無い**ことも見る——`aria-label` や
    // `aria-labelledby` が残っていると、文字が「設定」でも読み上げはそちらが勝つ（以前は「通知の設定」だった）。
    expect(btn.text()).toBe("設定");
    expect(btn.attributes("aria-label")).toBeUndefined();
    expect(btn.attributes("aria-labelledby")).toBeUndefined();
    await btn.trigger("click");
    expect(view.dialogContext).toEqual({ kind: "settings" });
  });
});

// 20260927-agent-graph の AC20：モバイルでもグラフを閲覧し、一時停止・再開ができる。入口は上部バーの文字のボタン。
describe("MobileShell — 連携（グラフ）への入口", () => {
  it("上部バーの「連携」のボタンでグラフ画面が開く", async () => {
    const { wrapper, view } = seedAndMount();
    await wrapper.vm.$nextTick();
    const btn = wrapper.get(".mobile-shell-graph-btn");
    expect(btn.text()).toBe("連携");
    await btn.trigger("click");
    expect(view.graphOpen).toBe(true);
    wrapper.unmount();
  });
});
