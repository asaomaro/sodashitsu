import { expect, it } from "vitest";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { paintUsageLine, usageGauge } from "./UsageView.js";
it("colors only the graph and percent green/yellow/red, with muted stale and unknown data", () => {
  const theme = new ThemeColors("dracula"),
    grid = new Grid(80, 8),
    fg = theme.ui("--soda-fg"),
    bg = theme.ground("--soda-bg");
  for (const [row, percent, color] of [
    [0, 20, "--soda-state-done"],
    [1, 75, "--soda-warn-fg"],
    [2, 95, "--soda-state-blocked"],
  ] as const) {
    paintUsageLine(grid, 1, row, "週 " + usageGauge(percent), theme, fg, bg, 60);
    expect(grid.cell(1, row).fg).toBe(fg);
    expect(grid.cell(4, row).fg).toBe(theme.ui(color));
    expect(grid.rowText(row)).toContain(percent.toFixed(1) + "%");
  }
  paintUsageLine(grid, 1, 3, "週 " + usageGauge(95) + "（古い値）", theme, fg, bg, 60);
  expect(grid.cell(4, 3).fg).toBe(theme.ui("--soda-state-idle"));
  paintUsageLine(grid, 1, 4, "週 " + usageGauge(undefined), theme, fg, bg, 60);
  expect(grid.cell(4, 4).fg).toBe(theme.ui("--soda-state-idle"));
  paintUsageLine(grid, 1, 5, "週 " + usageGauge(95), theme, fg, bg, 5);
  expect(grid.cell(6, 5).ch).toBe(" ");
});
