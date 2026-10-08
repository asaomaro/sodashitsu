import type { Pane } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { ActionDispatcherKey, TerminalRegistryKey } from "../injection.js";
import { NO_NEIGHBORS, type PaneSides } from "../layout/paneChrome.js";
import { useDisplayStore } from "../store/display.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import PaneFrame from "./PaneFrame.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

function makePane(id: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}

function mountFrame(opts: { enabled?: boolean; withPinia?: boolean; multiPane?: boolean; neighbors?: PaneSides } = {}) {
  const actions = { openContextMenu: vi.fn(), movePaneToEdge: vi.fn(), replacePaneWithDrag: vi.fn(), movePaneToTab: vi.fn(), movePaneToNewTab: vi.fn() };
  const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
  const wrapper = mount(PaneFrame, {
    attachTo: document.body,
    props: {
      paneId: "p1",
      ...(opts.enabled === false ? {} : { enabled: true }),
      ...(opts.multiPane === undefined ? {} : { multiPane: opts.multiPane }),
      ...(opts.neighbors ? { neighbors: opts.neighbors } : {}),
    },
    global: {
      plugins: opts.withPinia === false ? [] : [pinia],
      provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry },
    },
    slots: { default: '<div class="fake-leaf"><textarea class="fake-terminal"></textarea></div>' },
  });
  return { wrapper, actions, registry };
}

describe("PaneFrame（pane の枠。M7 の後半・D110）", () => {
  it("enabled でなければ枠を描かず、ストアにも触れない（モバイル・Pinia の無い単体テストでも mount できる）", () => {
    const { wrapper } = mountFrame({ enabled: false, withPinia: false });
    expect(wrapper.find(".pane-frame-edge").exists()).toBe(false);
    expect(wrapper.find(".pane-frame").classes()).not.toContain("pane-frame-enabled");
    expect(wrapper.find(".pane-frame-body .fake-leaf").exists()).toBe(true);
  });

  it("枠は中身（葉）を包まない（葉の兄弟。操作できる要素の入れ子にしない）", () => {
    const { wrapper } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge").element;
    const leaf = wrapper.get(".fake-leaf").element;
    expect(edge.contains(leaf)).toBe(false);
    expect(wrapper.find(".pane-frame").classes()).toContain("pane-frame-enabled");
  });

  it("枠の右クリックは、rightClick が 'pane' の pane でも、その pane のメニューを開く（ブラウザの既定のメニューは止める）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { rightClick: "pane" }));
    const { wrapper, actions } = mountFrame();
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 });
    wrapper.get(".pane-frame-edge").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(actions.openContextMenu).toHaveBeenCalledWith({ kind: "pane", paneId: "p1" }, { x: 12, y: 34 });
  });

  it("中身（端末）の上の右クリックは枠では扱わない（端末の右クリックは MouseBridge の担当）", () => {
    const { wrapper, actions } = mountFrame();
    wrapper.get(".fake-terminal").element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(actions.openContextMenu).not.toHaveBeenCalled();
  });

  it("枠の押下は pane を選び、端末にフォーカスする（枠そのものはフォーカスを取らない。M1）", () => {
    const { wrapper, registry } = mountFrame();
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 });
    wrapper.get(".pane-frame-edge").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(useViewStore(pinia).focusedPaneId).toBe("p1");
    expect(registry.focus).toHaveBeenCalledWith("p1");
  });

  it("キーボード：枠は menu button で、Enter・Space・↓・Shift+F10・ContextMenu キーでメニューを開く", async () => {
    const { wrapper, actions } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.attributes()).toMatchObject({ role: "button", "aria-haspopup": "menu" });
    const opened: unknown[] = [];
    for (const init of [{ key: "Enter" }, { key: " " }, { key: "ArrowDown" }, { key: "F10", shiftKey: true }, { key: "ContextMenu" }]) {
      actions.openContextMenu.mockClear();
      const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      edge.element.dispatchEvent(ev);
      opened.push([init.key, ev.defaultPrevented, actions.openContextMenu.mock.calls.length]);
    }
    expect(opened).toEqual([
      ["Enter", true, 1],
      [" ", true, 1],
      ["ArrowDown", true, 1],
      ["F10", true, 1],
      ["ContextMenu", true, 1],
    ]);
    expect(actions.openContextMenu).toHaveBeenLastCalledWith({ kind: "pane", paneId: "p1" }, expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("キーボード：開くキーは window の keydown（端末の外のキーの処理）へ渡さず、ほかのキー（Tab・prefix 等）は渡す", () => {
    const { wrapper, actions } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge").element;
    const onWindowKeydown = vi.fn();
    window.addEventListener("keydown", onWindowKeydown);
    edge.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
    expect(onWindowKeydown).not.toHaveBeenCalled();
    for (const init of [{ key: "Tab" }, { key: "b", ctrlKey: true }, { key: "F10" }, { key: "Enter", ctrlKey: true }]) {
      edge.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    }
    window.removeEventListener("keydown", onWindowKeydown);
    expect(onWindowKeydown).toHaveBeenCalledTimes(4);
    expect(actions.openContextMenu).toHaveBeenCalledTimes(1);
  });

  it("aria-label に pane の名前、aria-expanded はその pane のメニューが開いている間だけ true", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.attributes("aria-label")).toBe("pane「build」のメニュー");
    expect(edge.attributes("aria-expanded")).toBe("false");
    view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    await wrapper.vm.$nextTick();
    expect(edge.attributes("aria-expanded")).toBe("true");
    view.openContextMenu({ kind: "pane", paneId: "p2" }, { x: 0, y: 0 });
    await wrapper.vm.$nextTick();
    expect(edge.attributes("aria-expanded")).toBe("false");
  });

  // 20260920-ui-selection-visuals の AC7：ポインタを重ねるたびに出る説明のツールチップを外す。
  it("枠に title 属性を置かない（aria-label は残す）", () => {
    const session = useSessionStore(pinia);
    session.paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.attributes("title")).toBeUndefined();
    expect(edge.attributes("aria-label")).toBe("pane「build」のメニュー");
  });

  // AC8：枠は role="button" のメニューボタンなので、そこに aria-current を置くと「ボタンが current」になる。
  // pane そのものを指すのは外側の要素（role="group" ＋ pane の名前）。
  it("選ばれている pane の外側の要素に role=group・pane の名前・aria-current を付ける", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", { label: "build" }));
    view.focusPane("p2");
    const { wrapper } = mountFrame();
    const frame = wrapper.get(".pane-frame");
    expect(frame.attributes("role")).toBe("group");
    expect(frame.attributes("aria-label")).toBe("pane「build」"); // メニューの名前は流用しない
    expect(frame.attributes("aria-current")).toBeUndefined(); // 選ばれていない間は属性ごと出さない
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(frame.attributes("aria-current")).toBe("true");
  });

  it("enabled でなければ role も aria も付けない（モバイルではストアに触れないため）", () => {
    const { wrapper } = mountFrame({ enabled: false, withPinia: false });
    const frame = wrapper.get(".pane-frame");
    expect(frame.attributes("role")).toBeUndefined();
    expect(frame.attributes("aria-label")).toBeUndefined();
    expect(frame.attributes("aria-current")).toBeUndefined();
  });
});

// 20260922-appearance-settings-rest T4（design「振る舞いの詳細」US4）。
describe("PaneFrame — エージェント名の可視表示（AC11・AC12）", () => {
  it("既定（設定が無効）では、名前があっても画面に出さない（aria-label だけ。AC12）", () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    expect(wrapper.find(".pane-frame-name").exists()).toBe(false);
    expect(wrapper.get(".pane-frame-edge").attributes("aria-label")).toBe("pane「build」のメニュー");
  });

  it("設定を有効にすると、名前が可視のテキストで出る（AC11）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name");
    expect(name.text()).toBe("build");
    expect(name.attributes("aria-hidden")).toBe("true"); // aria-label と二重に読み上げない
  });

  it("設定が有効でも、名前が無い pane では何も出さない", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1")); // label なし・agent なし
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".pane-frame-name").exists()).toBe(false);
  });

  it("有効にした後、無効に戻すと消える", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".pane-frame-name").exists()).toBe(true);
    settings.setPaneAgentNameVisible(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".pane-frame-name").exists()).toBe(false);
  });

  it("enabled でなければ設定に触れず、名前も出さない（モバイル）", () => {
    const { wrapper } = mountFrame({ enabled: false, withPinia: false });
    expect(wrapper.find(".pane-frame-name").exists()).toBe(false);
  });
});

// 枠・隙間の太さ（AC9）の実際の反映は、happy-dom が `var()` を解決しないため単体テストでは
// 確かめられない（`getComputedStyle` の戻り値が信頼できない）。E2E（T8）で実測する。

// AC4・AC5：強調はマウスの位置ではなく選択で決まる（以前は `:hover` だけが枠を塗っていた）。
describe("PaneFrame — 強調は選ばれている pane に付く", () => {
  it("選ばれている pane の枠にだけ強調のクラスが付き、選び直すと移る", async () => {
    const view = useViewStore(pinia);
    view.focusPane("p2");
    const { wrapper } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.classes()).not.toContain("pane-frame-edge-current");
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(edge.classes()).toContain("pane-frame-edge-current");
    view.focusPane("p2");
    await wrapper.vm.$nextTick();
    expect(edge.classes()).not.toContain("pane-frame-edge-current");
  });
});

describe("PaneFrame — Tab で止まるのは選ばれている pane の枠だけ（roving tabindex。独立点検 #2）", () => {
  it("選ばれている pane の枠は tabindex 0、ほかは -1。選び直すと入れ替わる", async () => {
    const view = useViewStore(pinia);
    view.focusPane("p2");
    const { wrapper } = mountFrame();
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.attributes("tabindex")).toBe("-1");
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(edge.attributes("tabindex")).toBe("0");
    view.focusPane("p2");
    await wrapper.vm.$nextTick();
    expect(edge.attributes("tabindex")).toBe("-1");
  });
});

describe("PaneFrame — 枠の中にフォーカスがあるまま消えたら、選ばれている pane の端末へ移す（独立点検 #4）", () => {
  /** `PaneLayout` の描き直しで枠が外れるのと同じく、親の `v-if` で外す。 */
  function mountToggleable() {
    const actions = { openContextMenu: vi.fn() };
    const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
    const show = ref(true);
    const Host = defineComponent({
      components: { PaneFrame },
      setup: () => ({ show }),
      template: '<div><PaneFrame v-if="show" pane-id="p1" enabled><textarea class="fake-terminal"></textarea></PaneFrame></div>',
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry } },
    });
    return { wrapper, registry, hide: () => (show.value = false) };
  }

  it("枠そのものにフォーカスがあるまま外れる（選ばれていない pane を閉じた）と、選ばれている pane の端末へフォーカスする", async () => {
    useViewStore(pinia).focusPane("p9");
    const { wrapper, registry, hide } = mountToggleable();
    (wrapper.get(".pane-frame-edge").element as HTMLElement).focus();
    hide();
    await vi.waitFor(() => expect(registry.focus).toHaveBeenCalledWith("p9"));
  });

  it("中の端末にフォーカスがあるまま外れても同じ", async () => {
    useViewStore(pinia).focusPane("p9");
    const { wrapper, registry, hide } = mountToggleable();
    (wrapper.get(".fake-terminal").element as HTMLElement).focus();
    hide();
    await vi.waitFor(() => expect(registry.focus).toHaveBeenCalledWith("p9"));
  });

  it("枠の外にフォーカスがあれば何もしない（フォーカスを奪わない）", async () => {
    useViewStore(pinia).focusPane("p9");
    const { registry, hide } = mountToggleable();
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    hide();
    await new Promise((r) => setTimeout(r, 10));
    expect(registry.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(other);
  });
});

// 20260923-pane-name-dnd-swap：herdr 風の legend 表示（AC1〜AC3）。ドラッグの本体は
// 20260924-pane-dnd-split-move で「入れ替え」から「縁での分割/中央での分割解除」へ置き換わった
// （decisions.md D4）——下の describe を参照。
describe("PaneFrame — 名前の legend 表示（AC1〜AC3）", () => {
  it("名前があり設定が有効なら、枠に legend 用のクラスが付く（AC1）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".pane-frame-edge").classes()).toContain("pane-frame-edge-named");
  });

  it("フォーカス中は current 用のクラスが legend にも付く（AC2）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    useViewStore(pinia).focusPane("p1");
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".pane-frame-edge").classes()).toEqual(expect.arrayContaining(["pane-frame-edge-current", "pane-frame-edge-named"]));
    expect(wrapper.get(".pane-frame-name").classes()).toContain("pane-frame-name-current");
  });

  it("フォーカスが無ければ current 用のクラスは付かない（AC3）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".pane-frame-edge").classes()).not.toContain("pane-frame-edge-current");
    expect(wrapper.get(".pane-frame-name").classes()).not.toContain("pane-frame-name-current");
  });

  it("名前ラベルの上の右クリックでも、枠と同じく pane のメニューが開く（review 指摘：pointer-events: auto で覆われて枠まで届かなくなる回帰）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const settings = useSettingsStore(pinia);
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 12, clientY: 34 });
    wrapper.get(".pane-frame-name").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(actions.openContextMenu).toHaveBeenCalledWith({ kind: "pane", paneId: "p1" }, { x: 12, y: 34 });
  });
});

describe("PaneFrame — 名前ラベルをドラッグしての分割・分割解除（20260924-pane-dnd-split-move。AC-I1〜AC-I5）", () => {
  function pointerEvent(type: string, opts: Partial<PointerEvent> & { clientX: number; clientY: number; pointerId?: number }) {
    return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...opts });
  }

  // 対象 pane の要素（100x100。left=0,top=0）を模す。EDGE_RATIO=0.3 なので (90,50)=right・
  // (50,50)=center 等、座標で狙ったゾーンを作れる（`paneDragZone.test.ts` と同じ基準）。
  function mockElementFromPointAsPane(paneId: string | null) {
    const el = paneId
      ? ({
          closest: (sel: string) => (sel === "[data-pane-id]" ? { dataset: { paneId }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } : null),
        } as unknown as Element)
      : null;
    return vi.spyOn(document, "elementFromPoint").mockReturnValue(el);
  }

  /** tab バーの tab をドロップ先に模す（20260924-pane-move-cross-tab）。`[data-pane-id]` には当たらない。 */
  function mockElementFromPointAsTab(tabId: string) {
    const el = {
      closest: (sel: string) => (sel === "[data-tab-id]" ? { dataset: { tabId } } : null),
    } as unknown as Element;
    return vi.spyOn(document, "elementFromPoint").mockReturnValue(el);
  }

  /** サイドバーの workspace 行をドロップ先に模す（20260924-pane-move-cross-tab）。 */
  function mockElementFromPointAsWorkspace(workspaceId: string) {
    const el = {
      closest: (sel: string) => (sel === "[data-drop-workspace-id]" ? { dataset: { dropWorkspaceId: workspaceId } } : null),
    } as unknown as Element;
    return vi.spyOn(document, "elementFromPoint").mockReturnValue(el);
  }

  it("閾値未満のまま離すとドラッグにならず、既存のクリック（pane を選ぶ）にフォールバックする（AC-I1・AC-I5）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions, registry } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 12, clientY: 10 })); // 2px。閾値(6px)未満
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 10 }));

    expect(useViewStore(pinia).focusedPaneId).toBe("p1");
    expect(registry.focus).toHaveBeenCalledWith("p1");
    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    expect(useViewStore(pinia).paneDrag).toBeNull();
  });

  it("ちょうど閾値（6px）動かすとドラッグが始まる（境界値。AC-I1）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 0, clientY: 0 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 6, clientY: 0 })); // ちょうど6px
    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: null, overZone: null, overTabId: null, overWorkspaceId: null });
  });

  it("縁（右）で離すと movePaneToEdge(自分, 相手, 'right') を呼ぶ（AC1・AC4）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsPane("p2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 90, clientY: 50 })); // 対象 rect の右端寄り
    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: "p2", overZone: "right", overTabId: null, overWorkspaceId: null });
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 90, clientY: 50 }));

    expect(actions.movePaneToEdge).toHaveBeenCalledWith("p1", "p2", "right");
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    expect(useViewStore(pinia).paneDrag).toBeNull(); // ドラッグは終わっている
    spy.mockRestore();
  });

  it("中央で離すと replacePaneWithDrag(自分, 相手) を呼ぶ（AC5）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsPane("p2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 })); // 対象 rect の中央
    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: "p2", overZone: "center", overTabId: null, overWorkspaceId: null });
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));

    expect(actions.replacePaneWithDrag).toHaveBeenCalledWith("p1", "p2");
    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("確定後、ドラッグした pane にフォーカスが残る（AC-I4・AC8。確定前に別の pane が選ばれていても）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    useViewStore(pinia).focusPane("p9"); // p1 とは別の pane が選ばれている状態から始める
    const { wrapper, actions, registry } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsPane("p2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 90, clientY: 50 }));
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 90, clientY: 50 }));

    expect(actions.movePaneToEdge).toHaveBeenCalledWith("p1", "p2", "right");
    expect(useViewStore(pinia).focusedPaneId).toBe("p1"); // ドラッグした pane（自分）に移る
    expect(registry.focus).toHaveBeenCalledWith("p1");
    spy.mockRestore();
  });

  it("自分自身の上・pane 以外の上で離すと何もしない（AC9）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;

    // 自分自身の上
    let spy = mockElementFromPointAsPane("p1");
    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));
    spy.mockRestore();
    expect(useViewStore(pinia).paneDrag).toBeNull(); // ドラッグ状態は終わっている（宙に浮かない）

    // pane 以外（範囲外）
    spy = mockElementFromPointAsPane(null);
    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10, pointerId: 2 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50, pointerId: 2 }));
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50, pointerId: 2 }));
    spy.mockRestore();
    expect(useViewStore(pinia).paneDrag).toBeNull();

    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
  });

  it("tab バーの tab の上で離すと movePaneToTab(自分, tab) を呼ぶ（20260924-pane-move-cross-tab。AC1・AC-I4）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions, registry } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsTab("t2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: null, overZone: null, overTabId: "t2", overWorkspaceId: null });
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));

    expect(actions.movePaneToTab).toHaveBeenCalledWith("p1", "t2");
    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    // view の切り替え・focus は ActionDispatcher 側の責務（decisions.md D2）。PaneFrame.vue 自身は
    // 呼ばない——表示中の pane（p1 とは限らない）へ勝手に focus が動くと、画面と食い違う。
    expect(registry.focus).not.toHaveBeenCalled();
    expect(useViewStore(pinia).paneDrag).toBeNull();
    spy.mockRestore();
  });

  it("自分が今いる tab 自身の上ではハイライトしない（ドロップしても何も起きないため。review round1 の nit 指摘）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" })); // makePane の既定 tabId は "t1"
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsTab("t1"); // 自分自身の tab

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));

    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: null, overZone: null, overTabId: null, overWorkspaceId: null });
    spy.mockRestore();
  });

  it("サイドバーの workspace 行の上で離すと movePaneToNewTab(自分, workspace) を呼ぶ（20260924-pane-move-cross-tab。AC5・AC-I4）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions, registry } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsWorkspace("w2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    expect(useViewStore(pinia).paneDrag).toEqual({ sourcePaneId: "p1", overPaneId: null, overZone: null, overTabId: null, overWorkspaceId: "w2" });
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));

    expect(actions.movePaneToNewTab).toHaveBeenCalledWith("p1", "w2");
    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    expect(registry.focus).not.toHaveBeenCalled();
    expect(useViewStore(pinia).paneDrag).toBeNull();
    spy.mockRestore();
  });

  it("ドラッグ中に Esc を押すと取り消され、離しても何も送らない（AC-I2）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsPane("p2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    expect(useViewStore(pinia).paneDrag).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(useViewStore(pinia).paneDrag).toBeNull();
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));

    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ドラッグ中にダイアログが開くと取り消され、離しても何も送らない（Sidebar.vue の幅ドラッグと同じ precedent）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper, actions } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;
    const spy = mockElementFromPointAsPane("p2");

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 50, clientY: 50 }));
    expect(useViewStore(pinia).paneDrag).not.toBeNull();
    useViewStore(pinia).openDialogWithContext({ kind: "help" });
    await wrapper.vm.$nextTick();
    expect(useViewStore(pinia).paneDrag).toBeNull();
    name.dispatchEvent(pointerEvent("pointerup", { clientX: 50, clientY: 50 }));

    expect(actions.movePaneToEdge).not.toHaveBeenCalled();
    expect(actions.replacePaneWithDrag).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ドラッグ元とドロップ候補は別インスタンスの view.paneDrag を通じて分かる（isDropTarget のクラス）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "one" }));
    useSessionStore(pinia).paneUpserted(makePane("p2", { label: "two" }));
    useSettingsStore(pinia).setPaneAgentNameVisible(true);
    const actions = { openContextMenu: vi.fn(), movePaneToEdge: vi.fn(), replacePaneWithDrag: vi.fn() };
    const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
    const Host = defineComponent({
      components: { PaneFrame },
      template: '<div><PaneFrame pane-id="p1" enabled /><PaneFrame pane-id="p2" enabled /></div>',
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry } },
    });
    await wrapper.vm.$nextTick();

    useViewStore(pinia).startPaneDrag("p1");
    useViewStore(pinia).setPaneDragOver("p2");
    await wrapper.vm.$nextTick();

    const frames = wrapper.findAll(".pane-frame-edge");
    expect(frames[0]!.classes()).not.toContain("pane-frame-edge-drop-target"); // ドラッグ元自身は対象にならない
    expect(frames[1]!.classes()).toContain("pane-frame-edge-drop-target");
  });

  // 20260924-pane-dnd-split-move（design「視覚フィードバック」AC4）。
  it("ホバー中のゾーンに応じたオーバーレイだけが出て、ドラッグ元には出ない", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "one" }));
    useSessionStore(pinia).paneUpserted(makePane("p2", { label: "two" }));
    useSettingsStore(pinia).setPaneAgentNameVisible(true);
    const actions = { openContextMenu: vi.fn(), movePaneToEdge: vi.fn(), replacePaneWithDrag: vi.fn() };
    const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
    const Host = defineComponent({
      components: { PaneFrame },
      template: '<div><PaneFrame pane-id="p1" enabled /><PaneFrame pane-id="p2" enabled /></div>',
    });
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry } },
    });
    await wrapper.vm.$nextTick();

    useViewStore(pinia).startPaneDrag("p1");
    useViewStore(pinia).setPaneDragOver("p2", "left");
    await wrapper.vm.$nextTick();

    const frames = wrapper.findAll(".pane-frame");
    expect(frames[0]!.find(".pane-frame-zone").exists()).toBe(false); // ドラッグ元自身には出ない
    expect(frames[1]!.find(".pane-frame-zone-left").exists()).toBe(true);
    expect(frames[1]!.find(".pane-frame-zone-right").exists()).toBe(false);

    // ゾーンが変わればオーバーレイも変わる。
    useViewStore(pinia).setPaneDragOver("p2", "center");
    await wrapper.vm.$nextTick();
    expect(frames[1]!.find(".pane-frame-zone-left").exists()).toBe(false);
    expect(frames[1]!.find(".pane-frame-zone-center").exists()).toBe(true);
  });

  it("ドラッグ元の pane 自身が消えても paneDrag が宙に浮かない（別クライアントの close 等）", async () => {
    const settings = useSettingsStore(pinia);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame();
    settings.setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    const name = wrapper.get(".pane-frame-name").element;

    name.dispatchEvent(pointerEvent("pointerdown", { clientX: 10, clientY: 10 }));
    name.dispatchEvent(pointerEvent("pointermove", { clientX: 30, clientY: 10 }));
    expect(useViewStore(pinia).paneDrag).not.toBeNull();

    wrapper.unmount();

    expect(useViewStore(pinia).paneDrag).toBeNull();
  });
});

// 20260926-pane-frame-auto-mode：枠の描画モード・隙間（辺ごとの余白。design「振る舞いの詳細」）。
describe("PaneFrame — 枠の描画モードと隙間（AC1・AC6・AC-I5）", () => {
  const GAP = "var(--soda-pane-gap, 4px)";
  const padding = (w: ReturnType<typeof mountFrame>["wrapper"]) => {
    const st = (w.element as HTMLElement).style;
    return [st.paddingTop, st.paddingRight, st.paddingBottom, st.paddingLeft];
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it("既定（常に・隙間入）は、props を省いても 4 辺に余白・選択の強調・フォーカスの見え方は今のまま（AC1）", () => {
    useViewStore(pinia).focusPane("p1");
    const { wrapper } = mountFrame();
    expect(padding(wrapper)).toEqual([GAP, GAP, GAP, GAP]);
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.classes()).toContain("pane-frame-edge-current");
    expect(edge.classes()).not.toContain("pane-frame-edge-flush");
  });

  it("既定で名前表示を入れると、上の余白は今までと同じ calc(余白 + 1.2em)（AC1）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame({ multiPane: true, neighbors: { ...NO_NEIGHBORS, right: true } });
    useSettingsStore(pinia).setPaneAgentNameVisible(true);
    await wrapper.vm.$nextTick();
    expect(padding(wrapper)).toEqual([`calc(${GAP} + 1.2em)`, GAP, GAP, GAP]);
    expect(wrapper.find(".pane-frame-name").exists()).toBe(true);
  });

  it("枠を描かない pane：余白 0・強調なし・名前なし。Tab で止まりキーでメニューが開き、フォーカスの見え方の class が付く（AC-I5）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setPaneBorders("auto");
    settings.setPaneAgentNameVisible(true);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    useViewStore(pinia).focusPane("p1");
    const { wrapper, actions } = mountFrame({ multiPane: false });
    expect(padding(wrapper)).toEqual(["0px", "0px", "0px", "0px"]);
    const edge = wrapper.get(".pane-frame-edge");
    expect(edge.classes()).not.toContain("pane-frame-edge-current");
    expect(edge.classes()).not.toContain("pane-frame-edge-named");
    expect(wrapper.find(".pane-frame-name").exists()).toBe(false);
    expect(wrapper.classes()).not.toContain("pane-frame-enabled-named");
    expect(edge.classes()).toContain("pane-frame-edge-flush");
    expect(edge.attributes("tabindex")).toBe("0");
    expect(wrapper.attributes("aria-current")).toBe("true");
    edge.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(actions.openContextMenu).toHaveBeenCalledWith({ kind: "pane", paneId: "p1" }, expect.anything());
  });

  it("枠ありで隙間切・上に隣：名前の余白は 1.2em だけ残し、隣の辺は 0（AC1 の名前と AC4 の組み合わせ）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setPaneGaps(false);
    settings.setPaneAgentNameVisible(true);
    useSessionStore(pinia).paneUpserted(makePane("p1", { label: "build" }));
    const { wrapper } = mountFrame({ multiPane: true, neighbors: { ...NO_NEIGHBORS, top: true } });
    expect(padding(wrapper)).toEqual(["1.2em", GAP, GAP, GAP]);
    expect(wrapper.find(".pane-frame-name").exists()).toBe(true);
    expect(wrapper.get(".pane-frame-edge").classes()).toContain("pane-frame-edge-flush");
  });

  it("設定を変えるとその場で余白が変わる（ページの再読み込み不要。AC6）", async () => {
    const settings = useSettingsStore(pinia);
    const { wrapper } = mountFrame({ multiPane: true, neighbors: { ...NO_NEIGHBORS, left: true } });
    expect(padding(wrapper)).toEqual([GAP, GAP, GAP, GAP]);
    settings.setPaneBorders("off");
    await wrapper.vm.$nextTick();
    expect(padding(wrapper)).toEqual(["0px", "0px", "0px", GAP]);
    settings.setPaneGaps(false);
    await wrapper.vm.$nextTick();
    expect(padding(wrapper)).toEqual(["0px", "0px", "0px", "0px"]);
  });

  it("enabled でなければ設定に関わらず余白の style を付けない（モバイル。AC7）", () => {
    const { wrapper } = mountFrame({ enabled: false, withPinia: false });
    expect(wrapper.attributes("style")).toBeUndefined();
  });
});

describe("PaneFrame — 表示の面（パネル・帯。20261007-soda-extensions・20261008-display-layout）", () => {
  const disp = (id: string, kind: "panel" | "band", over: Record<string, unknown> = {}) => ({ id, paneId: "p1", name: id, kind, format: "text", title: id, size: kind === "band" ? 32 : 320, rev: 1, bytes: 1, updatedAt: "x", ...over });

  /** 本体の箱の大きさを与える `ResizeObserver`（`observe` の直後に通知する。happy-dom は箱を測らない）。 */
  const realRO = globalThis.ResizeObserver;
  let box = { width: 1000, height: 600 };
  beforeEach(() => {
    box = { width: 1000, height: 600 };
    globalThis.ResizeObserver = class {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe(): void {
        void Promise.resolve().then(() => this.cb([{ contentRect: box } as ResizeObserverEntry], this as unknown as ResizeObserver));
      }
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = realRO;
  });
  const settle = async (w: { vm: { $nextTick(): Promise<void> } }): Promise<void> => {
    for (let i = 0; i < 4; i++) await w.vm.$nextTick();
  };

  it("面が無ければ、葉は .pane-frame-main の中にあるだけで、帯もパネルも描かない。enabled でなければ何も増えない", async () => {
    const { wrapper } = mountFrame();
    await settle(wrapper);
    expect(wrapper.find(".pane-frame-main .fake-leaf").exists()).toBe(true);
    expect(wrapper.find("[data-pane-bands]").exists()).toBe(false);
    expect(wrapper.find("[data-pane-panel]").exists()).toBe(false);
    const off = mountFrame({ enabled: false, withPinia: false });
    expect(off.wrapper.find(".pane-frame-main").exists()).toBe(false);
    expect(off.wrapper.find("[data-pane-bands]").exists()).toBe(false);
  });

  it("面が出ても、葉（スロットの中身）は作り直されない（同じ要素のまま）。葉は row > center > main の中", async () => {
    const { wrapper } = mountFrame();
    await settle(wrapper);
    const leaf = wrapper.get(".fake-leaf").element;
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel"));
    d.upsert(disp("b", "band"));
    await settle(wrapper);
    expect(wrapper.find("[data-pane-panel]").exists()).toBe(true);
    expect(wrapper.find("[data-pane-bands]").exists()).toBe(true);
    expect(wrapper.get(".fake-leaf").element).toBe(leaf);
    expect(wrapper.get(".pane-frame-main").element.contains(leaf)).toBe(true);
    expect(wrapper.get(".pane-frame-row > .pane-frame-center > .pane-frame-main").element.contains(leaf)).toBe(true);
    expect(wrapper.get("[data-pane-panel]").element.contains(leaf)).toBe(false);
  });

  it("4 つの側: 上 → 〔左｜端末｜右〕 → 下 の別の位置に載り、置き場所を変えると前の側の枠は消えて別の鍵で作り直される。ほかの側の枠は同じ要素のまま", async () => {
    const d = useDisplayStore(pinia);
    const infos = ["top", "bottom", "left", "right"].map((side) => disp(`d-${side}`, "panel", { dock: side, size: 150 }));
    infos.forEach((i) => d.upsert(i));
    const { wrapper } = mountFrame();
    await settle(wrapper);
    const root = wrapper.get(".pane-frame-body-displays").element;
    const order = [...root.children].map((e) => (e.classList.contains("pane-frame-row") ? "row" : e.getAttribute("data-display-dock")));
    expect(order).toEqual(["top", "row", "bottom"]);
    const row = wrapper.get(".pane-frame-row").element;
    expect([...row.children].map((e) => (e.classList.contains("pane-frame-center") ? "center" : e.getAttribute("data-display-dock")))).toEqual(["left", "center", "right"]);
    const frameOf = (side: string): Element | null => wrapper.find(`[data-display-dock="${side}"] .display-frame, [data-display-dock="${side}"] iframe`).exists() ? wrapper.get(`[data-display-dock="${side}"] .pane-panel-body`).element.firstElementChild : null;
    const bottomBefore = frameOf("bottom");
    const leftBefore = frameOf("left");
    // 右の面を左へ（利用者の操作）: 左は 2 枚のタブになり、右の側は消える。ほかの側の枠の要素は変わらない
    d.setFaceDock(infos[3]! as never, "left");
    await settle(wrapper);
    expect(wrapper.find('[data-display-dock="right"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-display-dock="left"] [data-pane-panel-tab]')).toHaveLength(2);
    expect(frameOf("bottom")).toBe(bottomBefore);
    expect(leftBefore).not.toBeNull();
  });

  it("面の D&D の間（store.dockDrag）は、その pane にだけ落とせる場所が出る。pane の D&D の落とす場所（.pane-frame-zone）とは別。view.paneDrag は立たない", async () => {
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel", { dock: "left" }));
    const { wrapper } = mountFrame();
    await settle(wrapper);
    expect(wrapper.find("[data-display-drop-zones]").exists()).toBe(false);
    d.setDockDrag({ id: "a", paneId: "other", zone: "top" });
    await settle(wrapper);
    expect(wrapper.find("[data-display-drop-zones]").exists()).toBe(false); // 別の pane の D&D
    d.setDockDrag({ id: "a", paneId: "p1", zone: "top" });
    await settle(wrapper);
    expect(wrapper.find("[data-display-drop-zones]").exists()).toBe(true);
    expect(wrapper.get('[data-display-drop-zone="left"]').text()).toContain("ここにあります");
    expect(wrapper.get('[data-active="1"]').attributes("data-display-drop-zone")).toBe("top");
    expect(wrapper.find(".pane-frame-zone").exists()).toBe(false);
    d.setDockDrag(null);
    await settle(wrapper);
    expect(wrapper.find("[data-display-drop-zones]").exists()).toBe(false);
  });

  it("本体の箱が 0×0 の間は、面の部品を 1 つも載せない（測れたら載せる）", async () => {
    box = { width: 0, height: 0 };
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel"));
    d.upsert(disp("b", "band"));
    const { wrapper } = mountFrame();
    await settle(wrapper);
    expect(wrapper.find("[data-pane-panel]").exists()).toBe(false);
    expect(wrapper.find("[data-pane-bands]").exists()).toBe(false);
    expect(wrapper.find(".fake-leaf").exists()).toBe(true);
  });

  it("その pane のいずれかの面にフォーカスがある間、端末の側（.pane-frame-main）を薄くする", async () => {
    const { wrapper } = mountFrame();
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel"));
    await settle(wrapper);
    expect(wrapper.get(".pane-frame-main").classes()).not.toContain("pane-frame-main-dimmed");
    d.setFocused("a");
    await settle(wrapper);
    expect(wrapper.get(".pane-frame-main").classes()).toContain("pane-frame-main-dimmed");
  });

  it("たたむとパネルは外れてトレイのボタンになる。帯は、上と下が別の入れ物（別の PaneBands）", async () => {
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel"));
    d.upsert(disp("t", "band"));
    d.upsert(disp("u", "band"));
    d.setFaceEdge(disp("u", "band") as never, "bottom");
    const { wrapper } = mountFrame();
    await settle(wrapper);
    const tops = wrapper.findAll('[data-pane-bands-edge="top"]');
    const bottoms = wrapper.findAll('[data-pane-bands-edge="bottom"]');
    expect(tops).toHaveLength(1);
    expect(bottoms).toHaveLength(1);
    expect(tops[0]!.element.contains(bottoms[0]!.element)).toBe(false);
    expect(tops[0]!.find('[data-display-name="t"]').exists()).toBe(true);
    expect(bottoms[0]!.find('[data-display-name="u"]').exists()).toBe(true);
    // 帯 t の行（トレイの側）にトレイが載る。パネルをたたむと、パネルが外れてボタンになる
    d.setFaceCollapsed(disp("a", "panel") as never, true);
    await settle(wrapper);
    expect(wrapper.find("[data-pane-panel]").exists()).toBe(false);
    expect(wrapper.find('[data-display-tray-button][data-display-id="a"]').exists()).toBe(true);
    expect(wrapper.get(".pane-frame-main").element.parentElement?.className).toContain("pane-frame-center");
  });

  it("帯が無く、たたんだ面だけなら 24px のトレイの行。面が無ければ行は無い", async () => {
    const d = useDisplayStore(pinia);
    d.upsert(disp("a", "panel"));
    d.setFaceCollapsed(disp("a", "panel") as never, true);
    const { wrapper } = mountFrame();
    await settle(wrapper);
    const row = wrapper.find("[data-display-tray-row]");
    expect(row.exists()).toBe(true);
    expect((row.element as HTMLElement).style.height).toBe("24px");
  });
});
