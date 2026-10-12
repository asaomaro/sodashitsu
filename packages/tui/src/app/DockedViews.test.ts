import { expect, it } from "vitest";
import type { TabViewInstance } from "@sodashitsu/protocol";
import { computeLayout } from "../layout/computeLayout.js";
import { dockViewTree, terminalViews } from "./DockedViews.js";
const view = (
  id: string,
  placement: TabViewInstance["placement"],
  target: TabViewInstance["target"] = "tab",
  paneId = "p1",
): TabViewInstance => ({
  id,
  placement,
  target,
  paneId,
  extensionKey: "builtin:workspace",
  viewId: "files",
  display: id,
});
it("left/right and top/bottom reserve terminal space, floats do not; pane target docks beside its own worker", () => {
  const original = {
    type: "split" as const,
    id: "split",
    dir: "right" as const,
    ratio: 0.5,
    a: { type: "pane" as const, paneId: "p1" },
    b: { type: "pane" as const, paneId: "p2" },
  };
  const layout = (views: TabViewInstance[]) =>
    computeLayout({
      cols: 120,
      rows: 35,
      sidebarVisible: false,
      sidebarCols: 24,
      narrowThreshold: 60,
      tab: { layout: dockViewTree(original, views), zoomedPaneId: null },
      focusedPaneId: "p1",
      paneBorders: "always",
    });
  const left = layout([view("left", "left")]),
    right = layout([view("right", "right")]);
  expect(left.panes.find((p) => p.paneId === "view:left")!.frame.x).toBe(left.paneArea.x);
  expect(left.panes.find((p) => p.paneId === "p1")!.frame.x).toBeGreaterThan(left.paneArea.x);
  expect(right.panes.at(-1)!.paneId).toBe("view:right");
  expect(right.panes.at(-1)!.frame.x).toBeGreaterThan(
    right.panes.find((p) => p.paneId === "p2")!.frame.x,
  );
  expect(layout([view("float", "float")])).toEqual(layout([]));
  const pane = layout([view("local", "right", "pane", "p2")]);
  expect(pane.panes[0]!.frame).toEqual(layout([]).panes[0]!.frame);
  const top = layout([view("top", "top")]),
    bottom = layout([view("bottom", "bottom")]);
  expect(top.panes[0]!.paneId).toBe("view:top");
  expect(bottom.panes.at(-1)!.paneId).toBe("view:bottom");
  expect(original.a.paneId).toBe("p1");
});
it("uses native display names, excludes Web-only views and fills an app perspective", () => {
  const tab = {
    id: "t",
    views: [
      view("web", "left"),
      { ...view("native", "right"), extensionKey: "e", terminalDisplay: "native-tui" },
    ],
    perspective: "app",
    displayPaneId: "anchor",
    plugin: { extensionKey: "e", display: "app", terminalDisplay: "app-tui" },
  } as unknown as import("@sodashitsu/protocol").Tab;
  tab.views![0]!.extensionKey = "web";
  const views = terminalViews(tab);
  expect(views.map((v) => v.display)).toEqual(["app-tui", "native-tui"]);
  const tree = dockViewTree({ type: "pane", paneId: "worker" }, views);
  expect(JSON.stringify(tree)).not.toContain("worker");
});
it("keeps empty band and panel content inside one-cell frames", async () => {
  const { DockedViews } = await import("./DockedViews.js"),
    { SessionModel } = await import("../model/SessionModel.js"),
    { UiState } = await import("../model/UiState.js");
  const model = new SessionModel(),
    ui = new UiState(model);
  const dock = new DockedViews(model, ui, {} as never, {} as never, () => {});
  const content = (
    dock as unknown as {
      contentRect(
        r: { x: number; y: number; w: number; h: number },
        v: TabViewInstance,
      ): { x: number; y: number; w: number; h: number };
    }
  ).contentRect.bind(dock);
  for (const placement of ["band-top", "band-bottom", "left"] as const)
    for (const w of [1, 2, 10])
      for (const h of [1, 2]) {
        const r = { x: 5, y: 4, w, h },
          c = content(r, view("v", placement));
        expect(c.x).toBeGreaterThanOrEqual(r.x);
        expect(c.x + c.w).toBeLessThanOrEqual(r.x + r.w);
        expect(c.y).toBeGreaterThanOrEqual(r.y);
        expect(c.y + c.h).toBeLessThanOrEqual(r.y + r.h);
      }
});
