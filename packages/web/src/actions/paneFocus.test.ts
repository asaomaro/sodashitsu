import { describe, expect, it } from "vitest";
import { focusPaneIfShown } from "./paneFocus.js";

// 20260927-agent-graph の 04（g04 点検）：切り替えの後の pane の焦点。
describe("focusPaneIfShown", () => {
  const make = (panes: Record<string, string>, shown: string | null) => {
    const focused: string[] = [];
    const ports = {
      paneTab: (p: string) => panes[p],
      shownTab: () => shown,
      focus: (p: string) => focused.push(p),
    };
    return { ports, focused };
  };
  it("表示中の tab にある pane だけに焦点を置く", () => {
    const a = make({ p1: "t1" }, "t1");
    expect(focusPaneIfShown(a.ports, "p1")).toBe(true);
    expect(a.focused).toEqual(["p1"]);
  });
  it("閉じた pane・別の tab へ移った pane・表示が無いときは何もしない", () => {
    const b = make({ p1: "t2" }, "t1");
    expect(focusPaneIfShown(b.ports, "p1")).toBe(false);
    expect(focusPaneIfShown(b.ports, "p9")).toBe(false);
    const c = make({ p1: "t1" }, null);
    expect(focusPaneIfShown(c.ports, "p1")).toBe(false);
    expect([...b.focused, ...c.focused]).toEqual([]);
  });
});
