import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { watchDragInterrupt } from "./dragInterrupt.js";
import { useViewStore } from "./view.js";

describe("watchDragInterrupt", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it("ダイアログが開いたとき・画面が切り替わったときにだけ取り消す。ダイアログが閉じたときは取り消さない", async () => {
    const view = useViewStore();
    const cancel = vi.fn();
    watchDragInterrupt(view, cancel);
    view.openDialogWithContext({ kind: "help" });
    await nextTick();
    expect(cancel).toHaveBeenCalledTimes(1);
    view.closeDialog();
    await nextTick();
    expect(cancel).toHaveBeenCalledTimes(1);
    view.setScreen("graph");
    await nextTick();
    expect(cancel).toHaveBeenCalledTimes(2);
    view.setScreen("base");
    await nextTick();
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it("view が無ければ何もしない", () => {
    expect(() => watchDragInterrupt(null, () => undefined)).not.toThrow();
  });
});
