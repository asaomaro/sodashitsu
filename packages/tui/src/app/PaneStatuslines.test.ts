import { expect, it, vi } from "vitest";
import { PaneStatuslines } from "./PaneStatuslines.js";
import { SessionModel } from "../model/SessionModel.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { UiState } from "../model/UiState.js";
import { agent, pane, snapshot } from "../testing/fixtures.js";
import { computeLayout } from "../layout/computeLayout.js";
import type { UsageModel } from "../model/UsageModel.js";
import type { SettingsWriter } from "../settings/SettingsWriter.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { loadStatuslineSettings } from "@sodashitsu/protocol";
function harness(rows = 1) {
  const model = new SessionModel();
  model.applySnapshot(
    snapshot({
      panes: [
        pane("p1", "t1", {
          label: "日本語の制作状況を確認".repeat(20),
          agent: agent({ kind: "codex" }),
        }),
        pane("p2", "t1"),
      ],
    }),
    "client",
  );
  const prefs = new PrefsModel();
  prefs.apply({ statuslineSettings: loadStatuslineSettings({ rows }) }, 1);
  const setShared = vi.fn();
  const controller = new PaneStatuslines(
    model,
    prefs,
    { data: { panes: {}, accounts: [] } } as unknown as UsageModel,
    new UiState(model),
    { setShared } as unknown as SettingsWriter,
    vi.fn(),
  );
  const layout = () =>
    computeLayout({
      cols: 120,
      rows: 30,
      sidebarVisible: false,
      sidebarCols: 20,
      narrowThreshold: 40,
      tab: model.currentTab()!,
      focusedPaneId: "p1",
    });
  const mouse = (action: "down" | "move" | "up" | "wheel", x: number, y: number, button = 0) =>
    controller.handle({
      kind: "mouse",
      action,
      button,
      x,
      y,
      mods: { ctrl: false, alt: false, shift: false, meta: false },
    });
  return { model, prefs, setShared, controller, layout, mouse };
}
it("reserves the requested bottom rows, previews vertical resizing, caps it to content and keeps a terminal row", () => {
  const h = harness(3),
    original = h.layout(),
    before = original.panes[0]!.content.h;
  h.controller.adjust(original);
  let box = original.panes[0]!;
  expect(box.content.h).toBe(before - 3);
  expect(original.panes[1]!.content.h).toBe(before);
  const x = box.content.x + box.content.w - 1,
    y = box.content.y + box.content.h;
  expect(h.mouse("down", x, y)).toBe(true);
  h.mouse("move", x, y - 1000);
  const expanded = h.layout();
  h.controller.adjust(expanded);
  box = expanded.panes[0]!;
  const height = before - box.content.h;
  expect(height).toBeGreaterThan(3);
  expect(height).toBeLessThan(before);
  h.mouse("up", x, y - 1000);
  expect(h.setShared.mock.calls.at(-1)![0].statuslineSettings.rows).toBe(height);
  const nextY = box.content.y + box.content.h;
  h.mouse("down", x, nextY);
  h.mouse("move", x, nextY - 1000);
  h.model.panes.get("p1")!.label = "Short";
  const short = h.layout();
  h.controller.adjust(short);
  expect(short.panes[0]!.content.h).toBe(before - 1);
  h.mouse("up", x, nextY - 1000);
  expect(h.setShared.mock.calls.at(-1)![0].statuslineSettings.rows).toBe(1);
  h.mouse("down", x, short.panes[0]!.content.y + short.panes[0]!.content.h);
  h.mouse("move", x, 1000);
  h.mouse("up", x, 1000);
  expect(h.setShared.mock.calls.at(-1)![0].statuslineSettings.rows).toBe(1);
  h.prefs.apply({ statuslineSettings: loadStatuslineSettings({ enabled: false, rows: 3 }) }, 2);
  const disabled = h.layout();
  h.controller.adjust(disabled);
  expect(disabled.panes[0]!.content.h).toBe(before);
});
it("wraps full-width text without losing glyphs and scrolls rows in both directions", () => {
  const h = harness(2),
    layout = h.layout();
  h.controller.adjust(layout);
  const box = layout.panes[0]!,
    y = box.content.y + box.content.h;
  const screen = () => {
    const grid = new Grid(120, 30);
    h.controller.render(grid, new ThemeColors("dracula"));
    return [grid.rowText(y), grid.rowText(y + 1)].join("\n");
  };
  const initial = screen();
  expect(initial).toContain("日本語");
  expect(initial.split("\n")[1]).toMatch(/[日本語制作状況確認]/);
  h.mouse("wheel", box.content.x + 3, y, 65);
  expect(screen()).not.toBe(initial);
  h.mouse("wheel", box.content.x + 3, y, 64);
  expect(screen()).toBe(initial);
  h.mouse("down", box.content.x + box.content.w - 1, y);
  h.mouse("move", 0, y - 3);
  h.controller.cancel();
  const canceled = h.layout();
  h.controller.adjust(canceled);
  expect(canceled.panes[0]!.content.h).toBe(box.content.h);
});

it("renders mono statusline cells with the theme foreground", () => {
  const h = harness(),
    theme = new ThemeColors("dracula");
  const render = () => {
    const layout = h.layout();
    h.controller.adjust(layout);
    const grid = new Grid(120, 30);
    h.controller.render(grid, theme);
    return { grid, box: layout.panes[0]!.content };
  };
  const colored = render();
  expect(colored.grid.cell(colored.box.x + 2, colored.box.y + colored.box.h).fg).toBe(
    theme.ui("--soda-state-working"),
  );
  h.prefs.apply({ statuslineSettings: loadStatuslineSettings({ colorMode: "mono" }) }, 2);
  const mono = render();
  expect(mono.grid.cell(mono.box.x + 2, mono.box.y + mono.box.h).fg).toBe(theme.ui("--soda-fg"));
});
