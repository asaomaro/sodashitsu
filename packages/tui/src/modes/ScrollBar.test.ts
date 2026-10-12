import { expect, it, vi } from "vitest";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { ScrollBar } from "./ScrollBar.js";
import { HelpDialog } from "./HelpDialog.js";
import { WindowOverlay } from "./WindowOverlay.js";
import { dialogColors } from "./overlay.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { snapshot } from "../testing/fixtures.js";

const theme = new ThemeColors("dracula");
it("draws a thumb, jumps on track click and drags beyond the track to both ends", () => {
  const bar = new ScrollBar(),
    grid = new Grid(20, 15);
  let offset = 0;
  const paint = (total = 100) =>
    bar.render(grid, { x: 2, y: 3, w: 10, h: 10 }, total, offset, dialogColors(theme), (n) => {
      offset = n;
    });
  paint();
  expect(grid.cell(11, 3).ch).toBe("█");
  expect(grid.cell(11, 12).ch).toBe("░");
  bar.handleMouse({ action: "down", button: 0, x: 11, y: 12 });
  expect(offset).toBe(90);
  paint();
  bar.handleMouse({ action: "move", button: 32, x: 40, y: -5 });
  expect(offset).toBe(0);
  paint();
  bar.handleMouse({ action: "up", button: 0, x: -5, y: 40 });
  expect(offset).toBe(90);
  expect(bar.handleMouse({ action: "move", button: 32, x: 0, y: 0 })).toBe(false);
  paint(2);
  expect(bar.handleMouse({ action: "down", button: 0, x: 11, y: 3 })).toBe(false);
});
it("preserves the grabbed position inside a multi-row thumb, clamps after a viewport change and cancels capture", () => {
  const bar = new ScrollBar(),
    grid = new Grid(20, 20),
    set = vi.fn();
  bar.render(grid, { x: 0, y: 1, w: 10, h: 10 }, 20, 0, dialogColors(theme), set);
  bar.handleMouse({ action: "down", button: 0, x: 9, y: 4 });
  bar.handleMouse({ action: "move", button: 32, x: 9, y: 4 });
  expect(set).toHaveBeenLastCalledWith(0);
  bar.handleMouse({ action: "move", button: 32, x: 9, y: 9 });
  expect(set).toHaveBeenLastCalledWith(10);
  bar.cancel();
  expect(bar.handleMouse({ action: "move", button: 32, x: 0, y: 0 })).toBe(false);
  bar.render(grid, { x: 0, y: 1, w: 10, h: 10 }, 20, 99, dialogColors(theme), set);
  expect(grid.cell(9, 10).ch).toBe("█");
});
it("scrolls the visible help window without resizing or closing it, including outside-window release", () => {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const ui = new UiState(model, vi.fn());
  const help = new HelpDialog(ui, () => [
    {
      name: "一覧",
      entries: Array.from({ length: 80 }, (_, n) => ({ keys: String(n), label: `操作${n}` })),
    },
  ]);
  const window = new WindowOverlay(help, { w: 60, h: 20 });
  const paint = () => {
    const grid = new Grid(100, 40);
    window.render({ grid, theme });
    return grid;
  };
  let grid = paint();
  const bar = Array.from({ length: grid.h }, (_, y) => ({
    y,
    x: Array.from({ length: grid.w }, (_, x) => grid.cell(x, y).ch).indexOf("█"),
  })).find((p) => p.x >= 0)!;
  expect(bar).toBeDefined();
  window.handleMouse({ action: "down", button: 0, ...bar });
  window.handleMouse({ action: "move", button: 32, x: 99, y: 39 });
  window.handleMouse({ action: "up", button: 0, x: 99, y: 39 });
  grid = paint();
  expect(Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n")).toContain("操作79");
  expect(grid.cell(78, 28).ch).toBe("┘");
  expect(grid.rowText(11)).toContain("キー一覧");
});
