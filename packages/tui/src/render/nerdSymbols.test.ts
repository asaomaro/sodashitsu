import { expect, it } from "vitest";
import { PaneTerminal } from "../term/PaneTerminal.js";
import { OuterTerminal } from "../testing/outerTerminal.js";
import { ThemeColors } from "./color.js";
import { paintPane } from "./paintPane.js";
import { Grid, Screen } from "./Screen.js";

it("preserves BMP and supplementary Nerd Font icons through parsing, painting and diff output", async () => {
  const pane = new PaneTerminal("icons", 40, 2, 100);
  const outer = new OuterTerminal(40, 2);
  const screen = new Screen("truecolor", false);
  const icons = "\uf07b \ue5ff \uf1d3 \u{f0151} \uf0c7 \ue620";
  try {
    pane.output(new TextEncoder().encode(icons));
    await pane.flush();
    const grid = new Grid(40, 2);
    paintPane(grid, pane, { x: 0, y: 0, w: 40, h: 2 }, new ThemeColors("dracula"));
    await outer.write(screen.frame(grid, null));
    expect(outer.line(0)).toBe(icons);
    pane.output(new TextEncoder().encode("\r\x1b[2K" + icons.split(" ").reverse().join(" ")));
    await pane.flush();
    const updated = new Grid(40, 2);
    paintPane(updated, pane, { x: 0, y: 0, w: 40, h: 2 }, new ThemeColors("dracula"));
    await outer.write(screen.frame(updated, null));
    expect(outer.line(0)).toBe(icons.split(" ").reverse().join(" "));
  } finally {
    pane.dispose();
    outer.dispose();
  }
});
