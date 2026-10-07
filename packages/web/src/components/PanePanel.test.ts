import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import PaneBands from "./PaneBands.vue";
import PanePanel from "./PanePanel.vue";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id, paneId: "p1", name: id, kind: "panel", format: "text", title: `title-${id}`, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over,
});

function mountPanel(infos: DisplayInfo[], paneWidthPx = 1000) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  infos.forEach((i) => store.upsert(i));
  const controller = { dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined) };
  const w = mount(PanePanel, {
    props: { paneId: "p1", paneWidthPx, cellWidthPx: 9 },
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller }, stubs: { DisplayFrame: true } },
  });
  return { w, store, controller };
}

describe("PanePanel", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("固定のラベルは面の名前で決まり、題（HTML や似た文言）では変わらない。題は文字として出る", () => {
    const s = mountPanel([info("main", { title: "<b>pane のプログラムの表示（隔離）· evil</b>" })]);
    expect(s.w.find("[data-pane-panel-label]").text()).toBe("pane のプログラムの表示（隔離）· main");
    expect(s.w.find("[data-pane-panel-title]").text()).toBe("<b>pane のプログラムの表示（隔離）· evil</b>");
    expect(s.w.find("[data-pane-panel-title] b").exists()).toBe(false);
    expect(s.w.attributes("role")).toBe("complementary");
  });

  it("［×］とたたむは button。［×］は dismiss {id}、たたむと幅 24px の見出しだけになる", async () => {
    const s = mountPanel([info("a")]);
    const close = s.w.find("[data-pane-panel-close]");
    expect(close.element.tagName).toBe("BUTTON");
    await close.trigger("click");
    expect(s.controller.dismiss).toHaveBeenCalledWith({ id: "a" });
    const fold = s.w.find("[data-pane-panel-fold]");
    expect(fold.element.tagName).toBe("BUTTON");
    await fold.trigger("click");
    expect((s.w.element as HTMLElement).style.width).toBe("24px");
    expect(s.w.find("[data-pane-panel-label]").exists()).toBe(false);
    await s.w.find("[data-pane-panel-unfold]").trigger("click");
    expect((s.w.element as HTMLElement).style.width).toBe("320px");
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
    expect(s.w.attributes("data-display-engaged")).toBe("1");
    s.store.setFocused(null);
    await s.w.vm.$nextTick();
    expect(s.w.find("[data-pane-panel-engaged-note]").exists()).toBe(false);
  });

  it("pane が狭ければ自動でたたむ（広げるボタンは無効）", () => {
    const s = mountPanel([info("a")], 400);
    expect(s.w.find("[data-pane-panel-unfold]").attributes("disabled")).toBeDefined();
    expect((s.w.element as HTMLElement).style.width).toBe("24px");
  });

  it("面が無ければ何も描かない", () => {
    const s = mountPanel([]);
    expect(s.w.find("aside").exists()).toBe(false);
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
