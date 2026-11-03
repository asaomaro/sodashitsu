import { expect, it } from "vitest";
import { Grid, Screen } from "./Screen.js";
import { ThemeColors, hexColor } from "./color.js";
import { drawStartup } from "./startup.js";
import { startedApp, testTarget } from "../testing/appHarness.js";
import { OuterTerminal } from "../testing/outerTerminal.js";
import { fakeIo } from "../testing/fakeIo.js";
import { TuiApp } from "../app/TuiApp.js";

it("draws the gold wheel and cyan terminal from the product icon", () => {
  const grid = new Grid(80, 24);
  drawStartup(grid, new ThemeColors("dracula"));
  expect(grid.ch.join("")).toContain("Sodashitsu / 操舵室");
  const prompt = grid.ch.indexOf(">");
  expect(grid.fg[prompt]).toBe(hexColor("#2bd1b8"));
  expect(Array.from(grid.bg)).toContain(hexColor("#c8923a"));
  expect(Array.from(grid.bg)).toContain(hexColor("#1d5d6e"));
  const blocks = grid.ch.filter((_, i) => grid.bg[i] === hexColor("#c8923a"));
  expect(blocks.length).toBeGreaterThan(40);
  expect(blocks.every(ch => ch === " ")).toBe(true);
  for (const mode of ["truecolor", "256"] as const) {
    const ansi = new Screen(mode).frame(grid, null);
    expect(ansi).toContain(">_");
    expect(ansi).toContain("\x1b[");
    if (mode !== "truecolor") expect(ansi).not.toContain("38;2;");
  }
});

it.each([[20, 6], [1, 1], [0, 0]])("fits a small %i by %i terminal", (w, h) => {
  const grid = new Grid(w, h);
  drawStartup(grid, new ThemeColors("dracula"));
  expect(grid.ch).toHaveLength(w * h);
  if (w === 20) expect(grid.rowText(2)).toContain("Sodashitsu >_");
});

it("outputs the startup frame before connecting and removes it once connected", async () => {
  const h = await startedApp();
  const startup = new OuterTerminal(100, 30);
  try {
    // start() writes synchronously, ahead of the asynchronous socket handshake.
    await startup.write(h.io.output());
    expect(startup.text()).toContain("Sodashitsu / 操舵室");
    h.app.renderNow();
    expect(await h.screen()).not.toContain("Sodashitsu / 操舵室");
    h.ws.close();
    h.app.renderNow();
    expect(await h.screen()).not.toContain("Sodashitsu / 操舵室");
  } finally {
    startup.dispose();
    await h.close();
  }
});

it("keeps dialogs visible while the initial connection is pending", async () => {
  class PendingApp extends TuiApp {
    protected override start(): void { this.renderNow(); }
  }
  const io = fakeIo(), app = new PendingApp(testTarget, io), outer = new OuterTerminal(100, 30);
  const running = app.run();
  try {
    app.ui.openDialogWithContext({ kind: "newWorkspace" });
    app.renderNow();
    await outer.write(io.output());
    expect(outer.text()).toContain("workspace");
    expect(outer.text()).toContain("名前");
  } finally {
    app.finish(0);
    await running;
    outer.dispose();
  }
});

it("keeps the wheel round across terminal cell aspect ratios", () => {
  for (const [width, height] of [[11, 24], [10, 20], [8, 24], [20, 20]]) {
    const grid = new Grid(100, 45);
    drawStartup(grid, new ThemeColors("dracula"), height! / width!);
    const colored = Array.from(grid.bg).flatMap((bg, i) => bg === hexColor("#c8923a") ? [[i % grid.w, Math.floor(i / grid.w)]] : []);
    const xs = colored.map(p => p[0]!), ys = colored.map(p => p[1]!);
    const pixelWidth = (Math.max(...xs) - Math.min(...xs) + 1) * width!;
    const pixelHeight = (Math.max(...ys) - Math.min(...ys) + 1) * height!;
    expect(Math.abs(pixelWidth / pixelHeight - 1)).toBeLessThan(0.15);
  }
});
