import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { registerFrame, unregisterFrame } from "../display/frameRegistry.js";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSettingsStore } from "../store/settings.js";
import MobileDisplaySheet from "../mobile/MobileDisplaySheet.vue";
import PaneBands from "./PaneBands.vue";
import PanePanel from "./PanePanel.vue";

/** 固定の印「スクリプト」と［操作する］ボタン（枠の外。アプリが描く）。`info.format` から決まり、題・中身に依らない。 */
const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id, paneId: "p1", name: id, kind: "panel", format: "script-html", title: `title-${id}`, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over,
});
const controller = () => ({ dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined), onMessage: vi.fn(() => () => undefined) });

function mountWith(comp: unknown, props: Record<string, unknown>, infos: DisplayInfo[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  useSettingsStore().displayScriptEnabled = true;
  infos.forEach((i) => store.upsert(i));
  const w = mount(comp as never, {
    props: props as never,
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller() }, stubs: { DisplayFrame: true } },
  });
  return { w, store };
}

describe("固定の印「スクリプト」と［操作する］", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.restoreAllMocks());

  it("パネル: スクリプトの面には、ラベルの先頭に印と、見出しに［操作する］が出る。題に何を書いても消えない／偽の印は増えない", () => {
    const s = mountWith(PanePanel, { paneId: "p1", paneWidthPx: 1000, cellWidthPx: 9 }, [info("a", { title: "<b>スクリプト</b> 偽" })]);
    const label = s.w.find("[data-pane-panel-label]");
    expect(label.find("[data-display-script-mark]").text()).toBe("スクリプト");
    expect(label.find("[data-display-script-mark]").attributes("title")).toBe("この表示は、pane のプログラムのスクリプトを動かしています");
    expect(s.w.findAll("[data-display-script-mark]")).toHaveLength(1);
    expect(s.w.find("[data-display-engage]").text()).toBe("操作する");
    expect(s.w.find("[data-display-engage]").element.tagName).toBe("BUTTON");
  });

  it("静的な形式の面には、印も［操作する］も出ない", () => {
    for (const format of ["text", "markdown", "html"]) {
      const s = mountWith(PanePanel, { paneId: "p1", paneWidthPx: 1000, cellWidthPx: 9 }, [info("a", { format })]);
      expect(s.w.find("[data-display-script-mark]").exists()).toBe(false);
      expect(s.w.find("[data-display-engage]").exists()).toBe(false);
    }
  });

  it("操作中は［操作する］が消え、操作が終われば戻る。この画面がスクリプトを出せないときは、印もボタンも出さない", async () => {
    const s = mountWith(PanePanel, { paneId: "p1", paneWidthPx: 1000, cellWidthPx: 9 }, [info("a")]);
    expect(s.w.find("[data-display-engage]").exists()).toBe(true);
    s.store.setFocused("a");
    await nextTick();
    expect(s.w.find("[data-display-engage]").exists()).toBe(false);
    expect(s.w.find("[data-display-script-mark]").exists()).toBe(true); // 印は操作中も出ている
    s.store.setFocused(null);
    await nextTick();
    expect(s.w.find("[data-display-engage]").exists()).toBe(true);
    s.store.setScriptCapable(false);
    await nextTick();
    expect(s.w.find("[data-display-script-mark]").exists()).toBe(false);
    expect(s.w.find("[data-display-engage]").exists()).toBe(false);
  });

  it("［操作する］を押すと、その面の枠へ click が渡る（枠・覆いを押しても始まらない）。強調は 1 秒", async () => {
    const s = mountWith(PanePanel, { paneId: "p1", paneWidthPx: 1000, cellWidthPx: 9 }, [info("a")]);
    const engageFromButton = vi.fn();
    const handle = { focusInside: vi.fn(), engageFromButton };
    registerFrame("a", handle);
    await s.w.find("[data-display-engage]").trigger("click");
    expect(engageFromButton).toHaveBeenCalledTimes(1);
    expect(handle.focusInside).not.toHaveBeenCalled();
    unregisterFrame("a", handle);
    vi.useFakeTimers();
    s.store.nudgeEngage("a");
    await nextTick();
    expect(s.w.find("[data-display-engage]").classes()).toContain("display-engage-hint");
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(s.w.find("[data-display-engage]").classes()).not.toContain("display-engage-hint");
    vi.useRealTimers();
  });

  it("帯: 印の横に「スクリプト」と、［×］の左に［操作する］。静的な帯には出ない", () => {
    const s = mountWith(PaneBands, { paneId: "p1", paneHeightPx: 900 }, [info("b", { kind: "band", size: 32 }), info("c", { kind: "band", format: "html", size: 32 })]);
    const bands = s.w.findAll("[data-pane-band]");
    expect(bands).toHaveLength(2);
    expect(bands[0]!.find("[data-display-script-mark]").exists()).toBe(true);
    expect(bands[0]!.find("[data-display-engage]").exists()).toBe(true);
    const html = bands[0]!.html();
    expect(html.indexOf("data-display-engage")).toBeLessThan(html.indexOf("data-pane-band-close"));
    expect(bands[1]!.find("[data-display-script-mark]").exists()).toBe(false);
    expect(bands[1]!.find("[data-display-engage]").exists()).toBe(false);
  });

  it("モバイルの重ね表示: ラベルに印、見出しに［操作する］", () => {
    const s = mountWith(MobileDisplaySheet, { paneId: "p1" }, [info("a")]);
    expect(s.w.find("[data-mobile-display-label] [data-display-script-mark]").exists()).toBe(true);
    expect(s.w.find("[data-display-engage]").exists()).toBe(true);
  });
});
