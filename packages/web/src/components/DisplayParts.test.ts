import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { resolvePaneDisplays, type LayoutInput } from "../display/paneDisplayLayout.js";
import { DisplayControllerKey, DisplayHostKey, type DisplayHost } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import DisplayPanelHead from "./DisplayPanelHead.vue";
import DisplayTray from "./DisplayTray.vue";
import PaneBands from "./PaneBands.vue";

/** 見出し（DisplayPanelHead）・トレイ（DisplayTray）・帯（PaneBands の edge あり）の属性・キー・押下（20261008-display-layout）。 */
const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({ id, paneId: "p1", name: id, kind: "panel", format: "text", title: id, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over });

let pinia: Pinia;
const controller = () => ({ dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined), onMessage: vi.fn(() => () => undefined) });
const hostMock = (): DisplayHost => ({
  focusTerminal: vi.fn(),
  focusSelectedTerminal: vi.fn(),
  injectPrefix: vi.fn(),
  prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }),
});

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  setActivePinia(pinia);
  document.body.innerHTML = "";
});

function mountWith(comp: unknown, props: Record<string, unknown>, host: DisplayHost = hostMock()) {
  const ctl = controller();
  const w = mount(comp as never, {
    props: props as never,
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: ctl, [DisplayHostKey as symbol]: host }, stubs: { DisplayFrame: true } },
  });
  return { w, ctl, host };
}

describe("DisplayPanelHead", () => {
  it("根の属性と、押してもフォーカスを取らない部品の印。印は縮まない兄弟、ラベルは省略される箱", () => {
    useSettingsStore().displayScriptEnabled = true;
    const a = info("a", { format: "script-html" });
    useDisplayStore().upsert(a);
    const { w } = mountWith(DisplayPanelHead, { info: a, collapsible: true });
    const root = w.get("[data-display-head]");
    expect(root.attributes("data-display-chrome")).toBeDefined();
    expect(root.classes()).toContain("pane-panel-head");
    const grip = w.get("[data-display-grip]");
    expect(grip.attributes("data-pane-panel-label")).toBeDefined();
    expect(grip.find("[data-display-script-mark]").exists()).toBe(true); // 印はラベルの入れ物（つかむ場所）の中。ラベルの箱の外
    expect(grip.get(".display-head-label").text()).toBe("pane のプログラムの表示（隔離）· a");
    for (const sel of ["[data-display-grip]", "[data-display-menu-button]", "[data-pane-panel-fold]", "[data-pane-panel-close]"]) {
      expect(w.get(sel).attributes("data-display-keepfocus"), sel).toBeDefined();
    }
    expect(w.find("[data-display-engage]").attributes("data-display-keepfocus")).toBeUndefined(); // ［操作する］は DisplayScriptMark（変えない）
    expect(w.get("[data-pane-panel-fold]").attributes("aria-label")).toBe("パネルをたたむ");
  });
  it("collapsible でなければ［たたむ］を出さない", () => {
    const { w } = mountWith(DisplayPanelHead, { info: info("a"), collapsible: false });
    expect(w.find("[data-pane-panel-fold]").exists()).toBe(false);
  });
  it("［▸］はたたむ（記憶を書く）。［×］は dismiss。［⋮］は面のメニューを開く。mousedown は preventDefault", async () => {
    const a = info("a");
    const store = useDisplayStore();
    store.upsert(a);
    const { w, ctl } = mountWith(DisplayPanelHead, { info: a, collapsible: true });
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    w.get("[data-pane-panel-fold]").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await w.get("[data-pane-panel-fold]").trigger("click");
    await nextTick();
    expect(store.effectiveOf(a).collapsed).toBe(true);
    await w.get("[data-pane-panel-close]").trigger("click");
    expect(ctl.dismiss).toHaveBeenCalledWith({ id: "a" });
    await w.get("[data-display-menu-button]").trigger("click");
    expect(useViewStore().contextMenu?.target).toEqual({ kind: "display", id: "a" });
  });
  it("Enter・Space の繰り返しは無視する（たたむ・開くが往復しない）。見出しのボタンの上の Esc は端末へ戻る", async () => {
    const a = info("a");
    const store = useDisplayStore();
    store.upsert(a);
    const host = hostMock();
    const { w } = mountWith(DisplayPanelHead, { info: a, collapsible: true }, host);
    const ev = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true });
    w.get("[data-pane-panel-fold]").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    w.get("[data-pane-panel-fold]").element.dispatchEvent(esc);
    expect(host.focusTerminal).toHaveBeenCalledWith("p1");
  });
  it("フォーカスのある［▸］を押すと、変更の前に端末へ移り、変更の後にその面のトレイのボタンへ。body を通らない", async () => {
    const a = info("a");
    const store = useDisplayStore();
    store.upsert(a);
    const term = document.createElement("textarea");
    document.body.appendChild(term);
    const host = hostMock();
    (host.focusTerminal as ReturnType<typeof vi.fn>).mockImplementation(() => term.focus());
    const { w } = mountWith(DisplayPanelHead, { info: a, collapsible: true }, host);
    const tray = document.createElement("button");
    tray.setAttribute("data-display-tray-button", "");
    tray.setAttribute("data-display-id", "a");
    document.body.appendChild(tray);
    const root = document.createElement("div");
    root.setAttribute("data-display-root", "a");
    root.appendChild(w.element);
    document.body.appendChild(root);
    const fold = w.get("[data-pane-panel-fold]").element as HTMLElement;
    fold.focus();
    let bodyHits = 0;
    document.addEventListener("focusout", (e) => { if ((e as FocusEvent).relatedTarget === null) bodyHits++; }, true);
    fold.click();
    expect(document.activeElement).toBe(term); // 同期で端末
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(tray);
    expect(bodyHits).toBe(0);
  });
});

describe("DisplayTray", () => {
  const buttons = (...b: { id: string; kind?: "panel" | "float" | "band"; open?: boolean; disabled?: boolean }[]) => b.map((x) => ({ kind: "panel" as const, open: false, disabled: false, ...x }));
  it("ボタンの属性・押せないボタンの理由・印・浮いた窓の aria-pressed・名前の省略", () => {
    const store = useDisplayStore();
    store.upsert(info("a"));
    store.upsert(info("b", { kind: "band" }));
    store.upsert(info("c", { name: "a-very-long-name-here" }));
    const { w } = mountWith(DisplayTray, { paneId: "p1", buttons: buttons({ id: "a" }, { id: "b", kind: "band" }, { id: "c", disabled: true }) });
    const btns = w.findAll("[data-display-tray-button]");
    expect(btns.map((b) => b.attributes("data-display-id"))).toEqual(["a", "b", "c"]);
    expect(btns[0]!.attributes("data-display-name")).toBe("a");
    expect(btns[0]!.attributes("aria-label")).toBe("表示を開く（a）");
    expect(btns[0]!.attributes("data-display-keepfocus")).toBeDefined();
    expect(btns[0]!.text()).toContain("▣");
    expect(btns[1]!.text()).toContain("▭");
    expect(btns[2]!.attributes("disabled")).toBeDefined();
    expect(btns[2]!.attributes("title")).toBe("pane が狭いので、この表示を出せません");
    expect(btns[2]!.text()).toContain("a-very-long-…");
    expect(btns[0]!.attributes("aria-pressed")).toBeUndefined();
  });
  it("浮いた窓のボタンは aria-pressed（開いていれば真）で、ラベルは『閉じる』", () => {
    const store = useDisplayStore();
    store.upsert(info("w"));
    const { w } = mountWith(DisplayTray, { paneId: "p1", buttons: buttons({ id: "w", kind: "float", open: true }) });
    const b = w.get("[data-display-tray-button]");
    expect(b.attributes("aria-pressed")).toBe("true");
    expect(b.attributes("aria-label")).toBe("表示を閉じる（w）");
  });
  it("スクリプトが動く面のボタンには印「スクリプト」が付く", () => {
    useSettingsStore().displayScriptEnabled = true;
    const store = useDisplayStore();
    store.upsert(info("s", { format: "script-html" }));
    store.upsert(info("t"));
    const { w } = mountWith(DisplayTray, { paneId: "p1", buttons: buttons({ id: "s" }, { id: "t" }) });
    const [s, t] = w.findAll("[data-display-tray-button]");
    expect(s!.find("[data-display-script-mark]").exists()).toBe(true);
    expect(t!.find("[data-display-script-mark]").exists()).toBe(false);
  });
  it("押すとその面を開く（記憶に書く）。押せないボタンは何もしない。mousedown は preventDefault", async () => {
    const store = useDisplayStore();
    const a = info("a");
    store.upsert(a);
    store.upsert(info("z"));
    store.setFaceCollapsed(a, true);
    const { w } = mountWith(DisplayTray, { paneId: "p1", buttons: buttons({ id: "a" }, { id: "z", disabled: true }) });
    const [ba, bz] = w.findAll("[data-display-tray-button]");
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    ba!.element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await ba!.trigger("click");
    expect(store.effectiveOf(a).collapsed).toBe(false);
    await bz!.trigger("click");
    expect(store.layoutPrefs.faces["p1|panel|z"]).toBeUndefined();
  });
  it("繰り返しの Enter は無視する。面が消えたボタンは描かない（測る前は全部描く）", async () => {
    const store = useDisplayStore();
    store.upsert(info("a"));
    const { w } = mountWith(DisplayTray, { paneId: "p1", buttons: buttons({ id: "a" }, { id: "gone" }) });
    expect(w.findAll("[data-display-tray-button]")).toHaveLength(1);
    const ev = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true });
    w.get("[data-display-tray-button]").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("PaneBands（edge あり）", () => {
  const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({ paneW: 1000, paneH: 600, cellW: 9, cellH: 18, bands: [], panels: [], active: {}, sideSizes: {}, floatRects: {}, trayEdgeDefault: "top", ...over });
  it("その側の帯だけ・帯の行にトレイ・行ごとの［⋮］［×］は keepfocus・アプリの部分は data-display-chrome", () => {
    const store = useDisplayStore();
    store.upsert(info("t", { kind: "band", size: 32 }));
    store.upsert(info("u", { kind: "band", size: 32 }));
    store.upsert(info("p"));
    store.setFaceEdge(info("u", { kind: "band" }), "bottom");
    store.setFaceCollapsed(info("p"), true);
    const bands = [info("t", { kind: "band" }), info("u", { kind: "band" })].map((b, seq) => ({ id: b.id, seq, size: 32, edge: store.effectiveOf(b).edge!, collapsed: store.effectiveOf(b).collapsed }));
    const layout = resolvePaneDisplays(input({ bands, panels: [{ id: "p", seq: 2, size: 320, dock: "right", collapsed: true }] }));
    const top = mountWith(PaneBands, { paneId: "p1", edge: "top", layout }).w;
    expect(top.attributes("data-pane-bands-edge")).toBe("top");
    expect(top.findAll("[data-pane-band]").map((b) => b.attributes("data-display-name"))).toEqual(["t"]);
    expect(top.find("[data-display-tray]").exists()).toBe(true); // トレイは最初の帯（t）の行
    expect(top.find("[data-pane-band] [data-display-tray]").exists()).toBe(true);
    for (const sel of ["[data-display-menu-button]", "[data-pane-band-close]"]) expect(top.get(sel).attributes("data-display-keepfocus"), sel).toBeDefined();
    expect(top.get("[data-pane-band-mark]").attributes("data-display-chrome")).toBeDefined();
    expect(top.get("[data-pane-band]").attributes("data-display-root")).toBe("t");
    const bottom = mountWith(PaneBands, { paneId: "p1", edge: "bottom", layout }).w;
    expect(bottom.findAll("[data-pane-band]").map((b) => b.attributes("data-display-name"))).toEqual(["u"]);
    expect(bottom.find("[data-display-tray]").exists()).toBe(false); // トレイは top 側だけ
  });
  it("帯が無い側のトレイの行（own）は 24px。トレイの側に出ない側は何も描かない", () => {
    const store = useDisplayStore();
    store.upsert(info("p"));
    store.setFaceCollapsed(info("p"), true);
    const layout = resolvePaneDisplays(input({ panels: [{ id: "p", seq: 0, size: 320, dock: "right", collapsed: true }], trayEdgeDefault: "bottom" }));
    const bottom = mountWith(PaneBands, { paneId: "p1", edge: "bottom", layout }).w;
    expect((bottom.get("[data-display-tray-row]").element as HTMLElement).style.height).toBe("24px");
    expect(bottom.find("[data-display-tray-button]").exists()).toBe(true);
    const top = mountWith(PaneBands, { paneId: "p1", edge: "top", layout }).w;
    expect(top.find("[data-pane-bands]").exists()).toBe(false);
  });
  it("edge なし（モバイル）は今の動き: 全部の帯・トレイなし・メニューなし・keepfocus なし・「ほか N 件」は知らせ", async () => {
    const store = useDisplayStore();
    store.upsert(info("x", { kind: "band", size: 32 }));
    store.upsert(info("y", { kind: "band", size: 32 }));
    const { w, ctl } = mountWith(PaneBands, { paneId: "p1", paneHeightPx: 180 });
    expect(w.attributes("data-pane-bands-edge")).toBeUndefined();
    expect(w.findAll("[data-pane-band]")).toHaveLength(1);
    expect(w.find("[data-display-tray]").exists()).toBe(false);
    expect(w.find("[data-display-menu-button]").exists()).toBe(false);
    expect(w.find("[data-display-keepfocus]").exists()).toBe(false);
    const view = useViewStore();
    const toast = vi.spyOn(view, "toast");
    await w.get("[data-pane-bands-more]").trigger("click");
    expect(toast).toHaveBeenCalled();
    await w.get("[data-pane-band-close]").trigger("click");
    expect(ctl.dismiss).toHaveBeenCalledWith({ id: "x" });
  });
});
