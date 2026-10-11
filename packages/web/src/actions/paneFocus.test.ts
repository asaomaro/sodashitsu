import { describe, expect, it } from "vitest";
import { focusPaneIfShown, workPaneForDisplay } from "./paneFocus.js";

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

it("maps display anchors to their own live work pane",()=>{
 const worker={id:"w",tabId:"t"},anchor={id:"a",tabId:"t",virtual:true},foreign={id:"f",tabId:"other"};
 const panes=new Map([["w",worker],["a",anchor],["f",foreign]]) as Parameters<typeof workPaneForDisplay>[0];
 const tabs=new Map([["t",{focusedPaneId:"w"}]]) as Parameters<typeof workPaneForDisplay>[1];
 expect(workPaneForDisplay(panes,tabs,"a")).toBe("w");
 expect(workPaneForDisplay(panes,tabs,"w")).toBe("w");
 expect(workPaneForDisplay(panes,tabs,"missing")).toBeNull();
 for(const focusedPaneId of ["a","f","missing"]){expect(workPaneForDisplay(panes,new Map([["t",{focusedPaneId}]]) as Parameters<typeof workPaneForDisplay>[1],"a")).toBeNull();}
});
