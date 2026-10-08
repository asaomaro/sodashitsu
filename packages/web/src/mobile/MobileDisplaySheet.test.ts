import type { DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisplayControllerKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import MobileDisplaySheet from "./MobileDisplaySheet.vue";

const info = (id: string): DisplayInfo => ({ id, paneId: "p1", name: id, kind: "panel", format: "text", title: `t-${id}`, size: 320, rev: 1, bytes: 1, updatedAt: "x" });

function mountSheet(ids: string[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  ids.forEach((i) => store.upsert(info(i)));
  const controller = { dismiss: vi.fn(), report: vi.fn(), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined) };
  const w = mount(MobileDisplaySheet, {
    props: { paneId: "p1" },
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller }, stubs: { DisplayFrame: true } },
  });
  return { w, store, controller };
}

describe("MobileDisplaySheet", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("固定のラベルと、幅のつまみが無いこと", () => {
    const s = mountSheet(["a"]);
    expect(s.w.find("[data-mobile-display-label]").text()).toBe("pane のプログラムの表示（隔離）· a");
    expect(s.w.find("[data-pane-panel-resize]").exists()).toBe(false);
    expect(s.w.find("dialog").exists()).toBe(true);
  });

  it("拡張が出した面は、ラベルも dialog の aria-label も「拡張『id』の表示」になる（pane のプログラムの表示と読み上げられない）", () => {
    const s = mountSheet(["a"]);
    s.store.upsert({ ...info("a"), source: { type: "extension", id: "hello", scope: "project" } });
    return s.w.vm.$nextTick().then(() => {
      expect(s.w.find("[data-mobile-display-label]").text()).toBe("拡張『hello』の表示（プロジェクト・隔離）· a");
      expect(s.w.find("dialog").attributes("aria-label")).toBe("拡張『hello』の表示（プロジェクト・隔離）");
    });
  });

  it("［閉じる］はシートだけ閉じる（dismiss しない）。［この表示を消す］は dismiss", async () => {
    const s = mountSheet(["a", "b"]);
    await s.w.find("[data-mobile-display-close]").trigger("click");
    expect(s.w.emitted("close")).toHaveLength(1);
    expect(s.controller.dismiss).not.toHaveBeenCalled();
    await s.w.find("[data-mobile-display-dismiss]").trigger("click");
    expect(s.controller.dismiss).toHaveBeenCalledWith({ id: "a" });
  });

  it("複数ならタブで切り替わる", async () => {
    const s = mountSheet(["a", "b"]);
    await s.w.find("[role=tablist]").trigger("keydown", { key: "ArrowRight" });
    expect(s.w.find("[data-mobile-display-label]").text()).toContain("· b");
  });
});
