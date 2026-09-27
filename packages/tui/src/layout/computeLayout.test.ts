import { describe, expect, it } from "vitest";
import { leaf, split } from "../testing/fixtures.js";
import { computeLayout, splitSize, type LayoutInput } from "./computeLayout.js";

const base: LayoutInput = {
  cols: 100,
  rows: 30,
  sidebarVisible: true,
  sidebarCols: 26,
  narrowThreshold: 64,
  tab: { layout: leaf("p1"), zoomedPaneId: null },
  focusedPaneId: "p1",
};

describe("computeLayout（AC2）", () => {
  it("サイドバー（左・全高）・tab バー（上 1 行）・pane の枠と中身", () => {
    const r = computeLayout(base);
    expect(r.tooSmall).toBe(false);
    expect(r.sidebar).toEqual({ x: 0, y: 0, w: 26, h: 30 });
    expect(r.tabBar).toEqual({ x: 26, y: 0, w: 74, h: 1 });
    expect(r.panes).toEqual([
      {
        paneId: "p1",
        frame: { x: 26, y: 1, w: 74, h: 29 },
        content: { x: 27, y: 2, w: 72, h: 27 },
      },
    ]);
  });

  it("左右の分割は比率で桁を分け、境界を返す", () => {
    const r = computeLayout({
      ...base,
      tab: { layout: split("right", leaf("p1"), leaf("p2"), 0.25, "s9"), zoomedPaneId: null },
    });
    const [a, b] = r.panes;
    expect(a!.frame).toEqual({ x: 26, y: 1, w: 19, h: 29 }); // round(74 * 0.25) = 19
    expect(b!.frame).toEqual({ x: 45, y: 1, w: 55, h: 29 });
    expect(r.dividers).toEqual([
      { splitId: "s9", dir: "right", x: 45, y: 1, len: 29, area: { x: 26, y: 1, w: 74, h: 29 } },
    ]);
  });

  it("上下の分割と入れ子", () => {
    const r = computeLayout({
      ...base,
      tab: {
        layout: split(
          "down",
          leaf("p1"),
          split("right", leaf("p2"), leaf("p3"), 0.5, "s2"),
          0.5,
          "s1",
        ),
        zoomedPaneId: null,
      },
    });
    expect(r.panes.map((p) => [p.paneId, p.frame])).toEqual([
      ["p1", { x: 26, y: 1, w: 74, h: 15 }], // round(29 * 0.5) = 15
      ["p2", { x: 26, y: 16, w: 37, h: 14 }],
      ["p3", { x: 63, y: 16, w: 37, h: 14 }],
    ]);
  });

  it("zoom は焦点の pane だけを全体に", () => {
    const r = computeLayout({
      ...base,
      tab: { layout: split("right", leaf("p1"), leaf("p2")), zoomedPaneId: "p2" },
    });
    expect(r.panes.map((p) => p.paneId)).toEqual(["p2"]);
    expect(r.panes[0]!.frame).toEqual(r.paneArea);
  });

  it("サイドバーを隠すと tab バーと pane が左端から", () => {
    const r = computeLayout({ ...base, sidebarVisible: false });
    expect(r.sidebar).toBeUndefined();
    expect(r.tabBar.x).toBe(0);
    expect(r.panes[0]!.frame.x).toBe(0);
  });

  it("狭い幅（既定 64 未満）はサイドバーを隠し焦点の pane だけ（1 列表示）", () => {
    const r = computeLayout({
      ...base,
      cols: 60,
      tab: { layout: split("right", leaf("p1"), leaf("p2")), zoomedPaneId: null },
      focusedPaneId: "p2",
    });
    expect(r.narrow).toBe(true);
    expect(r.sidebar).toBeUndefined();
    expect(r.panes.map((p) => p.paneId)).toEqual(["p2"]);
  });

  it("狭い幅で焦点の pane がこの tab に無いときは先頭の pane だけ（分割の木ごと並べない。04 ラウンド 2）", () => {
    const tabLayout = split("right", leaf("p1"), leaf("p2"));
    for (const focusedPaneId of [null, "gone"]) {
      const r = computeLayout({
        ...base,
        cols: 60,
        tab: { layout: tabLayout, zoomedPaneId: null },
        focusedPaneId,
      });
      expect(r.panes.map((p) => p.paneId)).toEqual(["p1"]);
      expect(r.dividers).toEqual([]);
    }
  });

  it("狭い幅の navigate モードはサイドバーを pane の上に重ねる（pane の割り付けは同じ）", () => {
    const r = computeLayout({ ...base, cols: 50, navigateOverlay: true });
    expect(r.sidebarOverlay).toBe(true);
    expect(r.sidebar).toEqual({ x: 0, y: 1, w: 26, h: 29 });
    expect(r.panes[0]!.frame).toEqual({ x: 0, y: 1, w: 50, h: 29 });
    expect(computeLayout({ ...base, navigateOverlay: true }).sidebarOverlay).toBeUndefined();
  });

  it("20×5 未満は小さすぎる", () => {
    expect(computeLayout({ ...base, cols: 19 }).tooSmall).toBe(true);
    expect(computeLayout({ ...base, rows: 4 }).tooSmall).toBe(true);
    expect(computeLayout({ ...base, cols: 20, rows: 5 }).tooSmall).toBe(false);
  });

  it("サイドバーの幅は pane の場所を最低 20 桁残す", () => {
    const r = computeLayout({ ...base, cols: 70, sidebarCols: 60 });
    expect(r.sidebar!.w).toBe(50);
  });

  it("比率の分け方は両側に最低 3 を残す", () => {
    expect(splitSize(40, 0.01)).toBe(3);
    expect(splitSize(40, 0.99)).toBe(37);
    expect(splitSize(4, 0.5)).toBe(2);
    expect(splitSize(40, Number.NaN)).toBe(20);
  });
});

describe("computeLayout：サイドバーの最小の場所", () => {
  it("narrowThreshold を小さくしても、pane の場所が MIN_COLS を割るならサイドバーを出さない", () => {
    for (let cols = 20; cols <= 40; cols++) {
      const r = computeLayout({ ...base, cols, narrowThreshold: 0 });
      expect(r.paneArea.w).toBeGreaterThanOrEqual(20);
    }
  });
});
