import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayControllerKey, DisplayHostKey, type DisplayHost } from "../injection.js";
import { floatZ } from "../display/floatGeometry.js";
import { useDisplayStore } from "../store/display.js";
import DisplayFloat from "./DisplayFloat.vue";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id, paneId: "p1", name: id, kind: "panel", format: "text", title: `title-${id}`, size: 320, rev: 1, bytes: 1, updatedAt: "x", dock: "float", ...over,
});
const AREA = { w: 800, h: 500 };
const RECT = { x: 100, y: 80, w: 300, h: 200 };

const mounted: VueWrapper[] = [];
function setup(over: { info?: DisplayInfo; z?: number } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  const i = over.info ?? info("a");
  store.upsert(i);
  store.setLayoutSnapshot("p1", { auto: [], floatArea: AREA });
  store.setFaceDock(i, "float", RECT); // 窓は開いている（置き場所 float・collapsed: false・記憶に矩形あり）
  const host: DisplayHost = { focusTerminal: vi.fn(), injectPrefix: vi.fn(), focusSelectedTerminal: vi.fn(), prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }) };
  const controller = { dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined) };
  const w = mount(DisplayFloat, {
    props: { info: i, rect: RECT, area: AREA, z: over.z ?? 20 },
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller, [DisplayHostKey as symbol]: host }, stubs: { DisplayFrame: true } },
  });
  mounted.push(w);
  return { w, store, host, controller, info: i };
}
const ptr = (_type: string, init: { x?: number; y?: number } = {}) => ({ button: 0, pointerId: 1, clientX: init.x ?? 0, clientY: init.y ?? 0 });

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
});

describe("DisplayFloat — 層の属性・位置", () => {
  it("根: role=dialog（モーダルでない）・aria-label・data-display-float/root/engaged。tabindex は付けない", () => {
    const { w } = setup();
    const root = w.get("[data-display-float]");
    expect(root.attributes("role")).toBe("dialog");
    expect(root.attributes("aria-modal")).toBeUndefined();
    expect(root.attributes("aria-label")).toBe("pane のプログラムの表示（隔離）· a");
    expect(root.attributes("data-display-root")).toBe("a");
    expect(root.attributes("data-display-engaged")).toBe("0");
    expect(root.attributes("tabindex")).toBeUndefined();
  });
  it("位置は領域の左上から 4px 内側。大きさと z-index は props のまま", () => {
    const { w } = setup({ z: 22 });
    const el = w.get("[data-display-float]").element as HTMLElement;
    expect(el.style.left).toBe("104px");
    expect(el.style.top).toBe("84px");
    expect(el.style.width).toBe("300px");
    expect(el.style.height).toBe("200px");
    expect(el.style.zIndex).toBe("22");
  });
  it("見出しは DisplayPanelHead（data-display-head・固定のラベル・印の入れ物 data-display-grip）。題は文字として出る", () => {
    const { w } = setup({ info: info("a", { title: "<b>evil</b>" }) });
    expect(w.find("[data-display-head]").exists()).toBe(true);
    expect(w.get("[data-display-grip]").attributes("data-display-keepfocus")).toBeDefined();
    expect(w.get("[data-display-float-title]").text()).toBe("<b>evil</b>");
    expect(w.find("[data-display-float-title] b").exists()).toBe(false);
  });
  it("枠以外の部分（題・縁と角の 8 つ）は、押してもフォーカスを取らない（data-display-keepfocus）", () => {
    const { w } = setup();
    expect(w.get("[data-display-float-title]").attributes("data-display-keepfocus")).toBeDefined();
    const handles = w.findAll("[data-display-float-handle]");
    expect(handles.map((h) => h.attributes("data-display-float-handle")).sort()).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
    for (const hdl of handles) expect(hdl.attributes("data-display-keepfocus")).toBeDefined();
  });
  it("操作中の文言の行に data-display-chrome（知らせが避ける）。操作中でなければ出ない", async () => {
    const { w, store } = setup({ info: info("a", { format: "script-html" }) });
    expect(w.find("[data-display-float-note]").exists()).toBe(false);
    store.setFocused("a");
    await nextTick();
    expect(w.get("[data-display-float-note]").attributes("data-display-chrome")).toBeDefined();
    expect(w.get("[data-display-root]").attributes("data-display-engaged")).toBe("1");
  });
  it("［たたむ］で閉じる（記憶に collapsed: true・矩形は残す）", async () => {
    const { w, store, info: i } = setup();
    await w.get("[data-pane-panel-fold]").trigger("click");
    await nextTick();
    expect(store.effectiveOf(i).collapsed).toBe(true);
    expect(store.faceRectOf(i)).toEqual(RECT);
  });
});

describe("DisplayFloat — 重なり（z-index だけが変わり、DOM の順は変わらない）", () => {
  it("2 つの窓の DOM の順は出た順のまま、押した窓の z-index が上になる", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useDisplayStore();
    const a = info("a");
    const b = info("b");
    store.upsert(a);
    store.upsert(b);
    store.setLayoutSnapshot("p1", { auto: [], floatArea: AREA });
    store.setFaceDock(a, "float", RECT);
    store.setFaceDock(b, "float", RECT);
    store.syncFloatOrder("p1", ["a", "b"]);
    const Host = defineComponent({
      setup: () => () => h("div", [a, b].map((i) => h(DisplayFloat, { key: i.id, info: i, rect: RECT, area: AREA, z: floatZ(store.floatOrder.get("p1") ?? [], i.id) }))),
    });
    const w = mount(Host, { attachTo: document.body, global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: { dismiss: vi.fn() } }, stubs: { DisplayFrame: true } } });
    mounted.push(w as unknown as VueWrapper);
    const order = () => w.findAll("[data-display-float]").map((e) => e.attributes("data-display-root"));
    const z = (id: string) => Number((w.get(`[data-display-root="${id}"]`).element as HTMLElement).style.zIndex);
    expect(order()).toEqual(["a", "b"]);
    expect(z("b")).toBeGreaterThan(z("a"));
    const aEl = w.get('[data-display-root="a"]').element;
    await w.get('[data-display-root="a"] [data-display-float-title]').trigger("pointerdown");
    await nextTick();
    expect(order()).toEqual(["a", "b"]); // 並べ替えない
    expect(w.get('[data-display-root="a"]').element).toBe(aEl); // 同じ要素のまま
    expect(z("a")).toBeGreaterThan(z("b"));
  });
});

describe("DisplayFloat — 移動・大きさ", () => {
  it("見出しのつかむ場所をドラッグすると、その場で動き、離したとき記憶に 1 回書く（動かす間は書かない）", async () => {
    const { w, store, info: i } = setup();
    const grip = w.get("[data-display-grip]");
    await grip.trigger("pointerdown", ptr("pointerdown", { x: 200, y: 100 }));
    await grip.trigger("pointermove", ptr("pointermove", { x: 260, y: 130 }));
    const writes = vi.spyOn(store, "setFaceRect");
    await grip.trigger("pointerup", ptr("pointerup", { x: 260, y: 130 }));
    await nextTick();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(store.faceRectOf(i)).toEqual({ ...RECT, x: 160, y: 110 });
    expect(document.documentElement.classList.contains("soda-resizing")).toBe(false);
  });
  it("領域の外へ動かしても、領域の中に収まる", async () => {
    const { w, store, info: i } = setup();
    const grip = w.get("[data-display-grip]");
    await grip.trigger("pointerdown", ptr("pointerdown", { x: 0, y: 0 }));
    await grip.trigger("pointermove", ptr("pointermove", { x: 9000, y: 9000 }));
    await grip.trigger("pointerup", ptr("pointerup", { x: 9000, y: 9000 }));
    expect(store.faceRectOf(i)).toEqual({ x: 500, y: 300, w: 300, h: 200 });
  });
  it("縁の右下の角で大きさを変える。左上の縁は動かない・最小より小さくならない", async () => {
    const { w, store, info: i } = setup();
    const se = w.get('[data-display-float-handle="se"]');
    await se.trigger("pointerdown", ptr("pointerdown", { x: 400, y: 280 }));
    await se.trigger("pointermove", ptr("pointermove", { x: 450, y: 330 }));
    await se.trigger("pointerup", ptr("pointerup", { x: 450, y: 330 }));
    expect(store.faceRectOf(i)).toEqual({ x: 100, y: 80, w: 350, h: 250 });
    await w.setProps({ rect: store.faceRectOf(i)! }); // 割り付けが記憶の矩形を返す
    const nw = w.get('[data-display-float-handle="nw"]');
    await nw.trigger("pointerdown", ptr("pointerdown", { x: 0, y: 0 }));
    await nw.trigger("pointermove", ptr("pointermove", { x: 9999, y: 9999 }));
    await nw.trigger("pointerup", ptr("pointerup", { x: 9999, y: 9999 }));
    const r = store.faceRectOf(i)!;
    expect([r.x + r.w, r.y + r.h]).toEqual([450, 330]); // 右下の縁は動かない
    expect([r.w, r.h]).toEqual([240, 120]);
  });
  it("縁を寄せた位置で離すと、その側のドックへ置く（本体の箱の縁から 16px 以内）", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { w, store, info: i } = setup();
    const body = document.createElement("div");
    body.className = "pane-frame-body-displays";
    body.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    body.appendChild(w.element);
    document.body.appendChild(body);
    const grip = w.get("[data-display-grip]");
    await grip.trigger("pointerdown", ptr("pointerdown", { x: 300, y: 300 }));
    await grip.trigger("pointermove", ptr("pointermove", { x: 990, y: 300 })); // 右の縁から 10px
    vi.advanceTimersToNextFrame();
    expect(store.dockDrag).toEqual({ id: "a", paneId: "p1", zone: "right", floatMove: true });
    await grip.trigger("pointerup", ptr("pointerup", { x: 990, y: 300 }));
    await nextTick();
    expect(store.effectiveOf(i).dock).toBe("right");
    expect(store.dockDrag).toBeNull();
    vi.useRealTimers();
  });
  it("縁から遠ければ側は強調されない（zone は null）", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { w, store } = setup();
    const body = document.createElement("div");
    body.className = "pane-frame-body-displays";
    body.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    body.appendChild(w.element);
    document.body.appendChild(body);
    const grip = w.get("[data-display-grip]");
    await grip.trigger("pointerdown", ptr("pointerdown", { x: 300, y: 300 }));
    await grip.trigger("pointermove", ptr("pointermove", { x: 400, y: 320 }));
    vi.advanceTimersToNextFrame();
    expect(store.dockDrag?.zone).toBeNull();
    await grip.trigger("pointerup", ptr("pointerup", { x: 400, y: 320 }));
    vi.useRealTimers();
  });
  it("ドラッグの途中で窓が消えても（面が閉じられた）、消えた面の記憶を書かない・ドラッグの状態を残さない", async () => {
    const { w, store, info: i } = setup();
    const grip = w.get("[data-display-grip]");
    await grip.trigger("pointerdown", ptr("pointerdown", { x: 200, y: 100 }));
    await grip.trigger("pointermove", ptr("pointermove", { x: 260, y: 130 }));
    store.remove("a");
    w.unmount();
    mounted.length = 0;
    expect(store.faceRectOf(i)).toEqual(RECT); // 動かした位置は書かれない
    expect(store.dockDrag).toBeNull();
    expect(document.documentElement.classList.contains("soda-resizing")).toBe(false);
  });
});

describe("DisplayFloat — キーで動かす・大きさを変える", () => {
  async function startKeys(mode: "move" | "resize") {
    const s = setup();
    const before = document.createElement("button"); // メニューを開く前のフォーカス（端末の代わり）
    document.body.appendChild(before);
    before.focus();
    s.store.startFloatKeys(s.info, mode);
    await nextTick();
    await nextTick();
    return { ...s, before };
  }
  it("始めると、根に tabindex=-1 が付いてフォーカスが移る。案内が aria-live で出る", async () => {
    const { w } = await startKeys("move");
    const root = w.get("[data-display-float]");
    expect(root.attributes("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(root.element);
    const note = w.get("[data-display-keymode-note]");
    expect(note.attributes("aria-live")).toBe("polite");
    expect(note.text()).toContain("矢印キーで動かします");
  });
  it("矢印で 16px・Shift で 64px 動き、Enter で確定（記憶に書く）。フォーカスは始める前の場所へ戻り、tabindex が外れる", async () => {
    const { w, store, info: i, before } = await startKeys("move");
    const root = w.get("[data-display-float]");
    await root.trigger("keydown", { key: "ArrowRight" });
    await root.trigger("keydown", { key: "ArrowDown", shiftKey: true });
    expect(store.faceRectOf(i)).toEqual(RECT); // 確定するまで書かない
    expect((root.element as HTMLElement).style.left).toBe("120px"); // 100 + 16 + 4
    expect((root.element as HTMLElement).style.top).toBe("148px"); // 80 + 64 + 4
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    root.element.dispatchEvent(ev);
    await nextTick();
    expect(ev.defaultPrevented).toBe(true);
    expect(store.faceRectOf(i)).toEqual({ ...RECT, x: 116, y: 144 });
    expect(document.activeElement).toBe(before);
    expect(root.attributes("tabindex")).toBeUndefined();
    expect(store.floatKeyMode).toBeNull();
  });
  it("Esc で始める前に戻る（記憶は変わらない）。フォーカスは戻り先へ", async () => {
    const { w, store, info: i, before } = await startKeys("move");
    const root = w.get("[data-display-float]");
    await root.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
    await root.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(store.faceRectOf(i)).toEqual(RECT);
    expect((root.element as HTMLElement).style.left).toBe("104px");
    expect(document.activeElement).toBe(before);
    expect(store.floatKeyMode).toBeNull();
  });
  it("大きさを変えるモード: 矢印で右下の縁が動く", async () => {
    const { w, store, info: i } = await startKeys("resize");
    const root = w.get("[data-display-float]");
    expect(w.get("[data-display-keymode-note]").text()).toContain("大きさを変えます");
    await root.trigger("keydown", { key: "ArrowRight", shiftKey: true });
    await root.trigger("keydown", { key: "ArrowDown" });
    await root.trigger("keydown", { key: "Enter" });
    expect(store.faceRectOf(i)).toEqual({ ...RECT, w: 364, h: 216 });
  });
  it("キーは外（端末）へ流さない: 矢印以外のキーも止める（Tab は除く）", async () => {
    const { w } = await startKeys("move");
    const root = w.get("[data-display-float]");
    const ev = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    const outside = vi.fn();
    document.body.addEventListener("keydown", outside);
    root.element.dispatchEvent(ev);
    document.body.removeEventListener("keydown", outside);
    expect(ev.defaultPrevented).toBe(true);
    expect(outside).not.toHaveBeenCalled();
  });
  it("キーのモードの途中で窓が消えるとき、フォーカスが窓の根にあれば端末へ移す（body に落とさない）", async () => {
    const { w, host, store } = await startKeys("move");
    expect(document.activeElement).toBe(w.get("[data-display-float]").element);
    w.unmount();
    mounted.length = 0;
    expect(host.focusTerminal).toHaveBeenCalledWith("p1");
    expect(store.floatKeyMode).toBeNull();
  });
  it("フォーカスが窓の外へ出たら確定する（フォーカスは動かさない）", async () => {
    const { w, store, info: i, before } = await startKeys("move");
    const root = w.get("[data-display-float]");
    await root.trigger("keydown", { key: "ArrowRight" });
    before.focus();
    await root.trigger("focusout", { relatedTarget: before });
    await nextTick();
    await nextTick();
    expect(store.faceRectOf(i)).toEqual({ ...RECT, x: 116 });
    expect(document.activeElement).toBe(before);
  });
});
