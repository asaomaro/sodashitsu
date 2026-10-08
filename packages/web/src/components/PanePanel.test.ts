import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, defineComponent, h } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { resolvePaneDisplays } from "../display/paneDisplayLayout.js";
import PaneBands from "./PaneBands.vue";
import PanePanel from "./PanePanel.vue";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id, paneId: "p1", name: id, kind: "panel", format: "text", title: `title-${id}`, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over,
});

/**
 * 割り付け（`resolvePaneDisplays`）の結果を `PanePanel` に渡す、`PaneFrame` の代わりの入れ物。ストアを読む computed なので、たたむ・幅を変える操作が描画に返る。
 * 右のパネルが出なければ（たたんだ・pane が狭い）何も描かない。
 */
function mountPanel(infos: DisplayInfo[], paneWidthPx = 1000, side: "right" | "left" | "top" | "bottom" = "right") {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  infos.forEach((i) => store.upsert(i));
  const guides: ({ side: string; px: number } | null)[] = [];
  const Host = defineComponent({
    setup() {
      const layout = computed(() => {
        const mine = store.panelsOf("p1");
        const sized = store.sideSizeOf("p1", side);
        const act = store.activeBySide.get(`p1|${side}`);
        return resolvePaneDisplays({
          paneW: paneWidthPx,
          paneH: 600,
          cellW: 9,
          cellH: 18,
          bands: [],
          panels: mine.map((d, seq) => ({ id: d.id, seq, size: d.size, dock: side, collapsed: store.effectiveOf(d).collapsed })),
          active: act ? { [side]: act } : {},
          sideSizes: sized !== undefined ? { [side]: sized } : {},
          floatRects: {},
          trayEdgeDefault: "top",
        });
      });
      return () => (layout.value.docks[side] ? h(PanePanel, { paneId: "p1", side, dock: layout.value.docks[side]!, onGuide: (g: { side: string; px: number } | null) => guides.push(g) }) : null);
    },
  });
  const controller = { dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined) };
  const w = mount(Host, {
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller }, stubs: { DisplayFrame: true } },
  });
  return { w, store, controller, guides };
}

describe("PanePanel", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("固定のラベルは面の名前で決まり、題（HTML や似た文言）では変わらない。題は文字として出る", () => {
    const s = mountPanel([info("main", { title: "<b>pane のプログラムの表示（隔離）· evil</b>" })]);
    expect(s.w.find("[data-pane-panel-label]").text()).toBe("pane のプログラムの表示（隔離）· main");
    expect(s.w.find("[data-pane-panel-title]").text()).toBe("<b>pane のプログラムの表示（隔離）· evil</b>");
    expect(s.w.find("[data-pane-panel-title] b").exists()).toBe(false);
    expect(s.w.find("[data-pane-panel]").attributes("role")).toBe("complementary");
  });

  it("今の印と新しい印が根にある: data-pane-panel・data-display-dock・data-display-root・data-display-engaged。見出しは data-display-chrome・data-display-head・.pane-panel-head", () => {
    const s = mountPanel([info("a")]);
    const root = s.w.find("[data-pane-panel]");
    expect(root.attributes("data-display-dock")).toBe("right");
    expect(root.attributes("data-display-root")).toBe("a");
    expect(root.attributes("data-display-engaged")).toBe("0");
    const head = s.w.find(".pane-panel-head");
    expect(head.attributes("data-display-chrome")).toBeDefined();
    expect(head.attributes("data-display-head")).toBeDefined();
    expect(root.element.contains(head.element)).toBe(true);
    // 押してもフォーカスを取らない部品には data-display-keepfocus（つかむ場所・［⋮］・［たたむ］・［×］・つまみ）
    for (const sel of ["[data-display-grip]", "[data-display-menu-button]", "[data-pane-panel-fold]", "[data-pane-panel-close]", "[data-pane-panel-resize]"]) {
      expect(s.w.find(sel).attributes("data-display-keepfocus"), sel).toBeDefined();
    }
  });

  it("［×］とたたむは button。［×］は dismiss {id}、たたむと群れから外れる（幅 24px の見出しは無い）。開くと元の幅で戻る", async () => {
    const s = mountPanel([info("a")]);
    const close = s.w.find("[data-pane-panel-close]");
    expect(close.element.tagName).toBe("BUTTON");
    await close.trigger("click");
    expect(s.controller.dismiss).toHaveBeenCalledWith({ id: "a" });
    const fold = s.w.find("[data-pane-panel-fold]");
    expect(fold.element.tagName).toBe("BUTTON");
    await fold.trigger("click");
    await s.w.vm.$nextTick();
    expect(s.w.find("[data-pane-panel]").exists()).toBe(false);
    expect(s.w.find("[data-pane-panel-unfold]").exists()).toBe(false);
    expect(s.store.effectiveOf(info("a")).collapsed).toBe(true);
    s.store.setFaceCollapsed(info("a"), false);
    await s.w.vm.$nextTick();
    expect((s.w.find("[data-pane-panel]").element as HTMLElement).style.width).toBe("320px");
  });

  it("複数ならタブ。矢印・Home・End で移って切り替える", async () => {
    const s = mountPanel([info("a"), info("b"), info("c")]);
    expect(s.w.find("[role=tablist]").exists()).toBe(true);
    const sel = (): string => s.w.find("[role=tab][aria-selected=true]").text();
    expect(sel()).toBe("title-a");
    await s.w.find("[role=tablist]").trigger("keydown", { key: "ArrowRight" });
    expect(sel()).toBe("title-b");
    await s.w.find("[role=tablist]").trigger("keydown", { key: "End" });
    expect(sel()).toBe("title-c");
    await s.w.find("[role=tablist]").trigger("keydown", { key: "ArrowRight" });
    expect(sel()).toBe("title-a");
    await s.w.find("[role=tablist]").trigger("keydown", { key: "Home" });
    expect(sel()).toBe("title-a");
  });

  it("操作中の表示: フォーカスがある面のときだけ文言が出て、戻すと消える", async () => {
    const s = mountPanel([info("a")]);
    expect(s.w.find("[data-pane-panel-engaged-note]").exists()).toBe(false);
    s.store.setFocused("a");
    await s.w.vm.$nextTick();
    expect(s.w.find("[data-pane-panel-engaged-note]").text()).toBe("入力はこの表示に届きます（Esc で端末へ）");
    expect(s.w.find("[data-pane-panel]").attributes("data-display-engaged")).toBe("1");
    s.store.setFocused(null);
    await s.w.vm.$nextTick();
    expect(s.w.find("[data-pane-panel-engaged-note]").exists()).toBe(false);
  });

  it("pane が狭ければ自動でたたむ（割り付けが群れに入れない。広げるボタンは無い）", () => {
    const s = mountPanel([info("a")], 400);
    expect(s.w.find("[data-pane-panel]").exists()).toBe(false);
    expect(s.w.find("[data-pane-panel-unfold]").exists()).toBe(false);
  });

  it("面が無ければ何も描かない", () => {
    const s = mountPanel([]);
    expect(s.w.find("aside").exists()).toBe(false);
  });
});

describe("PanePanel — 幅のつまみ", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  const widthOf = (w: ReturnType<typeof mountPanel>["w"]): string => (w.find("[data-pane-panel]").element as HTMLElement).style.width;

  it("separator の aria（valuenow・min・max）が出る。たたんでいる間は出ない", async () => {
    const s = mountPanel([info("a")]);
    const h = s.w.find("[data-pane-panel-resize]");
    expect(h.attributes("role")).toBe("separator");
    expect(h.attributes("aria-orientation")).toBe("vertical");
    expect(h.attributes("aria-label")).toBe("パネルの幅");
    expect(h.attributes("tabindex")).toBe("0");
    expect(h.attributes("aria-valuenow")).toBe("320");
    expect(h.attributes("aria-valuemin")).toBe("160");
    expect(h.attributes("aria-valuemax")).toBe("500");
    await s.w.find("[data-pane-panel-fold]").trigger("click");
    await s.w.vm.$nextTick();
    expect(s.w.find("[data-pane-panel-resize]").exists()).toBe(false);
  });

  it("キー: ← で 16 広く・→ で 16 狭く・Shift で 64・Home＝最小・End＝最大・Enter＝指定の幅。1 回ごとに確定して保存する", async () => {
    const s = mountPanel([info("a")]);
    const h = () => s.w.find("[data-pane-panel-resize]");
    await h().trigger("keydown", { key: "ArrowLeft" });
    expect(widthOf(s.w)).toBe("336px");
    await h().trigger("keydown", { key: "ArrowRight", shiftKey: true });
    expect(widthOf(s.w)).toBe("272px");
    await h().trigger("keydown", { key: "Home" });
    expect(widthOf(s.w)).toBe("160px");
    await h().trigger("keydown", { key: "ArrowRight" });
    expect(widthOf(s.w)).toBe("160px"); // 最小で止まる
    await h().trigger("keydown", { key: "End" });
    expect(widthOf(s.w)).toBe("500px");
    expect(s.store.sideSizeOf("p1", "right")).toBe(500);
    await h().trigger("keydown", { key: "Enter" });
    expect(widthOf(s.w)).toBe("320px");
    expect(s.store.sideSizeOf("p1", "right")).toBeUndefined();
  });

  it("利用者の幅は --size の更新でも変わらない", async () => {
    const s = mountPanel([info("a")]);
    s.store.setSideSize("p1", "right", 400);
    s.store.upsert(info("a", { size: 700, rev: 2 }));
    await s.w.vm.$nextTick();
    expect(widthOf(s.w)).toBe("400px");
  });

  it("ドラッグ中は幅を変えず案内の線だけを動かし、離したときに 1 回確定する。Esc で元のまま", async () => {
    const s = mountPanel([info("a")]);
    const h = s.w.find("[data-pane-panel-resize]");
    const ev = (type: string, x: number) => new PointerEvent(type, { clientX: x, clientY: 0, button: 0, pointerId: 1, bubbles: true });
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    h.element.dispatchEvent(ev("pointerdown", 600));
    h.element.dispatchEvent(ev("pointermove", 500)); // 左へ 100 → 広がる
    await s.w.vm.$nextTick();
    expect(widthOf(s.w)).toBe("320px"); // 幅はそのまま
    expect(s.guides.at(-1)).toEqual({ side: "right", px: 420 });
    expect(h.attributes("aria-valuenow")).toBe("420");
    h.element.dispatchEvent(ev("pointerup", 500));
    await s.w.vm.$nextTick();
    expect(widthOf(s.w)).toBe("420px");
    expect(s.guides.at(-1)).toBeNull();
    expect(s.store.sideSizeOf("p1", "right")).toBe(420);
    // Esc で取り消し
    h.element.dispatchEvent(ev("pointerdown", 600));
    h.element.dispatchEvent(ev("pointermove", 400));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await s.w.vm.$nextTick();
    expect(widthOf(s.w)).toBe("420px");
    expect(s.guides.at(-1)).toBeNull();
    raf.mockRestore();
  });
});

describe("PaneBands", () => {
  it("固定の印・［×］・あふれは「ほか N 件」", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useDisplayStore();
    store.upsert(info("x", { kind: "band", size: 32 }));
    store.upsert(info("y", { kind: "band", size: 32 }));
    const controller = { dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined) };
    const mk = (h: number) =>
      mount(PaneBands, { props: { paneId: "p1", paneHeightPx: h }, global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller }, stubs: { DisplayFrame: true } } });
    const full = mk(300);
    expect(full.findAll("[data-pane-band]")).toHaveLength(2);
    expect(full.find("[data-pane-band-mark]").text()).toBe("▍表示");
    expect(full.find("[data-pane-band-mark]").attributes("aria-label")).toBe("pane のプログラムの表示（隔離）· x: title-x");
    expect(full.find("[data-pane-bands-more]").exists()).toBe(false);
    await full.find("[data-pane-band-close]").trigger("click");
    expect(controller.dismiss).toHaveBeenCalledWith({ id: "x" });
    const small = mk(180);
    expect(small.findAll("[data-pane-band]")).toHaveLength(1);
    expect(small.find("[data-pane-bands-more]").text()).toBe("ほか 1 件");
  });
});

describe("PanePanel — 4 つの側", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  const style = (w: ReturnType<typeof mountPanel>["w"]): CSSStyleDeclaration => (w.find("[data-pane-panel]").element as HTMLElement).style;
  const ev = (type: string, x: number, y: number) => new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true });

  it("側の属性・クラス・大きさの向き（左右は幅・上下は高さ）・つまみの向きと名前", () => {
    for (const [side, horizontal] of [["right", true], ["left", true], ["top", false], ["bottom", false]] as const) {
      const s = mountPanel([info("a", { size: 200 })], 1000, side);
      const root = s.w.find("[data-pane-panel]");
      expect(root.attributes("data-display-dock")).toBe(side);
      expect(root.classes()).toContain(`pane-panel-${side}`);
      expect(horizontal ? style(s.w).width : style(s.w).height).toBe("200px");
      const h = s.w.find("[data-pane-panel-resize]");
      expect(h.attributes("aria-orientation")).toBe(horizontal ? "vertical" : "horizontal");
      expect(h.attributes("aria-label")).toBe(horizontal ? "パネルの幅" : "パネルの高さ");
      expect(h.classes()).toContain(horizontal ? "resize-handle-x" : "resize-handle-y");
      expect(h.attributes("data-display-keepfocus")).toBeDefined();
      s.w.unmount();
    }
  });

  it("つまみのキーは、端末の側へ向く矢印で広く・逆で狭く（右 ←・左 →・上 ↓・下 ↑）。Home・End・Enter", async () => {
    const keys = { right: ["ArrowLeft", "ArrowRight"], left: ["ArrowRight", "ArrowLeft"], top: ["ArrowDown", "ArrowUp"], bottom: ["ArrowUp", "ArrowDown"] } as const;
    for (const side of ["right", "left", "top", "bottom"] as const) {
      const s = mountPanel([info("a", { size: 250 })], 1000, side);
      const h = () => s.w.find("[data-pane-panel-resize]");
      await h().trigger("keydown", { key: keys[side][0] });
      expect(s.store.sideSizeOf("p1", side), side).toBe(266);
      await h().trigger("keydown", { key: keys[side][1], shiftKey: true });
      expect(s.store.sideSizeOf("p1", side), side).toBe(202);
      await h().trigger("keydown", { key: "Home" });
      expect(s.store.sideSizeOf("p1", side), side).toBe(side === "left" || side === "right" ? 160 : 96);
      await h().trigger("keydown", { key: "Enter" });
      expect(s.store.sideSizeOf("p1", side), side).toBeUndefined();
      s.w.unmount();
    }
  });

  it("ドラッグ: 端末の側へ向けて動かすと広がる（右は左へ・左は右へ・上は下へ・下は上へ）。ドラッグの間は大きさを変えず、離して 1 回", async () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const move: Record<string, [number, number]> = { right: [-100, 0], left: [100, 0], top: [0, 50], bottom: [0, -50] };
    for (const side of ["right", "left", "top", "bottom"] as const) {
      const s = mountPanel([info("a", { size: 200 })], 1000, side);
      const h = s.w.find("[data-pane-panel-resize]");
      const [dx, dy] = move[side]!;
      h.element.dispatchEvent(ev("pointerdown", 500, 300));
      h.element.dispatchEvent(ev("pointermove", 500 + dx, 300 + dy));
      await s.w.vm.$nextTick();
      const grown = 200 + Math.abs(dx || dy);
      expect(s.guides.at(-1), side).toEqual({ side, px: grown });
      expect(s.store.sideSizeOf("p1", side), side).toBeUndefined(); // まだ記憶に書かない
      h.element.dispatchEvent(ev("pointerup", 500 + dx, 300 + dy));
      await s.w.vm.$nextTick();
      expect(s.store.sideSizeOf("p1", side), side).toBe(grown);
      expect(s.guides.at(-1)).toBeNull();
      s.w.unmount();
    }
    raf.mockRestore();
  });

  it("ダイアログ（modal）が開いたら、ドラッグを確定して終える", async () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const s = mountPanel([info("a", { size: 200 })], 1000, "top");
    const { useViewStore } = await import("../store/view.js");
    const h = s.w.find("[data-pane-panel-resize]");
    h.element.dispatchEvent(ev("pointerdown", 500, 300));
    h.element.dispatchEvent(ev("pointermove", 500, 350));
    useViewStore().openDialogWithContext({ kind: "settings" });
    await s.w.vm.$nextTick();
    await s.w.vm.$nextTick();
    expect(s.store.sideSizeOf("p1", "top")).toBe(250);
    expect(s.guides.at(-1)).toBeNull();
    raf.mockRestore();
  });

  it("枠の鍵は側を含む（置き場所を変えると、前の側の枠とは別の鍵）", async () => {
    const { placedFrameKey } = await import("../display/framePage.js");
    const a = info("a");
    expect(placedFrameKey(a, "dock:left")).not.toBe(placedFrameKey(a, "dock:right"));
    expect(placedFrameKey(a, "dock:top")).not.toBe(placedFrameKey(a, "dock:bottom"));
  });

  it("見出しのつかむ場所をつかんで別の側へ落とすと、その側へ移る（開いて出る）。同じ側・外・6px 未満は何も変えない。view.paneDrag は立たない", async () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const host = document.createElement("div");
    host.setAttribute("data-pane-id", "p1");
    const body = document.createElement("div");
    body.className = "pane-frame-body-displays";
    body.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    host.append(body);
    document.body.append(host);
    const { useViewStore } = await import("../store/view.js");
    const s = mountPanel([info("a", { size: 200 })], 1000, "right");
    const grip = s.w.find("[data-display-grip]").element;
    const e = (type: string, x: number, y: number) => {
      const p = new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true, cancelable: true });
      return p;
    };
    const dockOf = () => s.store.effectiveOf(s.store.infos.get("a")!).dock;
    // 6px 未満・外・今と同じ右 → 変わらない
    grip.dispatchEvent(e("pointerdown", 900, 300));
    grip.dispatchEvent(e("pointermove", 903, 300));
    grip.dispatchEvent(e("pointerup", 903, 300));
    expect(dockOf()).toBe("right");
    grip.dispatchEvent(e("pointerdown", 900, 300));
    grip.dispatchEvent(e("pointermove", 1500, 300));
    grip.dispatchEvent(e("pointerup", 1500, 300));
    expect(dockOf()).toBe("right");
    grip.dispatchEvent(e("pointerdown", 900, 300));
    grip.dispatchEvent(e("pointermove", 980, 300));
    expect(s.store.dockDrag).toMatchObject({ id: "a", paneId: "p1", zone: "right" });
    expect(useViewStore().paneDrag).toBeNull();
    grip.dispatchEvent(e("pointerup", 980, 300));
    expect(dockOf()).toBe("right");
    // 左へ
    grip.dispatchEvent(e("pointerdown", 900, 300));
    grip.dispatchEvent(e("pointermove", 20, 300));
    grip.dispatchEvent(e("pointerup", 20, 300));
    expect(dockOf()).toBe("left");
    expect(s.store.effectiveOf(s.store.infos.get("a")!).collapsed).toBe(false);
    expect(s.store.dockDrag).toBeNull();
    host.remove();
    raf.mockRestore();
  });
});
