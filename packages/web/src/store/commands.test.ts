import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { CLOSED_POPUPS_MAX, useCommandsStore } from "./commands.js";

describe("store/commands（20260927-custom-command-keys）", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("閉じた控えは最新 32 件だけ残し、取り出すと消える。終了コードなしも区別する", () => {
    const s = useCommandsStore();
    for (let i = 0; i < CLOSED_POPUPS_MAX + 5; i++) s.notePopupClosed(`p${i}`, i);
    expect(s.takeClosed("p4")).toEqual({ closed: false }); // ちょうど境目：古い 5 件が消え、
    expect(s.takeClosed("p5")).toEqual({ closed: true, exitCode: 5 }); // 6 件目からが残る
    expect(s.takeClosed("p0")).toEqual({ closed: false });
    expect(s.takeClosed(`p${CLOSED_POPUPS_MAX + 4}`)).toEqual({
      closed: true,
      exitCode: CLOSED_POPUPS_MAX + 4,
    });
    s.notePopupClosed("px");
    expect(s.takeClosed("px")).toEqual({ closed: true, exitCode: undefined });
  });
});
